import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calculator, 
  CreditCard, 
  Calendar, 
  Ticket, 
  Hotel, 
  FileCheck, 
  ArrowRight,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  ShieldAlert,
  Users
} from 'lucide-react';
import { KaabaIcon, MasjidNabawiIcon } from '../components/ui/HolySiteIcons';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fetchVouchers } from '../services/voucherService';
import { fetchVisas, VisaDoc } from '../services/visaService';
import { fetchLedgerEntries, fetchLedgerAccounts } from '../services/accountingService';
import { useCurrentRate, updateExchangeRate, formatConvertedMoney } from '../services/exchangeRateService';
import { VoucherDoc } from '../types/voucher';
import { LedgerEntryDoc, LedgerAccountDoc } from '../types/accounting';

export const DashboardPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, info } = useToast();
  const navigate = useNavigate();

  const [vouchers, setVouchers] = useState<VoucherDoc[]>([]);
  const [visas, setVisas] = useState<VisaDoc[]>([]);
  const [entries, setEntries] = useState<LedgerEntryDoc[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Period Switcher for Account Summary
  const [accountPeriod, setAccountPeriod] = useState<'all' | 'month' | 'today'>('all');

  // Exchange rate from Master
  const currentRate = useCurrentRate('SAR-PKR');
  const [exchangeRate, setExchangeRate] = useState<number>(currentRate);

  useEffect(() => {
    setExchangeRate(currentRate);
  }, [currentRate]);

  // Package Calculator State
  const [calcPax, setCalcPax] = useState<number>(2);
  const [calcFlight, setCalcFlight] = useState<number>(1200);
  const [calcVisa, setCalcVisa] = useState<number>(450);
  const [calcMakkah1Nights, setCalcMakkah1Nights] = useState<number>(3);
  const [calcMakkah1Rate, setCalcMakkah1Rate] = useState<number>(400);
  const [calcMadinaNights, setCalcMadinaNights] = useState<number>(3);
  const [calcMadinaRate, setCalcMadinaRate] = useState<number>(350);
  const [calcMakkah2Nights, setCalcMakkah2Nights] = useState<number>(2);
  const [calcMakkah2Rate, setCalcMakkah2Rate] = useState<number>(450);
  const [includeTransport, setIncludeTransport] = useState<boolean>(true);
  const [calcTransportFee, setCalcTransportFee] = useState<number>(650);

  // KSA Status Date Selector
  const [ksaDate, setKsaDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [calcOpen, setCalcOpen] = useState<boolean>(false);

  useEffect(() => {
    Promise.all([fetchVouchers(), fetchVisas(), fetchLedgerEntries(), fetchLedgerAccounts()])
      .then(([vList, visList, eList, accList]) => {
        setVouchers(vList);
        setVisas(visList);
        setEntries(eList);
        setAccounts(accList);
      })
      .finally(() => setLoading(false));
  }, []);

  // 1. Package Calculator Totals
  const hotelTotalSAR = (calcMakkah1Nights * calcMakkah1Rate) + 
                        (calcMadinaNights * calcMadinaRate) + 
                        (calcMakkah2Nights * calcMakkah2Rate);
  const transportSAR = includeTransport ? calcTransportFee : 0;
  const perPersonSAR = calcFlight + calcVisa + hotelTotalSAR + (transportSAR / Math.max(1, calcPax));
  const fullGroupSAR = perPersonSAR * calcPax;

  // 2. Account Summary Computed from Real Ledger Entries & Invoices
  const filteredEntries = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);

    return entries.filter(e => {
      if (e.isVoid) return false;
      if (accountPeriod === 'today') return e.date === today;
      if (accountPeriod === 'month') return e.date.startsWith(currentMonth);
      return true; // all time
    });
  }, [entries, accountPeriod]);

  const accountSummaryMetrics = useMemo(() => {
    let bookingsPax = 0;
    let bookingsAmtSAR = 0;
    let ticketsCount = 0;
    let ticketsAmtSAR = 0;
    let refundsCount = 0;
    let refundsAmtSAR = 0;
    let servicesCount = 0;
    let servicesAmtSAR = 0;
    let reservationsCount = 0;
    let reservationsAmtSAR = 0;
    let overseasAmtSAR = 0;
    let onlyHotelAmtSAR = 0;
    let onlyHotelStays = 0;
    let onlyTransportAmtSAR = 0;
    let onlyTransportTransfers = 0;

    const totalOpenings = accounts.reduce((s, a) => s + (a.openingBalanceSAR || 0), 0);
    let totalInvoices = 0;
    let totalPayments = 0;
    let totalAdjustments = 0;

    filteredEntries.forEach(e => {
      if (e.entryType === 'Invoice') {
        totalInvoices += e.creditSAR || e.debitSAR || 0;
        if (e.transNo?.includes('TKT') || e.particulars?.toLowerCase().includes('ticket')) {
          ticketsCount += 1;
          ticketsAmtSAR += e.debitSAR || e.creditSAR || 0;
        } else {
          bookingsPax += e.paxCount || 1;
          bookingsAmtSAR += e.debitSAR || e.creditSAR || 0;
        }
      } else if (e.entryType === 'Payment') {
        totalPayments += e.debitSAR || e.creditSAR || 0;
      } else if (e.entryType === 'Refund') {
        refundsCount += 1;
        refundsAmtSAR += e.debitSAR || e.creditSAR || 0;
      } else if (e.entryType === 'Voucher Charge') {
        servicesCount += 1;
        servicesAmtSAR += e.debitSAR || 0;
        if (e.particulars?.toLowerCase().includes('hotel') || e.particulars?.toLowerCase().includes('fairmont') || e.particulars?.toLowerCase().includes('pullman')) {
          onlyHotelStays += 1;
          onlyHotelAmtSAR += e.debitSAR || 0;
        } else if (e.particulars?.toLowerCase().includes('transfer') || e.particulars?.toLowerCase().includes('transport') || e.particulars?.toLowerCase().includes('gmc')) {
          onlyTransportTransfers += 1;
          onlyTransportAmtSAR += e.debitSAR || 0;
        }
      } else if (e.entryType === 'Adjustment') {
        totalAdjustments += e.debitSAR || e.creditSAR || 0;
      }
    });

    const balanceDue = totalOpenings + totalInvoices - totalPayments + totalAdjustments;

    return {
      bookingsPax,
      bookingsAmtSAR,
      ticketsCount,
      ticketsAmtSAR,
      refundsCount,
      refundsAmtSAR,
      servicesCount,
      servicesAmtSAR,
      reservationsCount,
      reservationsAmtSAR,
      overseasAmtSAR,
      onlyHotelStays,
      onlyHotelAmtSAR,
      onlyTransportTransfers,
      onlyTransportAmtSAR,
      totalOpenings,
      totalInvoices,
      totalPayments,
      totalAdjustments,
      balanceDue,
    };
  }, [filteredEntries, accounts]);

  // 3. KSA Status computed from vouchers for selected date
  const ksaStatusCounts = useMemo(() => {
    let arrival = 0;
    let departure = 0;
    let makkahIn = 0;
    let makkahOut = 0;
    let madinaIn = 0;
    let madinaOut = 0;
    let insideKsa = 0;
    let inMakkah = 0;
    let inMadinah = 0;

    vouchers.forEach(v => {
      const paxCount = v.passengers?.length || 1;
      
      // Check sectors
      v.sectors?.forEach(s => {
        if (s.date === ksaDate) {
          if (s.type === 'Arrival') arrival += paxCount;
          if (s.type === 'Departure') departure += paxCount;
        }
      });

      // Check hotel stays
      v.hotelStays?.forEach(h => {
        if (h.checkInDate === ksaDate) {
          if (h.city === 'Makkah') makkahIn += paxCount;
          if (h.city === 'Madinah') madinaIn += paxCount;
        }
        if (h.checkOutDate === ksaDate) {
          if (h.city === 'Makkah') makkahOut += paxCount;
          if (h.city === 'Madinah') madinaOut += paxCount;
        }
        // Active on selected date
        if (ksaDate >= h.checkInDate && ksaDate <= h.checkOutDate) {
          insideKsa += paxCount;
          if (h.city === 'Makkah') inMakkah += paxCount;
          if (h.city === 'Madinah') inMadinah += paxCount;
        }
      });
    });

    return { arrival, departure, makkahIn, makkahOut, madinaIn, madinaOut, insideKsa, inMakkah, inMadinah };
  }, [vouchers, ksaDate]);

  // 4. Bookings & Vouchers demographics breakup
  const bookingsDemographics = useMemo(() => {
    let adults = 0;
    let children = 0;
    let infants = 0;

    vouchers.forEach(v => {
      v.passengers?.forEach(p => {
        if (p.ageType === 'Child') children++;
        else if (p.ageType === 'Infant') infants++;
        else adults++;
      });
    });

    const total = adults + children + infants;
    return { total, adults, children, infants };
  }, [vouchers]);

  const vouchersDemographics = useMemo(() => {
    let adults = 0;
    let children = 0;
    let infants = 0;

    vouchers.forEach(v => {
      v.passengers?.forEach(p => {
        if (p.ageType === 'Child') children++;
        else if (p.ageType === 'Infant') infants++;
        else adults++;
      });
    });

    const total = adults + children + infants;
    return { total, adults, children, infants };
  }, [vouchers]);

  // 4b. Voucher Completion Report — pilgrims with vouchers vs remaining (numbers)
  const voucherCompletion = useMemo(() => {
    const usedVisaIds = new Set<string>();
    vouchers.forEach((v) => {
      if (v.status === 'Cancelled') return;
      (v.visaIds || []).forEach((id) => usedVisaIds.add(id));
    });
    const total = visas.length;
    const done = visas.filter((v) => usedVisaIds.has(v.id)).length;
    const remaining = Math.max(0, total - done);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, remaining, pct };
  }, [vouchers, visas]);

  // 5. Latest Umrah Group Packages from real visa import data
  const latestGroups = useMemo(() => {
    const groupMap = new Map<string, { groupCode: string; groupName: string; paxCount: number; date: string; agent?: string }>();
    visas.forEach(v => {
      const code = v.groupCode || 'GRP-GENERAL';
      const existing = groupMap.get(code);
      if (existing) {
        existing.paxCount += 1;
      } else {
        groupMap.set(code, {
          groupCode: code,
          groupName: v.groupName || 'Umrah Group Package',
          paxCount: 1,
          date: v.visaIssueDate || v.createdAt?.split('T')[0] || '2026-10-01',
          agent: v.agentId || '—',
        });
      }
    });

    const list = Array.from(groupMap.values());
    return list.slice(0, 3);
  }, [visas]);

  // 6. Smart Alerts: strict 3 types with dynamic matching & exact navigation
  const missingHotelVouchers = useMemo(() => {
    return vouchers.filter(v => !v.hotelStays || v.hotelStays.length === 0);
  }, [vouchers]);

  const missingTransportVouchers = useMemo(() => {
    return vouchers.filter(v => !v.sectors || v.sectors.filter(s => s.vehicleType || s.fromAirport).length === 0);
  }, [vouchers]);

  const overdueAccounts = useMemo(() => {
    return accounts.filter(acc => {
      if (acc.accountType !== 'agent') return false;
      const current = acc.currentBalanceSAR || 0;
      const limit = acc.creditLimitSAR || 15000;
      return current > limit;
    });
  }, [accounts]);

  // 7. Agent Role View Data
  const agentVouchers = useMemo(() => {
    if (role !== 'agent') return [];
    return vouchers.filter(v => v.agentId === userProfile?.agentId);
  }, [vouchers, role, userProfile]);

  const agentLedgerAccount = useMemo(() => {
    if (userProfile?.role !== 'agent') return null;
    return accounts.find(a => a.linkedId === userProfile?.agentId) || null;
  }, [accounts, userProfile]);

  const agentFlightSummary = useMemo(() => {
    const flightsMap = new Map<string, { sector: string; flightNo: string; date: string; paxCount: number }>();
    agentVouchers.forEach(v => {
      v.sectors?.forEach(s => {
        if (s.flightNo) {
          const key = `${s.flightNo}-${s.date}`;
          const existing = flightsMap.get(key);
          const sectorStr = s.fromAirport && s.toAirport ? `${s.fromAirport.iata} → ${s.toAirport.iata}` : (s.type || 'Flight Sector');
          const pax = v.passengers?.length || 1;
          if (existing) {
            existing.paxCount += pax;
          } else {
            flightsMap.set(key, {
              sector: sectorStr,
              flightNo: s.flightNo,
              date: s.date || '2026-10-01',
              paxCount: pax,
            });
          }
        }
      });
    });
    return Array.from(flightsMap.values());
  }, [agentVouchers]);

  if (userProfile?.role === 'agent') {
    return (
      <div className="space-y-4 text-center">
        <PageHeader
          title={`Welcome, ${userProfile?.name || 'Agent Portal'}`}
          subtitle="Your B2B Umrah Agency Portal, Live Balance, and Flight Summary"
          breadcrumbs={[{ label: 'Agent Dashboard' }]}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="My Active Vouchers"
            value={agentVouchers.length}
            icon={<Hotel className="w-5 h-5" />}
          />
          <StatCard
            label="My Issued Visas"
            value={visas.filter(v => v.agentId === userProfile?.agentId).length}
            icon={<FileCheck className="w-5 h-5" />}
          />
          <StatCard
            label="Ledger Balance"
            value={formatConvertedMoney(agentLedgerAccount?.currentBalanceSAR || 0, exchangeRate)}
            icon={<CreditCard className="w-5 h-5" />}
            variant="navy"
          />
        </div>

        {/* My Flight Summary */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden p-4 space-y-3">
          <div className="flex items-center justify-center gap-2 border-b border-slate-100 pb-2">
            <Plane className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-sm font-bold text-slate-900">My Flight Summary</h3>
            <span className="text-xs font-mono font-bold bg-navy-50 text-[#0e2c4c] px-2.5 py-1 rounded-lg">
              {agentFlightSummary.length} Scheduled Flights
            </span>
          </div>

          <div className="space-y-2">
            {agentFlightSummary.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No flight sectors booked under your agent account yet.</p>
            ) : (
              agentFlightSummary.map((f, i) => (
                <div key={i} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-[#0e2c4c]">{f.flightNo}</span>
                    <span className="text-xs font-semibold text-slate-800">{f.sector}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono text-slate-600">
                    <span>{f.date}</span>
                    <span className="bg-navy-50 text-[#0e2c4c] font-bold px-2 py-0.5 rounded">{f.paxCount} Pax</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* My Vouchers */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden p-4 space-y-3">
          <div className="flex items-center justify-center gap-3">
            <h3 className="text-sm font-bold text-slate-900">My Vouchers</h3>
            <Button variant="outline" size="sm" onClick={() => navigate('/vouchers')}>View All Vouchers</Button>
          </div>
          <div className="space-y-2">
            {agentVouchers.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No vouchers registered under your agent account yet.</p>
            ) : (
              agentVouchers.map((v, i) => (
                <div key={i} onClick={() => navigate('/vouchers', { state: { highlightVoucherNo: v.voucherNo } })} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between cursor-pointer hover:bg-slate-100 transition">
                  <div>
                    <span className="font-mono font-bold text-[#0e2c4c]">{v.voucherNo}</span>
                    <span className="text-xs text-slate-500 ml-3">{v.passengers?.length || 1} Pax • {v.status}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-800">{formatConvertedMoney(v.totals?.totalSAR || 0, exchangeRate)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Executive Operations & Control Dashboard"
        subtitle="Live Umrah package calculator, account summaries, KSA movement tracking, and smart operational alerts."
        breadcrumbs={[{ label: 'Dashboard' }]}
      />

      {/* 1. Package Calculator — compact banner; full calculator opens in modal */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#0e2c4c]/10 rounded-xl flex items-center justify-center">
              <Calculator className="w-4 h-4 text-[#0e2c4c]" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Umrah Package Cost Calculator</h3>
              <p className="text-[11px] text-slate-500">Instant per-person and group costing in SAR and PKR</p>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setCalcOpen(true)} leftIcon={<Calculator className="w-4 h-4" />}>
            Open Calculator
          </Button>
        </div>
      </div>

      <Modal isOpen={calcOpen} onClose={() => setCalcOpen(false)} title="Umrah Package Cost Calculator" subtitle="Instant per-person and group costing in SAR and PKR" size="2xl">
      {/* 1. Package Calculator at the Very Top */}
      <div className="bg-gradient-to-br from-[#0e2c4c] to-[#1a4473] text-white rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
              <Calculator className="w-5 h-5 text-[#c9a227]" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Live Umrah Package Cost Calculator</h3>
              <p className="text-xs text-slate-300">Instant per-person and group costing in SAR and PKR</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">SAR/PKR Rate:</span>
              <input
                type="number"
                step="0.1"
                disabled={(userProfile?.role as string) === 'agent'}
                value={exchangeRate}
                onChange={async (e) => {
                  const val = parseFloat(e.target.value) || 74.50;
                  setExchangeRate(val);
                  if ((userProfile?.role as string) !== 'agent' && userProfile) {
                    await updateExchangeRate(userProfile, 'SAR-PKR', val);
                    success(`Exchange rate updated to ${val} SAR/PKR`);
                  }
                }}
                className="w-20 p-1.5 bg-white/20 border border-white/30 rounded-lg text-center font-mono text-sm font-bold text-white focus:outline-none disabled:opacity-75"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">Group Pax:</span>
              <input
                type="number"
                min={1}
                value={calcPax}
                onChange={(e) => setCalcPax(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 p-1.5 bg-white/20 border border-white/30 rounded-lg text-center font-mono text-sm font-bold text-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">1. Flight Price (SAR / pax)</label>
            <input
              type="number"
              value={calcFlight}
              onChange={(e) => setCalcFlight(parseFloat(e.target.value) || 0)}
              className="w-full p-2 bg-white/10 border border-white/20 rounded-xl text-white font-mono font-bold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">2. Visa Price (SAR / pax)</label>
            <input
              type="number"
              value={calcVisa}
              onChange={(e) => setCalcVisa(parseFloat(e.target.value) || 0)}
              className="w-full p-2 bg-white/10 border border-white/20 rounded-xl text-white font-mono font-bold"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-slate-300 font-medium flex items-center justify-between">
              <span>3. Makkah Hotel 1: {calcMakkah1Nights}N × {calcMakkah1Rate} SAR</span>
              <span className="font-mono text-[#c9a227]">{calcMakkah1Nights * calcMakkah1Rate} SAR</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={calcMakkah1Nights} onChange={e => setCalcMakkah1Nights(parseInt(e.target.value) || 0)} placeholder="Nights" className="p-2 bg-white/10 border border-white/20 rounded-xl text-white font-mono" />
              <input type="number" value={calcMakkah1Rate} onChange={e => setCalcMakkah1Rate(parseFloat(e.target.value) || 0)} placeholder="Rate/Night" className="p-2 bg-white/10 border border-white/20 rounded-xl text-white font-mono" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs border-t border-white/10 pt-4">
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">4. Madina Hotel: {calcMadinaNights}N × {calcMadinaRate} SAR</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={calcMadinaNights} onChange={e => setCalcMadinaNights(parseInt(e.target.value) || 0)} placeholder="Nights" className="p-2 bg-white/10 border border-white/20 rounded-xl text-white font-mono" />
              <input type="number" value={calcMadinaRate} onChange={e => setCalcMadinaRate(parseFloat(e.target.value) || 0)} placeholder="Rate/Night" className="p-2 bg-white/10 border border-white/20 rounded-xl text-white font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">5. Makkah Hotel 2: {calcMakkah2Nights}N × {calcMakkah2Rate} SAR</label>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={calcMakkah2Nights} onChange={e => setCalcMakkah2Nights(parseInt(e.target.value) || 0)} placeholder="Nights" className="p-2 bg-white/10 border border-white/20 rounded-xl text-white font-mono" />
              <input type="number" value={calcMakkah2Rate} onChange={e => setCalcMakkah2Rate(parseFloat(e.target.value) || 0)} placeholder="Rate/Night" className="p-2 bg-white/10 border border-white/20 rounded-xl text-white font-mono" />
            </div>
          </div>
          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="flex items-center gap-2 cursor-pointer bg-white/10 p-2.5 rounded-xl border border-white/20">
              <input
                type="checkbox"
                checked={includeTransport}
                onChange={(e) => setIncludeTransport(e.target.checked)}
                className="rounded text-[#c9a227] focus:ring-0"
              />
              <span className="font-semibold text-white">Private Transport (GMC / Hiace)</span>
            </label>
            {includeTransport && (
              <input
                type="number"
                value={calcTransportFee}
                onChange={(e) => setCalcTransportFee(parseFloat(e.target.value) || 0)}
                placeholder="Total Transport SAR"
                className="mt-2 p-2 bg-white/10 border border-white/20 rounded-xl text-white font-mono"
              />
            )}
          </div>
        </div>

        {/* Live Costing Totals Bar with shared display helper */}
        <div className="bg-black/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-white/10 text-xs">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-bold mb-1">Per Person Converted Cost</span>
            <span className="text-sm font-mono font-bold text-white">
              {formatConvertedMoney(perPersonSAR, exchangeRate)}
            </span>
          </div>
          <div className="h-8 w-px bg-white/20 hidden sm:block" />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#c9a227] block font-bold mb-1">Full Group Total ({calcPax} Pax)</span>
            <span className="text-base font-mono font-bold text-[#c9a227]">
              {formatConvertedMoney(fullGroupSAR, exchangeRate)}
            </span>
          </div>
        </div>
      </div>

      </Modal>

      {/* Main sections — compact responsive grid: 1 col on mobile, 2 on lg, 3 on xl */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 items-start text-center max-w-7xl mx-auto [grid-auto-flow:dense]">

      {/* 2. Account Summary (SAR) Panel */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3 lg:col-span-2 xl:col-span-2">
        <div className="flex flex-col items-center justify-center gap-2 border-b border-slate-100 pb-2 text-center">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-sm font-bold text-slate-900">Account Summary</h3>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <div className="bg-slate-100 p-1 rounded-lg flex items-center gap-1 text-xs">
              <button onClick={() => setAccountPeriod('all')} className={`px-2.5 py-1 rounded-md font-medium transition ${accountPeriod === 'all' ? 'bg-[#0e2c4c] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>All Time</button>
              <button onClick={() => setAccountPeriod('month')} className={`px-2.5 py-1 rounded-md font-medium transition ${accountPeriod === 'month' ? 'bg-[#0e2c4c] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>This Month</button>
              <button onClick={() => setAccountPeriod('today')} className={`px-2.5 py-1 rounded-md font-medium transition ${accountPeriod === 'today' ? 'bg-[#0e2c4c] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>Today</button>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/accounts')}>Detailed Ledger →</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Bookings ({accountSummaryMetrics.bookingsPax} Pax)</span>
            <span className="font-mono text-slate-900 block font-bold">{formatConvertedMoney(accountSummaryMetrics.bookingsAmtSAR, exchangeRate)}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Tickets ({accountSummaryMetrics.ticketsCount} Issued)</span>
            <span className="font-mono text-slate-900 block font-bold">{formatConvertedMoney(accountSummaryMetrics.ticketsAmtSAR, exchangeRate)}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Refunds ({accountSummaryMetrics.refundsCount})</span>
            <span className="font-mono text-rose-600 block font-bold">{formatConvertedMoney(accountSummaryMetrics.refundsAmtSAR, exchangeRate)}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Services ({accountSummaryMetrics.servicesCount})</span>
            <span className="font-mono text-slate-900 block font-bold">{formatConvertedMoney(accountSummaryMetrics.servicesAmtSAR, exchangeRate)}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Reservations ({accountSummaryMetrics.reservationsCount})</span>
            <span className="font-mono text-amber-600 block font-bold">{formatConvertedMoney(accountSummaryMetrics.reservationsAmtSAR, exchangeRate)}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Overseas Partners</span>
            <span className="font-mono text-slate-900 block font-bold">{formatConvertedMoney(accountSummaryMetrics.overseasAmtSAR, exchangeRate)}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Only Accommodation ({accountSummaryMetrics.onlyHotelStays} Stays)</span>
            <span className="font-mono text-slate-900 block font-bold">{formatConvertedMoney(accountSummaryMetrics.onlyHotelAmtSAR, exchangeRate)}</span>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Only Transport ({accountSummaryMetrics.onlyTransportTransfers})</span>
            <span className="font-mono text-slate-900 block font-bold">{formatConvertedMoney(accountSummaryMetrics.onlyTransportAmtSAR, exchangeRate)}</span>
          </div>
        </div>

        {/* Totals Bar */}
        <div className="bg-[#0e2c4c] text-white rounded-xl p-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-bold">Openings</span>
            <span className="font-mono font-bold text-white">{formatConvertedMoney(accountSummaryMetrics.totalOpenings, exchangeRate)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-bold">Invoices</span>
            <span className="font-mono font-bold text-[#c9a227]">{formatConvertedMoney(accountSummaryMetrics.totalInvoices, exchangeRate)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-bold">Payments</span>
            <span className="font-mono font-bold text-emerald-400">{formatConvertedMoney(accountSummaryMetrics.totalPayments, exchangeRate)}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-bold">Adjustments</span>
            <span className="font-mono font-bold text-slate-300">{formatConvertedMoney(accountSummaryMetrics.totalAdjustments, exchangeRate)}</span>
          </div>
          <div className="bg-white/10 rounded-lg p-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[#c9a227] block font-bold">Balance Due</span>
            <span className="font-mono font-bold text-white">{formatConvertedMoney(accountSummaryMetrics.balanceDue, exchangeRate)}</span>
          </div>
        </div>
      </div>

      {/* 3. KSA Status Panel for Any Selected Date */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3 lg:col-span-2 xl:col-span-3">
        <div className="flex flex-col items-center justify-center gap-2 border-b border-slate-100 pb-2 text-center">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-sm font-bold text-slate-900">KSA Movement & Status Tracker</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Select Date:</span>
            <input
              type="date"
              value={ksaDate}
              onChange={(e) => setKsaDate(e.target.value)}
              className="p-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center">
          <div onClick={() => navigate('/tickets/movement-reports', { state: { reportType: 'Arrival to Kingdom', date: ksaDate } })} className="bg-slate-50 p-3 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
            <PlaneLanding className="w-6 h-6 mx-auto mb-1 text-emerald-600" />
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Arrival</span>
            <span className="text-lg font-mono font-bold text-emerald-600">{ksaStatusCounts.arrival}</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div onClick={() => navigate('/tickets/movement-reports', { state: { reportType: 'Departure from Kingdom', date: ksaDate } })} className="bg-slate-50 p-3 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
            <PlaneTakeoff className="w-6 h-6 mx-auto mb-1 text-rose-600" />
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Departure</span>
            <span className="text-lg font-mono font-bold text-rose-600">{ksaStatusCounts.departure}</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div onClick={() => navigate('/vouchers')} className="bg-slate-50 p-3 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
            <KaabaIcon className="w-6 h-6 mx-auto mb-1 text-slate-800" />
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Makkah In</span>
            <span className="text-lg font-mono font-bold text-[#0e2c4c]">{ksaStatusCounts.makkahIn}</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div onClick={() => navigate('/vouchers')} className="bg-slate-50 p-3 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
            <KaabaIcon className="w-6 h-6 mx-auto mb-1 text-amber-600" />
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Makkah Out</span>
            <span className="text-lg font-mono font-bold text-amber-600">{ksaStatusCounts.makkahOut}</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div onClick={() => navigate('/vouchers')} className="bg-slate-50 p-3 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
            <MasjidNabawiIcon className="w-6 h-6 mx-auto mb-1 text-emerald-700" />
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Madina In</span>
            <span className="text-lg font-mono font-bold text-[#0e2c4c]">{ksaStatusCounts.madinaIn}</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div onClick={() => navigate('/vouchers')} className="bg-slate-50 p-3 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition">
            <MasjidNabawiIcon className="w-6 h-6 mx-auto mb-1 text-amber-600" />
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Madina Out</span>
            <span className="text-lg font-mono font-bold text-amber-600">{ksaStatusCounts.madinaOut}</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div onClick={() => navigate('/vouchers')} className="bg-navy-50 p-3 rounded-xl border border-navy-100 cursor-pointer hover:bg-navy-100/50 transition">
            <span className="text-[10px] text-[#0e2c4c] uppercase font-bold block">Inside KSA</span>
            <span className="text-lg font-mono font-bold text-[#0e2c4c]">{ksaStatusCounts.insideKsa}</span>
            <span className="text-[10px] text-[#0e2c4c] block">Total Pax</span>
          </div>
          <div onClick={() => navigate('/vouchers')} className="bg-gold-50 p-3 rounded-xl border border-amber-200 cursor-pointer hover:bg-amber-100/50 transition">
            <span className="text-[10px] text-amber-800 uppercase font-bold block">Makkah / Madinah</span>
            <span className="text-sm font-mono font-bold text-amber-800">{ksaStatusCounts.inMakkah} / {ksaStatusCounts.inMadinah}</span>
            <span className="text-[10px] text-amber-700 block">Split Pax</span>
          </div>
        </div>
      </div>

      {/* 4. Bookings Panel */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col items-center justify-center gap-1 border-b border-slate-100 pb-2 text-center">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-sm font-bold text-slate-900">Bookings Overview</h3>
          </div>
          <span className="text-xs font-mono font-bold bg-navy-50 text-[#0e2c4c] px-2.5 py-1 rounded-lg">Total: {visas.length} Bookings</span>
        </div>
        <div className="space-y-2.5 text-center">
          <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl">
            <span className="font-semibold text-slate-700">Total Mutamers</span>
            <span className="font-mono font-bold text-slate-900">{bookingsDemographics.total} Pax</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 p-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Adults</span>
              <span className="text-sm font-mono font-bold text-slate-900">{bookingsDemographics.adults}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Children</span>
              <span className="text-sm font-mono font-bold text-slate-900">{bookingsDemographics.children}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Infants</span>
              <span className="text-sm font-mono font-bold text-slate-900">{bookingsDemographics.infants}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4b. Voucher Completion Report — numbers */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col items-center justify-center gap-1 border-b border-slate-100 pb-2 text-center">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-sm font-bold text-slate-900">Voucher Completion Report</h3>
          </div>
          <span className="text-xs font-mono font-bold text-[#0e2c4c]">{voucherCompletion.pct}% Complete</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
            <span className="text-[10px] text-emerald-700 block uppercase font-bold">Vouchers Made</span>
            <span className="text-xl font-mono font-bold text-emerald-700">{voucherCompletion.done}</span>
            <span className="text-[10px] text-emerald-600 block">pilgrims</span>
          </div>
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
            <span className="text-[10px] text-amber-700 block uppercase font-bold">Remaining</span>
            <span className="text-xl font-mono font-bold text-amber-700">{voucherCompletion.remaining}</span>
            <span className="text-[10px] text-amber-600 block">pilgrims</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Total Pilgrims</span>
            <span className="text-xl font-mono font-bold text-slate-900">{voucherCompletion.total}</span>
            <span className="text-[10px] text-slate-400 block">visas imported</span>
          </div>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all" style={{ width: `${voucherCompletion.pct}%` }} />
        </div>
      </div>

      {/* 5. Vouchers Panel */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3">
        <div className="flex flex-col items-center justify-center gap-1 border-b border-slate-100 pb-2 text-center">
          <div className="flex items-center gap-2">
            <Hotel className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-sm font-bold text-slate-900">Vouchers Overview</h3>
          </div>
          <span className="text-xs font-mono font-bold bg-navy-50 text-[#0e2c4c] px-2.5 py-1 rounded-lg">Total: {vouchers.length} Vouchers</span>
        </div>
        <div className="space-y-2.5 text-center">
          <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl">
            <span className="font-semibold text-slate-700">Passenger Breakup</span>
            <span className="font-mono font-bold text-slate-900">{vouchersDemographics.total} Total Passengers</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 p-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Adults</span>
              <span className="text-sm font-mono font-bold text-slate-900">{vouchersDemographics.adults}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Children</span>
              <span className="text-sm font-mono font-bold text-slate-900">{vouchersDemographics.children}</span>
            </div>
            <div className="bg-slate-50 p-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-400 block uppercase font-bold">Infants</span>
              <span className="text-sm font-mono font-bold text-slate-900">{vouchersDemographics.infants}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Latest Umrah Group Packages Panel */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3 lg:col-span-2 xl:col-span-2">
        <div className="flex flex-col items-center justify-center gap-2 border-b border-slate-100 pb-2 text-center">
          <div className="flex items-center gap-2">
            <Plane className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-sm font-bold text-slate-900">Latest Umrah Group Packages (Live Visa Data)</h3>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/visas')}>View All Groups →</Button>
        </div>
        {latestGroups.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No visa groups imported yet — upload a Nusuk export in the Visa module to see live groups here.</p>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {latestGroups.map((g, i) => (
            <div key={i} onClick={() => navigate('/visas')} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 cursor-pointer hover:bg-slate-100 transition text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="font-mono font-bold text-[#0e2c4c]">{g.groupCode}</span>
                <Badge variant="success">{g.paxCount} Pax</Badge>
              </div>
              <span className="text-xs font-semibold text-slate-900 block">{g.groupName}</span>
              <p className="text-[11px] text-slate-500">Issued Date: {g.date} • Agent: {g.agent}</p>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* 7. Smart Alerts Section */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-4 space-y-3 lg:col-span-2 xl:col-span-3">
        <div className="flex items-center justify-center gap-2 border-b border-slate-100 pb-2">
          <ShieldAlert className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-bold text-slate-900">Smart Operational Alerts</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Missing Hotel */}
          <div 
            onClick={() => {
              const target = missingHotelVouchers[0];
              if (target) navigate('/vouchers', { state: { highlightVoucherNo: target.voucherNo } });
              else navigate('/vouchers');
            }}
            className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/60 transition space-y-1.5 text-center"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-bold text-amber-900 uppercase">Missing Hotel Stay</span>
              <span className="font-mono font-bold text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full text-xs">
                {missingHotelVouchers.length}
              </span>
            </div>
            <p className="text-[11px] text-amber-700">Vouchers registered without hotel accommodation assignments.</p>
            <span className="text-[11px] font-bold text-amber-900 flex items-center justify-center gap-1">Review Voucher <ArrowRight className="w-3 h-3" /></span>
          </div>

          {/* Missing Transport */}
          <div 
            onClick={() => {
              const target = missingTransportVouchers[0];
              if (target) navigate('/vouchers', { state: { highlightVoucherNo: target.voucherNo } });
              else navigate('/vouchers');
            }}
            className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/60 transition space-y-1.5 text-center"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-bold text-amber-900 uppercase">Missing Transport</span>
              <span className="font-mono font-bold text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full text-xs">
                {missingTransportVouchers.length}
              </span>
            </div>
            <p className="text-[11px] text-amber-700">Vouchers lacking transport sector vehicle or sector bookings.</p>
            <span className="text-[11px] font-bold text-amber-900 flex items-center justify-center gap-1">Review Voucher <ArrowRight className="w-3 h-3" /></span>
          </div>

          {/* Over Due Limit */}
          <div 
            onClick={() => {
              const target = overdueAccounts[0];
              if (target) navigate(`/accounts?accountId=${target.id}`);
              else navigate('/accounts');
            }}
            className="p-3 bg-rose-50/60 border border-rose-200 rounded-xl cursor-pointer hover:bg-rose-100/60 transition space-y-1.5 text-center"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="text-xs font-bold text-rose-900 uppercase">Agents Over Credit Limit</span>
              <span className="font-mono font-bold text-rose-800 bg-rose-200 px-2 py-0.5 rounded-full text-xs">
                {overdueAccounts.length}
              </span>
            </div>
            <p className="text-[11px] text-rose-700">Sub-agents exceeding their maximum allowed credit or due payment threshold.</p>
            <span className="text-[11px] font-bold text-rose-900 flex items-center justify-center gap-1">Review Accounts <ArrowRight className="w-3 h-3" /></span>
          </div>
        </div>
      </div>

      </div>{/* end main grid */}
    </div>
  );
};
