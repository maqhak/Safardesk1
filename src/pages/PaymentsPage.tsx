import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  CreditCard, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  Camera, 
  UploadCloud, 
  FileText, 
  Building2, 
  Landmark, 
  Wallet, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  Ban, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ExternalLink,
  HelpCircle,
  Sparkles,
  Link as LinkIcon,
  RefreshCw,
  ShieldAlert,
  FolderTree,
  AlertTriangle,
  Check,
  Scale,
  BookOpen
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { usePresetSearch } from '../hooks/useDeepOpen';
import { useCurrentRate } from '../services/exchangeRateService';
import { 
  PaymentDoc, 
  BankDoc, 
  PaymentEntryType, 
  InvoiceRecord,
  DriveIntegrationDoc 
} from '../types/payment';
import { LedgerAccountDoc } from '../types/accounting';
import { 
  fetchPayments, 
  fetchBanks, 
  fetchInvoices, 
  createPayment, 
  voidPayment, 
  getNextPaymentNumber, 
  processReceiptFile,
  retryDriveUploadForPayment,
  approvePaymentReceipt,
  updatePaymentReceipt,
  saveBank,} from '../services/paymentService';
import { fetchLedgerAccounts,
  saveLedgerAccount,} from '../services/accountingService';
import { getDriveIntegration } from '../services/driveService';
import { ReceiptViewerModal } from '../components/accounting/ReceiptViewerModal';
import { Link } from 'react-router-dom';

