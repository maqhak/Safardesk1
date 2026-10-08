import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plane,
  Bed,
  Users,
  FileText,
  Check,
  Building,
  Copy,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AirlineSelect } from '../components/ui';
import { InlineLoader } from '../components/ui/BrandedLoader';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { SectorItem, HotelStayItem, VoucherEditPayload, FlightBlockInfo } from '../types/voucher';
import { createVoucher, fetchVouchers } from '../services/voucherService';
import { DEFAULT_PACKAGE_INCLUDES } from '../types/voucher';
import { fetchVisas } from '../services/visaService';
import { fetchHotels, fetchVendors } from '../services/masterService';
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

const todayStr = () => new Date().toISOString().split('T')[0];

/** Oracle APEX package dropdown options (exact). */
const PACKAGE_OPTIONS = [
  'As Per Service',
  'Umrah Visa',
  'As per Package',
  'SHUMUKH / SHAZA BARKA (DOUBLE) PIA',
  'LULU IMAN / SHAZA BARKA (TRIPLE) PIA',
  'SHUMUKH / SHAZA BARKA (QUAD) SV 15 DAYS',
  'LULU IMAN / SHAZA BARKA (SHARING) SV 15 DAYS',
  'LULU IMAN / SHAZA BARKA (QUAD) SV 15 DAYS',
  'LULU IMAN / SHAZA BARKA (TRIPLE) SV 15 DAYS',
  'CHILD PACKAGE WITHOUT BED',
  'INFANT PACKAGE',
];

const TRANSPORT_TYPES = ['Car', 'Staria', 'Hiace', 'Coaster', 'Bus'];

