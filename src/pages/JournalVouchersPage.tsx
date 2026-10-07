import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  Mic, 
  Play, 
  Pause, 
  Volume2, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  Ban, 
  History, 
  ExternalLink, 
  Trash2, 
  Sparkles, 
  ArrowLeftRight, 
  Calendar, 
  Info,
  Scale,
  RefreshCw,
  Eye,
  BookOpen,
  CreditCard
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
import { useDeepOpen } from '../hooks/useDeepOpen';
import { useCurrentRate } from '../services/exchangeRateService';
import { 
  JournalVoucherDoc, 
  JournalVoucherLine, 
  JournalVoucherTag,
  AiVoiceCheckResult 
} from '../types/journalVoucher';
import { LedgerAccountDoc, LedgerEntryDoc } from '../types/accounting';
import { 
  fetchJournalVouchers, 
  createJournalVoucher, 
  voidJournalVoucher, 
  getNextJVNumber 
} from '../services/journalVoucherService';
import { fetchLedgerAccounts, fetchLedgerEntries } from '../services/accountingService';
import { Link } from 'react-router-dom';

export const JournalVouchersPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { profile: company } = useCompany();
  const { success, error: showError, info } = useToast();

  const isOwner = role === 'owner';
  const canCreate = useCan('Accounts', 'create') || isOwner;

  // Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [journalVouchers, setJournalVouchers] = useState<JournalVoucherDoc[]>([]);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [entries, setEntries] = useState<LedgerEntryDoc[]>([]);

  // Filter states
  const [search, setSearch] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [auditModalOpen, setAuditModalOpen] = useState<boolean>(false);
  const [selectedJvForAudit, setSelectedJvForAudit] = useState<JournalVoucherDoc | null>(null);

  // Deep link: ?open=<jvNo> opens the exact journal voucher record
  useDeepOpen(journalVouchers, (j, ref) => j.jvNo === ref, (j) => {
    setSelectedJvForAudit(j);
    setAuditModalOpen(true);
  });

  // Void modal
  const [voidModalOpen, setVoidModalOpen] = useState<boolean>(false);
  const [jvToVoid, setJvToVoid] = useState<JournalVoucherDoc | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [voiding, setVoiding] = useState<boolean>(false);

  // Audio player state
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // New JV Form States
  const [jvNo, setJvNo] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [tag, setTag] = useState<JournalVoucherTag>('Adjustment');
  const masterRate = useCurrentRate('SAR-PKR');
  const [exchangeRate, setExchangeRate] = useState<number>(masterRate);
  const [entryCurrency, setEntryCurrency] = useState<'SAR' | 'PKR'>('SAR');

  useEffect(() => {
    setExchangeRate(masterRate);
  }, [masterRate]);
  const [detailsBox, setDetailsBox] = useState<string>('');
  const [lines, setLines] = useState<JournalVoucherLine[]>([
    { id: '1', accountId: '', accountTitle: '', accountCode: '', debitSAR: 0, creditSAR: 0 },
    { id: '2', accountId: '', accountTitle: '', accountCode: '', debitSAR: 0, creditSAR: 0 },
  ]);

  // Attachment states
  const [attachmentDataUrl, setAttachmentDataUrl] = useState<string>('');
  const [attachmentFileName, setAttachmentFileName] = useState<string>('');
  const [attachmentFileType, setAttachmentFileType] = useState<'image' | 'pdf' | 'audio'>('image');
  const [attachmentMimeType, setAttachmentMimeType] = useState<string>('');
  const [fileError, setFileError] = useState<string>('');
  const [savingJv, setSavingJv] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load foundational data
  const loadData = async () => {
    setLoading(true);
    try {
      const [jvs, accs, ents] = await Promise.all([
        fetchJournalVouchers(),
        fetchLedgerAccounts(),
        fetchLedgerEntries(),
      ]);
      setJournalVouchers(jvs);
      setAccounts(accs);
      setEntries(ents);
    } catch {
      showError('Failed to load journal vouchers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Open Create Modal
  const handleOpenCreateModal = async () => {
    try {
      const nextNo = await getNextJVNumber();
      setJvNo(nextNo);
      setDate(new Date().toISOString().split('T')[0]);
      setTag('Adjustment');
      setExchangeRate(masterRate);
      setDetailsBox('');
      setLines([
        { id: '1', accountId: accounts[0]?.id || '', accountTitle: accounts[0]?.title || '', accountCode: accounts[0]?.accountCode || '', debitSAR: 0, creditSAR: 0 },
        { id: '2', accountId: accounts[1]?.id || '', accountTitle: accounts[1]?.title || '', accountCode: accounts[1]?.accountCode || '', debitSAR: 0, creditSAR: 0 },
      ]);
      setAttachmentDataUrl('');
      setAttachmentFileName('');
      setAttachmentFileType('image');
      setAttachmentMimeType('');
      setFileError('');
      setCreateModalOpen(true);
    } catch {
      showError('Could not initialize JV sequence.');
    }
  };

  // Add line to dynamic grid
  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        id: String(Date.now() + Math.random()),
        accountId: '',
        accountTitle: '',
        accountCode: '',
        debitSAR: 0,
        creditSAR: 0,
      },
    ]);
  };

  // Remove line from dynamic grid
  const handleRemoveLine = (id: string) => {
    if (lines.length <= 2) {
      showError('A Journal Voucher requires at least two account lines.');
      return;
    }
    setLines(lines.filter((l) => l.id !== id));
  };

  // Update line account
  const handleLineAccountChange = (lineId: string, accId: string) => {
    const acc = accounts.find((a) => a.id === accId);
    setLines(
      lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              accountId: accId,
              accountTitle: acc?.title || '',
              accountCode: acc?.accountCode || '',
              accountType: acc?.accountType,
            }
          : l
      )
    );
  };

  // Update line amounts (rule: debit and credit cannot both be > 0)
  const handleLineAmountChange = (lineId: string, field: 'debitSAR' | 'creditSAR', val: number) => {
    setLines(
      lines.map((l) => {
        if (l.id !== lineId) return l;
        if (field === 'debitSAR') {
          return {
            ...l,
            debitSAR: val,
            creditSAR: val > 0 ? 0 : l.creditSAR, // A line cannot have both debit and credit > 0
          };
        } else {
          return {
            ...l,
            creditSAR: val,
            debitSAR: val > 0 ? 0 : l.debitSAR, // A line cannot have both debit and credit > 0
          };
        }
      })
    );
  };

  // Live balance calculations
  const totalDebit = useMemo(() => lines.reduce((sum, l) => sum + (l.debitSAR || 0), 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((sum, l) => sum + (l.creditSAR || 0), 0), [lines]);
  const difference = useMemo(() => Math.abs(totalDebit - totalCredit), [totalDebit, totalCredit]);
  const isBalanced = difference < 0.01 && totalDebit > 0;

  // File / Voice note upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileError('');
    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      setFileError('File exceeds 15MB limit.');
      return;
    }

    const isAudio = file.type.startsWith('audio/') || 
      file.name.endsWith('.opus') || 
      file.name.endsWith('.mp3') || 
      file.name.endsWith('.m4a') || 
      file.name.endsWith('.ogg');
    
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');

    const reader = new FileReader();
    reader.onload = (evt) => {
      setAttachmentDataUrl(evt.target?.result as string);
      setAttachmentFileName(file.name);
      setAttachmentFileType(isAudio ? 'audio' : isPdf ? 'pdf' : 'image');
      setAttachmentMimeType(file.type || (isAudio ? 'audio/ogg' : 'image/jpeg'));
      success(`Attached ${isAudio ? 'WhatsApp voice note' : 'proof file'}: ${file.name}`);
    };
    reader.onerror = () => {
      setFileError('Failed to read file.');
    };
    reader.readAsDataURL(file);
  };

  // Submit Journal Voucher
  const handleSubmitJV = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isBalanced) {
      showError(`LIVE BALANCE ERROR: Total Debit must equal Total Credit. Difference is ${entryCurrency} ${difference.toFixed(2)}.`);
      return;
    }

    // Direct Settlement mandatory attachment check
    if (tag === 'Direct Settlement' && !attachmentDataUrl) {
      showError('DIRECT SETTLEMENT RULE: An attachment (image/PDF receipt OR WhatsApp voice note) is mandatory.');
      return;
    }

    // Check account selections
    for (const l of lines) {
      if (!l.accountId) {
        showError('Please ensure all lines have a selected ledger account.');
        return;
      }
    }

    setSavingJv(true);
    try {
      // Convert entered amounts to SAR for posting (ledger is SAR-based)
      const postLines = entryCurrency === 'PKR' && exchangeRate > 0
        ? lines.map((l) => ({
            ...l,
            debitSAR: Math.round(((l.debitSAR || 0) / exchangeRate) * 100) / 100,
            creditSAR: Math.round(((l.creditSAR || 0) / exchangeRate) * 100) / 100,
          }))
        : lines;
      const created = await createJournalVoucher({
        date,
        tag,
        lines: postLines,
        exchangeRate,
        detailsBox: detailsBox.trim() || `${tag} voucher posted`,
        attachment: attachmentDataUrl
          ? {
              fileDataUrl: attachmentDataUrl,
              fileName: attachmentFileName,
              fileType: attachmentFileType,
              mimeType: attachmentMimeType,
            }
          : null,
        createdBy: userProfile?.name || 'Operator',
      });

      if (created.needsOwnerReview) {
        info(`Journal Voucher ${created.jvNo} posted and flagged for Owner Review: ${created.aiVoiceCheck?.notes || 'Check required'}`);
      } else {
        success(`Journal Voucher ${created.jvNo} posted to general ledger.`);
      }

      setCreateModalOpen(false);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to post Journal Voucher.');
    } finally {
      setSavingJv(false);
    }
  };

  // Void JV (Owner only)
  const handleConfirmVoid = async () => {
    if (!jvToVoid) return;
    if (!voidReason.trim()) {
      showError('Please provide an audit reason for voiding.');
      return;
    }

    setVoiding(true);
    try {
      await voidJournalVoucher(jvToVoid.id, voidReason, userProfile?.name || 'Owner');
      success(`Journal Voucher #${jvToVoid.jvNo} voided and reversed in ledger.`);
      setVoidModalOpen(false);
      setJvToVoid(null);
      setVoidReason('');
      await loadData();
    } catch {
      showError('Failed to void Journal Voucher.');
    } finally {
      setVoiding(false);
    }
  };

  // Play audio voice note inline
  const handleToggleAudio = (url: string) => {
    if (activeAudioUrl === url && isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      setActiveAudioUrl(url);
      setIsPlaying(true);
      setTimeout(() => {
        audioRef.current?.play();
      }, 50);
    }
  };

  // Filtered Journal Vouchers
  const filteredJVs = useMemo(() => {
    return journalVouchers.filter((jv) => {
      if (tagFilter !== 'all' && jv.tag !== tagFilter) {
        return false;
      }
      if (startDate && jv.date < startDate) return false;
      if (endDate && jv.date > endDate) return false;

      if (accountFilter !== 'all') {
        const hasAccount = jv.lines.some((l) => l.accountId === accountFilter);
        if (!hasAccount) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchNo = jv.jvNo.toLowerCase().includes(q);
        const matchDetails = (jv.detailsBox || '').toLowerCase().includes(q);
        const matchLines = jv.lines.some(
          (l) => l.accountTitle.toLowerCase().includes(q) || l.accountCode.toLowerCase().includes(q)
        );
        return matchNo || matchDetails || matchLines;
      }

      return true;
    });
  }, [journalVouchers, tagFilter, accountFilter, startDate, endDate, search]);

  return (
    <div className="space-y-6">
      {/* Hidden audio element for inline voice note playback */}
      {activeAudioUrl && (
        <audio
          ref={audioRef}
          src={activeAudioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {/* Top Header */}
      <PageHeader
        title="Journal Vouchers — Adjustments, Netting & Direct Settlements"
        subtitle="Post balanced multi-line general journal entries, bilateral account nettings, and Urdu WhatsApp voice-note verified direct settlements."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'Journal Vouchers' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/accounts/balances"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center gap-1.5"
            >
              <Scale className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
              <span>Balances</span>
            </Link>

            <Link
              to="/accounts/day-book"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
              <span>Day Book</span>
            </Link>

            <Link
              to="/accounts/payments"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
              <span>Payments</span>
            </Link>

            <Link
              to="/accounts"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--theme-primary)]" />
              <span>General Ledger</span>
            </Link>

            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={handleOpenCreateModal}
              >
                Record Journal Voucher
              </Button>
            )}
          </div>
        }
      />


      {/* Filters Bar */}
      <Card padding="md" className="border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Keyword Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search JV No., accounts, details..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#0e2c4c]/20 focus:outline-none"
            />
          </div>

          {/* Tag Filter */}
          <div>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All JV Tags</option>
              <option value="Adjustment">Adjustment (No receipt required)</option>
              <option value="Netting">Netting (Bilateral balance guard)</option>
              <option value="Direct Settlement">Direct Settlement (Mandatory voice/doc proof)</option>
            </select>
          </div>

          {/* Account Filter */}
          <div>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">All Affected Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.accountCode}] {a.title}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
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

        {(search || tagFilter !== 'all' || accountFilter !== 'all' || startDate || endDate) && (
          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 text-slate-500">
            <span>Filtering {filteredJVs.length} of {journalVouchers.length} total Journal Vouchers</span>
            <button
              onClick={() => {
                setSearch('');
                setTagFilter('all');
                setAccountFilter('all');
                setStartDate('');
                setEndDate('');
              }}
              className="text-slate-600 hover:text-rose-600 underline cursor-pointer text-[11px]"
            >
              Reset filters
            </button>
          </div>
        )}
      </Card>

      {/* Journal Vouchers Table */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-3 px-3">JV No.</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Tag / Classification</th>
                <th className="py-3 px-3">Debited Accounts</th>
                <th className="py-3 px-3">Credited Accounts</th>
                <th className="py-3 px-3">Details Box (Verbatim Particulars)</th>
                <th className="py-3 px-3 text-right">Amount (SAR)</th>
                <th className="py-3 px-3 text-right">Amount (PKR)</th>
                <th className="py-3 px-3 text-center">Proof / Voice Note</th>
                <th className="py-3 px-3 text-center">AI Audit</th>
                <th className="py-3 px-3 text-center">Audit Trail</th>
                {isOwner && <th className="py-3 px-3 text-center">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    Loading journal vouchers...
                  </td>
                </tr>
              ) : filteredJVs.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-slate-500">
                    No Journal Vouchers match the active filters.
                  </td>
                </tr>
              ) : (
                filteredJVs.map((jv, idx) => {
                  const isVoid = jv.isVoid;
                  const debitLines = jv.lines.filter((l) => l.debitSAR > 0);
                  const creditLines = jv.lines.filter((l) => l.creditSAR > 0);
                  const amountPKR = Math.round(jv.totalDebitSAR * jv.exchangeRate);

                  return (
                    <tr
                      key={jv.id || idx}
                      className={`transition-colors ${
                        isVoid 
                          ? 'bg-rose-50/40 text-slate-400 line-through opacity-70' 
                          : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/30 hover:bg-slate-50'
                      }`}
                    >
                      {/* JV No */}
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--theme-primary)] whitespace-nowrap">
                        {jv.jvNo}
                      </td>

                      {/* Date */}
                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {jv.date}
                      </td>

                      {/* Tag */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge
                          variant={
                            jv.tag === 'Adjustment' ? 'neutral' :
                            jv.tag === 'Netting' ? 'navy' : 'gold'
                          }
                          size="sm"
                        >
                          {jv.tag}
                        </Badge>
                      </td>

                      {/* Debited Accounts */}
                      <td className="py-2.5 px-3 min-w-[160px]">
                        {debitLines.map((l, i) => (
                          <div key={i} className="text-[11px] font-semibold text-slate-900 leading-tight">
                            <span className="font-mono text-slate-500 mr-1">[{l.accountCode}]</span>
                            <span>{l.accountTitle}</span>
                            <span className="text-slate-500 ml-1 font-mono">(SAR {l.debitSAR.toLocaleString()})</span>
                          </div>
                        ))}
                      </td>

                      {/* Credited Accounts */}
                      <td className="py-2.5 px-3 min-w-[160px]">
                        {creditLines.map((l, i) => (
                          <div key={i} className="text-[11px] font-semibold text-slate-900 leading-tight">
                            <span className="font-mono text-slate-500 mr-1">[{l.accountCode}]</span>
                            <span>{l.accountTitle}</span>
                            <span className="text-slate-500 ml-1 font-mono">(SAR {l.creditSAR.toLocaleString()})</span>
                          </div>
                        ))}
                      </td>

                      {/* Details Box */}
                      <td className="py-2.5 px-3 min-w-[220px]">
                        <div className="font-medium text-slate-900 leading-snug">
                          {jv.detailsBox}
                        </div>
                        {isVoid && jv.voidReason && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-0.5 not-line-through">
                            ⚠ Voided: {jv.voidReason}
                          </div>
                        )}
                      </td>

                      {/* Amount SAR */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        SAR {jv.totalDebitSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      {/* Amount PKR */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                        <div>PKR {amountPKR.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-400">@ {jv.exchangeRate.toFixed(2)}</div>
                      </td>

                      {/* Proof / WhatsApp Voice Note */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {jv.attachment ? (
                          jv.attachment.fileType === 'audio' ? (
                            <button
                              type="button"
                              onClick={() => handleToggleAudio(jv.attachment!.fileUrl)}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold transition shadow-2xs ${
                                activeAudioUrl === jv.attachment.fileUrl && isPlaying
                                  ? 'bg-emerald-600 text-white animate-pulse'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                              }`}
                              title="Play WhatsApp Urdu voice note proof"
                            >
                              <Mic className="w-3 h-3 text-emerald-600" />
                              <span>{activeAudioUrl === jv.attachment.fileUrl && isPlaying ? 'Playing' : 'Listen'}</span>
                            </button>
                          ) : (
                            <a
                              href={jv.attachment.webViewLink || jv.attachment.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Proof</span>
                            </a>
                          )
                        ) : (
                          <span className="text-slate-300 text-[10px]">No attachment</span>
                        )}
                      </td>

                      {/* AI Audit Status */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {jv.aiVoiceCheck ? (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              jv.aiVoiceCheck.status === 'Verified'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}
                            title={jv.aiVoiceCheck.notes}
                          >
                            <Sparkles className="w-3 h-3 text-[#c9a227]" />
                            <span>{jv.aiVoiceCheck.status}</span>
                          </span>
                        ) : jv.tag === 'Adjustment' ? (
                          <span className="text-[10px] text-slate-400 font-medium">Standard</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">—</span>
                        )}
                      </td>

                      {/* Audit Trail */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedJvForAudit(jv);
                            setAuditModalOpen(true);
                          }}
                          className="p-1 rounded text-slate-500 hover:text-[var(--theme-primary)] hover:bg-slate-100 cursor-pointer transition"
                          title="View Full Audit History"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      </td>

                      {/* Action (Owner Void) */}
                      {isOwner && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {!isVoid && (
                            <button
                              type="button"
                              onClick={() => {
                                setJvToVoid(jv);
                                setVoidReason('');
                                setVoidModalOpen(true);
                              }}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition cursor-pointer"
                              title="Void Journal Voucher & Reverse Ledger Entries"
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

      {/* Audit Trail Modal */}
      <Modal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        title={`Audit Trail — Journal Voucher #${selectedJvForAudit?.jvNo}`}
        subtitle="Complete chronological history of creation, AI inspections, edits, and void actions"
      >
        <div className="space-y-4 py-2 text-xs">
          {selectedJvForAudit?.aiVoiceCheck && (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1">
              <span className="font-bold text-amber-950 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#c9a227]" />
                <span>Urdu WhatsApp Voice Note AI Audit Log:</span>
              </span>
              <p className="text-slate-700 italic font-serif">
                "{selectedJvForAudit.aiVoiceCheck.transcription}"
              </p>
              <div className="text-[11px] text-slate-600 pt-1">
                Extracted Amount: <strong>SAR {selectedJvForAudit.aiVoiceCheck.extractedAmount?.toLocaleString() || 'N/A'}</strong> • 
                Extracted Payer: <strong>{selectedJvForAudit.aiVoiceCheck.extractedPayer || 'N/A'}</strong> • 
                Verification Note: <strong>{selectedJvForAudit.aiVoiceCheck.notes}</strong>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] block">
              Event Log
            </span>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden bg-white">
              {selectedJvForAudit?.auditTrail.map((log, idx) => (
                <div key={idx} className="p-3 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 capitalize">Action: {log.action}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">{log.notes || 'Routine transaction state'}</div>
                  </div>
                  <div className="text-right text-[11px] text-slate-500 shrink-0 font-mono">
                    <div>{log.by}</div>
                    <div>{new Date(log.at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* Void Modal (Owner Only) */}
      <Modal
        isOpen={voidModalOpen}
        onClose={() => setVoidModalOpen(false)}
        title={`Void Journal Voucher #${jvToVoid?.jvNo}`}
        subtitle="Voiding posts an automatic reversal to all affected ledger entries while maintaining audit history."
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
              Confirm Void & Reverse
            </Button>
          </>
        }
      >
        <div className="space-y-4 py-2 text-xs">
          {jvToVoid && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <div><strong>JV No:</strong> {jvToVoid.jvNo} ({jvToVoid.tag})</div>
              <div><strong>Date:</strong> {jvToVoid.date}</div>
              <div><strong>Amount:</strong> SAR {jvToVoid.totalDebitSAR.toLocaleString()}</div>
              <div><strong>Details:</strong> {jvToVoid.detailsBox}</div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Audit Void Reason (Required) *
            </label>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Specify the reason for voiding this Journal Voucher..."
              rows={3}
              required
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
            />
          </div>
        </div>
      </Modal>

      {/* Record Journal Voucher Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Record Journal Voucher (JV)"
        subtitle="Post balanced multi-line adjustments, netting, or voice-note verified direct settlements."
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <div className="text-xs">
              {!isBalanced ? (
                <span className="text-rose-600 font-bold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Difference: SAR {difference.toFixed(2)} (Must be 0.00 to save)
                </span>
              ) : (
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Balanced (Total: SAR {totalDebit.toLocaleString()})
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
                onClick={handleSubmitJV}
                disabled={!isBalanced || savingJv}
                loading={savingJv}
              >
                Post Journal Voucher
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSubmitJV} className="space-y-4 py-1 text-xs">
          {/* Header Row: JV No & Date */}
          <div className="flex items-center justify-between p-3.5 bg-[#0e2c4c] text-white rounded-xl">
            <div>
              <span className="text-[10px] text-slate-300 uppercase font-bold tracking-wider block">
                Journal Voucher No.
              </span>
              <span className="text-xl font-mono font-black text-[#c9a227] tracking-tight">
                {jvNo || 'JV-00104'}
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

          {/* Tag Selector & Exchange Rate */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Classification Tag *
              </label>
              <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                {(['Adjustment', 'Netting', 'Direct Settlement'] as JournalVoucherTag[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTag(t)}
                    className={`py-1.5 px-2 rounded-md font-bold text-xs transition cursor-pointer text-center ${
                      tag === t
                        ? 'bg-[#0e2c4c] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                {tag === 'Adjustment' && 'General balance adjustment. No receipt required.'}
                {tag === 'Netting' && 'Bilateral offset. System validates offset does not exceed outstanding balances.'}
                {tag === 'Direct Settlement' && 'Sub-agent paid hotel/Shirka directly. Mandatory WhatsApp voice note or receipt.'}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Entry Currency *
              </label>
              <select
                value={entryCurrency}
                onChange={(e) => setEntryCurrency(e.target.value as 'SAR' | 'PKR')}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-[var(--theme-primary)]"
              >
                <option value="SAR">SAR — Saudi Riyal</option>
                <option value="PKR">PKR — Pakistani Rupee</option>
              </select>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Amounts entered in {entryCurrency}; ledger posts SAR equivalents at this rate.
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Exchange Rate (SAR → PKR) *
              </label>
              <input
                type="number"
                step="0.01"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || masterRate)}
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-[var(--theme-primary)]"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                1 SAR = {exchangeRate} PKR
              </span>
            </div>
          </div>

          {/* Details Box (Free text shown VERBATIM in ledger statement's Particulars column) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Details Box (Particulars) *</span>
              <span className="text-[10px] text-slate-400 font-normal">Shows VERBATIM in ledger statements</span>
            </label>
            <textarea
              value={detailsBox}
              onChange={(e) => setDetailsBox(e.target.value)}
              placeholder="e.g. Bilateral netting of Al-Barakah visa receivable against Fairmont reservation credit..."
              rows={2}
              required
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#0e2c4c]/20 focus:outline-none"
            />
          </div>

          {/* Dynamic Lines Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Account Lines (Debits & Credits)
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={handleAddLine}
              >
                Add Account Row
              </Button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="grid grid-cols-12 gap-2 bg-slate-100 p-2.5 text-[10px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <div className="col-span-6">Ledger Account</div>
                <div className="col-span-3 text-right">Debit ({entryCurrency})</div>
                <div className="col-span-2 text-right">Credit ({entryCurrency})</div>
                <div className="col-span-1 text-center"></div>
              </div>

              <div className="divide-y divide-slate-100 bg-white">
                {lines.map((line, idx) => (
                  <div key={line.id} className="grid grid-cols-12 gap-2 p-2 items-center">
                    <div className="col-span-6">
                      <select
                        value={line.accountId}
                        onChange={(e) => handleLineAccountChange(line.id, e.target.value)}
                        required
                        className="w-full p-1.5 bg-slate-50 border border-slate-300 rounded text-xs font-semibold"
                      >
                        <option value="">-- Select Account --</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            [{a.accountCode}] {a.title} ({a.accountType.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.debitSAR || ''}
                        onChange={(e) => handleLineAmountChange(line.id, 'debitSAR', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-right font-bold text-slate-900"
                      />
                    </div>

                    <div className="col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.creditSAR || ''}
                        onChange={(e) => handleLineAmountChange(line.id, 'creditSAR', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full p-1.5 bg-white border border-slate-300 rounded text-xs font-mono text-right font-bold text-slate-900"
                      />
                    </div>

                    <div className="col-span-1 text-center">
                      {lines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* LIVE Balance Bar */}
              <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-mono">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-slate-500 mr-1.5">Total Debit:</span>
                    <strong className="text-slate-900 font-bold">SAR {totalDebit.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 mr-1.5">Total Credit:</span>
                    <strong className="text-slate-900 font-bold">SAR {totalCredit.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Difference:</span>
                  <span className={`px-2 py-0.5 rounded font-bold ${
                    isBalanced 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : 'bg-rose-100 text-rose-800 animate-pulse'
                  }`}>
                    SAR {difference.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Attachment Box for Direct Settlement */}
          {tag === 'Direct Settlement' && (
            <div className="p-3.5 border-2 border-dashed border-amber-300 bg-amber-50/50 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Mic className="w-4 h-4 text-emerald-600" />
                  <span>Mandatory WhatsApp Voice Note or Receipt (.opus/.mp3/.m4a/.ogg/PDF) *</span>
                </label>
                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  Required
                </span>
              </div>

              <p className="text-[11px] text-slate-600 leading-snug">
                Sub-agent WhatsApp voice notes are transcribed automatically via Gemini speech-to-text to verify settlement amounts, dates, and remitter claims.
              </p>

              <div className="flex items-center gap-2 pt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,image/*,application/pdf,.opus,.ogg,.m4a"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<UploadCloud className="w-3.5 h-3.5" />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload WhatsApp Audio or File
                </Button>

                {attachmentFileName && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                    Attached: {attachmentFileName}
                  </span>
                )}
              </div>

              {fileError && (
                <div className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{fileError}</span>
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
};
