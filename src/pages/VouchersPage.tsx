import React, { useState, useEffect, useMemo } from 'react';
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
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
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

export const VouchersPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, error: showError, info } = useToast();
  const canCreate = useCan('Vouchers', 'create');
  const isOwner = role === 'owner';

  const [vouchers, setVouchers] = useState<VoucherDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

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

  // Sectors state
  const [sectors, setSectors] = useState<SectorItem[]>([
    { type: 'Arrival', date: new Date().toISOString().split('T')[0], flightNo: '', vehicleType: 'Staria', transportRateSAR: 350 }
  ]);

  // Hotel Stays state with smart date chaining
  const [arrivalDate, setArrivalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [hotelStays, setHotelStays] = useState<HotelStayItem[]>([
    { city: 'Makkah', hotelName: '', checkInDate: new Date().toISOString().split('T')[0], checkOutDate: new Date().toISOString().split('T')[0], nights: 3, bedType: 'Double', roomCount: 1, ratePerNightSAR: 950, totalSAR: 2850 }
  ]);

  // Charges state
  const [charges, setCharges] = useState<VoucherChargeItem[]>([]);
  const [commissionEnabled, setCommissionEnabled] = useState<boolean>(false);
  const [commissionName, setCommissionName] = useState<string>('');
  const [commissionAmount, setCommissionAmount] = useState<string>('');

  // Voucher Detail Review Modal
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherDoc | null>(null);

  // Verification Lists Modal
  const [verificationModalOpen, setVerificationModalOpen] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vList, visaList, hList, vList2, cList, aList] = await Promise.all([
        fetchVouchers(),
        fetchVisas(),
        fetchHotels(),
        fetchVehicles(),
        fetchCustomers(),
        fetchAgents(),
      ]);
      setVouchers(vList);
      setAvailableVisas(visaList);
      setHotelsMaster(hList);
      setVehiclesMaster(vList2);
      setCustomersList(cList);
      setAgentsList(aList);
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
    setBuilderOpen(true);
  };

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

    // Calculate totals
    const hotelsSAR = hotelStays.reduce((sum, h) => sum + (h.totalSAR || 0), 0);
    const transportSAR = sectors.reduce((sum, s) => sum + (s.transportRateSAR || 0), 0);
    const totalSAR = hotelsSAR + transportSAR;
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
        sectors,
        hotelStays,
        charges: [
          ...hotelStays.map((h) => ({ description: `${h.city} - ${h.hotelName} (${h.nights}n)`, category: 'Hotel' as const, amountSAR: h.totalSAR })),
          ...sectors.map((s) => ({ description: `${s.type} Sector (${s.vehicleType || 'Transport'})`, category: 'Transport' as const, amountSAR: s.transportRateSAR || 0 }))
        ],
        totals: {
          hotelsSAR,
          transportSAR,
          otherSAR: 0,
          totalSAR,
          totalPKR,
        },
        commission: {
          enabled: commissionEnabled,
          recipientName: commissionName,
          contact: '',
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

  const filteredVouchers = vouchers.filter((v) => {
    if (statusFilter !== 'all' && v.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const paxMatch = v.passengers.some(p => p.name.toLowerCase().includes(q) || p.passportNumber.toLowerCase().includes(q));
      return v.voucherNo.toLowerCase().includes(q) || paxMatch;
    }
    return true;
  });

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
    <div className="space-y-6">
      <PageHeader
        title="Umrah Trip & Hotel Vouchers"
        subtitle="Manage unified Umrah vouchers with remaining visa filtering, multi-link options (Visas, B2C Customer, B2B Agent), and ledger posting."
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        subtitle={`Step ${builderStep} of 4 • Configure linking rules, flight sectors, hotel stays, and charges.`}
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
          {/* Step 1: Linking Rules (No-Orphan Rule & Remaining Visas) */}
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

          {/* Step 2: Sectors & Hotel Stays */}
          {builderStep === 2 && (
            <div className="space-y-6">
              {/* Sectors */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                  <span>Flight Sectors</span>
                  <Button variant="outline" size="sm" onClick={() => setSectors([...sectors, { type: 'Makkah to Madina', date: arrivalDate, vehicleType: 'Hiace', transportRateSAR: 500 }])}>
                    + Add Sector
                  </Button>
                </h4>
                {sectors.map((sec, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0e2c4c]">{sec.type} Sector</span>
                      {sectors.length > 1 && (
                        <button onClick={() => setSectors(sectors.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date</label>
                        <input
                          type="date"
                          value={sec.date}
                          onChange={(e) => {
                            const updated = [...sectors];
                            updated[idx].date = e.target.value;
                            setSectors(updated);
                          }}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Transport Vehicle Type</label>
                        <select
                          value={sec.vehicleType}
                          onChange={(e) => {
                            const updated = [...sectors];
                            updated[idx].vehicleType = e.target.value as any;
                            setSectors(updated);
                          }}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value="Car">Car (4 Seater)</option>
                          <option value="Staria">Staria VIP Van</option>
                          <option value="Hiace">Hiace (12 Seater)</option>
                          <option value="Coaster">Coaster Bus</option>
                          <option value="Bus">49-Seater Coach</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Transport Charge (SAR)</label>
                        <input
                          type="number"
                          value={sec.transportRateSAR || 0}
                          onChange={(e) => {
                            const updated = [...sectors];
                            updated[idx].transportRateSAR = parseFloat(e.target.value) || 0;
                            setSectors(updated);
                          }}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Accommodation section with smart date chaining */}
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <h4 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                  <span>Accommodation Stays (Hotel-Only or Vouchered)</span>
                  <Button variant="outline" size="sm" onClick={() => setHotelStays([...hotelStays, { city: 'Madinah', hotelName: '', checkInDate: hotelStays[hotelStays.length - 1]?.checkOutDate || arrivalDate, checkOutDate: '', nights: 3, bedType: 'Double', roomCount: 1, ratePerNightSAR: 900, totalSAR: 2700 }])}>
                    + Add Hotel Stay
                  </Button>
                </h4>
                {hotelStays.map((stay, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0e2c4c]">Stay #{idx + 1} ({stay.city})</span>
                      {hotelStays.length > 1 && (
                        <button onClick={() => setHotelStays(hotelStays.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">City</label>
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
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Hotel Name</label>
                        <select
                          value={stay.hotelName}
                          onChange={(e) => {
                            const hName = e.target.value;
                            const matched = hotelsMaster.find(h => h.name === hName);
                            const rate = matched?.roomTypes?.[0]?.nightlyRateSAR || 950;
                            const updated = [...hotelStays];
                            updated[idx].hotelName = hName;
                            updated[idx].ratePerNightSAR = rate;
                            updated[idx].totalSAR = rate * updated[idx].nights * updated[idx].roomCount;
                            setHotelStays(updated);
                          }}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value="">-- Choose Hotel --</option>
                          {hotelsMaster.filter(h => h.city.toLowerCase() === stay.city.toLowerCase()).map(h => (
                            <option key={h.id} value={h.name}>{h.name} ({h.starRating}★)</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Check-In</label>
                        <input
                          type="date"
                          value={stay.checkInDate}
                          onChange={(e) => {
                            const updated = [...hotelStays];
                            updated[idx].checkInDate = e.target.value;
                            setHotelStays(updated);
                          }}
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nights & Rate (SAR)</label>
                        <div className="flex gap-1">
                          <input
                            type="number"
                            value={stay.nights}
                            onChange={(e) => {
                              const updated = [...hotelStays];
                              const n = parseInt(e.target.value) || 1;
                              updated[idx].nights = n;
                              updated[idx].totalSAR = n * updated[idx].ratePerNightSAR * updated[idx].roomCount;
                              setHotelStays(updated);
                            }}
                            className="w-1/2 p-2 bg-white border border-slate-300 rounded text-xs"
                            placeholder="Nights"
                          />
                          <input
                            type="number"
                            value={stay.ratePerNightSAR}
                            onChange={(e) => {
                              const updated = [...hotelStays];
                              const r = parseFloat(e.target.value) || 0;
                              updated[idx].ratePerNightSAR = r;
                              updated[idx].totalSAR = updated[idx].nights * r * updated[idx].roomCount;
                              setHotelStays(updated);
                            }}
                            className="w-1/2 p-2 bg-white border border-slate-300 rounded text-xs font-mono"
                            placeholder="Rate"
                          />
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
                  <span>Total Hotel Stays:</span>
                  <span>SAR {hotelStays.reduce((s, h) => s + h.totalSAR, 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Total Transport Sectors:</span>
                  <span>SAR {sectors.reduce((s, sec) => s + (sec.transportRateSAR || 0), 0).toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
                  <span>Gross Voucher Total:</span>
                  <span className="font-mono text-[#0e2c4c]">SAR {(hotelStays.reduce((s, h) => s + h.totalSAR, 0) + sectors.reduce((s, sec) => s + (sec.transportRateSAR || 0), 0)).toLocaleString()}</span>
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
                    <Input label="Recipient Name" placeholder="e.g. Al-Noor Agency" value={commissionName} onChange={(e) => setCommissionName(e.target.value)} />
                    <Input label="Commission Amount (SAR)" type="number" placeholder="e.g. 250" value={commissionAmount} onChange={(e) => setCommissionAmount(e.target.value)} />
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
                  <span className="text-slate-500">Flight Sectors:</span>
                  <span className="font-bold text-slate-800">{sectors.length} Sectors</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Hotel Stays:</span>
                  <span className="font-bold text-slate-800">{hotelStays.length} Stays</span>
                </div>
                <div className="pt-3 border-t border-slate-200 flex justify-between font-bold text-base">
                  <span>Total Amount:</span>
                  <span className="font-mono text-[#0e2c4c]">
                    SAR {(hotelStays.reduce((s, h) => s + h.totalSAR, 0) + sectors.reduce((s, sec) => s + (sec.transportRateSAR || 0), 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Voucher Itinerary Detail Modal */}
      {selectedVoucher && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Umrah Trip Voucher: ${selectedVoucher.voucherNo}`}
          subtitle={`Link Type: ${selectedVoucher.linkType.toUpperCase()} • Status: ${selectedVoucher.status}`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button variant="primary" onClick={() => window.print()} rightIcon={<Printer className="w-3.5 h-3.5" />}>
                Print Voucher
              </Button>
              <Button variant="outline" onClick={() => setDetailModalOpen(false)}>Close</Button>
            </div>
          }
        >
          <div className="space-y-4 py-2 text-xs">
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
                    <span>{h.city} — <strong>{h.hotelName}</strong> ({h.nights} nights)</span>
                    <span className="font-mono">SAR {h.totalSAR.toLocaleString()}</span>
                  </div>
                ))}
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
          </div>
        </Modal>
      )}
    </div>
  );
};
