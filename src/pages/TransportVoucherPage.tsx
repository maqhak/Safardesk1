import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, ArrowRight, Car, Users, CheckSquare } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { InlineLoader } from '../components/ui/BrandedLoader';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { SectorItem, PassengerSnapshot, PACKAGE_INCLUDES_OPTIONS, DEFAULT_PACKAGE_INCLUDES } from '../types/voucher';
import { createVoucher } from '../services/voucherService';
import { fetchVendors } from '../services/masterService';
import { fetchAgents } from '../services/agentService';
import { fetchCustomers } from '../services/customerService';
import { getCurrentRate } from '../services/exchangeRateService';
import { AgentDoc } from '../types/agent';
import { CustomerDoc } from '../types/customer';

const todayStr = () => new Date().toISOString().split('T')[0];
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const SECTOR_TYPES = ['Arrival', 'Departure', 'Makkah to Madina', 'Madina to Makkah'];
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
  const { userProfile } = useAuth();
  const { showSuccess, showError } = useToast();
  const canCreate = useCan('Vouchers', 'create');
  const role = userProfile?.role;
  // Transport charges are Owner/Staff-only (locked rule) — agents cannot create transport vouchers.
  const allowed = canCreate && role !== 'agent';

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    try {
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

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <InlineLoader />
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
        title="New Transport Voucher"
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
              {saving ? 'Saving…' : 'Save Transport Voucher'}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TransportVoucherPage;
