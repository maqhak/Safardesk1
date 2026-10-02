import React, { useState, useEffect } from 'react';
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
import { HotelDoc, VehicleDoc } from '../types/master';
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
  const [selectedVisaIds, setSelectedVisaIds] = useState<string[]>([]);
  const [hotelsMaster, setHotelsMaster] = useState<HotelDoc[]>([]);
  const [vehiclesMaster, setVehiclesMaster] = useState<VehicleDoc[]>([]);

  // Sectors state
  const [sectors, setSectors] = useState<SectorItem[]>([
    { type: 'Arrival', date: new Date().toISOString().split('T')[0], flightNo: '', vehicleType: 'Staria' }
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
      const [vList, visaList, hList, vList2] = await Promise.all([
        fetchVouchers(),
        fetchVisas(),
        fetchHotels(),
        fetchVehicles(),
      ]);
      setVouchers(vList);
      setAvailableVisas(visaList);
      setHotelsMaster(hList);
      setVehiclesMaster(vList2);
    } catch {
      showError('Failed to load vouchers directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openBuilder = () => {
    setBuilderStep(1);
    setSelectedVisaIds([]);
    setBuilderOpen(true);
  };

  const handleSaveVoucher = async () => {
    if (!userProfile) return;

    // No-orphan check: must have at least one visa or customer
    if (selectedVisaIds.length === 0) {
      showError('No-orphan rule: Voucher must be linked to at least one pilgrim visa.');
      return;
    }

    const selectedVisasData = availableVisas.filter((v) => selectedVisaIds.includes(v.id));
    const passengers = selectedVisasData.map((v) => ({
      name: v.pilgrimName,
      passportNumber: v.passportNumber,
      ageType: 'Adult' as const,
      visaId: v.id,
    }));

    // Calculate totals
    const hotelsSAR = hotelStays.reduce((sum, h) => sum + (h.totalSAR || 0), 0);
    const transportSAR = sectors.reduce((sum, s) => sum + (s.transportRateSAR || 0), 0);
    const totalSAR = hotelsSAR + transportSAR;
    const totalPKR = convert(totalSAR, getCurrentRate('SAR-PKR')); // using active SAR/PKR master rate

    setSaving(true);
    try {
      await createVoucher(userProfile, {
        linkType: 'visa',
        visaIds: selectedVisaIds,
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

  function nationalityRateCheck(h: HotelStayItem) {
    return 0; // helper
  }

  const handleCancelVoucher = async (vchId: string) => {
    if (!userProfile) return;
    try {
      await cancelVoucher(userProfile, vchId);
      success('Voucher cancelled successfully. Reversing ledger entries posted.');
      setDetailModalOpen(false);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to cancel voucher.');
    }
  };

  const exportFilteredExcel = () => {
    const csvContent = "VoucherNo,Date,PassengersCount,TotalSAR,Status\n" +
      filteredVouchers.map((v) => `${v.voucherNo},${v.createdAt.split('T')[0]},${v.passengers.length},${v.totals.totalSAR},${v.status}`).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'safardesk_vouchers_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success('Vouchers export downloaded successfully.');
  };

  const filteredVouchers = vouchers.filter((v) => {
    const matchesSearch = 
      v.voucherNo.toLowerCase().includes(search.toLowerCase()) ||
      v.passengers.some((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.passportNumber.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || v.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  const columns: Column<VoucherDoc>[] = [
    {
      key: 'voucherNo',
      header: 'Voucher No',
      sortable: true,
      render: (row) => <span className="font-mono font-bold text-[#0e2c4c]">{row.voucherNo}</span>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: (row) => <span className="text-slate-600">{row.createdAt.split('T')[0]}</span>,
    },
    {
      key: 'passengers',
      header: 'Passengers (Breakup)',
      render: (row) => (
        <div>
          <span className="font-bold text-slate-800">{row.passengers.length} Pax</span>
          <span className="text-[11px] text-slate-500 block">
            ({row.passengers.filter(p => p.ageType === 'Adult').length} Adult, {row.passengers.filter(p => p.ageType === 'Child').length} Child)
          </span>
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route Summary',
      render: (row) => (
        <span className="text-xs text-slate-700">
          {row.sectors.length > 0 ? `${row.sectors[0].type} → ${row.sectors[row.sectors.length - 1].type}` : 'Direct Hotel'}
        </span>
      ),
    },
    {
      key: 'totals',
      header: 'Total (SAR / PKR)',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-mono font-bold text-[#0e2c4c]">SAR {row.totals.totalSAR.toLocaleString()}</div>
          <div className="text-[11px] font-mono text-emerald-600">PKR {row.totals.totalPKR.toLocaleString()}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => (
        <Badge variant={row.status === 'Confirmed' ? 'success' : row.status === 'Draft' ? 'warning' : 'danger'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button variant="outline" size="sm" onClick={() => { setSelectedVoucher(row); setDetailModalOpen(true); }} rightIcon={<ChevronRight className="w-3.5 h-3.5" />}>
          View Voucher
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trip Vouchers & Accommodation Desk"
        subtitle="Manage unified trip vouchers combining hotel stays, transport sectors, and pilgrim passenger manifests."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Vouchers' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-4 h-4 text-slate-600" />}
              onClick={exportFilteredExcel}
            >
              Export Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<FileCheck className="w-4 h-4 text-[#c9a227]" />}
              onClick={() => setVerificationModalOpen(true)}
            >
              Verification Lists
            </Button>
            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={openBuilder}
              >
                New Unified Voucher
              </Button>
            )}
          </div>
        }
      />

      {/* Vouchers Table */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by voucher no, pilgrim name, passport..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="draft">Draft</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <div className="text-xs text-slate-500 font-medium">
              {filteredVouchers.length} Vouchers
            </div>
          </div>
        </div>

        <DataTable
          data={filteredVouchers}
          columns={columns}
          keyExtractor={(row) => row.id}
          loading={loading}
          emptyTitle="No vouchers found"
          emptyDescription="No trip vouchers match your filter criteria."
        />
      </Card>

      {/* New Voucher Builder Modal (4-Step Wizard) */}
      <Modal
        isOpen={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title="New Unified Trip Voucher Builder"
        subtitle={`Step ${builderStep} of 4: ${
          builderStep === 1 ? 'Select Pilgrims (Remaining Visas)' :
          builderStep === 2 ? 'Flight Sectors & Hotel Stays' :
          builderStep === 3 ? 'Charges & Commission' : 'Review & Confirm'
        }`}
        footer={
          <div className="flex items-center justify-between w-full">
            <div>
              {builderStep > 1 && (
                <Button variant="outline" onClick={() => setBuilderStep((builderStep - 1) as any)}>Previous Step</Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => setBuilderOpen(false)}>Cancel</Button>
              {builderStep < 4 ? (
                <Button variant="primary" onClick={() => setBuilderStep((builderStep + 1) as any)}>Next Step</Button>
              ) : (
                <Button variant="primary" onClick={handleSaveVoucher} loading={saving}>Save & Post Voucher</Button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-6 py-2">
          {/* Progress Strip */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-bold">
            <div className={`p-2 rounded-lg ${builderStep === 1 ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600'}`}>1. Pilgrims</div>
            <div className={`p-2 rounded-lg ${builderStep === 2 ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600'}`}>2. Sectors & Hotels</div>
            <div className={`p-2 rounded-lg ${builderStep === 3 ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600'}`}>3. Charges</div>
            <div className={`p-2 rounded-lg ${builderStep === 4 ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600'}`}>4. Review</div>
          </div>

          {builderStep === 1 && (
            <div className="space-y-4">
              <div className="text-xs text-slate-600">
                Pick pilgrims from distributed visas. Only pilgrims whose voucher is not yet created are shown ("remaining only").
              </div>
              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {availableVisas.length === 0 ? (
                  <div className="p-6 text-center text-sm text-slate-500">No distributed visas available.</div>
                ) : (
                  availableVisas.map((visa) => {
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
                  <span>Accommodation Stays (Smart Chaining)</span>
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
                        <input
                          type="text"
                          value={stay.hotelName}
                          onChange={(e) => {
                            const updated = [...hotelStays];
                            updated[idx].hotelName = e.target.value;
                            setHotelStays(updated);
                          }}
                          placeholder="e.g. Fairmont Makkah"
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                        />
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
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nights</label>
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
                          className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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

          {builderStep === 4 && (
            <div className="space-y-4 text-xs">
              <h4 className="font-bold text-slate-900 text-sm">Review Trip Voucher Summary</h4>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-500">Linked Pilgrims:</span>
                  <span className="font-bold text-slate-800">{selectedVisaIds.length} Pilgrims Selected</span>
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

      {/* Voucher Detail Review Modal */}
      {selectedVoucher && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Trip Voucher Details: ${selectedVoucher.voucherNo}`}
          subtitle={`Status: ${selectedVoucher.status} • Created: ${selectedVoucher.createdAt.split('T')[0]}`}
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {isOwner && selectedVoucher.status !== 'Cancelled' && (
                  <Button variant="danger" size="sm" onClick={() => handleCancelVoucher(selectedVoucher.id)}>Cancel Voucher</Button>
                )}
                {isOwner && selectedVoucher.commission.enabled && !selectedVoucher.commission.isPaid && (
                  <Button variant="outline" size="sm" onClick={async () => { await markCommissionPaid(userProfile!, selectedVoucher.id); success('Commission marked paid.'); setDetailModalOpen(false); await loadData(); }}>
                    Mark Commission Paid
                  </Button>
                )}
              </div>
              <Button variant="primary" onClick={() => window.print()} rightIcon={<Printer className="w-3.5 h-3.5" />}>
                Print / PDF Voucher
              </Button>
            </div>
          }
        >
          <div className="space-y-6 py-2 text-xs">
            {/* Summary Banner */}
            <div className="bg-[#0e2c4c] text-white rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-slate-300 uppercase text-[10px] tracking-wider">Official Unified Trip Voucher</div>
                <div className="text-2xl font-mono font-bold mt-1 text-[#c9a227]">{selectedVoucher.voucherNo}</div>
                <div className="text-slate-200 text-xs mt-1">Created by {selectedVoucher.createdByName}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono font-bold">SAR {selectedVoucher.totals.totalSAR.toLocaleString()}</div>
                <div className="text-emerald-400 font-mono">PKR {selectedVoucher.totals.totalPKR.toLocaleString()}</div>
              </div>
            </div>

            {/* Passenger Manifest */}
            <div>
              <h5 className="font-bold text-slate-900 mb-2">Passenger Manifest ({selectedVoucher.passengers.length} Pax)</h5>
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                {selectedVoucher.passengers.map((p, i) => (
                  <div key={i} className="p-2.5 flex items-center justify-between">
                    <span className="font-bold text-slate-800">{p.name}</span>
                    <span className="font-mono text-slate-600">Passport: {p.passportNumber} ({p.ageType})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Hotel Stays */}
            <div>
              <h5 className="font-bold text-slate-900 mb-2">Hotel Accommodation</h5>
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                {selectedVoucher.hotelStays.map((h, i) => (
                  <div key={i} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-[#0e2c4c]">{h.hotelName} ({h.city})</div>
                      <div className="text-slate-500">Check-in: {h.checkInDate} • Check-out: {h.checkOutDate} ({h.nights} nights)</div>
                    </div>
                    <span className="font-mono font-bold text-slate-800">SAR {h.totalSAR}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Verification Lists Modal */}
      <Modal
        isOpen={verificationModalOpen}
        onClose={() => setVerificationModalOpen(false)}
        title="Pilgrim Voucher Verification Lists"
        subtitle="Download reconciliation lists of pilgrims with and without created vouchers."
        footer={<Button variant="primary" onClick={() => setVerificationModalOpen(false)}>Close</Button>}
      >
        <div className="space-y-4 py-2">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Vouchers Created List</h4>
              <p className="text-xs text-slate-500">Pilgrims who have active trip vouchers assigned.</p>
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => {
                const csv = "PilgrimName,PassportNumber,GroupCode,VoucherNo\n" + vouchers.flatMap(v => v.passengers.map(p => `${p.name},${p.passportNumber},GRP-01,${v.voucherNo}`)).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const l = document.createElement('a'); l.href = url; l.download = 'vouchers_created_list.csv'; l.click();
                success('Vouchers Created list downloaded.');
              }}
            >
              Download CSV
            </Button>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Vouchers Pending List</h4>
              <p className="text-xs text-slate-500">Distributed visa pilgrims waiting for trip vouchers.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => {
                const csv = "PilgrimName,PassportNumber,GroupCode,Status\n" + availableVisas.map(v => `${v.pilgrimName},${v.passportNumber},${v.groupCode},Pending`).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const l = document.createElement('a'); l.href = url; l.download = 'vouchers_pending_list.csv'; l.click();
                success('Vouchers Pending list downloaded.');
              }}
            >
              Download CSV
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
