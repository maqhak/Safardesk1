import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane, Search, Plus, RotateCcw, Users, CheckCircle2, Clock, XCircle, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { TicketDoc } from '../types/ticket';
import { fetchTickets, getTicketRouteLabel, updateTicket, deleteTicket } from '../services/ticketService';

const fmtPKR = (n: number | undefined | null) =>
  `PKR ${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export const TicketListPage: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const { success, error: showError } = useToast();
  const [tickets, setTickets] = useState<TicketDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selected, setSelected] = useState<TicketDoc | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Edit + Delete are owner/staff only — agents never see the buttons.
  const canEditDelete = role === 'owner' || role === 'staff';
  const canDelete = role === 'owner'; // Delete is Owner-only

  // Edit modal state (prefilled with the record's current values)
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editPNR, setEditPNR] = useState('');
  const [editPassengerName, setEditPassengerName] = useState('');
  const [editTicketNo, setEditTicketNo] = useState('');
  const [editFlightNo, setEditFlightNo] = useState('');
  const [editFlightDate, setEditFlightDate] = useState('');
  const [editDepTime, setEditDepTime] = useState('');
  const [editArrTime, setEditArrTime] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editBuyerName, setEditBuyerName] = useState('');
  const [editCostPKR, setEditCostPKR] = useState('');
  const [editSalePKR, setEditSalePKR] = useState('');
  const [editNote, setEditNote] = useState('');

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setTickets(await fetchTickets());
    } catch (err: any) {
      showError(err?.message || 'Failed to load tickets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEditTicket = (t: TicketDoc) => {
    setEditPNR(t.pnr || '');
    setEditPassengerName(t.passengers?.[0]?.name || '');
    setEditTicketNo(t.passengers?.[0]?.ticketNo || '');
    setEditFlightNo(t.flightNo || '');
    setEditFlightDate(t.flightDate || '');
    setEditDepTime(t.departureTime || '');
    setEditArrTime(t.arrivalTime || '');
    setEditSupplier(t.supplierName || '');
    setEditBuyerName(t.buyerName || '');
    setEditCostPKR(t.purchaseCostPKR != null ? String(t.purchaseCostPKR) : '');
    setEditSalePKR(t.salePricePKR != null ? String(t.salePricePKR) : '');
    setEditNote(t.note || '');
    setSelected(t);
    setDetailOpen(false);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !selected) return;
    if (!editPNR.trim()) { showError('PNR is required.'); return; }
    const cost = parseFloat(editCostPKR);
    const sale = parseFloat(editSalePKR);
    if (isNaN(cost) || isNaN(sale) || cost < 0 || sale < 0) {
      showError('Please enter valid purchase and sale prices.');
      return;
    }
    setEditSaving(true);
    try {
      const pax0 = selected.passengers?.[0] || { name: '', passportNumber: '', ageType: 'Adult', ticketNo: '' };
      const updated = await updateTicket(userProfile, selected.id, {
        pnr: editPNR.trim().toUpperCase(),
        passengers: [{ ...pax0, name: editPassengerName.trim(), ticketNo: editTicketNo.trim() }],
        flightNo: editFlightNo.trim().toUpperCase(),
        flightDate: editFlightDate,
        departureTime: editDepTime,
        arrivalTime: editArrTime,
        supplierName: editSupplier.trim(),
        buyerName: editBuyerName.trim(),
        purchaseCostPKR: Math.round(cost * 100) / 100,
        salePricePKR: Math.round(sale * 100) / 100,
        note: editNote.trim() || undefined,
      });
      setSelected(updated);
      success(`Ticket PNR ${updated.pnr} updated successfully.`);
      setEditModalOpen(false);
      await load();
    } catch (err: any) {
      showError(err?.message || 'Failed to update ticket.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteClick = (t: TicketDoc) => {
    setSelected(t);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userProfile || !selected) return;
    setDeleting(true);
    try {
      await deleteTicket(userProfile, selected.id);
      success(`Ticket PNR ${selected.pnr} deleted successfully.`);
      setDeleteConfirmOpen(false);
      setDetailOpen(false);
      setSelected(null);
      await load();
    } catch (err: any) {
      showError(err?.message || 'Failed to delete ticket.');
    } finally {
      setDeleting(false);
    }
  };

  const stats = useMemo(() => {
    const issued = tickets.filter((t) => t.status === 'Issued').length;
    const booked = tickets.filter((t) => t.status === 'Booked').length;
    const refunded = tickets.filter((t) => t.status === 'Refunded').length;
    const totalSale = tickets.reduce((s, t) => s + (t.salePricePKR ?? 0), 0);
    return { total: tickets.length, issued, booked, refunded, totalSale };
  }, [tickets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'All' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.pnr.toLowerCase().includes(q) ||
        (t.flightNo || '').toLowerCase().includes(q) ||
        getTicketRouteLabel(t).toLowerCase().includes(q) ||
        (t.buyerName || '').toLowerCase().includes(q) ||
        (t.passengers || []).some(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.passportNumber || '').toLowerCase().includes(q) ||
            (p.ticketNo || '').toLowerCase().includes(q)
        )
      );
    });
  }, [tickets, search, statusFilter]);

  const columns: Column<TicketDoc>[] = [
    {
      key: 'pnr',
      header: 'PNR',
      sortable: true,
      render: (row) => <span className="font-mono font-bold text-[var(--theme-primary)]">{row.pnr}</span>,
    },
    {
      key: 'passenger',
      header: 'Passenger',
      render: (row) => (
        <div>
          <span className="font-semibold text-slate-800">{row.passengers?.[0]?.name || row.buyerName || '—'}</span>
          {(row.passengers?.length || 0) > 1 && (
            <span className="text-[11px] text-slate-500 block">+{row.passengers.length - 1} more</span>
          )}
          <span className="text-[11px] text-slate-500 block font-mono">{row.passengers?.[0]?.ticketNo || ''}</span>
        </div>
      ),
    },
    {
      key: 'sector',
      header: 'Route',
      render: (row) => <span className="text-xs font-semibold text-slate-700">{getTicketRouteLabel(row) || '—'}</span>,
    },
    {
      key: 'flight',
      header: 'Flight',
      render: (row) => (
        <div>
          <span className="font-bold text-slate-800">{row.airline?.iataCode || ''} {row.flightNo}</span>
          <span className="text-[11px] text-slate-500 block">{row.airline?.name || ''}</span>
        </div>
      ),
    },
    {
      key: 'flightDate',
      header: 'Date & Time',
      sortable: true,
      render: (row) => (
        <div>
          <span className="text-slate-800">{row.flightDate || '—'}</span>
          <span className="text-[11px] text-slate-500 block">{row.departureTime ? `Dep ${row.departureTime}` : ''}</span>
        </div>
      ),
    },
    {
      key: 'salePricePKR',
      header: 'Sale (PKR)',
      sortable: true,
      render: (row) => <span className="font-mono font-bold text-[var(--theme-primary)]">{fmtPKR(row.salePricePKR ?? row.salePriceSAR)}</span>,
    },
    {
      key: 'margin',
      header: 'Margin (PKR)',
      sortable: true,
      render: (row) => {
        const m = row.salePricePKR != null && row.purchaseCostPKR != null
          ? row.salePricePKR - row.purchaseCostPKR
          : row.marginSAR;
        return <span className="font-mono font-bold text-emerald-600">{fmtPKR(Number(m))}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'Issued' ? 'success' : row.status === 'Booked' ? 'warning' : 'danger'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="outline" size="sm" onClick={() => { setSelected(row); setDetailOpen(true); }}>
            View
          </Button>
          {canEditDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); openEditTicket(row); }}
              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition"
              title="Edit Ticket"
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {canDelete && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteClick(row); }}
                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition"
                title="Delete Ticket"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const statCards = [
    { label: 'Total Tickets', value: String(stats.total), icon: Plane, tone: 'text-[var(--theme-primary)]' },
    { label: 'Issued', value: String(stats.issued), icon: CheckCircle2, tone: 'text-emerald-600' },
    { label: 'Booked', value: String(stats.booked), icon: Clock, tone: 'text-amber-600' },
    { label: 'Refunded', value: String(stats.refunded), icon: XCircle, tone: 'text-red-600' },
    { label: 'Total Sale', value: fmtPKR(stats.totalSale), icon: Users, tone: 'text-[var(--theme-primary)]' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ticket List"
        subtitle="Every booked ticket — live from Firebase. Search by PNR, passenger, passport, flight or route."
        breadcrumbs={[{ label: 'Tickets', href: '/tickets/list' }, { label: 'Ticket List' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/tickets/refund')}>
              <RotateCcw className="w-4 h-4 mr-1" /> New Refund
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/tickets/sale')}>
              <Plus className="w-4 h-4 mr-1" /> New Ticket Sale
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2">
              <s.icon className={`w-4 h-4 ${s.tone}`} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</span>
            </div>
            <div className="text-xl font-bold text-slate-800 mt-1">{s.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PNR, passenger, passport, ticket no, flight, route…"
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-2 bg-white border border-slate-300 rounded text-xs font-semibold"
          >
            <option value="All">All Statuses</option>
            <option value="Issued">Issued</option>
            <option value="Booked">Booked</option>
            <option value="Refunded">Refunded</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          <span className="text-xs text-slate-500 whitespace-nowrap">
            Showing {filtered.length} of {tickets.length} tickets
          </span>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <DataTable
          columns={columns}
          data={filtered}
          emptyTitle={loading ? 'Loading tickets…' : 'No tickets found'}
          emptyDescription={
            loading
              ? 'Fetching booked tickets from Firebase.'
              : 'No booked tickets match your search. Book one from Ticket Sale.'
          }
          onRowClick={(row) => { setSelected(row); setDetailOpen(true); }}
        />
      </Card>

      {selected && (
        <Modal
          isOpen={detailOpen}
          onClose={() => setDetailOpen(false)}
          title={`Ticket — PNR ${selected.pnr}`}
          subtitle={`Status: ${selected.status} • Buyer: ${selected.buyerName || '—'}`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {selected.status !== 'Refunded' && selected.status !== 'Cancelled' && (
                  <Button variant="danger" size="sm" onClick={() => navigate('/tickets/refund')}>
                    <RotateCcw className="w-4 h-4 mr-1" /> Refund Ticket
                  </Button>
                )}
                {canEditDelete && (
                  <Button variant="outline" size="sm" onClick={() => openEditTicket(selected)}>
                    <Pencil className="w-4 h-4 mr-1" /> Edit
                  </Button>
                )}
                {canDelete && (
                  <Button variant="outline" size="sm" onClick={() => handleDeleteClick(selected)}>
                    <Trash2 className="w-4 h-4 mr-1 text-rose-600" /> Delete
                  </Button>
                )}
              </div>
              <Button variant="primary" size="sm" onClick={() => setDetailOpen(false)}>Close</Button>
            </div>
          }
        >
          <div className="space-y-4 py-2 text-xs">
            <div className="bg-[#0e2c4c] text-white rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-slate-300 uppercase text-[10px] tracking-wider">Electronic Ticket</div>
                <div className="text-2xl font-mono font-bold mt-1 text-[#c9a227]">{selected.pnr}</div>
                <div className="text-slate-200 mt-1">{selected.airline?.name} ({selected.airline?.iataCode}) • {selected.flightNo}</div>
              </div>
              <Badge variant={selected.status === 'Issued' ? 'success' : selected.status === 'Booked' ? 'warning' : 'danger'}>
                {selected.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-slate-500">Route</span><div className="font-semibold">{getTicketRouteLabel(selected) || '—'}</div></div>
              <div><span className="text-slate-500">Flight Date</span><div className="font-semibold">{selected.flightDate || '—'}</div></div>
              <div><span className="text-slate-500">Departure / Arrival</span><div className="font-semibold">{selected.departureTime || '—'} / {selected.arrivalTime || '—'}</div></div>
              <div><span className="text-slate-500">Supplier</span><div className="font-semibold">{selected.supplierName || '—'}</div></div>
              <div><span className="text-slate-500">Shirka</span><div className="font-semibold">{selected.shirkaName || '—'}</div></div>
              <div><span className="text-slate-500">Buyer</span><div className="font-semibold">{selected.buyerName || '—'} ({selected.buyerType})</div></div>
            </div>

            <div>
              <h4 className="font-bold text-slate-700 uppercase tracking-wider mb-2">Passengers</h4>
              <table className="w-full border-collapse">
                <thead><tr className="bg-slate-100"><th className="text-left p-2 border">Name</th><th className="text-left p-2 border">Passport</th><th className="text-left p-2 border">Ticket No</th></tr></thead>
                <tbody>
                  {(selected.passengers || []).map((p, i) => (
                    <tr key={i}><td className="p-2 border font-semibold">{p.name}</td><td className="p-2 border font-mono">{p.passportNumber}</td><td className="p-2 border font-mono">{p.ticketNo}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded p-3"><span className="text-slate-500">Purchase</span><div className="font-bold">{fmtPKR(selected.purchaseCostPKR)}</div></div>
              <div className="bg-slate-50 rounded p-3"><span className="text-slate-500">Sale</span><div className="font-bold">{fmtPKR(selected.salePricePKR)}</div></div>
              <div className="bg-emerald-50 rounded p-3"><span className="text-slate-500">Margin</span><div className="font-bold text-emerald-600">{fmtPKR((selected.salePricePKR ?? 0) - (selected.purchaseCostPKR ?? 0))}</div></div>
            </div>

            {selected.status === 'Refunded' && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <span className="font-bold text-red-700">Refund:</span>{' '}
                {selected.refundDate || ''} • {selected.refundStatus || ''} • Penalty {fmtPKR(selected.refundPenaltySAR)} • {selected.refundNote || ''}
              </div>
            )}
            {selected.note && <div><span className="text-slate-500">Note:</span> {selected.note}</div>}
          </div>
        </Modal>
      )}

      {/* Edit Ticket Modal — prefilled with the record's current values */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={selected ? `Edit Ticket — PNR ${selected.pnr}` : 'Edit Ticket'}
        subtitle="Update booking details. Margin is recalculated automatically."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveEdit} loading={editSaving}>Save Changes</Button>
          </div>
        }
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="PNR" value={editPNR} onChange={(e) => setEditPNR(e.target.value.toUpperCase())} required />
            <Input label="Passenger Name" value={editPassengerName} onChange={(e) => setEditPassengerName(e.target.value)} />
            <Input label="Ticket No" value={editTicketNo} onChange={(e) => setEditTicketNo(e.target.value)} />
            <Input label="Flight No" value={editFlightNo} onChange={(e) => setEditFlightNo(e.target.value.toUpperCase())} />
            <Input label="Flight Date" type="date" value={editFlightDate} onChange={(e) => setEditFlightDate(e.target.value)} />
            <Input label="Supplier" value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} />
            <Input label="Departure Time" type="time" value={editDepTime} onChange={(e) => setEditDepTime(e.target.value)} />
            <Input label="Arrival Time" type="time" value={editArrTime} onChange={(e) => setEditArrTime(e.target.value)} />
            <Input label="Buyer Name" value={editBuyerName} onChange={(e) => setEditBuyerName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Purchase Cost (PKR)" type="number" step="0.01" value={editCostPKR} onChange={(e) => setEditCostPKR(e.target.value)} required />
            <Input label="Sale Price (PKR)" type="number" step="0.01" value={editSalePKR} onChange={(e) => setEditSalePKR(e.target.value)} required />
          </div>
          {editCostPKR && editSalePKR && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 flex items-center justify-between">
              <span>Updated Margin:</span>
              <span className="font-mono text-sm">PKR {((parseFloat(editSalePKR) || 0) - (parseFloat(editCostPKR) || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            </div>
          )}
          <Input label="Note" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Optional note" />
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Ticket"
        message={
          <>
            Are you sure you want to delete ticket <strong className="font-mono">{selected?.pnr}</strong>
            {selected?.passengers?.[0]?.name ? ` (${selected.passengers[0].name})` : ''}?
            This will permanently delete this record. This data cannot be recovered.
          </>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
};
