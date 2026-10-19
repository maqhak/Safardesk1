import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { fetchLedgerAccounts } from '../services/accountingService';
import { createManualInvoice, fetchInvoiceIncomeAccounts } from '../services/invoiceService';
import { getCurrentRate, getSellRate } from '../services/exchangeRateService';
import { LedgerAccountDoc } from '../types/accounting';
import { ManualInvoiceLine } from '../types/invoice';

const todayStr = () => new Date().toISOString().split('T')[0];

const uid = () => `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const blankLine = (): ManualInvoiceLine => ({ id: uid(), description: '', qty: 1, rate: 0, amount: 0 });

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]';
const labelCls = 'block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1';

/**
 * Accounts → Invoices → New Invoice.
 * Manual invoice entry: Bill To (any ledger account), line items, discount,
 * currency + rate. Saving posts Dr Party / Cr Income to the ledger.
 */
export const InvoiceCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { success, error: showError } = useToast();
  const canCreate = useCan('Accounts', 'create');

  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [incomeAccounts, setIncomeAccounts] = useState<LedgerAccountDoc[]>([]);

  const [date, setDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState('');
  const [partyId, setPartyId] = useState('');
  const [incomeAccountId, setIncomeAccountId] = useState('');
  const [currency, setCurrency] = useState<'SAR' | 'PKR'>('SAR');
  const [rate, setRate] = useState(() => getSellRate() || 0); // Dual ROE: revenue uses Selling ROE
  const [lines, setLines] = useState<ManualInvoiceLine[]>([blankLine()]);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [accs, inc] = await Promise.all([fetchLedgerAccounts(), fetchInvoiceIncomeAccounts()]);
        setAccounts(accs.filter((a) => a.isActive !== false));
        setIncomeAccounts(inc);
        if (inc.length > 0) setIncomeAccountId(inc[0].id);
      } catch { /* lists stay empty */ }
    })();
  }, []);

  const party = accounts.find((a) => a.id === partyId);
  const incomeAccount = incomeAccounts.find((a) => a.id === incomeAccountId);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (l.amount || 0), 0), [lines]);
  const total = Math.max(0, subtotal - (discount || 0));
  const totalSAR = currency === 'SAR' ? total : (rate > 0 ? total / rate : 0);
  const totalPKR = currency === 'PKR' ? total : total * (rate || 0);

  const updateLine = (id: string, patch: Partial<ManualInvoiceLine>) => {
    setLines((rows) => rows.map((r) => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      next.amount = Math.round((next.qty || 0) * (next.rate || 0) * 100) / 100;
      return next;
    }));
  };

  const handleSave = async () => {
    if (!canCreate) { showError('You do not have permission to create invoices.'); return; }
    if (!party) { showError('Please select Bill To (party).'); return; }
    if (!incomeAccount) { showError('Please select the Income Account.'); return; }
    if (lines.filter((l) => l.description.trim()).length === 0) { showError('Add at least one line item with a description.'); return; }
    if (total <= 0) { showError('Invoice total must be greater than zero.'); return; }
    if (currency === 'SAR' && !(rate > 0)) { showError('Enter a valid SAR → PKR rate.'); return; }
    setSaving(true);
    try {
      const inv = await createManualInvoice({
        date,
        dueDate: dueDate || undefined,
        partyId: party.id,
        partyName: party.title,
        partyType: party.accountType,
        incomeAccountId: incomeAccount.id,
        incomeAccountName: incomeAccount.title,
        currency,
        rate: rate || 0,
        lines: lines.filter((l) => l.description.trim()).map((l) => ({ ...l })),
        subtotal,
        discount: discount || 0,
        total,
        totalSAR: Math.round(totalSAR * 100) / 100,
        totalPKR: Math.round(totalPKR * 100) / 100,
        notes: notes.trim(),
      }, userProfile?.uid || userProfile?.email || 'unknown', userProfile?.displayName || userProfile?.email || '');
      success(`Invoice ${inv.invoiceNo} saved and posted to ledger.`);
      navigate('/accounts/invoices');
    } catch (err: any) {
      showError(err?.message || 'Could not save invoice.');
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => {
    const groups: Record<string, LedgerAccountDoc[]> = {};
    for (const a of accounts) {
      const key = a.accountType || 'other';
      (groups[key] = groups[key] || []).push(a);
    }
    return groups;
  }, [accounts]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="New Invoice"
        subtitle="Manual invoice — Bill To, line items, and ledger posting (Dr Party / Cr Income)"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/accounts/invoices')}>Back to Invoices</Button>
            <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>Save Invoice</Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className={labelCls}>Invoice Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Due Date (optional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as 'SAR' | 'PKR')} className={inputCls}>
              <option value="SAR">SAR</option>
              <option value="PKR">PKR</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Rate (1 SAR = ? PKR)</label>
            <input type="number" min="0" step="0.01" value={rate || ''} onChange={(e) => setRate(parseFloat(e.target.value) || 0)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Bill To (Party — who owes us)</label>
            <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className={inputCls}>
              <option value="">-- Select Party --</option>
              {Object.entries(grouped).map(([type, list]) => (
                <optgroup key={type} label={type.charAt(0).toUpperCase() + type.slice(1)}>
                  {list.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.accountCode})</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Income Account (credit side)</label>
            <select value={incomeAccountId} onChange={(e) => setIncomeAccountId(e.target.value)} className={inputCls}>
              <option value="">-- Select Income Account --</option>
              {incomeAccounts.map((a) => <option key={a.id} value={a.id}>{a.title} ({a.accountCode})</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm">Line Items</h3>
          <Button variant="outline" size="sm" onClick={() => setLines((rows) => [...rows, blankLine()])} rightIcon={<Plus className="w-3.5 h-3.5" />}>Add Line</Button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wide">
              <th className="text-left p-2 font-bold">Description</th>
              <th className="text-right p-2 font-bold w-24">Qty</th>
              <th className="text-right p-2 font-bold w-32">Rate ({currency})</th>
              <th className="text-right p-2 font-bold w-36">Amount ({currency})</th>
              <th className="p-2 w-12" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="p-1.5"><input type="text" value={l.description} onChange={(e) => updateLine(l.id, { description: e.target.value })} placeholder="e.g. Umrah visa service, hotel booking…" className={`${inputCls} !p-1.5`} /></td>
                <td className="p-1.5"><input type="number" min="0" step="0.01" value={l.qty || ''} onChange={(e) => updateLine(l.id, { qty: parseFloat(e.target.value) || 0 })} className={`${inputCls} !p-1.5 text-right`} /></td>
                <td className="p-1.5"><input type="number" min="0" step="0.01" value={l.rate || ''} onChange={(e) => updateLine(l.id, { rate: parseFloat(e.target.value) || 0 })} className={`${inputCls} !p-1.5 text-right`} /></td>
                <td className="p-1.5 text-right font-mono font-bold">{l.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td className="p-1.5 text-center">
                  <button type="button" disabled={lines.length <= 1} onClick={() => setLines((rows) => rows.filter((r) => r.id !== l.id))} className="text-rose-500 hover:text-rose-700 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex flex-col md:flex-row gap-4 mt-4">
          <div className="flex-1">
            <label className={labelCls}>Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any narration to show on the invoice / ledger…" className={inputCls} />
          </div>
          <div className="w-full md:w-72 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono font-bold">{currency} {subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between items-center"><span className="text-slate-500">Discount</span><input type="number" min="0" step="0.01" value={discount || ''} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} className="w-32 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" /></div>
            <div className="flex justify-between border-t border-slate-200 pt-2"><span className="font-bold">Total</span><span className="font-mono font-black text-[var(--theme-primary)]">{currency} {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between text-slate-500"><span>{currency === 'SAR' ? 'PKR Equivalent' : 'SAR Equivalent'}</span><span className="font-mono">{currency === 'SAR' ? `PKR ${totalPKR.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `SAR ${totalSAR.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}</span></div>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/accounts/invoices')}>Cancel</Button>
        <Button variant="primary" loading={saving} onClick={handleSave}>Save Invoice</Button>
      </div>
    </div>
  );
};
