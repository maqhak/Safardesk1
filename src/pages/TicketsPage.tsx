import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plane, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Printer, 
  Users, 
  ChevronRight, 
  X,
  DollarSign,
  AlertTriangle,
  Compass
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
import { useDeepOpen } from '../hooks/useDeepOpen';
import { TicketDoc, TicketPassenger } from '../types/ticket';
import { AirlineDoc, AirportRef } from '../types/master';
import { fetchTickets, createTicket, refundTicket } from '../services/ticketService';
import { getCurrentRate, useCurrentRate } from '../services/exchangeRateService';
import { fetchCustomers } from '../services/customerService';
import { fetchLedgerEntries } from '../services/accountingService';
import { downloadCSV } from '../utils/csv';
import { fetchAgents } from '../services/agentService';
import { fetchAirlines } from '../services/masterService';
import { fetchVendors } from '../services/masterService';

// IATA numeric ticket stock codes → 2-letter IATA airline code.
// E-ticket numbers start with the 3-digit airline code (e.g. 065... = Saudia).
const TICKET_STOCK_CODES: Record<string, string> = {
  '065': 'SV', '176': 'EK', '071': 'PK', '098': 'G9', '037': 'QR',
  '072': 'EY', '081': 'TK', '055': 'FZ', '016': 'WY', '069': 'GF',
  '026': 'KU', '030': 'RJ', '023': 'MS', '058': 'AI', '074': 'BA',
  '006': 'DL', '001': 'AA', '020': 'LH', '011': 'TG', '012': 'SQ',
  '105': 'UL', '044': 'BG', '027': 'LA', '075': 'IB', '080': 'LO',
};

