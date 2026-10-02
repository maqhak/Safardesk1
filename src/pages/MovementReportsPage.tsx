import React, { useState, useEffect, useMemo } from 'react';
import { 
  Compass, 
  Search, 
  Calendar, 
  Download, 
  Printer, 
  Filter, 
  Building2, 
  Users, 
  Plane, 
  MapPin, 
  Bus, 
  ShieldAlert,
  ArrowUpDown,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { 
  MovementRecord, 
  MovementReportType, 
  MOVEMENT_REPORT_TYPES, 
  fetchMovementRecords, 
  computeMovementSummaries 
} from '../services/movementReportService';
import { fetchVendors } from '../services/masterService';
import { fetchAgents } from '../services/agentService';
import { VendorDoc } from '../types/master';
import { AgentDoc } from '../types/agent';

export const MovementReportsPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { profile: company } = useCompany();
  const { success, error: showError } = useToast();
  const canViewReports = useCan('Reports', 'view') || role === 'owner' || role === 'staff';
  const isAgent = role === 'agent';

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [allRecords, setAllRecords] = useState<MovementRecord[]>([]);
  const [vendors, setVendors] = useState<VendorDoc[]>([]);
  const [agents, setAgents] = useState<AgentDoc[]>([]);

  // 1. Report Type Selection with EXACTLY the 4 required labels
  const [selectedReportType, setSelectedReportType] = useState<MovementReportType>('Arrival to Kingdom');

  // 2. Filters (Supports both past and future dates)
  const [dateMode, setDateMode] = useState<'all' | 'range' | 'single'>('all');
  const [singleDate, setSingleDate] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [flightSearch, setFlightSearch] = useState<string>('');
  const [selectedShirka, setSelectedShirka] = useState<string>('all');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [records, vList, aList] = await Promise.all([
        fetchMovementRecords(),
        fetchVendors(),
        fetchAgents(),
      ]);
      setAllRecords(records);
      setVendors(vList);
      setAgents(aList);
    } catch {
      showError('Failed to load movement report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter records based on active controls
  const filteredRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      // Must match report type
      if (rec.reportType !== selectedReportType) return false;

      // Date filtering (allows any past or future date)
      if (dateMode === 'single' && singleDate) {
        if (rec.date !== singleDate) return false;
      } else if (dateMode === 'range') {
        if (startDate && rec.date < startDate) return false;
        if (endDate && rec.date > endDate) return false;
      }

      // Sector filter
      if (selectedSector !== 'all' && rec.sector !== selectedSector && rec.from !== selectedSector && rec.to !== selectedSector) {
        return false;
      }

      // Flight filter
      if (flightSearch.trim() && !rec.flightOrBusNo.toLowerCase().includes(flightSearch.toLowerCase())) {
        return false;
      }

      // Shirka filter
      if (selectedShirka !== 'all' && !rec.shirka.toLowerCase().includes(selectedShirka.toLowerCase())) {
        return false;
      }

      // Agent filter
      if (selectedAgent !== 'all' && !rec.agent.toLowerCase().includes(selectedAgent.toLowerCase())) {
        return false;
      }

      // General query search (group, voucher, agent, etc.)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches = 
          rec.groupNo.toLowerCase().includes(q) ||
          rec.voucherNo.toLowerCase().includes(q) ||
          rec.agent.toLowerCase().includes(q) ||
          rec.shirka.toLowerCase().includes(q) ||
          rec.hotelName.toLowerCase().includes(q) ||
          rec.flightOrBusNo.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sorted by date/time then group
      const dtA = `${a.date} ${a.time}`;
      const dtB = `${b.date} ${b.time}`;
      if (dtA !== dtB) return dtA.localeCompare(dtB);
      return a.groupNo.localeCompare(b.groupNo);
    });
  }, [
    allRecords, 
    selectedReportType, 
    dateMode, 
    singleDate, 
    startDate, 
    endDate, 
    selectedSector, 
    flightSearch, 
    selectedShirka, 
    selectedAgent, 
    searchQuery
  ]);

  // Compute 4 Summary Panels + Grand Total
  const summaries = useMemo(() => {
    return computeMovementSummaries(filteredRecords);
  }, [filteredRecords]);

  // Distinct available sectors for sector filter dropdown
  const availableSectors = useMemo(() => {
    const set = new Set<string>();
    allRecords
      .filter((r) => r.reportType === selectedReportType)
      .forEach((r) => {
        if (r.sector) set.add(r.sector);
      });
    return Array.from(set);
  }, [allRecords, selectedReportType]);

  // CSV Export of both detailed grid and 4 summary panels
  const exportToCSV = () => {
    const lines: string[] = [];

    lines.push(`SAFARDESK MOVEMENT REPORT: ${selectedReportType.toUpperCase()}`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push(`Company: ${company.companyName}`);
    lines.push('');

    // Summary Area (4 Panels)
    lines.push('--- SUMMARY AREA ---');
    lines.push('(a) Sector-wise summary');
    lines.push('Sector,Paid,Infant,W-o-Bus,Total');
    summaries.sectorSummary.forEach((s) => {
      lines.push(`"${s.key}",${s.paidPax},${s.infantPax},${s.woBusPax},${s.totalPax}`);
    });
    lines.push('');

    lines.push('(b) Flight-wise summary');
    lines.push('Flight/Bus#,Paid,Infant,W-o-Bus,Total');
    summaries.flightSummary.forEach((s) => {
      lines.push(`"${s.key}",${s.paidPax},${s.infantPax},${s.woBusPax},${s.totalPax}`);
    });
    lines.push('');

    lines.push('(c) Voucher & Hotel-wise summary');
    lines.push('Voucher & Hotel,Paid,Infant,W-o-Bus,Total');
    summaries.voucherHotelSummary.forEach((s) => {
      lines.push(`"${s.key}",${s.paidPax},${s.infantPax},${s.woBusPax},${s.totalPax}`);
    });
    lines.push('');

    lines.push('(d) Hotel-wise summary');
    lines.push('Hotel,Paid,Infant,W-o-Bus,Total');
    summaries.hotelSummary.forEach((s) => {
      lines.push(`"${s.key}",${s.paidPax},${s.infantPax},${s.woBusPax},${s.totalPax}`);
    });
    lines.push('');

    lines.push('GRAND TOTALS');
    lines.push(`Total Paid,${summaries.grandTotal.paidPax}`);
    lines.push(`Total Infant,${summaries.grandTotal.infantPax}`);
    lines.push(`Total W-o-Bus,${summaries.grandTotal.woBusPax}`);
    lines.push(`Overall Pax,${summaries.grandTotal.totalPax}`);
    lines.push('');

    // Detailed Grid
    lines.push('--- DETAILED GROUP/VOUCHER-WISE GRID ---');
    lines.push('Group#,Shirka,Agent,From,Flight#/Bus#,Time,Uv#,Pax breakup (Paid/Infant/W-o-Bus),Ret-Flight#,Ret Date/Time,Tran By');
    filteredRecords.forEach((r) => {
      lines.push(
        `"${r.groupNo}","${r.shirka}","${r.agent}","${r.from}","${r.flightOrBusNo}","${r.time}","${r.voucherNo}","Paid: ${r.paidPax}, Inf: ${r.infantPax}, W/O: ${r.woBusPax} (Total: ${r.totalPax})","${r.returnFlightNo}","${r.returnDateTime}","${r.transportBy}"`
      );
    });

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `movement_report_${selectedReportType.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success('Movement report exported to CSV successfully.');
  };

  const handlePrint = () => {
    window.print();
  };

  // AGENT RESTRICTION (Agents cannot access Movement Reports)
  if (isAgent || !canViewReports) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-600">
          Movement Reports are strictly reserved for Agency Owner and authorized operational Staff. Agents do not have permission to access centralized kingdom logistics.
        </p>
        <div className="pt-2">
          <Button variant="outline" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Printable Company Letterhead (Visible when printing) */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#0e2c4c] tracking-tight">{company.companyName}</h1>
            <p className="text-xs text-slate-600 mt-0.5">{company.legalName || 'Hajj & Umrah Operations Management'}</p>
            <p className="text-[11px] text-slate-500">{company.address}, {company.city} • Tel: {company.phone}</p>
          </div>
          <div className="text-right">
            <span className="inline-block bg-[#0e2c4c] text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider">
              {selectedReportType}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">Printed: {new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Screen Header */}
      <div className="print:hidden">
        <PageHeader
          title="Movement Reports"
          subtitle="Operational ground manifest tracking arrivals, intercity transfers, and final departures across the Kingdom."
          breadcrumbs={[
            { label: 'Dashboard', href: '/' },
            { label: 'Tickets', href: '/tickets' },
            { label: 'Movement Reports' },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
                onClick={exportToCSV}
              >
                Export CSV (Grid + Summaries)
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Printer className="w-4 h-4" />}
                onClick={handlePrint}
              >
                Print Report
              </Button>
            </div>
          }
        />
      </div>

      {/* Report Type Selector & Filter Control Bar */}
      <Card className="p-4 sm:p-5 border-slate-200 shadow-xs print:hidden space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          {/* Requirement 1: Dropdown with EXACTLY these 4 labels */}
          <div className="w-full lg:w-96">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#0e2c4c]" />
              <span>Select Movement Report Type</span>
            </label>
            <select
              value={selectedReportType}
              onChange={(e) => setSelectedReportType(e.target.value as MovementReportType)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-[#0e2c4c] rounded-xl text-sm font-bold text-[#0e2c4c] focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20 shadow-xs cursor-pointer"
            >
              {MOVEMENT_REPORT_TYPES.map((type) => (
                <option key={type} value={type} className="font-semibold text-slate-800">
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Date Mode Switcher */}
          <div className="flex items-center gap-2 self-stretch lg:self-auto justify-end">
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setDateMode('all')}
                className={`px-3 py-1.5 rounded-md transition cursor-pointer ${dateMode === 'all' ? 'bg-white text-[#0e2c4c] shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                All Dates
              </button>
              <button
                type="button"
                onClick={() => setDateMode('single')}
                className={`px-3 py-1.5 rounded-md transition cursor-pointer ${dateMode === 'single' ? 'bg-white text-[#0e2c4c] shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Single Date
              </button>
              <button
                type="button"
                onClick={() => setDateMode('range')}
                className={`px-3 py-1.5 rounded-md transition cursor-pointer ${dateMode === 'range' ? 'bg-white text-[#0e2c4c] shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Date Range
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              title="Refresh Data"
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          {/* Date Picker inputs (past AND future dates fully allowed) */}
          {dateMode === 'single' ? (
            <div className="col-span-1 sm:col-span-2 md:col-span-1">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date (Past or Future)</label>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0e2c4c]"
              />
            </div>
          ) : dateMode === 'range' ? (
            <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">To Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800"
                />
              </div>
            </div>
          ) : null}

          {/* Sector Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sector</label>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 font-medium"
            >
              <option value="all">All Sectors</option>
              {availableSectors.map((sec) => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </select>
          </div>

          {/* Flight Number Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Flight Number</label>
            <input
              type="text"
              placeholder="e.g. SV-734, PK-741"
              value={flightSearch}
              onChange={(e) => setFlightSearch(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800"
            />
          </div>

          {/* Shirka (Vendor) Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Shirka (Vendor)</label>
            <select
              value={selectedShirka}
              onChange={(e) => setSelectedShirka(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 font-medium"
            >
              <option value="all">All Shirkas</option>
              <option value="Al-Haramain Group">Al-Haramain Group (Shirka)</option>
              <option value="Taiba Investments">Taiba Investments Co.</option>
              <option value="Dallah Ground">Dallah Ground Services</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.name}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Agent Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">B2B Agent</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 font-medium"
            >
              <option value="all">All Agents</option>
              <option value="Al-Noor Travels">Al-Noor Travels</option>
              <option value="Karwan-e-Haram">Karwan-e-Haram</option>
              <option value="Falcon Express">Falcon Express Umrah</option>
              <option value="Direct B2C">Direct B2C Walk-ins</option>
              {agents.map((a) => (
                <option key={a.id} value={a.companyName}>{a.companyName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Global text search input */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-100">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search group#, voucher#, hotel, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Matching Movements: <strong className="text-[#0e2c4c]">{filteredRecords.length}</strong>
          </div>
        </div>
      </Card>

      {/* 3. Summary Area — 4 panels ALWAYS shown for the chosen report */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Movement Summaries: {selectedReportType}
          </h3>
          <span className="text-[11px] text-slate-500">
            Breakup: <span className="font-semibold text-slate-700">Paid / Infant / W-o-Bus (without bus)</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Panel (a): Sector-wise summary */}
          <Card padding="none" className="border-slate-200 shadow-xs flex flex-col">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-xs text-[#0e2c4c] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#0e2c4c]" />
                <span>(a) Sector-wise Summary</span>
              </span>
              <Badge variant="navy">{summaries.sectorSummary.length} Sectors</Badge>
            </div>
            <div className="p-2 divide-y divide-slate-100 flex-1 max-h-56 overflow-y-auto text-xs">
              {summaries.sectorSummary.length === 0 ? (
                <div className="p-4 text-center text-slate-400">No data</div>
              ) : (
                summaries.sectorSummary.map((item) => (
                  <div key={item.key} className="py-2 px-1 flex items-center justify-between">
                    <span className="font-semibold text-slate-800 truncate pr-2">{item.key}</span>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-slate-700">
                        {item.paidPax} / {item.infantPax} / {item.woBusPax}
                      </span>
                      <span className="font-mono font-bold text-[#0e2c4c] ml-2 text-xs">
                        = {item.totalPax}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Panel (b): Flight-wise summary */}
          <Card padding="none" className="border-slate-200 shadow-xs flex flex-col">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-xs text-[#0e2c4c] flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-[#0e2c4c]" />
                <span>(b) Flight-wise Summary</span>
              </span>
              <Badge variant="navy">{summaries.flightSummary.length} Flights</Badge>
            </div>
            <div className="p-2 divide-y divide-slate-100 flex-1 max-h-56 overflow-y-auto text-xs">
              {summaries.flightSummary.length === 0 ? (
                <div className="p-4 text-center text-slate-400">No data</div>
              ) : (
                summaries.flightSummary.map((item) => (
                  <div key={item.key} className="py-2 px-1 flex items-center justify-between">
                    <span className="font-semibold text-slate-800 truncate pr-2">{item.key}</span>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-slate-700">
                        {item.paidPax} / {item.infantPax} / {item.woBusPax}
                      </span>
                      <span className="font-mono font-bold text-[#0e2c4c] ml-2 text-xs">
                        = {item.totalPax}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Panel (c): Voucher & Hotel-wise summary */}
          <Card padding="none" className="border-slate-200 shadow-xs flex flex-col">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-xs text-[#0e2c4c] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#0e2c4c]" />
                <span>(c) Voucher & Hotel Summary</span>
              </span>
              <Badge variant="navy">{summaries.voucherHotelSummary.length} Stays</Badge>
            </div>
            <div className="p-2 divide-y divide-slate-100 flex-1 max-h-56 overflow-y-auto text-xs">
              {summaries.voucherHotelSummary.length === 0 ? (
                <div className="p-4 text-center text-slate-400">No data</div>
              ) : (
                summaries.voucherHotelSummary.map((item) => (
                  <div key={item.key} className="py-2 px-1 flex items-center justify-between">
                    <span className="font-semibold text-slate-800 truncate pr-2" title={item.key}>{item.key}</span>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-slate-700">
                        {item.paidPax} / {item.infantPax} / {item.woBusPax}
                      </span>
                      <span className="font-mono font-bold text-[#0e2c4c] ml-2 text-xs">
                        = {item.totalPax}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Panel (d): Hotel-wise summary */}
          <Card padding="none" className="border-slate-200 shadow-xs flex flex-col">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-xs text-[#0e2c4c] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#0e2c4c]" />
                <span>(d) Hotel-wise Summary</span>
              </span>
              <Badge variant="navy">{summaries.hotelSummary.length} Hotels</Badge>
            </div>
            <div className="p-2 divide-y divide-slate-100 flex-1 max-h-56 overflow-y-auto text-xs">
              {summaries.hotelSummary.length === 0 ? (
                <div className="p-4 text-center text-slate-400">No data</div>
              ) : (
                summaries.hotelSummary.map((item) => (
                  <div key={item.key} className="py-2 px-1 flex items-center justify-between">
                    <span className="font-semibold text-slate-800 truncate pr-2">{item.key}</span>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-slate-700">
                        {item.paidPax} / {item.infantPax} / {item.woBusPax}
                      </span>
                      <span className="font-mono font-bold text-[#0e2c4c] ml-2 text-xs">
                        = {item.totalPax}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Grand Total Row across panels */}
        <div className="bg-[#0e2c4c] text-white p-3.5 rounded-xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="font-bold tracking-wide uppercase flex items-center gap-2">
            <Users className="w-4 h-4 text-[#c9a227]" />
            <span>Grand Total Across Panels ({selectedReportType})</span>
          </div>
          <div className="flex items-center gap-6 font-mono text-sm">
            <div>
              <span className="text-slate-300 text-[11px] block">Paid Pax</span>
              <span className="font-bold">{summaries.grandTotal.paidPax}</span>
            </div>
            <div>
              <span className="text-slate-300 text-[11px] block">Infants</span>
              <span className="font-bold">{summaries.grandTotal.infantPax}</span>
            </div>
            <div>
              <span className="text-slate-300 text-[11px] block">W-o-Bus</span>
              <span className="font-bold">{summaries.grandTotal.woBusPax}</span>
            </div>
            <div className="pl-4 border-l border-slate-600">
              <span className="text-[#c9a227] text-[11px] block font-sans font-semibold">Total Pax</span>
              <span className="font-bold text-[#c9a227] text-base">{summaries.grandTotal.totalPax}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. & 5. Detailed grid below (group/voucher-wise) with NO PAGINATION & sticky header */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-slate-900 text-sm">
              Detailed Manifest Grid ({selectedReportType})
            </h4>
            <p className="text-[11px] text-slate-500">
              All rows rendered on one continuous scrollable view without pagination. Sorted by date/time then group.
            </p>
          </div>
          <Badge variant="navy">
            {filteredRecords.length} Continuous Records
          </Badge>
        </div>

        {/* Continuous scrollable container with sticky header */}
        <div className="overflow-x-auto max-h-[650px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300 shadow-xs">
              <tr>
                <th className="py-3 px-3">Group#</th>
                <th className="py-3 px-3">Shirka</th>
                <th className="py-3 px-3">Agent</th>
                <th className="py-3 px-3">From</th>
                <th className="py-3 px-3">Flight#/Bus#</th>
                <th className="py-3 px-3">Time</th>
                <th className="py-3 px-3">Uv#</th>
                <th className="py-3 px-3">Pax breakup</th>
                <th className="py-3 px-3">Ret-Flight#</th>
                <th className="py-3 px-3">Ret Date/Time</th>
                <th className="py-3 px-3">Tran By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    Loading movement records...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    No movement records found for {selectedReportType} matching current filters.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => (
                  <tr 
                    key={r.id} 
                    className={`hover:bg-slate-50/80 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-[#0e2c4c] whitespace-nowrap">
                      {r.groupNo}
                    </td>
                    <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                      {r.shirka}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                      {r.agent}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 whitespace-nowrap">
                      {r.from}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-[#0e2c4c] whitespace-nowrap">
                      {r.flightOrBusNo}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                      <div>{r.time}</div>
                      <div className="text-[10px] text-slate-400">{r.date}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#0e2c4c] whitespace-nowrap">
                      {r.voucherNo}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold" title="Paid Pax">
                          P: {r.paidPax}
                        </span>
                        <span className="font-mono bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 font-semibold" title="Infant">
                          I: {r.infantPax}
                        </span>
                        <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 font-semibold" title="Without Bus">
                          W: {r.woBusPax}
                        </span>
                        <span className="font-bold text-[#0e2c4c] ml-1">
                          ({r.totalPax})
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                      {r.returnFlightNo || 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap text-[11px]">
                      {r.returnDateTime || 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap font-medium">
                      {r.transportBy}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