export const PaymentsPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { profile: company } = useCompany();
  const { success, error: showError, info } = useToast();

  const isOwner = role === 'owner';
  const isAgent = role === 'agent';
  const canCreate = useCan('Accounts', 'create') || isOwner;

  // Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [payments, setPayments] = useState<PaymentDoc[]>([]);
  const [banks, setBanks] = useState<BankDoc[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [driveIntegration, setDriveIntegration] = useState<DriveIntegrationDoc | null>(null);

  // Filter states
  const [search, setSearch] = useState<string>('');

  // Deep link: ?q=<term> presets the search filter (from profile timelines)
  usePresetSearch(setSearch);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [reviewFilter, setReviewFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [bankModalOpen, setBankModalOpen] = useState<boolean>(false);
  const [savingBank, setSavingBank] = useState<boolean>(false);
  const [newBankName, setNewBankName] = useState('');
  const [newBankTitle, setNewBankTitle] = useState('');
  const [newBankNumber, setNewBankNumber] = useState('');
  const [newBankIban, setNewBankIban] = useState('');
  const [newBankBranch, setNewBankBranch] = useState('');
  const [newBankCurrency, setNewBankCurrency] = useState<'SAR' | 'PKR'>('SAR');
  const [newBankLedgerId, setNewBankLedgerId] = useState<string>('auto');
  const [voidModalOpen, setVoidModalOpen] = useState<boolean>(false);
  const [paymentToVoid, setPaymentToVoid] = useState<PaymentDoc | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [voiding, setVoiding] = useState<boolean>(false);

  // Retry state
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState<boolean>(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Receipt Viewer Modal
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const replaceFileRef = React.useRef<HTMLInputElement>(null);
  const [viewerReceiptUrl, setViewerReceiptUrl] = useState<string | null>(null);
  const [viewerFileName, setViewerFileName] = useState<string>('');
  const [viewerFileType, setViewerFileType] = useState<'image' | 'pdf'>('image');
  const [viewerPaymentNo, setViewerPaymentNo] = useState<string>('');
  const [viewerWebViewLink, setViewerWebViewLink] = useState<string | null>(null);
  const [viewerAiStatus, setViewerAiStatus] = useState<'Verified' | 'Needs Review'>('Verified');
  const [viewerAiNotes, setViewerAiNotes] = useState<string | null>(null);
  const [viewerEntryAccountId, setViewerEntryAccountId] = useState<string | null>(null);

  // New Payment Form States
  const [entryType, setEntryType] = useState<PaymentEntryType>('cash-received');
  const [paymentNo, setPaymentNo] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedPayerPayeeId, setSelectedPayerPayeeId] = useState<string>('');
  const [selectedCashTillId, setSelectedCashTillId] = useState<string>('');
  const [selectedBankId, setSelectedBankId] = useState<string>('');
  const [enteredAmount, setEnteredAmount] = useState<number>(0);
  const [amountCurrency, setAmountCurrency] = useState<'SAR' | 'PKR'>('SAR');
  const masterRate = useCurrentRate('SAR-PKR');
  const [exchangeRate, setExchangeRate] = useState<number>(masterRate);

  // Payment amount can be entered in SAR or PKR (toggle); ledger always posts both.
  const amountSAR = amountCurrency === 'SAR' ? enteredAmount : (exchangeRate > 0 ? enteredAmount / exchangeRate : 0);
  const amountPKR = amountCurrency === 'PKR' ? enteredAmount : enteredAmount * exchangeRate;

  useEffect(() => {
    setExchangeRate(masterRate);
  }, [masterRate]);
  const [againstInvoiceNo, setAgainstInvoiceNo] = useState<string>('');
  const [particulars, setParticulars] = useState<string>('');
  
  // Mandatory receipt state
  const [receiptDataUrl, setReceiptDataUrl] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('');
  const [receiptFileType, setReceiptFileType] = useState<'image' | 'pdf'>('image');
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [fileError, setFileError] = useState<string>('');

  const [savingPayment, setSavingPayment] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Load foundational data
  const loadData = async () => {
    setLoading(true);
    try {
      const [pmts, bnkList, accList, invList, dInt] = await Promise.all([
        fetchPayments(),
        fetchBanks(),
        fetchLedgerAccounts(),
        fetchInvoices(),
        getDriveIntegration(),
      ]);
      setPayments(pmts);
      setBanks(bnkList);
      setAccounts(accList);
      setInvoices(invList);
      setDriveIntegration(dInt);
    } catch {
      showError('Failed to load payments data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const cashAccounts = useMemo(() => accounts.filter((a) => a.accountType === 'cash'), [accounts]);
  const bankAccounts = useMemo(() => accounts.filter((a) => a.accountType === 'bank'), [accounts]);
  const payerPayeeAccounts = useMemo(() => {
    return accounts.filter((a) => ['agent', 'vendor', 'hotel', 'customer'].includes(a.accountType));
  }, [accounts]);

  // Open Create Payment Modal
  const handleOpenCreateModal = async () => {
    try {
      const nextNo = await getNextPaymentNumber();
      setPaymentNo(nextNo);
      setDate(new Date().toISOString().split('T')[0]);
      setEntryType('cash-received');
      setSelectedPayerPayeeId(payerPayeeAccounts[0]?.id || '');
      setSelectedCashTillId(cashAccounts[0]?.id || '');
      setSelectedBankId(banks[0]?.id || '');
      setEnteredAmount(0);
      setAmountCurrency('SAR');
      setExchangeRate(masterRate);
      setAgainstInvoiceNo('');
      setParticulars('');
      setReceiptDataUrl('');
      setReceiptFileName('');
      setReceiptFileType('image');
      setFileError('');
      setCreateModalOpen(true);
    } catch {
      showError('Could not initialize payment sequence.');
    }
  };

  const handlePayerPayeeChange = (accId: string) => {
    setSelectedPayerPayeeId(accId);
    // Prefill from the Exchange Rate Master; the agent/staff can still type a
    // manual per-agent rate (locked rule: each agent's rate is manual).
    setExchangeRate(masterRate);
  };

  const handleInvoiceChange = (invNo: string) => {
    setAgainstInvoiceNo(invNo);
    if (!invNo) return;
    const inv = invoices.find((i) => i.invoiceNo === invNo);
    if (inv) {
      if (inv.accountId) {
        setSelectedPayerPayeeId(inv.accountId);
      }
      if (inv.balanceSAR > 0) {
        setEnteredAmount(inv.balanceSAR);
        setAmountCurrency('SAR');
      }
      setParticulars(`Payment against ${inv.module} Invoice ${inv.invoiceNo} — ${inv.description}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError('');
    setIsProcessingFile(true);
    try {
      const processed = await processReceiptFile(file);
      setReceiptDataUrl(processed.dataUrl);
      setReceiptFileName(processed.fileName);
      setReceiptFileType(processed.fileType);
      success(`Receipt attached: ${processed.fileName}`);
    } catch (err: any) {
      setFileError(err.message || 'File upload failed. Ensure size is under 10MB.');
      setReceiptDataUrl('');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleReplaceReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (replacingId) e.target.value = '';
    if (!file || !replacingId) return;
    const pid = replacingId;
    setReplacingId(null);
    try {
      const processed = await processReceiptFile(file);
      if (!window.confirm(`Replace the receipt for this payment with "${processed.fileName}"? The old receipt will be discarded and AI verification will restart.`)) {
        return;
      }
      await updatePaymentReceipt(pid, {
        receiptFile: processed.dataUrl,
        receiptFileName: processed.fileName,
        receiptFileType: processed.fileType,
      }, userProfile?.name || userProfile?.email || 'Staff');
      success('Receipt replaced. AI verification restarted for the new file.');
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to replace receipt.');
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!receiptDataUrl) {
      showError('RECEIPT RULE: A payment CANNOT be saved without an attached receipt photo/PDF.');
      return;
    }

    if (amountSAR <= 0) {
      showError('Payment amount must be greater than zero.');
      return;
    }

    if (!selectedPayerPayeeId) {
      showError('Please select a Payer or Payee account.');
      return;
    }

    let fromAccId = '';
    let toAccId = '';
    let bankAccId: string | null = null;

    if (entryType === 'cash-received') {
      fromAccId = selectedPayerPayeeId;
      toAccId = selectedCashTillId;
    } else if (entryType === 'cash-sent') {
      fromAccId = selectedCashTillId;
      toAccId = selectedPayerPayeeId;
    } else if (entryType === 'bank-received') {
      const bank = banks.find((b) => b.id === selectedBankId);
      if (!bank) {
        showError('Please select a valid bank account.');
        return;
      }
      fromAccId = selectedPayerPayeeId;
      toAccId = bank.linkedLedgerAccountId;
      bankAccId = bank.id;
    } else if (entryType === 'bank-sent') {
      const bank = banks.find((b) => b.id === selectedBankId);
      if (!bank) {
        showError('Please select a valid bank account.');
        return;
      }
      fromAccId = bank.linkedLedgerAccountId;
      toAccId = selectedPayerPayeeId;
      bankAccId = bank.id;
    }

    setSavingPayment(true);
    try {
      const pmt = await createPayment({
        date,
        entryType,
        fromAccountId: fromAccId,
        toAccountId: toAccId,
        bankAccountId: bankAccId,
        amountSAR: Math.round(amountSAR * 100) / 100,
        exchangeRate,
        enteredCurrency: amountCurrency,
        enteredAmount: enteredAmount,
        againstInvoiceNo: againstInvoiceNo || undefined,
        particulars: particulars.trim() || `${entryType.replace('-', ' ').toUpperCase()} recorded`,
        receiptFile: receiptDataUrl,
        receiptFileName,
        receiptFileType,
        createdBy: userProfile?.name || 'Operator',
      });

      if (pmt.needsOwnerReview) {
        info(`Payment ${pmt.paymentNo} saved and flagged for Owner Review: ${pmt.aiNotes}`);
      } else {
        success(`Payment ${pmt.paymentNo} posted with AI verification.`);
      }

      setCreateModalOpen(false);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to save payment.');
    } finally {
      setSavingPayment(false);
    }
  };

  // Add a new Bank (master) with optional auto-created ledger account
  const handleSaveBank = async () => {
    if (!newBankName.trim()) {
      showError('Bank name is required.');
      return;
    }
    if (!newBankTitle.trim()) {
      showError('Account title is required.');
      return;
    }
    setSavingBank(true);
    try {
      const now = new Date().toISOString();
      let ledgerId = newBankLedgerId;
      if (newBankLedgerId === 'auto') {
        const existingCodes = accounts
          .filter((a) => a.accountType === 'bank' && /^BNK-\d+$/.test(a.accountCode))
          .map((a) => parseInt(a.accountCode.split('-')[1], 10));
        const nextNum = String(Math.max(0, ...existingCodes) + 1).padStart(3, '0');
        ledgerId = `acc-bnk-${Date.now()}`;
        await saveLedgerAccount({
          id: ledgerId,
          accountCode: `BNK-${nextNum}`,
          accountType: 'bank',
          title: `${newBankName.trim()} — ${newBankTitle.trim()}`,
          linkedId: '',
          isSystem: false,
          isActive: true,
          openingBalanceSAR: 0,
          openingBalancePKR: 0,
          notes: `Auto-created for bank master ${newBankName.trim()}`,
          createdAt: now,
          createdBy: userProfile?.name || 'Operator',
        } as any);
      }
      const bank: BankDoc = {
        id: `bnk-${Date.now()}`,
        bankName: newBankName.trim(),
        accountTitle: newBankTitle.trim(),
        accountNumber: newBankNumber.trim(),
        iban: newBankIban.trim(),
        branch: newBankBranch.trim(),
        currency: newBankCurrency,
        linkedLedgerAccountId: ledgerId,
        isActive: true,
      };
      await saveBank(bank);
      await loadData();
      setSelectedBankId(bank.id);
      setBankModalOpen(false);
      success(`Bank "${bank.bankName}" added and selected.`);
    } catch (err: any) {
      showError(err.message || 'Failed to save bank.');
    } finally {
      setSavingBank(false);
    }
  };

  // Retry Drive upload for a single payment
  const handleRetryDriveSync = async (pmtId: string) => {
    setRetryingId(pmtId);
    try {
      const updated = await retryDriveUploadForPayment(pmtId);
      success(`Receipt for ${updated.paymentNo} synced to Google Drive.`);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Retry failed. Check Google Drive connection in Settings.');
    } finally {
      setRetryingId(null);
    }
  };

  // Retry all pending Drive uploads
  const handleRetryAllDriveSyncs = async () => {
    const pendingList = payments.filter(p => !p.isVoid && (p.driveSyncStatus === 'pending' || p.driveSyncStatus === 'failed'));
    if (pendingList.length === 0) return;

    setRetryingAll(true);
    let successCount = 0;
    for (const p of pendingList) {
      try {
        await retryDriveUploadForPayment(p.id);
        successCount++;
      } catch {
        // continue
      }
    }
    setRetryingAll(false);
    if (successCount > 0) {
      success(`Successfully synced ${successCount} receipts to Google Drive.`);
      await loadData();
    } else {
      showError('Could not sync pending receipts. Please ensure Google Drive is connected in Settings.');
    }
  };

  // Owner Review Queue: Approve flagged payment
  const handleApproveReceipt = async (pmtId: string) => {
    setApprovingId(pmtId);
    try {
      await approvePaymentReceipt(pmtId, userProfile?.name || 'Owner');
      success('Payment receipt approved and cleared from review queue.');
      await loadData();
    } catch {
      showError('Failed to approve payment receipt.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleConfirmVoid = async () => {
    if (!paymentToVoid) return;
    if (!voidReason.trim()) {
      showError('Please provide an audit void reason.');
      return;
    }

    setVoiding(true);
    try {
      await voidPayment(paymentToVoid.id, voidReason, userProfile?.name || 'Owner');
      success(`Payment #${paymentToVoid.paymentNo} voided and reversed in ledger.`);
      setVoidModalOpen(false);
      setPaymentToVoid(null);
      setVoidReason('');
      await loadData();
    } catch {
      showError('Failed to void payment.');
    } finally {
      setVoiding(false);
    }
  };

  // Owner Review items
  const ownerReviewQueue = useMemo(() => {
    return payments.filter(p => !p.isVoid && p.needsOwnerReview);
  }, [payments]);

  // Drive sync pending items
  const drivePendingQueue = useMemo(() => {
    return payments.filter(p => !p.isVoid && (p.driveSyncStatus === 'pending' || p.driveSyncStatus === 'failed'));
  }, [payments]);

  // Filtered payments list
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (typeFilter !== 'all' && p.entryType !== typeFilter) {
        return false;
      }
      if (accountFilter !== 'all') {
        if (p.fromAccountId !== accountFilter && p.toAccountId !== accountFilter) {
          return false;
        }
      }
      if (reviewFilter === 'needs_review' && !p.needsOwnerReview) {
        return false;
      }
      if (reviewFilter === 'verified' && (p.needsOwnerReview || p.aiStatus !== 'Verified')) {
        return false;
      }
      if (startDate && p.date < startDate) return false;
      if (endDate && p.date > endDate) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const fromAcc = accounts.find((a) => a.id === p.fromAccountId);
        const toAcc = accounts.find((a) => a.id === p.toAccountId);
        const matchNo = p.paymentNo.toLowerCase().includes(q);
        const matchPart = p.particulars.toLowerCase().includes(q);
        const matchInv = (p.againstInvoiceNo || '').toLowerCase().includes(q);
        const matchFrom = (fromAcc?.title || '').toLowerCase().includes(q);
        const matchTo = (toAcc?.title || '').toLowerCase().includes(q);

        return matchNo || matchPart || matchInv || matchFrom || matchTo;
      }

      return true;
    });
  }, [payments, typeFilter, accountFilter, reviewFilter, startDate, endDate, search, accounts]);

  const totalReceivedSAR = useMemo(() => {
    return filteredPayments
      .filter((p) => !p.isVoid && (p.entryType === 'cash-received' || p.entryType === 'bank-received'))
      .reduce((sum, p) => sum + p.amountSAR, 0);
  }, [filteredPayments]);

  const totalSentSAR = useMemo(() => {
    return filteredPayments
      .filter((p) => !p.isVoid && (p.entryType === 'cash-sent' || p.entryType === 'bank-sent'))
      .reduce((sum, p) => sum + p.amountSAR, 0);
  }, [filteredPayments]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Payments — Money In & Out"
        subtitle="Receipt-backed cash & bank vouchers with Google Drive archiving and Gemini AI receipt verification."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'Payments' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/accounts"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-[#0e2c4c]" />
              <span>Per-Account Ledgers</span>
            </Link>

            <Link
              to="/settings"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center gap-1.5"
            >
              <UploadCloud className="w-3.5 h-3.5 text-[#c9a227]" />
              <span>Drive Settings</span>
            </Link>

            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={handleOpenCreateModal}
              >
                Record Payment
              </Button>
            )}
          </div>
        }
      />

      {/* Requirement 4: Owner Review Queue Banner (No dummy receipts) */}
      {isOwner && ownerReviewQueue.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wide">
                  Owner Review Queue ({ownerReviewQueue.length} Flagged Receipts)
                </h4>
                <p className="text-[11px] text-rose-700">
                  Gemini AI detected faint dates, missing bank details, or non-matching receipts. These transactions require Owner approval.
                </p>
              </div>
            </div>
            <Badge variant="danger" size="md">
              Action Required
            </Badge>
          </div>

          <div className="divide-y divide-rose-200/60 bg-white rounded-lg border border-rose-200 overflow-hidden text-xs">
            {ownerReviewQueue.map((item) => (
              <div key={item.id} className="p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900">{item.paymentNo}</span>
                    <span className="text-slate-400">•</span>
                    <span className="font-semibold text-rose-700">SAR {item.amountSAR.toLocaleString()}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">{item.date}</span>
                  </div>
                  <div className="text-[11px] text-slate-700 font-medium">{item.particulars}</div>
                  <div className="text-[10px] text-rose-600 font-mono bg-rose-50 inline-block px-1.5 py-0.5 rounded">
                    ⚠ AI Note: {item.aiNotes}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Eye className="w-3.5 h-3.5" />}
                    onClick={() => {
                      setViewerReceiptUrl(item.receiptFile);
                      setViewerFileName(item.receiptFileName || item.paymentNo);
                      setViewerFileType(item.receiptFileType || 'image');
                      setViewerPaymentNo(item.paymentNo);
                      setViewerWebViewLink(item.webViewLink || null);
                      setViewerAiStatus(item.aiStatus);
                      setViewerAiNotes(item.aiNotes || null);
                      setViewerEntryAccountId(item.fromAccountId);
                    }}
                  >
                    Inspect
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon={<Check className="w-3.5 h-3.5" />}
                    loading={approvingId === item.id}
                    onClick={() => handleApproveReceipt(item.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={<Ban className="w-3.5 h-3.5" />}
                    onClick={() => {
                      setPaymentToVoid(item);
                      setVoidReason('Rejected by Owner during AI verification review: invalid receipt proof.');
                      setVoidModalOpen(true);
                    }}
                  >
                    Void
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requirement 3: Fallback & Background Drive Retry List */}
      {drivePendingQueue.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-white rounded-lg">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950">
                Google Drive Sync Pending ({drivePendingQueue.length} Receipts)
              </h4>
              <p className="text-[11px] text-amber-800">
                Payments are securely recorded in the ledger. Their receipt files are queued for archive to your company's dedicated Drive folder structure (<code className="font-mono">Receipt/Received</code> & <code className="font-mono">Receipt/Sent</code>).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${retryingAll ? 'animate-spin' : ''}`} />}
              loading={retryingAll}
              onClick={handleRetryAllDriveSyncs}
            >
              Retry Sync All
            </Button>
          </div>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="md" className="border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Money In (Received)</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-mono font-bold text-emerald-700 mt-2">
            SAR {totalReceivedSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Cash & Bank inward collections
          </div>
        </Card>

        <Card padding="md" className="border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Money Out (Sent)</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-mono font-bold text-rose-700 mt-2">
            SAR {totalSentSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Vendor, hotel, & refund payouts
          </div>
        </Card>

        <Card padding="md" className="border-slate-200 bg-[#0e2c4c] text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Net Cash Flow</span>
            <div className="p-2 bg-white/10 text-[#c9a227] rounded-lg">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-mono font-bold text-[#c9a227] mt-2">
            SAR {(totalReceivedSAR - totalSentSAR).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-300 mt-0.5">
            Reconciled across {filteredPayments.filter(p => !p.isVoid).length} active transactions
          </div>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card padding="md" className="border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Manual No., particulars, payer..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#0e2c4c]/20 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Entry Types</option>
              <option value="cash-received">Cash Payment — Received</option>
              <option value="cash-sent">Cash Payment — Sent</option>
              <option value="bank-received">Bank Transfer — Received</option>
              <option value="bank-sent">Bank Transfer — Sent</option>
            </select>
          </div>

          <div>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">All Linked Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.accountCode}] {a.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none font-semibold"
            >
              <option value="all">All AI Verification States</option>
              <option value="needs_review">⚠ Needs Owner Review</option>
              <option value="verified">✓ AI Verified Authentic</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-1/2 p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              placeholder="From"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-1/2 p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
              placeholder="To"
            />
          </div>
        </div>

        {(search || typeFilter !== 'all' || accountFilter !== 'all' || reviewFilter !== 'all' || startDate || endDate) && (
          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 text-slate-500">
            <span>Filtering {filteredPayments.length} of {payments.length} total payments</span>
            <button
              onClick={() => {
                setSearch('');
                setTypeFilter('all');
                setAccountFilter('all');
                setReviewFilter('all');
                setStartDate('');
                setEndDate('');
              }}
              className="text-slate-600 hover:text-rose-600 underline cursor-pointer text-[11px]"
            >
              Reset all filters
            </button>
          </div>
        )}
      </Card>

      {/* Payments List Table */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-3 px-3">Manual No.</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">From (Payer / Till)</th>
                <th className="py-3 px-3">To (Payee / Bank)</th>
                <th className="py-3 px-3">Details Box (Particulars)</th>
                <th className="py-3 px-3">Invoice Ref</th>
                <th className="py-3 px-3 text-right">Amount (SAR)</th>
                <th className="py-3 px-3 text-right">Amount (PKR)</th>
                <th className="py-3 px-3 text-center">AI Audit</th>
                <th className="py-3 px-3 text-center">Drive Receipt</th>
                {isOwner && <th className="py-3 px-3 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    Loading payments...
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-slate-500">
                    No payment records match the active filters.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p, idx) => {
                  const fromAcc = accounts.find((a) => a.id === p.fromAccountId);
                  const toAcc = accounts.find((a) => a.id === p.toAccountId);
                  const isVoid = p.isVoid;
                  const isReceived = p.entryType === 'cash-received' || p.entryType === 'bank-received';

                  return (
                    <tr
                      key={p.id || idx}
                      className={`transition-colors ${
                        isVoid 
                          ? 'bg-rose-50/40 text-slate-400 line-through opacity-70' 
                          : p.needsOwnerReview
                          ? 'bg-amber-50/30 hover:bg-amber-50/50'
                          : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/30 hover:bg-slate-50'
                      }`}
                    >
                      {/* Manual No */}
                      <td className="py-2.5 px-3 font-mono font-bold text-[#0e2c4c] whitespace-nowrap">
                        {p.paymentNo}
                      </td>

                      {/* Date */}
                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {p.date}
                      </td>

                      {/* Type */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge
                          variant={isReceived ? 'success' : 'danger'}
                          size="sm"
                        >
                          {p.entryType === 'cash-received' && 'Cash In'}
                          {p.entryType === 'cash-sent' && 'Cash Out'}
                          {p.entryType === 'bank-received' && 'Bank In'}
                          {p.entryType === 'bank-sent' && 'Bank Out'}
                        </Badge>
                      </td>

                      {/* From Account */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">
                          {fromAcc?.title || 'Cash/Bank Account'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {fromAcc?.accountCode}
                        </div>
                      </td>

                      {/* To Account */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">
                          {toAcc?.title || 'Cash/Bank Account'}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {toAcc?.accountCode}
                        </div>
                      </td>

                      {/* Particulars */}
                      <td className="py-2.5 px-3 min-w-[200px]">
                        <div className="font-medium text-slate-900 leading-snug">
                          {p.particulars}
                        </div>
                        {isVoid && p.voidReason && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-0.5 not-line-through">
                            ⚠ Voided: {p.voidReason}
                          </div>
                        )}
                      </td>

                      {/* Invoice Ref */}
                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {p.againstInvoiceNo ? (
                          <span className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-bold border border-slate-200">
                            {p.againstInvoiceNo}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>

                      {/* Amount SAR */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isReceived ? 'text-emerald-700' : 'text-rose-700'}>
                          SAR {p.amountSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Amount PKR */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                        <div>PKR {p.amountPKR.toLocaleString(undefined, { minimumFractionDigits: 0 })}</div>
                        <div className="text-[10px] text-slate-400">@ {p.exchangeRate.toFixed(2)}</div>
                      </td>

                      {/* AI Audit Column */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {p.needsOwnerReview ? (
                          <span 
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300"
                            title={p.aiNotes || 'Review required'}
                          >
                            <ShieldAlert className="w-3 h-3 text-rose-600" />
                            <span>Owner Review</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Verified</span>
                          </span>
                        )}
                      </td>

                      {/* Google Drive Receipt & Viewer */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              // Security check for Agent role
                              if (isAgent && p.fromAccountId !== userProfile?.agentId && p.fromAccountId !== 'acc-agt-001') {
                                showError('Access Denied: You may only view receipts attached to your own agency entries.');
                                return;
                              }
                              setViewerReceiptUrl(p.receiptFile);
                              setViewerFileName(p.receiptFileName || p.paymentNo);
                              setViewerFileType(p.receiptFileType || 'image');
                              setViewerPaymentNo(p.paymentNo);
                              setViewerWebViewLink(p.webViewLink || null);
                              setViewerAiStatus(p.aiStatus);
                              setViewerAiNotes(p.aiNotes || null);
                              setViewerEntryAccountId(p.fromAccountId);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 text-[#0e2c4c] border border-amber-300 rounded font-semibold text-[11px] cursor-pointer transition shadow-2xs"
                            title="Inspect Receipt Document"
                          >
                            <Eye className="w-3 h-3 text-[#c9a227]" />
                            <span>View</span>
                          </button>
                          {!isAgent && !p.isVoid && (
                            <button
                              type="button"
                              onClick={() => {
                                setReplacingId(p.id);
                                setTimeout(() => replaceFileRef.current?.click(), 50);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded font-semibold text-[11px] cursor-pointer transition"
                              title="Replace this receipt with a new file"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Replace</span>
                            </button>
                          )}

                          {/* Drive status badge & Retry action */}
                          {p.driveSyncStatus === 'synced' && p.webViewLink ? (
                            <a
                              href={p.webViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 hover:text-emerald-900 p-1"
                              title="Open in company Google Drive folder"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRetryDriveSync(p.id)}
                              className="text-amber-600 hover:text-amber-800 p-1 rounded hover:bg-amber-50 transition cursor-pointer"
                              title="Drive sync pending — Click to retry upload"
                              disabled={retryingId === p.id}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${retryingId === p.id ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Action (Owner only) */}
                      {isOwner && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {!isVoid && (
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentToVoid(p);
                                setVoidReason('');
                                setVoidModalOpen(true);
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition cursor-pointer"
                              title="Void Payment & Reverse Ledger"
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
          </table>
        </div>
      </Card>

      {/* Hidden input for receipt replacement */}
      <input
        ref={replaceFileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleReplaceReceipt}
      />

      {/* Receipt Viewer Modal with Drive Link & AI Verification */}
      <ReceiptViewerModal
        isOpen={Boolean(viewerReceiptUrl)}
        onClose={() => setViewerReceiptUrl(null)}
        receiptUrl={viewerReceiptUrl}
        fileName={viewerFileName}
        fileType={viewerFileType}
        paymentNo={viewerPaymentNo}
        webViewLink={viewerWebViewLink}
        aiStatus={viewerAiStatus}
        aiNotes={viewerAiNotes}
        userRole={role}
        entryAccountId={viewerEntryAccountId}
        agentOwnAccountId={userProfile?.agentId || 'acc-agt-001'}
      />

      {/* Void Payment Modal (Owner Only) */}
      <Modal
        isOpen={voidModalOpen}
        onClose={() => setVoidModalOpen(false)}
        title={`Void Payment #${paymentToVoid?.paymentNo}`}
        subtitle="Voiding posts an automatic ledger reversal and updates invoice balances while keeping full audit history."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setVoidModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={voiding}
              onClick={handleConfirmVoid}
            >
              Confirm Void & Reversal
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2 text-xs">
          {paymentToVoid && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div><strong>Payment No:</strong> {paymentToVoid.paymentNo} ({paymentToVoid.entryType})</div>
              <div><strong>Date:</strong> {paymentToVoid.date}</div>
              <div><strong>Amount:</strong> SAR {paymentToVoid.amountSAR.toLocaleString()}</div>
              <div><strong>Particulars:</strong> {paymentToVoid.particulars}</div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Audit Void Reason (Required) *
            </label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Specify the reason for voiding this payment (e.g. incorrect bank account, bounced wire, double entry)..."
              rows={3}
              required
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Record Payment Modal with Hard Receipt Validation */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Record Cash or Bank Payment"
        subtitle="Receipt-backed payment with automatic Google Drive archiving and Gemini AI verification."
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-xs">
              {!receiptDataUrl ? (
                <span className="text-rose-600 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Receipt photo/PDF required to enable Save
                </span>
              ) : (
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Receipt attached ({receiptFileName})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitPayment}
                disabled={!receiptDataUrl || isProcessingFile}
                loading={savingPayment}
              >
                Post Payment & Verify
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSubmitPayment} className="space-y-4 py-1 text-xs">
          {/* Header Reference: Manual No. shown large & readable */}
          <div className="flex items-center justify-between p-3.5 bg-[#0e2c4c] text-white rounded-xl">
            <div>
              <span className="text-[10px] text-slate-300 uppercase font-bold tracking-wider block">
                Manual / Voucher Sequence No.
              </span>
              <span className="text-xl font-mono font-black text-[#c9a227] tracking-tight">
                {paymentNo || 'PMT-00105'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-300 uppercase font-bold block">Transaction Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="bg-white/10 text-white border border-white/20 rounded px-2 py-1 text-xs font-mono"
              />
            </div>
          </div>

          {/* 1. Entry Types: Selected first on the form */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Select Entry Type First *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setEntryType('cash-received')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between ${
                  entryType === 'cash-received'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Wallet className="w-4 h-4 text-emerald-600" />
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Dr Cash</span>
                </div>
                <div className="font-bold text-slate-900 mt-2">Cash Payment — Received</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Money in from agent / client</div>
              </button>

              <button
                type="button"
                onClick={() => setEntryType('cash-sent')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between ${
                  entryType === 'cash-sent'
                    ? 'border-rose-600 bg-rose-50/60 ring-2 ring-rose-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Wallet className="w-4 h-4 text-rose-600" />
                  <span className="text-[10px] font-bold text-rose-700 uppercase">Cr Cash</span>
                </div>
                <div className="font-bold text-slate-900 mt-2">Cash Payment — Sent</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Money out to hotel / vendor</div>
              </button>

              <button
                type="button"
                onClick={() => setEntryType('bank-received')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between ${
                  entryType === 'bank-received'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Landmark className="w-4 h-4 text-emerald-600" />
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Dr Bank</span>
                </div>
                <div className="font-bold text-slate-900 mt-2">Bank Transfer — Received</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Inward wire from agent</div>
              </button>

              <button
                type="button"
                onClick={() => setEntryType('bank-sent')}
                className={`p-2.5 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between ${
                  entryType === 'bank-sent'
                    ? 'border-rose-600 bg-rose-50/60 ring-2 ring-rose-500/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Landmark className="w-4 h-4 text-rose-600" />
                  <span className="text-[10px] font-bold text-rose-700 uppercase">Cr Bank</span>
                </div>
                <div className="font-bold text-slate-900 mt-2">Bank Transfer — Sent</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Outward wire to vendor/Shirka</div>
              </button>
            </div>
          </div>

          {/* Account Selectors */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  {entryType.includes('received') ? 'Payer Account (Agent / Customer) *' : 'Payee Account (Vendor / Hotel / Agent) *'}
                </label>
                <select
                  value={selectedPayerPayeeId}
                  onChange={(e) => handlePayerPayeeChange(e.target.value)}
                  required
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- Choose Account --</option>
                  {payerPayeeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.accountCode}] {a.title} ({a.accountType.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              {entryType.startsWith('cash') ? (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Cash Till / Branch Drawer *
                  </label>
                  <select
                    value={selectedCashTillId}
                    onChange={(e) => setSelectedCashTillId(e.target.value)}
                    required
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                  >
                    {cashAccounts.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.accountCode}] {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>Bank Account (Master) *</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNewBankName('');
                        setNewBankTitle('');
                        setNewBankNumber('');
                        setNewBankIban('');
                        setNewBankBranch('');
                        setNewBankCurrency('SAR');
                        setNewBankLedgerId('auto');
                        setBankModalOpen(true);
                      }}
                      className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                    >
                      + Add Bank
                    </button>
                  </label>
                  <select
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    required
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                  >
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bankName} — {b.accountTitle} ({b.accountNumber} • {b.currency})
                      </option>
                    ))}
                  </select>
                  {selectedBankId && (
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">
                      IBAN: {banks.find(b => b.id === selectedBankId)?.iban}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Amounts & Currency Rates — amount can be typed in SAR or PKR */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
                <span>Amount *</span>
                <span className="inline-flex rounded-full border border-slate-300 overflow-hidden">
                  {(['SAR', 'PKR'] as const).map((cur) => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => setAmountCurrency(cur)}
                      className={`px-2.5 py-0.5 text-[10px] font-bold transition ${
                        amountCurrency === cur ? 'bg-[#0e2c4c] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </span>
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={enteredAmount || ''}
                onChange={(e) => setEnteredAmount(parseFloat(e.target.value) || 0)}
                placeholder={`0.00 (${amountCurrency})`}
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-[#0e2c4c]"
              />
              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                = SAR {amountSAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {' '}• PKR {amountPKR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Exchange Rate (SAR→PKR)</label>
              <input
                type="number"
                step="0.01"
                value={exchangeRate || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setExchangeRate(v === '' ? 0 : parseFloat(v) || 0);
                }}
                placeholder={masterRate.toFixed(2)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Computed Totals</label>
              <div className="p-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-emerald-700 space-y-0.5">
                <div>SAR {amountSAR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div>PKR {amountPKR.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
              <span>Against Invoice No (Optional — Visa invoices are paid HERE)</span>
              <span className="text-[10px] text-slate-400">Updates invoice balance automatically</span>
            </label>
            <select
              value={againstInvoiceNo}
              onChange={(e) => handleInvoiceChange(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
            >
              <option value="">-- No specific invoice (Direct account credit/debit) --</option>
              {invoices.map((inv) => (
                <option key={inv.invoiceNo} value={inv.invoiceNo}>
                  {inv.invoiceNo} [{inv.module}] — {inv.accountTitle} | Balance: SAR {inv.balanceSAR.toLocaleString()} ({inv.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span>Details Box (Particulars) *</span>
              <span className="text-[10px] text-slate-400 font-normal">Appears verbatim in the ledger statement</span>
            </label>
            <textarea
              value={particulars}
              onChange={(e) => setParticulars(e.target.value)}
              placeholder="e.g. Al-Rajhi inward wire received from Al-Barakah for Umrah visa batch..."
              rows={2}
              required
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#0e2c4c]/20 focus:outline-none"
            />
          </div>

          {/* Mandatory Receipt Upload & AI Verification Notice */}
          <div className="p-3.5 border-2 border-dashed border-amber-300 bg-amber-50/50 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-[#c9a227]" />
                <span>Mandatory Receipt Photo / PDF (RECEIPT RULE & AI VERIFICATION) *</span>
              </label>
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Hard Requirement
              </span>
            </div>

            <p className="text-[11px] text-slate-600 leading-snug">
              Every receipt is archived to the buyer company's Google Drive (<code className="font-mono">Receipt/Received</code> or <code className="font-mono">Receipt/Sent</code>) and audited by Gemini AI for readability, document authenticity, and date matching. Max size: 10MB.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<UploadCloud className="w-3.5 h-3.5" />}
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingFile}
              >
                Upload Photo / PDF
              </Button>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<Camera className="w-3.5 h-3.5" />}
                onClick={() => cameraInputRef.current?.click()}
                disabled={isProcessingFile}
              >
                Snap with Camera
              </Button>

              {receiptDataUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setViewerReceiptUrl(receiptDataUrl);
                    setViewerFileName(receiptFileName);
                    setViewerFileType(receiptFileType);
                    setViewerPaymentNo(paymentNo);
                    setViewerWebViewLink(null);
                    setViewerAiStatus('Verified');
                    setViewerAiNotes(null);
                    setViewerEntryAccountId(selectedPayerPayeeId);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-emerald-300 text-emerald-700 font-bold rounded-lg text-xs cursor-pointer shadow-2xs ml-auto"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview ({receiptFileName})</span>
                </button>
              )}
            </div>

            {fileError && (
              <div className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{fileError}</span>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Add Bank (Master) Modal */}
      <Modal
        isOpen={bankModalOpen}
        onClose={() => setBankModalOpen(false)}
        title="Add Bank Account"
        subtitle="Register your own bank — it becomes selectable in every Bank Transfer payment."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setBankModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={savingBank} onClick={handleSaveBank}>
              Save Bank
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Bank Name *</label>
              <input
                type="text"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                placeholder="e.g. Al-Rajhi Bank"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Account Title *</label>
              <input
                type="text"
                value={newBankTitle}
                onChange={(e) => setNewBankTitle(e.target.value)}
                placeholder="e.g. SafarDesk Corporate Treasury"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Account Number</label>
              <input
                type="text"
                value={newBankNumber}
                onChange={(e) => setNewBankNumber(e.target.value)}
                placeholder="e.g. 482001928374"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">IBAN</label>
              <input
                type="text"
                value={newBankIban}
                onChange={(e) => setNewBankIban(e.target.value)}
                placeholder="e.g. SA4480000482001928374"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Branch</label>
              <input
                type="text"
                value={newBankBranch}
                onChange={(e) => setNewBankBranch(e.target.value)}
                placeholder="e.g. Main Branch, Karachi"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Currency</label>
              <div className="inline-flex rounded-full border border-slate-300 overflow-hidden">
                {(['SAR', 'PKR'] as const).map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setNewBankCurrency(cur)}
                    className={`px-4 py-1.5 text-[11px] font-bold transition ${
                      newBankCurrency === cur ? 'bg-[#0e2c4c] text-white' : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {cur}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Linked Ledger Account</label>
            <select
              value={newBankLedgerId}
              onChange={(e) => setNewBankLedgerId(e.target.value)}
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
            >
              <option value="auto">✨ Create new ledger account automatically (BNK-xxx)</option>
              {accounts
                .filter((a) => a.accountType === 'bank')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.accountCode}] {a.title}
                  </option>
                ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1">
              Every bank posts to its own ledger account — pick an existing one or let the system create it.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
