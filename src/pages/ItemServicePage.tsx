import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import {
  fetchLedgerEntries,
  deleteLedgerEntry,
  fetchLedgerAccounts,
  type LedgerEntryDoc,
  type LedgerAccountDoc,
} from '../services/accountingService';
import { db } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { formatMoney } from '../utils/formatters';

// ─── Item/Service — JV-style interface (rewritten 2026-10-23 per owner order) ───
// Professional voucher UI like Journal Voucher: dark header, account lines, exchange rate.
// Payable & Receivable CAN differ (no balancing enforced).

interface LineRow {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
}

interface ItemVoucher {
  transNo: string;
  date: string;
  description: string;
  rate: number;
  // Per-leg stored values. itemCurrency / itemBuyROE / itemSellROE /
  // itemAmount / itemSide are written by handleSave (see below) and are
  // optional so vouchers created before this change still load.
  lines: {
    accountId: string;
    debitSAR: number;
    creditSAR: number;
    debitPKR: number;
    creditPKR: number;
    rate: number;
    itemCurrency?: 'PKR' | 'SAR';
    itemBuyROE?: number;
    itemSellROE?: number;
    itemAmount?: number;
    itemSide?: 'debit' | 'credit';
  }[];
}

const fmtPKR = (n: number) => formatMoney(n, 'PKR');
const uid = () => Math.random().toString(36).slice(2, 10);

