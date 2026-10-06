import React, { useState, useEffect, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  ArrowLeftRight, 
  ExternalLink, 
  FileText, 
  Calendar, 
  RefreshCw, 
  ShieldAlert, 
  CheckCircle2, 
  Ban,
  Scale,
  CreditCard,
  Building2,
  Landmark,
  Wallet,
  Users
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
  fetchLedgerAccounts, 
  fetchLedgerEntries, 
  exportDayBookToCSV 
} from '../services/accountingService';
import { 
  LedgerAccountDoc, 
  LedgerEntryDoc, 
  LedgerAccountType, 
  LedgerEntryType 
} from '../types/accounting';
import { VoucherQuickModal } from '../components/accounting/VoucherQuickModal';
import { ReceiptViewerModal } from '../components/accounting/ReceiptViewerModal';
import { Link, useNavigate } from 'react-router-dom';

export const DayBookPage: React.FC = () => {
  const { role, userProfile } = useAuth();
  const { profile: company } = useCompany();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  const isOwner = role === 'owner';
  const isAgent = role === 'agent';
  const canView = useCan('Accounts', 'view') || isOwner;

  // Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [entries, setEntries] = useState<LedgerEntryDoc[]>([]);

  // Filter states
  const [currency, setCurrency] = useState<'SAR' | 'PKR'>('SAR');
  const [search, setSearch] = useState<string>('');
  const [entryTypeFilter, setEntryTypeFilter] = useState<string>('all');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [periodPreset, setPeriodPreset] = useState<string>('all');

  // Modals
  const [activeVoucherNo, setActiveVoucherNo] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofNo, setProofNo] = useState<string>('');

  // Load ledger entries & accounts
  const loadData = async () => {
    setLoading(true);
    try {
      const [accs, ents] = await Promise.all([
        fetchLedgerAccounts(),
        fetchLedgerEntries(),
      ]);
      setAccounts(accs);
      setEntries(ents);
    } catch {
      showError('Failed to load Day Book entries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Quick period presets
  const applyPeriodPreset = (preset: 'today' | 'this_week' | 'this_month' | 'last_month' | 'all') => {
    setPeriodPreset(preset);
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    if (preset === 'today') {
      const dStr = today.toISOString().split('T')[0];
      setStartDate(dStr);
      setEndDate(dStr);
    } else if (preset === 'this_week') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const mon = new Date(today.setDate(diff));
      setStartDate(mon.toISOString().split('T')[0]);
      setEndDate(new Date().toISOString().split('T')[0]);
    } else if (preset === 'this_month') {
      const first = new Date(y, m, 1).toISOString().split('T')[0];
      const last = new Date(y, m + 1, 0).toISOString().split('T')[0];
      setStartDate(first);
      setEndDate(last);
    } else if (preset === 'last_month') {
      const first = new Date(y, m - 1, 1).toISOString().split('T')[0];
      const last = new Date(y, m, 0).toISOString().split('T')[0];
      setStartDate(first);
      setEndDate(last);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Map accounts by ID
  const accountMap = useMemo(() => {
    return new Map(accounts.map((a) => [a.id, a]));
  }, [accounts]);

  // Filtered and sorted entries (chronological order)
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      // Date range
      if (startDate && e.date < startDate) return false;
      if (endDate && e.date > endDate) return false;

      // Entry type
      if (entryTypeFilter !== 'all' && e.entryType !== entryTypeFilter) {
        return false;
      }

      // Account type
      if (accountTypeFilter !== 'all') {
        const acc = accountMap.get(e.accountId);
        if (!acc || acc.accountType !== accountTypeFilter) {
          return false;
        }
      }

      // Keyword search
      if (search.trim()) {
        const q = search.toLowerCase();
        const acc = accountMap.get(e.accountId);
        const matchTrans = (e.transNo || '').toLowerCase().includes(q);
        const matchEntryNo = e.entryNo.toLowerCase().includes(q);
        const matchPart = (e.particulars || '').toLowerCase().includes(q);
        const matchInv = (e.invoiceRef || '').toLowerCase().includes(q);
        const matchVouch = (e.voucherNo || '').toLowerCase().includes(q);
        const matchAccCode = (acc?.accountCode || '').toLowerCase().includes(q);
        const matchAccTitle = (acc?.title || '').toLowerCase().includes(q);

        return matchTrans || matchEntryNo || matchPart || matchInv || matchVouch || matchAccCode || matchAccTitle;
      }

      return true;
    }).sort((a, b) => {
      // Primary sort: Date descending (latest first) or ascending
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.entryNo.localeCompare(a.entryNo);
    });
  }, [entries, startDate, endDate, entryTypeFilter, accountTypeFilter, search, accountMap]);

  // Totals for filtered records
  const totalDebit = useMemo(() => {
    return filteredEntries
      .filter((e) => !e.isVoid)
      .reduce((sum, e) => sum + (currency === 'SAR' ? e.debitSAR : e.debitPKR), 0);
  }, [filteredEntries, currency]);

  const totalCredit = useMemo(() => {
    return filteredEntries
      .filter((e) => !e.isVoid)
      .reduce((sum, e) => sum + (currency === 'SAR' ? e.creditSAR : e.creditPKR), 0);
  }, [filteredEntries, currency]);

  // Export Day Book
  const handleExport = () => {
    exportDayBookToCSV(filteredEntries, accounts, currency, company.companyName);
    success(`Day Book exported with ${filteredEntries.length} entries.`);
  };

  // Requirement 3: Agents never see the Day Book
  if (isAgent) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          The Day Book is a confidential chronological journal reserved exclusively for Agency Owners and Operational Staff. Sub-agents may review their own dedicated account ledger statement.
        </p>
        <Link
          to="/agent-portal"
          className="inline-block px-4 py-2 bg-[#0e2c4c] text-white text-xs font-bold rounded-lg shadow-xs"
        >
          Go to Agent Portal & Ledger →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Day Book — Chronological Journal"
        subtitle="Every double-entry transaction posted across all accounts in exact chronological order, with instant filtering and search."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'Day Book' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            {/* Currency toggle */}
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
              leftIcon={<Download className="w-3.5 h-3.5 text-emerald-600" />}
              onClick={handleExport}
            >
              Export CSV
            </Button>
          </div>
        }
 

      />


      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="md" className="border-slate-200">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Total Debits ({currency})
          </div>
          <div className="text-xl font-mono font-bold text-slate-900 mt-1.5">
            {currency} {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Across {filteredEntries.filter(e => !e.isVoid && (currency === 'SAR' ? e.debitSAR : e.debitPKR) > 0).length} debit entries
          </div>
        </Card>

        <Card padding="md" className="border-slate-200">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Total Credits ({currency})
          </div>
          <div className="text-xl font-mono font-bold text-slate-900 mt-1.5">
            {currency} {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Across {filteredEntries.filter(e => !e.isVoid && (currency === 'SAR' ? e.creditSAR : e.creditPKR) > 0).length} credit entries
          </div>
        </Card>

        <Card padding="md" className="border-slate-200 bg-[#0e2c4c] text-white">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Journal Balance Check
          </div>
          <div className="text-xl font-mono font-bold text-[#c9a227] mt-1.5">
            {Math.abs(totalDebit - totalCredit) < 0.01 ? 'Balanced (Δ = 0.00)' : `Δ = ${currency} ${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
          </div>
          <div className="text-[11px] text-slate-300 mt-0.5">
            {filteredEntries.length} transactions in active journal view
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card padding="md" className="border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Keyword Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voucher, invoice, trans#, particulars..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#0e2c4c]/20 focus:outline-none"
            />
          </div>

          {/* Entry Type Filter */}
          <div>
            <select
              value={entryTypeFilter}
              onChange={(e) => setEntryTypeFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Entry Types</option>
              <option value="Payment">Payments (Cash/Bank)</option>
              <option value="Invoice">Invoices (Sales/Charges)</option>
              <option value="Journal Voucher">Journal Vouchers</option>
              <option value="Voucher Charge">Voucher Charges</option>
              <option value="Refund">Refunds</option>
              <option value="Adjustment">Adjustments</option>
            </select>
          </div>

          {/* Account Type Filter */}
          <div>
            <select
              value={accountTypeFilter}
              onChange={(e) => setAccountTypeFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">All Account Types</option>
              <option value="agent">Sub-Agents</option>
              <option value="hotel">Hotels</option>
              <option value="vendor">Vendors / Transport</option>
              <option value="bank">Banks</option>
              <option value="cash">Cash Tills</option>
              <option value="customer">Direct Clients</option>
              <option value="income">Income Accounts</option>
              <option value="expense">Expense Accounts</option>
            </select>
          </div>

          {/* Date Range Inputs */}
          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="w-1/2 p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              placeholder="From"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPeriodPreset('custom');
              }}
              className="w-1/2 p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              placeholder="To"
            />
          </div>
        </div>

        {/* Quick Period Presets Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
            <span className="text-[11px] text-slate-400 font-semibold mr-1">Period:</span>
            <button
              type="button"
              onClick={() => applyPeriodPreset('today')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${periodPreset === 'today' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPeriodPreset('this_week')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${periodPreset === 'this_week' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => applyPeriodPreset('this_month')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${periodPreset === 'this_month' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => applyPeriodPreset('last_month')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${periodPreset === 'last_month' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Last Month
            </button>
            <button
              type="button"
              onClick={() => applyPeriodPreset('all')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${periodPreset === 'all' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All Time
            </button>
          </div>

          {(search || entryTypeFilter !== 'all' || accountTypeFilter !== 'all' || startDate || endDate) && (
            <button
              onClick={() => {
                setSearch('');
                setEntryTypeFilter('all');
                setAccountTypeFilter('all');
                applyPeriodPreset('all');
              }}
              className="text-slate-600 hover:text-rose-600 underline cursor-pointer text-[11px] whitespace-nowrap ml-2"
            >
              Reset filters
            </button>
          )}
        </div>
      </Card>

      {/* Chronological Table */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Trans.#</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Account (Ledger)</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Particulars (Details)</th>
                <th className="py-3 px-3">Ref</th>
                <th className="py-3 px-3 font-mono text-slate-600">Rate</th>
                <th className="py-3 px-3 text-right">Debit ({currency})</th>
                <th className="py-3 px-3 text-right">Credit ({currency})</th>
                <th className="py-3 px-3 text-center">Proof</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    Loading Day Book transactions...
                  </td>
                </tr>
              ) : filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-500">
                    No transactions match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e, idx) => {
                  const acc = accountMap.get(e.accountId);
                  const isVoid = e.isVoid;
                  const debit = currency === 'SAR' ? e.debitSAR : e.debitPKR;
                  const credit = currency === 'SAR' ? e.creditSAR : e.creditPKR;

                  return (
                    <tr
                      key={e.id || idx}
                      className={`transition-colors ${
                        isVoid 
                          ? 'bg-rose-50/40 text-slate-400 line-through opacity-70' 
                          : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/30 hover:bg-slate-50'
                      }`}
                    >
                      {/* Date */}
                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {e.date}
                      </td>

                      {/* Trans No */}
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--theme-primary)] whitespace-nowrap">
                        {e.transNo || e.entryNo}
                      </td>

                      {/* Entry Type */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge 
                          variant={
                            e.entryType === 'Payment' ? 'success' :
                            e.entryType === 'Invoice' ? 'navy' :
                            e.entryType === 'Journal Voucher' ? 'gold' : 'warning'
                          } 
                          size="sm"
                        >
                          {e.entryType}
                        </Badge>
                      </td>

                      {/* Account Link */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => navigate(`/accounts?accountId=${e.accountId}`)}
                          className="text-left group cursor-pointer"
                        >
                          <div className="font-semibold text-slate-900 group-hover:text-[var(--theme-primary)] group-hover:underline">
                            {acc?.title || 'Unknown Account'}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {acc?.accountCode || e.accountId}
                          </div>
                        </button>
                      </td>

                      {/* Account Category */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-[10px] font-bold uppercase text-slate-500">
                          {acc?.accountType || '—'}
                        </span>
                      </td>

                      {/* Particulars */}
                      <td className="py-2.5 px-3 min-w-[200px]">
                        <div className="font-medium text-slate-900 leading-snug">
                          {e.particulars}
                        </div>
                        {e.voucherNo && (
                          <button
                            type="button"
                            onClick={() => setActiveVoucherNo(e.voucherNo!)}
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono font-bold text-[var(--theme-primary)] bg-amber-50 hover:bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            <FileText className="w-3 h-3 text-[#c9a227]" />
                            <span>{e.voucherNo}</span>
                          </button>
                        )}
                        {isVoid && e.voidReason && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-0.5 not-line-through">
                            ⚠ {e.voidReason}
                          </div>
                        )}
                      </td>

                      {/* Reference */}
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {e.invoiceRef || '—'}
                      </td>

                      {/* Rate */}
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {e.rate ? e.rate.toFixed(2) : '—'}
                      </td>

                      {/* Debit */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap">
                        {debit > 0 ? (
                          <span className={isVoid ? 'text-slate-400' : 'text-slate-900'}>
                            {debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : '—'}
                      </td>

                      {/* Credit */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap">
                        {credit > 0 ? (
                          <span className={isVoid ? 'text-slate-400' : 'text-slate-900'}>
                            {credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : '—'}
                      </td>

                      {/* Proof */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {e.driveFileUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              setProofUrl(e.driveFileUrl!);
                              setProofNo(e.transNo || e.entryNo);
                            }}
                            className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Proof</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Table Footer Totals */}
            <tfoot className="bg-slate-100 font-mono font-bold text-slate-900 border-t-2 border-slate-300">
              <tr>
                <td colSpan={8} className="py-3 px-3 text-right uppercase text-[11px] font-sans">
                  Total Active Period:
                </td>
                <td className="py-3 px-3 text-right">
                  {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-3 text-right">
                  {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Voucher Modal */}
      {activeVoucherNo && (
        <VoucherQuickModal
          voucherNo={activeVoucherNo}
          isOpen={Boolean(activeVoucherNo)}
          onClose={() => setActiveVoucherNo(null)}
        />
      )}

      {/* Receipt Proof Viewer Modal */}
      <ReceiptViewerModal
        isOpen={Boolean(proofUrl)}
        onClose={() => setProofUrl(null)}
        receiptUrl={proofUrl}
        paymentNo={proofNo}
        webViewLink={proofUrl?.startsWith('https://drive.google.com') ? proofUrl : null}
        userRole={role}
      />
    </div>
  );
};
