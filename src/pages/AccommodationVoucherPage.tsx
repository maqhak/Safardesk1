import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, ArrowRight, BedDouble, Users, CheckSquare } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { InlineLoader } from '../components/ui/BrandedLoader';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { HotelStayItem, PassengerSnapshot, PACKAGE_INCLUDES_OPTIONS, DEFAULT_PACKAGE_INCLUDES, VoucherDoc, VoucherEditPayload } from '../types/voucher';
import { createVoucher, fetchVoucherById, applyVoucherEditDirect, requestVoucherEdit } from '../services/voucherService';
import { doc, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from '../services/firebase';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';

const VOUCHERS_COLLECTION = 'vouchers';
const VOUCHERS_LOCAL_KEY = 'safardesk_vouchers_directory';
import { fetchVendors, fetchHotels } from '../services/masterService';
import { fetchAgents } from '../services/agentService';
import { fetchCustomers } from '../services/customerService';
import { getCurrentRate } from '../services/exchangeRateService';
import { AgentDoc } from '../types/agent';
import { CustomerDoc } from '../types/customer';
import { HotelDoc } from '../types/master';

const todayStr = () => new Date().toISOString().split('T')[0];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

const BED_TYPES = ['Double', 'Triple', 'Sharing', 'Room', 'Quad'];
const CITIES = ['Makkah', 'Madinah', 'Jeddah'];
const AGE_TYPES = ['Adult', 'Child', 'Infant'] as const;

interface ManualPax {
  id: string;
  name: string;
  passportNumber: string;
  ageType: 'Adult' | 'Child' | 'Infant';
}

interface StayRow extends HotelStayItem {
  id: string;
}

const blankPax = (): ManualPax => ({ id: uid(), name: '', passportNumber: '', ageType: 'Adult' });

const blankStay = (): StayRow => {
  const ci = todayStr();
  return {
    id: uid(),
    city: 'Makkah',
    hotelName: '',
    checkInDate: ci,
    checkOutDate: addDays(ci, 3),
    nights: 3,
    bedType: 'Double',
    roomCount: 1,
    ratePerNightSAR: 0,
    totalSAR: 0,
  };
};

export const AccommodationVoucherPage: React.FC = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = !!editId;
  const { userProfile } = useAuth();
  const { showSuccess, showError } = useToast();
  const canCreate = useCan('Vouchers', 'create');
  const role = userProfile?.role;
  // Hotel charges are Owner/Staff-only (locked rule) — agents cannot create accommodation vouchers.
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
  const [hotelsMaster, setHotelsMaster] = useState<HotelDoc[]>([]);

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
  const [stays, setStays] = useState<StayRow[]>([blankStay()]);
  const [packageIncludes, setPackageIncludes] = useState<string[]>([...DEFAULT_PACKAGE_INCLUDES]);

  useEffect(() => {
    (async () => {
      try {
        const [v, a, c, h] = await Promise.all([
          fetchVendors().catch(() => []),
          fetchAgents().catch(() => []),
          fetchCustomers().catch(() => []),
          fetchHotels().catch(() => []),
        ]);
        setVendorsMaster(v || []);
        setAgentsList((a || []).filter((x: any) => x.isActive !== false));
        setCustomersList(c || []);
        setHotelsMaster(h || []);
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
        if (found.voucherKind && found.voucherKind !== 'accommodation') {
          setEditError('This voucher is not an accommodation voucher and cannot be edited here.');
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
        setStays((found.hotelStays || []).length > 0
          ? found.hotelStays.map((s) => {
              const ci = s.checkInDate || todayStr();
              const co = s.checkOutDate || addDays(ci, s.nights || 3);
              const nights = s.nights || nightsBetween(ci, co);
              return {
                id: uid(),
                city: s.city || 'Makkah',
                hotelName: s.hotelName || '',
                checkInDate: ci,
                checkOutDate: co,
                nights,
                bedType: s.bedType || 'Double',
                roomCount: s.roomCount || 1,
                ratePerNightSAR: s.ratePerNightSAR || 0,
                totalSAR: nights * (s.roomCount || 0) * (s.ratePerNightSAR || 0),
              };
            })
          : [blankStay()]);
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

  const hotelsSAR = useMemo(
    () => stays.reduce((s, r) => s + (r.totalSAR || 0), 0),
    [stays]
  );
  const rate = getCurrentRate('SAR-PKR');
  const totalPKR = hotelsSAR * rate;

  const updateStay = (id: string, patch: Partial<StayRow>) => {
    setStays((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const n = { ...r, ...patch };
        if (patch.checkInDate || patch.checkOutDate) {
          n.nights = nightsBetween(n.checkInDate, n.checkOutDate);
        }
        if (patch.nights !== undefined && patch.checkInDate === undefined) {
          n.checkOutDate = addDays(n.checkInDate, n.nights);
        }
        n.totalSAR = (n.nights || 0) * (n.roomCount || 0) * (n.ratePerNightSAR || 0);
        return n;
      })
    );
  };

  const toggleInclude = (item: string) => {
    setPackageIncludes((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  /**
   * Edit save — uses the page's existing update path. Approved vouchers use
   * the voucher edit flow (owner applies directly, staff sends a request for
   * approval, both reversing old charges and reposting under the same UV
   * number). Draft vouchers have no ledger postings yet, so the document is
   * updated in place with its number and Draft status preserved.
   */
  const handleSaveEdit = async (
    passengers: PassengerSnapshot[],
    hotelStays: HotelStayItem[],
    charges: { description: string; category: 'Hotel'; amountSAR: number }[]
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
      voucherKind: 'accommodation',
      visaIds: editingVoucher.visaIds || [],
      agentId: linkType === 'agent' ? agentId : undefined,
      shirkaVendorId: vendorId,
      shirkaName: vendorName,
      reference: reference.trim() || undefined,
      remarks: remarks.trim() || undefined,
      voucherDate: voucherDate || undefined,
      passengers,
      sectors: editingVoucher.sectors || [],
      hotelStays,
      charges,
      totals: {
        hotelsSAR,
        transportSAR: 0,
        otherSAR: 0,
        totalSAR: hotelsSAR,
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
        showSuccess(`Accommodation voucher ${editingVoucher.voucherNo} updated.`);
      } else if (role === 'owner') {
        await applyVoucherEditDirect(userProfile, editingVoucher.id, payload);
        showSuccess(`Accommodation voucher ${editingVoucher.voucherNo} updated — old charges reversed, new charges posted to ledger.`);
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
      showError(e?.message || 'Failed to update accommodation voucher.');
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
    const validStays = stays.filter((s) => s.hotelName.trim() && s.totalSAR > 0);
    if (validStays.length === 0) {
      showError('Please add at least one hotel stay with a hotel name and rate.');
      return;
    }
    const passengers: PassengerSnapshot[] = validPax.map((p) => ({
      name: p.name.trim(),
      passportNumber: p.passportNumber.trim(),
      ageType: p.ageType,
    }));
    const hotelStays: HotelStayItem[] = validStays.map(({ id, ...rest }) => rest);
    const charges = hotelStays.map((h) => ({
      description: `${h.city} - ${h.hotelName} (${h.nights}n ${h.bedType} x${h.roomCount} @ ${h.ratePerNightSAR} SAR)`,
      category: 'Hotel' as const,
      amountSAR: h.totalSAR,
    }));
    if (isEditMode) {
      await handleSaveEdit(passengers, hotelStays, charges);
      return;
    }
    setSaving(true);
    try {
      const linkedId = linkType === 'agent' ? agentId : customerId;
      await createVoucher(userProfile, {
        voucherKind: 'accommodation',
        linkType,
        visaIds: [],
        customerId: linkType === 'customer' ? customerId : undefined,
        agentId: linkType === 'agent' ? agentId : undefined,
        shirkaVendorId: vendorId,
        shirkaName: vendorName,
        status: 'Draft',
        passengers,
        sectors: [],
        hotelStays,
        charges,
        totals: {
          hotelsSAR,
          transportSAR: 0,
          otherSAR: 0,
          totalSAR: hotelsSAR,
          totalPKR,
          exchangeRate: rate,
        },
        commission: { enabled: false, recipientName: '', contact: '', amountSAR: 0, isPaid: false },
        packageIncludes,
        reference: reference.trim() || undefined,
        remarks: remarks.trim() || undefined,
        voucherDate: voucherDate || undefined,
      });
      showSuccess(`Accommodation voucher created for ${validPax.length} passenger(s) — ${hotelsSAR.toLocaleString()} SAR.`);
      navigate('/vouchers');
    } catch (e: any) {
      showError(e?.message || 'Failed to create accommodation voucher.');
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
        <PageHeader title="Edit Accommodation Voucher" subtitle="This voucher cannot be edited here." />
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
        <PageHeader title="Accommodation Voucher" subtitle="Hotel-only vouchers with manually added passengers." />
        <Card className="p-6 text-sm text-slate-600">
          Only Owner/Staff can create accommodation vouchers.
        </Card>
      </div>
    );
  }

  const linkedSelected = linkType === 'agent' ? agentId : customerId;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title={isEditMode ? `Edit Accommodation Voucher ${editingVoucher?.voucherNo || ''}` : 'New Accommodation Voucher'}
        subtitle={step === 1 ? 'Step 1: choose vendor and agent/customer' : 'Step 2: add passengers and hotel stays'}
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
            Continue — Add Passengers & Hotels
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

          {/* Hotel stays */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <BedDouble className="w-4 h-4" /> Hotel Stays
              </h3>
              <Button variant="secondary" size="sm" onClick={() => setStays((p) => [...p, blankStay()])} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                Add Stay
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="p-1.5">City</th>
                    <th className="p-1.5">Hotel *</th>
                    <th className="p-1.5">Check-in</th>
                    <th className="p-1.5">Nights</th>
                    <th className="p-1.5">Check-out</th>
                    <th className="p-1.5">Bed Type</th>
                    <th className="p-1.5">Rooms</th>
                    <th className="p-1.5">Rate/Night (SAR)</th>
                    <th className="p-1.5">Total (SAR)</th>
                    <th className="p-1.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {stays.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="p-1.5">
                        <select value={s.city} onChange={(e) => updateStay(s.id, { city: e.target.value })} className={`${inputCls} !p-1.5`}>
                          {CITIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <input
                          type="text" value={s.hotelName} list="acc-hotel-list"
                          onChange={(e) => updateStay(s.id, { hotelName: e.target.value })}
                          placeholder="Hotel name" className={`${inputCls} !p-1.5`}
                        />
                      </td>
                      <td className="p-1.5">
                        <input type="date" value={s.checkInDate} onChange={(e) => updateStay(s.id, { checkInDate: e.target.value })} className={`${inputCls} !p-1.5`} />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="number" min={1} value={s.nights}
                          onChange={(e) => updateStay(s.id, { nights: Math.max(1, parseInt(e.target.value) || 1) })}
                          className={`${inputCls} !p-1.5 w-16`}
                        />
                      </td>
                      <td className="p-1.5">
                        <input type="date" value={s.checkOutDate} onChange={(e) => updateStay(s.id, { checkOutDate: e.target.value })} className={`${inputCls} !p-1.5`} />
                      </td>
                      <td className="p-1.5">
                        <select value={s.bedType} onChange={(e) => updateStay(s.id, { bedType: e.target.value as StayRow['bedType'] })} className={`${inputCls} !p-1.5`}>
                          {BED_TYPES.map((b) => (
                            <option key={b} value={b}>{b}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <input
                          type="number" min={1} value={s.roomCount}
                          onChange={(e) => updateStay(s.id, { roomCount: Math.max(1, parseInt(e.target.value) || 1) })}
                          className={`${inputCls} !p-1.5 w-16`}
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="number" min={0} value={s.ratePerNightSAR || ''}
                          onChange={(e) => updateStay(s.id, { ratePerNightSAR: parseFloat(e.target.value) || 0 })}
                          placeholder="0" className={`${inputCls} !p-1.5 w-24`}
                        />
                      </td>
                      <td className="p-1.5 font-bold font-mono">{s.totalSAR.toLocaleString()}</td>
                      <td className="p-1.5">
                        <button
                          type="button"
                          onClick={() => setStays((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== s.id) : prev))}
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
              <datalist id="acc-hotel-list">
                {hotelsMaster.map((h: any) => (
                  <option key={h.id} value={h.name}>{h.city ? `${h.name} (${h.city})` : h.name}</option>
                ))}
              </datalist>
            </div>
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
                <div className="text-[10px] font-bold text-slate-500 uppercase">Hotels (SAR)</div>
                <div className="text-lg font-bold font-mono">{hotelsSAR.toLocaleString()}</div>
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
              {saving ? 'Saving…' : isEditMode ? (role === 'owner' || editingVoucher?.status === 'Draft' ? 'Save Changes' : 'Request Edit Approval') : 'Save Accommodation Voucher'}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AccommodationVoucherPage;
