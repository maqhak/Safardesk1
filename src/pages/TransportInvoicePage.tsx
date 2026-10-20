import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Printer, Ban, Plus, Search, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { DeleteConfirmModal } from '../components/accounting/DeleteConfirmModal';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import {
  fetchTransportInvoices,
  createTransportInvoice,
  voidTransportInvoice,
  deleteTransportInvoice,
  recordTransportInvoicePayment,
} from '../services/transportInvoiceService';
import { fetchVouchers } from '../services/voucherService';
import type { VoucherDoc } from '../types/voucher';
import { TransportInvoiceDoc, TRANSPORT_SECTORS } from '../types/transportInvoice';
import { fetchLedgerAccounts } from '../services/accountingService';
import { fetchVendors } from '../services/masterService';
import { fetchVehicles } from '../services/masterService';
import { getSellRate } from '../services/exchangeRateService';

/**
 * Accounts → Transport Invoices (TINV-…).
 * Charge a customer for transport: vendor (sourced from), customer (billed to),
 * vehicle, sector, description. Ledger posts Dr Customer / Cr Transport Income
 * (+ Dr Transport Cost / Cr Vendor when a vendor is set).
 */
export const TransportInvoicePage: React.FC = () => {
  const { userProfile } = useAuth();
  const { success, error: showError } = useToast();
  const canCreate = useCan('Accounts', 'create');
  const canDelete = useCan('Accounts', 'delete');

  const [invoices, setInvoices] = useState<TransportInvoiceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TransportInvoiceDoc | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [pDate, setPDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pAmount, setPAmount] = useState<number>(0);
  const [pRate, setPRate] = useState<number>(0);
  const [pAccountId, setPAccountId] = useState('');
  const [pNotes, setPNotes] = useState('');
  const [cashBankAccounts, setCashBankAccounts] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<VoucherDoc[]>([]);
  const [fVoucherId, setFVoucherId] = useState('');

  // New-invoice form
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fDate, setFDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fCustomerId, setFCustomerId] = useState('');
  const [fVendorId, setFVendorId] = useState('');
  const [fVehicleId, setFVehicleId] = useState('');
  const [fSector, setFSector] = useState(TRANSPORT_SECTORS[0]);
  const [fReferenceNo, setFReferenceNo] = useState('');
  const [fDescription, setFDescription] = useState('');
  const [fAmountSAR, setFAmountSAR] = useState<number>(0);
  const [fRate, setFRate] = useState<number>(0);

  const [customerAccounts, setCustomerAccounts] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [invs, accs, vnds, vehs, sellRate] = await Promise.all([
        fetchTransportInvoices(),
        fetchLedgerAccounts().catch(() => []),
        fetchVendors().catch(() => []),
        fetchVehicles().catch(() => []),
        Promise.resolve().then(() => { try { return getSellRate(); } catch { return 76.5; } }),
      ]);
      fetchVouchers().then(setVouchers).catch(() => {});
      setInvoices(invs);
      setCustomerAccounts(
        (accs as any[]).filter((a) => ['customer', 'agent', 'client'].includes(a.accountType) && a.isActive !== false)
      );
      setVendors(vnds);
      setVehicles((vehs as any[]).filter((v) => v.isActive !== false));
      setCashBankAccounts((accs as any[]).filter((a) => ['cash', 'bank'].includes(a.accountType) && a.isActive !== false));
      setFRate((prev) => (prev > 0 ? prev : sellRate));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => invoices.filter((inv) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !inv.invoiceNo.toLowerCase().includes(q) &&
        !(inv.customerName || '').toLowerCase().includes(q) &&
        !(inv.vendorName || '').toLowerCase().includes(q) &&
        !(inv.vehicleType || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }), [invoices, search]);

  const totals = useMemo(() => ({
    sar: filtered.filter((i) => !i.isVoid).reduce((s, i) => s + (i.amountSAR || 0), 0),
    pkr: filtered.filter((i) => !i.isVoid).reduce((s, i) => s + (i.amountPKR || 0), 0),
  }), [filtered]);

  const handleCreate = async () => {
    if (!fCustomerId) { showError('Please select a Customer.'); return; }
    if (!(fAmountSAR > 0)) { showError('Amount must be greater than zero.'); return; }
    if (!(fRate > 0)) { showError('Please enter a valid exchange rate.'); return; }
    const customer = customerAccounts.find((a) => a.id === fCustomerId);
    const vendor = vendors.find((v: any) => v.id === fVendorId);
    const vehicle = vehicles.find((v: any) => v.id === fVehicleId);
    setSaving(true);
    try {
      const inv = await createTransportInvoice(
        {
          date: fDate,
          customerId: fCustomerId,
          customerName: customer?.title || customer?.accountName || fCustomerId,
          vendorId: fVendorId || undefined,
          vendorName: vendor?.name || vendor?.vendorName || undefined,
          vehicleId: fVehicleId || undefined,
          vehicleType: vehicle?.vehicleType || undefined,
          sector: fSector,
          referenceNo: fReferenceNo.trim() || undefined,
          description: fDescription.trim(),
          amountSAR: fAmountSAR,
          rate: fRate,
        },
        userProfile?.uid || userProfile?.email || 'unknown',
        userProfile?.name || 'Operator'
      );
      success(`Transport Invoice ${inv.invoiceNo} created — SAR ${inv.amountSAR.toLocaleString()} / PKR ${inv.amountPKR.toLocaleString()}.`);
      setFormOpen(false);
      setFCustomerId(''); setFVendorId(''); setFVehicleId('');
      setFSector(TRANSPORT_SECTORS[0]); setFReferenceNo(''); setFDescription(''); setFAmountSAR(0);
      await load();
    } catch (err: any) {
      showError(err?.message || 'Could not create transport invoice.');
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async () => {
    if (!selected || !canDelete) return;
    const reason = window.prompt('Void reason (required):', 'Entered by mistake');
    if (!reason || !reason.trim()) return;
    setVoiding(true);
    try {
      const updated = await voidTransportInvoice(selected, reason.trim(), userProfile?.name || 'Owner');
      setInvoices((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      setSelected(updated);
      success(`Transport Invoice ${updated.invoiceNo} voided — ledger reversed.`);
    } catch (err: any) {
      showError(err?.message || 'Could not void invoice.');
    } finally {
      setVoiding(false);
    }
  };

  /** Hotel-checkout link: suggest the sector from a voucher's hotel stays + date. */
  const suggestSectorForVoucher = (v: VoucherDoc, date: string): string => {
    const stays = [...(v.hotelStays || [])].sort((a, b) => (a.checkInDate || '').localeCompare(b.checkInDate || ''));
    if (!stays.length) return '';
    const isCity = (s: any, city: string) => (s.city || '').toLowerCase().startsWith(city);
    for (const s of stays) {
      if (s.checkOutDate === date) {
        const idx = stays.indexOf(s);
        const hasAfter = idx < stays.length - 1;
        if (isCity(s, 'makk') && hasAfter) return 'Makkah to Madina';
        if (isCity(s, 'madi') && hasAfter) return 'Madina to Makkah';
        return 'Departure';
      }
      if (s.checkInDate === date && stays.indexOf(s) === 0) return 'Arrival';
    }
    return '';
  };

  const handleVoucherLink = (voucherId: string) => {
    setFVoucherId(voucherId);
    const v = vouchers.find((x) => x.id === voucherId);
    if (!v) return;
    setFReferenceNo(v.voucherNo);
    const suggested = suggestSectorForVoucher(v, fDate);
    if (suggested) setFSector(suggested);
    if (v.agentName) {
      setFDescription((prev) => prev || `Transport for voucher ${v.voucherNo} (${v.agentName})`);
    }
  };

  const openPayModal = () => {
    if (!selected) return;
    setPDate(new Date().toISOString().slice(0, 10));
    setPAmount(Math.round(((selected.amountSAR || 0) - (selected.paidAmount || 0)) * 100) / 100);
    setPRate(fRate > 0 ? fRate : selected.rate);
    setPAccountId(cashBankAccounts[0]?.id || '');
    setPNotes('');
    setPayOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!selected || !userProfile) return;
    if (!(pAmount > 0)) { showError('Amount must be greater than zero.'); return; }
    if (!pAccountId) { showError('Please select a cash/bank account.'); return; }
    setPaying(true);
    try {
      const updated = await recordTransportInvoicePayment(
        selected.id,
        { date: pDate, amountSAR: pAmount, rate: pRate > 0 ? pRate : selected.rate, cashOrBankAccountId: pAccountId, notes: pNotes.trim() || undefined },
        userProfile.name || 'Operator'
      );
      setInvoices((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      setSelected(updated);
      success(`Payment of SAR ${pAmount.toLocaleString()} recorded against ${updated.invoiceNo}. Status: ${updated.status}.`);
      setPayOpen(false);
    } catch (err: any) {
      showError(err?.message || 'Could not record payment.');
    } finally {
      setPaying(false);
    }
  };

  const handleDelete = async () => {
    if (!selected || !canDelete || !userProfile) return;
    setDeleting(true);
    try {
      await deleteTransportInvoice(userProfile, selected.id);
      setInvoices((list) => list.filter((x) => x.id !== selected.id));
      success(`Transport Invoice ${selected.invoiceNo} deleted permanently.`);
      setDeleteOpen(false);
      setDetailOpen(false);
      setSelected(null);
    } catch (err: any) {
      showError(err?.message || 'Could not delete invoice.');
    } finally {
      setDeleting(false);
    }
  };

  const statusBadge = (s: string) =>
    s === 'Void' ? <Badge variant="danger" size="sm">Void</Badge>
    : s === 'Paid' ? <Badge variant="success" size="sm">Paid</Badge>
    : <Badge variant="warning" size="sm">{s}</Badge>;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transport Invoices"
        subtitle="Charge customers for transport — vendor, vehicle, sector and description post to the ledger."
        actions={canCreate ? (
          <Button size="sm" onClick={() => setFormOpen(true)} rightIcon={<Plus className="w-4 h-4" />}>
            New Transport Invoice
          </Button>
        ) : undefined}
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice no, customer, vendor, vehicle…"
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div className="text-xs text-slate-500 font-semibold">
            {filtered.length} invoice(s) • SAR {totals.sar.toLocaleString()} • PKR {totals.pkr.toLocaleString()}
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
                <th className="p-3">Invoice No</th>
                <th className="p-3">Date</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Vendor</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Sector</th>
                <th className="p-3">Ref No</th>
                <th className="p-3 text-right">SAR</th>
                <th className="p-3 text-right">PKR</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr><td colSpan={11} className="p-8 text-center text-slate-500">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={11} className="p-8 text-center text-slate-500">No transport invoices found.</td></tr>
              ) : filtered.map((inv) => (
                <tr key={inv.id} className={inv.isVoid ? 'opacity-60' : ''}>
                  <td className="p-3 font-mono font-bold text-[var(--theme-primary)]">{inv.invoiceNo}</td>
                  <td className="p-3">{inv.date}</td>
                  <td className="p-3 font-semibold">{inv.customerName}</td>
                  <td className="p-3">{inv.vendorName || '—'}</td>
                  <td className="p-3">{inv.vehicleType || '—'}</td>
                  <td className="p-3">{inv.sector}</td>
                  <td className="p-3 font-mono">{inv.referenceNo || '—'}</td>
                  <td className="p-3 text-right font-mono font-bold">{inv.amountSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="p-3 text-right font-mono">{inv.amountPKR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="p-3">{statusBadge(inv.status)}</td>
                  <td className="p-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => { setSelected(inv); setDetailOpen(true); }} rightIcon={<Eye className="w-3.5 h-3.5" />}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New invoice modal */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title="New Transport Invoice"
        subtitle="Bill a customer for transport. Select the vendor you sourced it from (optional)."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleCreate} loading={saving}>Create Invoice</Button>
          </div>
        }
      >
        <div className="space-y-4 py-2 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Link Voucher (optional — sector auto-suggested from hotel checkout)</label>
            <select value={fVoucherId} onChange={(e) => handleVoucherLink(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
              <option value="">— No voucher link —</option>
              {vouchers.map((v) => (
                <option key={v.id} value={v.id}>{v.voucherNo} — {v.agentName || 'Agent'} ({v.passengers?.length || 0} pax)</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date *</label>
              <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sector *</label>
              <select value={fSector} onChange={(e) => setFSector(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
                {TRANSPORT_SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Voucher No / Manual Number / Tafweej Id</label>
            <input value={fReferenceNo} onChange={(e) => setFReferenceNo(e.target.value)}
              placeholder="e.g. TAF-12345"
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Customer (bill to) *</label>
              <select value={fCustomerId} onChange={(e) => setFCustomerId(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
                <option value="">-- Select Customer --</option>
                {customerAccounts.map((a: any) => (
                  <option key={a.id} value={a.id}>[{(a.accountCode || '').trim()}] {a.title || a.accountName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vendor (sourced from)</label>
              <select value={fVendorId} onChange={(e) => setFVendorId(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
                <option value="">-- No vendor (own vehicle) --</option>
                {vendors.map((v: any) => (
                  <option key={v.id} value={v.id}>{v.name || v.vendorName || v.id}</option>
                ))}
              </select>
              <div className="text-[10px] text-slate-500 mt-0.5">When set, a purchase leg (Dr Transport Cost / Cr Vendor) also posts.</div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vehicle</label>
            <select value={fVehicleId} onChange={(e) => setFVehicleId(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold">
              <option value="">-- Select Vehicle --</option>
              {vehicles.map((v: any) => (
                <option key={v.id} value={v.id}>{v.vehicleType}{v.seatCount ? ` — ${v.seatCount} seats` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description</label>
            <textarea value={fDescription} onChange={(e) => setFDescription(e.target.value)} rows={3}
              placeholder="Trip details — e.g. Jeddah airport to Makkah hotel, 4 passengers, flight SV-102…"
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Amount (SAR) *</label>
              <input type="number" min="0" step="0.01" value={fAmountSAR || ''}
                onChange={(e) => setFAmountSAR(parseFloat(e.target.value) || 0)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rate (1 SAR = ? PKR) *</label>
              <input type="number" min="0" step="0.01" value={fRate || ''}
                onChange={(e) => setFRate(parseFloat(e.target.value) || 0)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono" />
              <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                PKR {(fAmountSAR * (fRate || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Detail modal */}
      {selected && (
        <Modal
          isOpen={detailOpen}
          onClose={() => setDetailOpen(false)}
          title={`Transport Invoice ${selected.invoiceNo}`}
          subtitle={`${selected.customerName} • ${selected.date} • ${selected.sector}`}
          footer={
            <div className="flex justify-between w-full">
              <div className="flex gap-2">
                {!selected.isVoid && canDelete && (
                  <Button variant="outline" loading={voiding} onClick={handleVoid} rightIcon={<Ban className="w-3.5 h-3.5" />}>Void Invoice</Button>
                )}
                {canDelete && (
                  <Button variant="danger" onClick={() => setDeleteOpen(true)} rightIcon={<Trash2 className="w-3.5 h-3.5" />}>Delete</Button>
                )}
                {!selected.isVoid && selected.status !== 'Paid' && canCreate && (
                  <Button variant="primary" onClick={openPayModal}>Record Payment</Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => window.print()} rightIcon={<Printer className="w-3.5 h-3.5" />}>Print</Button>
                <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
              </div>
            </div>
          }
        >
          <div className="space-y-3 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-slate-500 font-semibold">Customer</div><div className="font-bold">{selected.customerName}</div></div>
              <div><div className="text-slate-500 font-semibold">Vendor</div><div className="font-bold">{selected.vendorName || '— (own vehicle)'}</div></div>
              <div><div className="text-slate-500 font-semibold">Vehicle</div><div className="font-bold">{selected.vehicleType || '—'}</div></div>
              <div><div className="text-slate-500 font-semibold">Sector</div><div className="font-bold">{selected.sector}</div></div>
              {selected.referenceNo && <div><div className="text-slate-500 font-semibold">Voucher No / Manual No / Tafweej Id</div><div className="font-bold font-mono">{selected.referenceNo}</div></div>}
            </div>
            {selected.description && (
              <div><div className="text-slate-500 font-semibold">Description</div><div className="bg-slate-50 border border-slate-200 rounded-lg p-2 whitespace-pre-wrap">{selected.description}</div></div>
            )}
            <div className="bg-[#0e2c4c] text-white rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-slate-300 uppercase text-[10px]">Total</div>
                <div className="text-2xl font-mono font-bold text-[#c9a227]">SAR {selected.amountSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-300 uppercase text-[10px]">PKR Equivalent</div>
                <div className="text-xl font-mono font-bold">{selected.amountPKR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                <div className="text-slate-400 text-[10px] font-mono">Rate {selected.rate}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">Status:</span> {statusBadge(selected.status)}
              <span className="text-slate-500">Paid: <strong className="font-mono">SAR {(selected.paidAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
              <span className="text-slate-500">Balance: <strong className="font-mono">SAR {((selected.amountSAR || 0) - (selected.paidAmount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
            </div>
          </div>
        </Modal>
      )}

      {selected && (
        <DeleteConfirmModal
          isOpen={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
          deleting={deleting}
          title={`Delete Transport Invoice ${selected.invoiceNo}?`}
          recordLabel={`${selected.invoiceNo} — ${selected.customerName}`}
        />
      )}
      {payOpen && selected && (
        <Modal
          isOpen={payOpen}
          onClose={() => setPayOpen(false)}
          title={`Record Payment — ${selected.invoiceNo}`}
        >
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Invoice Total</span><span className="font-mono font-bold">SAR {(selected.amountSAR || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Already Paid</span><span className="font-mono">SAR {(selected.paidAmount || 0).toFixed(2)}</span></div>
              <div className="flex justify-between border-t border-slate-200 mt-1 pt-1"><span className="font-semibold">Balance Due</span><span className="font-mono font-bold text-[var(--theme-primary)]">SAR {((selected.amountSAR || 0) - (selected.paidAmount || 0)).toFixed(2)}</span></div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Date *</label>
              <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Amount (SAR) *</label>
              <input type="number" min="0" step="0.01" value={pAmount || ''} onChange={(e) => setPAmount(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Cash / Bank Account *</label>
              <select value={pAccountId} onChange={(e) => setPAccountId(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg text-sm">
                <option value="">— Select account —</option>
                {cashBankAccounts.map((a: any) => (
                  <option key={a.id} value={a.id}>[{a.accountCode}] {a.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Rate (SAR → PKR)</label>
              <input type="number" min="0" step="0.01" value={pRate || ''} onChange={(e) => setPRate(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Notes</label>
              <textarea value={pNotes} onChange={(e) => setPNotes(e.target.value)} rows={2} className="w-full p-2 border border-slate-300 rounded-lg text-sm" placeholder="Optional payment notes…" />
            </div>
            <p className="text-[11px] text-slate-500">Posts to ledger: Dr Cash/Bank, Cr Customer — linked to {selected.invoiceNo}.</p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleRecordPayment} disabled={paying}>{paying ? 'Recording…' : 'Record Payment'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
