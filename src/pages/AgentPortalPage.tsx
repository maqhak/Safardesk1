import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Building, 
  FileCheck, 
  Ticket, 
  CreditCard, 
  Plus, 
  Search, 
  Download, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  ExternalLink,
  Printer,
  ArrowLeftRight,
  FileText,
  Mic
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { CurrencyAmount } from '../components/ui/CurrencyAmount';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { formatDate } from '../utils/formatters';
import { TENANT } from '../config';
import { 
  fetchLedgerAccounts, 
  fetchLedgerEntries, 
  computeLedgerStatement, 
  exportLedgerToCSV 
} from '../services/accountingService';
import { LedgerAccountDoc, LedgerEntryDoc } from '../types/accounting';
import { VoucherQuickModal } from '../components/accounting/VoucherQuickModal';
import { ReceiptViewerModal } from '../components/accounting/ReceiptViewerModal';
import { fetchVisas, fetchVisaRequests, submitVisaRequest, VisaDoc, VisaRequestDoc } from '../services/visaService';
import * as XLSX from 'xlsx';

interface AgentVisaRow {
  id: string;
  applicantName: string;
  passportNumber: string;
  category: string;
  date: string;
  source: 'Request' | 'Distribution';
  status: string;
}

export const AgentPortalPage: React.FC = () => {
  const { userProfile } = useAuth();
  const { profile: company } = useCompany();
  const { success, error: showError, info } = useToast();

  const [activeTab, setActiveTab] = useState<'statement' | 'visas'>('statement');
  const [modalOpen, setModalOpen] = useState(false);
  const [applicantName, setApplicantName] = useState('');
  const [passportNumber, setPassportNumber] = useState('');

  const [agentVisas, setAgentVisas] = useState<VisaDoc[]>([]);
  const [agentRequests, setAgentRequests] = useState<VisaRequestDoc[]>([]);

  // Ledger state for this agent
  const [currency, setCurrency] = useState<'SAR' | 'PKR'>('SAR');
  const [agentAccount, setAgentAccount] = useState<LedgerAccountDoc | null>(null);
  const [agentEntries, setAgentEntries] = useState<LedgerEntryDoc[]>([]);
  const [activeVoucherNo, setActiveVoucherNo] = useState<string | null>(null);

  // Receipt Proof Viewer State
  const [receiptViewerUrl, setReceiptViewerUrl] = useState<string | null>(null);
  const [receiptViewerNo, setReceiptViewerNo] = useState<string>('');
  const [receiptViewerAccountId, setReceiptViewerAccountId] = useState<string | null>(null);

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

  const reloadAgentData = () => {
    Promise.all([fetchLedgerAccounts(), fetchLedgerEntries(), fetchVisas(), fetchVisaRequests()]).then(([accs, ents, visaList, reqList]) => {
      // Find matching agent account — never fall back to another account
      const found = accs.find((a) => a.linkedId === userProfile?.agentId || a.linkedId === userProfile?.uid) || null;
      setAgentAccount(found);
      if (found) {
        setAgentEntries(ents.filter((e) => e.accountId === found.id));
      } else {
        setAgentEntries([]);
      }
      const myAgentId = userProfile?.agentId;
      setAgentVisas(visaList.filter((v) => v.agentId && v.agentId === myAgentId));
      setAgentRequests(reqList.filter((r) => r.agentId === myAgentId));
    });
  };

  useEffect(() => {
    reloadAgentData();
  }, [userProfile?.uid, userProfile?.agentId]);

  const statement = useMemo(() => {
    if (!agentAccount) return null;
    return computeLedgerStatement(agentAccount, agentEntries, currency);
  }, [agentAccount, agentEntries, currency]);

  const agentVisaRows: AgentVisaRow[] = [
    ...agentRequests.map((r) => ({
      id: r.id,
      applicantName: r.pilgrimName,
      passportNumber: r.passportNumber,
      category: 'Visa Application',
      date: r.createdAt.split('T')[0],
      source: 'Request' as const,
      status: r.status,
    })),
    ...agentVisas.map((v) => ({
      id: v.id,
      applicantName: v.pilgrimName,
      passportNumber: v.passportNumber,
      category: 'Umrah Visa',
      date: v.visaIssueDate || v.createdAt.split('T')[0],
      source: 'Distribution' as const,
      status: v.status,
    })),
  ];

  const columns: Column<AgentVisaRow>[] = [
    {
      key: 'applicantName',
      header: 'Applicant & Passport',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-semibold text-slate-900 block">{row.applicantName}</span>
          <span className="text-xs font-mono text-slate-500">{row.passportNumber}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (row) => (
        <span className="text-xs text-slate-700 font-medium">{row.category}</span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-mono text-slate-600">{formatDate(row.date)}</span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      sortable: true,
      align: 'center',
      render: (row) => (
        <Badge variant={row.source === 'Request' ? 'gold' : 'success'} dot>{row.source}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (row) => {
        if (row.status === 'Approved' || row.status === 'Distributed' || row.status === 'Issued') return <Badge variant="success" dot>{row.status}</Badge>;
        if (row.status === 'Submitted' || row.status === 'Pending') return <Badge variant="gold" dot>{row.status}</Badge>;
        return <Badge variant="neutral" dot>{row.status}</Badge>;
      },
    },
  ];

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicantName || !passportNumber || !userProfile) return;
    try {
      await submitVisaRequest(userProfile, {
        agentId: userProfile.agentId || userProfile.uid,
        agentName: userProfile.agencyName || userProfile.name || 'Agent',
        pilgrimName: applicantName,
        passportNumber: passportNumber,
      });
      setModalOpen(false);
      success(`Visa application for ${applicantName} submitted for review.`);
      setApplicantName('');
      setPassportNumber('');
      reloadAgentData();
    } catch (err: any) {
      showError(err?.message || 'Failed to submit visa application.');
    }
  };

  const handleExportStatement = () => {
    if (!statement) return;
    exportLedgerToCSV(statement, company.companyName);
    success('Your agency statement of account has been exported to CSV.');
  };

  const handleExportManifest = () => {
    const rows = agentVisaRows.map(r => ({
      'Applicant Name': r.applicantName,
      'Passport Number': r.passportNumber,
      'Category': r.category,
      'Date': r.date,
      'Source': r.source,
      'Status': r.status,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Visa Manifest');
    XLSX.writeFile(wb, `agent-visa-manifest-${new Date().toISOString().split('T')[0]}.xlsx`);
    success('Visa manifest exported to Excel.');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={`Agent B2B Portal — ${userProfile?.agencyName || agentAccount?.title || 'Partner Agency'}`}
        subtitle={`Welcome, ${userProfile?.name}. Access your live sub-agent ledger statement, visa manifests, and package allocations.`}
        breadcrumbs={[{ label: 'Agent Portal' }]}
        badge={
          <Badge variant="success" size="md">
            Agent Code: {agentAccount?.accountCode || userProfile?.agentId || '—'}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCurrency('SAR')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  currency === 'SAR' ? 'bg-[#0e2c4c] text-white shadow-xs' : 'text-slate-600'
                }`}
              >
                SAR View
              </button>
              <button
                type="button"
                onClick={() => setCurrency('PKR')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  currency === 'PKR' ? 'bg-[#0e2c4c] text-white shadow-xs' : 'text-slate-600'
                }`}
              >
                <ArrowLeftRight className="w-3 h-3 text-[#c9a227]" />
                <span>PKR View</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5 text-emerald-600" />}
              onClick={handleExportStatement}
            >
              Export Statement
            </Button>

            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setModalOpen(true)}
            >
              Submit Visa
            </Button>
          </div>
        }
      />

      {/* KPI Cards for Sub-Agent */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={`Outstanding Balance (${currency})`}
          value={
            statement 
              ? `${currency} ${statement.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` 
              : `${currency} 0.00`
          }
          subValue={statement?.closingBalance && statement.closingBalance > 0 ? 'Payable to Head Office' : 'Clear balance'}
          icon={<CreditCard className="w-5 h-5 text-[#c9a227]" />}
        />
        <StatCard
          label="Approved Credit Limit"
          value={<CurrencyAmount amountSar={agentAccount?.creditLimitSAR || 0} layout="sar-only" size="lg" />}
          subValue="Allocated by Head Office"
          icon={<Building className="w-5 h-5 text-emerald-600" />}
        />
        <StatCard
          label="Total Pax Processed"
          value={statement ? (statement.totalMofaPax + statement.totalHotelPax).toString() : '0'}
          subValue="MoFA + Hotel pilgrims"
          icon={<CheckCircle2 className="w-5 h-5 text-sky-600" />}
        />
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('statement')}
          className={`py-2 px-4 border-b-2 font-bold text-sm transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'statement'
              ? 'border-[#0e2c4c] text-[#0e2c4c]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Statement of Account (Ledger)</span>
        </button>
        <button
          onClick={() => setActiveTab('visas')}
          className={`py-2 px-4 border-b-2 font-bold text-sm transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'visas'
              ? 'border-[#0e2c4c] text-[#0e2c4c]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>My Visa Applications</span>
        </button>
      </div>

      {/* Tab 1: Live Ledger Statement */}
      {activeTab === 'statement' && (
        <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">
                Live Agency Statement — {agentAccount?.title || 'Sub-Agent Ledger'}
              </h4>
              <p className="text-[11px] text-slate-500">
                Official statement in {currency}. Every debit, credit, invoice, and payment is reconciled.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Printer className="w-3.5 h-3.5" />}
                onClick={() => window.print()}
              >
                Print
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
                <tr>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Trans.#</th>
                  <th className="py-3 px-3">Particulars</th>
                  <th className="py-3 px-3">Inv-Ref</th>
                  <th className="py-3 px-3">Rate</th>
                  <th className="py-3 px-3 text-right">Debit ({currency})</th>
                  <th className="py-3 px-3 text-right">Credit ({currency})</th>
                  <th className="py-3 px-3 text-right">Balance ({currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {/* Previous Balance Row */}
                <tr className="bg-amber-50/40 font-semibold border-b border-amber-200/60">
                  <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">—</td>
                  <td className="py-2.5 px-3"><Badge variant="warning" size="sm">Opening</Badge></td>
                  <td className="py-2.5 px-3 text-slate-400 font-mono">—</td>
                  <td className="py-2.5 px-3 font-bold text-slate-800">Previous Balance (B/F)</td>
                  <td className="py-2.5 px-3 text-slate-400">—</td>
                  <td className="py-2.5 px-3 text-slate-400 font-mono">—</td>
                  <td className="py-2.5 px-3 text-right text-slate-400 font-mono">0.00</td>
                  <td className="py-2.5 px-3 text-right text-slate-400 font-mono">0.00</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0e2c4c]">
                    {statement ? statement.previousBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                  </td>
                </tr>

                {statement?.rows.map((row, idx) => {
                  const e = row.entry;
                  const isVoid = e.isVoid;
                  const debit = currency === 'SAR' ? e.debitSAR : e.debitPKR;
                  const credit = currency === 'SAR' ? e.creditSAR : e.creditPKR;

                  return (
                    <tr
                      key={e.id || idx}
                      className={isVoid ? 'bg-rose-50/40 text-slate-400 line-through opacity-70' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-700">{e.date}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant={e.entryType === 'Payment' ? 'success' : 'navy'} size="sm">
                          {e.entryType}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#0e2c4c]">{e.transNo}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{e.particulars}</div>
                        {e.voucherNo && (
                          <button
                            type="button"
                            onClick={() => setActiveVoucherNo(e.voucherNo!)}
                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-mono font-bold text-[#0e2c4c] bg-amber-50 hover:bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded cursor-pointer"
                          >
                            <FileText className="w-3 h-3 text-[#c9a227]" />
                            <span>{e.voucherNo}</span>
                          </button>
                        )}
                        {/* Requirement 5: Receipt preview with strict account ownership check or Voice Note inline player */}
                        {e.driveFileUrl && (
                          <div className="mt-1 flex items-center gap-1.5 not-line-through">
                            {e.proofType === 'voice' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (agentAccount && e.accountId !== agentAccount.id) {
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
                                title="Click to listen to WhatsApp Urdu voice note settlement proof inline"
                              >
                                <Mic className="w-3 h-3 text-emerald-600" />
                                <span>{activeAudioUrl === e.driveFileUrl && isPlayingAudio ? 'Playing Audio' : 'Play WhatsApp Voice Proof'}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  if (agentAccount && e.accountId !== agentAccount.id) {
                                    showError('Access Denied: You may only view receipts attached to your own agency entries.');
                                    return;
                                  }
                                  setReceiptViewerUrl(e.driveFileUrl || null);
                                  setReceiptViewerNo(e.transNo || 'Payment Proof');
                                  setReceiptViewerAccountId(e.accountId);
                                }}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded cursor-pointer shadow-2xs"
                              >
                                <ExternalLink className="w-3 h-3 text-indigo-600" />
                                <span>View Receipt Proof</span>
                              </button>
                            )}
                          </div>
                        )}
                        {isVoid && e.voidReason && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-0.5 not-line-through">
                            ⚠ {e.voidReason}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{e.invoiceRef || '—'}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{row.formattedRate}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">
                        {debit > 0 ? debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                        {credit > 0 ? credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0e2c4c]">
                        {row.runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {statement && (
                <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-xs text-slate-900">
                  <tr>
                    <td colSpan={6} className="py-3 px-3 uppercase text-[11px] text-slate-700">
                      Statement Totals
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      {statement.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-700">
                      {statement.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-[#0e2c4c] text-sm">
                      {statement.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="bg-slate-200/70 text-slate-700 font-medium text-[11px]">
                    <td colSpan={9} className="py-2 px-3">
                      <div className="flex items-center justify-between">
                        <div>
                          Mofa PAX: <strong>{statement.totalMofaPax}</strong> • Hotel PAX: <strong>{statement.totalHotelPax}</strong>
                        </div>
                        <div className="font-bold text-[#0e2c4c]">
                          Net Due: {currency} {statement.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* Tab 2: Visas Table */}
      {activeTab === 'visas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                My Agency Visa Manifest
              </h3>
              <p className="text-xs text-slate-500">Live electronic visa status for your travelers</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={handleExportManifest}
            >
              Export Manifest
            </Button>
          </div>

          <DataTable
            columns={columns}
            data={agentVisaRows}
            keyExtractor={(row) => row.id}
            emptyTitle="No visa applications yet"
            emptyDescription="Submit a visa application above — it will appear here with its live status."
            onRowClick={(row) => info(`Selected applicant: ${row.applicantName}`)}
          />
        </div>
      )}

      {/* Linked Voucher Quick View Modal */}
      <VoucherQuickModal
        voucherNo={activeVoucherNo}
        isOpen={Boolean(activeVoucherNo)}
        onClose={() => setActiveVoucherNo(null)}
      />

      {/* Submit Visa Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Submit Pilgrim Visa Application"
        subtitle="Submit pilgrim passport details to SafarDesk operations for MoFA issuance"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleApply}>
              Submit Application
            </Button>
          </>
        }
      >
        <form onSubmit={handleApply} className="space-y-4">
          <Input
            label="Pilgrim Full Name (As per passport)"
            value={applicantName}
            onChange={(e) => setApplicantName(e.target.value)}
            placeholder="e.g. Tariq Mehmood"
            required
          />
          <Input
            label="Passport Number"
            value={passportNumber}
            onChange={(e) => setPassportNumber(e.target.value)}
            placeholder="e.g. AB8920194"
            required
          />
          <div className="p-3 bg-navy-50 rounded-lg text-xs text-slate-700 leading-relaxed border border-navy-100">
            Current B2B contracted rate: <strong>450.00 SAR</strong> (≈ {TENANT.currency.defaultExchangeRate * 450} PKR). Debit will be recorded to your agency ledger upon visa issuance.
          </div>
        </form>
      </Modal>

      {/* Linked Receipt Proof Viewer Modal with Security Check */}
      <ReceiptViewerModal
        isOpen={Boolean(receiptViewerUrl)}
        onClose={() => setReceiptViewerUrl(null)}
        receiptUrl={receiptViewerUrl}
        paymentNo={receiptViewerNo}
        webViewLink={receiptViewerUrl?.startsWith('https://drive.google.com') ? receiptViewerUrl : null}
        userRole="agent"
        entryAccountId={receiptViewerAccountId}
        agentOwnAccountId={agentAccount?.id || ''}
      />

      {/* Hidden Audio Player for inline WhatsApp voice note playback */}
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
