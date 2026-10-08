import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plane,
  Bed,
  Users,
  FileText,
  Check,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AirportSelect, AirlineSelect } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { SectorItem, HotelStayItem, VoucherEditPayload } from '../types/voucher';
import { createVoucher, fetchVouchers } from '../services/voucherService';
import { DEFAULT_PACKAGE_INCLUDES } from '../types/voucher';
import { fetchVisas } from '../services/visaService';
import { fetchHotels, fetchVehicles, fetchVendors } from '../services/masterService';
import { fetchAgents } from '../services/agentService';
import { HotelDoc } from '../types/master';
import { AgentDoc } from '../types/agent';
import { convert } from '../services/financeService';
import { getCurrentRate } from '../services/exchangeRateService';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/** Collapsible section wrapper — keeps the page simple for optional blocks. */
const Section: React.FC<{
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon, subtitle, collapsible, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => collapsible && setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-3.5 text-left ${collapsible ? 'cursor-pointer hover:bg-slate-50' : ''}`}
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-[var(--theme-primary)]">{icon}</span>}
          <div>
            <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {collapsible && (
          <span className="text-slate-400">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-slate-100">{children}</div>}
    </Card>
  );
};

export const VoucherCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const { success, error: showError } = useToast();
  const { profile: company } = useCompany();
  const canCreate = useCan('Vouchers', 'create');
  const isAgent = role === 'agent';
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // ---- Masters / lists ----
  const [availableVisas, setAvailableVisas] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [agentsList, setAgentsList] = useState<AgentDoc[]>([]);
  const [vendorsMaster, setVendorsMaster] = useState<any[]>([]);
  const [hotelsMaster, setHotelsMaster] = useState<HotelDoc[]>([]);
  const [vehiclesMaster, setVehiclesMaster] = useState<any[]>([]);

  // ---- Shirka (mandatory first) ----
  const [voucherVendorId, setVoucherVendorId] = useState('');
  const [voucherShirkaId, setVoucherShirkaId] = useState('');

  // ---- Pilgrim picker ----
  const [selectedVisaIds, setSelectedVisaIds] = useState<string[]>([]);
  const [paxSearch, setPaxSearch] = useState('');
  const [paxAgentFilter, setPaxAgentFilter] = useState('all');

  // ---- Trip anchor + sectors + stays ----
  const [arrivalDate, setArrivalDate] = useState(new Date().toISOString().split('T')[0]);
  const [sectors, setSectors] = useState<SectorItem[]>([
    { type: 'Arrival', date: new Date().toISOString().split('T')[0], flightNo: '', time: '12:00', vehicleType: undefined, transportRateSAR: 0 },
  ]);
  const [hotelStays, setHotelStays] = useState<HotelStayItem[]>([
    { city: 'Makkah', hotelName: '', checkInDate: new Date().toISOString().split('T')[0], checkOutDate: addDays(new Date().toISOString().split('T')[0], 3), nights: 3, bedType: 'Double', roomCount: 1, ratePerNightSAR: 0, totalSAR: 0 },
  ]);

  // ---- Flight details ----
  const [allowFlightInfo, setAllowFlightInfo] = useState(false);
  const [depAirline, setDepAirline] = useState<any | null>(null);
  const [depFlightNo, setDepFlightNo] = useState('');
  const [depFrom, setDepFrom] = useState<any | null>(null);
  const [depTo, setDepTo] = useState<any | null>(null);
  const [depDate, setDepDate] = useState(new Date().toISOString().split('T')[0]);
  const [depEtd, setDepEtd] = useState('12:00');
  const [depEta, setDepEta] = useState('15:00');
  const [retAirline, setRetAirline] = useState<any | null>(null);
  const [retFlightNo, setRetFlightNo] = useState('');
  const [retFrom, setRetFrom] = useState<any | null>(null);
  const [retTo, setRetTo] = useState<any | null>(null);
  const [retDate, setRetDate] = useState(new Date().toISOString().split('T')[0]);
  const [retEtd, setRetEtd] = useState('14:00');
  const [retEta, setRetEta] = useState('18:00');
  const [lateIntimationSAR, setLateIntimationSAR] = useState('');

  // ---- Commission ----
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionName, setCommissionName] = useState('');
  const [commissionContact, setCommissionContact] = useState('');
  const [commissionAmount, setCommissionAmount] = useState('');

  // ---- Oracle APEX legacy fields ----
  const [leaderName, setLeaderName] = useState('');
  const [leaderContact, setLeaderContact] = useState('');
  const [leaderPassport, setLeaderPassport] = useState('');
  const [packageType, setPackageType] = useState('');
  const [transportCompany, setTransportCompany] = useState('');
  const [saudiCompany, setSaudiCompany] = useState('');
  const [pakCompany, setPakCompany] = useState('');
  const [makkahZiaratBy, setMakkahZiaratBy] = useState('');
  const [makkahZiaratCost, setMakkahZiaratCost] = useState('');
  const [madinaZiaratBy, setMadinaZiaratBy] = useState('');
  const [madinaZiaratCost, setMadinaZiaratCost] = useState('');
  const [voucherReference, setVoucherReference] = useState('');
  const [voucherRemarks, setVoucherRemarks] = useState('');

  // ---- Package includes + KSA staff ----
  const [packageIncludes, setPackageIncludes] = useState<string[]>([...DEFAULT_PACKAGE_INCLUDES]);
  const [makkahStaffName, setMakkahStaffName] = useState('');
  const [makkahStaffPhone, setMakkahStaffPhone] = useState('');
  const [madinaStaffName, setMadinaStaffName] = useState('');
  const [madinaStaffPhone, setMadinaStaffPhone] = useState('');

  // ---- Load data ----
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [vList, visaList, hList, vehList, aList, vndList] = await Promise.all([
          fetchVouchers(),
          fetchVisas(),
          fetchHotels(),
          fetchVehicles(),
          fetchAgents(),
          fetchVendors(),
        ]);
        setVouchers(vList);
        setAvailableVisas(visaList);
        setHotelsMaster(hList);
        setVehiclesMaster(vehList);
        setAgentsList(aList);
        setVendorsMaster(vndList || []);
      } catch {
        showError('Failed to load voucher creation data.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMakkahStaffName(company?.makkahStaffName || '');
    setMakkahStaffPhone(company?.makkahStaffPhone || '');
    setMadinaStaffName(company?.madinaStaffName || '');
    setMadinaStaffPhone(company?.madinaStaffPhone || '');
  }, [company]);

  // ---- Remaining visas (no double vouchers) ----
  const usedVisaIds = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v: any) => (v.visaIds || []).forEach((id: string) => set.add(id)));
    return set;
  }, [vouchers]);
  const remainingVisas = useMemo(
    () => availableVisas.filter((v) => !usedVisaIds.has(v.id)),
    [availableVisas, usedVisaIds]
  );
  const pickerAgentName = (agentId: string): string => {
    if (!agentId) return 'Unassigned';
    const a = agentsList.find((x: any) => x.id === agentId);
    return a ? ((a as any).companyName || agentId) : agentId;
  };
  const pickerVisas = useMemo(() => {
    let list = remainingVisas;
    if (isAgent && userProfile?.agentId) list = list.filter((v) => v.agentId === userProfile.agentId);
    if (paxAgentFilter !== 'all') list = list.filter((v) => (v.agentId || '') === paxAgentFilter);
    if (voucherVendorId) {
      list = list.filter((v) => !v.vendorId || (v.vendorId === voucherVendorId && (v.shirkaId || '') === voucherShirkaId));
    }
    const q = paxSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          (v.pilgrimName || '').toLowerCase().includes(q) ||
          (v.passportNumber || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [remainingVisas, isAgent, userProfile, paxAgentFilter, paxSearch, voucherVendorId, voucherShirkaId]);
  const pickerAgentIds = useMemo(() => {
    const ids: string[] = [];
    remainingVisas.forEach((v) => {
      const id = v.agentId || '';
      if (!ids.includes(id)) ids.push(id);
    });
    return ids;
  }, [remainingVisas]);
  const groupedPicker = useMemo(() => {
    const map = new Map<string, any[]>();
    pickerVisas.forEach((v) => {
      const id = v.agentId || '';
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(v);
    });
    return Array.from(map.entries()).map(([agentId, visas]) => ({ agentId, visas }));
  }, [pickerVisas]);
  const toggleVisa = (id: string) =>
    setSelectedVisaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectPickerIds = (ids: string[]) =>
    setSelectedVisaIds((prev) => Array.from(new Set([...prev, ...ids])));
  const deselectPickerIds = (ids: string[]) =>
    setSelectedVisaIds((prev) => prev.filter((x) => !ids.includes(x)));

  const resolveShirkaName = (vendorId: string, shirkaId: string): string => {
    const vnd: any = (vendorsMaster || []).find((x: any) => x.id === vendorId);
    if (!vnd) return '';
    const shk = (vnd.shirkas || []).find((s: any) => s.id === shirkaId);
    return shk ? `${vnd.name} — ${shk.name}` : vnd.name;
  };

  // ---- Valid rows + totals ----
  const validHotelStays = useMemo(
    () => hotelStays.filter((h) => h.hotelName && h.hotelName.trim() !== '' && (h.ratePerNightSAR || 0) > 0),
    [hotelStays]
  );
  const validSectors = useMemo(() => sectors.filter((s) => (s.transportRateSAR || 0) > 0), [sectors]);
  const namedHotelStays = useMemo(
    () => hotelStays.filter((h) => h.hotelName && h.hotelName.trim() !== ''),
    [hotelStays]
  );
  const sectorsWithTransport = useMemo(
    () => sectors.filter((s) => s.vehicleType || s.isSelfGari),
    [sectors]
  );
  const hotelsSAR = useMemo(() => validHotelStays.reduce((sum, h) => sum + (h.totalSAR || 0), 0), [validHotelStays]);
  const transportSAR = useMemo(() => validSectors.reduce((sum, s) => sum + (s.transportRateSAR || 0), 0), [validSectors]);
  const lateIntimation = parseFloat(lateIntimationSAR) || 0;
  const totalSAR = hotelsSAR + transportSAR + lateIntimation;

  // ---- Hotel stay inline editor ----
  const updateStay = (idx: number, patch: Partial<HotelStayItem>) => {
    const updated = [...hotelStays];
    updated[idx] = { ...updated[idx], ...patch };
    const s = updated[idx];
    if (patch.nights !== undefined || patch.checkInDate !== undefined || patch.ratePerNightSAR !== undefined || patch.roomCount !== undefined) {
      s.checkOutDate = addDays(s.checkInDate, s.nights || 0);
      s.totalSAR = (s.nights || 0) * (s.ratePerNightSAR || 0) * (s.roomCount || 1);
    }
    // re-chain subsequent stays
    for (let i = idx + 1; i < updated.length; i++) {
      updated[i].checkInDate = updated[i - 1].checkOutDate;
      updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights || 0);
      updated[i].totalSAR = (updated[i].nights || 0) * (updated[i].ratePerNightSAR || 0) * (updated[i].roomCount || 1);
    }
    setHotelStays(updated);
  };
  const addStay = () => {
    const last = hotelStays[hotelStays.length - 1];
    const city = last ? last.city : 'Makkah';
    const checkIn = last ? last.checkOutDate : arrivalDate;
    setHotelStays([
      ...hotelStays,
      { city, hotelName: '', checkInDate: checkIn, checkOutDate: addDays(checkIn, 3), nights: 3, bedType: 'Double', roomCount: 1, ratePerNightSAR: 0, totalSAR: 0 },
    ]);
  };
  const removeStay = (idx: number) => {
    const updated = hotelStays.filter((_, i) => i !== idx);
    for (let i = 0; i < updated.length; i++) {
      updated[i].checkInDate = i === 0 ? arrivalDate : updated[i - 1].checkOutDate;
      updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights || 0);
    }
    setHotelStays(updated);
  };

  // ---- Sector helpers ----
  const addSector = (type: SectorItem['type']) => {
    setSectors([
      ...sectors,
      { type, date: sectors.length > 0 ? sectors[sectors.length - 1].date : arrivalDate, vehicleType: undefined, transportRateSAR: 0 },
    ]);
  };
  const updateSector = (idx: number, patch: Partial<SectorItem>) => {
    const updated = [...sectors];
    updated[idx] = { ...updated[idx], ...patch } as SectorItem;
    setSectors(updated);
  };

  /** Validate state and construct the voucher payload. */
  const buildVoucherPayload = (): VoucherEditPayload | null => {
    if (selectedVisaIds.length === 0) {
      showError('Please select at least one pilgrim for this voucher.');
      return null;
    }
    if (!voucherVendorId) {
      showError('Please select a Shirka first.');
      return null;
    }
    const missingVehicle = sectors.filter((s) => !s.vehicleType && !s.isSelfGari);
    if (missingVehicle.length > 0) {
      showError('Transport rule: every sector needs a vehicle selected, or mark Self Gari.');
      return null;
    }
    const departureDates = [
      ...sectors.filter((s) => s.type === 'Departure' && s.date).map((s) => s.date),
      ...(depDate ? [depDate] : []),
    ];
    const tripDeparture = departureDates.sort().pop() || '';
    if (tripDeparture && arrivalDate && tripDeparture < arrivalDate) {
      showError(`Departure date (${tripDeparture}) cannot be before the arrival date (${arrivalDate}).`);
      return null;
    }
    if (tripDeparture) {
      const lateStay = hotelStays.find((h) => h.checkOutDate && h.checkOutDate > tripDeparture);
      if (lateStay) {
        showError(`Hotel checkout (${lateStay.checkOutDate}, ${lateStay.hotelName || lateStay.city}) cannot be after the departure date (${tripDeparture}).`);
        return null;
      }
    }
    if (commissionEnabled) {
      if (!commissionName.trim()) {
        showError('Commission: please enter the recipient name.');
        return null;
      }
      if (!commissionContact.trim()) {
        showError('Commission: please enter the recipient contact number.');
        return null;
      }
      if (!(parseFloat(commissionAmount) > 0)) {
        showError('Commission: please enter a valid commission amount.');
        return null;
      }
    }
    if (namedHotelStays.length === 0 && sectorsWithTransport.length === 0) {
      showError('Please add at least one hotel stay (with a name) or transport sector.');
      return null;
    }

    const selectedVisasData = availableVisas.filter((v) => selectedVisaIds.includes(v.id));
    const passengers = selectedVisasData.map((v) => ({
      name: v.pilgrimName,
      passportNumber: v.passportNumber,
      ageType: 'Adult' as const,
      visaId: v.id,
    }));
    const paxAgents = Array.from(new Set(selectedVisasData.map((v) => v.agentId).filter(Boolean)));
    const voucherAgentId = paxAgents.length === 1 ? paxAgents[0] : undefined;
    const totalPKR = convert(totalSAR, getCurrentRate('SAR-PKR'));

    return {
      visaIds: selectedVisaIds,
      agentId: voucherAgentId,
      shirkaVendorId: voucherVendorId || undefined,
      shirkaId: voucherShirkaId || undefined,
      shirkaName: voucherVendorId ? resolveShirkaName(voucherVendorId, voucherShirkaId) || undefined : undefined,
      leaderName: leaderName.trim() || undefined,
      leaderContact: leaderContact.trim() || undefined,
      leaderPassport: leaderPassport.trim() || undefined,
      packageType: packageType.trim() || undefined,
      transportCompany: transportCompany.trim() || undefined,
      saudiCompany: saudiCompany.trim() || undefined,
      pakCompany: pakCompany.trim() || undefined,
      makkahZiarat:
        makkahZiaratBy.trim() || makkahZiaratCost
          ? { by: makkahZiaratBy.trim() || undefined, costSAR: parseFloat(makkahZiaratCost) || 0 }
          : undefined,
      madinaZiarat:
        madinaZiaratBy.trim() || madinaZiaratCost
          ? { by: madinaZiaratBy.trim() || undefined, costSAR: parseFloat(madinaZiaratCost) || 0 }
          : undefined,
      totalNights: namedHotelStays.reduce((s, h) => s + (h.nights || 0), 0),
      reference: voucherReference.trim() || undefined,
      remarks: voucherRemarks.trim() || undefined,
      passengers,
      sectors: sectorsWithTransport,
      hotelStays: namedHotelStays,
      flightDetails: {
        allowFlightInfo,
        departureFlight: {
          airline: depAirline,
          flightNo: depFlightNo,
          fromAirport: depFrom,
          toAirport: depTo,
          date: depDate,
          etd: depEtd,
          eta: depEta,
        },
        returnFlight: {
          airline: retAirline,
          flightNo: retFlightNo,
          fromAirport: retFrom,
          toAirport: retTo,
          date: retDate,
          etd: retEtd,
          eta: retEta,
        },
        lateIntimationChargesSAR: lateIntimation,
      },
      charges: [
        ...validHotelStays.map((h) => ({
          description: `${h.city} - ${h.hotelName} (${h.nights}n @ ${h.ratePerNightSAR} SAR)`,
          category: 'Hotel' as const,
          amountSAR: h.totalSAR,
        })),
        ...validSectors.map((s) => ({
          description: `${s.type} Sector (${s.vehicleType || 'Transport'})`,
          category: 'Transport' as const,
          amountSAR: s.transportRateSAR || 0,
        })),
        ...(lateIntimation > 0
          ? [{ description: 'Late Intimation Charges', category: 'Other' as const, amountSAR: lateIntimation }]
          : []),
      ],
      totals: { hotelsSAR, transportSAR, otherSAR: lateIntimation, totalSAR, totalPKR },
      commission: {
        enabled: commissionEnabled,
        recipientName: commissionName.trim(),
        contact: commissionContact.trim(),
        amountSAR: parseFloat(commissionAmount) || 0,
        isPaid: false,
      },
    };
  };

  const handleSave = async () => {
    if (!userProfile || !canCreate) return;
    const payload = buildVoucherPayload();
    if (!payload) return;
    setSaving(true);
    try {
      await createVoucher(userProfile, {
        linkType: 'visa',
        visaIds: payload.visaIds,
        customerId: undefined,
        agentId: payload.agentId,
        shirkaVendorId: payload.shirkaVendorId,
        shirkaId: payload.shirkaId,
        shirkaName: payload.shirkaName,
        status: 'Confirmed',
        passengers: payload.passengers,
        sectors: payload.sectors,
        hotelStays: payload.hotelStays,
        flightDetails: payload.flightDetails,
        charges: payload.charges,
        totals: {
          hotelsSAR: payload.totals.hotelsSAR,
          transportSAR: payload.totals.transportSAR,
          otherSAR: payload.totals.otherSAR,
          totalSAR: payload.totals.totalSAR,
          totalPKR: payload.totals.totalPKR,
        },
        commission: payload.commission,
        makkahStaffName: makkahStaffName.trim() || undefined,
        makkahStaffPhone: makkahStaffPhone.trim() || undefined,
        madinaStaffName: madinaStaffName.trim() || undefined,
        madinaStaffPhone: madinaStaffPhone.trim() || undefined,
        packageIncludes: [...packageIncludes],
        leaderName: payload.leaderName,
        leaderContact: payload.leaderContact,
        leaderPassport: payload.leaderPassport,
        packageType: payload.packageType,
        transportCompany: payload.transportCompany,
        saudiCompany: payload.saudiCompany,
        pakCompany: payload.pakCompany,
        makkahZiarat: payload.makkahZiarat,
        madinaZiarat: payload.madinaZiarat,
        totalNights: payload.totalNights,
        reference: payload.reference,
        remarks: payload.remarks,
      });
      success('Trip voucher created successfully and posted to ledger.');
      navigate('/vouchers');
    } catch (err: any) {
      showError(err?.message || 'Failed to create voucher.');
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) {
    return (
      <div className="p-6">
        <PageHeader title="New Voucher" subtitle="Create a trip voucher" />
        <Card className="p-8 text-center text-sm text-slate-500">
          You do not have permission to create vouchers.
        </Card>
      </div>
    );
  }

  const inputCls = 'w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold';
  const labelCls = 'block text-[11px] font-semibold text-slate-600 mb-1.5';

  return (
    <div className="pb-32">
      <PageHeader
        title="New Voucher"
        subtitle="Everything on one page — fill it, save it, done."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/vouchers')}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={loading || saving}>
              Save Voucher
            </Button>
          </div>
        }
      />

      <div className="px-4 sm:px-6 space-y-4 max-w-5xl mx-auto">
        {loading ? (
          <Card className="p-10 text-center text-sm text-slate-500">Loading...</Card>
        ) : (
          <>
            {/* 1. Shirka + arrival date */}
            <Section
              title="Shirka & Trip Date"
              icon={<FileText className="w-4 h-4" />}
              subtitle="Select the Shirka first — only its pilgrims will appear below."
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>
                    Shirka <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={`${voucherVendorId}::${voucherShirkaId}`}
                    onChange={(e) => {
                      const [vid, sid] = e.target.value.split('::');
                      setVoucherVendorId(vid || '');
                      setVoucherShirkaId(sid || '');
                      if (vid) {
                        setSelectedVisaIds((prev) =>
                          prev.filter((id) => {
                            const vv = availableVisas.find((x) => x.id === id);
                            if (!vv || !vv.vendorId) return true;
                            return vv.vendorId === vid && (vv.shirkaId || '') === (sid || '');
                          })
                        );
                      }
                    }}
                    className={inputCls}
                  >
                    <option value="::">-- Select Shirka (mandatory) --</option>
                    {vendorsMaster.filter((v: any) => v.isActive !== false).map((v: any) => {
                      const shirkas = (v.shirkas || []).filter((s: any) => s.isActive !== false);
                      if (shirkas.length === 0) {
                        return (
                          <option key={v.id} value={`${v.id}::`}>
                            {v.name}
                            {v.vendorCode ? ` (${v.vendorCode})` : ''}
                          </option>
                        );
                      }
                      return (
                        <optgroup key={v.id} label={`${v.name}${v.vendorCode ? ` (${v.vendorCode})` : ''}`}>
                          {shirkas.map((s: any) => (
                            <option key={s.id} value={`${v.id}::${s.id}`}>
                              {s.name} — run by {s.operatorName}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Trip Arrival Date (auto-chains hotel dates)</label>
                  <input
                    type="date"
                    value={arrivalDate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setArrivalDate(newDate);
                      if (hotelStays.length > 0) {
                        const updated = [...hotelStays];
                        updated[0].checkInDate = newDate;
                        updated[0].checkOutDate = addDays(newDate, updated[0].nights || 0);
                        for (let i = 1; i < updated.length; i++) {
                          updated[i].checkInDate = updated[i - 1].checkOutDate;
                          updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights || 0);
                        }
                        setHotelStays(updated);
                      }
                    }}
                    className={inputCls}
                  />
                </div>
              </div>
            </Section>

            {/* 2. Pilgrims */}
            <Section
              title={`Pilgrims — ${selectedVisaIds.length} selected`}
              icon={<Users className="w-4 h-4" />}
              subtitle={`${remainingVisas.length} pax available (distributed visas without a voucher yet).`}
            >
              {!voucherVendorId ? (
                <div className="p-6 text-center bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-600">
                  ↑ Select a Shirka above first
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select value={paxAgentFilter} onChange={(e) => setPaxAgentFilter(e.target.value)} className={`${inputCls} sm:w-52`}>
                      <option value="all">All Agents</option>
                      {pickerAgentIds.map((id) => (
                        <option key={id} value={id}>{pickerAgentName(id)}</option>
                      ))}
                    </select>
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={paxSearch}
                        onChange={(e) => setPaxSearch(e.target.value)}
                        placeholder="Search by name or passport number..."
                        className={`${inputCls} pl-9`}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => selectPickerIds(pickerVisas.map((v) => v.id))}
                        className="px-3 py-2.5 text-xs font-bold bg-[#0e2c4c] text-white rounded-lg whitespace-nowrap"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedVisaIds([])}
                        className="px-3 py-2.5 text-xs font-bold bg-white text-slate-700 border border-slate-300 rounded-lg whitespace-nowrap"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl">
                    {groupedPicker.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-500">
                        {remainingVisas.length === 0
                          ? 'No remaining unvouchered visas available.'
                          : 'No pilgrims match your search.'}
                      </div>
                    ) : (
                      groupedPicker.map((group) => {
                        const groupIds = group.visas.map((v) => v.id);
                        const allIn = groupIds.every((id) => selectedVisaIds.includes(id));
                        return (
                          <div key={group.agentId || 'unassigned'} className="border-b border-slate-100 last:border-b-0">
                            <button
                              type="button"
                              onClick={() => { allIn ? deselectPickerIds(groupIds) : selectPickerIds(groupIds); }}
                              className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition"
                            >
                              <span className="text-xs font-bold text-[var(--theme-primary)]">
                                {pickerAgentName(group.agentId)}
                                <span className="ml-2 text-[10px] font-semibold text-slate-500">
                                  {group.visas.length} pax • {groupIds.filter((id) => selectedVisaIds.includes(id)).length} selected
                                </span>
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${allIn ? 'bg-[#0e2c4c] text-white' : 'bg-white text-slate-600 border border-slate-300'}`}>
                                {allIn ? 'Deselect group' : 'Select group'}
                              </span>
                            </button>
                            {group.visas.map((visa) => {
                              const isSelected = selectedVisaIds.includes(visa.id);
                              return (
                                <div
                                  key={visa.id}
                                  onClick={() => toggleVisa(visa.id)}
                                  className={`px-3 py-2.5 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors border-t border-slate-50 ${isSelected ? 'bg-[#0e2c4c]/10' : 'hover:bg-slate-50'}`}
                                >
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 truncate">{visa.pilgrimName}</div>
                                    <div className="text-slate-500 truncate">
                                      Passport: <code className="font-mono">{visa.passportNumber}</code>
                                      {visa.groupCode ? ` • Group: ${visa.groupCode}` : ''}
                                    </div>
                                  </div>
                                  <div className={`w-5 h-5 shrink-0 rounded border flex items-center justify-center ${isSelected ? 'bg-[#0e2c4c] text-white border-[#0e2c4c]' : 'border-slate-300 bg-white'}`}>
                                    {isSelected && <Check className="w-3.5 h-3.5" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </Section>

            {/* 3. Transport sectors */}
            <Section
              title="Ground Transport"
              icon={<Plane className="w-4 h-4" />}
              subtitle="Every sector needs a vehicle, or mark Self Gari."
            >
              <div className="flex items-center gap-1.5 flex-wrap mb-3">
                <Button variant="outline" size="sm" onClick={() => addSector('Arrival')}>+ Arrival</Button>
                <Button variant="outline" size="sm" onClick={() => addSector('Departure')}>+ Departure</Button>
                <Button variant="outline" size="sm" onClick={() => addSector('Makkah to Madina' as any)}>+ Makkah ↔ Madina</Button>
                <Button variant="outline" size="sm" onClick={() => addSector('Madina to Makkah' as any)}>+ Madina ↔ Makkah</Button>
              </div>
              <div className="space-y-3">
                {sectors.map((sec, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--theme-primary)] px-2.5 py-1 bg-[#0e2c4c]/10 rounded uppercase text-[10px]">{sec.type}</span>
                        <input
                          type="date"
                          value={sec.date || ''}
                          min={sec.type === 'Departure' ? arrivalDate : undefined}
                          onChange={(e) => updateSector(idx, { date: e.target.value })}
                          className="p-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                        />
                      </div>
                      {sectors.length > 1 && (
                        <button type="button" onClick={() => setSectors(sectors.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 font-semibold">
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Vehicle *</label>
                        <select
                          value={sec.vehicleType || ''}
                          disabled={!!sec.isSelfGari}
                          onChange={(e) => updateSector(idx, { vehicleType: (e.target.value || undefined) as any })}
                          className={`${inputCls} disabled:bg-slate-100 disabled:text-slate-400`}
                        >
                          <option value="">-- Select Vehicle (Mandatory) --</option>
                          <option value="Car">Car (4 Seater Sedan)</option>
                          <option value="Staria">Staria VIP Van</option>
                          <option value="Hiace">Hiace (12 Seater High Roof)</option>
                          <option value="Coaster">Toyota Coaster Bus</option>
                          <option value="Bus">49-Seater Luxury Bus</option>
                          <option value="GMC">GMC (VIP SUV)</option>
                        </select>
                        <label className="flex items-center gap-2 mt-2 text-[11px] font-semibold text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!sec.isSelfGari}
                            onChange={(e) => {
                              const patch: Partial<SectorItem> = { isSelfGari: e.target.checked };
                              if (e.target.checked) { patch.vehicleType = undefined; patch.transportRateSAR = 0; }
                              updateSector(idx, patch);
                            }}
                            className="w-4 h-4 accent-[#0e2c4c]"
                          />
                          Self Gari (own vehicle — no company transport charge)
                        </label>
                      </div>
                      <div>
                        <label className={labelCls}>Transport Charge (SAR)</label>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={sec.transportRateSAR || ''}
                          onChange={(e) => updateSector(idx, { transportRateSAR: parseFloat(e.target.value) || 0 })}
                          placeholder={isAgent ? 'Staff will add the charge' : 'Type rate (SAR)...'}
                          disabled={isAgent || !!sec.isSelfGari}
                          className={`${inputCls} font-mono font-bold text-[var(--theme-primary)] disabled:bg-slate-100 disabled:text-slate-400`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* 4. Hotels */}
            <Section
              title="Accommodation"
              icon={<Bed className="w-4 h-4" />}
              subtitle="Add each hotel stay — dates chain automatically."
            >
              <div className="flex justify-end mb-3">
                <Button variant="outline" size="sm" onClick={addStay}>+ Add Hotel Stay</Button>
              </div>
              <div className="space-y-3">
                {hotelStays.map((stay, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--theme-primary)] text-[11px] uppercase">Stay {idx + 1} — {stay.city}</span>
                      {hotelStays.length > 1 && (
                        <button type="button" onClick={() => removeStay(idx)} className="text-red-500 hover:text-red-700 font-semibold">
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className={labelCls}>City</label>
                        <select value={stay.city} onChange={(e) => updateStay(idx, { city: e.target.value })} className={inputCls}>
                          <option value="Makkah">Makkah</option>
                          <option value="Madinah">Madinah</option>
                          <option value="Jeddah">Jeddah</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Bed Type</label>
                        <select value={stay.bedType} onChange={(e) => updateStay(idx, { bedType: e.target.value as any })} className={inputCls}>
                          <option value="Double">Double Bed</option>
                          <option value="Triple">Triple Bed</option>
                          <option value="Sharing">Sharing Bed</option>
                          <option value="Room">Room</option>
                          <option value="Quad">Quad Bed</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Check-In</label>
                        <input type="date" value={stay.checkInDate} onChange={(e) => updateStay(idx, { checkInDate: e.target.value })} className={`${inputCls} font-mono`} />
                      </div>
                      <div>
                        <label className={labelCls}>Nights</label>
                        <input type="number" min="0" value={stay.nights || ''} onChange={(e) => updateStay(idx, { nights: parseInt(e.target.value) || 0 })} className={`${inputCls} font-mono`} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className={labelCls}>Hotel {isAgent ? '(Self Hotel — type name)' : ''}</label>
                        {isAgent ? (
                          <input
                            type="text"
                            value={stay.hotelName}
                            onChange={(e) => updateStay(idx, { hotelName: e.target.value })}
                            placeholder="Type hotel name..."
                            className={inputCls}
                          />
                        ) : (
                          <select value={stay.hotelName} onChange={(e) => updateStay(idx, { hotelName: e.target.value })} className={inputCls}>
                            <option value="">-- Choose Hotel from Master --</option>
                            {hotelsMaster.filter((h) => (h.city || '').toLowerCase() === (stay.city || '').toLowerCase()).map((h) => (
                              <option key={h.id} value={h.name}>
                                {h.name}{h.availabilityNote ? ` (${h.availabilityNote})` : ''}{h.starRating ? ` — ${h.starRating}★` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div>
                        <label className={labelCls}>Rate / Night (SAR){isAgent ? ' — staff adds' : ''}</label>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={stay.ratePerNightSAR || ''}
                          onChange={(e) => updateStay(idx, { ratePerNightSAR: parseFloat(e.target.value) || 0 })}
                          placeholder={isAgent ? 'Staff will add' : 'Type rate...'}
                          disabled={isAgent}
                          className={`${inputCls} font-mono font-bold text-[var(--theme-primary)] disabled:bg-slate-100`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Rooms</label>
                        <input type="number" min="1" value={stay.roomCount || 1} onChange={(e) => updateStay(idx, { roomCount: Math.max(1, parseInt(e.target.value) || 1) })} className={`${inputCls} font-mono`} />
                      </div>
                      <div className="flex items-end justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                        <span className="text-[11px] text-slate-500">Out: <span className="font-mono font-bold text-slate-700">{stay.checkOutDate}</span></span>
                        <span className="font-mono font-bold text-[var(--theme-primary)]">SAR {(stay.totalSAR || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* 5. Flight details (optional, collapsed) */}
            <Section
              title="Flight Details"
              icon={<Plane className="w-4 h-4" />}
              subtitle="Optional carrier & flight schedule tracking."
              collapsible
              defaultOpen={false}
            >
              <label className="flex items-center gap-2 cursor-pointer bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 w-fit mb-3">
                <input type="checkbox" checked={allowFlightInfo} onChange={(e) => setAllowFlightInfo(e.target.checked)} className="rounded" />
                <span className="text-xs font-bold text-slate-800">Allow Flight Information</span>
              </label>
              <fieldset disabled={!allowFlightInfo} className={`space-y-3 ${!allowFlightInfo ? 'opacity-50' : ''}`}>
                {[
                  { title: 'Departure Flight', airline: depAirline, setAirline: setDepAirline, no: depFlightNo, setNo: setDepFlightNo, from: depFrom, setFrom: setDepFrom, to: depTo, setTo: setDepTo, date: depDate, setDate: setDepDate, etd: depEtd, setEtd: setDepEtd, eta: depEta, setEta: setDepEta },
                  { title: 'Return Flight', airline: retAirline, setAirline: setRetAirline, no: retFlightNo, setNo: setRetFlightNo, from: retFrom, setFrom: setRetFrom, to: retTo, setTo: setRetTo, date: retDate, setDate: setRetDate, etd: retEtd, setEtd: setRetEtd, eta: retEta, setEta: setRetEta },
                ].map((f) => (
                  <div key={f.title} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <span className="font-bold text-[var(--theme-primary)] text-xs uppercase block tracking-wider">{f.title}</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <AirlineSelect label="Flight (Airline)" value={f.airline} onChange={f.setAirline} placeholder="Select airline..." />
                      <div>
                        <label className={labelCls}>No (Flight Number)</label>
                        <input type="text" value={f.no} onChange={(e) => f.setNo(e.target.value)} placeholder="e.g. SV-734" className={`${inputCls} font-mono`} />
                      </div>
                      <AirportSelect label="FROM Airport" value={f.from} onChange={f.setFrom} placeholder="Origin..." />
                      <AirportSelect label="TO Airport" value={f.to} onChange={f.setTo} placeholder="Destination..." />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>Date</label>
                        <input type="date" value={f.date} min={arrivalDate} onChange={(e) => f.setDate(e.target.value)} className={`${inputCls} font-mono`} />
                      </div>
                      <div>
                        <label className={labelCls}>ETD</label>
                        <input type="time" value={f.etd} onChange={(e) => f.setEtd(e.target.value)} className={`${inputCls} font-mono`} />
                      </div>
                      <div>
                        <label className={labelCls}>ETA</label>
                        <input type="time" value={f.eta} onChange={(e) => f.setEta(e.target.value)} className={`${inputCls} font-mono`} />
                      </div>
                    </div>
                  </div>
                ))}
                <div>
                  <label className={labelCls}>Late Intimation Charges (SAR)</label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={lateIntimationSAR}
                    onChange={(e) => setLateIntimationSAR(e.target.value)}
                    placeholder="0 (Manual entry)"
                    className={`${inputCls} sm:w-64 font-mono font-bold text-[var(--theme-primary)]`}
                  />
                </div>
              </fieldset>
            </Section>

            {/* 6. Additional details (optional, collapsed) */}
            <Section
              title="Additional Details"
              icon={<FileText className="w-4 h-4" />}
              subtitle="Leader, package, companies, ziarat, reference & remarks — all optional."
              collapsible
              defaultOpen={false}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Group Leader</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input type="text" value={leaderName} onChange={(e) => setLeaderName(e.target.value)} placeholder="Leader name" className="p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                    <input type="text" value={leaderContact} onChange={(e) => setLeaderContact(e.target.value)} placeholder="Contact number" className="p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                    <input type="text" value={leaderPassport} onChange={(e) => setLeaderPassport(e.target.value)} placeholder="Passport number" className="p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Package Type</label>
                    <input type="text" value={packageType} onChange={(e) => setPackageType(e.target.value)} placeholder="e.g. SHUMUKH / SHAZA BARKA (DOUBLE) PIA" className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className={labelCls}>Reference</label>
                    <input type="text" value={voucherReference} onChange={(e) => setVoucherReference(e.target.value)} placeholder="Reference number" className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Transport Company</label>
                    <input type="text" value={transportCompany} onChange={(e) => setTransportCompany(e.target.value)} placeholder="Transport company" className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className={labelCls}>Saudi Company</label>
                    <input type="text" value={saudiCompany} onChange={(e) => setSaudiCompany(e.target.value)} placeholder="Saudi company" className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className={labelCls}>Pak Company</label>
                    <input type="text" value={pakCompany} onChange={(e) => setPakCompany(e.target.value)} placeholder="Pakistan company" className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Makkah Ziarat</label>
                    <input type="text" value={makkahZiaratBy} onChange={(e) => setMakkahZiaratBy(e.target.value)} placeholder="Ziarat by" className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm mb-2" />
                    <input type="number" value={makkahZiaratCost} onChange={(e) => setMakkahZiaratCost(e.target.value)} placeholder="Cost (SAR)" className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Madina Ziarat</label>
                    <input type="text" value={madinaZiaratBy} onChange={(e) => setMadinaZiaratBy(e.target.value)} placeholder="Ziarat by" className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm mb-2" />
                    <input type="number" value={madinaZiaratCost} onChange={(e) => setMadinaZiaratCost(e.target.value)} placeholder="Cost (SAR)" className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Remarks</label>
                  <textarea value={voucherRemarks} onChange={(e) => setVoucherRemarks(e.target.value)} rows={2} placeholder="Any special remarks..." className="w-full p-2 bg-white border border-slate-300 rounded-lg text-sm resize-none" />
                </div>
              </div>
            </Section>

            {/* 7. Package includes (optional, collapsed) */}
            <Section title="Package Includes" subtitle="Prints on the voucher." collapsible defaultOpen={false}>
              <div className="flex items-center gap-2 mb-3">
                <button type="button" onClick={() => setPackageIncludes([...DEFAULT_PACKAGE_INCLUDES])} className="text-[11px] font-bold text-[var(--theme-primary)] hover:underline">Select All</button>
                <span className="text-slate-300">|</span>
                <button type="button" onClick={() => setPackageIncludes([])} className="text-[11px] font-bold text-slate-500 hover:underline">Clear</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DEFAULT_PACKAGE_INCLUDES.map((item) => (
                  <label key={item} className="flex items-center gap-2.5 p-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer hover:border-[#0e2c4c]/40 transition text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={packageIncludes.includes(item)}
                      onChange={(e) => {
                        setPackageIncludes(e.target.checked ? [...packageIncludes, item] : packageIncludes.filter((x) => x !== item));
                      }}
                      className="w-4 h-4 accent-[#0e2c4c]"
                    />
                    <span>✓ {item}</span>
                  </label>
                ))}
              </div>
            </Section>

            {/* 8. KSA ground staff (optional, collapsed) */}
            <Section title="KSA Ground Staff Contacts" subtitle="Changeable per voucher — prints on the voucher." collapsible defaultOpen={false}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-white border border-emerald-200 rounded-lg space-y-2">
                  <p className="text-[11px] font-bold text-emerald-800 uppercase">Makkah Staff</p>
                  <Input label="Name" placeholder="e.g. Ahmed Khan" value={makkahStaffName} onChange={(e) => setMakkahStaffName(e.target.value)} />
                  <Input label="Mobile Number" placeholder="e.g. +966 5X XXX XXXX" value={makkahStaffPhone} onChange={(e) => setMakkahStaffPhone(e.target.value)} />
                </div>
                <div className="p-3 bg-white border border-emerald-200 rounded-lg space-y-2">
                  <p className="text-[11px] font-bold text-emerald-800 uppercase">Madina Staff</p>
                  <Input label="Name" placeholder="e.g. Bilal Ahmed" value={madinaStaffName} onChange={(e) => setMadinaStaffName(e.target.value)} />
                  <Input label="Mobile Number" placeholder="e.g. +966 5X XXX XXXX" value={madinaStaffPhone} onChange={(e) => setMadinaStaffPhone(e.target.value)} />
                </div>
              </div>
            </Section>

            {/* 9. Charges & commission summary */}
            <Section title="Charges & Commission" icon={<Bed className="w-4 h-4" />} subtitle="Live totals as you fill the form.">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs mb-4">
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Hotel Stays ({validHotelStays.length} charged):</span>
                  <span>SAR {hotelsSAR.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Transport Sectors ({validSectors.length} charged):</span>
                  <span>SAR {transportSAR.toLocaleString()}</span>
                </div>
                {lateIntimation > 0 && (
                  <div className="flex justify-between font-semibold text-slate-700">
                    <span>Late Intimation Charges:</span>
                    <span>SAR {lateIntimation.toLocaleString()}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
                  <span>Gross Voucher Total:</span>
                  <span className="font-mono text-[var(--theme-primary)]">SAR {totalSAR.toLocaleString()}</span>
                </div>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3 text-xs">
                <label className="flex items-center gap-2 font-semibold text-amber-950 cursor-pointer">
                  <input type="checkbox" checked={commissionEnabled} onChange={(e) => setCommissionEnabled(e.target.checked)} className="rounded" />
                  <span>Include Sub-Agent / Referrer Commission</span>
                </label>
                {commissionEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <Input label="Recipient Name *" placeholder="e.g. Al-Noor Agency" value={commissionName} onChange={(e) => setCommissionName(e.target.value)} />
                    <Input label="Contact Number *" placeholder="e.g. +92 300 1234567" value={commissionContact} onChange={(e) => setCommissionContact(e.target.value)} />
                    <Input label="Amount (SAR) *" type="number" placeholder="e.g. 250" value={commissionAmount} onChange={(e) => setCommissionAmount(e.target.value)} />
                  </div>
                )}
              </div>
            </Section>
          </>
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-bold text-slate-900">{selectedVisaIds.length}</span> pax
            <span className="mx-2 text-slate-300">|</span>
            <span className="font-mono font-bold text-[var(--theme-primary)] text-sm">SAR {totalSAR.toLocaleString()}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/vouchers')} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={loading || saving}>
              Save Voucher
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoucherCreatePage;
