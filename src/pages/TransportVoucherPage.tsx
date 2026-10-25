import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, ArrowRight, Car, Users, CheckSquare } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { InlineLoader } from '../components/ui/BrandedLoader';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { SectorItem, PassengerSnapshot, PACKAGE_INCLUDES_OPTIONS, DEFAULT_PACKAGE_INCLUDES, VoucherDoc, VoucherEditPayload } from '../types/voucher';
import { createVoucher, fetchVoucherById, applyVoucherEditDirect, requestVoucherEdit } from '../services/voucherService';
import { doc, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from '../services/firebase';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';

const VOUCHERS_COLLECTION = 'vouchers';
const VOUCHERS_LOCAL_KEY = 'safardesk_vouchers_directory';

/** Split a saved vehicleNote ("From → To — note") back into its form fields. */
function parseVehicleNote(note: string): { fromText: string; toText: string; vehicleNote: string } {
  if (!note) return { fromText: '', toText: '', vehicleNote: '' };
  const arrow = note.indexOf(' → ');
  if (arrow === -1) return { fromText: '', toText: '', vehicleNote: note };
  const fromText = note.slice(0, arrow);
  const rest = note.slice(arrow + 3);
  const dash = rest.indexOf(' — ');
  if (dash === -1) return { fromText, toText: rest, vehicleNote: '' };
  return { fromText, toText: rest.slice(0, dash), vehicleNote: rest.slice(dash + 3) };
}
import { fetchVendors } from '../services/masterService';
import { fetchAgents } from '../services/agentService';
import { fetchCustomers } from '../services/customerService';
import { getCurrentRate } from '../services/exchangeRateService';
import { AgentDoc } from '../types/agent';
import { CustomerDoc } from '../types/customer';

const todayStr = () => new Date().toISOString().split('T')[0];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const SECTOR_TYPES = ['Arrival', 'Departure', 'Makkah to Madina', 'Madina to Makkah', 'Roundtrip'];
const VEHICLE_TYPES = ['Car', 'Staria', 'Hiace', 'Coaster', 'Bus', 'GMC'];
const AGE_TYPES = ['Adult', 'Child', 'Infant'] as const;

interface ManualPax {
  id: string;
  name: string;
  passportNumber: string;
  ageType: 'Adult' | 'Child' | 'Infant';
}

interface LegRow extends SectorItem {
  id: string;
}

const blankPax = (): ManualPax => ({ id: uid(), name: '', passportNumber: '', ageType: 'Adult' });

const blankLeg = (): LegRow => ({
  id: uid(),
  type: 'Arrival',
  date: todayStr(),
  fromText: '',
  toText: '',
  vehicleType: undefined,
  isSelfGari: false,
  vehicleNote: '',
  transportRateSAR: 0,
});

export const TransportVoucherPage: React.FC = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = !!editId;
  const { userProfile } = useAuth();
  const { showSuccess, showError } = useToast();
  const canCreate = useCan('Vouchers', 'create');
  const role = userProfile?.role;
  // Transport charges are Owner/Staff-only (locked rule) — agents cannot create transport vouchers.
  const allowed = canCreate && role !== 'agent';

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<VoucherDoc | null>(null);
  const [editLoading, setEditLoading] = useState(isEditMode);
  const [editError, setEditError] = useState('');
  const [editReason, setEditReason] = useState('');

  const [vendorsMaster, setVendorsMaster] = useState<any[]>([]);
  const [agentsList, setAgentsList] = useState<AgentDoc[]>([]);
  const [customersList, setCustomersList] = useState<CustomerDoc[]>([]);

  // Step 1: vendor + agent/customer
  const [vendorId, setVendorId] = useState('');
  const [linkType, setLinkType] = useState<'agent' | 'customer'>('agent');
  const [agentId, setAgentId] = useState('');
  const [customerId, setCustomerId] = useState('');

  // Step 2: form
  const [voucherDate, setVoucherDate] = useState(todayStr());
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [paxList, setPaxList] = useState<ManualPax[]>([blankPax()]);
  const [legs, setLegs] = useState<LegRow[]>([blankLeg()]);
  const [packageIncludes, setPackageIncludes] = useState<string[]>([...DEFAULT_PACKAGE_INCLUDES]);

  useEffect(() => {
    (async () => {
      try {
        const [v, a, c] = await Promise.all([
          fetchVendors().catch(() => []),
          fetchAgents().catch(() => []),
          fetchCustomers().catch(() => []),
        ]);
        setVendorsMaster(v || []);
        setAgentsList((a || []).filter((x: any) => x.isActive !== false));
        setCustomersList(c || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Edit mode: prefill the same 2-step page from the saved UV record.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const found = await fetchVoucherById(editId);
        if (cancelled) return;
        if (!found) { setEditError('Voucher not found.'); return; }
        if (found.status === 'Void') { setEditError('Cancelled vouchers cannot be edited.'); return; }
        if (found.voucherKind && found.voucherKind !== 'transport') {
          setEditError('This voucher is not a transport voucher and cannot be edited here.');
          return;
        }
        if (found.linkType !== 'agent' && found.linkType !== 'customer') {
          setEditError('This voucher is not linked to an agent or customer and cannot be edited here.');
          return;
        }
        setEditingVoucher(found as VoucherDoc);
        setVendorId(found.shirkaVendorId || '');
        setLinkType(found.linkType as 'agent' | 'customer');
        setAgentId(found.agentId || '');
        setCustomerId(found.customerId || '');
        setVoucherDate(found.voucherDate || todayStr());
        setReference(found.reference || '');
        setRemarks(found.remarks || '');
        setPaxList((found.passengers || []).length > 0
          ? found.passengers.map((p) => ({ id: uid(), name: p.name || '', passportNumber: p.passportNumber || '', ageType: p.ageType || 'Adult' }))
          : [blankPax()]);
        setLegs((found.sectors || []).length > 0
          ? found.sectors.map((s) => {
              const split = parseVehicleNote(s.vehicleNote || '');
              return {
                id: uid(),
                type: s.type || 'Arrival',
                date: s.date || todayStr(),
                fromText: (s as any).fromText || split.fromText,
                toText: (s as any).toText || split.toText,
                vehicleType: s.vehicleType,
                isSelfGari: !!s.isSelfGari,
                vehicleNote: (s as any).fromText || (s as any).toText ? (s.vehicleNote || '') : split.vehicleNote,
                transportRateSAR: s.transportRateSAR || 0,
              } as unknown as LegRow;
            })
          : [blankLeg()]);
        setPackageIncludes(found.packageIncludes && found.packageIncludes.length > 0 ? [...found.packageIncludes] : [...DEFAULT_PACKAGE_INCLUDES]);
      } catch {
        if (!cancelled) setEditError('Failed to load voucher for editing.');
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [editId]);

  const inputCls = 'w-full p-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-900';
  const labelCls = 'block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1';

  const vendorName = useMemo(
    () => (vendorsMaster.find((v: any) => v.id === vendorId)?.name || ''),
    [vendorsMaster, vendorId]
  );

  const transportSAR = useMemo(
    () => legs.reduce((s, r) => s + (r.isSelfGari ? 0 : r.transportRateSAR || 0), 0),
    [legs]
  );
  const rate = getCurrentRate('SAR-PKR');
  const totalPKR = transportSAR * rate;

  const updateLeg = (id: string, patch: Partial<LegRow>) => {
    setLegs((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const toggleInclude = (item: string) => {
    setPackageIncludes((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  /**
   * Edit save — same update path as the accommodation voucher: approved
   * vouchers use the voucher edit flow (owner direct, staff via approval
   * request) under the same UV number; Draft vouchers are updated in place
   * with number and Draft status preserved.
   */
  const handleSaveEdit = async (
    passengers: PassengerSnapshot[],
    sectors: SectorItem[],
    charges: { description: string; category: 'Transport'; amountSAR: number }[]
  ) => {
    if (!userProfile || !editingVoucher) return;
    // The voucher edit payload carries no customer link, so changing the
    // linked agent/customer on an approved voucher would post to the wrong
    // party — blocked here; Draft vouchers (no postings yet) may change it.
    if (editingVoucher.status !== 'Draft') {
      const linkChanged =
        linkType !== editingVoucher.linkType ||
        (linkType === 'agent' ? agentId : '') !== (editingVoucher.agentId || '') ||
        (linkType === 'customer' ? customerId : '') !== (editingVoucher.customerId || '');
      if (linkChanged) {
        showError('The linked agent/customer cannot be changed on an approved voucher.');
        return;
      }
    }
    const payload: VoucherEditPayload = {
      voucherKind: 'transport',
      visaIds: editingVoucher.visaIds || [],
      agentId: linkType === 'agent' ? agentId : undefined,
      shirkaVendorId: vendorId,
      shirkaName: vendorName,
      reference: reference.trim() || undefined,
      remarks: remarks.trim() || undefined,
      voucherDate: voucherDate || undefined,
      passengers,
      sectors,
      hotelStays: editingVoucher.hotelStays || [],
      charges,
      totals: {
        hotelsSAR: 0,
        transportSAR,
        otherSAR: 0,
        totalSAR: transportSAR,
        totalPKR,
        exchangeRate: rate,
      },
      commission: (editingVoucher as any)?.commission?.enabled
        ? (editingVoucher as any).commission
        : { enabled: false, recipientName: '', contact: '', amountSAR: 0, isPaid: false },
      packageIncludes,
    };
    setSaving(true);
    try {
      if (editingVoucher.status === 'Draft') {
        const updated: VoucherDoc = {
          ...editingVoucher,
          agentId: payload.agentId,
          customerId: linkType === 'customer' ? customerId : undefined,
          shirkaVendorId: payload.shirkaVendorId,
          shirkaName: payload.shirkaName,
          reference: payload.reference,
          remarks: payload.remarks,
          voucherDate: payload.voucherDate,
          passengers: payload.passengers,
          sectors: payload.sectors,
          hotelStays: payload.hotelStays,
          charges: payload.charges,
          totals: { ...payload.totals, exchangeRate: rate },
          commission: payload.commission,
          packageIncludes: payload.packageIncludes,
          updatedAt: new Date().toISOString(),
        };
        if (!isConfigPlaceholder) {
          await setDoc(doc(db, VOUCHERS_COLLECTION, editingVoucher.id), stripUndefinedDeep(updated) as any);
        }
        try {
          const raw = localStorage.getItem(VOUCHERS_LOCAL_KEY);
          if (raw) {
            const list = JSON.parse(raw) as VoucherDoc[];
            localStorage.setItem(VOUCHERS_LOCAL_KEY, JSON.stringify(list.map((x) => (x.id === editingVoucher.id ? updated : x))));
          }
        } catch { /* local mirror best-effort */ }
        showSuccess(`Transport voucher ${editingVoucher.voucherNo} updated.`);
      } else if (role === 'owner') {
        await applyVoucherEditDirect(userProfile, editingVoucher.id, payload);
        showSuccess(`Transport voucher ${editingVoucher.voucherNo} updated — old charges reversed, new charges posted to ledger.`);
      } else {
        if (!editReason.trim()) {
          showError('Please write a reason for this edit request.');
          return;
        }
        await requestVoucherEdit(userProfile, editingVoucher, payload, editReason);
        showSuccess(`Edit request for ${editingVoucher.voucherNo} sent to owner for approval.`);
      }
      navigate('/vouchers');
    } catch (e: any) {
      showError(e?.message || 'Failed to update transport voucher.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!userProfile || !allowed) return;
    const validPax = paxList.filter((p) => p.name.trim());
    if (validPax.length === 0) {
      showError('Please add at least one passenger name.');
      return;
    }
    const validLegs = legs.filter((l) => (l.isSelfGari || (l.transportRateSAR || 0) > 0) && l.type);
    if (validLegs.length === 0) {
      showError('Please add at least one transport leg with a vehicle rate (or Self Gari).');
      return;
    }
    const passengers: PassengerSnapshot[] = validPax.map((p) => ({
      name: p.name.trim(),
      passportNumber: p.passportNumber.trim(),
      ageType: p.ageType,
    }));
    const sectors: SectorItem[] = validLegs.map(({ id, fromText, toText, ...rest }) => ({
      ...rest,
      vehicleNote: [fromText, toText].filter(Boolean).join(' → ') + (rest.vehicleNote ? ` — ${rest.vehicleNote}` : ''),
    }));
    const charges = sectors
      .filter((s) => !s.isSelfGari && (s.transportRateSAR || 0) > 0)
      .map((s) => ({
        description: `Transport: ${s.type} (${s.vehicleType || 'Vehicle'}) @ ${s.transportRateSAR} SAR`,
        category: 'Transport' as const,
        amountSAR: s.transportRateSAR || 0,
      }));
    if (isEditMode) {
      await handleSaveEdit(passengers, sectors, charges);
      return;
    }
    setSaving(true);
    try {
      await createVoucher(userProfile, {
        voucherKind: 'transport',
        linkType,
        visaIds: [],
        customerId: linkType === 'customer' ? customerId : undefined,
        agentId: linkType === 'agent' ? agentId : undefined,
        shirkaVendorId: vendorId,
        shirkaName: vendorName,
        status: 'Draft',
        passengers,
        sectors,
        hotelStays: [],
        charges,
        totals: {
          hotelsSAR: 0,
          transportSAR,
          otherSAR: 0,
          totalSAR: transportSAR,
          totalPKR,
          exchangeRate: rate,
        },
        commission: { enabled: false, recipientName: '', contact: '', amountSAR: 0, isPaid: false },
        packageIncludes,
        reference: reference.trim() || undefined,
        remarks: remarks.trim() || undefined,
        voucherDate: voucherDate || undefined,
      });
      showSuccess(`Transport voucher created for ${validPax.length} passenger(s) — ${transportSAR.toLocaleString()} SAR.`);
      navigate('/vouchers');
    } catch (e: any) {
      showError(e?.message || 'Failed to create transport voucher.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || editLoading) {
    return (
      <div className="p-8 flex justify-center">
        <InlineLoader />
      </div>
    );
  }

  if (isEditMode && editError) {
    return (
      <div className="p-8">
        <PageHeader title="Edit Transport Voucher" subtitle="This voucher cannot be edited here." />
        <Card className="p-6 text-sm text-slate-600">
          {editError}
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/vouchers')}>Back to Vouchers</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-8">
        <PageHeader title="Transport Voucher" subtitle="Transport-only vouchers with manually added passengers." />
        <Card className="p-6 text-sm text-slate-600">
          Only Owner/Staff can create transport vouchers.
        </Card>
      </div>
    );
  }

  const linkedSelected = linkType === 'agent' ? agentId : customerId;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title={isEditMode ? `Edit Transport Voucher ${editingVoucher?.voucherNo || ''}` : 'New Transport Voucher'}
        subtitle={step === 1 ? 'Step 1: choose vendor and agent/customer' : 'Step 2: add passengers and transport legs'}
        actions={
          <Button variant="secondary" size="sm" onClick={() => (step === 2 ? setStep(1) : navigate('/vouchers'))} leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
            {step === 2 ? 'Back' : 'Cancel'}
          </Button>
        }
      />

      {step === 1 && (
        <Card className="p-6 space-y-5 max-w-2xl">
          <div>
            <label className={labelCls}>Vendor *</label>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputCls}>
              <option value="">-- Select Vendor --</option>
              {vendorsMaster.filter((v: any) => v.isActive !== false).map((v: any) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Bill To *</label>
            <div className="flex gap-2 mb-3">
              {(['agent', 'customer'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setLinkType(t)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition ${
                    linkType === t
                      ? 'bg-[#0e2c4c] text-white border-[#0e2c4c]'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  {t === 'agent' ? 'Agent (B2B)' : 'Customer (B2C)'}
                </button>
              ))}
            </div>
            {linkType === 'agent' ? (
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={inputCls}>
                <option value="">-- Select Agent --</option>
                {agentsList.map((a) => (
                  <option key={a.id} value={a.id}>{a.companyName} ({a.agentCode})</option>
                ))}
              </select>
            ) : (
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls}>
                <option value="">-- Select Customer --</option>
                {customersList.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName}{c.passportNumber ? ` — ${c.passportNumber}` : ''}</option>
                ))}
              </select>
            )}
          </div>

          <Button
            variant="primary"
            className="w-full bg-[#0e2c4c] hover:bg-[#1a4473]"
            disabled={!vendorId || !linkedSelected}
            onClick={() => setStep(2)}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Continue — Add Passengers & Transport
          </Button>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-5">
          {/* Summary strip */}
          <Card className="p-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div><span className="text-slate-500 font-semibold">Vendor: </span><span className="font-bold">{vendorName}</span></div>
            <div>
              <span className="text-slate-500 font-semibold">{linkType === 'agent' ? 'Agent: ' : 'Customer: '}</span>
              <span className="font-bold">
                {linkType === 'agent'
                  ? agentsList.find((a) => a.id === agentId)?.companyName
                  : customersList.find((c) => c.id === customerId)?.fullName}
              </span>
            </div>
          </Card>

          {/* Voucher info */}
          <Card className="p-4">
            <h3 className="font-bold text-sm text-slate-800 mb-3">Voucher Info</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Voucher Date</label>
                <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Reference</label>
                <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Remarks</label>
                <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" className={inputCls} />
              </div>
            </div>
          </Card>

          {/* Manual passengers */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4" /> Passengers — Add Manually by Name
              </h3>
              <Button variant="secondary" size="sm" onClick={() => setPaxList((p) => [...p, blankPax()])} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Add Person
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="p-1.5">Name *</th>
                    <th className="p-1.5">Passport (optional)</th>
                    <th className="p-1.5">Age Type</th>
                    <th className="p-1.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {paxList.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="p-1.5">
                        <input
                          type="text" value={p.name}
                          onChange={(e) => setPaxList((prev) => prev.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
                          placeholder="Passenger name" className={`${inputCls} !p-1.5`}
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="text" value={p.passportNumber}
                          onChange={(e) => setPaxList((prev) => prev.map((x) => (x.id === p.id ? { ...x, passportNumber: e.target.value.toUpperCase() } : x)))}
                          placeholder="Passport no." className={`${inputCls} !p-1.5 font-mono uppercase`}
                        />
                      </td>
                      <td className="p-1.5">
                        <select
                          value={p.ageType}
                          onChange={(e) => setPaxList((prev) => prev.map((x) => (x.id === p.id ? { ...x, ageType: e.target.value as ManualPax['ageType'] } : x)))}
                          className={`${inputCls} !p-1.5`}
                        >
                          {AGE_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <button
                          type="button"
                          onClick={() => setPaxList((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== p.id) : prev))}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Transport legs */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Car className="w-4 h-4" /> Transport Legs
              </h3>
              <Button variant="secondary" size="sm" onClick={() => setLegs((p) => [...p, blankLeg()])} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Add Leg
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[950px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="p-1.5">Sector</th>
                    <th className="p-1.5">Date</th>
                    <th className="p-1.5">From</th>
                    <th className="p-1.5">To</th>
                    <th className="p-1.5">Vehicle</th>
                    <th className="p-1.5">Self Gari</th>
                    <th className="p-1.5">Note</th>
                    <th className="p-1.5">Rate (SAR)</th>
                    <th className="p-1.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {legs.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <td className="p-1.5">
                        <select value={l.type} onChange={(e) => updateLeg(l.id, { type: e.target.value })} className={`${inputCls} !p-1.5`}>
                          {SECTOR_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <input type="date" value={l.date} onChange={(e) => updateLeg(l.id, { date: e.target.value })} className={`${inputCls} !p-1.5`} />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="text" value={(l as any).fromText || ''}
                          onChange={(e) => updateLeg(l.id, { fromText: e.target.value } as any)}
                          placeholder="e.g. Jeddah Airport" className={`${inputCls} !p-1.5`}
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="text" value={(l as any).toText || ''}
                          onChange={(e) => updateLeg(l.id, { toText: e.target.value } as any)}
                          placeholder="e.g. Makkah Hotel" className={`${inputCls} !p-1.5`}
                        />
                      </td>
                      <td className="p-1.5">
                        <select
                          value={l.vehicleType || ''}
                          onChange={(e) => updateLeg(l.id, { vehicleType: (e.target.value || undefined) as LegRow['vehicleType'] })}
                          className={`${inputCls} !p-1.5`}
                          disabled={l.isSelfGari}
                        >
                          <option value="">-- Vehicle --</option>
                          {VEHICLE_TYPES.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={!!l.isSelfGari}
                          onChange={(e) => updateLeg(l.id, { isSelfGari: e.target.checked, transportRateSAR: e.target.checked ? 0 : l.transportRateSAR })}
                          className="w-4 h-4 accent-[#0e2c4c]"
                          title="Self Gari — no company charge"
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="text" value={l.vehicleNote || ''}
                          onChange={(e) => updateLeg(l.id, { vehicleNote: e.target.value })}
                          placeholder="Optional note" className={`${inputCls} !p-1.5`}
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="number" min={0} value={l.transportRateSAR || ''}
                          onChange={(e) => updateLeg(l.id, { transportRateSAR: parseFloat(e.target.value) || 0 })}
                          placeholder="0" className={`${inputCls} !p-1.5 w-24`}
                          disabled={l.isSelfGari}
                        />
                      </td>
                      <td className="p-1.5">
                        <button
                          type="button"
                          onClick={() => setLegs((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== l.id) : prev))}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">Self Gari = own vehicle, no company charge for that leg.</p>
          </Card>

          {/* Package includes */}
          <Card className="p-4">
            <h3 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2">
              <CheckSquare className="w-4 h-4" /> Package Includes
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PACKAGE_INCLUDES_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={packageIncludes.includes(opt)}
                    onChange={() => toggleInclude(opt)}
                    className="w-4 h-4 accent-[#0e2c4c]"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </Card>

          {/* Staff edit reason — required for approval requests on approved vouchers */}
          {isEditMode && role !== 'owner' && editingVoucher?.status !== 'Draft' && (
            <Card className="p-4">
              <label className={labelCls}>Edit Reason *</label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Why is this voucher being changed?"
                className={inputCls}
              />
              <p className="text-[11px] text-slate-500 mt-1">Staff edits to an approved voucher go to the owner for approval.</p>
            </Card>
          )}

          {/* Totals + save */}
          <Card className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Transport (SAR)</div>
                <div className="text-lg font-bold font-mono">{transportSAR.toLocaleString()}</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Rate</div>
                <div className="text-lg font-bold font-mono">{rate}</div>
              </div>
              <div className="bg-[#0e2c4c] rounded-lg p-3 text-white">
                <div className="text-[10px] font-bold uppercase opacity-80">Total (PKR)</div>
                <div className="text-lg font-bold font-mono">{Math.round(totalPKR).toLocaleString()}</div>
              </div>
            </div>
            <Button
              variant="primary"
              size="lg"
              className="bg-[#0e2c4c] hover:bg-[#1a4473]"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : isEditMode ? (role === 'owner' || editingVoucher?.status === 'Draft' ? 'Save Changes' : 'Request Edit Approval') : 'Save Transport Voucher'}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TransportVoucherPage;
