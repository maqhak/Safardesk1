import React, { useState, useEffect, useMemo } from 'react';
import { 
  Scale, 
  Search, 
  ArrowLeftRight, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  Building2, 
  Landmark, 
  Wallet, 
  Users, 
  ExternalLink,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CheckCircle2
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { 
  fetchLedgerAccounts, 
  fetchLedgerEntries, 
  computeAllAccountBalances,
  cacheAccountBalancesSnapshot 
} from '../services/accountingService';
import { LedgerAccountDoc, LedgerEntryDoc, BalancesSummaryData, AccountBalanceRow } from '../types/accounting';
import { Link, useNavigate } from 'react-router-dom';

export const BalancesSummaryPage: React.FC = () => {
  const { profile: company } = useCompany();
  const { success, error: showError, info } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState<boolean>(true);
  const [recomputing, setRecomputing] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [entries, setEntries] = useState<LedgerEntryDoc[]>([]);
  const [search, setSearch] = useState<string>('');
  const [currency, setCurrency] = useState<'SAR' | 'PKR'>('SAR');

  // Load accounts and entries, then compute balances
  const loadData = async (showToast = false) => {
    try {
      const [accs, ents] = await Promise.all([
        fetchLedgerAccounts(),
        fetchLedgerEntries(),
      ]);
      setAccounts(accs);
      setEntries(ents);

      const computed = computeAllAccountBalances(accs, ents);
      // Cache recomputed snapshot on account docs as required
      await cacheAccountBalancesSnapshot(computed);

      if (showToast) {
        success('All balances recomputed live from ledger entries.');
      }
    } catch {
      showError('Failed to load accounts and balances.');
    } finally {
      setLoading(false);
      setRecomputing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleManualRecompute = async () => {
    setRecomputing(true);
    await loadData(true);
  };

  // Recompute balances from current accounts and entries state (single source of truth)
  const summary: BalancesSummaryData = useMemo(() => {
    return computeAllAccountBalances(accounts, entries);
  }, [accounts, entries]);

  // Export Balances Summary to CSV
  const handleExportSummary = () => {
    const lines: string[] = [];
    lines.push(`BALANCES SUMMARY / POSITION SHEET`);
    lines.push(`Agency: ${company.companyName}`);
    lines.push(`As of: ${new Date().toLocaleString()}`);
    lines.push(`Last Recomputed: ${summary.lastRecomputedAt}`);
    lines.push('');

    lines.push('GRAND SUMMARY,SAR,PKR');
    lines.push(`Total Receivable,${summary.totalReceivableSAR.toFixed(2)},${summary.totalReceivablePKR.toFixed(2)}`);
    lines.push(`Total Payable,${summary.totalPayableSAR.toFixed(2)},${summary.totalPayablePKR.toFixed(2)}`);
    lines.push(`Net Position (Receivable - Payable),${summary.netPositionSAR.toFixed(2)},${summary.netPositionPKR.toFixed(2)}`);
    lines.push('');

    const appendSection = (title: string, rows: AccountBalanceRow[], totalSAR: number, totalPKR: number) => {
      lines.push(`${title.toUpperCase()}`);
      lines.push('Code,Title,Limit (SAR),SAR Balance,PKR Balance,Status,Last Activity');
      rows.forEach((r) => {
        const titleEscaped = `"${r.account.title.replace(/"/g, '""')}"`;
        const status = r.isOverLimit ? 'OVER LIMIT' : 'Normal';
        lines.push(
          `"${r.account.accountCode}",${titleEscaped},${r.creditLimitSAR || 0},${r.balanceSAR.toFixed(2)},${r.balancePKR.toFixed(2)},"${status}","${r.lastEntryDate || '—'}"`
        );
      });
      lines.push(`SECTION TOTAL,,"",${totalSAR.toFixed(2)},${totalPKR.toFixed(2)},,`);
      lines.push('');
    };

    appendSection('Agents (Receivable)', summary.agents, summary.totalAgentsSAR, summary.totalAgentsPKR);
    appendSection('Hotels & Vendors (Payable)', summary.hotelsVendors, summary.totalHotelsVendorsSAR, summary.totalHotelsVendorsPKR);
    appendSection('Banks', summary.banks, summary.totalBanksSAR, summary.totalBanksPKR);
    appendSection('Cash Tills', summary.cash, summary.totalCashSAR, summary.totalCashPKR);
    appendSection('Clients / Customers (Receivable)', summary.customers, summary.totalCustomersSAR, summary.totalCustomersPKR);

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `balances_summary_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    success('Balances summary exported to CSV.');
  };

  // Search filter helper
  const filterRows = (rows: AccountBalanceRow[]) => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.account.title.toLowerCase().includes(q) ||
        r.account.accountCode.toLowerCase().includes(q) ||
        (r.account.notes || '').toLowerCase().includes(q)
    );
  };

  const filteredAgents = useMemo(() => filterRows(summary.agents), [summary.agents, search]);
  const filteredHotelsVendors = useMemo(() => filterRows(summary.hotelsVendors), [summary.hotelsVendors, search]);
  const filteredBanks = useMemo(() => filterRows(summary.banks), [summary.banks, search]);
  const filteredCash = useMemo(() => filterRows(summary.cash), [summary.cash, search]);
  const filteredCustomers = useMemo(() => filterRows(summary.customers), [summary.customers, search]);

  // Count over-limit agents
  const overLimitAgents = useMemo(() => summary.agents.filter((a) => a.isOverLimit), [summary.agents]);

  // Navigate to full ledger statement
  const handleOpenLedger = (accountId: string) => {
    navigate(`/accounts?accountId=${accountId}`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Balances Summary & Financial Position"
        subtitle="One screen, one glance. Real-time computed snapshot across all Agents, Hotels, Vendors, Banks, Cash drawers, and Clients."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'Balances Summary' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            {/* SAR / PKR currency view toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setCurrency('SAR')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  currency === 'SAR' 
                    ? 'bg-[#0e2c4c] text-white shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>SAR</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrency('PKR')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  currency === 'PKR' 
                    ? 'bg-[#0e2c4c] text-white shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowLeftRight className="w-3 h-3 text-[#c9a227]" />
                <span>PKR</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${recomputing ? 'animate-spin' : ''}`} />}
              onClick={handleManualRecompute}
              disabled={recomputing}
            >
              Recompute
            </Button>

            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5 text-emerald-600" />}
              onClick={handleExportSummary}
            >
              Export CSV
            </Button>
          </div>
        }
 

      />


      {/* Over-limit Agent Alert Banner (feeds Smart Alerts) */}
      {overLimitAgents.length > 0 && (
        <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-600 text-white rounded-lg">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-rose-950 uppercase tracking-wide">
                Credit Limit Alert: {overLimitAgents.length} {overLimitAgents.length === 1 ? 'Agent' : 'Agents'} Exceeded Due Limits
              </h4>
              <p className="text-[11px] text-rose-700">
                {overLimitAgents.map(a => `${a.account.title} (Over: SAR ${a.overDueAmountSAR.toLocaleString()})`).join(' • ')}
              </p>
            </div>
          </div>
          <Link
            to="/accounts"
            className="px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-xs font-bold shadow-2xs whitespace-nowrap"
          >
            Review Agency Ledgers →
          </Link>
        </div>
      )}

      {/* Top Grand Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Receivable */}
        <Card padding="md" className="border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Receivable (Money Inbound)
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-700 mt-2">
            {currency === 'SAR' ? 'SAR' : 'PKR'}{' '}
            {(currency === 'SAR' ? summary.totalReceivableSAR : summary.totalReceivablePKR).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Agents + Direct Clients</span>
            <span className="font-mono text-slate-600">
              {currency === 'SAR' ? `≈ PKR ${summary.totalReceivablePKR.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `≈ SAR ${summary.totalReceivableSAR.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </span>
          </div>
        </Card>

        {/* Total Payable */}
        <Card padding="md" className="border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Payable (Money Outbound)
            </span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-rose-700 mt-2">
            {currency === 'SAR' ? 'SAR' : 'PKR'}{' '}
            {(currency === 'SAR' ? summary.totalPayableSAR : summary.totalPayablePKR).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Hotels, Shirkas & Vendors</span>
            <span className="font-mono text-slate-600">
              {currency === 'SAR' ? `≈ PKR ${summary.totalPayablePKR.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `≈ SAR ${summary.totalPayableSAR.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </span>
          </div>
        </Card>

        {/* Net Position */}
        <Card padding="md" className="border-slate-200 bg-[#0e2c4c] text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Net Financial Position
            </span>
            <div className="p-2 bg-white/10 text-[#c9a227] rounded-lg">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-mono font-bold text-[#c9a227] mt-2">
            {currency === 'SAR' ? 'SAR' : 'PKR'}{' '}
            {(currency === 'SAR' ? summary.netPositionSAR : summary.netPositionPKR).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-300 mt-1 flex items-center justify-between">
            <span>Receivables − Payables</span>
            <span className="font-mono text-slate-200">
              {currency === 'SAR' ? `≈ PKR ${summary.netPositionPKR.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `≈ SAR ${summary.netPositionSAR.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            </span>
          </div>
        </Card>
      </div>

      {/* Search and Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search account code, title..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#0e2c4c]/20 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-500 w-full sm:w-auto justify-between sm:justify-end">
          <span className="text-[11px]">
            Single Source of Truth: computed from <strong>{entries.filter(e => !e.isVoid).length}</strong> active ledger entries
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            Last recomputed: {new Date(summary.lastRecomputedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Grouped Section 1: AGENTS (Receivable per Agent) */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Sub-Agents — Trade Receivables ({filteredAgents.length})
            </h3>
          </div>
          <div className="text-xs font-mono font-bold text-emerald-700">
            Section Total: {currency === 'SAR' ? 'SAR' : 'PKR'}{' '}
            {(currency === 'SAR' ? summary.totalAgentsSAR : summary.totalAgentsPKR).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-2.5 px-3">Account Code</th>
                <th className="py-2.5 px-3">Agent Title & Territory</th>
                <th className="py-2.5 px-3 text-right">Credit Limit (SAR)</th>
                <th className="py-2.5 px-3 text-right">Balance (SAR)</th>
                <th className="py-2.5 px-3 text-right">Balance (PKR)</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No matching agent accounts.
                  </td>
                </tr>
              ) : (
                filteredAgents.map((r) => (
                  <tr
                    key={r.account.id}
                    onClick={() => handleOpenLedger(r.account.id)}
                    className={`transition-colors cursor-pointer ${
                      r.isOverLimit 
                        ? 'bg-rose-50/50 hover:bg-rose-50' 
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-[#0e2c4c] whitespace-nowrap">
                      {r.account.accountCode}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{r.account.title}</div>
                      <div className="text-[10px] text-slate-500">{r.account.notes || 'Sub-agent partner'}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                      SAR {r.creditLimitSAR.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                      <span className={r.isOverLimit ? 'text-rose-700 font-black' : 'text-slate-900'}>
                        SAR {r.balanceSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                      PKR {r.balancePKR.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      {r.isOverLimit ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>Over Limit (+SAR {r.overDueAmountSAR.toLocaleString()})</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Within Limit</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0e2c4c] hover:underline">
                        <span>Ledger</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Grouped Section 2: HOTELS & VENDORS (Payable per Hotel/Vendor) */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Hotels & Ground Vendors — Trade Payables ({filteredHotelsVendors.length})
            </h3>
          </div>
          <div className="text-xs font-mono font-bold text-rose-700">
            Section Total: {currency === 'SAR' ? 'SAR' : 'PKR'}{' '}
            {(currency === 'SAR' ? summary.totalHotelsVendorsSAR : summary.totalHotelsVendorsPKR).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-2.5 px-3">Account Code</th>
                <th className="py-2.5 px-3">Hotel / Vendor Entity</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3 text-right">Balance (SAR)</th>
                <th className="py-2.5 px-3 text-right">Balance (PKR)</th>
                <th className="py-2.5 px-3 text-center">Position</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredHotelsVendors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No matching hotel or vendor accounts.
                  </td>
                </tr>
              ) : (
                filteredHotelsVendors.map((r) => (
                  <tr
                    key={r.account.id}
                    onClick={() => handleOpenLedger(r.account.id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-[#0e2c4c] whitespace-nowrap">
                      {r.account.accountCode}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{r.account.title}</div>
                      <div className="text-[10px] text-slate-500">{r.account.notes || 'Hospitality / Transport supplier'}</div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <Badge variant="navy" size="sm">
                        {r.account.accountType.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                      SAR {Math.abs(r.balanceSAR).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                      PKR {Math.abs(r.balancePKR).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        Payable
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0e2c4c] hover:underline">
                        <span>Ledger</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Grouped Section 3: BANKS & CASH (Balance per Bank & Drawer) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Banks */}
        <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-[#0e2c4c]" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Bank Accounts ({filteredBanks.length})
              </h3>
            </div>
            <div className="text-xs font-mono font-bold text-emerald-700">
              SAR {summary.totalBanksSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
                <tr>
                  <th className="py-2.5 px-3">Bank</th>
                  <th className="py-2.5 px-3 text-right">Balance (SAR)</th>
                  <th className="py-2.5 px-3 text-right">Balance (PKR)</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredBanks.map((r) => (
                  <tr
                    key={r.account.id}
                    onClick={() => handleOpenLedger(r.account.id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{r.account.title}</div>
                      <div className="text-[10px] font-mono text-slate-500">{r.account.accountCode}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                      SAR {r.balanceSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                      PKR {r.balancePKR.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0e2c4c] hover:underline">
                        <span>Ledger</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Cash Tills */}
        <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-[#0e2c4c]" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Cash Drawers & Branch Tills ({filteredCash.length})
              </h3>
            </div>
            <div className="text-xs font-mono font-bold text-emerald-700">
              SAR {summary.totalCashSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
                <tr>
                  <th className="py-2.5 px-3">Cash Till / Drawer</th>
                  <th className="py-2.5 px-3 text-right">Balance (SAR)</th>
                  <th className="py-2.5 px-3 text-right">Balance (PKR)</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredCash.map((r) => (
                  <tr
                    key={r.account.id}
                    onClick={() => handleOpenLedger(r.account.id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{r.account.title}</div>
                      <div className="text-[10px] font-mono text-slate-500">{r.account.accountCode}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                      SAR {r.balanceSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                      PKR {r.balancePKR.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0e2c4c] hover:underline">
                        <span>Ledger</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Grouped Section 4: CUSTOMERS / DIRECT CLIENTS (Receivable per B2C client) */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Direct Clients & B2C Customers ({filteredCustomers.length})
            </h3>
          </div>
          <div className="text-xs font-mono font-bold text-emerald-700">
            Section Total: {currency === 'SAR' ? 'SAR' : 'PKR'}{' '}
            {(currency === 'SAR' ? summary.totalCustomersSAR : summary.totalCustomersPKR).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-2.5 px-3">Account Code</th>
                <th className="py-2.5 px-3">Client Name</th>
                <th className="py-2.5 px-3">Notes</th>
                <th className="py-2.5 px-3 text-right">Balance (SAR)</th>
                <th className="py-2.5 px-3 text-right">Balance (PKR)</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No matching direct customer accounts.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((r) => (
                  <tr
                    key={r.account.id}
                    onClick={() => handleOpenLedger(r.account.id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3 font-mono font-bold text-[#0e2c4c] whitespace-nowrap">
                      {r.account.accountCode}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {r.account.title}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {r.account.notes || 'Private customer package'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                      SAR {r.balanceSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                      PKR {r.balancePKR.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0e2c4c] hover:underline">
                        <span>Ledger</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
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
