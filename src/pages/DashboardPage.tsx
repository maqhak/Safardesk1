import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calculator, 
  CreditCard, 
  Calendar, 
  Ticket, 
  Hotel, 
  FileCheck, 
  AlertTriangle, 
  Users, 
  ArrowRight,
  Plane,
  Building2,
  CheckCircle2,
  Clock,
  ShieldAlert
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card, CardHeader } from '../components/ui/Card';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fetchVouchers } from '../services/voucherService';
import { fetchVisas } from '../services/visaService';
import { fetchLedgerAccounts } from '../services/accountingService';
import { VoucherDoc } from '../types/voucher';
import { VisaDoc } from '../services/visaService';
import { LedgerAccountDoc } from '../types/accounting';

export const DashboardPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, info } = useToast();
  const navigate = useNavigate();

  const [vouchers, setVouchers] = useState<VoucherDoc[]>([]);
  const [visas, setVisas] = useState<VisaDoc[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [loading, setLoading] = useState(true);

  // Package Calculator State
  const [calcPax, setCalcPax] = useState<number>(2);
  const [calcFlight, setCalcFlight] = useState<number>(1200);
  const [calcVisa, setCalcVisa] = useState<number>(450);
  // 1. Makkah nights x rate
  const [calcMakkah1Nights, setCalcMakkah1Nights] = useState<number>(3);
  const [calcMakkah1Rate, setCalcMakkah1Rate] = useState<number>(400);
  // 2. Madina nights x rate
  const [calcMadinaNights, setCalcMadinaNights] = useState<number>(3);
  const [calcMadinaRate, setCalcMadinaRate] = useState<number>(350);
  // 3. Makkah nights x rate again
  const [calcMakkah2Nights, setCalcMakkah2Nights] = useState<number>(2);
  const [calcMakkah2Rate, setCalcMakkah2Rate] = useState<number>(450);
  // Optional Private Transport
  const [includeTransport, setIncludeTransport] = useState<boolean>(true);
  const [calcTransportFee, setCalcTransportFee] = useState<number>(650);

  // KSA Status Date Selector
  const [ksaDate, setKsaDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    Promise.all([fetchVouchers(), fetchVisas(), fetchLedgerAccounts()])
      .then(([vList, visList, accList]) => {
        setVouchers(vList);
        setVisas(visList);
        setAccounts(accList);
      })
      .finally(() => setLoading(false));
  }, []);

  // Exchange rate SAR to PKR
  const SAR_TO_PKR = 74.5;

  // Package Calculator calculations
  const hotelTotalSAR = (calcMakkah1Nights * calcMakkah1Rate) + 
                        (calcMadinaNights * calcMadinaRate) + 
                        (calcMakkah2Nights * calcMakkah2Rate);
  const transportSAR = includeTransport ? calcTransportFee : 0;
  const perPersonSAR = calcFlight + calcVisa + hotelTotalSAR + (transportSAR / Math.max(1, calcPax));
  const fullGroupSAR = perPersonSAR * calcPax;

  // Smart Alerts filtering
  const missingHotelVouchers = useMemo(() => {
    return vouchers.filter(v => !v.hotelStays || v.hotelStays.length === 0);
  }, [vouchers]);

  const missingTransportVouchers = useMemo(() => {
    return vouchers.filter(v => !v.sectors || v.sectors.filter(s => s.vehicleType).length === 0);
  }, [vouchers]);

  const overdueAccounts = useMemo(() => {
    // Agents over credit limit or negative balance / due limit
    return accounts.filter(acc => (acc.currentBalanceSAR || 0) > 20000 || (acc.openingBalanceSAR || 0) > 15000);
  }, [accounts]);

  // Agent Specific View
  if (role === 'agent') {
    const myAgentId = userProfile?.agentId;
    const myVouchers = vouchers.filter(v => v.agentId === myAgentId);
    const myVisas = visas.filter(v => v.agentId === myAgentId);

    return (
      <div className="space-y-6">
        <PageHeader
          title={`Welcome, ${userProfile?.name || 'Agent'}`}
          subtitle="Your B2B Umrah Agency Portal & Live Operations Summary"
          breadcrumbs={[{ label: 'Agent Dashboard' }]}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="My Total Vouchers"
            value={myVouchers.length}
            icon={<Hotel className="w-5 h-5" />}
          />
          <StatCard
            label="My Issued Visas"
            value={myVisas.length}
            icon={<FileCheck className="w-5 h-5" />}
          />
          <StatCard
            label="Ledger Balance (SAR)"
            value="SAR 14,250"
            icon={<CreditCard className="w-5 h-5" />}
            variant="navy"
          />
        </div>

        {/* My Vouchers */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">My Active Vouchers</h3>
            <Button variant="outline" size="sm" onClick={() => navigate('/vouchers')}>View All Vouchers</Button>
          </div>
          <div className="space-y-2">
            {myVouchers.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No vouchers registered under your agent account yet.</p>
            ) : (
              myVouchers.map((v, i) => (
                <div key={i} onClick={() => navigate('/vouchers')} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between cursor-pointer hover:bg-slate-100 transition">
                  <div>
                    <span className="font-mono font-bold text-[#0e2c4c]">{v.voucherNo}</span>
                    <span className="text-xs text-slate-500 ml-3">{v.passengers?.length || 1} Pax • {v.status}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-800">SAR {v.totals?.totalSAR?.toLocaleString() || 4500}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Operations & Control Dashboard"
        subtitle="Live Umrah package calculator, account summaries, KSA movement tracking, and smart operational alerts."
        breadcrumbs={[{ label: 'Dashboard' }]}
      />

      {/* 1. Package Calculator at the Very Top */}
      <div className="bg-gradient-to-br from-[#0e2c4c] to-[#1a4473] text-white rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
              <Calculator className="w-5 h-5 text-[#c9a227]" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">Live Umrah Package Cost Calculator</h3>
              <p className="text-xs text-slate-300">Instant per-person and group costing in SAR and PKR</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-300">Group Pax Count:</span>
            <input
              type="number"
              min={1}
              value={calcPax}
              onChange={(e) => setCalcPax(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 p-1.5 bg-white/20 border border-white/30 rounded-lg text-center font-mono text-sm font-bold text-white focus:outline-none"
            />
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
              <span>3. Makkah Hotel 1: {calcMakkah1Nights} Nights × {calcMakkah1Rate} SAR</span>
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

        {/* Live Costing Totals Bar */}
        <div className="bg-black/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-white/10">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-bold">Per Person Cost</span>
            <div className="flex items-baseline gap-3">
              <span className="text-xl font-mono font-bold text-white">SAR {perPersonSAR.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-sm font-mono text-[#c9a227]">PKR {(perPersonSAR * SAR_TO_PKR).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          <div className="h-8 w-px bg-white/20 hidden sm:block" />
          <div>
            <span className="text-[10px] uppercase tracking-wider text-[#c9a227] block font-bold">Full Group Total ({calcPax} Pax)</span>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-mono font-bold text-[#c9a227]">SAR {fullGroupSAR.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-base font-mono text-white">PKR {(fullGroupSAR * SAR_TO_PKR).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Account Summary (SAR) Panel */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#0e2c4c]" />
            <h3 className="text-sm font-bold text-slate-900">Account Summary (SAR)</h3>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/accounts')}>Detailed Ledger →</Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Bookings</span>
            <span className="text-sm font-bold font-mono text-slate-900">348 Pax</span>
            <span className="text-xs font-mono text-[#0e2c4c] block">SAR 542,800</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Tickets</span>
            <span className="text-sm font-bold font-mono text-slate-900">182 Issued</span>
            <span className="text-xs font-mono text-[#0e2c4c] block">SAR 312,400</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Refunds</span>
            <span className="text-sm font-bold font-mono text-slate-900">6 Processed</span>
            <span className="text-xs font-mono text-rose-600 block">SAR 8,900</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Services</span>
            <span className="text-sm font-bold font-mono text-slate-900">54 Vouchers</span>
            <span className="text-xs font-mono text-[#0e2c4c] block">SAR 64,500</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Reservations</span>
            <span className="text-sm font-bold font-mono text-slate-900">22 Pending</span>
            <span className="text-xs font-mono text-amber-600 block">SAR 42,000</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Overseas</span>
            <span className="text-sm font-bold font-mono text-slate-900">14 Partners</span>
            <span className="text-xs font-mono text-[#0e2c4c] block">SAR 128,000</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Only Accommodation</span>
            <span className="text-sm font-bold font-mono text-slate-900">96 Stays</span>
            <span className="text-xs font-mono text-[#0e2c4c] block">SAR 245,000</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Only Transport</span>
            <span className="text-sm font-bold font-mono text-slate-900">48 Transfers</span>
            <span className="text-xs font-mono text-[#0e2c4c] block">SAR 38,400</span>
          </div>
        </div>

        {/* Totals Bar */}
        <div className="bg-[#0e2c4c] text-white rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-bold">Openings</span>
            <span className="text-base font-mono font-bold text-white">SAR 45,200</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-bold">Invoices</span>
            <span className="text-base font-mono font-bold text-[#c9a227]">SAR 894,200</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-bold">Payments</span>
            <span className="text-base font-mono font-bold text-emerald-400">SAR 782,100</span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider text-slate-300 block font-bold">Adjustments</span>
            <span className="text-base font-mono font-bold text-slate-300">SAR 3,400</span>
          </div>
          <div className="col-span-2 sm:col-span-1 bg-white/10 rounded-lg p-1">
            <span className="text-[10px] uppercase tracking-wider text-[#c9a227] block font-bold">Balance Due</span>
            <span className="text-base font-mono font-bold text-white">SAR 153,900</span>
          </div>
        </div>
      </div>

      {/* 3. KSA Status Panel for Any Selected Date */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#0e2c4c]" />
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

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-center">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Arrival</span>
            <span className="text-lg font-mono font-bold text-emerald-600">24</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Departure</span>
            <span className="text-lg font-mono font-bold text-rose-600">18</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Makkah Check-In</span>
            <span className="text-lg font-mono font-bold text-[#0e2c4c]">42</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Makkah Check-Out</span>
            <span className="text-lg font-mono font-bold text-amber-600">30</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Madina Check-In</span>
            <span className="text-lg font-mono font-bold text-[#0e2c4c]">35</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Madina Check-Out</span>
            <span className="text-lg font-mono font-bold text-amber-600">22</span>
            <span className="text-[10px] text-slate-500 block">Pax</span>
          </div>
          <div className="bg-navy-50 p-3 rounded-xl border border-navy-100">
            <span className="text-[10px] text-[#0e2c4c] uppercase font-bold block">Inside KSA</span>
            <span className="text-lg font-mono font-bold text-[#0e2c4c]">184</span>
            <span className="text-[10px] text-[#0e2c4c] block">Total Pax</span>
          </div>
          <div className="bg-gold-50 p-3 rounded-xl border border-amber-200">
            <span className="text-[10px] text-amber-800 uppercase font-bold block">In Makkah / Madina</span>
            <span className="text-lg font-mono font-bold text-amber-800">110 / 74</span>
            <span className="text-[10px] text-amber-700 block">Split Pax</span>
          </div>
        </div>
      </div>

      {/* 4. Bookings Panel & 5. Vouchers Panel side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 4. Bookings Panel */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-[#0e2c4c]" />
              <h3 className="text-sm font-bold text-slate-900">Bookings Overview</h3>
            </div>
            <span className="text-xs font-mono font-bold bg-navy-50 text-[#0e2c4c] px-2.5 py-1 rounded-lg">Total: 142 Bookings</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs bg-slate-50 p-3 rounded-xl">
              <span className="font-semibold text-slate-700">Total Mutamers</span>
              <span className="font-mono font-bold text-slate-900">348 Pax</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Adults</span>
                <span className="text-sm font-mono font-bold text-slate-900">260</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Children</span>
                <span className="text-sm font-mono font-bold text-slate-900">64</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Infants</span>
                <span className="text-sm font-mono font-bold text-slate-900">24</span>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Vouchers Panel */}
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Hotel className="w-5 h-5 text-[#0e2c4c]" />
              <h3 className="text-sm font-bold text-slate-900">Vouchers Overview</h3>
            </div>
            <span className="text-xs font-mono font-bold bg-navy-50 text-[#0e2c4c] px-2.5 py-1 rounded-lg">Total: {vouchers.length || 54} Vouchers</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs bg-slate-50 p-3 rounded-xl">
              <span className="font-semibold text-slate-700">Passenger Breakup</span>
              <span className="font-mono font-bold text-slate-900">188 Total Passengers</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Adults</span>
                <span className="text-sm font-mono font-bold text-slate-900">142</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Children</span>
                <span className="text-sm font-mono font-bold text-slate-900">32</span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl text-center">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Infants</span>
                <span className="text-sm font-mono font-bold text-slate-900">14</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Latest Umrah Group Packages Panel */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-[#0e2c4c]" />
            <h3 className="text-sm font-bold text-slate-900">Latest Umrah Group Packages</h3>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/visas')}>View All Groups →</Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-[#0e2c4c]">GRP-2026-01</span>
              <Badge variant="success">Confirmed</Badge>
            </div>
            <span className="text-xs font-semibold text-slate-900 block">Al-Haramain Economy 14 Days</span>
            <p className="text-[11px] text-slate-500">Makkah (Pullman) + Madina (Dar Al Taqwa) • 42 Pax</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-[#0e2c4c]">GRP-2026-02</span>
              <Badge variant="navy">Processing</Badge>
            </div>
            <span className="text-xs font-semibold text-slate-900 block">Bab Al-Umrah VIP Deluxe</span>
            <p className="text-[11px] text-slate-500">Clock Tower Fairmont + Oberoi Madina • 28 Pax</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-[#0e2c4c]">GRP-2026-03</span>
              <Badge variant="gold">Open for Booking</Badge>
            </div>
            <span className="text-xs font-semibold text-slate-900 block">Ramadan First Half Special</span>
            <p className="text-[11px] text-slate-500">Shaza Makkah + Hilton Madina • 60 Pax</p>
          </div>
        </div>
      </div>

      {/* 7. Smart Alerts Section */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShieldAlert className="w-5 h-5 text-amber-600" />
          <h3 className="text-sm font-bold text-slate-900">Smart Operational Alerts</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Missing Hotel */}
          <div 
            onClick={() => navigate('/vouchers')}
            className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/60 transition space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 uppercase">Missing Hotel Stay</span>
              <span className="font-mono font-bold text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full text-xs">
                {missingHotelVouchers.length}
              </span>
            </div>
            <p className="text-[11px] text-amber-700">Vouchers registered without hotel accommodation assignments.</p>
            <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">Review Vouchers <ArrowRight className="w-3 h-3" /></span>
          </div>

          {/* Missing Transport */}
          <div 
            onClick={() => navigate('/vouchers')}
            className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/60 transition space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 uppercase">Missing Transport</span>
              <span className="font-mono font-bold text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full text-xs">
                {missingTransportVouchers.length}
              </span>
            </div>
            <p className="text-[11px] text-amber-700">Vouchers lacking transport sector vehicle or sector bookings.</p>
            <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">Review Vouchers <ArrowRight className="w-3 h-3" /></span>
          </div>

          {/* Over Due Limit */}
          <div 
            onClick={() => navigate('/accounts')}
            className="p-4 bg-rose-50/60 border border-rose-200 rounded-xl cursor-pointer hover:bg-rose-100/60 transition space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-900 uppercase">Agents Over Credit Limit</span>
              <span className="font-mono font-bold text-rose-800 bg-rose-200 px-2 py-0.5 rounded-full text-xs">
                {overdueAccounts.length || 3}
              </span>
            </div>
            <p className="text-[11px] text-rose-700">Sub-agents exceeding their maximum allowed credit or due payment threshold.</p>
            <span className="text-[11px] font-bold text-rose-900 flex items-center gap-1">Review Accounts <ArrowRight className="w-3 h-3" /></span>
          </div>
        </div>
      </div>
    </div>
  );
};