/** One flight block (Arrival / Departure / Return) — Oracle 3-column layout. */
const FlightBlock: React.FC<{
  title: string;
  airline: any;
  setAirline: (v: any) => void;
  flightNo: string;
  setFlightNo: (v: string) => void;
  date: string;
  setDate: (v: string) => void;
  time: string;
  setTime: (v: string) => void;
  sector: string;
  setSector: (v: string) => void;
  pnr: string;
  setPnr: (v: string) => void;
  inputCls: string;
  labelCls: string;
}> = (p) => (
  <Card className="p-4">
    <h4 className="flex items-center gap-2 font-bold text-[#0e2c4c] text-sm uppercase tracking-wider mb-3">
      <Plane className="w-4 h-4" /> {p.title}
    </h4>
    <div className="space-y-3">
      <AirlineSelect label="Airline" value={p.airline} onChange={p.setAirline} placeholder="Select airline..." />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={p.labelCls}>Flight#</label>
          <input type="text" value={p.flightNo} onChange={(e) => p.setFlightNo(e.target.value)} placeholder="e.g. SV-734" className={`${p.inputCls} font-mono`} />
        </div>
        <div>
          <label className={p.labelCls}>PNR</label>
          <input type="text" value={p.pnr} onChange={(e) => p.setPnr(e.target.value)} placeholder="PNR" className={`${p.inputCls} font-mono`} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={p.labelCls}>Date</label>
          <input type="date" value={p.date} onChange={(e) => p.setDate(e.target.value)} className={`${p.inputCls} font-mono`} />
        </div>
        <div>
          <label className={p.labelCls}>Time</label>
          <input type="time" value={p.time} onChange={(e) => p.setTime(e.target.value)} className={`${p.inputCls} font-mono`} />
        </div>
      </div>
      <div>
        <label className={p.labelCls}>Sector</label>
        <input type="text" value={p.sector} onChange={(e) => p.setSector(e.target.value)} placeholder="e.g. LHE-JED" className={`${p.inputCls} font-mono uppercase`} />
      </div>
    </div>
  </Card>
);

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

  // ---- Top bar: voucher meta ----
  const [voucherDate, setVoucherDate] = useState(todayStr());
  const [copyFromId, setCopyFromId] = useState('');

  // ---- Row: reference / package / SR rate ----
  const [voucherReference, setVoucherReference] = useState('');
  const [packageSelect, setPackageSelect] = useState('');
  const [packageCustom, setPackageCustom] = useState('');
  const [srRate, setSrRate] = useState('');

  // ---- Shirka (mandatory, filters pilgrim list) ----
  const [voucherVendorId, setVoucherVendorId] = useState('');
  const [voucherShirkaId, setVoucherShirkaId] = useState('');

  // ---- Pilgrim picker ----
  const [selectedVisaIds, setSelectedVisaIds] = useState<string[]>([]);
  const [paxSearch, setPaxSearch] = useState('');
  const [paxAgentFilter, setPaxAgentFilter] = useState('all');

  // ---- Trip anchor ----
  const [arrivalDate, setArrivalDate] = useState(todayStr());

  // ---- Flight blocks: Arrival / Departure / Return (Oracle 3-col) ----
  const [arrAirline, setArrAirline] = useState<any | null>(null);
  const [arrFlightNo, setArrFlightNo] = useState('');
  const [arrDate, setArrDate] = useState(todayStr());
  const [arrTime, setArrTime] = useState('12:00');
  const [arrSector, setArrSector] = useState('');
  const [arrPnr, setArrPnr] = useState('');

  const [depAirline, setDepAirline] = useState<any | null>(null);
  const [depFlightNo, setDepFlightNo] = useState('');
  const [depDate, setDepDate] = useState(todayStr());
  const [depTime, setDepTime] = useState('12:00');
  const [depSector, setDepSector] = useState('');
  const [depPnr, setDepPnr] = useState('');

  const [retAirline, setRetAirline] = useState<any | null>(null);
  const [retFlightNo, setRetFlightNo] = useState('');
  const [retDate, setRetDate] = useState(todayStr());
  const [retTime, setRetTime] = useState('14:00');
  const [retSector, setRetSector] = useState('');
  const [retPnr, setRetPnr] = useState('');

  // ---- Hotels: exactly 2 (Makkah | Madina) — Oracle layout ----
  const [hotelStays, setHotelStays] = useState<HotelStayItem[]>([
    { city: 'Makkah', hotelName: '', checkInDate: todayStr(), checkOutDate: addDays(todayStr(), 3), nights: 3, bedType: 'Double', roomCount: 1, ratePerNightSAR: 0, totalSAR: 0 },
    { city: 'Madinah', hotelName: '', checkInDate: addDays(todayStr(), 3), checkOutDate: addDays(todayStr(), 6), nights: 3, bedType: 'Double', roomCount: 1, ratePerNightSAR: 0, totalSAR: 0 },
  ]);

  // ---- Leader & companies (Oracle fields) ----
  const [leaderName, setLeaderName] = useState('');
  const [leaderContact, setLeaderContact] = useState('');
  const [leaderPassport, setLeaderPassport] = useState('');
  const [transportCompany, setTransportCompany] = useState('');
  const [transportType, setTransportType] = useState('');
  const [trip, setTrip] = useState('');
  const [transportChargeSAR, setTransportChargeSAR] = useState('');
  const [saudiCompany, setSaudiCompany] = useState('');
  const [pakCompany, setPakCompany] = useState('');

  // ---- Shirka text fields (Oracle) ----
  const [makkahShirka, setMakkahShirka] = useState('');
  const [madinaShirka, setMadinaShirka] = useState('');

  // ---- Ziarat (Oracle: By | Cost | Rate) ----
  const [makkahZiaratBy, setMakkahZiaratBy] = useState('');
  const [makkahZiaratCost, setMakkahZiaratCost] = useState('');
  const [makkahZiaratRate, setMakkahZiaratRate] = useState('');
  const [madinaZiaratBy, setMadinaZiaratBy] = useState('');
  const [madinaZiaratCost, setMadinaZiaratCost] = useState('');
  const [madinaZiaratRate, setMadinaZiaratRate] = useState('');

  // ---- Remarks ----
  const [voucherRemarks, setVoucherRemarks] = useState('');

  // ---- Transport sectors (auto-synced from Transport Type + charge; backend needs it) ----
  const [sectors, setSectors] = useState<SectorItem[]>([]);

  // ---- Carried-through defaults (not in Oracle layout, kept for backend) ----
  const [packageIncludes, setPackageIncludes] = useState<string[]>([...DEFAULT_PACKAGE_INCLUDES]);
  const [makkahStaffName, setMakkahStaffName] = useState('');
  const [makkahStaffPhone, setMakkahStaffPhone] = useState('');
  const [madinaStaffName, setMadinaStaffName] = useState('');
  const [madinaStaffPhone, setMadinaStaffPhone] = useState('');
  const [commissionEnabled] = useState(false);
  const [commissionName] = useState('');
  const [commissionContact] = useState('');
  const [commissionAmount] = useState('');

  // ---- Load data ----
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [vList, visaList, hList, aList, vndList] = await Promise.all([
          fetchVouchers(),
          fetchVisas(),
          fetchHotels(),
          fetchAgents(),
          fetchVendors(),
        ]);
        setVouchers(vList);
        setAvailableVisas(visaList);
        setHotelsMaster(hList);
        setAgentsList(aList);
        setVendorsMaster(vndList || []);
        try {
          setSrRate(String(getCurrentRate('SAR-PKR') || ''));
        } catch { /* keep empty */ }
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

  // ---- Sync single transport sector from Transport Type + charge ----
  useEffect(() => {
    const rate = parseFloat(transportChargeSAR) || 0;
    if (transportType) {
      setSectors([{ type: 'Arrival', date: arrivalDate, vehicleType: transportType as any, transportRateSAR: rate }]);
    } else {
      setSectors([]);
    }
  }, [transportType, transportChargeSAR, arrivalDate]);

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

  // ---- Package: dropdown + custom text ----
  const effectivePackageType = packageSelect === '__custom' ? packageCustom.trim() : packageSelect;

  // ---- Agent auto from pilgrim selection (readonly display) ----
  const selectedVisasData = useMemo(
    () => availableVisas.filter((v) => selectedVisaIds.includes(v.id)),
    [availableVisas, selectedVisaIds]
  );
  const displayAgentName = useMemo(() => {
    const ids = Array.from(new Set(selectedVisasData.map((v) => v.agentId).filter(Boolean)));
    if (ids.length === 0) return '—';
    if (ids.length > 1) return 'Multiple agents';
    return pickerAgentName(ids[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVisasData, agentsList]);

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
    () => sectors.filter((s) => s.vehicleType || (s as any).isSelfGari),
    [sectors]
  );
  const hotelsSAR = useMemo(() => validHotelStays.reduce((sum, h) => sum + (h.totalSAR || 0), 0), [validHotelStays]);
  const transportSAR = useMemo(() => validSectors.reduce((sum, s) => sum + (s.transportRateSAR || 0), 0), [validSectors]);
  const totalSAR = hotelsSAR + transportSAR;
  const effectiveRate = parseFloat(srRate) || getCurrentRate('SAR-PKR') || 0;
  const totalNights = useMemo(() => namedHotelStays.reduce((s, h) => s + (h.nights || 0), 0), [namedHotelStays]);

  // ---- Hotel stay editor (2 fixed stays, dates chain) ----
  const updateStay = (idx: number, patch: Partial<HotelStayItem>) => {
    const updated = [...hotelStays];
    updated[idx] = { ...updated[idx], ...patch };
    const s = updated[idx];
    if (patch.nights !== undefined || patch.checkInDate !== undefined || patch.ratePerNightSAR !== undefined || patch.roomCount !== undefined) {
      s.checkOutDate = addDays(s.checkInDate, s.nights || 0);
      s.totalSAR = (s.nights || 0) * (s.ratePerNightSAR || 0) * (s.roomCount || 1);
    }
    for (let i = idx + 1; i < updated.length; i++) {
      updated[i].checkInDate = updated[i - 1].checkOutDate;
      updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights || 0);
      updated[i].totalSAR = (updated[i].nights || 0) * (updated[i].ratePerNightSAR || 0) * (updated[i].roomCount || 1);
    }
    setHotelStays(updated);
  };

  // ---- Copy From: clone an existing voucher's fields ----
  const handleCopyFrom = (voucherId: string) => {
    setCopyFromId(voucherId);
    if (!voucherId) return;
    const v: any = vouchers.find((x) => x.id === voucherId);
    if (!v) return;
    setLeaderName(v.leaderName || '');
    setLeaderContact(v.leaderContact || '');
    setLeaderPassport(v.leaderPassport || '');
    if (v.packageType) {
      if (PACKAGE_OPTIONS.includes(v.packageType)) setPackageSelect(v.packageType);
      else { setPackageSelect('__custom'); setPackageCustom(v.packageType); }
    }
    setTransportCompany(v.transportCompany || '');
    setTransportType(v.transportType || v.sectors?.[0]?.vehicleType || '');
    setTrip(v.trip || '');
    setSaudiCompany(v.saudiCompany || '');
    setPakCompany(v.pakCompany || '');
    setMakkahShirka(v.makkahShirka || '');
    setMadinaShirka(v.madinaShirka || '');
    if (v.makkahZiarat) {
      setMakkahZiaratBy(v.makkahZiarat.by || '');
      setMakkahZiaratCost(v.makkahZiarat.costSAR ? String(v.makkahZiarat.costSAR) : '');
      setMakkahZiaratRate(v.makkahZiarat.rateSAR ? String(v.makkahZiarat.rateSAR) : '');
    }
    if (v.madinaZiarat) {
      setMadinaZiaratBy(v.madinaZiarat.by || '');
      setMadinaZiaratCost(v.madinaZiarat.costSAR ? String(v.madinaZiarat.costSAR) : '');
      setMadinaZiaratRate(v.madinaZiarat.rateSAR ? String(v.madinaZiarat.rateSAR) : '');
    }
    setVoucherReference(v.reference || '');
    setVoucherRemarks(v.remarks || '');
    const fd = v.flightDetails;
    const applyBlock = (
      b: any,
      setA: (x: any) => void, setN: (x: string) => void, setD: (x: string) => void,
      setT: (x: string) => void, setS: (x: string) => void, setP: (x: string) => void
    ) => {
      if (!b) return;
      setA(b.airline || null); setN(b.flightNo || ''); setD(b.date || todayStr());
      setT(b.etd || '12:00'); setS(b.sector || ''); setP(b.pnr || '');
    };
    if (fd) {
      applyBlock(fd.arrivalFlight, setArrAirline, setArrFlightNo, setArrDate, setArrTime, setArrSector, setArrPnr);
      applyBlock(fd.departureFlight, setDepAirline, setDepFlightNo, setDepDate, setDepTime, setDepSector, setDepPnr);
      applyBlock(fd.returnFlight, setRetAirline, setRetFlightNo, setRetDate, setRetTime, setRetSector, setRetPnr);
    }
    if (Array.isArray(v.hotelStays) && v.hotelStays.length > 0) {
      setHotelStays((prev) =>
        prev.map((s, i) => {
          const src = v.hotelStays[i];
          if (!src) return s;
          const nights = src.nights || s.nights;
          const rate = src.ratePerNightSAR || 0;
          return {
            ...s,
            hotelName: src.hotelName || s.hotelName,
            nights,
            ratePerNightSAR: rate,
            checkOutDate: addDays(s.checkInDate, nights),
            totalSAR: nights * rate * (s.roomCount || 1),
          };
        })
      );
    }
    success(`Copied fields from ${v.voucherNo || 'voucher'}.`);
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
    const missingVehicle = sectors.filter((s) => !s.vehicleType && !(s as any).isSelfGari);
    if (missingVehicle.length > 0) {
      showError('Transport rule: every sector needs a vehicle selected.');
      return null;
    }
    if (depDate && arrivalDate && depDate < arrivalDate) {
      showError(`Departure date (${depDate}) cannot be before the arrival date (${arrivalDate}).`);
      return null;
    }
    if (depDate) {
      const lateStay = hotelStays.find((h) => h.checkOutDate && h.checkOutDate > depDate);
      if (lateStay) {
        showError(`Hotel checkout (${lateStay.checkOutDate}, ${lateStay.hotelName || lateStay.city}) cannot be after the departure date (${depDate}).`);
        return null;
      }
    }
    if (namedHotelStays.length === 0 && sectorsWithTransport.length === 0) {
      showError('Please add at least one hotel stay (with a name) or select a transport type.');
      return null;
    }

    const passengers = selectedVisasData.map((v) => ({
      name: v.pilgrimName,
      passportNumber: v.passportNumber,
      ageType: 'Adult' as const,
      visaId: v.id,
    }));
    const paxAgents = Array.from(new Set(selectedVisasData.map((v) => v.agentId).filter(Boolean)));
    const voucherAgentId = paxAgents.length === 1 ? paxAgents[0] : undefined;
    const totalPKR = convert(totalSAR, effectiveRate);

    const block = (
      airline: any, flightNo: string, date: string, time: string, sector: string, pnr: string
    ): FlightBlockInfo => ({
      airline: airline || null,
      flightNo: flightNo.trim() || undefined,
      date: date || undefined,
      etd: time || undefined,
      sector: sector.trim() || undefined,
      pnr: pnr.trim() || undefined,
    });

    return {
      visaIds: selectedVisaIds,
      agentId: voucherAgentId,
      shirkaVendorId: voucherVendorId || undefined,
      shirkaId: voucherShirkaId || undefined,
      shirkaName: voucherVendorId ? resolveShirkaName(voucherVendorId, voucherShirkaId) || undefined : undefined,
      leaderName: leaderName.trim() || undefined,
      leaderContact: leaderContact.trim() || undefined,
      leaderPassport: leaderPassport.trim() || undefined,
      packageType: effectivePackageType || undefined,
      transportCompany: transportCompany.trim() || undefined,
      transportType: transportType || undefined,
      trip: trip.trim() || undefined,
      saudiCompany: saudiCompany.trim() || undefined,
      pakCompany: pakCompany.trim() || undefined,
      makkahShirka: makkahShirka.trim() || undefined,
      madinaShirka: madinaShirka.trim() || undefined,
      makkahZiarat:
        makkahZiaratBy.trim() || makkahZiaratCost || makkahZiaratRate
          ? {
              by: makkahZiaratBy.trim() || undefined,
              costSAR: parseFloat(makkahZiaratCost) || 0,
              rateSAR: parseFloat(makkahZiaratRate) || undefined,
            }
          : undefined,
      madinaZiarat:
        madinaZiaratBy.trim() || madinaZiaratCost || madinaZiaratRate
          ? {
              by: madinaZiaratBy.trim() || undefined,
              costSAR: parseFloat(madinaZiaratCost) || 0,
              rateSAR: parseFloat(madinaZiaratRate) || undefined,
            }
          : undefined,
      totalNights,
      reference: voucherReference.trim() || undefined,
      remarks: voucherRemarks.trim() || undefined,
      voucherDate: voucherDate || undefined,
      passengers,
      sectors: sectorsWithTransport,
      hotelStays: namedHotelStays,
      flightDetails: {
        allowFlightInfo: true,
        arrivalFlight: block(arrAirline, arrFlightNo, arrDate, arrTime, arrSector, arrPnr),
        departureFlight: block(depAirline, depFlightNo, depDate, depTime, depSector, depPnr),
        returnFlight: block(retAirline, retFlightNo, retDate, retTime, retSector, retPnr),
        lateIntimationChargesSAR: 0,
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
      ],
      totals: { hotelsSAR, transportSAR, otherSAR: 0, totalSAR, totalPKR, exchangeRate: effectiveRate || undefined },
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
          exchangeRate: payload.totals.exchangeRate,
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
        transportType: payload.transportType,
        trip: payload.trip,
        saudiCompany: payload.saudiCompany,
        pakCompany: payload.pakCompany,
        makkahShirka: payload.makkahShirka,
        madinaShirka: payload.madinaShirka,
        makkahZiarat: payload.makkahZiarat,
        madinaZiarat: payload.madinaZiarat,
        totalNights: payload.totalNights,
        reference: payload.reference,
        remarks: payload.remarks,
        voucherDate: payload.voucherDate,
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

  const inputCls = 'w-full p-2.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-900';
  const labelCls = 'block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5';
  const readOnlyCls = 'w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 font-mono';

  const hotelSuggestions = (city: string) =>
    hotelsMaster.filter((h) => (h.city || '').toLowerCase() === city.toLowerCase());

  return (
    <div className="pb-32">
      <PageHeader
        title="New Voucher"
        subtitle="Fill the form exactly like the register — save when done."
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

      <div className="px-4 sm:px-6 space-y-4 max-w-6xl mx-auto">
        {loading ? (
          <Card><InlineLoader message="Loading voucher data..." /></Card>
        ) : (
          <>
            {/* ===== TOP BAR: Voucher# | Pax QTY | Copy From | Date ===== */}
            <Card className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Voucher#</label>
                  <input type="text" value="Auto" readOnly className={readOnlyCls} />
                </div>
                <div>
                  <label className={labelCls}>Pax QTY</label>
                  <input type="text" value={String(selectedVisaIds.length)} readOnly className={readOnlyCls} />
                </div>
                <div>
                  <label className={labelCls}>Copy From</label>
                  <div className="relative">
                    <Copy className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select value={copyFromId} onChange={(e) => handleCopyFrom(e.target.value)} className={`${inputCls} pl-9`}>
                      <option value="">-- Copy from existing --</option>
                      {vouchers.slice(0, 100).map((v: any) => (
                        <option key={v.id} value={v.id}>
                          {v.voucherNo} — {v.passengers?.length || (v.visaIds || []).length} pax
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} className={`${inputCls} font-mono`} />
                </div>
              </div>
            </Card>

            {/* ===== ROW: Reference | Package | Total Nights | SR Rate ===== */}
            <Card className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Reference</label>
                  <input type="text" value={voucherReference} onChange={(e) => setVoucherReference(e.target.value)} placeholder="Reference no." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Package / SAR</label>
                  <select
                    value={packageSelect}
                    onChange={(e) => setPackageSelect(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">-- Select Package --</option>
                    {PACKAGE_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                    <option value="__custom">Custom... (type below)</option>
                  </select>
                  {packageSelect === '__custom' && (
                    <input
                      type="text"
                      value={packageCustom}
                      onChange={(e) => setPackageCustom(e.target.value)}
                      placeholder="Type custom package..."
                      className={`${inputCls} mt-2`}
                    />
                  )}
                </div>
                <div>
                  <label className={labelCls}>Total Nights</label>
                  <input type="text" value={String(totalNights)} readOnly className={readOnlyCls} />
                </div>
                <div>
                  <label className={labelCls}>SR Rate</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={srRate}
                    onChange={(e) => setSrRate(e.target.value)}
                    placeholder={`e.g. ${getCurrentRate('SAR-PKR') || 75.5}`}
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>
            </Card>

            {/* ===== PILGRIMS ===== */}
            <Card className="p-4">
              <h3 className="flex items-center gap-2 font-bold text-[#0e2c4c] text-sm uppercase tracking-wider mb-3">
                <Users className="w-4 h-4" /> Pilgrims — {selectedVisaIds.length} selected
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div className="md:col-span-2">
                  <label className={labelCls}>Shirka <span className="text-red-500">*</span></label>
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
                            {v.name}{v.vendorCode ? ` (${v.vendorCode})` : ''}
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
                  <label className={labelCls}>Trip Arrival Date</label>
                  <input
                    type="date"
                    value={arrivalDate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setArrivalDate(newDate);
                      const updated = [...hotelStays];
                      if (updated[0]) {
                        updated[0].checkInDate = newDate;
                        updated[0].checkOutDate = addDays(newDate, updated[0].nights || 0);
                        for (let i = 1; i < updated.length; i++) {
                          updated[i].checkInDate = updated[i - 1].checkOutDate;
                          updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights || 0);
                        }
                        setHotelStays(updated);
                      }
                    }}
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>
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
                  <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                    {groupedPicker.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-500">
                        {remainingVisas.length === 0 ? 'No remaining unvouchered visas available.' : 'No pilgrims match your search.'}
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
                              <span className="text-xs font-bold text-[#0e2c4c]">
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
            </Card>

            {/* ===== FLIGHTS: Arrival | Departure | Return ===== */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FlightBlock
                title="Arrival"
                airline={arrAirline} setAirline={setArrAirline}
                flightNo={arrFlightNo} setFlightNo={setArrFlightNo}
                date={arrDate} setDate={setArrDate}
                time={arrTime} setTime={setArrTime}
                sector={arrSector} setSector={setArrSector}
                pnr={arrPnr} setPnr={setArrPnr}
                inputCls={inputCls} labelCls={labelCls}
              />
              <FlightBlock
                title="Departure"
                airline={depAirline} setAirline={setDepAirline}
                flightNo={depFlightNo} setFlightNo={setDepFlightNo}
                date={depDate} setDate={setDepDate}
                time={depTime} setTime={setDepTime}
                sector={depSector} setSector={setDepSector}
                pnr={depPnr} setPnr={setDepPnr}
                inputCls={inputCls} labelCls={labelCls}
              />
              <FlightBlock
                title="Return"
                airline={retAirline} setAirline={setRetAirline}
                flightNo={retFlightNo} setFlightNo={setRetFlightNo}
                date={retDate} setDate={setRetDate}
                time={retTime} setTime={setRetTime}
                sector={retSector} setSector={setRetSector}
                pnr={retPnr} setPnr={setRetPnr}
                inputCls={inputCls} labelCls={labelCls}
              />
            </div>

            {/* ===== HOTELS: Makkah | Madina ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hotelStays.map((stay, idx) => (
                <Card key={stay.city} className="p-4">
                  <h4 className="flex items-center justify-between font-bold text-[#0e2c4c] text-sm uppercase tracking-wider mb-3">
                    <span className="flex items-center gap-2"><Bed className="w-4 h-4" /> {stay.city} Hotel</span>
                    <span className="font-mono text-xs text-slate-500 normal-case">Out: {stay.checkOutDate}</span>
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>Hotel Name</label>
                      <input
                        type="text"
                        list={`hotel-suggest-${stay.city}`}
                        value={stay.hotelName}
                        onChange={(e) => updateStay(idx, { hotelName: e.target.value })}
                        placeholder={`Type ${stay.city} hotel name...`}
                        className={inputCls}
                      />
                      <datalist id={`hotel-suggest-${stay.city}`}>
                        {hotelSuggestions(stay.city).map((h) => (
                          <option key={h.id} value={h.name} />
                        ))}
                      </datalist>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>Check-in</label>
                        <input type="date" value={stay.checkInDate} onChange={(e) => updateStay(idx, { checkInDate: e.target.value })} className={`${inputCls} font-mono`} />
                      </div>
                      <div>
                        <label className={labelCls}>Nights</label>
                        <input type="number" min="0" value={stay.nights || ''} onChange={(e) => updateStay(idx, { nights: parseInt(e.target.value) || 0 })} className={`${inputCls} font-mono`} />
                      </div>
                      <div>
                        <label className={labelCls}>Rate (SAR){isAgent ? '*' : ''}</label>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={stay.ratePerNightSAR || ''}
                          onChange={(e) => updateStay(idx, { ratePerNightSAR: parseFloat(e.target.value) || 0 })}
                          placeholder={isAgent ? 'Staff adds' : 'Per night'}
                          disabled={isAgent}
                          className={`${inputCls} font-mono font-bold text-[#0e2c4c] disabled:bg-slate-100`}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <span className="text-xs font-bold text-slate-600">
                        Total: <span className="font-mono text-[#0e2c4c]">SAR {(stay.totalSAR || 0).toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* ===== LEADER & COMPANIES ===== */}
            <Card className="p-4">
              <h3 className="flex items-center gap-2 font-bold text-[#0e2c4c] text-sm uppercase tracking-wider mb-3">
                <FileText className="w-4 h-4" /> Leader & Companies
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Group Head</label>
                    <input type="text" value={leaderName} onChange={(e) => setLeaderName(e.target.value)} placeholder="Leader name" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Contact</label>
                    <input type="text" value={leaderContact} onChange={(e) => setLeaderContact(e.target.value)} placeholder="Contact number" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Passport</label>
                    <input type="text" value={leaderPassport} onChange={(e) => setLeaderPassport(e.target.value)} placeholder="Passport number" className={`${inputCls} font-mono`} />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className={labelCls}>Transport Company</label>
                    <input type="text" value={transportCompany} onChange={(e) => setTransportCompany(e.target.value)} placeholder="Transport company" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Transport Type</label>
                    <select value={transportType} onChange={(e) => setTransportType(e.target.value)} className={inputCls}>
                      <option value="">-- Select --</option>
                      {TRANSPORT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Trip</label>
                    <input type="text" value={trip} onChange={(e) => setTrip(e.target.value)} placeholder="e.g. Jeddah-Makkah" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Transport Charge (SAR){isAgent ? '*' : ''}</label>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      value={transportChargeSAR}
                      onChange={(e) => setTransportChargeSAR(e.target.value)}
                      placeholder={isAgent ? 'Staff adds' : '0'}
                      disabled={isAgent || !transportType}
                      className={`${inputCls} font-mono font-bold text-[#0e2c4c] disabled:bg-slate-100`}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Saudi Company</label>
                    <input type="text" value={saudiCompany} onChange={(e) => setSaudiCompany(e.target.value)} placeholder="Saudi company" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Pak Company</label>
                    <input type="text" value={pakCompany} onChange={(e) => setPakCompany(e.target.value)} placeholder="Pakistan company" className={inputCls} />
                  </div>
                </div>
              </div>
            </Card>

            {/* ===== SHIRKA ===== */}
            <Card className="p-4">
              <h3 className="flex items-center gap-2 font-bold text-[#0e2c4c] text-sm uppercase tracking-wider mb-3">
                <Building className="w-4 h-4" /> Shirka
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Makkah Shirka</label>
                  <input type="text" value={makkahShirka} onChange={(e) => setMakkahShirka(e.target.value)} placeholder="Makkah shirka" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Madina Shirka</label>
                  <input type="text" value={madinaShirka} onChange={(e) => setMadinaShirka(e.target.value)} placeholder="Madina shirka" className={inputCls} />
                </div>
              </div>
            </Card>

            {/* ===== ZIARAT ===== */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-4">
                <h4 className="font-bold text-[#0e2c4c] text-sm uppercase tracking-wider mb-3">Makkah Ziarat</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Ziarat By</label>
                    <input type="text" value={makkahZiaratBy} onChange={(e) => setMakkahZiaratBy(e.target.value)} placeholder="By whom" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Cost</label>
                    <input type="number" min="0" value={makkahZiaratCost} onChange={(e) => setMakkahZiaratCost(e.target.value)} placeholder="SAR" className={`${inputCls} font-mono`} />
                  </div>
                  <div>
                    <label className={labelCls}>Rate</label>
                    <input type="number" min="0" step="0.01" value={makkahZiaratRate} onChange={(e) => setMakkahZiaratRate(e.target.value)} placeholder="Rate" className={`${inputCls} font-mono`} />
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <h4 className="font-bold text-[#0e2c4c] text-sm uppercase tracking-wider mb-3">Madina Ziarat</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={labelCls}>Ziarat By</label>
                    <input type="text" value={madinaZiaratBy} onChange={(e) => setMadinaZiaratBy(e.target.value)} placeholder="By whom" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Cost</label>
                    <input type="number" min="0" value={madinaZiaratCost} onChange={(e) => setMadinaZiaratCost(e.target.value)} placeholder="SAR" className={`${inputCls} font-mono`} />
                  </div>
                  <div>
                    <label className={labelCls}>Rate</label>
                    <input type="number" min="0" step="0.01" value={madinaZiaratRate} onChange={(e) => setMadinaZiaratRate(e.target.value)} placeholder="Rate" className={`${inputCls} font-mono`} />
                  </div>
                </div>
              </Card>
            </div>

            {/* ===== BOTTOM: Remarks | Agent ===== */}
            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className={labelCls}>Remarks</label>
                  <textarea value={voucherRemarks} onChange={(e) => setVoucherRemarks(e.target.value)} rows={2} placeholder="Any special remarks..." className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className={labelCls}>Agent</label>
                  <input type="text" value={displayAgentName} readOnly className={readOnlyCls} />
                  <p className="text-[10px] text-slate-400 mt-1">Auto from selected pilgrims</p>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            <span className="font-bold text-slate-900">{selectedVisaIds.length}</span> pax
            <span className="mx-2 text-slate-300">|</span>
            <span className="font-mono font-bold text-[#0e2c4c] text-sm">SAR {totalSAR.toLocaleString()}</span>
            {effectiveRate > 0 && (
              <span className="ml-2 text-slate-400 font-mono">≈ PKR {convert(totalSAR, effectiveRate).toLocaleString()}</span>
            )}
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