export const TicketsPage: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const { success, error: showError } = useToast();
  const canCreate = useCan('Tickets', 'create');
  const isOwner = role === 'owner';

  const [activeTab, setActiveTab] = useState<'tickets' | 'manifest'>('tickets');
  const [tickets, setTickets] = useState<TicketDoc[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // New Ticket Modal Form
  const currentRate = useCurrentRate('SAR-PKR');
  const [exchangeRate, setExchangeRate] = useState<number>(currentRate);

  useEffect(() => {
    setExchangeRate(currentRate);
  }, [currentRate]);

  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [pnr, setPnr] = useState<string>('');
  const [airline, setAirline] = useState<AirlineDoc | null>(null);
  const [flightNo, setFlightNo] = useState<string>('');
  const [sectorFrom, setSectorFrom] = useState<AirportRef | null>(null);
  const [sectorTo, setSectorTo] = useState<AirportRef | null>(null);
  const [flightDate, setFlightDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [departureTime, setDepartureTime] = useState<string>('08:00');
  const [arrivalTime, setArrivalTime] = useState<string>('12:00');
  const [supplierName, setSupplierName] = useState<string>('Saudia GDS Direct');
  const [purchaseSource, setPurchaseSource] = useState<'vendor' | 'airline' | 'customer'>('airline');
  const [vendorsCache, setVendorsCache] = useState<any[]>([]);
  const [purchaseCost, setPurchaseCost] = useState<string>('');
  const [salePrice, setSalePrice] = useState<string>('');
  const [salePricePKR, setSalePricePKR] = useState<string>('');
  // Fare breakdown (voucher-style)
  const [basicFare, setBasicFare] = useState<string>('');
  const [otherTaxes, setOtherTaxes] = useState<string>('');
  const [psfPercent, setPsfPercent] = useState<string>('');
  const [airlineCommPercent, setAirlineCommPercent] = useState<string>('');
  const [whtPercent, setWhtPercent] = useState<string>('');
  const [airlinesCache, setAirlinesCache] = useState<AirlineDoc[]>([]);
  const [buyerType, setBuyerType] = useState<'customer' | 'agent'>('customer');
  const [buyerId, setBuyerId] = useState<string>('');
  const [passengers, setPassengers] = useState<TicketPassenger[]>([
    { name: '', passportNumber: '', ageType: 'Adult', ticketNo: '' }
  ]);

  // Ticket Detail E-Ticket View Modal
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);

  // Deep link: ?open=<pnr> opens the exact ticket record
  useDeepOpen(tickets, (t, ref) => t.pnr === ref, (t) => {
    setSelectedTicket(t);
    setDetailModalOpen(true);
  });
  const [selectedTicket, setSelectedTicket] = useState<TicketDoc | null>(null);

  // Manifest Tab Date picker
  const [manifestDate, setManifestDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tList, cList, aList, ledgerList, alList, vList] = await Promise.all([
        fetchTickets(),
        fetchCustomers(),
        fetchAgents(),
        fetchLedgerEntries(),
        fetchAirlines(),
        fetchVendors(),
      ]);
      setTickets(tList);
      setCustomers(cList);
      setAgents(aList);
      setLedgerEntries(ledgerList);
      setAirlinesCache(alList);
      setVendorsCache(vList);
      if (cList.length > 0 && !buyerId) {
        setBuyerId(cList[0].id);
      }
    } catch {
      showError('Failed to load ticketing desk records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Auto-detect airline from e-ticket number's 3-digit stock code
  const detectAirlineFromTicketNo = (ticketNo: string) => {
    const digits = ticketNo.replace(/\D/g, '');
    if (digits.length < 3) return;
    const code = digits.substring(0, 3);
    const iata = TICKET_STOCK_CODES[code];
    if (iata && airlinesCache.length > 0) {
      const match = airlinesCache.find((a) => a.iataCode.toUpperCase() === iata);
      if (match && (!airline || airline.iataCode !== match.iataCode)) {
        setAirline(match);
        success(`Airline auto-detected: ${match.name} (${match.iataCode})`);
      }
    }
  };

  const handleAddPassengerRow = () => {
    setPassengers([...passengers, { name: '', passportNumber: '', ageType: 'Adult', ticketNo: '' }]);
  };

  const handleSaveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!pnr.trim() || !airline || !sectorFrom || !sectorTo || !purchaseCost || !salePricePKR) {
      showError('Please complete all required fields (PNR, Airline, Sectors, Cost, Sale PKR).');
      return;
    }

    const costNum = parseFloat(purchaseCost);
    const pkrNum = parseFloat(salePricePKR);
    const rateNum = parseFloat(String(exchangeRate));
    if (isNaN(costNum) || isNaN(pkrNum) || costNum < 0 || pkrNum < 0) {
      showError('Please enter valid purchase and sale prices.');
      return;
    }
    if (isNaN(rateNum) || rateNum <= 0) {
      showError('Please enter a valid exchange rate (1 SAR = ? PKR).');
      return;
    }
    // Sale entered in PKR + exchange rate → SAR for the ledger
    const saleNum = Math.round((pkrNum / rateNum) * 100) / 100;

    // Fare breakdown calculations
    const bfNum = parseFloat(basicFare) || 0;
    const txNum = parseFloat(otherTaxes) || 0;
    const psfPNum = parseFloat(psfPercent) || 0;
    const commPNum = parseFloat(airlineCommPercent) || 0;
    const whtPNum = parseFloat(whtPercent) || 0;
    const psfAmtNum = Math.round(bfNum * psfPNum) / 100;
    const fareTotal = bfNum + txNum + psfAmtNum;
    const commAmtNum = Math.round(fareTotal * commPNum) / 100;
    const whtAmtNum = Math.round(commAmtNum * whtPNum) / 100;
    const netProfitNum = Math.round((commAmtNum - whtAmtNum) * 100) / 100;

    const buyerObj = buyerType === 'customer' 
      ? customers.find((c) => c.id === buyerId) 
      : agents.find((a) => a.id === buyerId);

    // Resolve purchase source name
    const resolvedSupplier = purchaseSource === 'airline'
      ? (airline ? `${airline.name} (${airline.iataCode}) Direct` : 'Direct Airline')
      : supplierName.trim();
    if (!resolvedSupplier) {
      showError('Please select a purchase source.');
      return;
    }

    setSaving(true);
    try {
      await createTicket(userProfile, {
        pnr: pnr.trim().toUpperCase(),
        airline,
        flightNo: flightNo.trim().toUpperCase(),
        sectorFrom,
        sectorTo,
        flightDate,
        departureTime,
        arrivalTime,
        passengers,
        purchaseCostSAR: costNum,
        salePriceSAR: saleNum,
        basicFareSAR: bfNum || undefined,
        otherTaxesSAR: txNum || undefined,
        psfPercent: psfPNum || undefined,
        psfAmountSAR: psfAmtNum || undefined,
        airlineCommPercent: commPNum || undefined,
        airlineCommAmountSAR: commAmtNum || undefined,
        whtPercent: whtPNum || undefined,
        whtAmountSAR: whtAmtNum || undefined,
        netProfitSAR: netProfitNum || undefined,
        supplierName: resolvedSupplier,
        buyerType,
        buyerId,
        buyerName: buyerObj?.fullName || buyerObj?.companyName || 'General Buyer',
        status: 'Issued',
        exchangeRateSARPKR: exchangeRate,
        commission: { enabled: false, recipientName: '', contact: '', amountSAR: 0, isPaid: false },
      });

      success(`Ticket PNR ${pnr.toUpperCase()} issued successfully and posted to ledger.`);
      setAddModalOpen(false);
      setPnr('');
      setFlightNo('');
      setPurchaseCost('');
      setSalePrice('');
      setSalePricePKR('');
      setBasicFare('');
      setOtherTaxes('');
      setPsfPercent('');
      setAirlineCommPercent('');
      setWhtPercent('');
      setPassengers([{ name: '', passportNumber: '', ageType: 'Adult', ticketNo: '' }]);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to issue ticket.');
    } finally {
      setSaving(false);
    }
  };

  const filteredTickets = tickets.filter((t) =>
    t.pnr.toLowerCase().includes(search.toLowerCase()) ||
    t.flightNo.toLowerCase().includes(search.toLowerCase()) ||
    t.passengers.some((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.passportNumber.toLowerCase().includes(search.toLowerCase()))
  );

  const exportTicketsExcel = () => {
    const rows = filteredTickets.map(tk => ({
      'PNR': tk.pnr,
      'Airline': tk.airline?.name || '',
      'Flight No': tk.flightNo,
      'Sector': `${tk.sectorFrom?.iata || ''} → ${tk.sectorTo?.iata || ''}`,
      'Flight Date': tk.flightDate,
      'Buyer': tk.buyerName,
      'Passengers': tk.passengers.length,
      'Cost SAR': tk.purchaseCostSAR,
      'Sale SAR': tk.salePriceSAR,
      'Margin SAR': tk.marginSAR,
      'Status': tk.status,
    }));
    downloadCSV(rows, 'tickets');
  };

  const columns: Column<TicketDoc>[] = [
    {
      key: 'pnr',
      header: 'PNR Reference',
      sortable: true,
      render: (row) => <span className="font-mono font-bold text-[var(--theme-primary)]">{row.pnr}</span>,
    },
    {
      key: 'flight',
      header: 'Flight & Airline',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-bold text-slate-800">{row.airline?.iataCode} {row.flightNo}</span>
          <span className="text-[11px] text-slate-500 block">{row.airline?.name}</span>
        </div>
      ),
    },
    {
      key: 'sector',
      header: 'Sector',
      render: (row) => (
        <span className="text-xs font-semibold text-slate-700">
          {row.sectorFrom?.iata} → {row.sectorTo?.iata}
        </span>
      ),
    },
    {
      key: 'flightDate',
      header: 'Date & Time',
      sortable: true,
      render: (row) => (
        <div>
          <span className="text-slate-800">{row.flightDate}</span>
          <span className="text-[11px] text-slate-500 block">{row.departureTime || '00:00'}</span>
        </div>
      ),
    },
    {
      key: 'salePriceSAR',
      header: 'Sale (SAR)',
      sortable: true,
      render: (row) => <span className="font-mono font-bold text-[var(--theme-primary)]">SAR {row.salePriceSAR.toLocaleString()}</span>,
    },
    {
      key: 'marginSAR',
      header: 'Margin (SAR)',
      sortable: true,
      render: (row) => <span className="font-mono font-bold text-emerald-600">SAR {row.marginSAR.toLocaleString()}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (row) => (
        <Badge variant={row.status === 'Issued' ? 'success' : row.status === 'Booked' ? 'warning' : 'danger'}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button variant="outline" size="sm" onClick={() => { setSelectedTicket(row); setDetailModalOpen(true); }} rightIcon={<ChevronRight className="w-3.5 h-3.5" />}>
          E-Ticket
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Airline Ticketing Desk & GDS PNR"
        subtitle="Manage standalone airline tickets, GDS PNR bookings, margins, and flight-wise manifest coordination."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Tickets' }]}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('tickets')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${activeTab === 'tickets' ? 'bg-white text-[var(--theme-primary)] shadow-xs' : 'text-slate-600'}`}
              >
                All Tickets
              </button>
              <button
                onClick={() => setActiveTab('manifest')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${activeTab === 'manifest' ? 'bg-white text-[var(--theme-primary)] shadow-xs' : 'text-slate-600'}`}
              >
                Flight Manifest
              </button>
            </div>
            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setAddModalOpen(true)}
              >
                Issue New Ticket
              </Button>
            )}
          </div>
        }
      />

      {activeTab === 'tickets' ? (
        <Card padding="none">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={exportTicketsExcel}>
                Export CSV
              </Button>
            </div>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by PNR, passenger name, flight..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
              />
            </div>
            <div className="text-xs text-slate-500 font-medium">
              Showing {filteredTickets.length} of {tickets.length} tickets
            </div>
          </div>

          <DataTable
            data={filteredTickets}
            columns={columns}
            keyExtractor={(row) => row.id}
            loading={loading}
            emptyTitle="No tickets found"
            emptyDescription="No airline tickets match your search."
          />
        </Card>
      ) : (
        /* Flight-wise Manifest Tab */
        <Card className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Flight-wise Pilgrim Manifest</h3>
              <p className="text-xs text-slate-500">Group passengers by flight for airport coordination and terminal dispatch.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700">Flight Date:</label>
              <input
                type="date"
                value={manifestDate}
                onChange={(e) => setManifestDate(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
              />
            </div>
          </div>

          <div className="space-y-4">
            {tickets.filter((t) => t.flightDate === manifestDate).length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">No flights scheduled for {manifestDate}.</div>
            ) : (
              tickets
                .filter((t) => t.flightDate === manifestDate)
                .map((t) => (
                  <div key={t.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#0e2c4c]/10 flex items-center justify-center text-[var(--theme-primary)] font-bold">
                          {t.airline?.iataCode}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">Flight {t.airline?.iataCode} {t.flightNo} ({t.sectorFrom?.iata} → {t.sectorTo?.iata})</h4>
                          <p className="text-xs text-slate-500">Departure: {t.departureTime || '00:00'} • PNR: <code>{t.pnr}</code></p>
                        </div>
                      </div>
                      <Badge variant="navy">{t.passengers.length} Passengers</Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
                      {t.passengers.map((p, idx) => (
                        <div key={idx} className="bg-white border border-slate-200 rounded-lg p-2.5 text-xs flex items-center justify-between">
                          <span className="font-bold text-slate-800">{idx + 1}. {p.name}</span>
                          <span className="font-mono text-slate-500">{p.passportNumber}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
            )}
          </div>
        </Card>
      )}

      {/* New Ticket Issue Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Issue New Airline Ticket (GDS PNR)"
        subtitle="Book standalone airline tickets. Fully separate flow from trip vouchers."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveTicket} loading={saving}>Issue & Post to Ledger</Button>
          </div>
        }
      >
        <form onSubmit={handleSaveTicket} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="PNR Reference"
                placeholder="e.g. SV982X"
                value={pnr}
                onChange={(e) => setPnr(e.target.value.toUpperCase())}
                required
              />
            </div>
            <div>
              <AirlineSelect
                label="Operating Airline"
                value={airline}
                onChange={setAirline}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Input
                label="Flight Number"
                placeholder="e.g. SV-734"
                value={flightNo}
                onChange={(e) => setFlightNo(e.target.value.toUpperCase())}
                required
              />
            </div>
            <div>
              <AirportSelect
                label="Origin (From)"
                value={sectorFrom}
                onChange={setSectorFrom}
                required
              />
            </div>
            <div>
              <AirportSelect
                label="Destination (To)"
                value={sectorTo}
                onChange={setSectorTo}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Input
                label="Flight Date"
                type="date"
                value={flightDate}
                onChange={(e) => setFlightDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Input
                label="Departure Time"
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Ticket Purchase Source</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'vendor', label: 'Vendor', desc: 'Consolidator / Shirka' },
                  { key: 'airline', label: 'Direct Airline', desc: 'Airline stock / GDS' },
                  { key: 'customer', label: 'Customer', desc: 'Buy-back / reissue' },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPurchaseSource(opt.key)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      purchaseSource === opt.key
                        ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 ring-1 ring-[var(--theme-primary)]'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className={`text-xs font-bold ${purchaseSource === opt.key ? 'text-[var(--theme-primary)]' : 'text-slate-700'}`}>{opt.label}</div>
                    <div className="text-[10px] text-slate-500">{opt.desc}</div>
                  </button>
                ))}
              </div>
              <div className="mt-2">
                {purchaseSource === 'vendor' && (
                  <select
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                    required
                  >
                    <option value="">Select vendor...</option>
                    {vendorsCache.map((v: any) => (
                      <option key={v.id} value={v.name || v.companyName}>{v.name || v.companyName}</option>
                    ))}
                  </select>
                )}
                {purchaseSource === 'airline' && (
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
                    Source: <span className="font-bold">{airline ? `${airline.name} (${airline.iataCode})` : 'Select airline above'}</span>
                  </div>
                )}
                {purchaseSource === 'customer' && (
                  <select
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded text-xs"
                    required
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c: any) => (
                      <option key={c.id} value={c.fullName || c.companyName}>{c.fullName || c.companyName}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <Input
                label="Purchase Cost (SAR)"
                type="number"
                step="0.01"
                placeholder="e.g. 1450"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  label="Sale Price (PKR)"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 150000"
                  value={salePricePKR}
                  onChange={(e) => setSalePricePKR(e.target.value)}
                  required
                />
              </div>
              <div>
                <Input
                  label="Exchange Rate (1 SAR = PKR)"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 74.5"
                  value={String(exchangeRate)}
                  onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
                  required
                />
              </div>
            </div>
          </div>

          {salePricePKR && parseFloat(String(exchangeRate)) > 0 && (
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-xs font-semibold text-sky-800 flex items-center justify-between">
              <span>Sale in SAR (posts to ledger):</span>
              <span className="font-mono text-sm">SAR {(parseFloat(salePricePKR) / parseFloat(String(exchangeRate))).toFixed(2)}</span>
            </div>
          )}

          {purchaseCost && salePricePKR && parseFloat(String(exchangeRate)) > 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 flex items-center justify-between">
              <span>Calculated Agency Margin:</span>
              <span className="font-mono text-sm">SAR {(parseFloat(salePricePKR) / parseFloat(String(exchangeRate)) - parseFloat(purchaseCost)).toFixed(2)}</span>
            </div>
          )}

          {/* Fare Breakdown & Commission (voucher-style) */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Fare Breakdown & Commission</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Input label="Basic Fare (SAR)" type="number" step="0.01" placeholder="e.g. 1200"
                  value={basicFare} onChange={(e) => setBasicFare(e.target.value)} />
              </div>
              <div>
                <Input label="Other Taxes (SAR)" type="number" step="0.01" placeholder="e.g. 150"
                  value={otherTaxes} onChange={(e) => setOtherTaxes(e.target.value)} />
              </div>
              <div>
                <Input label="PSF %" type="number" step="0.01" placeholder="e.g. 2.5"
                  value={psfPercent} onChange={(e) => setPsfPercent(e.target.value)} />
              </div>
              <div>
                <Input label="Airline Comm. %" type="number" step="0.01" placeholder="e.g. 5"
                  value={airlineCommPercent} onChange={(e) => setAirlineCommPercent(e.target.value)} />
              </div>
              <div>
                <Input label="WHT %" type="number" step="0.01" placeholder="e.g. 4"
                  value={whtPercent} onChange={(e) => setWhtPercent(e.target.value)} />
              </div>
            </div>
            {(() => {
              const bf = parseFloat(basicFare) || 0;
              const tx = parseFloat(otherTaxes) || 0;
              const psfP = parseFloat(psfPercent) || 0;
              const commP = parseFloat(airlineCommPercent) || 0;
              const whtP = parseFloat(whtPercent) || 0;
              const psfAmt = bf * psfP / 100;
              const total = bf + tx + psfAmt;
              const commAmt = total * commP / 100;
              const whtAmt = commAmt * whtP / 100;
              const net = commAmt - whtAmt;
              if (!bf && !tx && !commP) return null;
              return (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-800 space-y-1">
                  <div className="flex justify-between"><span>Total Fare (Basic + Taxes + PSF):</span><span className="font-mono">SAR {total.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Airline Commission ({commP}%):</span><span className="font-mono">SAR {commAmt.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>WHT ({whtP}%):</span><span className="font-mono text-rose-700">- SAR {whtAmt.toFixed(2)}</span></div>
                  <div className="flex justify-between border-t border-amber-200 pt-1"><span>Net Commission Profit:</span><span className="font-mono text-emerald-700">SAR {net.toFixed(2)}</span></div>
                </div>
              );
            })()}
          </div>

          {/* Buyer selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Buyer Type</label>
              <select
                value={buyerType}
                onChange={(e) => {
                  setBuyerType(e.target.value as any);
                  setBuyerId(e.target.value === 'customer' ? customers[0]?.id : agents[0]?.id);
                }}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800"
              >
                <option value="customer">Direct B2C Customer</option>
                <option value="agent">B2B Sub-Agent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Select Buyer</label>
              <select
                value={buyerId}
                onChange={(e) => setBuyerId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800"
              >
                {buyerType === 'customer' ? (
                  customers.map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.passportNumber})</option>)
                ) : (
                  agents.map((a) => <option key={a.id} value={a.id}>{a.companyName} ({a.agentCode})</option>)
                )}
              </select>
            </div>
          </div>

          {/* Passengers */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">Passengers</label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddPassengerRow}>+ Add Passenger</Button>
            </div>
            {passengers.map((p, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <input
                  type="text"
                  placeholder="Passenger Full Name"
                  value={p.name}
                  onChange={(e) => {
                    const updated = [...passengers];
                    updated[idx].name = e.target.value;
                    setPassengers(updated);
                  }}
                  className="p-2 bg-white border border-slate-300 rounded text-xs"
                  required
                />
                <input
                  type="text"
                  placeholder="Passport Number"
                  value={p.passportNumber}
                  onChange={(e) => {
                    const updated = [...passengers];
                    updated[idx].passportNumber = e.target.value.toUpperCase();
                    setPassengers(updated);
                  }}
                  className="p-2 bg-white border border-slate-300 rounded text-xs"
                  required
                />
                <input
                  type="text"
                  placeholder="E-Ticket No (Optional)"
                  value={p.ticketNo}
                  onChange={(e) => {
                    const updated = [...passengers];
                    updated[idx].ticketNo = e.target.value;
                    setPassengers(updated);
                    detectAirlineFromTicketNo(e.target.value);
                  }}
                  className="p-2 bg-white border border-slate-300 rounded text-xs"
                />
              </div>
            ))}
          </div>
        </form>
      </Modal>

      {/* E-Ticket Detail Modal */}
      {selectedTicket && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`E-Ticket Itinerary: PNR ${selectedTicket.pnr}`}
          subtitle={`Issued: ${selectedTicket.createdAt.split('T')[0]} • Status: ${selectedTicket.status}`}
          footer={
            <div className="flex items-center justify-between w-full">
              {isOwner && selectedTicket.status !== 'Refunded' && (
                <Button variant="danger" size="sm" onClick={async () => { await refundTicket(userProfile!, selectedTicket.id, 'Full refund'); success('Ticket refunded.'); setDetailModalOpen(false); await loadData(); }}>
                  Process Refund
                </Button>
              )}
              <Button variant="primary" onClick={() => window.print()} rightIcon={<Printer className="w-3.5 h-3.5" />}>
                Print E-Ticket
              </Button>
            </div>
          }
        >
          <div className="space-y-6 py-2 text-xs">
            {/* E-Ticket Header */}
            <div className="bg-[#0e2c4c] text-white rounded-xl p-5 flex items-center justify-between">
              <div>
                <div className="text-slate-300 uppercase text-[10px] tracking-wider">Electronic Ticket Itinerary & Receipt</div>
                <div className="text-3xl font-mono font-bold mt-1 text-[#c9a227]">{selectedTicket.pnr}</div>
                <div className="text-slate-200 text-xs mt-1">Airline: {selectedTicket.airline?.name} ({selectedTicket.airline?.iataCode})</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-mono font-bold">SAR {selectedTicket.salePriceSAR.toLocaleString()}</div>
                <div className="text-emerald-400 font-mono text-[11px]">Margin: SAR {selectedTicket.marginSAR}</div>
              </div>
            </div>

            {/* Flight Details */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="text-slate-500 block">Flight</span>
                <span className="font-bold text-slate-900 text-sm">{selectedTicket.airline?.iataCode} {selectedTicket.flightNo}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Route</span>
                <span className="font-bold text-slate-900 text-sm">{selectedTicket.sectorFrom?.iata} → {selectedTicket.sectorTo?.iata}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Date & Time</span>
                <span className="font-bold text-slate-900 text-sm">{selectedTicket.flightDate} ({selectedTicket.departureTime})</span>
              </div>
              <div>
                <span className="text-slate-500 block">Buyer</span>
                <span className="font-bold text-[var(--theme-primary)] text-sm">{selectedTicket.buyerName}</span>
              </div>
            </div>

            {/* Passengers */}
            <div>
              <h5 className="font-bold text-slate-900 mb-2">Passenger & E-Ticket Numbers</h5>
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                {selectedTicket.passengers.map((p, i) => (
                  <div key={i} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-800">{p.name}</div>
                      <div className="text-slate-500 font-mono">Passport: {p.passportNumber}</div>
                    </div>
                    <span className="font-mono font-bold text-[var(--theme-primary)]">Ticket: {p.ticketNo || 'TBD'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ticket Ledger Entries */}
            <div>
              <h5 className="font-bold text-slate-900 mb-2">Ticket Ledger Entries</h5>
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
                    {ledgerEntries.filter(e => e.transNo === selectedTicket.pnr).map(e => (
                      <tr key={e.id} className="border-t border-slate-100">
                        <td className="p-2 font-mono">{e.date}</td>
                        <td className="p-2">{e.particulars}</td>
                        <td className="p-2 text-right font-mono">{e.debitSAR ? e.debitSAR.toLocaleString() : '—'}</td>
                        <td className="p-2 text-right font-mono">{e.creditSAR ? e.creditSAR.toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                    {ledgerEntries.filter(e => e.transNo === selectedTicket.pnr).length === 0 && (
                      <tr><td colSpan={4} className="p-3 text-center text-slate-400">No ledger entries posted for this ticket.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
