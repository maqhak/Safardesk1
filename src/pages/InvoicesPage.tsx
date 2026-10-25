import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Printer, Ban, Plus, Search, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { DeleteConfirmModal } from '../components/accounting/DeleteConfirmModal';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { useCompany } from '../contexts/CompanyContext';
import { fetchManualInvoices, voidManualInvoice, deleteManualInvoice } from '../services/invoiceService';
import { ManualInvoiceDoc } from '../types/invoice';
import { InvoicePrintDocument } from '../components/invoice/InvoicePrintDocument';

/**
 * Accounts → Invoices (list). Manual invoices (MINV-…) with view/print/void.
 * Print uses the hidden branded A4 document (same pattern as vouchers).
 */
export const InvoicesPage: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { success, error: showError } = useToast();
  const canCreate = useCan('Accounts', 'create');
  const canDelete = useCan('Accounts', 'delete');
  const { profile: company } = useCompany();

  const [invoices, setInvoices] = useState<ManualInvoiceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<ManualInvoiceDoc | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setInvoices(await fetchManualInvoices());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => invoices.filter((inv) => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!inv.invoiceNo.toLowerCase().includes(q) && !inv.partyName.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [invoices, search, statusFilter]);

  const totals = useMemo(() => ({
    sar: filtered.filter((i) => !i.isVoid).reduce((s, i) => s + (i.totalSAR || 0), 0),
    pkr: filtered.filter((i) => !i.isVoid).reduce((s, i) => s + (i.totalPKR || 0), 0),
    count: filtered.length,
  }), [filtered]);

  const openDetail = (inv: ManualInvoiceDoc) => { setSelected(inv); setDetailOpen(true); };

  const handleDelete = async () => {
    if (!selected || !canDelete || !userProfile) return;
    setDeleting(true);
    try {
      await deleteManualInvoice(userProfile, selected.id);
      setInvoices((list) => list.filter((x) => x.id !== selected.id));
      success(`Invoice ${selected.invoiceNo} deleted permanently.`);
      setDeleteOpen(false);
      setDetailOpen(false);
      setSelected(null);
    } catch (err: any) {
      showError(err?.message || 'Could not delete invoice.');
    } finally {
      setDeleting(false);
    }
  };

  const handleVoid = async () => {
    if (!selected || !canDelete) return;
    const reason = window.prompt('Void reason (required):', 'Entered by mistake');
    if (!reason || !reason.trim()) return;
    setVoiding(true);
    try {
      const updated = await voidManualInvoice(selected, reason.trim(), userProfile?.uid || userProfile?.email || 'unknown');
      setInvoices((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      setSelected(updated);
      success(`Invoice ${updated.invoiceNo} voided — ledger reversed.`);
    } catch (err: any) {
      showError(err?.message || 'Could not void invoice.');
    } finally {
      setVoiding(false);
    }
  };

  const statusBadge = (s: string) => {
    if (s === 'Paid') return <Badge variant="success">Paid</Badge>;
    if (s === 'Void') return <Badge variant="danger">Void</Badge>;
    if (s === 'Partially Paid') return <Badge variant="warning">Partially Paid</Badge>;
    return <Badge variant="warning">Unpaid</Badge>;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        subtitle="Manual invoices (MINV-…) — each invoice posts Dr Party / Cr Income to the ledger"
        actions={canCreate ? <Button variant="primary" size="sm" onClick={() => navigate('/accounts/invoices/new')} rightIcon={<Plus className="w-3.5 h-3.5" />}>New Invoice</Button> : undefined}
      />

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-52">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice no / party…" className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="all">All Statuses</option>
            <option value="Unpaid">Unpaid</option>
            <option value="Partially Paid">Partially Paid</option>
            <option value="Paid">Paid</option>
            <option value="Void">Void</option>
          </select>
          <div className="text-xs text-slate-500 ml-auto">{totals.count} invoice(s) • SAR {totals.sar.toLocaleString()} • PKR {totals.pkr.toLocaleString()}</div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading invoices…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No invoices yet. Click “New Invoice” to add a manual invoice.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wide">
                <th className="text-left p-3 font-bold">Invoice No</th>
                <th className="text-left p-3 font-bold">Date</th>
                <th className="text-left p-3 font-bold">Bill To</th>
                <th className="text-right p-3 font-bold">Total</th>
                <th className="text-left p-3 font-bold">Status</th>
                <th className="text-left p-3 font-bold">Created By</th>
                <th className="text-right p-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.id} className={`border-t border-slate-100 ${inv.isVoid ? 'opacity-60' : ''}`}>
                  <td className="p-3 font-mono font-bold text-[var(--theme-primary)]">{inv.invoiceNo}</td>
                  <td className="p-3">{inv.date}</td>
                  <td className="p-3 font-bold">{inv.partyName}</td>
                  <td className="p-3 text-right font-mono font-bold">{inv.currency} {inv.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="p-3">{statusBadge(inv.status)}</td>
                  <td className="p-3 text-slate-500">{inv.createdByName || '—'}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="outline" size="sm" onClick={() => openDetail(inv)} rightIcon={<Eye className="w-3.5 h-3.5" />}>View</Button>
                      {canCreate && !inv.isVoid && (
                        <Button variant="outline" size="sm" onClick={() => navigate(`/accounts/invoices/edit/${inv.id}`)} rightIcon={<Pencil className="w-3.5 h-3.5" />}>Edit</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Detail modal: preview + print + void */}
      {selected && (
        <Modal
          isOpen={detailOpen}
          onClose={() => setDetailOpen(false)}
          title={`Invoice ${selected.invoiceNo}`}
          subtitle={`${selected.partyName} • ${selected.date}`}
          footer={
            <div className="flex justify-between w-full">
              <div>
                {!selected.isVoid && canDelete && (
                  <Button variant="outline" loading={voiding} onClick={handleVoid} rightIcon={<Ban className="w-3.5 h-3.5" />}>Void Invoice</Button>
                )}
                {canDelete && (
                  <Button variant="danger" onClick={() => setDeleteOpen(true)} rightIcon={<Trash2 className="w-3.5 h-3.5" />}>Delete</Button>
                )}
              </div>
              <div className="flex gap-2">
                {!selected.isVoid && canCreate && (
                  <Button variant="outline" onClick={() => { setDetailOpen(false); navigate(`/accounts/invoices/edit/${selected.id}`); }} rightIcon={<Pencil className="w-3.5 h-3.5" />}>Edit</Button>
                )}
                <Button variant="primary" onClick={() => window.print()} rightIcon={<Printer className="w-3.5 h-3.5" />}>Print Invoice</Button>
                <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
              </div>
            </div>
          }
        >
          {/* Branded A4 print document (print only) */}
          <InvoicePrintDocument invoice={selected} company={company} />
          <div className="space-y-4 py-2 text-xs print:hidden">
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100">
              <div className="text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider py-2 bg-white border-b border-slate-200">A4 Invoice Preview</div>
              <div className="flex justify-center overflow-auto max-h-[560px] p-3">
                <div style={{ zoom: 0.55 }}>
                  <InvoicePrintDocument invoice={selected} company={company} preview />
                </div>
              </div>
            </div>
            <div className="bg-[#0e2c4c] text-white rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-slate-300 uppercase text-[10px]">Total</div>
                <div className="text-2xl font-mono font-bold text-[#c9a227]">{selected.currency} {selected.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-300 uppercase text-[10px]">Status</div>
                <div className="text-xl font-bold">{selected.status}</div>
              </div>
            </div>
            {selected.notes && <p className="text-slate-600"><strong>Notes:</strong> {selected.notes}</p>}
          </div>
        </Modal>
      )}

      {selected && (
        <DeleteConfirmModal
          isOpen={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
          deleting={deleting}
          title={`Delete Invoice ${selected.invoiceNo}?`}
          recordLabel={`${selected.invoiceNo} — ${selected.partyName}`}
        />
      )}
    </div>
  );
};
