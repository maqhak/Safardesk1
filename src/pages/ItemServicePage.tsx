import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Package, Search } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { useCurrentRate } from '../services/exchangeRateService';
import { LedgerAccountDoc, LedgerEntryDoc } from '../types/accounting';
import {
  fetchLedgerAccounts,
  fetchLedgerEntries,
  postItemServiceEntry,
  voidLedgerEntry,
} from '../services/accountingService';
import { formatMoney } from '../utils/formatters';
const formatSAR = (n: number) => formatMoney(n, 'SAR');

interface ItemServiceRow {
  transNo: string;
  date: string;
  itemName: string;
  description: string;
  supplierName: string | null;
  customerName: string | null;
  buyingSAR: number;
  sellingSAR: number;
  voided: boolean;
}

function stripPrefix(particulars: string): string {
  return particulars.replace(/^(Sale|Purchase):\s*/, '');
}

function splitItemDesc(base: string): { itemName: string; description: string } {
  const idx = base.indexOf(' — ');
  if (idx === -1) return { itemName: base, description: '' };
  return { itemName: base.slice(0, idx), description: base.slice(idx + 3) };
}

export const ItemServicePage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, error: showError } = useToast();
  const isOwner = role === 'owner';
  const isAgent = role === 'agent';
  const canCreate = useCan('Accounts', 'create') || isOwner;
  const masterRate = useCurrentRate('SAR-PKR');

  const [loading, setLoading] = useState<boolean>(true);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [entries, setEntries] = useState<LedgerEntryDoc[]>([]);
  const [search, setSearch] = useState<string>('');

  // Create modal
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [itemDate, setItemDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [itemName, setItemName] = useState<string>('');
  const [itemSupplierId, setItemSupplierId] = useState<string>('');
  const [itemCustomerId, setItemCustomerId] = useState<string>('');
  const [itemBuyingSAR, setItemBuyingSAR] = useState<number>(0);
  const [itemSellingSAR, setItemSellingSAR] = useState<number>(0);
  const [itemRate, setItemRate] = useState<number>(0);
  const [itemDescription, setItemDescription] = useState<string>('');

  useEffect(() => {
    if (itemRate === 0) setItemRate(masterRate);
  }, [masterRate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accList, entList] = await Promise.all([fetchLedgerAccounts(), fetchLedgerEntries()]);
      setAccounts(accList);
      setEntries(entList.filter((e) => e.entryType === 'Item/Service'));
    } catch {
      showError('Failed to load item/service entries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountName = (id: string | null | undefined): string | null => {
    if (!id) return null;
    return accounts.find((a) => a.id === id)?.title || null;
  };

  const rows: ItemServiceRow[] = useMemo(() => {
    const groups = new Map<string, LedgerEntryDoc[]>();
    for (const e of entries) {
      const g = groups.get(e.transNo) || [];
      g.push(e);
      groups.set(e.transNo, g);
    }
    const out: ItemServiceRow[] = [];
    groups.forEach((list, transNo) => {
      const first = list[0];
      const base = stripPrefix(first.particulars || '');
      const { itemName: name, description } = splitItemDesc(base);
      let buyingSAR = 0;
      let sellingSAR = 0;
      let supplierName: string | null = null;
      let customerName: string | null = null;
      for (const e of list) {
        if (e.isVoid) continue;
        const isSale = (e.particulars || '').startsWith('Sale:');
        const isPurchase = (e.particulars || '').startsWith('Purchase:');
        if (isSale && e.creditSAR > 0) sellingSAR += e.creditSAR;
        if (isSale && e.debitSAR > 0) customerName = accountName(e.accountId) || customerName;
        if (isPurchase && e.debitSAR > 0) buyingSAR += e.debitSAR;
        if (isPurchase && e.creditSAR > 0) supplierName = accountName(e.accountId) || supplierName;
      }
      out.push({
        transNo,
        date: first.date,
        itemName: name,
        description,
        supplierName,
        customerName,
        buyingSAR: Math.round(buyingSAR * 100) / 100,
        sellingSAR: Math.round(sellingSAR * 100) / 100,
        voided: list.every((e) => e.isVoid),
      });
    });
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.itemName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.transNo.toLowerCase().includes(q) ||
        (r.supplierName || '').toLowerCase().includes(q) ||
        (r.customerName || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        buying: acc.buying + (r.voided ? 0 : r.buyingSAR),
        selling: acc.selling + (r.voided ? 0 : r.sellingSAR),
      }),
      { buying: 0, selling: 0 }
    );
  }, [filtered]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      showError('Please enter the Item / Service name.');
      return;
    }
    if (!itemSupplierId && !itemCustomerId) {
      showError('Please select a Supplier (party from) or a Customer (party to).');
      return;
    }
    if (itemSupplierId && itemBuyingSAR <= 0) {
      showError('Buying price must be greater than zero when a Supplier is selected.');
      return;
    }
    if (itemCustomerId && itemSellingSAR <= 0) {
      showError('Selling price must be greater than zero when a Customer is selected.');
      return;
    }
    if (itemBuyingSAR <= 0 && itemSellingSAR <= 0) {
      showError('Enter a Buying price or a Selling price.');
      return;
    }

    setSaving(true);
    try {
      const transNo = `ITM-${Date.now().toString().slice(-6)}`;
      await postItemServiceEntry({
        date: itemDate,
        transNo,
        itemName: itemName.trim(),
        description: itemDescription,
        supplierAccountId: itemSupplierId || null,
        customerAccountId: itemCustomerId || null,
        buyingSAR: itemBuyingSAR,
        sellingSAR: itemSellingSAR,
        rate: itemRate || masterRate,
        createdBy: userProfile?.name || 'Operator',
      });
      const margin = Math.round((itemSellingSAR - itemBuyingSAR) * 100) / 100;
      success(`Item/Service entry ${transNo} posted.${margin !== 0 ? ` Margin: SAR ${margin.toLocaleString()}` : ''}`);
      setModalOpen(false);
      setItemName('');
      setItemSupplierId('');
      setItemCustomerId('');
      setItemBuyingSAR(0);
      setItemSellingSAR(0);
      setItemDescription('');
      setItemDate(new Date().toISOString().split('T')[0]);
      await loadData();
    } catch {
      showError('Failed to post item/service entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async (row: ItemServiceRow) => {
    if (!isOwner) {
      showError('Only the Owner can void entries.');
      return;
    }
    const reason = window.prompt(`Void entry ${row.transNo}? Enter reason:`);
    if (!reason) return;
    try {
      const group = entries.filter((e) => e.transNo === row.transNo && !e.isVoid);
      for (const e of group) {
        await voidLedgerEntry(e.id, reason, userProfile?.name || 'Owner');
      }
      success(`Entry ${row.transNo} voided.`);
      await loadData();
    } catch {
      showError('Failed to void entry.');
    }
  };

  const supplierAccounts = accounts.filter((a) => ['vendor', 'hotel', 'agent', 'customer'].includes(a.accountType));
  const customerAccounts = accounts.filter((a) => ['agent', 'customer', 'vendor', 'hotel'].includes(a.accountType));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Item / Service Entries"
        subtitle="Non-visa products & services — bought from a supplier, sold to a customer."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item, party, trans #..."
                className="pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs w-56"
              />
            </div>
            {canCreate && !isAgent && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  setItemRate(masterRate);
                  setModalOpen(true);
                }}
              >
                New Entry
              </Button>
            )}
          </div>
        }
      />

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Buying (SAR)</div>
          <div className="text-xl font-bold font-mono text-amber-700">{formatSAR(totals.buying)}</div>
        </Card>
        <Card padding="sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Selling (SAR)</div>
          <div className="text-xl font-bold font-mono text-emerald-700">{formatSAR(totals.selling)}</div>
        </Card>
        <Card padding="sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Margin (SAR)</div>
          <div className={`text-xl font-bold font-mono ${totals.selling - totals.buying >= 0 ? 'text-[var(--theme-primary)]' : 'text-rose-700'}`}>
            {formatSAR(totals.selling - totals.buying)}
          </div>
        </Card>
      </div>

      {/* Entries table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3 font-bold">Date</th>
                <th className="py-3 px-3 font-bold">Trans #</th>
                <th className="py-3 px-3 font-bold">Item / Service</th>
                <th className="py-3 px-3 font-bold">Supplier (From)</th>
                <th className="py-3 px-3 font-bold">Customer (To)</th>
                <th className="py-3 px-3 font-bold text-right">Buying (SAR)</th>
                <th className="py-3 px-3 font-bold text-right">Selling (SAR)</th>
                <th className="py-3 px-3 font-bold text-right">Margin</th>
                {isOwner && <th className="py-3 px-3 font-bold text-center">Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isOwner ? 9 : 8} className="py-12 text-center text-slate-500">
                    Loading item/service entries...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isOwner ? 9 : 8} className="py-8 text-center text-slate-500">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No item/service entries yet.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => {
                  const margin = Math.round((r.sellingSAR - r.buyingSAR) * 100) / 100;
                  return (
                    <tr
                      key={r.transNo}
                      style={!r.voided && idx % 2 === 1 ? { backgroundColor: 'color-mix(in srgb, var(--theme-primary) 8%, #ffffff)' } : undefined}
                      className={`transition-colors ${r.voided ? 'bg-rose-50/40 text-slate-400 line-through opacity-70' : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">{r.date}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--theme-primary)] whitespace-nowrap">{r.transNo}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{r.itemName}</div>
                        {r.description && <div className="text-[11px] text-slate-500">{r.description}</div>}
                      </td>
                      <td className="py-2.5 px-3">{r.supplierName || <span className="text-slate-400">—</span>}</td>
                      <td className="py-2.5 px-3">{r.customerName || <span className="text-slate-400">—</span>}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{r.buyingSAR > 0 ? formatSAR(r.buyingSAR) : <span className="text-slate-400">—</span>}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{r.sellingSAR > 0 ? formatSAR(r.sellingSAR) : <span className="text-slate-400">—</span>}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-bold ${margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatSAR(margin)}
                      </td>
                      {isOwner && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {!r.voided ? (
                            <button
                              onClick={() => handleVoid(r)}
                              className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                            >
                              Void
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Voided</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Item / Service Entry"
        subtitle="Record a non-visa product or service: bought from a supplier, sold to a customer."
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              Post Entry
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date *</label>
              <input
                type="date"
                value={itemDate}
                onChange={(e) => setItemDate(e.target.value)}
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Item / Service Name *</label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Visa Service, Hotel Room, PIA Ticket"
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="font-bold text-[var(--theme-primary)] text-xs">Parties</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-amber-700 mb-1">
                  Supplier — Party From (jis se li)
                </label>
                <select
                  value={itemSupplierId}
                  onChange={(e) => setItemSupplierId(e.target.value)}
                  className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- No supplier --</option>
                  {supplierAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.accountCode}] {a.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-emerald-700 mb-1">
                  Customer — Party To (jis ko di / charge)
                </label>
                <select
                  value={itemCustomerId}
                  onChange={(e) => setItemCustomerId(e.target.value)}
                  className="w-full p-2 bg-white border border-emerald-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- No customer --</option>
                  {customerAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.accountCode}] {a.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Buying Price (SAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemBuyingSAR || ''}
                onChange={(e) => setItemBuyingSAR(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">Supplier ko dena hai</div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Selling Price (SAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemSellingSAR || ''}
                onChange={(e) => setItemSellingSAR(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-[var(--theme-primary)]"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">Customer se lena hai</div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rate (SAR→PKR)</label>
              <input
                type="number"
                step="0.01"
                value={itemRate || ''}
                onChange={(e) => setItemRate(parseFloat(e.target.value) || masterRate)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">
                Margin: <strong className={itemSellingSAR - itemBuyingSAR >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  SAR {(Math.round((itemSellingSAR - itemBuyingSAR) * 100) / 100).toLocaleString()}
                </strong>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description</label>
            <textarea
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              rows={3}
              placeholder="Manually likhein — kis cheez ki entry hai, koi khaas tafseel..."
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
            Posting: Dr Customer (selling) / Cr Item-Service Income + Dr Item-Service Cost (buying) / Cr Supplier — one trans # for both.
          </div>
        </form>
      </Modal>
    </div>
  );
};
