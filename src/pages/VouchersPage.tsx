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
import { VoucherPrintDocument } from '../components/voucher/VoucherPrintDocument';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { useDeepOpen } from '../hooks/useDeepOpen';
import * as XLSX from 'xlsx';
import { fetchLedgerEntries } from '../services/accountingService';
import { VoucherDoc, SectorItem, HotelStayItem, VoucherChargeItem } from '../types/voucher';
import { fetchVouchers, createVoucher, cancelVoucher, markCommissionPaid } from '../services/voucherService';
import { fetchVisas } from '../services/visaService';
import { fetchHotels, fetchVehicles } from '../services/masterService';
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

  // Linking Rules (No-Orphan Rule)
  const [linkType, setLinkType] = useState<'visa' | 'customer' | 'agent'>('visa');
  const [selectedVisaIds, setSelectedVisaIds] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

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
      const [vList, visaList, hList, vList2, cList, aList, ledgerList] = await Promise.all([
        fetchVouchers(),
        fetchVisas(),
        fetchHotels(),
        fetchVehicles(),
        fetchCustomers(),
        fetchAgents(),
        fetchLedgerEntries(),
      ]);
      setVouchers(vList);
      setAvailableVisas(visaList);
      setHotelsMaster(hList);
      setVehiclesMaster(vList2);
      setCustomersList(cList);
      setAgentsList(aList);
      setLedgerEntries(ledgerList);
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

  const openBuilder = () => {
    setBuilderStep(1);
    setLinkType('visa');
    setSelectedVisaIds([]);
    setSelectedCustomerId('');
    setSelectedAgentId('');
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

  const handleSaveVoucher = async () => {
    if (!userProfile) return;

    // No-orphan rule validation
    if (linkType === 'visa' && selectedVisaIds.length === 0) {
      showError('No-orphan rule: Voucher linked to visas must have at least one pilgrim visa selected.');
      return;
    }
    if (linkType === 'customer' && !selectedCustomerId) {
      showError('No-orphan rule: Voucher linked to a direct customer must select a customer profile.');
      return;
    }
    if (linkType === 'agent' && !selectedAgentId) {
      showError('No-orphan rule: Voucher linked to a B2B sub-agent must select a sub-agent.');
      return;
    }

    const missingVehicle = sectors.filter(s => !s.vehicleType && !s.isSelfGari);
    if (missingVehicle.length > 0) {
      showError('Transport rule: every sector needs a vehicle selected, or mark Self Gari.');
      return;
    }

    // Fix #32: commission contact number is required when commission is enabled
    if (commissionEnabled) {
      if (!commissionName.trim()) {
        showError('Commission: please enter the recipient name.');
        return;
      }
      if (!commissionContact.trim()) {
        showError('Commission: please enter the recipient contact number.');
        return;
      }
      if (!(parseFloat(commissionAmount) > 0)) {
        showError('Commission: please enter a valid commission amount.');
        return;
      }
    }

    if (namedHotelStays.length === 0 && sectorsWithTransport.length === 0) {
      showError('Please add at least one hotel stay (with a name) or transport sector.');
      return;
    }

    let passengers: any[] = [];
    if (linkType === 'visa') {
      const selectedVisasData = availableVisas.filter((v) => selectedVisaIds.includes(v.id));
      passengers = selectedVisasData.map((v) => ({
        name: v.pilgrimName,
        passportNumber: v.passportNumber,
        ageType: 'Adult' as const,
        visaId: v.id,
      }));
    } else if (linkType === 'customer') {
      const cust = customersList.find((c) => c.id === selectedCustomerId);
      passengers = [{
        name: cust?.fullName || 'Direct Customer',
        passportNumber: cust?.passportNumber || 'N/A',
        ageType: 'Adult' as const,
      }];
    } else if (linkType === 'agent') {
      passengers = [{
        name: 'Agent Group Booking (Hotel-Only / Package)',
        passportNumber: 'N/A',
        ageType: 'Adult' as const,
      }];
    }

    const totalPKR = convert(totalSAR, getCurrentRate('SAR-PKR'));

    setSaving(true);
    try {
      await createVoucher(userProfile, {
        linkType,
        visaIds: linkType === 'visa' ? selectedVisaIds : [],
        customerId: linkType === 'customer' ? selectedCustomerId : undefined,
        agentId: linkType === 'agent' ? selectedAgentId : undefined,
        status: 'Confirmed',
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
    let list = vouchers.filter(v => kind === 'created' ? v.status === 'Confirmed' : v.status === 'Draft');
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
        <Badge variant={row.status === 'Confirmed' ? 'success' : row.status === 'Cancelled' ? 'danger' : 'gold'}>
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
        title="Unified Trip Voucher Builder"
        subtitle={`Step ${builderStep} of 4 • Configure linking rules, flight details, hotel stays, and charges.`}
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
                <Button variant="primary" size="sm" onClick={() => setBuilderStep((builderStep + 1) as any)} className="bg-[#0e2c4c]">
                  Next Step
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
          {/* Step 1: Linking Rules */}
          {builderStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Voucher Link Type (No-Orphan Rule) *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setLinkType('visa')}
                    className={`p-2.5 rounded-lg border text-xs font-bold transition cursor-pointer ${linkType === 'visa' ? 'bg-[#0e2c4c] text-white border-[#0e2c4c]' : 'bg-white text-slate-700 border-slate-300'}`}
                  >
                    Linked to Visas
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkType('customer')}
                    className={`p-2.5 rounded-lg border text-xs font-bold transition cursor-pointer ${linkType === 'customer' ? 'bg-[#0e2c4c] text-white border-[#0e2c4c]' : 'bg-white text-slate-700 border-slate-300'}`}
                  >
                    Linked to B2C Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => setLinkType('agent')}
                    className={`p-2.5 rounded-lg border text-xs font-bold transition cursor-pointer ${linkType === 'agent' ? 'bg-[#0e2c4c] text-white border-[#0e2c4c]' : 'bg-white text-slate-700 border-slate-300'}`}
                  >
                    Linked to B2B Agent
                  </button>
                </div>
              </div>

              {linkType === 'visa' && (
                <div className="space-y-2">
                  <div className="text-xs text-slate-600">
                    Pick pilgrims from distributed visas. Only pilgrims whose voucher is not yet created are shown ("remaining only" — {remainingVisas.length} available).
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {remainingVisas.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-500">No remaining unvouchered visas available. All distributed visas have vouchers!</div>
                    ) : (
                      remainingVisas.map((visa) => {
                        const isSelected = selectedVisaIds.includes(visa.id);
                        return (
                          <div
                            key={visa.id}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedVisaIds(selectedVisaIds.filter(id => id !== visa.id));
                              } else {
                                setSelectedVisaIds([...selectedVisaIds, visa.id]);
                              }
                            }}
                            className={`p-3 cursor-pointer flex items-center justify-between text-xs transition-colors ${isSelected ? 'bg-[#0e2c4c]/10' : 'hover:bg-slate-50'}`}
                          >
                            <div>
                              <div className="font-bold text-[#0e2c4c]">{visa.pilgrimName}</div>
                              <div className="text-slate-500">Passport: <code>{visa.passportNumber}</code> • Group: {visa.groupCode}</div>
                            </div>
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-[#0e2c4c] text-white border-[#0e2c4c]' : 'border-slate-300'}`}>
                              {isSelected && <Check className="w-3.5 h-3.5" />}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {linkType === 'customer' && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase">Select Direct B2C Customer *</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                  >
                    <option value="">-- Choose Direct Customer --</option>
                    {customersList.map((c) => (
                      <option key={c.id} value={c.id}>{c.fullName} ({c.passportNumber} — {c.mobile})</option>
                    ))}
                  </select>
                  <div className="text-[11px] text-slate-500">Allows hotel-only or service vouchers without requiring a visa record.</div>
                </div>
              )}

              {linkType === 'agent' && (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase">Select B2B Sub-Agent *</label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                  >
                    <option value="">-- Choose Sub-Agent --</option>
                    {agentsList.map((a) => (
                      <option key={a.id} value={a.id}>{a.companyName} ({a.agentCode})</option>
                    ))}
                  </select>
                  <div className="text-[11px] text-slate-500">Allows hotel-only or group service vouchers linked to sub-agent ledger.</div>
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
                        </select>
                        {isAgent && (
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
                            Self Gari (I will use my own vehicle — no company transport charge)
                          </label>
                        )}
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

              {/* Accommodation section with smart date chaining and manual blank rate */}
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <h4 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                  <span>Accommodation Stays (Smart Chaining & Manual Rates)</span>
                  <Button variant="outline" size="sm" onClick={() => {
                    const lastStay = hotelStays[hotelStays.length - 1];
                    const nextCheckIn = lastStay ? lastStay.checkOutDate : arrivalDate;
                    const nextCheckOut = addDays(nextCheckIn, 3);
                    setHotelStays([...hotelStays, { city: 'Madinah', hotelName: '', checkInDate: nextCheckIn, checkOutDate: nextCheckOut, nights: 3, bedType: 'Double', roomCount: 1, ratePerNightSAR: 0, totalSAR: 0 }]);
                  }}>
                    + Add Hotel Stay
                  </Button>
                </h4>
                {hotelStays.map((stay, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0e2c4c]">Stay #{idx + 1} ({stay.city}) — Chained Stay</span>
                      <button onClick={() => {
                        const updated = hotelStays.filter((_, i) => i !== idx);
                        for (let i = 0; i < updated.length; i++) {
                          if (i === 0) {
                            updated[i].checkInDate = arrivalDate;
                          } else {
                            updated[i].checkInDate = updated[i - 1].checkOutDate;
                          }
                          updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights);
                        }
                        setHotelStays(updated);
                      }} className="text-red-500 hover:text-red-700 font-semibold">Remove Stay</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">City</label>
                        <select
                          value={stay.city}
                          onChange={(e) => {
                            const updated = [...hotelStays];
                            updated[idx].city = e.target.value as any;
                            setHotelStays(updated);
                          }}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value="Makkah">Makkah</option>
                          <option value="Madinah">Madinah</option>
                          <option value="Jeddah">Jeddah</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Hotel Name</label>
                        {isAgent ? (
                          <div>
                            <label className="flex items-center gap-2 mb-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!stay.isSelfHotel}
                                onChange={(e) => {
                                  const updated = [...hotelStays];
                                  updated[idx].isSelfHotel = e.target.checked;
                                  setHotelStays(updated);
                                }}
                                className="w-4 h-4 accent-[#0e2c4c]"
                              />
                              Self Hotel (I arranged it myself)
                            </label>
                            <input
                              type="text"
                              value={stay.hotelName}
                              onChange={(e) => {
                                const updated = [...hotelStays];
                                updated[idx].hotelName = e.target.value;
                                setHotelStays(updated);
                              }}
                              placeholder={stay.isSelfHotel ? "Enter your hotel name..." : "Enter hotel name..."}
                              className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                            />
                          </div>
                        ) : (
                          <select
                            value={stay.hotelName}
                            onChange={(e) => {
                              const hName = e.target.value;
                              const updated = [...hotelStays];
                              updated[idx].hotelName = hName;
                              setHotelStays(updated);
                            }}
                            className="w-full p-2 bg-white border border-slate-300 rounded text-xs font-semibold"
                          >
                            <option value="">-- Choose Hotel from Master --</option>
                            {hotelsMaster.filter(h => h.city.toLowerCase() === stay.city.toLowerCase()).map(h => (
                              <option key={h.id} value={h.name}>
                                {h.name} {h.availabilityNote ? `(${h.availabilityNote})` : ''} - {h.starRating}★
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Bed Type</label>
                        <select
                          value={stay.bedType || 'Double'}
                          onChange={(e) => {
                            const updated = [...hotelStays];
                            updated[idx].bedType = e.target.value as any;
                            setHotelStays(updated);
                          }}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs font-semibold"
                        >
                          <option value="Double">Double Bed</option>
                          <option value="Triple">Triple Bed</option>
                          <option value="Sharing">Sharing Bed</option>
                          <option value="Room">Room</option>
                          <option value="Quad">Quad Bed</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Rate per Night (SAR)</label>
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={stay.ratePerNightSAR || ''}
                          onChange={(e) => {
                            const r = parseFloat(e.target.value) || 0;
                            const updated = [...hotelStays];
                            updated[idx].ratePerNightSAR = r;
                            updated[idx].totalSAR = r * updated[idx].nights * updated[idx].roomCount;
                            setHotelStays(updated);
                          }}
                          placeholder={isAgent ? "Staff will add the charge" : "Type rate manually..."}
                          disabled={isAgent}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs font-mono font-bold text-[#0e2c4c] disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Check-In Date</label>
                        <input
                          type="date"
                          value={stay.checkInDate}
                          onChange={(e) => {
                            const newIn = e.target.value;
                            const updated = [...hotelStays];
                            updated[idx].checkInDate = newIn;
                            updated[idx].checkOutDate = addDays(newIn, updated[idx].nights);
                            for (let i = idx + 1; i < updated.length; i++) {
                              updated[i].checkInDate = updated[i - 1].checkOutDate;
                              updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights);
                            }
                            setHotelStays(updated);
                          }}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Nights</label>
                        <input
                          type="number"
                          min="1"
                          value={stay.nights}
                          onChange={(e) => {
                            const n = parseInt(e.target.value) || 1;
                            const updated = [...hotelStays];
                            updated[idx].nights = n;
                            updated[idx].checkOutDate = addDays(updated[idx].checkInDate, n);
                            updated[idx].totalSAR = n * updated[idx].ratePerNightSAR * updated[idx].roomCount;
                            for (let i = idx + 1; i < updated.length; i++) {
                              updated[i].checkInDate = updated[i - 1].checkOutDate;
                              updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights);
                            }
                            setHotelStays(updated);
                          }}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Check-Out & Total</label>
                        <div className="flex gap-1">
                          <input
                            type="date"
                            value={stay.checkOutDate}
                            onChange={(e) => {
                              const newOut = e.target.value;
                              const updated = [...hotelStays];
                              updated[idx].checkOutDate = newOut;
                              const d1 = new Date(updated[idx].checkInDate);
                              const d2 = new Date(newOut);
                              const diffDays = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 3600 * 24)));
                              updated[idx].nights = diffDays;
                              updated[idx].totalSAR = diffDays * updated[idx].ratePerNightSAR * updated[idx].roomCount;
                              for (let i = idx + 1; i < updated.length; i++) {
                                updated[i].checkInDate = updated[i - 1].checkOutDate;
                                updated[i].checkOutDate = addDays(updated[i].checkInDate, updated[i].nights);
                              }
                              setHotelStays(updated);
                            }}
                            className="w-3/5 p-2 bg-white border border-slate-300 rounded text-xs font-mono text-rose-600 font-bold"
                          />
                          <span className="w-2/5 p-2 bg-slate-100 rounded text-xs font-mono font-bold text-[#0e2c4c] flex items-center justify-center">
                            SAR {stay.totalSAR}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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

          {/* Step 4: Review Summary */}
          {builderStep === 4 && (
            <div className="space-y-4 text-xs">
              <h4 className="font-bold text-slate-900 text-sm">Review Trip Voucher Summary</h4>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Link Type:</span>
                  <span className="font-bold text-[#0e2c4c] uppercase">{linkType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Linked Pilgrims / Party:</span>
                  <span className="font-bold text-slate-800">
                    {linkType === 'visa' ? `${selectedVisaIds.length} Pilgrims Selected` : linkType === 'customer' ? `Customer ID: ${selectedCustomerId}` : `Agent ID: ${selectedAgentId}`}
                  </span>
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
          <VoucherPrintDocument voucher={selectedVoucher} company={company} groupCode={voucherGroupCode(selectedVoucher)} />
          <div className="space-y-4 py-2 text-xs print:hidden">
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
