import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plane,
  Users,
  Building,
  Copy,
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
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
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Hotel grid sector options — only Makkah / Madina (per owner). */
const HOTEL_SECTOR_OPTIONS = [
  { value: 'MAK', label: 'Makkah' },
  { value: 'MED', label: 'Madina' },
];

/** ISO yyyy-mm-dd -> dd/mm/yyyy for display. */
const fmtDMY = (iso: string): string => {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

/** Package is free text — the agency's own packages, not a fixed list. */
const TRANSPORT_TYPES = ['Car', 'Staria', 'Hiace', 'Coaster', 'Bus'];

const ROOM_TYPES = ['Double', 'Triple', 'Sharing', 'Room', 'Quad'];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/** Common airport IATA codes for the sector datalists. */
const AIRPORT_CODES = [
  'ISB', 'LHE', 'KHI', 'PEW', 'MUX', 'LYP', 'SKT',
  'JED', 'MED', 'RUH', 'DMM', 'AHB', 'TIF',
  'DXB', 'SHJ', 'AUH', 'DWC', 'DOH', 'BAH', 'KWI', 'MCT',
  'IST', 'SAW', 'ESB', 'AYT', 'CAI', 'AMM', 'BEY',
];

export interface FlightLeg {
  from: string;
  depDate: string;
  depHrs: string;
  depMin: string;
  to: string;
  arrDate: string;
  arrHrs: string;
  arrMin: string;
  airline: any;
  flightNo: string;
  pnr: string;
}

export interface HotelRow {
  id: string;
  sector: string;
  remarks: string;
  hotelName: string;
  roomType: string;
  checkIn: string;
  nights: number;
  checkOut: string;
  rateSAR: number;
}

const blankLeg = (): FlightLeg => ({
  from: '',
  depDate: todayStr(),
  depHrs: '00',
  depMin: '00',
  to: '',
  arrDate: todayStr(),
  arrHrs: '00',
  arrMin: '00',
  airline: null,
  flightNo: '',
  pnr: '',
});

const blankHotelRow = (): HotelRow => ({
  id: uid(),
  sector: '',
  remarks: '',
  hotelName: '',
  roomType: 'Double',
  checkIn: todayStr(),
  nights: 0,
  checkOut: todayStr(),
  rateSAR: 0,
});

/** One Oracle flight strip: [Flight: label] Dep sector/date/hrs/min | Arr sector/date/hrs/min | Airline | Flight# | PNR */
const FlightLegRow: React.FC<{
  title: 'Departure' | 'Return';
  leg: FlightLeg;
  setLeg: (l: FlightLeg) => void;
  inputCls: string;
  labelCls: string;
}> = ({ title, leg, setLeg, inputCls, labelCls }) => {
  const set = (patch: Partial<FlightLeg>) => setLeg({ ...leg, ...patch });
  const listId = `airport-codes-${title.toLowerCase()}`;
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-2 p-3 bg-white">
        <div className="col-span-2 sm:col-span-4 lg:col-span-1 flex items-stretch">
          <div className="w-full flex items-center justify-center bg-[#0e2c4c] text-white font-bold text-xs uppercase tracking-wider rounded-lg px-2 py-2.5">
            {title}
          </div>
        </div>
        <div className="lg:col-span-1">
          <label className={labelCls}>{title === 'Departure' ? 'Departure' : 'Dep'}</label>
          <input list={listId} value={leg.from} onChange={(e) => set({ from: e.target.value.toUpperCase() })} placeholder="ISB" className={`${inputCls} font-mono uppercase`} />
        </div>
        <div className="lg:col-span-1">
          <label className={labelCls}>Dep. Date</label>
          <input type="date" value={leg.depDate} onChange={(e) => set({ depDate: e.target.value })} className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className={labelCls}>Hrs</label>
          <select value={leg.depHrs} onChange={(e) => set({ depHrs: e.target.value })} className={`${inputCls} font-mono`}>
            {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Min</label>
          <select value={leg.depMin} onChange={(e) => set({ depMin: e.target.value })} className={`${inputCls} font-mono`}>
            {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="lg:col-span-1">
          <label className={labelCls}>Arrival</label>
          <input list={listId} value={leg.to} onChange={(e) => set({ to: e.target.value.toUpperCase() })} placeholder="JED" className={`${inputCls} font-mono uppercase`} />
        </div>
        <div className="lg:col-span-1">
          <label className={labelCls}>Arr. Date</label>
          <input type="date" value={leg.arrDate} onChange={(e) => set({ arrDate: e.target.value })} className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className={labelCls}>Hrs</label>
          <select value={leg.arrHrs} onChange={(e) => set({ arrHrs: e.target.value })} className={`${inputCls} font-mono`}>
            {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Min</label>
          <select value={leg.arrMin} onChange={(e) => set({ arrMin: e.target.value })} className={`${inputCls} font-mono`}>
            {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-2 lg:col-span-1">
          <AirlineSelect label="Airline" value={leg.airline} onChange={(a) => set({ airline: a })} placeholder="Airline..." />
        </div>
        <div>
          <label className={labelCls}>Flight #</label>
          <input type="text" value={leg.flightNo} onChange={(e) => set({ flightNo: e.target.value })} placeholder="734" className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className={labelCls}>PNR</label>
          <input type="text" value={leg.pnr} onChange={(e) => set({ pnr: e.target.value.toUpperCase() })} placeholder="PNR" maxLength={10} className={`${inputCls} font-mono uppercase`} />
        </div>
      </div>
      <datalist id={listId}>
        {AIRPORT_CODES.map((c) => <option key={c} value={c} />)}
      </datalist>
    </div>
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

  // ---- Row 1: pax qty (readonly) | copy from ----
  const [copyFromId, setCopyFromId] = useState('');

  // ---- Row 2: voucher# (auto) | total nights (readonly) | reference | package | SR rate ----
  const [voucherDate, setVoucherDate] = useState(todayStr());
  const [voucherReference, setVoucherReference] = useState('');
  const [packageText, setPackageText] = useState('');
  const [srRate, setSrRate] = useState('');

  // ---- Row 3: agent (drives pilgrim list) | group head | contact | approved ----
  const [agentId, setAgentId] = useState('');
  const [leaderName, setLeaderName] = useState('');
  const [leaderContact, setLeaderContact] = useState('');

  // ---- Flight legs: Departure + Return (Oracle strips) ----
  const [depLeg, setDepLeg] = useState<FlightLeg>(blankLeg());
  const [retLeg, setRetLeg] = useState<FlightLeg>(blankLeg());

  // ---- Transport detail (hotel) grid — Oracle TRDETAIL ----
  const [hotelRows, setHotelRows] = useState<HotelRow[]>([blankHotelRow(), blankHotelRow()]);

  // ---- Transport section ----
  const [transportBy, setTransportBy] = useState('');
  const [makZiarat, setMakZiarat] = useState('');
  const [makZiaratRate, setMakZiaratRate] = useState('');
  const [tranType, setTranType] = useState('');
  const [transportChargeSAR, setTransportChargeSAR] = useState('');
  const [madZiaratRate, setMadZiaratRate] = useState('');
  const [trip, setTrip] = useState('');
  const [voucherRemarks, setVoucherRemarks] = useState('');

  // ---- Pending passports (Oracle PPASSPORTS): shirka filter + search + select ----
  const [shirkaVendorId, setShirkaVendorId] = useState('');
  const [shirkaId, setShirkaId] = useState('');
  const [selectedVisaIds, setSelectedVisaIds] = useState<string[]>([]);
  const [paxSearch, setPaxSearch] = useState('');
  const [ppOpen, setPpOpen] = useState(true);
  const [flags, setFlags] = useState<Record<string, { wob: boolean; trnsPaid: boolean; going: boolean }>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ---- Carried-through defaults (backend, not in Oracle layout) ----
  const [packageIncludes] = useState<string[]>([...DEFAULT_PACKAGE_INCLUDES]);
  const [makkahStaffName, setMakkahStaffName] = useState('');
  const [makkahStaffPhone, setMakkahStaffPhone] = useState('');
  const [madinaStaffName, setMadinaStaffName] = useState('');
  const [madinaStaffPhone, setMadinaStaffPhone] = useState('');

  // ---- Load data ----
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [vList, visaList, aList, vndList, hList] = await Promise.all([
          fetchVouchers(),
          fetchVisas(),
          fetchAgents(),
          fetchVendors(),
          fetchHotels(),
        ]);
        setVouchers(vList);
        setAvailableVisas(visaList);
        setAgentsList(aList);
        setVendorsMaster(vndList || []);
        setHotelsMaster(hList || []);
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

  // Agent user: lock to own agent. Staff: keep selection.
  useEffect(() => {
    if (isAgent && userProfile?.agentId && !agentId) setAgentId(userProfile.agentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAgent, userProfile]);

  /** Robust agent display name — never show a raw ID like Agent_0170000. */
  const agentDisplayName = (a: any, fallback = ''): string =>
    (a && (a.companyName || a.name || a.agencyName || a.contactPerson || a.agentCode)) || fallback || (a && a.id) || '';

  const agentName = (id: string): string => {
    if (!id) return 'Unassigned';
    const a = agentsList.find((x: any) => x.id === id);
    return agentDisplayName(a, id);
  };

  // ---- Remaining visas: vouchered ones auto-remove ----
  const usedVisaIds = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v: any) => (v.visaIds || []).forEach((id: string) => set.add(id)));
    return set;
  }, [vouchers]);
  const remainingVisas = useMemo(
    () => availableVisas.filter((v) => !usedVisaIds.has(v.id)),
    [availableVisas, usedVisaIds]
  );

  // ---- Pending passports: SIRF selected agent ke, vouchered auto-removed ----
  const pendingList = useMemo(() => {
    if (!agentId) return [];
    let list = remainingVisas.filter((v) => (v.agentId || '') === agentId);
    if (shirkaVendorId) {
      list = list.filter((v) => !v.vendorId || (v.vendorId === shirkaVendorId && (v.shirkaId || '') === (shirkaId || '')));
    }
    const q = paxSearch.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (v) =>
          (v.pilgrimName || '').toUpperCase().includes(q) ||
          (v.passportNumber || '').toUpperCase().includes(q)
      );
    }
    return list;
  }, [remainingVisas, agentId, shirkaVendorId, shirkaId, paxSearch]);

  /** Agent's pending pilgrims BEFORE the shirka filter — for diagnostics. */
  const agentPendingCount = useMemo(() => {
    if (!agentId) return 0;
    return remainingVisas.filter((v) => (v.agentId || '') === agentId).length;
  }, [remainingVisas, agentId]);

  const selectedShirkaName = useMemo(() => {
    if (!shirkaVendorId) return '';
    const vnd: any = (vendorsMaster || []).find((x: any) => x.id === shirkaVendorId);
    if (!vnd) return '';
    const shk = (vnd.shirkas || []).find((s: any) => s.id === shirkaId);
    return shk ? `${vnd.name} — ${shk.name}` : vnd.name;
  }, [vendorsMaster, shirkaVendorId, shirkaId]);

  const selectedVisasData = useMemo(
    () => availableVisas.filter((v) => selectedVisaIds.includes(v.id)),
    [availableVisas, selectedVisaIds]
  );

  const toggleVisa = (id: string) => {
    setSelectedVisaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setFlags((prev) => {
      if (prev[id]) return prev;
      return { ...prev, [id]: { wob: false, trnsPaid: false, going: true } };
    });
  };
  const selectAllPending = () => {
    const ids = pendingList.map((v) => v.id);
    setSelectedVisaIds((prev) => Array.from(new Set([...prev, ...ids])));
    setFlags((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { if (!next[id]) next[id] = { wob: false, trnsPaid: false, going: true }; });
      return next;
    });
  };
  const setFlag = (id: string, key: 'wob' | 'trnsPaid' | 'going', val: boolean) =>
    setFlags((prev) => ({ ...prev, [id]: { ...(prev[id] || { wob: false, trnsPaid: false, going: true }), [key]: val } }));

  // NOTE: selected pilgrims are NEVER auto-deselected — user adds manually,
  // selections persist even if the agent filter changes.

  // ---- Hotel grid editors — rows are CHAINED: each row's check-in is
  // exactly the previous row's check-out. Editing any row re-chains all
  // rows after it. ----
  const rechkRow = (r: HotelRow): HotelRow => ({ ...r, checkOut: addDays(r.checkIn, r.nights || 0) });

  const updateHotelRow = (id: string, patch: Partial<HotelRow>) => {
    setHotelRows((rows) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return rows;
      const next = rows.map((r) => ({ ...r }));
      Object.assign(next[idx], patch);
      next[idx] = rechkRow(next[idx]);
      for (let i = idx + 1; i < next.length; i++) {
        next[i].checkIn = next[i - 1].checkOut;
        next[i] = rechkRow(next[i]);
      }
      return next;
    });
  };
  const addHotelRow = () =>
    setHotelRows((rows) => {
      const last = rows[rows.length - 1];
      const r = blankHotelRow();
      if (last) {
        r.checkIn = last.checkOut;
        r.checkOut = addDays(r.checkIn, r.nights || 0);
      }
      return [...rows, r];
    });
  const delHotelRow = (id: string) =>
    setHotelRows((rows) => {
      if (rows.length <= 1) return rows;
      const idx = rows.findIndex((r) => r.id === id);
      const next = rows.filter((r) => r.id !== id);
      // Re-chain rows after the deleted one
      for (let i = Math.max(0, idx); i < next.length; i++) {
        if (i > 0) next[i].checkIn = next[i - 1].checkOut;
        next[i] = rechkRow(next[i]);
      }
      return next;
    });

  const namedHotelRows = useMemo(() => hotelRows.filter((r) => r.hotelName.trim() !== ''), [hotelRows]);
  const totalNights = useMemo(() => namedHotelRows.reduce((s, r) => s + (r.nights || 0), 0), [namedHotelRows]);
  const hotelsSAR = useMemo(
    () => namedHotelRows.reduce((s, r) => s + (r.nights || 0) * (r.rateSAR || 0), 0),
    [namedHotelRows]
  );
  const transportSAR = useMemo(() => (tranType ? parseFloat(transportChargeSAR) || 0 : 0), [tranType, transportChargeSAR]);
  const totalSAR = hotelsSAR + transportSAR;
  const effectiveRate = parseFloat(srRate) || getCurrentRate('SAR-PKR') || 0;
  const effectivePackageType = packageText.trim();

  const hotelSuggestions = hotelsMaster.filter((h) => h.isActive !== false);

  const cityFromSector = (sector: string): string => {
    const s = (sector || '').toUpperCase();
    if (s.includes('MED') || s.includes('MADINA') || s.includes('MADINAH')) return 'Madinah';
    if (s.includes('JED')) return 'Jeddah';
    return 'Makkah';
  };

  /** Backend sectors: single transport sector from Tran Type + charge. */
  const backendSectors: SectorItem[] = useMemo(() => {
    if (!tranType) return [];
    return [{
      type: 'Arrival',
      date: depLeg.arrDate || todayStr(),
      vehicleType: tranType as any,
      transportRateSAR: transportSAR,
    }];
  }, [tranType, transportSAR, depLeg.arrDate]);

  // ---- Copy From: clone an existing voucher's fields ----
  const handleCopyFrom = (voucherId: string) => {
    setCopyFromId(voucherId);
    if (!voucherId) return;
    const v: any = vouchers.find((x) => x.id === voucherId);
    if (!v) return;
    setLeaderName(v.leaderName || '');
    setLeaderContact(v.leaderContact || '');
    setPackageText(v.packageType || '');
    setTransportBy(v.transportCompany || '');
    setTranType(v.transportType || v.sectors?.[0]?.vehicleType || '');
    setTransportChargeSAR(v.sectors?.[0]?.transportRateSAR ? String(v.sectors[0].transportRateSAR) : '');
    setTrip(v.trip || '');
    setMakZiarat(v.makkahShirka || '');
    setMakZiaratRate(v.makkahZiarat?.rateSAR ? String(v.makkahZiarat.rateSAR) : '');
    setMadZiaratRate(v.madinaZiarat?.rateSAR ? String(v.madinaZiarat.rateSAR) : '');
    setVoucherReference(v.reference || '');
    setVoucherRemarks(v.remarks || '');
    const fd = v.flightDetails;
    const applyLeg = (
      src: any,
      cur: FlightLeg,
      setL: (l: FlightLeg) => void,
      isOutbound: boolean
    ) => {
      if (!src) return;
      const next: FlightLeg = { ...cur };
      const parts = (src.sector || '').split('-');
      next.from = parts[0] || '';
      next.to = parts[1] || '';
      const [h, m] = (src.etd || '00:00').split(':');
      if (isOutbound) {
        next.arrDate = src.date || cur.arrDate;
        next.arrHrs = h || '00'; next.arrMin = m || '00';
      } else {
        next.depDate = src.date || cur.depDate;
        next.depHrs = h || '00'; next.depMin = m || '00';
      }
      next.airline = src.airline || null;
      next.flightNo = src.flightNo || '';
      next.pnr = src.pnr || '';
      setL(next);
    };
    if (fd) {
      applyLeg(fd.arrivalFlight, depLeg, setDepLeg, true);
      applyLeg(fd.departureFlight, retLeg, setRetLeg, false);
    }
    if (Array.isArray(v.hotelStays) && v.hotelStays.length > 0) {
      setHotelRows(
        v.hotelStays.map((h: any) => {
          const nights = h.nights || 0;
          const checkIn = h.checkInDate || todayStr();
          return {
            id: uid(),
            sector: '',
            remarks: h.description || '',
            hotelName: h.hotelName || '',
            roomType: h.bedType || 'Double',
            checkIn,
            nights,
            checkOut: addDays(checkIn, nights),
            rateSAR: h.ratePerNightSAR || 0,
          } as HotelRow;
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
    if (!agentId) {
      showError('Please select an Agent first.');
      return null;
    }
    if (!shirkaVendorId) {
      showError('Please select a Shirka first.');
      return null;
    }
    if (retLeg.depDate && depLeg.arrDate && retLeg.depDate < depLeg.arrDate) {
      showError(`Return departure (${retLeg.depDate}) cannot be before arrival (${depLeg.arrDate}).`);
      return null;
    }
    if (retLeg.depDate) {
      const lateRow = namedHotelRows.find((r) => r.checkOut && r.checkOut > retLeg.depDate);
      if (lateRow) {
        showError(`Hotel checkout (${fmtDMY(lateRow.checkOut)}, ${lateRow.hotelName}) cannot be after the return date (${fmtDMY(retLeg.depDate)}).`);
        return null;
      }
    }
    if (namedHotelRows.length === 0 && !tranType) {
      showError('Please add at least one hotel row (with a name) or select a transport type.');
      return null;
    }

    const passengers = selectedVisasData.map((vv) => {
      const f = flags[vv.id] || { wob: false, trnsPaid: false, going: true };
      return {
        name: vv.pilgrimName,
        passportNumber: vv.passportNumber,
        ageType: 'Adult' as const,
        visaId: vv.id,
        trnsPaid: f.trnsPaid,
        withoutBed: f.wob,
        going: f.going,
      };
    });
    const totalPKR = convert(totalSAR, effectiveRate);

    const legBlock = (leg: FlightLeg, useArrivalSide: boolean): FlightBlockInfo => {
      const date = useArrivalSide ? leg.arrDate : leg.depDate;
      const etd = useArrivalSide ? `${leg.arrHrs}:${leg.arrMin}` : `${leg.depHrs}:${leg.depMin}`;
      const sector = leg.from && leg.to ? `${leg.from}-${leg.to}` : leg.from || leg.to || undefined;
      return {
        airline: leg.airline || null,
        flightNo: leg.flightNo.trim() || undefined,
        date: date || undefined,
        etd: etd || undefined,
        sector,
        pnr: leg.pnr.trim() || undefined,
      };
    };

    const hotelStays: HotelStayItem[] = namedHotelRows.map((r) => ({
      city: cityFromSector(r.sector),
      hotelName: r.hotelName.trim(),
      checkInDate: r.checkIn,
      checkOutDate: r.checkOut,
      nights: r.nights || 0,
      bedType: r.roomType as any,
      roomCount: 1,
      ratePerNightSAR: r.rateSAR || 0,
      totalSAR: (r.nights || 0) * (r.rateSAR || 0),
      description: r.remarks.trim() || undefined,
    }));

    const resolveVendorName = (vendorId: string): string => {
      const vnd: any = (vendorsMaster || []).find((x: any) => x.id === vendorId);
      return vnd ? vnd.name : '';
    };

    return {
      visaIds: selectedVisaIds,
      agentId,
      shirkaVendorId: shirkaVendorId || undefined,
      shirkaId: shirkaId || undefined,
      shirkaName: shirkaVendorId ? resolveVendorName(shirkaVendorId) || undefined : undefined,
      leaderName: leaderName.trim() || undefined,
      leaderContact: leaderContact.trim() || undefined,
      packageType: effectivePackageType || undefined,
      transportCompany: transportBy.trim() || undefined,
      transportType: tranType || undefined,
      trip: trip.trim() || undefined,
      makkahShirka: makZiarat.trim() || undefined,
      makkahZiarat:
        makZiarat.trim() || makZiaratRate
          ? { by: makZiarat.trim() || undefined, costSAR: 0, rateSAR: parseFloat(makZiaratRate) || undefined }
          : undefined,
      madinaZiarat:
        madZiaratRate
          ? { rateSAR: parseFloat(madZiaratRate) || undefined }
          : undefined,
      totalNights,
      reference: voucherReference.trim() || undefined,
      remarks: voucherRemarks.trim() || undefined,
      voucherDate: voucherDate || undefined,
      passengers,
      sectors: backendSectors,
      hotelStays,
      flightDetails: {
        allowFlightInfo: true,
        arrivalFlight: legBlock(depLeg, true),
        departureFlight: legBlock(retLeg, false),
        returnFlight: legBlock(retLeg, true),
        lateIntimationChargesSAR: 0,
      },
      charges: [
        ...hotelStays
          .filter((h) => h.totalSAR > 0)
          .map((h) => ({
            description: `${h.city} - ${h.hotelName} (${h.nights}n @ ${h.ratePerNightSAR} SAR)`,
            category: 'Hotel' as const,
            amountSAR: h.totalSAR,
          })),
        ...(transportSAR > 0
          ? [{
              description: `Transport (${tranType})`,
              category: 'Transport' as const,
              amountSAR: transportSAR,
            }]
          : []),
      ],
      totals: { hotelsSAR, transportSAR, otherSAR: 0, totalSAR, totalPKR, exchangeRate: effectiveRate || undefined },
      commission: { enabled: false, recipientName: '', contact: '', amountSAR: 0, isPaid: false },
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
        packageType: payload.packageType,
        transportCompany: payload.transportCompany,
        transportType: payload.transportType,
        trip: payload.trip,
        makkahShirka: payload.makkahShirka,
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

  const handleAddNew = () => {
    setCopyFromId('');
    setVoucherReference('');
    setPackageText('');
    setLeaderName('');
    setLeaderContact('');
    if (!isAgent) setAgentId('');
    setDepLeg(blankLeg());
    setRetLeg(blankLeg());
    setHotelRows([blankHotelRow(), blankHotelRow()]);
    setTransportBy('');
    setMakZiarat('');
    setMakZiaratRate('');
    setTranType('');
    setTransportChargeSAR('');
    setMadZiaratRate('');
    setTrip('');
    setVoucherRemarks('');
    setSelectedVisaIds([]);
    setPaxSearch('');
    setFlags({});
    setVoucherDate(todayStr());
  };

  const handleSearchFocus = () => {
    setPpOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 150);
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

  const inputCls = 'w-full p-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-900';
  const labelCls = 'block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1';
  const readOnlyCls = 'w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 font-mono';
  const greenLabelCls = 'bg-[#16ec81] text-[#0e2c4c] font-bold text-xs uppercase tracking-wider rounded-lg px-2 py-2.5 text-center';

  return (
    <div className="pb-32">
      <PageHeader
        title="Hotel Voucher"
        subtitle="Fill the form exactly like the register — save when done."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleSearchFocus}>
              <Search className="w-3.5 h-3.5 mr-1" /> Search
            </Button>
            <Button variant="outline" size="sm" onClick={handleAddNew}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/vouchers')}>
              List
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={loading || saving}>
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/vouchers')}>
              Cancel
            </Button>
          </div>
        }
      />

      <div className="px-4 sm:px-6 space-y-4 max-w-7xl mx-auto">
        {loading ? (
          <Card><InlineLoader message="Loading voucher data..." /></Card>
        ) : (
          <>
            {/* ===== ROW 1: Pax QTY | Copy From | Date ===== */}
            <Card className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                <div>
                  <label className={labelCls}>Voucher#</label>
                  <input type="text" value="Auto" readOnly className={readOnlyCls} />
                </div>
              </div>
            </Card>

            {/* ===== ROW 2: Reference | Package | Total Nights | SR Rate ===== */}
            <Card className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Reference</label>
                  <input type="text" value={voucherReference} onChange={(e) => setVoucherReference(e.target.value)} placeholder="Reference no." maxLength={15} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Package / SAR</label>
                  <input
                    type="text" value={packageText}
                    onChange={(e) => setPackageText(e.target.value)}
                    placeholder="Type package name..."
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Total Nights</label>
                  <input type="text" value={String(totalNights)} readOnly className={readOnlyCls} />
                </div>
                <div>
                  <label className={labelCls}>SR Rate</label>
                  <input
                    type="number" min="0" step="0.01" value={srRate}
                    onChange={(e) => setSrRate(e.target.value)}
                    placeholder={`e.g. ${getCurrentRate('SAR-PKR') || 75.5}`}
                    className={`${inputCls} font-mono`}
                  />
                </div>
              </div>
            </Card>

            {/* ===== ROW 3: Agent | Group Head | Contact | Approved ===== */}
            <Card className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className={labelCls}>Agent <span className="text-red-500">*</span></label>
                  <select
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    disabled={isAgent}
                    className={`${inputCls} disabled:bg-slate-100 font-bold text-[#0e2c4c]`}
                  >
                    <option value="">-- Select Agent --</option>
                    {agentsList.map((a: any) => (
                      <option key={a.id} value={a.id}>{agentDisplayName(a, a.id)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Group Head</label>
                  <input type="text" value={leaderName} onChange={(e) => setLeaderName(e.target.value)} placeholder="Leader name" maxLength={50} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Contact</label>
                  <input type="text" value={leaderContact} onChange={(e) => setLeaderContact(e.target.value)} placeholder="Contact number" maxLength={50} className={inputCls} />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <input type="checkbox" disabled className="w-4 h-4 accent-[#0e2c4c]" />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Approved</span>
                </div>
              </div>
            </Card>

            {/* ===== FLIGHT STRIPS: Departure + Return (Oracle layout) ===== */}
            <div className="space-y-3">
              <FlightLegRow title="Departure" leg={depLeg} setLeg={setDepLeg} inputCls={inputCls} labelCls={labelCls} />
              <FlightLegRow title="Return" leg={retLeg} setLeg={setRetLeg} inputCls={inputCls} labelCls={labelCls} />
            </div>

            {/* ===== TRANSPORT DETAIL — hotel grid (Oracle TRDETAIL) ===== */}
            <Card className="p-4">
              <h3 className="flex items-center gap-2 font-bold text-[#0e2c4c] text-sm uppercase tracking-wider mb-3">
                <Building className="w-4 h-4" /> Transport Detail
              </h3>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wide">
                      <th className="text-left p-2 font-bold">Sector</th>
                      <th className="text-left p-2 font-bold">H. Remarks</th>
                      <th className="text-left p-2 font-bold">Hotel</th>
                      <th className="text-left p-2 font-bold">Room Type</th>
                      <th className="text-left p-2 font-bold">Check-In</th>
                      <th className="text-left p-2 font-bold">Nights</th>
                      <th className="text-left p-2 font-bold">Check-Out</th>
                      {!isAgent && <th className="text-left p-2 font-bold">Rate (SAR)</th>}
                      <th className="text-center p-2 font-bold w-20">Add / Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotelRows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="p-1.5">
                          <input
                            type="text" value={row.sector}
                            onChange={(e) => updateHotelRow(row.id, { sector: e.target.value.toUpperCase() })}
                            list="hotel-sector-list"
                            placeholder="MAK / MED" className={`${inputCls} font-mono uppercase !p-1.5`}
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text" value={row.remarks}
                            onChange={(e) => updateHotelRow(row.id, { remarks: e.target.value })}
                            placeholder="Remarks" maxLength={100} className={`${inputCls} !p-1.5`}
                          />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="text" value={row.hotelName}
                            list={`hotel-master-${row.id}`}
                            onChange={(e) => updateHotelRow(row.id, { hotelName: e.target.value })}
                            placeholder="Hotel name" className={`${inputCls} !p-1.5`}
                          />
                          <datalist id={`hotel-master-${row.id}`}>
                            {hotelSuggestions.map((h) => (
                              <option key={h.id} value={h.name}>{h.city || ''}</option>
                            ))}
                          </datalist>
                          <datalist id="hotel-sector-list">
                            {HOTEL_SECTOR_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </datalist>
                        </td>
                        <td className="p-1.5">
                          <select value={row.roomType} onChange={(e) => updateHotelRow(row.id, { roomType: e.target.value })} className={`${inputCls} !p-1.5`}>
                            {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="p-1.5">
                          <input type="date" value={row.checkIn} onChange={(e) => updateHotelRow(row.id, { checkIn: e.target.value })} className={`${inputCls} font-mono !p-1.5`} />
                        </td>
                        <td className="p-1.5">
                          <input
                            type="number" min="0" value={row.nights || ''}
                            onChange={(e) => updateHotelRow(row.id, { nights: parseInt(e.target.value) || 0 })}
                            className={`${inputCls} font-mono text-center !p-1.5`} placeholder="0"
                          />
                        </td>
                        <td className="p-1.5">
                          <input type="text" value={fmtDMY(row.checkOut)} readOnly className={`${readOnlyCls} !p-1.5`} />
                        </td>
                        {!isAgent && (
                          <td className="p-1.5">
                            <input
                              type="number" min="0" step="10" value={row.rateSAR || ''}
                              onChange={(e) => updateHotelRow(row.id, { rateSAR: parseFloat(e.target.value) || 0 })}
                              placeholder="0" className={`${inputCls} font-mono font-bold text-[#0e2c4c] !p-1.5`}
                            />
                          </td>
                        )}
                        <td className="p-1.5">
                          <div className="flex items-center justify-center gap-1">
                            <button type="button" onClick={addHotelRow} title="Add row" className="p-1.5 rounded-lg bg-[#0e2c4c] text-white hover:bg-[#16406e]">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onDoubleClick={() => delHotelRow(row.id)} title="Double-click to delete row" className="p-1.5 rounded-lg bg-white border border-slate-300 text-red-600 hover:bg-red-50">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">Double-click the trash icon to delete a row.</p>
            </Card>

            {/* ===== TRANSPORT SECTION ===== */}
            <Card className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Transport By</label>
                  <select value={transportBy} onChange={(e) => setTransportBy(e.target.value)} className={inputCls}>
                    <option value="">-- Select --</option>
                    {vendorsMaster.filter((v: any) => v.isActive !== false).map((v: any) => (
                      <option key={v.id} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Mak Ziarat</label>
                  <select value={makZiarat} onChange={(e) => setMakZiarat(e.target.value)} className={inputCls}>
                    <option value="">-- Select --</option>
                    {vendorsMaster.filter((v: any) => v.isActive !== false).map((v: any) => (
                      <option key={v.id} value={v.name}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Rate</label>
                  <input type="number" min="0" step="0.01" value={makZiaratRate} onChange={(e) => setMakZiaratRate(e.target.value)} placeholder="Rate" className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label className={labelCls}>Tran Type</label>
                  <select value={tranType} onChange={(e) => setTranType(e.target.value)} className={inputCls}>
                    <option value="">-- Select --</option>
                    {TRANSPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Transport Charge (SAR){isAgent ? ' *' : ''}</label>
                  <input
                    type="number" min="0" step="10" value={transportChargeSAR}
                    onChange={(e) => setTransportChargeSAR(e.target.value)}
                    placeholder={isAgent ? 'Staff adds' : '0'}
                    disabled={isAgent || !tranType}
                    className={`${inputCls} font-mono font-bold text-[#0e2c4c] disabled:bg-slate-100`}
                  />
                </div>
                <div>
                  <label className={labelCls}>Mad Ziarat Rate</label>
                  <input type="number" min="0" step="0.01" value={madZiaratRate} onChange={(e) => setMadZiaratRate(e.target.value)} placeholder="Rate" className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label className={labelCls}>Trip</label>
                  <input
                    type="text" value={trip}
                    onChange={(e) => setTrip(e.target.value)}
                    placeholder="e.g. Jeddah-Makkah-Madinah"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Remarks</label>
                  <input type="text" value={voucherRemarks} onChange={(e) => setVoucherRemarks(e.target.value)} placeholder="Remarks" className={inputCls} />
                </div>
              </div>
            </Card>

            {/* ===== UMRAH DETAIL — selected pilgrims (Oracle UDETAIL) ===== */}
            <Card className="p-4">
              <h3 className="flex items-center gap-2 font-bold text-[#0e2c4c] text-sm uppercase tracking-wider mb-3">
                <Users className="w-4 h-4" /> Umrah Detail — {selectedVisaIds.length} selected
              </h3>
              {selectedVisasData.length === 0 ? (
                <div className="p-6 text-center bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-500">
                  Select from Pending List below
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs min-w-[760px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wide">
                        <th className="text-left p-2 font-bold">Pilgrim Name</th>
                        <th className="text-left p-2 font-bold">Gender</th>
                        <th className="text-left p-2 font-bold">Age</th>
                        <th className="text-left p-2 font-bold">Passport #</th>
                        <th className="text-left p-2 font-bold">Group#</th>
                        <th className="text-center p-2 font-bold">W/o Bed</th>
                        <th className="text-center p-2 font-bold">Trns Paid</th>
                        <th className="text-center p-2 font-bold">Going</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVisasData.map((vv) => {
                        const f = flags[vv.id] || { wob: false, trnsPaid: false, going: true };
                        return (
                          <tr key={vv.id} className="border-t border-slate-100">
                            <td className="p-2 font-bold text-slate-900">{vv.pilgrimName}</td>
                            <td className="p-2 text-slate-600">{vv.gender || '—'}</td>
                            <td className="p-2 text-slate-600 font-mono">{vv.age ?? '—'}</td>
                            <td className="p-2 font-mono text-slate-700">{vv.passportNumber}</td>
                            <td className="p-2 font-mono text-slate-600">{vv.groupCode || '—'}</td>
                            <td className="p-2 text-center">
                              <input type="checkbox" checked={f.wob} onChange={(e) => setFlag(vv.id, 'wob', e.target.checked)} className="w-4 h-4 accent-[#0e2c4c]" />
                            </td>
                            <td className="p-2 text-center">
                              <input type="checkbox" checked={f.trnsPaid} onChange={(e) => setFlag(vv.id, 'trnsPaid', e.target.checked)} className="w-4 h-4 accent-[#0e2c4c]" />
                            </td>
                            <td className="p-2 text-center">
                              <input type="checkbox" checked={f.going} onChange={(e) => setFlag(vv.id, 'going', e.target.checked)} className="w-4 h-4 accent-[#0e2c4c]" />
                            </td>
                            <td className="p-2 text-center">
                              <button type="button" onClick={() => toggleVisa(vv.id)} title="Remove" className="p-1 rounded-lg text-red-600 hover:bg-red-50">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* ===== PENDING PASSPORTS (Oracle PPASSPORTS) ===== */}
            <Card className="p-4">
              <button
                type="button"
                onClick={() => setPpOpen((o) => !o)}
                className="w-full flex items-center justify-between mb-3"
              >
                <h3 className="flex items-center gap-2 font-bold text-[#0e2c4c] text-sm uppercase tracking-wider">
                  <Plane className="w-4 h-4" /> Pending Passports
                  {agentId && <span className="normal-case font-semibold text-slate-500">— {agentName(agentId)}</span>}
                </h3>
                <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${ppOpen ? 'rotate-180' : ''}`} />
              </button>
              {ppOpen && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                    <div className="md:col-span-2">
                      <label className={labelCls}>Shirka <span className="text-red-500">*</span></label>
                      <select
                        value={`${shirkaVendorId}::${shirkaId}`}
                        onChange={(e) => {
                          const [vid, sid] = e.target.value.split('::');
                          setShirkaVendorId(vid || '');
                          setShirkaId(sid || '');
                        }}
                        className={inputCls}
                      >
                        <option value="::">-- Select Shirka (mandatory) --</option>
                        {vendorsMaster.filter((v: any) => v.isActive !== false).map((v: any) => {
                          const shirkas = (v.shirkas || []).filter((s: any) => s.isActive !== false);
                          if (shirkas.length === 0) {
                            return <option key={v.id} value={`${v.id}::`}>{v.name}</option>;
                          }
                          return (
                            <optgroup key={v.id} label={v.name}>
                              {shirkas.map((s: any) => (
                                <option key={s.id} value={`${v.id}::${s.id}`}>{s.name}</option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Passport</label>
                      <input
                        ref={searchInputRef}
                        type="text" value={paxSearch}
                        onChange={(e) => setPaxSearch(e.target.value.toUpperCase())}
                        placeholder="Search name / passport..."
                        className={`${inputCls} font-mono uppercase`}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <button
                        type="button" onClick={selectAllPending}
                        className="px-3 py-2 text-xs font-bold bg-[#0e2c4c] text-white rounded-lg whitespace-nowrap"
                      >
                        Select All
                      </button>
                      <button
                        type="button" onClick={() => setPaxSearch('')}
                        title="Refresh"
                        className="p-2 rounded-lg bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {!agentId ? (
                    <div className="p-6 text-center bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-600">
                      ↑ Select an Agent above first — only that agent's pilgrims show here
                    </div>
                  ) : !shirkaVendorId ? (
                    <div className="p-6 text-center bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-600">
                      ↑ Select a Shirka above first
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                      {pendingList.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500 space-y-2">
                          {!agentId ? (
                            <div>Please select an <span className="font-bold text-[#0e2c4c]">Agent</span> above first — passports appear only after agent selection.</div>
                          ) : agentPendingCount > 0 && shirkaVendorId ? (
                            <>
                              <div>
                                <span className="font-bold text-[#0e2c4c]">{agentPendingCount}</span> pilgrim(s) of {agentName(agentId)} found,
                                but none match Shirka "{selectedShirkaName || 'selected'}".
                              </div>
                              <button
                                type="button"
                                onClick={() => { setShirkaVendorId(''); setShirkaId(''); }}
                                className="px-3 py-1.5 text-xs font-bold bg-white text-[#0e2c4c] border border-[#0e2c4c] rounded-lg"
                              >
                                Show all {agentName(agentId)} pilgrims
                              </button>
                            </>
                          ) : (
                            <div>No pending pilgrims for this agent — vouchered ones are auto-removed.</div>
                          )}
                        </div>
                      ) : (
                        pendingList.map((visa) => {
                          const isSelected = selectedVisaIds.includes(visa.id);
                          return (
                            <div
                              key={visa.id}
                              onClick={() => toggleVisa(visa.id)}
                              className={`px-3 py-2.5 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors border-b border-slate-100 last:border-b-0 ${isSelected ? 'bg-[#0e2c4c]/10' : 'hover:bg-slate-50'}`}
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">{visa.pilgrimName}</div>
                                <div className="text-slate-500 truncate">
                                  Passport: <code className="font-mono">{visa.passportNumber}</code>
                                  {visa.groupCode ? ` • Group: ${visa.groupCode}` : ''}
                                </div>
                              </div>
                              <div className={`w-5 h-5 shrink-0 rounded border flex items-center justify-center ${isSelected ? 'bg-[#0e2c4c] text-white border-[#0e2c4c]' : 'border-slate-300 bg-white'}`}>
                                {isSelected && (
                                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3">
                                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </>
              )}
            </Card>
          </>
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
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
