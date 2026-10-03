import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Building, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Bed, 
  MapPin, 
  Calendar,
  CheckCircle2,
  Clock,
  Plane,
  FileCheck,
  UserCheck,
  ChevronRight,
  Printer,
  Link2,
  X,
  AlertTriangle,
  Check
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { DataTable, Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { AirportSelect, AirlineSelect } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { VoucherPrintDocument, VoucherPrintTheme } from '../components/voucher/VoucherPrintDocument';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { useDeepOpen } from '../hooks/useDeepOpen';
import * as XLSX from 'xlsx';
import { fetchLedgerEntries } from '../services/accountingService';
import { VoucherDoc, SectorItem, HotelStayItem, VoucherChargeItem, VoucherEditPayload, VoucherEditRequest } from '../types/voucher';
import { fetchVouchers, createVoucher, cancelVoucher, markCommissionPaid, approveVoucher, disapproveVoucher } from '../services/voucherService';
import { fetchVisas } from '../services/visaService';
import { fetchHotels, fetchVehicles, fetchVendors } from '../services/masterService';
import {
  fetchEditRequests,
  requestVoucherEdit,
  approveVoucherEdit,
  rejectVoucherEdit,
  applyVoucherEditDirect,
} from '../services/voucherService';
import { fetchCustomers } from '../services/customerService';
import { fetchAgents } from '../services/agentService';
import { HotelDoc, VehicleDoc } from '../types/master';
import { CustomerDoc } from '../types/customer';
import { AgentDoc } from '../types/agent';
import { convert } from '../services/financeService';
import { getCurrentRate } from '../services/exchangeRateService';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export const VouchersPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, error: showError, info } = useToast();
  const { profile: company } = useCompany();
  const canCreate = useCan('Vouchers', 'create');
  const isOwner = role === 'owner';
  const isAgent = role === 'agent';

  const [vouchers, setVouchers] = useState<VoucherDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [groupFilter, setGroupFilter] = useState<string>('');
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);

  // New Voucher Builder Modal / Wizard (4 Steps)
  const [builderOpen, setBuilderOpen] = useState<boolean>(false);
  const [builderStep, setBuilderStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState<boolean>(false);

  // Builder Form State
  const [availableVisas, setAvailableVisas] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<CustomerDoc[]>([]);
  const [agentsList, setAgentsList] = useState<AgentDoc[]>([]);
  const [vendorsMaster, setVendorsMaster] = useState<any[]>([]);

  const [voucherVendorId, setVoucherVendorId] = useState<string>('');
  const [voucherShirkaId, setVoucherShirkaId] = useState<string>(''); // sub-Shirka id ('' = vendor company itself)

  // Pilgrim picker (agent-wise, searchable, multi-select) — no link types
  const [selectedVisaIds, setSelectedVisaIds] = useState<string[]>([]);

  // ---- Shirka-first flow: Shirka is selected BEFORE pax; the picker only shows that Shirka's pax ----
  // (legacy unstamped visas are always shown — they predate Shirka stamping)
  const resolveShirkaName = (vendorId: string, shirkaId: string): string => {
    const vnd: any = (vendorsMaster || []).find((x: any) => x.id === vendorId);
    if (!vnd) return '';
    const shk = (vnd.shirkas || []).find((s: any) => s.id === shirkaId);
    return shk ? `${vnd.name} — ${shk.name}` : vnd.name;
  };

  const [paxSearch, setPaxSearch] = useState<string>('');
  const [paxAgentFilter, setPaxAgentFilter] = useState<string>('all');

  const [hotelsMaster, setHotelsMaster] = useState<HotelDoc[]>([]);
  const [vehiclesMaster, setVehiclesMaster] = useState<VehicleDoc[]>([]);

  // Smart Date Chaining Anchor
  const [arrivalDate, setArrivalDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Sectors state with AirportSelect & AirlineSelect (transport rate starts blank / 0)
  const [sectors, setSectors] = useState<SectorItem[]>([
    { type: 'Arrival', date: new Date().toISOString().split('T')[0], flightNo: '', time: '12:00', vehicleType: undefined, transportRateSAR: 0 }
  ]);

  // Hotel Stays state with smart date chaining (rate starts blank / 0)
  const [hotelStays, setHotelStays] = useState<HotelStayItem[]>([
    { city: 'Makkah', hotelName: '', checkInDate: new Date().toISOString().split('T')[0], checkOutDate: addDays(new Date().toISOString().split('T')[0], 3), nights: 3, bedType: 'Double', roomCount: 1, ratePerNightSAR: 0, totalSAR: 0 }
  ]);

  // KSA ground staff contacts — editable per voucher, prefilled from company defaults
  const [makkahStaffName, setMakkahStaffName] = useState('');
  const [makkahStaffPhone, setMakkahStaffPhone] = useState('');
  const [madinaStaffName, setMadinaStaffName] = useState('');
  const [madinaStaffPhone, setMadinaStaffPhone] = useState('');

  // Compact hotel-stay entry modal (professional small box + description)
  const [stayModalOpen, setStayModalOpen] = useState<boolean>(false);
  const [editingStayIdx, setEditingStayIdx] = useState<number | null>(null);
  const [dCity, setDCity] = useState<string>('Makkah');
  const [dHotelName, setDHotelName] = useState<string>('');
  const [dIsSelfHotel, setDIsSelfHotel] = useState<boolean>(false);
  const [dBedType, setDBedType] = useState<HotelStayItem['bedType']>('Double');
  const [dRate, setDRate] = useState<string>('');
  const [dRoomCount, setDRoomCount] = useState<string>('1');
  const [dCheckIn, setDCheckIn] = useState<string>('');
  const [dNights, setDNights] = useState<string>('3');
  const [dDescription, setDDescription] = useState<string>('');

  const openStayModal = (idx: number | null) => {
    if (idx === null) {
      const lastStay = hotelStays[hotelStays.length - 1];
      setDCheckIn(lastStay ? lastStay.checkOutDate : arrivalDate);
      setDCity(lastStay ? lastStay.city : 'Makkah');
      setDHotelName('');
      setDIsSelfHotel(false);
      setDBedType('Double');
      setDRate('');
      setDRoomCount('1');
      setDNights('3');
      setDDescription('');
    } else {
      const s = hotelStays[idx];
      setDCity(s.city);
      setDHotelName(s.hotelName);
      setDIsSelfHotel(!!s.isSelfHotel);
      setDBedType(s.bedType);
      setDRate(s.ratePerNightSAR ? String(s.ratePerNightSAR) : '');
      setDRoomCount(String(s.roomCount || 1));
      setDCheckIn(s.checkInDate);
      setDNights(String(s.nights || 0));
      setDDescription(s.description || '');
    }
    setEditingStayIdx(idx);
    setStayModalOpen(true);
  };

  const saveStayModal = () => {
    const nights = Math.max(0, parseInt(dNights) || 0);
    const rate = parseFloat(dRate) || 0;
    const rooms = Math.max(1, parseInt(dRoomCount) || 1);
    const checkIn = dCheckIn || arrivalDate;
    const stay: HotelStayItem = {
      city: dCity,
      hotelName: dHotelName.trim(),
      checkInDate: checkIn,
      checkOutDate: addDays(checkIn, nights),
      nights,
      bedType: dBedType,
      roomCount: rooms,
      ratePerNightSAR: rate,
      totalSAR: nights * rate * rooms,
      isSelfHotel: dIsSelfHotel || undefined,
      description: dDescription.trim() || undefined,
    };
    const updated = [...hotelStays];
    if (editingStayIdx === null) {
      updated.push(stay);
    } else {
      updated[editingStayIdx] = stay;
    }
    // Re-chain dates from the changed stay onward
    const from = editingStayIdx === null ? updated.length - 1 : editingStayIdx;
    for (let i = from + 1; i < updated.length; i++) {
      updated[i].checkInDate = updated[i - 1].checkOutDate;
      updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights);
    }
    setHotelStays(updated);
    setStayModalOpen(false);
  };

  const removeStay = (idx: number) => {
    const updated = hotelStays.filter((_, i) => i !== idx);
    for (let i = 0; i < updated.length; i++) {
      updated[i].checkInDate = i === 0 ? arrivalDate : updated[i - 1].checkOutDate;
      updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights);
    }
    setHotelStays(updated);
  };

  // Flight Details Section State
  const [allowFlightInfo, setAllowFlightInfo] = useState<boolean>(false);
  const [depAirline, setDepAirline] = useState<any | null>(null);
  const [depFlightNo, setDepFlightNo] = useState<string>('');
  const [depFrom, setDepFrom] = useState<any | null>(null);
  const [depTo, setDepTo] = useState<any | null>(null);
  const [depDate, setDepDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [depEtd, setDepEtd] = useState<string>('12:00');
  const [depEta, setDepEta] = useState<string>('15:00');

  const [retAirline, setRetAirline] = useState<any | null>(null);
  const [retFlightNo, setRetFlightNo] = useState<string>('');
  const [retFrom, setRetFrom] = useState<any | null>(null);
  const [retTo, setRetTo] = useState<any | null>(null);
  const [retDate, setRetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [retEtd, setRetEtd] = useState<string>('14:00');
  const [retEta, setRetEta] = useState<string>('18:00');

  const [lateIntimationSAR, setLateIntimationSAR] = useState<string>('');

  // Commission state
  const [commissionEnabled, setCommissionEnabled] = useState<boolean>(false);
  const [commissionName, setCommissionName] = useState<string>('');
  const [commissionContact, setCommissionContact] = useState<string>('');
  const [commissionAmount, setCommissionAmount] = useState<string>('');

  // Voucher Detail Review Modal
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  // Voucher edit + approval states
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [editReason, setEditReason] = useState<string>('');
  const [editRequests, setEditRequests] = useState<VoucherEditRequest[]>([]);
  const [reviewModalOpen, setReviewModalOpen] = useState<boolean>(false);
  const [reviewingRequest, setReviewingRequest] = useState<VoucherEditRequest | null>(null);
  const [reviewNote, setReviewNote] = useState<string>('');
  const [voucherPrintTheme, setVoucherPrintTheme] = useState<VoucherPrintTheme>('bw');
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherDoc | null>(null);

  // Deep link: ?open=<voucherNo> opens the exact voucher record
  useDeepOpen(vouchers, (v, ref) => v.voucherNo === ref, (v) => {
    setSelectedVoucher(v);
    setDetailModalOpen(true);
  });

  // Fix #25: global search result click opens the voucher directly
  const location = useLocation() as any;
  React.useEffect(() => {
    const highlight = location?.state?.highlightVoucherNo;
    if (highlight && vouchers.length > 0) {
      const found = vouchers.find(v => v.voucherNo === highlight);
      if (found) {
        setSelectedVoucher(found);
        setDetailModalOpen(true);
        window.history.replaceState({}, document.title);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vouchers]);

  // Verification Lists Modal
  const [verificationModalOpen, setVerificationModalOpen] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vList, visaList, hList, vList2, cList, aList, ledgerList, vndList] = await Promise.all([
        fetchVouchers(),
        fetchVisas(),
        fetchHotels(),
        fetchVehicles(),
        fetchCustomers(),
        fetchAgents(),
        fetchLedgerEntries(),
        fetchVendors(),
      ]);
      setVouchers(vList);
      setAvailableVisas(visaList);
      setHotelsMaster(hList);
      setVehiclesMaster(vList2);
      setCustomersList(cList);
      setAgentsList(aList);
      setLedgerEntries(ledgerList);
      setVendorsMaster(vndList || []);
      setEditRequests(await fetchEditRequests());
    } catch {
      showError('Failed to load vouchers directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute remaining unvouchered visas ("remaining only")
  const usedVisaIds = useMemo(() => {
    const set = new Set<string>();
    vouchers.forEach((v) => {
      if (v.visaIds) {
        v.visaIds.forEach((id) => set.add(id));
      }
    });
    return set;
  }, [vouchers]);

  const remainingVisas = useMemo(() => {
    return availableVisas.filter((v) => !usedVisaIds.has(v.id));
  }, [availableVisas, usedVisaIds]);
  // Pilgrim picker: agent-wise grouping, name/passport search, multi-select
  const pickerAgentName = (agentId: string): string => {
    if (!agentId) return 'Unassigned';
    const a = agentsList.find((x: any) => x.id === agentId);
    return a ? ((a as any).companyName || agentId) : agentId;
  };
  const pickerVisas = useMemo(() => {
    let list = remainingVisas;
    if (editingVoucherId) {
      const editing = vouchers.find((x) => x.id === editingVoucherId);
      const ownIds = new Set(editing?.visaIds || []);
      const own = availableVisas.filter((v) => ownIds.has(v.id) && !list.some((r) => r.id === v.id));
      list = [...own, ...list];
    }
    if (isAgent && userProfile?.agentId) list = list.filter((v) => v.agentId === userProfile.agentId);
    if (paxAgentFilter !== 'all') list = list.filter((v) => (v.agentId || '') === paxAgentFilter);
    if (voucherVendorId) {
      list = list.filter((v) => !v.vendorId || (v.vendorId === voucherVendorId && (v.shirkaId || '') === voucherShirkaId));
    }
    const q = paxSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((v) =>
        (v.pilgrimName || '').toLowerCase().includes(q) ||
        (v.passportNumber || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [remainingVisas, isAgent, userProfile, paxAgentFilter, paxSearch, editingVoucherId, vouchers, availableVisas, voucherVendorId, voucherShirkaId]);
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
  const toggleVisa = (id: string) => {
    setSelectedVisaIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const selectPickerIds = (ids: string[]) => {
    setSelectedVisaIds((prev) => Array.from(new Set([...prev, ...ids])));
  };
  const deselectPickerIds = (ids: string[]) => {
    setSelectedVisaIds((prev) => prev.filter((x) => !ids.includes(x)));
  };


  const openBuilder = () => {
    setBuilderStep(1);
    setEditingVoucherId(null);
    setEditReason('');
    setVoucherShirkaId('');
    setSelectedVisaIds([]);
    setPaxSearch('');
    setPaxAgentFilter('all');
    setArrivalDate(new Date().toISOString().split('T')[0]);
    setSectors([{ type: 'Arrival', date: new Date().toISOString().split('T')[0], flightNo: '', time: '12:00', vehicleType: undefined, transportRateSAR: 0 }]);
    setHotelStays([{ city: 'Makkah', hotelName: '', checkInDate: new Date().toISOString().split('T')[0], checkOutDate: addDays(new Date().toISOString().split('T')[0], 3), nights: 3, bedType: 'Double', roomCount: 1, ratePerNightSAR: 0, totalSAR: 0 }]);
    setAllowFlightInfo(false);
    setDepAirline(null);
    setDepFlightNo('');
    setDepFrom(null);
    setDepTo(null);
    setRetAirline(null);
    setRetFlightNo('');
    setRetFrom(null);
    setRetTo(null);
    setLateIntimationSAR('');
    setCommissionEnabled(false);
    setCommissionName('');
    setCommissionContact('');
    setCommissionAmount('');
    setMakkahStaffName(company?.makkahStaffName || '');
    setMakkahStaffPhone(company?.makkahStaffPhone || '');
    setMadinaStaffName(company?.madinaStaffName || '');
    setMadinaStaffPhone(company?.madinaStaffPhone || '');
    setBuilderOpen(true);
  };

  /** Open the builder in EDIT mode, pre-filled from the voucher. */
  const openEditVoucher = (v: VoucherDoc) => {
    if (v.status === 'Cancelled') {
      showError('Cancelled vouchers cannot be edited.');
      return;
    }
    const fd = v.flightDetails as any;
    setEditingVoucherId(v.id);
    setEditReason('');
    setSelectedVisaIds([...(v.visaIds || [])]);
    setPaxSearch('');
    setPaxAgentFilter('all');
    setVoucherVendorId((v as any).shirkaVendorId || '');
    setVoucherShirkaId((v as any).shirkaId || '');
    setArrivalDate(v.sectors?.[0]?.date || new Date().toISOString().split('T')[0]);
    setSectors(JSON.parse(JSON.stringify(v.sectors || [])));
    setMakkahStaffName(v.makkahStaffName || company?.makkahStaffName || '');
    setMakkahStaffPhone(v.makkahStaffPhone || company?.makkahStaffPhone || '');
    setMadinaStaffName(v.madinaStaffName || company?.madinaStaffName || '');
    setMadinaStaffPhone(v.madinaStaffPhone || company?.madinaStaffPhone || '');
    setHotelStays(JSON.parse(JSON.stringify(v.hotelStays || [])));
    setAllowFlightInfo(!!fd?.allowFlightInfo);
    setDepAirline(fd?.departureFlight?.airline || null);
    setDepFlightNo(fd?.departureFlight?.flightNo || '');
    setDepFrom(fd?.departureFlight?.fromAirport || null);
    setDepTo(fd?.departureFlight?.toAirport || null);
    setDepDate(fd?.departureFlight?.date || new Date().toISOString().split('T')[0]);
    setDepEtd(fd?.departureFlight?.etd || '12:00');
    setDepEta(fd?.departureFlight?.eta || '15:00');
    setRetAirline(fd?.returnFlight?.airline || null);
    setRetFlightNo(fd?.returnFlight?.flightNo || '');
    setRetFrom(fd?.returnFlight?.fromAirport || null);
    setRetTo(fd?.returnFlight?.toAirport || null);
    setRetDate(fd?.returnFlight?.date || new Date().toISOString().split('T')[0]);
    setRetEtd(fd?.returnFlight?.etd || '14:00');
    setRetEta(fd?.returnFlight?.eta || '18:00');
    setLateIntimationSAR(fd?.lateIntimationChargesSAR ? String(fd.lateIntimationChargesSAR) : '');
    setCommissionEnabled(!!v.commission?.enabled);
    setCommissionName(v.commission?.recipientName || '');
    setCommissionContact(v.commission?.contact || '');
    setCommissionAmount(v.commission?.amountSAR ? String(v.commission.amountSAR) : '');
    setBuilderStep(1);
    setBuilderOpen(true);
  };

  // Valid hotel stays & sectors (excluding zero/empty lines)
  const validHotelStays = useMemo(() => {
    return hotelStays.filter(h => h.hotelName && h.hotelName.trim() !== '' && (h.ratePerNightSAR || 0) > 0);
  }, [hotelStays]);

  const validSectors = useMemo(() => {
    return sectors.filter(s => (s.transportRateSAR || 0) > 0);
  }, [sectors]);

  // Rows saved on the voucher document (even with zero charge); only amount > 0 rows post charge lines.
  const namedHotelStays = useMemo(() => {
    return hotelStays.filter(h => h.hotelName && h.hotelName.trim() !== '');
  }, [hotelStays]);

  const sectorsWithTransport = useMemo(() => {
    return sectors.filter(s => s.vehicleType || s.isSelfGari);
  }, [sectors]);

  const hotelsSAR = useMemo(() => validHotelStays.reduce((sum, h) => sum + (h.totalSAR || 0), 0), [validHotelStays]);
  const transportSAR = useMemo(() => validSectors.reduce((sum, s) => sum + (s.transportRateSAR || 0), 0), [validSectors]);
  const lateIntimation = parseFloat(lateIntimationSAR) || 0;
  const totalSAR = hotelsSAR + transportSAR + lateIntimation;

  /** Validate builder state and construct the voucher payload (used by create + edit). */
  const buildVoucherPayload = (): VoucherEditPayload | null => {
    // Pilgrim selection required
    if (selectedVisaIds.length === 0) {
      showError('Please select at least one pilgrim for this voucher.');
      return null;
    }

    // Shirka-first: a Shirka must be selected before pax (mixing is impossible — picker is pre-filtered)
    if (!voucherVendorId) {
      showError('Please select a Shirka first (Step 1).');
      return null;
    }

    const missingVehicle = sectors.filter(s => !s.vehicleType && !s.isSelfGari);
    if (missingVehicle.length > 0) {
      showError('Transport rule: every sector needs a vehicle selected, or mark Self Gari.');
      return null;
    }

    // Fix #32: commission contact number is required when commission is enabled
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
    // Voucher agent: the single agent all selected pax belong to (undefined when mixed)
    const paxAgents = Array.from(new Set(selectedVisasData.map((v) => v.agentId).filter(Boolean)));
    const voucherAgentId = paxAgents.length === 1 ? paxAgents[0] : undefined;

    const totalPKR = convert(totalSAR, getCurrentRate('SAR-PKR'));

    return {
      visaIds: selectedVisaIds,
      agentId: voucherAgentId,
      shirkaVendorId: voucherVendorId || undefined,
      shirkaId: voucherShirkaId || undefined,
      shirkaName: voucherVendorId ? resolveShirkaName(voucherVendorId, voucherShirkaId) || undefined : undefined,
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
          ...validHotelStays.map((h) => ({ description: `${h.city} - ${h.hotelName} (${h.nights}n @ ${h.ratePerNightSAR} SAR)`, category: 'Hotel' as const, amountSAR: h.totalSAR })),
          ...validSectors.map((s) => ({ description: `${s.type} Sector (${s.vehicleType || 'Transport'})`, category: 'Transport' as const, amountSAR: s.transportRateSAR || 0 })),
          ...(lateIntimation > 0 ? [{ description: 'Late Intimation Charges', category: 'Other' as const, amountSAR: lateIntimation }] : [])
        ],
        totals: {
          hotelsSAR,
          transportSAR,
          otherSAR: lateIntimation,
          totalSAR,
          totalPKR,
        },
        commission: {
          enabled: commissionEnabled,
          recipientName: commissionName.trim(),
          contact: commissionContact.trim(),
          amountSAR: parseFloat(commissionAmount) || 0,
          isPaid: false,
        },
      };
  };

  const handleSaveVoucher = async () => {
    if (!userProfile) return;
    const payload = buildVoucherPayload();
    if (!payload) return;

    // ---- EDIT MODE ----
    if (editingVoucherId) {
      const target = vouchers.find((v) => v.id === editingVoucherId);
      if (!target) {
        showError('Voucher not found.');
        return;
      }
      if (role !== 'owner' && !editReason.trim()) {
        showError('Please write a reason for this edit request.');
        return;
      }
      setSaving(true);
      try {
        if (role === 'owner') {
          await applyVoucherEditDirect(userProfile, editingVoucherId, payload);
          success(`Voucher ${target.voucherNo} updated — old charges reversed, new charges posted to ledger.`);
        } else {
          await requestVoucherEdit(userProfile, target, payload, editReason);
          success(`Edit request for ${target.voucherNo} sent to owner for approval.`);
        }
        setBuilderOpen(false);
        setEditingVoucherId(null);
        setEditReason('');
        setDetailModalOpen(false);
        setSelectedVoucher(null);
        await loadData();
      } catch (err: any) {
        showError(err?.message || 'Failed to save voucher edit.');
      } finally {
        setSaving(false);
      }
      return;
    }

    // ---- CREATE MODE ----
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
      });

      success('Unified trip voucher created successfully and posted to ledger.');
      setBuilderOpen(false);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to create voucher.');
    } finally {
      setSaving(false);
    }
  };

  const visaGroupMap = useMemo(() => {
    const m = new Map<string, string>();
    availableVisas.forEach(v => m.set(v.id, v.groupCode || ''));
    return m;
  }, [availableVisas]);

  const voucherGroupCode = (v: VoucherDoc): string => {
    for (const id of v.visaIds || []) {
      const g = visaGroupMap.get(id);
      if (g) return g;
    }
    return '';
  };

  const agentNameFor = (v: VoucherDoc): string => {
    if (v.linkType === 'agent') return agentsList.find(a => a.id === v.agentId)?.companyName || '';
    if (v.linkType === 'customer') return 'Direct';
    return '';
  };

  const filteredVouchers = vouchers.filter((v) => {
    if (statusFilter !== 'all' && v.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
    if (agentFilter !== 'all' && v.agentId !== agentFilter) return false;
    if (groupFilter.trim() && !voucherGroupCode(v).toLowerCase().includes(groupFilter.trim().toLowerCase())) return false;
    const d = (v.createdAt || '').split('T')[0];
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const paxMatch = v.passengers.some(p => p.name.toLowerCase().includes(q) || p.passportNumber.toLowerCase().includes(q));
      return v.voucherNo.toLowerCase().includes(q) || paxMatch;
    }
    return true;
  });

  const handleMarkCommissionPaid = async () => {
    if (!selectedVoucher || !confirm(`Mark commission of SAR ${selectedVoucher.commission.amountSAR} as paid?`)) return;
    try {
      await markCommissionPaid(userProfile!, selectedVoucher.id);
      await loadData();
      const updated = (await fetchVouchers()).find(v => v.id === selectedVoucher.id);
      if (updated) setSelectedVoucher(updated);
      success('Commission marked as paid.');
    } catch {
      showError('Failed to mark commission paid.');
    }
  };

  const paxCounts = (v: VoucherDoc) => ({
    adults: v.passengers.filter(p => p.ageType === 'Adult').length,
    children: v.passengers.filter(p => p.ageType === 'Child').length,
    infants: v.passengers.filter(p => p.ageType === 'Infant').length,
  });

  const exportFilteredExcel = () => {
    const rows = filteredVouchers.map(v => {
      const pc = paxCounts(v);
      return {
        'Voucher No': v.voucherNo,
        'Link Type': v.linkType.toUpperCase(),
        'Agent / Customer': v.linkType === 'agent' ? agentNameFor(v) : (customersList.find(c => c.id === v.customerId)?.fullName || ''),
        'Group Code': voucherGroupCode(v),
        'Adults': pc.adults,
        'Children': pc.children,
        'Infants': pc.infants,
        'Total SAR': v.totals.totalSAR,
        'Total PKR': Math.round(v.totals.totalPKR),
        'Status': v.status,
        'Created': (v.createdAt || '').split('T')[0],
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Vouchers');
    XLSX.writeFile(wb, `vouchers-list-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadVerificationList = (kind: 'created' | 'pending') => {
    let list = vouchers.filter(v => kind === 'created' ? v.status === 'Confirmed' : (v.status === 'Draft' || v.status === 'Pending Approval'));
    if (isAgent && userProfile?.agentId) list = list.filter(v => v.agentId === userProfile.agentId);
    const rows: Record<string, string>[] = [];
    list.forEach(v => {
      v.passengers.forEach(px => {
        rows.push({
          'Passenger Name': px.name,
          'Passport Number': px.passportNumber,
          'Group Code': voucherGroupCode(v),
          'Agent': agentNameFor(v),
          'Voucher No': v.voucherNo,
        });
      });
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), kind === 'created' ? 'Vouchers Created' : 'Vouchers Pending');
    XLSX.writeFile(wb, `vouchers-${kind}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const columns: Column<VoucherDoc>[] = [
    {
      key: 'voucherNo',
      header: 'Voucher No & Link',
      render: (row) => (
        <div>
          <div className="font-mono font-bold text-[#0e2c4c] text-xs">{row.voucherNo}</div>
          <div className="text-[10px] text-slate-500 uppercase font-semibold">
            Link: {row.linkType} • {row.passengers.length} Pax
          </div>
        </div>
      ),
    },
    {
      key: 'passengers',
      header: 'Primary Passenger',
      render: (row) => (
        <div>
          <div className="font-bold text-slate-900 text-xs">{row.passengers[0]?.name || 'Group'}</div>
          <div className="text-[11px] font-mono text-slate-500">{row.passengers[0]?.passportNumber}</div>
        </div>
      ),
    },
    {
      key: 'link',
      header: 'Agent / Customer',
      render: (row) => {
        if (row.linkType === 'agent') {
          return (
            <div className="text-xs">
              <div className="font-bold text-slate-900">{agentNameFor(row) || row.agentId}</div>
              <div className="text-[10px] text-sky-700 uppercase font-semibold">B2B Agent</div>
            </div>
          );
        }
        if (row.linkType === 'customer') {
          return (
            <div className="text-xs">
              <div className="font-bold text-slate-900">{customersList.find(c => c.id === row.customerId)?.fullName || '—'}</div>
              <div className="text-[10px] text-emerald-700 uppercase font-semibold">B2C Customer</div>
            </div>
          );
        }
        return <div className="text-[10px] text-slate-500 uppercase font-semibold">Visa-linked</div>;
      },
    },
    {
      key: 'pax',
      header: 'Pax Breakup',
      render: (row) => {
        const pc = paxCounts(row);
        return (
          <div className="text-xs font-mono text-slate-800">
            <span className="text-slate-900 font-bold">A:{pc.adults}</span>
            {' '}C:{pc.children} I:{pc.infants}
          </div>
        );
      },
    },
    {
      key: 'hotels',
      header: 'Hotel Stays',
      render: (row) => (
        <div className="text-xs text-slate-700">
          {row.hotelStays.map((h, i) => (
            <div key={i}><strong>{h.city}:</strong> {h.hotelName} ({h.nights}n)</div>
          ))}
        </div>
      ),
    },
    {
      key: 'totals',
      header: 'Total Amount',
      render: (row) => (
        <div>
          <div className="font-mono font-bold text-slate-900 text-xs">SAR {row.totals.totalSAR.toLocaleString()}</div>
          <div className="text-[10px] font-mono text-slate-500">PKR {Math.round(row.totals.totalPKR).toLocaleString()}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'Confirmed' ? 'success' : row.status === 'Cancelled' ? 'danger' : row.status === 'Pending Approval' ? 'warning' : 'gold'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setSelectedVoucher(row); setDetailModalOpen(true); }}
          >
            View Itinerary
          </Button>
          {isOwner && row.status === 'Pending Approval' && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  try {
                    await approveVoucher(userProfile!, row.id);
                    success(`Voucher ${row.voucherNo} approved & posted to ledger.`);
                    await loadData();
                  } catch (e: any) { showError(e.message); }
                }}
              >
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const note = prompt('Disapproval note for the creator (optional):') || '';
                  try {
                    await disapproveVoucher(userProfile!, row.id, note);
                    info(`Voucher ${row.voucherNo} sent back to draft.`);
                    await loadData();
                  } catch (e: any) { showError(e.message); }
                }}
              >
                Disapprove
              </Button>
            </>
          )}
          {isOwner && row.status !== 'Cancelled' && (
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                await cancelVoucher(userProfile!, row.id);
                success('Voucher cancelled.');
                await loadData();
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="space-y-6 print:hidden">
      <PageHeader
        title="Umrah Trip & Hotel Vouchers"
        subtitle="Manage unified Umrah vouchers with remaining visa filtering, multi-link options, flight details section, and manual rate entry."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Vouchers' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVerificationModalOpen(true)}
            >
              Verification Lists
            </Button>
            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={openBuilder}
                className="bg-[#0e2c4c] hover:bg-[#1a4473]"
              >
                + New Voucher
              </Button>
            )}
          </div>
        }
      />

      {/* Pending edit approvals (owner) */}
      {role === 'owner' && editRequests.filter((r) => r.status === 'pending').length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-amber-900 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Voucher Edit Approvals ({editRequests.filter((r) => r.status === 'pending').length} pending)
            </h4>
          </div>
          <div className="space-y-2">
            {editRequests.filter((r) => r.status === 'pending').map((r) => {
              const v = vouchers.find((x) => x.id === r.voucherId);
              return (
                <div key={r.id} className="bg-white border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900">
                      {r.voucherNo}
                      {v && (
                        <span className="ml-2 font-mono font-semibold text-slate-500">
                          SAR {v.totals.totalSAR.toLocaleString()} → SAR {r.newData.totals.totalSAR.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      Requested by <strong>{r.requestedByName}</strong> ({r.requestedByRole}) • {r.requestedAt.split('T')[0]}
                    </div>
                    <div className="text-slate-500 italic mt-0.5 truncate" title={r.reason}>
                      "{r.reason}"
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReviewingRequest(r);
                        setReviewNote('');
                        setReviewModalOpen(true);
                      }}
                    >
                      Review
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={async () => {
                        if (!userProfile) return;
                        if (!window.confirm(`Approve edit for ${r.voucherNo}? Old charges will be reversed and new charges posted.`)) return;
                        try {
                          await approveVoucherEdit(userProfile, r.id);
                          success(`Edit approved for ${r.voucherNo}.`);
                          await loadData();
                        } catch (err: any) {
                          showError(err?.message || 'Approval failed.');
                        }
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-rose-600 border-rose-300 hover:bg-rose-50"
                      onClick={async () => {
                        if (!userProfile) return;
                        const note = window.prompt(`Reject edit request for ${r.voucherNo}? Optional note:`) || '';
                        try {
                          await rejectVoucherEdit(userProfile, r.id, note);
                          success(`Edit request for ${r.voucherNo} rejected.`);
                          await loadData();
                        } catch (err: any) {
                          showError(err?.message || 'Rejection failed.');
                        }
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <Card padding="md" className="border-slate-200 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voucher number, passenger name, or passport..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none"
            />
          </div>
          <div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From date"
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
            />
          </div>
          <div>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="To date"
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
            />
          </div>
          <div>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
            >
              <option value="all">All Agents</option>
              {agentsList.map(a => <option key={a.id} value={a.id}>{a.companyName}</option>)}
            </select>
          </div>
          <div>
            <input
              type="text"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              placeholder="Group code..."
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none"
            />
          </div>
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Draft">Draft</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-semibold">
            {filteredVouchers.length} of {vouchers.length} vouchers • SAR {filteredVouchers.reduce((s, v) => s + v.totals.totalSAR, 0).toLocaleString()}
          </div>
          <Button variant="outline" onClick={exportFilteredExcel} disabled={filteredVouchers.length === 0}>
            Export Excel (.xlsx)
          </Button>
        </div>
      </Card>

      {/* Vouchers Table */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredVouchers}
          keyExtractor={(v) => v.id}
          loading={loading}
          emptyTitle="No vouchers found"
          emptyDescription="Create your first unified trip voucher using the builder."
        />
      </Card>

      {/* New Voucher Builder Modal / Wizard */}
      <Modal
        isOpen={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title={editingVoucherId ? `Edit Voucher ${vouchers.find((v) => v.id === editingVoucherId)?.voucherNo || ''}` : 'Unified Trip Voucher Builder'}
        subtitle={editingVoucherId ? `Step ${builderStep} of 4 • ${role === 'owner' ? 'Changes apply directly with ledger reversal + reposting.' : 'Your changes will be sent to the owner for approval.'}` : `Step ${builderStep} of 4 • Configure linking rules, flight details, hotel stays, and charges.`}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <div>
              {builderStep > 1 && (
                <Button variant="outline" size="sm" onClick={() => setBuilderStep((builderStep - 1) as any)}>
                  Back
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setBuilderOpen(false)}>Cancel</Button>
              {builderStep < 4 ? (
                <Button variant="primary" size="sm" onClick={() => setBuilderStep((builderStep + 1) as any)} disabled={builderStep === 1 && !voucherVendorId} className="bg-[#0e2c4c] disabled:opacity-40" title={builderStep === 1 && !voucherVendorId ? 'Pehle Shirka select karein' : ''}>
                  Next Step
                </Button>
              ) : editingVoucherId ? (
                <Button variant="primary" size="sm" onClick={handleSaveVoucher} loading={saving} className="bg-amber-600 hover:bg-amber-700 text-white font-bold">
                  {role === 'owner' ? 'Save Changes' : 'Request Edit Approval'}
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleSaveVoucher} loading={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  Confirm & Post Voucher
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="py-2">
          {/* Step 1: Select Pilgrims — agent-wise, searchable, multi-select */}
          {builderStep === 1 && (
            <div className="space-y-4">
              {/* Step 1a: Shirka FIRST — mandatory, picker filters on it */}
              <div className="p-4 bg-[#0e2c4c]/5 border-2 border-[#0e2c4c]/25 rounded-xl">
                <label className="block text-sm font-bold text-[#0e2c4c] mb-1">
                  Step 1: Select Shirka <span className="text-red-500">*</span>
                </label>
                <p className="text-[11px] text-slate-500 mb-2">Select the Shirka first — only that Shirka's pilgrims will appear below.</p>
                <select
                  value={`${voucherVendorId}::${voucherShirkaId}`}
                  onChange={(e) => {
                    const [vid, sid] = e.target.value.split('::');
                    setVoucherVendorId(vid || '');
                    setVoucherShirkaId(sid || '');
                    // Prune selected pax that don't belong to the newly selected Shirka
                    if (vid) {
                      setSelectedVisaIds((prev) => prev.filter((id) => {
                        const vv = availableVisas.find((x) => x.id === id);
                        if (!vv || !vv.vendorId) return true;
                        return vv.vendorId === vid && (vv.shirkaId || '') === (sid || '');
                      }));
                    }
                  }}
                  className="w-full sm:w-96 p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  <option value="::">-- Select Shirka (mandatory) --</option>
                  {vendorsMaster.filter((v: any) => v.isActive !== false).map((v: any) => {
                    const shirkas = (v.shirkas || []).filter((s: any) => s.isActive !== false);
                    if (shirkas.length === 0) {
                      return <option key={v.id} value={`${v.id}::`}>{v.name}{v.vendorCode ? ` (${v.vendorCode})` : ''}</option>;
                    }
                    return (
                      <optgroup key={v.id} label={`${v.name}${v.vendorCode ? ` (${v.vendorCode})` : ''}`}>
                        {shirkas.map((s: any) => (
                          <option key={s.id} value={`${v.id}::${s.id}`}>{s.name} — run by {s.operatorName}</option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              {editingVoucherId && role !== 'owner' && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl">
                  <label className="block text-xs font-bold text-amber-800 uppercase tracking-wider mb-1.5">
                    Reason for edit request *
                  </label>
                  <textarea
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    rows={2}
                    placeholder="e.g. Hotel changed from X to Y, 2 extra nights added..."
                    className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs resize-none"
                  />
                  <p className="text-[11px] text-amber-700 mt-1">The owner will review and approve this edit before it applies.</p>
                </div>
              )}
              {(!editingVoucherId && !voucherVendorId) ? (
                <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl">
                  <div className="text-sm font-bold text-slate-700">↑ Pehle upar se Shirka select karein</div>
                  <div className="text-[11px] text-slate-500 mt-1">Uske baad sirf usi Shirka ke pilgrims ki list yahan ayegi.</div>
                </div>
              ) : (
              <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Step 2: Select Pilgrims{voucherVendorId ? ` — ${resolveShirkaName(voucherVendorId, voucherShirkaId)}` : ''}</h4>
                  <p className="text-[11px] text-slate-500">
                    {remainingVisas.length} pax available (distributed visas without a voucher yet). Pick agent-wise, search by name or passport, select multiple.
                  </p>
                </div>
                <span className="text-xs font-bold bg-[#0e2c4c] text-white px-3 py-1.5 rounded-full whitespace-nowrap">
                  {selectedVisaIds.length} selected
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={paxAgentFilter}
                  onChange={(e) => setPaxAgentFilter(e.target.value)}
                  className="sm:w-52 p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                >
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
                    className="w-full p-2.5 pl-9 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
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
                      ? 'No remaining unvouchered visas available. All distributed visas have vouchers!'
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
                                  {(visa.shirkaName || visa.vendorId) ? (
                                    <span className="ml-1 font-bold text-amber-700">• {visa.shirkaName || (vendorsMaster.find((x: any) => x.id === visa.vendorId)?.name || '')}</span>
                                  ) : null}
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
            </div>
          )}

          {/* Step 2: Smart Date Chaining, Flight Details Section, Transport Sectors & Hotel Stays with Manual Blank Rates */}
          {builderStep === 2 && (
            <div className="space-y-6">
              {/* Smart Date Chaining Anchor */}
              <div className="p-4 bg-[#0e2c4c]/5 border border-[#0e2c4c]/20 rounded-xl space-y-2">
                <label className="block text-xs font-bold text-[#0e2c4c] uppercase tracking-wider">Trip Arrival Date (Smart Chain Anchor)</label>
                <input
                  type="date"
                  value={arrivalDate}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setArrivalDate(newDate);
                    if (hotelStays.length > 0) {
                      const updated = [...hotelStays];
                      updated[0].checkInDate = newDate;
                      updated[0].checkOutDate = addDays(newDate, updated[0].nights);
                      for (let i = 1; i < updated.length; i++) {
                        updated[i].checkInDate = updated[i - 1].checkOutDate;
                        updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights);
                      }
                      setHotelStays(updated);
                    }
                  }}
                  className="w-full sm:w-64 p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-[#0e2c4c]"
                />
                <div className="text-[11px] text-slate-500">Changing arrival date automatically shifts and chains subsequent hotel check-in/check-out dates.</div>
              </div>

              {/* Flight Details Section */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Plane className="w-4 h-4 text-[#0e2c4c]" />
                      <span>Flight Details (Departure & Return)</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">Optional carrier and flight schedule tracking.</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={allowFlightInfo}
                      onChange={(e) => setAllowFlightInfo(e.target.checked)}
                      className="rounded text-[#0e2c4c]"
                    />
                    <span className="text-xs font-bold text-slate-800">Allow Flight Information</span>
                  </label>
                </div>

                <fieldset disabled={!allowFlightInfo} className={`space-y-4 ${!allowFlightInfo ? 'opacity-50' : ''}`}>
                  {/* Departure Flight Block */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <span className="font-bold text-[#0e2c4c] text-xs uppercase block tracking-wider">Departure Flight Block</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div>
                        <AirlineSelect
                          label="Flight (Airline)"
                          value={depAirline}
                          onChange={setDepAirline}
                          placeholder="Select airline..."
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">No (Flight Number)</label>
                        <input
                          type="text"
                          value={depFlightNo}
                          onChange={(e) => setDepFlightNo(e.target.value)}
                          placeholder="e.g. SV-734"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div>
                        <AirportSelect
                          label="FROM Airport"
                          value={depFrom}
                          onChange={setDepFrom}
                          placeholder="Origin..."
                        />
                      </div>
                      <div>
                        <AirportSelect
                          label="TO Airport"
                          value={depTo}
                          onChange={setDepTo}
                          placeholder="Destination..."
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Date</label>
                        <input
                          type="date"
                          value={depDate}
                          onChange={(e) => setDepDate(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">ETD (Time)</label>
                        <input
                          type="time"
                          value={depEtd}
                          onChange={(e) => setDepEtd(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">ETA (Time)</label>
                        <input
                          type="time"
                          value={depEta}
                          onChange={(e) => setDepEta(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Return Flight Block */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <span className="font-bold text-[#0e2c4c] text-xs uppercase block tracking-wider">Return Flight Block</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div>
                        <AirlineSelect
                          label="Flight (Airline)"
                          value={retAirline}
                          onChange={setRetAirline}
                          placeholder="Select airline..."
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">No (Flight Number)</label>
                        <input
                          type="text"
                          value={retFlightNo}
                          onChange={(e) => setRetFlightNo(e.target.value)}
                          placeholder="e.g. SV-735"
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div>
                        <AirportSelect
                          label="FROM Airport"
                          value={retFrom}
                          onChange={setRetFrom}
                          placeholder="Origin..."
                        />
                      </div>
                      <div>
                        <AirportSelect
                          label="TO Airport"
                          value={retTo}
                          onChange={setRetTo}
                          placeholder="Destination..."
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Date</label>
                        <input
                          type="date"
                          value={retDate}
                          onChange={(e) => setRetDate(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">ETD (Time)</label>
                        <input
                          type="time"
                          value={retEtd}
                          onChange={(e) => setRetEtd(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">ETA (Time)</label>
                        <input
                          type="time"
                          value={retEta}
                          onChange={(e) => setRetEta(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </fieldset>

                {/* Late Intimation Charges (SAR) */}
                <div className="pt-2 border-t border-slate-200">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Late Intimation Charges (SAR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={lateIntimationSAR}
                    onChange={(e) => setLateIntimationSAR(e.target.value)}
                    placeholder="0 (Manual entry)"
                    className="w-full sm:w-64 p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-[#0e2c4c]"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">Manual entry. Empty means zero. Added directly to voucher gross.</span>
                </div>
              </div>

              {/* Transport Sectors with mandatory vehicle selection and blank manual rate */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-bold text-slate-900 text-sm">Ground Transport Sectors</h4>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => setSectors([...sectors, { type: 'Arrival', date: sectors.length > 0 ? sectors[sectors.length - 1].date : arrivalDate, vehicleType: undefined, transportRateSAR: 0 }])}>
                      + Arrival
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSectors([...sectors, { type: 'Departure', date: sectors.length > 0 ? sectors[sectors.length - 1].date : arrivalDate, vehicleType: undefined, transportRateSAR: 0 }])}>
                      + Departure
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSectors([...sectors, { type: 'Makkah to Madina', date: sectors.length > 0 ? sectors[sectors.length - 1].date : arrivalDate, vehicleType: undefined, transportRateSAR: 0 }])}>
                      + Makkah ↔ Madina
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSectors([...sectors, { type: 'Madina to Makkah', date: sectors.length > 0 ? sectors[sectors.length - 1].date : arrivalDate, vehicleType: undefined, transportRateSAR: 0 }])}>
                      + Madina ↔ Makkah
                    </Button>
                  </div>
                </div>

                {sectors.map((sec, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#0e2c4c] px-2.5 py-1 bg-[#0e2c4c]/10 rounded uppercase text-[10px]">{sec.type}</span>
                        <input
                          type="date"
                          value={sec.date}
                          onChange={(e) => {
                            const updated = [...sectors];
                            updated[idx].date = e.target.value;
                            setSectors(updated);
                          }}
                          className="p-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                        />
                      </div>
                      {sectors.length > 1 && (
                        <button onClick={() => setSectors(sectors.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 font-semibold">Remove</button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Mandatory Vehicle Selection *</label>
                        <select
                          value={sec.vehicleType || ''}
                          disabled={!!sec.isSelfGari}
                          onChange={(e) => {
                            const updated = [...sectors];
                            updated[idx].vehicleType = (e.target.value || undefined) as any;
                            setSectors(updated);
                          }}
                          required
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold disabled:bg-slate-100 disabled:text-slate-400"
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
                              const updated = [...sectors];
                              updated[idx].isSelfGari = e.target.checked;
                              if (e.target.checked) {
                                updated[idx].vehicleType = undefined;
                                updated[idx].transportRateSAR = 0;
                              }
                              setSectors(updated);
                            }}
                            className="w-4 h-4 accent-[#0e2c4c]"
                          />
                          Self Gari (own vehicle — no company transport charge)
                        </label>
                        <div className="mt-2">
                          <input
                            type="text"
                            value={sec.vehicleNote || ''}
                            onChange={(e) => {
                              const updated = [...sectors];
                              updated[idx].vehicleNote = e.target.value;
                              setSectors(updated);
                            }}
                            placeholder="Manual vehicle detail — e.g. GMC Yukon white, driver Ahmed..."
                            disabled={!!sec.isSelfGari}
                            className="w-full p-2 bg-white border border-slate-300 rounded text-xs disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Transport Charge (SAR) [Manual blank input]</label>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={sec.transportRateSAR || ''}
                          onChange={(e) => {
                            const updated = [...sectors];
                            updated[idx].transportRateSAR = parseFloat(e.target.value) || 0;
                            setSectors(updated);
                          }}
                          placeholder={isAgent ? "Staff will add the charge" : "Type rate (SAR)..."}
                          disabled={isAgent || !!sec.isSelfGari}
                          className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-[#0e2c4c] disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Accommodation stays — compact list + small professional entry modal */}
              <div className="space-y-2 pt-4 border-t border-slate-200">
                <h4 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                  <span>Accommodation Stays</span>
                  <Button variant="outline" size="sm" onClick={() => openStayModal(null)}>
                    + Add Hotel Stay
                  </Button>
                </h4>
                {hotelStays.length === 0 ? (
                  <div className="text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 text-center">
                    No hotel stays added yet. Click "+ Add Hotel Stay".
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                    {hotelStays.map((stay, idx) => (
                      <div key={idx} className="px-3 py-2.5 bg-white flex items-center gap-3 text-xs hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 truncate">
                            {stay.hotelName || <span className="text-slate-400 font-semibold">Unnamed hotel</span>}
                            <span className="ml-2 font-semibold text-slate-500">({stay.city})</span>
                          </div>
                          <div className="text-slate-500 truncate">
                            {stay.checkInDate} → {stay.checkOutDate} • {stay.nights}n • {stay.bedType} • {stay.roomCount} room(s)
                            {stay.ratePerNightSAR > 0 ? ` • SAR ${stay.ratePerNightSAR}/night` : ' • rate not set'}
                            {stay.description ? ` • ${stay.description}` : ''}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-[#0e2c4c] whitespace-nowrap">SAR {(stay.totalSAR || 0).toLocaleString()}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openStayModal(idx)}
                            className="px-2 py-1 text-[11px] font-bold text-[#0e2c4c] bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeStay(idx)}
                            className="px-2 py-1 text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Compact hotel stay entry modal */}
              <Modal
                isOpen={stayModalOpen}
                onClose={() => setStayModalOpen(false)}
                title={editingStayIdx === null ? 'Add Hotel Stay' : 'Edit Hotel Stay'}
                subtitle="Compact charge entry — all fields on one small card"
                size="sm"
                footer={
                  <>
                    <Button variant="outline" size="sm" onClick={() => setStayModalOpen(false)}>Cancel</Button>
                    <Button size="sm" onClick={saveStayModal} disabled={!dHotelName.trim()}>
                      {editingStayIdx === null ? 'Add Stay' : 'Save Changes'}
                    </Button>
                  </>
                }
              >
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">City</label>
                    <select value={dCity} onChange={(e) => setDCity(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg">
                      <option value="Makkah">Makkah</option>
                      <option value="Madinah">Madinah</option>
                      <option value="Jeddah">Jeddah</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Bed Type</label>
                    <select value={dBedType} onChange={(e) => setDBedType(e.target.value as any)} className="w-full p-2 bg-white border border-slate-300 rounded-lg font-semibold">
                      <option value="Double">Double Bed</option>
                      <option value="Triple">Triple Bed</option>
                      <option value="Sharing">Sharing Bed</option>
                      <option value="Room">Room</option>
                      <option value="Quad">Quad Bed</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Hotel</label>
                    <label className="flex items-center gap-2 mb-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dIsSelfHotel}
                        onChange={(e) => {
                          setDIsSelfHotel(e.target.checked);
                          if (!e.target.checked) setDHotelName('');
                        }}
                        className="w-4 h-4 accent-[#0e2c4c]"
                      />
                      Manual / Self Hotel — type hotel name manually
                    </label>
                    {dIsSelfHotel ? (
                      <input
                        type="text"
                        value={dHotelName}
                        onChange={(e) => setDHotelName(e.target.value)}
                        placeholder="Type hotel name manually..."
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg"
                      />
                    ) : (
                      <select value={dHotelName} onChange={(e) => setDHotelName(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg font-semibold">
                        <option value="">-- Choose Hotel from Master --</option>
                        {hotelsMaster.filter((h) => h.city.toLowerCase() === dCity.toLowerCase()).map((h) => (
                          <option key={h.id} value={h.name}>
                            {h.name}{h.availabilityNote ? ` (${h.availabilityNote})` : ''} — {h.starRating}★
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rate / Night (SAR)</label>
                    <input
                      type="number" min="0" step="10"
                      value={dRate}
                      onChange={(e) => setDRate(e.target.value)}
                      placeholder={isAgent ? 'Staff will add' : 'Type rate...'}
                      disabled={isAgent}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-[#0e2c4c] disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rooms</label>
                    <input type="number" min="1" value={dRoomCount} onChange={(e) => setDRoomCount(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Check-In</label>
                    <input type="date" value={dCheckIn} onChange={(e) => setDCheckIn(e.target.value)} className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nights</label>
                    <input type="number" min="0" value={dNights} onChange={(e) => setDNights(e.target.value)} placeholder="0" className="w-full p-2 bg-white border border-slate-300 rounded-lg font-mono" />
                  </div>
                  <div className="col-span-2 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Check-out: <span className="font-mono font-bold text-slate-700">{dCheckIn ? addDays(dCheckIn, Math.max(0, parseInt(dNights) || 0)) : '—'}</span>
                    </span>
                    <span className="text-sm font-mono font-bold text-[#0e2c4c]">
                      SAR {((Math.max(0, parseInt(dNights) || 0)) * (parseFloat(dRate) || 0) * (Math.max(1, parseInt(dRoomCount) || 1))).toLocaleString()}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description <span className="text-slate-400 font-normal">(optional note — shows on voucher & ledger)</span></label>
                    <textarea
                      value={dDescription}
                      onChange={(e) => setDDescription(e.target.value)}
                      rows={2}
                      placeholder="e.g. 2 rooms near Haram gate, breakfast included..."
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg resize-none"
                    />
                  </div>
                </div>
              </Modal>
            </div>
          )}

          {/* Step 3: Charges & Commission */}
          {builderStep === 3 && (
            <div className="space-y-4">
              <h4 className="font-bold text-slate-900 text-sm">Charges & Agent Commission</h4>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Total Hotel Stays ({validHotelStays.length} active stays):</span>
                  <span>SAR {hotelsSAR.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Total Transport Sectors ({validSectors.length} active sectors):</span>
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
                  <span className="font-mono text-[#0e2c4c]">
                    SAR {totalSAR.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Commission Box */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3 text-xs">
                <label className="flex items-center gap-2 font-semibold text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={commissionEnabled}
                    onChange={(e) => setCommissionEnabled(e.target.checked)}
                    className="rounded text-[#0e2c4c]"
                  />
                  <span>Include Sub-Agent / Referrer Commission</span>
                </label>
                {commissionEnabled && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <Input label="Recipient Name *" placeholder="e.g. Al-Noor Agency" value={commissionName} onChange={(e) => setCommissionName(e.target.value)} />
                    <Input label="Contact Number *" placeholder="e.g. +92 300 1234567" value={commissionContact} onChange={(e) => setCommissionContact(e.target.value)} />
                    <Input label="Commission Amount (SAR) *" type="number" placeholder="e.g. 250" value={commissionAmount} onChange={(e) => setCommissionAmount(e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          )}

              {/* KSA Ground Staff Contacts — editable per voucher, prefilled from Company Profile defaults */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📞</span>
                  <h5 className="font-bold text-slate-900 text-xs uppercase tracking-wide">KSA Ground Staff Contacts</h5>
                  <span className="text-[10px] text-slate-500">(changeable per voucher — prints on the voucher)</span>
                </div>
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
              </div>

          {/* Step 4: Review Summary */}
          {builderStep === 4 && (
            <div className="space-y-4 text-xs">
              <h4 className="font-bold text-slate-900 text-sm">Review Trip Voucher Summary</h4>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Pilgrims:</span>
                  <span className="font-bold text-[#0e2c4c]">{selectedVisaIds.length} Pilgrims Selected</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Flight Information:</span>
                  <span className="font-bold text-slate-800">{allowFlightInfo ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Active Transport Sectors:</span>
                  <span className="font-bold text-slate-800">{validSectors.length} Sectors</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Active Hotel Stays:</span>
                  <span className="font-bold text-slate-800">{validHotelStays.length} Stays</span>
                </div>
                {lateIntimation > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Late Intimation Charges:</span>
                    <span className="font-bold text-amber-600">SAR {lateIntimation.toLocaleString()}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-slate-200 flex justify-between font-bold text-base">
                  <span>Total Amount:</span>
                  <span className="font-mono text-[#0e2c4c]">
                    SAR {totalSAR.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      </div>

      {/* Edit Request Review Modal (owner) */}
      {reviewingRequest && (
        <Modal
          isOpen={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          title={`Review Edit — ${reviewingRequest.voucherNo}`}
          subtitle={`Requested by ${reviewingRequest.requestedByName} (${reviewingRequest.requestedByRole}) on ${reviewingRequest.requestedAt.split('T')[0]}`}
          size="lg"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <input
                type="text"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Review note (optional)"
                className="flex-1 p-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="text-rose-600 border-rose-300 hover:bg-rose-50"
                onClick={async () => {
                  if (!userProfile) return;
                  try {
                    await rejectVoucherEdit(userProfile, reviewingRequest.id, reviewNote);
                    success('Edit request rejected.');
                    setReviewModalOpen(false);
                    await loadData();
                  } catch (err: any) {
                    showError(err?.message || 'Rejection failed.');
                  }
                }}
              >
                Reject
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={async () => {
                  if (!userProfile) return;
                  try {
                    await approveVoucherEdit(userProfile, reviewingRequest.id, reviewNote);
                    success(`Edit approved for ${reviewingRequest.voucherNo}.`);
                    setReviewModalOpen(false);
                    await loadData();
                  } catch (err: any) {
                    showError(err?.message || 'Approval failed.');
                  }
                }}
              >
                Approve & Apply
              </Button>
            </div>
          }
        >
          {(() => {
            const v = vouchers.find((x) => x.id === reviewingRequest.voucherId);
            const nd = reviewingRequest.newData;
            if (!v) return <div className="text-xs text-slate-500">Original voucher not found.</div>;
            const row = (label: string, oldV: string, newV: string, changed: boolean) => (
              <div className={`flex items-center justify-between py-1.5 border-b border-slate-100 text-xs ${changed ? 'bg-amber-50/60' : ''}`}>
                <span className="font-semibold text-slate-600">{label}</span>
                <span className="font-mono text-right">
                  <span className={changed ? 'line-through text-slate-400' : 'text-slate-700'}>{oldV}</span>
                  {changed && <span className="ml-2 font-bold text-[#0e2c4c]">{newV}</span>}
                </span>
              </div>
            );
            const ch = (a: any, b: any) => JSON.stringify(a) !== JSON.stringify(b);
            return (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="font-bold text-slate-700 mb-1">Reason</div>
                  <div className="italic text-slate-600">"{reviewingRequest.reason}"</div>
                </div>
                <div className="border border-slate-200 rounded-xl px-3 py-1">
                  {row('Pilgrims', String(v.passengers.length), String(nd.passengers.length), v.passengers.length !== nd.passengers.length)}
                  {row('Total (SAR)', v.totals.totalSAR.toLocaleString(), nd.totals.totalSAR.toLocaleString(), v.totals.totalSAR !== nd.totals.totalSAR)}
                  {row('Hotels (SAR)', v.totals.hotelsSAR.toLocaleString(), nd.totals.hotelsSAR.toLocaleString(), v.totals.hotelsSAR !== nd.totals.hotelsSAR)}
                  {row('Transport (SAR)', v.totals.transportSAR.toLocaleString(), nd.totals.transportSAR.toLocaleString(), v.totals.transportSAR !== nd.totals.transportSAR)}
                  {row('Hotel stays', String(v.hotelStays.length), String(nd.hotelStays.length), ch(v.hotelStays, nd.hotelStays))}
                  {row('Sectors', String(v.sectors.length), String(nd.sectors.length), ch(v.sectors, nd.sectors))}
                  {row('Shirka', ((v as any).shirkaName || vendorsMaster.find((x: any) => x.id === (v as any).shirkaVendorId)?.name || '—'), (nd.shirkaName || vendorsMaster.find((x: any) => x.id === nd.shirkaVendorId)?.name || '—'), ((v as any).shirkaVendorId !== nd.shirkaVendorId || (v as any).shirkaId !== nd.shirkaId))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-slate-200 rounded-xl p-3">
                    <div className="font-bold text-slate-700 mb-1.5">Current stays</div>
                    {v.hotelStays.map((s, i) => (
                      <div key={i} className="py-1 border-b border-slate-100 last:border-0">
                        <div className="font-semibold">{s.hotelName} ({s.city})</div>
                        <div className="text-slate-500">{s.nights}n • {s.bedType} • SAR {(s.totalSAR || 0).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                  <div className="border border-amber-300 rounded-xl p-3 bg-amber-50/40">
                    <div className="font-bold text-slate-700 mb-1.5">Requested stays</div>
                    {nd.hotelStays.map((s, i) => (
                      <div key={i} className="py-1 border-b border-slate-100 last:border-0">
                        <div className="font-semibold">{s.hotelName} ({s.city})</div>
                        <div className="text-slate-500">{s.nights}n • {s.bedType} • SAR {(s.totalSAR || 0).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* Voucher Itinerary Detail Modal — the print document (stays visible in print) */}
      {selectedVoucher && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Umrah Trip Voucher: ${selectedVoucher.voucherNo}`}
          subtitle={`Link Type: ${selectedVoucher.linkType.toUpperCase()} • Status: ${selectedVoucher.status}`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full print:hidden">
              <div className="flex items-center gap-2">
                <Button variant="primary" onClick={() => window.print()} rightIcon={<Printer className="w-3.5 h-3.5" />}>
                  Print Voucher
                </Button>
                {isOwner && selectedVoucher.status === 'Pending Approval' && (
                  <>
                    <Button
                      variant="primary"
                      onClick={async () => {
                        try {
                          await approveVoucher(userProfile!, selectedVoucher.id);
                          success(`Voucher ${selectedVoucher.voucherNo} approved & posted to ledger.`);
                          setDetailModalOpen(false);
                          await loadData();
                        } catch (e: any) { showError(e.message); }
                      }}
                    >
                      Approve Voucher
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const note = prompt('Disapproval note for the creator (optional):') || '';
                        try {
                          await disapproveVoucher(userProfile!, selectedVoucher.id, note);
                          info(`Voucher ${selectedVoucher.voucherNo} sent back to draft.`);
                          setDetailModalOpen(false);
                          await loadData();
                        } catch (e: any) { showError(e.message); }
                      }}
                    >
                      Disapprove
                    </Button>
                  </>
                )}
                {selectedVoucher.disapprovalNote && (
                  <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-300" title={selectedVoucher.disapprovalNote}>
                    Sent back: {selectedVoucher.disapprovalNote.slice(0, 60)}{selectedVoucher.disapprovalNote.length > 60 ? '…' : ''}
                  </span>
                )}
                {selectedVoucher.status !== 'Cancelled' && !editRequests.some((r) => r.voucherId === selectedVoucher.id && r.status === 'pending') && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDetailModalOpen(false);
                      openEditVoucher(selectedVoucher);
                    }}
                  >
                    Edit Voucher
                  </Button>
                )}
                {editRequests.some((r) => r.voucherId === selectedVoucher.id && r.status === 'pending') && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-300">
                    Edit Pending Approval
                  </span>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    const link = `${window.location.origin}/vouchers/shared/${selectedVoucher.id}`;
                    navigator.clipboard.writeText(link).then(
                      () => success('Read-only share link copied.'),
                      () => showError('Could not copy the link.')
                    );
                  }}
                  rightIcon={<Link2 className="w-3.5 h-3.5" />}
                >
                  Copy Share Link
                </Button>
              </div>
              <Button variant="outline" onClick={() => setDetailModalOpen(false)}>Close</Button>
            </div>
          }
        >
          {/* F&S approved A4 voucher print document (print only) */}
          <VoucherPrintDocument voucher={selectedVoucher} company={company} groupCode={voucherGroupCode(selectedVoucher)} theme={voucherPrintTheme} />
          <div className="space-y-4 py-2 text-xs print:hidden">
            {/* Voucher print theme + A4 preview (screen only) */}
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
              <span className="font-bold text-slate-700 text-xs">Voucher Print Theme</span>
              <div className="flex gap-2">
                <Button variant={voucherPrintTheme === 'bw' ? 'primary' : 'outline'} size="sm" onClick={() => setVoucherPrintTheme('bw')}>🖨️ B&amp;W Print</Button>
                <Button variant={voucherPrintTheme === 'color' ? 'primary' : 'outline'} size="sm" onClick={() => setVoucherPrintTheme('color')}>🎨 Digital Color</Button>
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100">
              <div className="text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider py-2 bg-white border-b border-slate-200">A4 Voucher Preview — {voucherPrintTheme === 'bw' ? 'B&W Print' : 'Digital Color'}</div>
              <div className="flex justify-center overflow-auto max-h-[560px] p-3">
                <div style={{ zoom: 0.55 }}>
                  <VoucherPrintDocument voucher={selectedVoucher} company={company} groupCode={voucherGroupCode(selectedVoucher)} theme={voucherPrintTheme} preview />
                </div>
              </div>
            </div>
            <div className="bg-[#0e2c4c] text-white rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-slate-300 uppercase text-[10px]">Official Voucher Reference</div>
                <div className="text-2xl font-mono font-bold text-[#c9a227]">{selectedVoucher.voucherNo}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-300 uppercase text-[10px]">Total Gross Amount</div>
                <div className="text-xl font-mono font-bold">SAR {selectedVoucher.totals.totalSAR.toLocaleString()}</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 text-[11px] font-bold">
                Visa-linked: {(selectedVoucher.visaIds || []).length} visas
              </span>
              {((selectedVoucher as any).shirkaName || (selectedVoucher as any).shirkaVendorId) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                  Shirka: {(selectedVoucher as any).shirkaName || vendorsMaster.find((v: any) => v.id === (selectedVoucher as any).shirkaVendorId)?.name || (selectedVoucher as any).shirkaVendorId}
                </span>
              )}
              {selectedVoucher.linkType === 'agent' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-bold">
                  Agent: {agentsList.find(a => a.id === selectedVoucher.agentId)?.companyName || selectedVoucher.agentId}
                </span>
              )}
              {selectedVoucher.linkType === 'customer' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                  Customer: {customersList.find(c => c.id === selectedVoucher.customerId)?.fullName || '—'}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                Group: {voucherGroupCode(selectedVoucher) || '—'}
              </span>
            </div>

            {selectedVoucher.flightDetails?.allowFlightInfo && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="font-bold text-[#0e2c4c] uppercase text-[11px]">Flight Details</span>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div><strong>Departure:</strong> {selectedVoucher.flightDetails.departureFlight.airline?.name || ''} {selectedVoucher.flightDetails.departureFlight.flightNo} ({selectedVoucher.flightDetails.departureFlight.date})</div>
                  <div><strong>Return:</strong> {selectedVoucher.flightDetails.returnFlight.airline?.name || ''} {selectedVoucher.flightDetails.returnFlight.flightNo} ({selectedVoucher.flightDetails.returnFlight.date})</div>
                </div>
                {selectedVoucher.flightDetails.lateIntimationChargesSAR > 0 && (
                  <div className="text-amber-700 font-semibold">Late Intimation Charges: SAR {selectedVoucher.flightDetails.lateIntimationChargesSAR}</div>
                )}
              </div>
            )}

            <div>
              <h5 className="font-bold text-slate-800 mb-2">Passengers ({selectedVoucher.passengers.length})</h5>
              <div className="space-y-1">
                {selectedVoucher.passengers.map((p, i) => (
                  <div key={i} className="p-2 bg-slate-50 border border-slate-200 rounded flex justify-between">
                    <span className="font-bold">{p.name}</span>
                    <span className="font-mono text-slate-500">{p.passportNumber}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h5 className="font-bold text-slate-800 mb-2">Hotel Stays</h5>
              <div className="space-y-1">
                {selectedVoucher.hotelStays.map((h, i) => (
                  <div key={i} className="p-2 bg-slate-50 border border-slate-200 rounded flex justify-between">
                    <span>{h.city} — <strong>{h.hotelName}</strong> ({h.nights} nights @ {h.ratePerNightSAR} SAR)</span>
                    <span className="font-mono">SAR {h.totalSAR.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h5 className="font-bold text-slate-800 mb-2">Sectors & Transport</h5>
              <div className="space-y-1">
                {selectedVoucher.sectors.map((s, i) => (
                  <div key={i} className="p-2 bg-slate-50 border border-slate-200 rounded flex justify-between">
                    <span>{s.type}{s.isSelfGari ? ' — Self Gari' : ''}{s.vehicleType ? ` — ${s.vehicleType}` : ''}</span>
                    <span className="font-mono">{s.isSelfGari ? 'No charge' : `SAR ${(s.transportRateSAR || 0).toLocaleString()}`}</span>
                  </div>
                ))}
              </div>
            </div>

            {selectedVoucher.commission.enabled && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-amber-900 text-xs">Commission: {selectedVoucher.commission.recipientName || '—'}</div>
                  <div className="text-amber-800 text-[11px]">{selectedVoucher.commission.contact || '—'} • SAR {selectedVoucher.commission.amountSAR.toLocaleString()} • {selectedVoucher.commission.isPaid ? 'Paid' : 'Unpaid'}</div>
                </div>
                {isOwner && !selectedVoucher.commission.isPaid && selectedVoucher.status !== 'Cancelled' && (
                  <Button variant="primary" onClick={handleMarkCommissionPaid}>Mark Paid</Button>
                )}
              </div>
            )}

            <div>
              <h5 className="font-bold text-slate-800 mb-2">Voucher Ledger Entries</h5>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 uppercase">
                      <th className="text-left p-2">Date</th>
                      <th className="text-left p-2">Particulars</th>
                      <th className="text-right p-2">Debit</th>
                      <th className="text-right p-2">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerEntries.filter(e => e.voucherNo === selectedVoucher.voucherNo).map(e => (
                      <tr key={e.id} className="border-t border-slate-100">
                        <td className="p-2 font-mono">{e.date}</td>
                        <td className="p-2">{e.particulars}</td>
                        <td className="p-2 text-right font-mono">{e.debitSAR ? e.debitSAR.toLocaleString() : '—'}</td>
                        <td className="p-2 text-right font-mono">{e.creditSAR ? e.creditSAR.toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                    {ledgerEntries.filter(e => e.voucherNo === selectedVoucher.voucherNo).length === 0 && (
                      <tr><td colSpan={4} className="p-3 text-center text-slate-400">No ledger entries posted for this voucher.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h5 className="font-bold text-slate-800 mb-2">Audit Timeline</h5>
              <div className="space-y-1 text-[11px] text-slate-600">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" />Created by {selectedVoucher.createdByName || '—'} • {new Date(selectedVoucher.createdAt).toLocaleString()}</div>
                {selectedVoucher.status === 'Cancelled' && (
                  <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" />Cancelled by {selectedVoucher.cancelledBy || '—'} • {selectedVoucher.cancelledAt ? new Date(selectedVoucher.cancelledAt).toLocaleString() : '—'}</div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Verification Modal */}
      {verificationModalOpen && (
        <Modal
          isOpen={verificationModalOpen}
          onClose={() => setVerificationModalOpen(false)}
          title="Voucher Verification & Compliance Report"
          subtitle="Audit trail of all issued vouchers, passenger manifest counts, and ledger postings."
          size="lg"
          footer={<Button variant="primary" onClick={() => setVerificationModalOpen(false)}>Close Report</Button>}
        >
          <div className="space-y-4 py-2 text-xs">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-bold text-emerald-900 text-sm">All Vouchers Fully Audited & Verified</div>
                <div className="text-emerald-700 mt-0.5">Total Vouchers Issued: {vouchers.length} • Total Volume: SAR {vouchers.reduce((s, v) => s + v.totals.totalSAR, 0).toLocaleString()}</div>
              </div>
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-bold text-slate-900 text-sm">Vouchers Created</div>
                <div className="text-slate-500">Confirmed vouchers, passenger-wise rows (Name, Passport, Group Code, Agent, Voucher No).</div>
                <Button variant="primary" className="w-full" onClick={() => downloadVerificationList('created')}>Download Excel</Button>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="font-bold text-slate-900 text-sm">Vouchers Pending</div>
                <div className="text-slate-500">Draft vouchers awaiting confirmation, same columns for office verification.</div>
                <Button variant="outline" className="w-full" onClick={() => downloadVerificationList('pending')}>Download Excel</Button>
              </div>
            </div>
            {isAgent && (
              <div className="text-[11px] text-slate-500 font-semibold">Agents only receive their own records in these exports.</div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};