export const ItemServicePage: React.FC = () => {
  const { success, error: showError } = useToast();
  const [entries, setEntries] = useState<LedgerEntryDoc[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Voucher form
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTransNo, setEditingTransNo] = useState<string | null>(null);
  const [vDate, setVDate] = useState(new Date().toISOString().split('T')[0]);
  const [vDesc, setVDesc] = useState('');
  const [vBuyROE, setVBuyROE] = useState(75);     // Vendor/Payable side
  const [vSellROE, setVSellROE] = useState(76.5); // Agent/Receivable side
  const [vCurrency, setVCurrency] = useState<'PKR' | 'SAR'>('PKR');
  const [lines, setLines] = useState<LineRow[]>([
    { id: uid(), accountId: '', debit: 0, credit: 0 },
    { id: uid(), accountId: '', debit: 0, credit: 0 },
  ]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [e, a] = await Promise.all([fetchLedgerEntries(), fetchLedgerAccounts()]);
      setEntries(e); setAccounts(a);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadData(); }, []);

  const accountLabel = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.title} [${a.accountCode}]` : id;
  };

  // Group ITM- vouchers
  const vouchers: ItemVoucher[] = useMemo(() => {
    const groups = new Map<string, LedgerEntryDoc[]>();
    for (const e of entries) {
      if (e.isVoid) continue;
      const tn = e.transNo || '';
      if (!tn.startsWith('ITM-')) continue;
      const g = groups.get(tn) || []; g.push(e); groups.set(tn, g);
    }
    const out: ItemVoucher[] = [];
    groups.forEach((legs, transNo) => {
      const first = legs[0];
      // Clean description: remove duplicate ITEM: prefixes
      let desc = first.description || first.particulars || '';
      desc = desc.replace(/^(ITEM:\s*)+/i, ''); // Remove leading ITEM: prefixes
      desc = desc.replace(/\s*—\s*ITEM:\s*/gi, ' — '); // Clean middle duplicates
      out.push({
        transNo, date: first.date,
        description: desc,
        rate: Number(first.rate) || 76.5,
        lines: legs.map((l) => {
          const raw: any = l as any;
          return {
            accountId: l.accountId,
            debitSAR: Number(l.debitSAR) || 0,
            creditSAR: Number(l.creditSAR) || 0,
            debitPKR: Number((l as any).debitPKR) || 0,
            creditPKR: Number((l as any).creditPKR) || 0,
            rate: Number(l.rate) || 76.5,
            // Per-leg rate: each leg's own `rate` is the ROE actually used
            // for that leg (Receivable ROE for debit legs, Payable ROE for
            // credit legs). Kept per leg, not just the first leg's rate.
            itemCurrency: (raw.itemCurrency === 'PKR' || raw.itemCurrency === 'SAR') ? raw.itemCurrency : undefined,
            itemBuyROE: Number(raw.itemBuyROE) > 0 ? Number(raw.itemBuyROE) : undefined,
            itemSellROE: Number(raw.itemSellROE) > 0 ? Number(raw.itemSellROE) : undefined,
            itemAmount: Number(raw.itemAmount) >= 0 ? Number(raw.itemAmount) : undefined,
            itemSide: (raw.itemSide === 'debit' || raw.itemSide === 'credit') ? raw.itemSide : undefined,
          };
        }),
      });
    });
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries]);

  // Sequential numbering: find max ITM number
  const nextTransNo = useMemo(() => {
    let max = 0;
    for (const v of vouchers) {
      const m = v.transNo.match(/ITM-(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `ITM-${String(max + 1).padStart(6, '0')}`;
  }, [vouchers]);

  const filtered = useMemo(() => {
    if (!search.trim()) return vouchers;
    const q = search.toLowerCase();
    return vouchers.filter((v) =>
      v.transNo.toLowerCase().includes(q) || v.description.toLowerCase().includes(q)
    );
  }, [vouchers, search]);

  const openCreate = () => {
    setEditingTransNo(null);
    setVDate(new Date().toISOString().split('T')[0]);
    setVDesc(''); setVBuyROE(75); setVSellROE(76.5); setVCurrency('PKR');
    setLines([
      { id: uid(), accountId: '', debit: 0, credit: 0 },
      { id: uid(), accountId: '', debit: 0, credit: 0 },
    ]);
    setModalOpen(true);
  };

  const openEdit = (v: ItemVoucher) => {
    setEditingTransNo(v.transNo);
    setVDate(v.date); setVDesc(v.description);
    // Exact-restore path (vouchers saved after this change): every leg
    // carries the amount exactly as entered, plus the entry currency and
    // both ROEs. Restoring those values makes edit round-trip exactly —
    // no SAR conversion, so no rounding drift at all.
    const stored = v.lines.filter((l) => l.itemAmount !== undefined && l.itemCurrency);
    const storedCurrency = stored.length > 0 ? stored[0].itemCurrency! : undefined;
    const storedBuy = stored.find((l) => l.itemBuyROE)?.itemBuyROE;
    const storedSell = stored.find((l) => l.itemSellROE)?.itemSellROE;
    if (storedCurrency && stored.length === v.lines.length) {
      setVCurrency(storedCurrency);
      setVBuyROE(storedBuy || 75);
      setVSellROE(storedSell || 76.5);
      setLines(v.lines.map((l) => ({
        id: uid(), accountId: l.accountId,
        debit: l.itemSide === 'debit' ? (l.itemAmount || 0) : 0,
        credit: l.itemSide === 'credit' ? (l.itemAmount || 0) : 0,
      })));
      setModalOpen(true);
      return;
    }
    // Fallback path — old vouchers without stored entry values. They still
    // open and save without corruption, but the round-trip is approximate:
    // the entry currency was never stored, so PKR is assumed (the previous
    // behaviour), and each leg is converted back with ITS OWN rate — debit
    // legs at their Receivable ROE, credit legs at their Payable ROE —
    // instead of one average rate for the whole voucher, which mixed the
    // two ROEs. ROE inputs fall back to the rates actually found on the
    // legs (first debit leg's rate for Receivable, first credit leg's rate
    // for Payable), else the current defaults 75 / 76.5. A partially
    // stored voucher (should not happen — legs are saved together) uses
    // the stored currency/ROEs above for stored legs and this per-leg
    // conversion for the rest.
    const fallbackCurrency: 'PKR' | 'SAR' = storedCurrency || 'PKR';
    setVCurrency(fallbackCurrency);
    setVBuyROE(storedBuy || v.lines.find((l) => l.creditSAR > 0)?.rate || 75);
    setVSellROE(storedSell || v.lines.find((l) => l.debitSAR > 0)?.rate || 76.5);
    setLines(v.lines.map((l) => {
      if (l.itemAmount !== undefined && l.itemCurrency === fallbackCurrency) {
        return {
          id: uid(), accountId: l.accountId,
          debit: l.itemSide === 'debit' ? (l.itemAmount || 0) : 0,
          credit: l.itemSide === 'credit' ? (l.itemAmount || 0) : 0,
        };
      }
      if (fallbackCurrency === 'SAR') {
        // No conversion needed: the stored SAR amounts are the entered ones.
        return { id: uid(), accountId: l.accountId, debit: l.debitSAR, credit: l.creditSAR };
      }
      // Assumed-PKR fallback: per-leg rate, never a voucher average.
      return {
        id: uid(), accountId: l.accountId,
        debit: Math.round(l.debitSAR * (l.rate || 76.5) * 100) / 100,
        credit: Math.round(l.creditSAR * (l.rate || 75) * 100) / 100,
      };
    }));
    setModalOpen(true);
  };

  const addRow = () => setLines([...lines, { id: uid(), accountId: '', debit: 0, credit: 0 }]);
  const removeRow = (id: string) => {
    if (lines.length <= 2) { showError('At least two rows required.'); return; }
    setLines(lines.filter((l) => l.id !== id));
  };
  const updateLine = (id: string, patch: Partial<LineRow>) =>
    setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const difference = totalDebit - totalCredit;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vDesc.trim()) { showError('Enter voucher description.'); return; }
    if (!vBuyROE || vBuyROE <= 0 || !vSellROE || vSellROE <= 0) { showError('Enter valid exchange rates.'); return; }
    const valid = lines.filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
    if (valid.length === 0) { showError('Add at least one account line with amount.'); return; }
    // No balancing enforced — debit & credit can differ (owner order)
    // No auto income/cost — user enters all rows manually (owner order)
    // Dual ROE: Debit (receivable/agent) @ Sell ROE 76.5, Credit (payable/vendor) @ Buy ROE 75

    setSaving(true);
    try {
      const transNo = editingTransNo || nextTransNo;
      const colRef = collection(db, 'ledger_entries');

      // Post each row as a SINGLE leg (exactly what user entered)
      for (const l of valid) {
        let debitSAR = 0, creditSAR = 0, debitPKR = 0, creditPKR = 0;
        let usedRate = vSellROE;
        if (vCurrency === 'PKR') {
          // Debit (agent/receivable) @ Sell ROE, Credit (vendor/payable) @ Buy ROE
          debitPKR = l.debit; creditPKR = l.credit;
          debitSAR = Math.round((l.debit / vSellROE) * 100) / 100;
          creditSAR = Math.round((l.credit / vBuyROE) * 100) / 100;
          usedRate = l.debit > 0 ? vSellROE : vBuyROE;
        } else {
          // Amounts in SAR
          debitSAR = l.debit; creditSAR = l.credit;
          debitPKR = Math.round(l.debit * vSellROE * 100) / 100;
          creditPKR = Math.round(l.credit * vBuyROE * 100) / 100;
          usedRate = l.debit > 0 ? vSellROE : vBuyROE;
        }
        await addDoc(colRef, {
          entryNo: `LE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: vDate,
          accountId: l.accountId,
          entryType: 'Item/Service',
          transNo,
          particulars: vDesc.trim(),
          description: vDesc.trim(),
          rate: usedRate,
          debitSAR, creditSAR, debitPKR, creditPKR,
          // Stored on the voucher document so edit restores the entry
          // exactly (see openEdit). Extra fields only — no shared type
          // or service is changed, and old legs simply lack them.
          // Debit lines convert at the Receivable ROE, credit lines at
          // the Payable ROE, each stored separately below.
          itemCurrency: vCurrency,
          itemBuyROE: vBuyROE,
          itemSellROE: vSellROE,
          itemAmount: l.debit > 0 ? l.debit : l.credit,
          itemSide: l.debit > 0 ? 'debit' : 'credit',
          createdBy: 'Owner',
          createdAt: new Date().toISOString(),
          isVoid: false,
        });
      }
      // Delete old (edit mode) — post-first-then-delete
      if (editingTransNo) {
        const old = entries.filter((x) => x.transNo === editingTransNo && !x.isVoid);
        for (const o of old) await deleteLedgerEntry(o.id);
      }
      success(editingTransNo ? `Voucher ${transNo} updated.` : `Voucher ${transNo} posted.`);
      setModalOpen(false); setEditingTransNo(null);
      await loadData();
    } catch (err: any) {
      showError(`Failed: ${err?.message || err}`);
    } finally { setSaving(false); }
  };

  const handleDelete = async (v: ItemVoucher) => {
    if (!window.confirm(`Delete voucher ${v.transNo} permanently?`)) return;
    try {
      const grp = entries.filter((x) => x.transNo === v.transNo && !x.isVoid);
      for (const g of grp) await deleteLedgerEntry(g.id);
      success(`Voucher ${v.transNo} deleted.`);
      await loadData();
    } catch (err: any) { showError(`Delete failed: ${err?.message || err}`); }
  };

  const voucherNo = editingTransNo || nextTransNo;

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900">Item / Service Vouchers</h2>
          <p className="text-xs text-slate-500">JV-style direct entries — debit & credit can differ.</p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>+ New Voucher</Button>
      </div>

      <div className="mb-3">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search voucher no, description..."
          className="w-full max-w-md p-2 border border-slate-300 rounded-lg text-sm" />
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-slate-400">No vouchers yet.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => {
            // Display in PKR from the stored PKR legs when present;
            // otherwise fall back to each leg's own rate (never a voucher
            // average, which mixes the Payable and Receivable ROEs).
            const td = v.lines.reduce((s, l) => s + (l.debitPKR || Math.round(l.debitSAR * l.rate)), 0);
            const tc = v.lines.reduce((s, l) => s + (l.creditPKR || Math.round(l.creditSAR * l.rate)), 0);
            return (
              <div key={v.transNo} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-mono font-black text-[var(--theme-primary)]">{v.transNo}</span>
                    <span className="text-xs text-slate-500 ml-2">{v.date}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(v)} className="text-blue-600 text-xs hover:underline">Edit</button>
                    <button onClick={() => handleDelete(v)} className="text-red-600 text-xs hover:underline">Delete</button>
                  </div>
                </div>
                <div className="text-sm text-slate-700 mb-2">{v.description}</div>
                <div className="text-xs space-y-1">
                  {v.lines.map((l, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">{accountLabel(l.accountId)}</span>
                      <span className="font-mono">
                        {l.debitSAR > 0 && <span className="text-slate-900">Dr {fmtPKR(l.debitPKR || Math.round(l.debitSAR * l.rate))} </span>}
                        {l.creditSAR > 0 && <span className="text-slate-500">Cr {fmtPKR(l.creditPKR || Math.round(l.creditSAR * l.rate))}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-xs font-bold">
                  <span className="text-slate-500">Total Dr: {fmtPKR(td)}</span>
                  <span className="text-slate-500">Total Cr: {fmtPKR(tc)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Voucher Modal — JV-style */}
      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingTransNo(null); }}
        title="" size="xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setModalOpen(false); setEditingTransNo(null); }}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              {editingTransNo ? 'Save Changes' : 'Post Voucher'}
            </Button>
          </>
        }>
        <form onSubmit={handleSave}>
          {/* Dark header */}
          <div className="bg-slate-800 text-white rounded-t-xl -m-6 mb-4 p-4">
            <div className="text-center text-[10px] uppercase tracking-widest text-slate-400">Voucher No.</div>
            <div className="text-center text-xl font-black text-amber-400 font-mono">{voucherNo}</div>
            <div className="grid grid-cols-5 gap-2 mt-3 text-[11px]">
              <div>
                <div className="uppercase text-slate-400 text-[9px]">Voucher Type</div>
                <div className="bg-slate-700 rounded px-2 py-1.5 font-semibold">Item/Service</div>
              </div>
              <div>
                <div className="uppercase text-slate-400 text-[9px]">Voucher Date</div>
                <input type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} required
                  className="w-full bg-slate-700 rounded px-2 py-1.5 text-white" />
              </div>
              <div>
                <div className="uppercase text-slate-400 text-[9px]">Department</div>
                <div className="bg-slate-700 rounded px-2 py-1.5">Accounts</div>
              </div>
              <div>
                <div className="uppercase text-slate-400 text-[9px]">Currency</div>
                <select value={vCurrency} onChange={(e) => setVCurrency(e.target.value as 'PKR' | 'SAR')}
                  className="w-full bg-slate-700 rounded px-2 py-1.5 text-white">
                  <option value="PKR">Pakistani Rupee</option>
                  <option value="SAR">Saudi Riyal</option>
                </select>
              </div>
              <div>
                <div className="uppercase text-slate-400 text-[9px]">Voucher Status</div>
                <div className="bg-emerald-600 rounded px-2 py-1.5 text-center font-bold">Final</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="uppercase text-slate-400 text-[9px] mb-1">Voucher Description *</div>
              <textarea value={vDesc} onChange={(e) => setVDesc(e.target.value)} rows={2} required
                placeholder="Write the description — the same line appears in the ledger (Particulars)..."
                className="w-full bg-white text-slate-900 rounded-lg p-2.5 text-sm" />
            </div>
          </div>

          {/* Exchange rates — dual ROE */}
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-700 mb-1">
                Agent ROE (Receivable) *
              </label>
              <input type="number" value={vSellROE} onChange={(e) => setVSellROE(parseFloat(e.target.value) || 0)}
                step="0.1" min="0" required
                className="w-full p-2 border border-slate-300 rounded-lg font-mono" />
              <p className="text-[10px] text-slate-500 mt-1">Debit lines (receivable from agent)</p>
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase text-slate-700 mb-1">
                Vendor ROE (Payable) *
              </label>
              <input type="number" value={vBuyROE} onChange={(e) => setVBuyROE(parseFloat(e.target.value) || 0)}
                step="0.1" min="0" required
                className="w-full p-2 border border-slate-300 rounded-lg font-mono" />
              <p className="text-[10px] text-slate-500 mt-1">Credit lines (payable to vendor)</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mb-3">
            {vCurrency === 'PKR'
              ? `Amounts in PKR → SAR at above rates.`
              : `Amounts in SAR → PKR at above rates.`}
          </p>

          {/* Account lines */}
          <div className="flex items-center justify-between mb-2">
            <div className="font-black text-xs uppercase tracking-wide">Account Lines (Debits & Credits)</div>
            <Button variant="outline" size="sm" onClick={addRow}>+ Add Account Row</Button>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_140px_140px_40px] bg-slate-100 text-[10px] font-black uppercase text-slate-500">
              <div className="p-2.5">Ledger Account</div>
              <div className="p-2.5 text-right">Debit ({vCurrency})</div>
              <div className="p-2.5 text-right">Credit ({vCurrency})</div>
              <div className="p-2.5"></div>
            </div>
            {lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_140px_140px_40px] border-t border-slate-100 items-center">
                <div className="p-2">
                  <select value={l.accountId} onChange={(e) => updateLine(l.id, { accountId: e.target.value })}
                    className="w-full p-1.5 border border-slate-300 rounded text-xs bg-white">
                    <option value="">— Select Account —</option>
                    {accounts.filter((a) => !a.isSystem).map((a) => (
                      <option key={a.id} value={a.id}>{a.title} [{a.accountCode}]</option>
                    ))}
                  </select>
                </div>
                <div className="p-2">
                  <input type="number" value={l.debit || ''} min="0"
                    onChange={(e) => updateLine(l.id, { debit: parseFloat(e.target.value) || 0, credit: 0 })}
                    placeholder="0.00"
                    className="w-full p-1.5 border border-slate-300 rounded text-xs font-mono text-right" />
                </div>
                <div className="p-2">
                  <input type="number" value={l.credit || ''} min="0"
                    onChange={(e) => updateLine(l.id, { credit: parseFloat(e.target.value) || 0, debit: 0 })}
                    placeholder="0.00"
                    className="w-full p-1.5 border border-slate-300 rounded text-xs font-mono text-right" />
                </div>
                <div className="p-2 text-center">
                  <button type="button" onClick={() => removeRow(l.id)}
                    className="text-red-500 hover:text-red-700 text-lg leading-none">×</button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="flex justify-between mt-3 text-xs font-mono bg-slate-50 rounded-lg p-2.5">
            <span>Total Debit: <strong>{vCurrency} {totalDebit.toLocaleString()}</strong></span>
            <span>Total Credit: <strong>{vCurrency} {totalCredit.toLocaleString()}</strong></span>
            <span>Difference: <strong className={difference === 0 ? 'text-emerald-600' : 'text-orange-600'}>
              {vCurrency} {difference.toLocaleString()}
            </strong></span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Note: Enter all rows manually — no automatic Income/Cost. Debit & credit can differ.
          </p>
        </form>
      </Modal>
    </div>
  );
};
