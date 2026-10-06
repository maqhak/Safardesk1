import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calculator, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  Plus, 
  ArrowLeftRight, 
  ShieldAlert, 
  Building2, 
  CreditCard, 
  Landmark, 
  Wallet, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  ExternalLink, 
  Ban, 
  RotateCcw,
  Sparkles,
  RefreshCw,
  Users,
  Scale,
  BookOpen,
  FileSpreadsheet,
  Mic
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { useCurrentRate } from '../services/exchangeRateService';
import { 
  LedgerAccountDoc, 
  LedgerEntryDoc, 
  LedgerAccountType, 
  LedgerEntryType 
} from '../types/accounting';
import { 
  fetchLedgerAccounts, 
  fetchLedgerEntries, 
  computeLedgerStatement, 
  voidLedgerEntry, 
  postBalancedTransaction, 
  postItemServiceEntry,
  exportLedgerToCSV,
  exportLedgerDetailedCSV,
  exportLedgerToPDF 
} from '../services/accountingService';
import { VoucherQuickModal } from '../components/accounting/VoucherQuickModal';
import { ReceiptViewerModal } from '../components/accounting/ReceiptViewerModal';

export const AccountsPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { profile: company } = useCompany();
  const { success, error: showError, info } = useToast();
  const [searchParams] = useSearchParams();
  const paramAccountId = searchParams.get('accountId');

  const isOwner = role === 'owner';
  const isAgent = role === 'agent';
  const canCreate = useCan('Accounts', 'create') || isOwner;

  // Data state
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [entries, setEntries] = useState<LedgerEntryDoc[]>([]);

  // Selected Account
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  // Category filter for accounts picker
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accountSearch, setAccountSearch] = useState<string>('');

  // Currency Toggle: SAR ⇄ PKR
  const [currency, setCurrency] = useState<'SAR' | 'PKR'>('SAR');

  // Period Filter
  const [periodPreset, setPeriodPreset] = useState<'all' | 'this_month' | 'last_month' | 'this_year' | 'custom'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Voucher Quick Modal
  const [activeVoucherNo, setActiveVoucherNo] = useState<string | null>(null);

  // Receipt Proof Modal
  const [proofModalUrl, setProofModalUrl] = useState<string | null>(null);
  const [proofModalPaymentNo, setProofModalPaymentNo] = useState<string>('');
  const [proofModalAccountId, setProofModalAccountId] = useState<string | null>(null);

  // Audio player state for WhatsApp voice note settlements
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const handleToggleInlineAudio = (url: string) => {
    if (activeAudioUrl === url && isPlayingAudio) {
      audioPlayerRef.current?.pause();
      setIsPlayingAudio(false);
    } else {
      setActiveAudioUrl(url);
      setIsPlayingAudio(true);
      setTimeout(() => {
        audioPlayerRef.current?.play();
      }, 50);
    }
  };

  // Void Modal
  const [voidModalOpen, setVoidModalOpen] = useState<boolean>(false);
  const [entryToVoid, setEntryToVoid] = useState<LedgerEntryDoc | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [voiding, setVoiding] = useState<boolean>(false);

  // New Balanced Transaction Modal
  const [transModalOpen, setTransModalOpen] = useState<boolean>(false);
  const [savingTrans, setSavingTrans] = useState<boolean>(false);
  const [newTransDate, setNewTransDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newTransType, setNewTransType] = useState<LedgerEntryType>('Journal Voucher');
  const [newTransNo, setNewTransNo] = useState<string>(`JV-${Date.now().toString().slice(-5)}`);
  const [newParticulars, setNewParticulars] = useState<string>('');
  const [newInvRef, setNewInvRef] = useState<string>('');
  const [newVoucherNo, setNewVoucherNo] = useState<string>('');
  const masterRate = useCurrentRate('SAR-PKR');
  const [newRate, setNewRate] = useState<number>(masterRate);

  useEffect(() => {
    setNewRate(masterRate);
  }, [masterRate]);
  const [newDebitAccountId, setNewDebitAccountId] = useState<string>('');
  const [newCreditAccountId, setNewCreditAccountId] = useState<string>('');
  const [newAmountSAR, setNewAmountSAR] = useState<number>(0);
  const [newMofaPax, setNewMofaPax] = useState<number>(0);
  const [newHotelPax, setNewHotelPax] = useState<number>(0);
  const [newDriveUrl, setNewDriveUrl] = useState<string>('');

  // Item/Service Entry Modal
  const [itemModalOpen, setItemModalOpen] = useState<boolean>(false);
  const [savingItem, setSavingItem] = useState<boolean>(false);
  const [itemDate, setItemDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [itemName, setItemName] = useState<string>('');
  const [itemSupplierId, setItemSupplierId] = useState<string>('');
  const [itemCustomerId, setItemCustomerId] = useState<string>('');
  const [itemBuyingSAR, setItemBuyingSAR] = useState<number>(0);
  const [itemSellingSAR, setItemSellingSAR] = useState<number>(0);
  const [itemRate, setItemRate] = useState<number>(0);
  const [itemDescription, setItemDescription] = useState<string>('');

  useEffect(() => {
    if (itemRate === 0) setItemRate(masterRate);
  }, [masterRate]);

  // Load accounts and entries
  const loadData = async () => {
    setLoading(true);
    try {
      const [accList, entList] = await Promise.all([
        fetchLedgerAccounts(),
        fetchLedgerEntries(),
      ]);

      // If current user is agent, restrict account list to their linked account
      let availableAccounts = accList;
      if (isAgent) {
        availableAccounts = accList.filter((a) => a.linkedId === userProfile?.uid || a.linkedId === userProfile?.agentId || a.accountCode === 'AGT-001');
      }

      setAccounts(availableAccounts);
      setEntries(entList);

      if (paramAccountId && availableAccounts.some(a => a.id === paramAccountId)) {
        setSelectedAccountId(paramAccountId);
      } else if (availableAccounts.length > 0 && !selectedAccountId) {
        setSelectedAccountId(availableAccounts[0].id);
      }
    } catch {
      showError('Failed to load accounts and ledger entries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isAgent, userProfile?.uid, userProfile?.agentId]);

  // Handle Quick Period Presets
  const applyPeriodPreset = (preset: 'all' | 'this_month' | 'last_month' | 'this_year' | 'custom') => {
    setPeriodPreset(preset);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    } else if (preset === 'this_month') {
      const start = new Date(y, m, 1).toISOString().split('T')[0];
      const end = new Date(y, m + 1, 0).toISOString().split('T')[0];
      setStartDate(start);
      setEndDate(end);
    } else if (preset === 'last_month') {
      const start = new Date(y, m - 1, 1).toISOString().split('T')[0];
      const end = new Date(y, m, 0).toISOString().split('T')[0];
      setStartDate(start);
      setEndDate(end);
    } else if (preset === 'this_year') {
      setStartDate(`${y}-01-01`);
      setEndDate(`${y}-12-31`);
    }
  };

  // Currently selected account doc
  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;
  }, [accounts, selectedAccountId]);

  // Filter accounts for the dropdown/picker
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (categoryFilter !== 'all' && acc.accountType !== categoryFilter) {
        return false;
      }
      if (accountSearch.trim()) {
        const q = accountSearch.toLowerCase();
        return (
          acc.title.toLowerCase().includes(q) ||
          acc.accountCode.toLowerCase().includes(q) ||
          acc.accountType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [accounts, categoryFilter, accountSearch]);

  // Entries for the currently selected account
  const accountEntries = useMemo(() => {
    if (!selectedAccount) return [];
    return entries.filter((e) => e.accountId === selectedAccount.id);
  }, [entries, selectedAccount]);

  // Compute Statement with Previous Balance, chronological running balance, and totals
  const statement = useMemo(() => {
    if (!selectedAccount) return null;
    return computeLedgerStatement(
      selectedAccount,
      accountEntries,
      currency,
      startDate || undefined,
      endDate || undefined
    );
  }, [selectedAccount, accountEntries, currency, startDate, endDate]);

  // Handle Void
  const handleConfirmVoid = async () => {
    if (!entryToVoid) return;
    if (!voidReason.trim()) {
      showError('Please provide an audit reason for voiding this transaction.');
      return;
    }

    setVoiding(true);
    try {
      await voidLedgerEntry(entryToVoid.id, voidReason, userProfile?.name || 'Owner');
      success(`Transaction #${entryToVoid.entryNo} voided — reversal entry posted.`);
      setVoidModalOpen(false);
      setEntryToVoid(null);
      setVoidReason('');
      await loadData();
    } catch {
      showError('Failed to void ledger entry.');
    } finally {
      setVoiding(false);
    }
  };

  // Handle Balanced Transaction Submission
  const handlePostTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDebitAccountId || !newCreditAccountId) {
      showError('Please select both a Debit account and a Credit account.');
      return;
    }
    if (newDebitAccountId === newCreditAccountId) {
      showError('Debit account and Credit account cannot be the same.');
      return;
    }
    if (newAmountSAR <= 0) {
      showError('Amount must be greater than zero.');
      return;
    }

    setSavingTrans(true);
    try {
      await postBalancedTransaction({
        date: newTransDate,
        entryType: newTransType,
        transNo: newTransNo,
        particulars: newParticulars || `${newTransType} posted`,
        invoiceRef: newInvRef || undefined,
        voucherNo: newVoucherNo || undefined,
        rate: newRate,
        debitAccountId: newDebitAccountId,
        creditAccountId: newCreditAccountId,
        amountSAR: newAmountSAR,
        mofaPax: newMofaPax,
        hotelPax: newHotelPax,
        driveFileUrl: newDriveUrl || undefined,
        proofType: newDriveUrl ? 'receipt' : null,
        createdBy: userProfile?.name || 'Operator',
      });

      success('Balanced transaction posted successfully across both ledgers.');
      setTransModalOpen(false);
      // Reset form
      setNewParticulars('');
      setNewInvRef('');
      setNewVoucherNo('');
      setNewAmountSAR(0);
      setNewMofaPax(0);
      setNewHotelPax(0);
      setNewDriveUrl('');
      setNewTransNo(`JV-${Date.now().toString().slice(-5)}`);
      await loadData();
    } catch {
      showError('Failed to post balanced transaction.');
    } finally {
      setSavingTrans(false);
    }
  };

  // Item/Service Entry: supplier -> us -> customer (e.g. Viaa service from Sheraz Bhai)
  const handleSaveItemService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      showError('Please enter the Item / Service name.');
      return;
    }
    if (!itemSupplierId && !itemCustomerId) {
      showError('Please select a Supplier (party from) or a Customer (party to).');
      return;
    }
    if (itemSupplierId && itemBuyingSAR <= 0) {
      showError('Buying price must be greater than zero when a Supplier is selected.');
      return;
    }
    if (itemCustomerId && itemSellingSAR <= 0) {
      showError('Selling price must be greater than zero when a Customer is selected.');
      return;
    }
    if (itemBuyingSAR <= 0 && itemSellingSAR <= 0) {
      showError('Enter a Buying price or a Selling price.');
      return;
    }

    setSavingItem(true);
    try {
      const transNo = `ITM-${Date.now().toString().slice(-6)}`;
      await postItemServiceEntry({
        date: itemDate,
        transNo,
        itemName: itemName.trim(),
        description: itemDescription,
        supplierAccountId: itemSupplierId || null,
        customerAccountId: itemCustomerId || null,
        buyingSAR: itemBuyingSAR,
        sellingSAR: itemSellingSAR,
        rate: itemRate || masterRate,
        createdBy: userProfile?.name || 'Operator',
      });

      const margin = Math.round((itemSellingSAR - itemBuyingSAR) * 100) / 100;
      success(`Item/Service entry ${transNo} posted.${margin !== 0 ? ` Margin: SAR ${margin.toLocaleString()}` : ''}`);
      setItemModalOpen(false);
      // Reset form
      setItemName('');
      setItemSupplierId('');
      setItemCustomerId('');
      setItemBuyingSAR(0);
      setItemSellingSAR(0);
      setItemDescription('');
      setItemDate(new Date().toISOString().split('T')[0]);
      await loadData();
    } catch {
      showError('Failed to post item/service entry.');
    } finally {
      setSavingItem(false);
    }
  };

  // Export CSV (kept for compatibility)
  const handleExport = () => {
    if (!statement) return;
    exportLedgerToCSV(statement, company.companyName);
    success(`Statement for ${statement.account.accountCode} exported to CSV.`);
  };

  // Download detailed CSV
  const handleExportExcel = () => {
    if (!statement) return;
    exportLedgerDetailedCSV(statement, company.companyName);
    success(`Statement for ${statement.account.accountCode} downloaded as CSV.`);
  };

  // Download PDF
  const handleExportPDF = () => {
    if (!statement) return;
    exportLedgerToPDF(statement, company.companyName, (company as any).city || '');
    success(`Statement for ${statement.account.accountCode} downloaded as PDF.`);
  };

  // Print view
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-3">
      {/* Branded Statement Header for Print/PDF View */}
      <div className="hidden print:block border-b-2 pb-4 mb-4" style={{ borderColor: 'var(--theme-primary)' }}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-[var(--theme-primary)] tracking-tight">{company.companyName}</h1>
            <p className="text-xs text-slate-700 font-semibold">{company.legalName || 'Hajj & Umrah Tour Operations'}</p>
            <p className="text-[11px] text-slate-500">{company.address}, {company.city} • Tel: {company.phone} • Email: {company.email}</p>
          </div>
          <div className="text-right">
            <span className="inline-block text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider" style={{ backgroundColor: 'var(--theme-primary)' }}>
              STATEMENT OF ACCOUNT
            </span>
            <div className="text-xs text-slate-600 mt-1">
              Currency: <strong>{currency}</strong>
            </div>
            <div className="text-[11px] text-slate-500">
              Print Date: {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>

        {selectedAccount && (
          <div className="mt-4 pt-3 border-t border-slate-300 grid grid-cols-2 text-xs">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Account Title & Code:</span>
              <strong className="text-sm text-slate-900">{selectedAccount.title}</strong>
              <span className="font-mono text-xs text-slate-600 ml-2">({selectedAccount.accountCode})</span>
              <span className="block text-[11px] text-slate-500 capitalize">Type: {selectedAccount.accountType}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 text-[10px] uppercase font-bold block">Statement Period:</span>
              <strong className="text-slate-900">{statement?.periodLabel || 'All Time'}</strong>
              <div className="text-[11px] mt-0.5">
                Closing Balance: <strong className="font-mono text-[var(--theme-primary)]">{currency} {statement?.closingBalance.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Screen Header */}
      <div className="print:hidden">
        <PageHeader
          title="General Accounts & Ledgers"
          subtitle="Multi-entity double-entry ledger system. Every Bank, Agent, Hotel, Vendor, Client, and Cash till maintains an independent audited ledger."
          breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Accounts' }]}
          actions={
            <div className="flex items-center gap-2">
              {/* Requirement 4: SAR ⇄ PKR toggle button */}
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
                  <span>SAR View</span>
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
                  <span>PKR View</span>
                </button>
              </div>

              {canCreate && !isAgent && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => {
                      setItemRate(masterRate);
                      setItemModalOpen(true);
                    }}
                  >
                    Item/Service Entry
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={() => {
                      setNewDebitAccountId(selectedAccountId || '');
                      setTransModalOpen(true);
                    }}
                  >
                    Post Balanced Entry
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="w-4 h-4 text-emerald-600" />}
                onClick={handleExportExcel}
                title="Download detailed statement as CSV"
              >
                CSV (Detailed)
              </Button>

              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="w-4 h-4 text-red-600" />}
                onClick={handleExportPDF}
                title="Download as PDF"
              >
                PDF
              </Button>

              <Button
                variant="outline"
                size="sm"
                leftIcon={<Printer className="w-4 h-4 text-slate-700" />}
                onClick={handlePrint}
                title="Print Statement"
              >
                Print Statement
              </Button>
            </div>
          }
        />

      </div>

      {/* Account Picker & Statement Controls Bar */}
      <Card padding="md" className="border-slate-200 shadow-xs print:hidden space-y-4">
        {/* Category Tabs for Accounts */}
        {!isAgent && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs border-b border-slate-100">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap ${
                categoryFilter === 'all' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Ledgers ({accounts.length})
            </button>
            <button
              onClick={() => setCategoryFilter('agent')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                categoryFilter === 'agent' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Agents</span>
            </button>
            <button
              onClick={() => setCategoryFilter('hotel')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                categoryFilter === 'hotel' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>Hotels</span>
            </button>
            <button
              onClick={() => setCategoryFilter('vendor')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                categoryFilter === 'vendor' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>Vendors (Shirkas)</span>
            </button>
            <button
              onClick={() => setCategoryFilter('bank')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                categoryFilter === 'bank' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Landmark className="w-3 h-3" />
              <span>Banks</span>
            </button>
            <button
              onClick={() => setCategoryFilter('cash')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                categoryFilter === 'cash' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Wallet className="w-3 h-3" />
              <span>Cash Tills</span>
            </button>
            <button
              onClick={() => setCategoryFilter('customer')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                categoryFilter === 'customer' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Clients (B2C)</span>
            </button>
            <button
              onClick={() => setCategoryFilter('income')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                categoryFilter === 'income' ? 'bg-[#0e2c4c] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-[#c9a227]" />
              <span>System Income</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
          {/* Account Dropdown */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
              <span>Select Ledger Account</span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border-2 border-[#0e2c4c] rounded-xl text-sm font-bold text-[var(--theme-primary)] focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20 shadow-xs cursor-pointer"
            >
              {filteredAccounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="text-slate-900 font-semibold">
                  [{acc.accountCode}] {acc.title} ({acc.accountType.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Period Presets */}
          <div className="md:col-span-1 lg:col-span-2 flex flex-col justify-end">
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Statement Period
            </label>
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => applyPeriodPreset('all')}
                className={`flex-1 py-1 rounded transition cursor-pointer text-center ${periodPreset === 'all' ? 'bg-white text-[var(--theme-primary)] shadow-xs' : 'text-slate-600'}`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => applyPeriodPreset('this_month')}
                className={`flex-1 py-1 rounded transition cursor-pointer text-center ${periodPreset === 'this_month' ? 'bg-white text-[var(--theme-primary)] shadow-xs' : 'text-slate-600'}`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => applyPeriodPreset('last_month')}
                className={`flex-1 py-1 rounded transition cursor-pointer text-center ${periodPreset === 'last_month' ? 'bg-white text-[var(--theme-primary)] shadow-xs' : 'text-slate-600'}`}
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => applyPeriodPreset('this_year')}
                className={`flex-1 py-1 rounded transition cursor-pointer text-center ${periodPreset === 'this_year' ? 'bg-white text-[var(--theme-primary)] shadow-xs' : 'text-slate-600'}`}
              >
                This Year
              </button>
            </div>
          </div>
        </div>

        {/* Custom Date Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-semibold">Date Range Filter:</span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPeriodPreset('custom');
                setStartDate(e.target.value);
              }}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
              placeholder="From Date"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPeriodPreset('custom');
                setEndDate(e.target.value);
              }}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
              placeholder="To Date"
            />
          </div>
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setPeriodPreset('all');
              }}
              className="text-slate-500 hover:text-rose-600 underline cursor-pointer text-[11px]"
            >
              Clear dates
            </button>
          )}

          <div className="ml-auto text-xs text-slate-500">
            Account Code: <strong className="font-mono text-[var(--theme-primary)]">{selectedAccount?.accountCode}</strong>
            <span className="mx-2">•</span>
            Type: <span className="capitalize font-semibold text-slate-700">{selectedAccount?.accountType}</span>
          </div>
        </div>
      </Card>

      {/* Account Info Card & Live Balances */}
      {selectedAccount && statement && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
          <Card padding="md" className="border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Account Title</div>
            <div className="text-base font-bold text-slate-900 truncate mt-0.5">{selectedAccount.title}</div>
            <div className="text-xs text-slate-500 mt-1 font-mono">{selectedAccount.accountCode} • {selectedAccount.accountType.toUpperCase()}</div>
          </Card>

          <Card padding="md" className="border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Opening Balance (B/F)</div>
            <div className="text-lg font-mono font-bold text-slate-800 mt-0.5">
              {currency} {statement.previousBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Carried forward prior to period</div>
          </Card>

          <Card padding="md" className="border-slate-200">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Period Activity (Debit / Credit)</div>
            <div className="text-base font-mono font-bold text-slate-800 mt-0.5">
              <span className="text-rose-600">Dr {statement.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
              <span className="mx-1 text-slate-300">/</span>
              <span className="text-emerald-600">Cr {statement.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Net: {(statement.totalDebit - statement.totalCredit) >= 0 ? '+' : ''}{(statement.totalDebit - statement.totalCredit).toFixed(2)} {currency}
            </div>
          </Card>

          <Card padding="md" className="bg-[#0e2c4c] text-white border-none shadow-sm">
            <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Closing Balance ({currency})</div>
            <div className="text-xl font-mono font-bold text-[#c9a227] mt-0.5">
              {currency} {statement.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-200 mt-1">
              {statement.closingBalance > 0 ? 'Receivable (Debit Balance)' : statement.closingBalance < 0 ? 'Payable (Credit Balance)' : 'Settled / Zero'}
            </div>
          </Card>
        </div>
      )}

      {/* Statement Table */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        {/* Table Title Bar */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--theme-primary)]" />
              <span>Statement of Account — {selectedAccount?.title}</span>
              <Badge variant="navy">{selectedAccount?.accountCode}</Badge>
            </h4>
            <p className="text-[11px] text-slate-500">
              Showing statement in <strong>{currency}</strong>
              {currency === 'PKR' ? ' — Rate column shows the SAR→PKR exchange rate applied per entry.' : ' — clean SAR amounts.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              Period: <strong className="text-slate-800">{statement?.periodLabel}</strong>
            </span>
          </div>
        </div>

        {/* Detailed Statement Table with EXACT columns */}
        <div className="overflow-x-auto ledger-print-compact">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300 shadow-xs">
              <tr>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Trans.#</th>
                <th className="py-3 px-3">Particulars</th>
                <th className="py-3 px-3">Inv-Ref</th>
                {currency === 'PKR' && <th className="py-3 px-3">Rate</th>}
                <th className="py-3 px-3 text-right">Debit ({currency})</th>
                <th className="py-3 px-3 text-right">Credit ({currency})</th>
                <th className="py-3 px-3 text-right">Balance ({currency})</th>
                {isOwner && <th className="py-3 px-3 text-center print:hidden">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {/* Requirement 3: Opening "Previous Balance" row */}
              <tr className="bg-amber-50/40 font-semibold border-b border-amber-200/60">
                <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                  {startDate || '—'}
                </td>
                <td className="py-2.5 px-3">
                  <Badge variant="warning" size="sm">Opening</Badge>
                </td>
                <td className="py-2.5 px-3 text-slate-400 font-mono">—</td>
                <td className="py-2.5 px-3 font-bold text-slate-800">
                  Previous Balance (B/F)
                </td>
                <td className="py-2.5 px-3 text-slate-400">—</td>
                {currency === 'PKR' && <td className="py-2.5 px-3 text-slate-400 font-mono">—</td>}
                <td className="py-2.5 px-3 text-right text-slate-400 font-mono">0.00</td>
                <td className="py-2.5 px-3 text-right text-slate-400 font-mono">0.00</td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--theme-primary)]">
                  {statement ? statement.previousBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                </td>
                {isOwner && <td className="py-2.5 px-3 print:hidden"></td>}
              </tr>

              {/* Data Rows */}
              {loading ? (
                <tr>
                  <td colSpan={currency === 'PKR' ? 10 : 9} className="py-12 text-center text-slate-500">
                    Loading ledger statement...
                  </td>
                </tr>
              ) : !statement || statement.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    No transactions found for {selectedAccount?.title} in the selected period.
                  </td>
                </tr>
              ) : (
                statement.rows.map((row, idx) => {
                  const e = row.entry;
                  const isVoid = e.isVoid;
                  const debit = currency === 'SAR' ? e.debitSAR : e.debitPKR;
                  const credit = currency === 'SAR' ? e.creditSAR : e.creditPKR;

                  return (
                    <tr
                      key={e.id || idx}
                      style={!isVoid && idx % 2 === 1 ? { backgroundColor: 'color-mix(in srgb, var(--theme-primary) 8%, #ffffff)' } : undefined}
                      className={`transition-colors ${
                        isVoid 
                          ? 'bg-rose-50/40 text-slate-400 line-through opacity-70' 
                          : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {e.date}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge 
                          variant={
                            e.entryType === 'Payment' ? 'success' :
                            e.entryType === 'Invoice' ? 'navy' :
                            e.entryType === 'Item/Service' ? 'info' :
                            e.entryType === 'Voucher Charge' ? 'warning' : 'neutral'
                          }
                          size="sm"
                        >
                          {e.entryType}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--theme-primary)] whitespace-nowrap">
                        {e.transNo || '—'}
                      </td>
                      <td className="py-2.5 px-3 max-w-[340px]">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <div className="font-medium text-slate-900 leading-snug overflow-hidden text-ellipsis shrink min-w-0" title={e.particulars}>
                            {e.particulars}
                          </div>
                          {/* Interactive voucherNo tag - clicking opens voucher modal */}
                          {e.voucherNo && (
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setActiveVoucherNo(e.voucherNo!);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-mono font-bold text-[var(--theme-primary)] bg-amber-50 hover:bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded cursor-pointer transition no-underline shrink-0"
                              title="Click to view voucher"
                            >
                              <FileText className="w-3 h-3 text-[#c9a227]" />
                              <span>{e.voucherNo}</span>
                            </button>
                          )}
                        </div>
                        {/* Void reason note */}
                        {isVoid && e.voidReason && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-0.5 not-line-through">
                            ⚠ {e.voidReason}
                          </div>
                        )}
                        {/* Drive Proof link with security enforcement / Inline Voice Note Player */}
                        {e.driveFileUrl && (
                          <div className="mt-1 flex items-center gap-1.5 not-line-through">
                            {e.proofType === 'voice' ? (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  if (isAgent && e.accountId !== (userProfile?.agentId || 'acc-agt-001')) {
                                    showError('Access Denied: You may only view receipts attached to your own agency entries.');
                                    return;
                                  }
                                  handleToggleInlineAudio(e.driveFileUrl!);
                                }}
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer shadow-2xs transition ${
                                  activeAudioUrl === e.driveFileUrl && isPlayingAudio
                                    ? 'bg-emerald-600 text-white animate-pulse'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                                title="Click to play Urdu WhatsApp voice note settlement proof inline"
                              >
                                <Mic className="w-3 h-3 text-emerald-600" />
                                <span>{activeAudioUrl === e.driveFileUrl && isPlayingAudio ? 'Playing Voice Note' : 'Play WhatsApp Voice Proof'}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  if (isAgent && e.accountId !== (userProfile?.agentId || 'acc-agt-001')) {
                                    showError('Access Denied: You may only view receipts attached to your own agency entries.');
                                    return;
                                  }
                                  setProofModalUrl(e.driveFileUrl || null);
                                  setProofModalPaymentNo(e.transNo || e.entryNo);
                                  setProofModalAccountId(e.accountId);
                                }}
                                className="inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 underline mt-0.5 cursor-pointer"
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                <span>Proof ({e.proofType || 'Receipt'})</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {e.invoiceRef && /^INV-\d+$/.test(e.invoiceRef) ? (
                          <button
                            type="button"
                            onClick={() => navigate(`/visas/invoices?open=${encodeURIComponent(e.invoiceRef as string)}`)}
                            className="text-indigo-600 hover:text-indigo-800 underline font-bold cursor-pointer"
                            title="Open invoice"
                          >
                            {e.invoiceRef}
                          </button>
                        ) : (
                          e.invoiceRef || '—'
                        )}
                      </td>
                      {currency === 'PKR' && (
                        <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {row.formattedRate}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap">
                        {debit > 0 ? (
                          <span className={isVoid ? 'text-slate-400' : 'text-slate-900'}>
                            {debit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap">
                        {credit > 0 ? (
                          <span className={isVoid ? 'text-slate-400' : 'text-emerald-700'}>
                            {credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isVoid ? 'text-slate-400' : 'text-[var(--theme-primary)]'}>
                          {row.runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>
                      {isOwner && (
                        <td className="py-2.5 px-3 text-center print:hidden whitespace-nowrap">
                          {!isVoid && (
                            <button
                              type="button"
                              onClick={() => {
                                setEntryToVoid(e);
                                setVoidReason('');
                                setVoidModalOpen(true);
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition cursor-pointer"
                              title="Void Entry (Owner only)"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Statement Footer: Totals, Total Mofa PAX, Total Hotel PAX */}
            {statement && (
              <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-xs text-slate-900">
                <tr>
                  <td colSpan={6} className="py-3 px-3 uppercase text-[11px] tracking-wider text-slate-700">
                    Period Totals & Passenger Manifest Count
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900">
                    {statement.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-700">
                    {statement.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-[var(--theme-primary)] text-sm">
                    {statement.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {isOwner && <td className="print:hidden"></td>}
                </tr>
                <tr className="bg-slate-200/70 text-slate-700 font-medium text-[11px]">
                  <td colSpan={10} className="py-2.5 px-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-6">
                        <span>
                          Total Mofa PAX: <strong className="font-mono text-[var(--theme-primary)] text-xs font-bold">{statement.totalMofaPax}</strong>
                        </span>
                        <span>
                          Total Hotel PAX: <strong className="font-mono text-[var(--theme-primary)] text-xs font-bold">{statement.totalHotelPax}</strong>
                        </span>
                      </div>
                      <div className="font-bold text-[var(--theme-primary)]">
                        Closing Net Balance: {currency} {statement.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Linked Voucher Quick View Modal */}
      <VoucherQuickModal
        voucherNo={activeVoucherNo}
        isOpen={Boolean(activeVoucherNo)}
        onClose={() => setActiveVoucherNo(null)}
      />

      {/* Void Entry Modal (Owner only with reason) */}
      <Modal
        isOpen={voidModalOpen}
        onClose={() => setVoidModalOpen(false)}
        title={`Void Ledger Entry #${entryToVoid?.entryNo}`}
        subtitle="Audited ledger entries never disappear; this transaction will remain visible struck-through with reason."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setVoidModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="danger" 
              size="sm" 
              onClick={handleConfirmVoid}
              loading={voiding}
            >
              Confirm Void
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2">
          {entryToVoid && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
              <div><strong>Trans #:</strong> {entryToVoid.transNo} ({entryToVoid.entryType})</div>
              <div><strong>Date:</strong> {entryToVoid.date}</div>
              <div><strong>Particulars:</strong> {entryToVoid.particulars}</div>
              <div><strong>Debit / Credit:</strong> Dr {entryToVoid.debitSAR} SAR / Cr {entryToVoid.creditSAR} SAR</div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Audit Void Reason (Required) *
            </label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Duplicate voucher charge reversed, customer refunded, or mistaken billing..."
              rows={3}
              required
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Post Balanced Double-Entry Transaction Modal */}
      <Modal
        isOpen={transModalOpen}
        onClose={() => setTransModalOpen(false)}
        title="Post Balanced Double-Entry Transaction"
        subtitle="Posts equal and offsetting entries simultaneously across both accounts."
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setTransModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              size="sm" 
              onClick={handlePostTransaction}
              loading={savingTrans}
            >
              Post Transaction
            </Button>
          </>
        }
      >
        <form onSubmit={handlePostTransaction} className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date *</label>
              <input
                type="date"
                value={newTransDate}
                onChange={(e) => setNewTransDate(e.target.value)}
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Entry Type *</label>
              <select
                value={newTransType}
                onChange={(e) => setNewTransType(e.target.value as LedgerEntryType)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
              >
                <option value="Journal Voucher">Journal Voucher</option>
                <option value="Invoice">Invoice</option>
                <option value="Item/Service">Item/Service</option>
                <option value="Payment">Payment</option>
                <option value="Voucher Charge">Voucher Charge</option>
                <option value="Refund">Refund</option>
                <option value="Adjustment">Adjustment</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Trans. # *</label>
              <input
                type="text"
                value={newTransNo}
                onChange={(e) => setNewTransNo(e.target.value)}
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
              />
            </div>
          </div>

          {/* Double Entry Pairing */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="font-bold text-[var(--theme-primary)] text-xs">Double-Entry Account Allocation</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-rose-700 mb-1">
                  Debit Account (Dr) *
                </label>
                <select
                  value={newDebitAccountId}
                  onChange={(e) => setNewDebitAccountId(e.target.value)}
                  required
                  className="w-full p-2 bg-white border border-rose-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- Choose Account to Debit --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.accountCode}] {a.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-emerald-700 mb-1">
                  Credit Account (Cr) *
                </label>
                <select
                  value={newCreditAccountId}
                  onChange={(e) => setNewCreditAccountId(e.target.value)}
                  required
                  className="w-full p-2 bg-white border border-emerald-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- Choose Account to Credit --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.accountCode}] {a.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Financial Amounts & Rates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Amount (SAR) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newAmountSAR || ''}
                onChange={(e) => setNewAmountSAR(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-[var(--theme-primary)]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rate (SAR→PKR)</label>
              <input
                type="number"
                step="0.01"
                value={newRate}
                onChange={(e) => setNewRate(parseFloat(e.target.value) || masterRate)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">
                Calculated PKR: <strong>PKR {Math.round(newAmountSAR * newRate).toLocaleString()}</strong>
              </div>
            </div>
          </div>

          {/* Particulars */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Particulars (Description) *</label>
            <input
              type="text"
              value={newParticulars}
              onChange={(e) => setNewParticulars(e.target.value)}
              placeholder="e.g. Al-Rajhi bank transfer for October Umrah group packages"
              required
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
            />
          </div>

          {/* Optional References */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Invoice Ref</label>
              <input
                type="text"
                value={newInvRef}
                onChange={(e) => setNewInvRef(e.target.value)}
                placeholder="e.g. INV-1002"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Voucher No</label>
              <input
                type="text"
                value={newVoucherNo}
                onChange={(e) => setNewVoucherNo(e.target.value)}
                placeholder="e.g. UV-000101"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">MoFA PAX</label>
              <input
                type="number"
                value={newMofaPax || ''}
                onChange={(e) => setNewMofaPax(parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Hotel PAX</label>
              <input
                type="number"
                value={newHotelPax || ''}
                onChange={(e) => setNewHotelPax(parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Drive / Receipt Proof URL</label>
            <input
              type="url"
              value={newDriveUrl}
              onChange={(e) => setNewDriveUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
            />
          </div>
        </form>
      </Modal>

      {/* Item/Service Entry Modal — non-visa product/service sale & purchase */}
      <Modal
        isOpen={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        title="Item / Service Entry"
        subtitle="Record a non-visa product or service: bought from a supplier, sold to a customer."
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setItemModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveItemService}
              loading={savingItem}
            >
              Post Entry
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveItemService} className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date *</label>
              <input
                type="date"
                value={itemDate}
                onChange={(e) => setItemDate(e.target.value)}
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Item / Service Name *</label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Viaa Service, Hotel Room, PIA Ticket"
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
              />
            </div>
          </div>

          {/* Parties */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="font-bold text-[var(--theme-primary)] text-xs">Parties</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-amber-700 mb-1">
                  Supplier — Party From (jis se li)
                </label>
                <select
                  value={itemSupplierId}
                  onChange={(e) => setItemSupplierId(e.target.value)}
                  className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- No supplier --</option>
                  {accounts
                    .filter((a) => ['vendor', 'hotel', 'agent', 'customer'].includes(a.accountType))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.accountCode}] {a.title}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-emerald-700 mb-1">
                  Customer — Party To (jis ko di / charge)
                </label>
                <select
                  value={itemCustomerId}
                  onChange={(e) => setItemCustomerId(e.target.value)}
                  className="w-full p-2 bg-white border border-emerald-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- No customer --</option>
                  {accounts
                    .filter((a) => ['agent', 'customer', 'vendor', 'hotel'].includes(a.accountType))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        [{a.accountCode}] {a.title}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Buying Price (SAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemBuyingSAR || ''}
                onChange={(e) => setItemBuyingSAR(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">Supplier ko dena hai</div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Selling Price (SAR)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemSellingSAR || ''}
                onChange={(e) => setItemSellingSAR(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-[var(--theme-primary)]"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">Customer se lena hai</div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rate (SAR→PKR)</label>
              <input
                type="number"
                step="0.01"
                value={itemRate || ''}
                onChange={(e) => setItemRate(parseFloat(e.target.value) || masterRate)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">
                Margin: <strong className={itemSellingSAR - itemBuyingSAR >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  SAR {(Math.round((itemSellingSAR - itemBuyingSAR) * 100) / 100).toLocaleString()}
                </strong>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description</label>
            <textarea
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              rows={3}
              placeholder="Manually likhein — kis cheez ki entry hai, koi khaas tafseel..."
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
            />
          </div>
        </form>
      </Modal>
      {/* Receipt Proof Viewer Modal */}
      <ReceiptViewerModal
        isOpen={Boolean(proofModalUrl)}
        onClose={() => setProofModalUrl(null)}
        receiptUrl={proofModalUrl}
        paymentNo={proofModalPaymentNo}
        webViewLink={proofModalUrl?.startsWith('https://drive.google.com') ? proofModalUrl : null}
        userRole={role}
        entryAccountId={proofModalAccountId}
        agentOwnAccountId={userProfile?.agentId || 'acc-agt-001'}
      />

      {/* Hidden Audio Player for inline Urdu WhatsApp voice note playback */}
      {activeAudioUrl && (
        <audio
          ref={audioPlayerRef}
          src={activeAudioUrl}
          onEnded={() => setIsPlayingAudio(false)}
          className="hidden"
        />
      )}
    </div>
  );
};
