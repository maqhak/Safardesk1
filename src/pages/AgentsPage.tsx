import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  KeyRound, 
  Check, 
  Copy, 
  AlertTriangle, 
  CreditCard, 
  TrendingUp, 
  Building, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  Sliders, 
  Eye, 
  ShieldAlert,
  ArrowUpRight,
  Clock,
  Sparkles,
  Wrench
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CurrencyAmount } from '../components/ui/CurrencyAmount';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { useNavigate } from 'react-router-dom';
import ProfileTimeline from '../components/ProfileTimeline';
import { useCurrentRate } from '../services/exchangeRateService';
import { fetchLedgerEntries } from '../services/accountingService';
import { fetchVouchers } from '../services/voucherService';
import { fetchTickets } from '../services/ticketService';
import { fetchJournalVouchers } from '../services/journalVoucherService';
import { fetchVisaInvoices } from '../services/visaDistributionService';
import { fetchPayments } from '../services/paymentService';
import { 
  AgentDoc, 
  LedgerAccountDoc, 
  AgentBalanceInfo 
} from '../types/agent';
import { 
  fetchAgents, 
  fetchLedgerAccounts, 
  createAgentWithCredentials, 
  updateAgent, 
  toggleAgentStatus, 
  resetAgentPasswordByOwner, 
  getAgentBalance,
  generateNextAgentCode,
  repairMissingAgentLedgers
} from '../services/agentService';
import { TENANT } from '../config';
import { getCurrentRate } from '../services/exchangeRateService';
import { formatMoney, formatDate } from '../utils/formatters';

export const AgentsPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, error: showError, info } = useToast();
  const canView = useCan('Masters', 'view');
  const isOwner = role === 'owner';
  const masterRate = useCurrentRate('SAR-PKR');
  const navigate = useNavigate();

  const [agents, setAgents] = useState<AgentDoc[]>([]);
  const [ledgers, setLedgers] = useState<LedgerAccountDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'overlimit'>('all');

  // Next agent code prediction
  const [nextCodePreview, setNextCodePreview] = useState<string>('AGT-004');

  // "Add Agent" Modal state
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [dueLimitSAR, setDueLimitSAR] = useState<number>(50000);
  const [exchangeRatePKRRate, setExchangeRatePKRRate] = useState<number>(getCurrentRate('SAR-PKR'));
  const [defSellPrice, setDefSellPrice] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState('');
  const [notes, setNotes] = useState('');

  // "Success Credential Share" Modal state
  const [successModalOpen, setSuccessModalOpen] = useState<boolean>(false);
  const [createdAgentInfo, setCreatedAgentInfo] = useState<{
    agentCode: string;
    companyName: string;
    email: string;
    password: string;
    contactPerson: string;
  } | null>(null);
  const [credentialsCopied, setCredentialsCopied] = useState<boolean>(false);

  // "Edit Agent" Modal state
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [targetAgent, setTargetAgent] = useState<AgentDoc | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editContactPerson, setEditContactPerson] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editDueLimitSAR, setEditDueLimitSAR] = useState<number>(0);
  const [editExchangeRate, setEditExchangeRate] = useState<number>(masterRate);
  const [editDefSellPrice, setEditDefSellPrice] = useState<string>('');
  const [editNotes, setEditNotes] = useState('');
  const [editing, setEditing] = useState<boolean>(false);

  // "Reset Password" Modal state
  const [resetModalOpen, setResetModalOpen] = useState<boolean>(false);
  const [tempPassword, setTempPassword] = useState<string>('');
  const [tempCopied, setTempCopied] = useState<boolean>(false);

  // "View Ledger" Modal state
  const [ledgerModalOpen, setLedgerModalOpen] = useState<boolean>(false);
  const [selectedAgentBalance, setSelectedAgentBalance] = useState<AgentBalanceInfo | null>(null);

  // Agent profile timeline (shared component with B2C customers)
  const [profileTimeline, setProfileTimeline] = useState<{
    accountId: string | null;
    vouchers: any[];
    tickets: any[];
    jvs: any[];
    invoices: any[];
    payments: any[];
    entries: any[];
  } | null>(null);
  const [loadingProfileTimeline, setLoadingProfileTimeline] = useState<boolean>(false);

  // Load all agents and ledgers
  const loadData = async () => {
    setLoading(true);
    try {
      const [agentList, ledgerList, code] = await Promise.all([
        fetchAgents(),
        fetchLedgerAccounts(),
        generateNextAgentCode(),
      ]);
      setAgents(agentList);
      setLedgers(ledgerList);
      setNextCodePreview(code);
    } catch {
      showError('Could not load agents data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Helper to get live balance for a row
  const getBalanceSAR = (agentId: string) => {
    const l = ledgers.find((item) => item.linkedAgentId === agentId);
    return l ? l.currentBalanceSAR : 0;
  };

  // Submit Add Agent form
  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!companyName.trim() || !contactPerson.trim() || !mobile.trim() || !email.trim() || !city.trim()) {
      showError('Please complete all required fields.');
      return;
    }

    if (!loginPassword || loginPassword.length < 6) {
      showError('Login password must be at least 6 characters.');
      return;
    }

    setCreating(true);
    try {
      const { agent } = await createAgentWithCredentials(userProfile, {
        companyName,
        contactPerson,
        mobile,
        city,
        email,
        dueLimitSAR,
        exchangeRatePKRRate,
        defaultSellingPricePerVisa: parseFloat(defSellPrice) || undefined,
        loginPassword,
        notes,
      });

      // Prepare success modal
      setCreatedAgentInfo({
        agentCode: agent.agentCode,
        companyName: agent.companyName,
        email: agent.email,
        password: loginPassword,
        contactPerson: agent.contactPerson,
      });

      setAddModalOpen(false);
      setSuccessModalOpen(true);
      setCredentialsCopied(false);

      // Reset form fields
      setCompanyName('');
      setContactPerson('');
      setMobile('');
      setCity('');
      setEmail('');
      setDueLimitSAR(50000);
      setExchangeRatePKRRate(getCurrentRate('SAR-PKR'));
      setDefSellPrice('');
      setLoginPassword('');
      setNotes('');

      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to create agent account.');
    } finally {
      setCreating(false);
    }
  };

  // Copy created credentials text for WhatsApp/SMS
  const handleCopyCredentials = () => {
    if (!createdAgentInfo) return;
    const text = `*${TENANT.companyName} B2B Agent Portal Login Credentials*
----------------------------------------
Agency: ${createdAgentInfo.companyName}
Contact: ${createdAgentInfo.contactPerson}
Agent Code: ${createdAgentInfo.agentCode}
Login Portal: ${window.location.origin}/login
Username: ${createdAgentInfo.email}
Password: ${createdAgentInfo.password}
----------------------------------------
Please keep these credentials safe and change password after first login.`;

    navigator.clipboard.writeText(text);
    setCredentialsCopied(true);
    success('Credentials formatted & copied to clipboard for WhatsApp / SMS sharing!');
    setTimeout(() => setCredentialsCopied(false), 4000);
  };

  // Open Edit Agent Modal
  const openEditAgent = (agent: AgentDoc) => {
    setTargetAgent(agent);
    setEditCompanyName(agent.companyName);
    setEditContactPerson(agent.contactPerson);
    setEditMobile(agent.mobile);
    setEditCity(agent.city);
    setEditDueLimitSAR(agent.dueLimitSAR);
    setEditExchangeRate(agent.exchangeRatePKRRate);
    setEditDefSellPrice(agent.defaultSellingPricePerVisa ? String(agent.defaultSellingPricePerVisa) : '');
    setEditNotes(agent.notes || '');
    setEditModalOpen(true);
  };

  // Save Edit Agent
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !targetAgent) return;

    setEditing(true);
    try {
      await updateAgent(userProfile, targetAgent.id, {
        companyName: editCompanyName,
        contactPerson: editContactPerson,
        mobile: editMobile,
        city: editCity,
        dueLimitSAR: Number(editDueLimitSAR) || 0,
        exchangeRatePKRRate: Number(editExchangeRate) || masterRate,
        defaultSellingPricePerVisa: parseFloat(editDefSellPrice) || undefined,
        notes: editNotes,
      });

      success(`Agent ${targetAgent.agentCode} updated successfully.`);
      setEditModalOpen(false);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to update agent.');
    } finally {
      setEditing(false);
    }
  };

  // Toggle active status
  const handleToggleStatus = async (agent: AgentDoc) => {
    if (!userProfile) return;
    try {
      const newState = !agent.isActive;
      await toggleAgentStatus(userProfile, agent.id, newState);
      success(`Agent ${agent.agentCode} ${newState ? 'activated' : 'deactivated'}.`);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to update agent status.');
    }
  };

  // Reset password
  const handleResetPassword = async (agent: AgentDoc) => {
    if (!userProfile) return;
    try {
      const temp = await resetAgentPasswordByOwner(userProfile, agent.id);
      setTargetAgent(agent);
      setTempPassword(temp);
      setTempCopied(false);
      setResetModalOpen(true);
    } catch (err: any) {
      showError(err?.message || 'Failed to reset password.');
    }
  };

  // Open View Ledger modal
  const openLedgerModal = async (agent: AgentDoc) => {
    const bal = await getAgentBalance(agent.id);
    setSelectedAgentBalance(bal);
    setTargetAgent(agent);
    setLedgerModalOpen(true);
    // Load the unified profile timeline (same component as B2C customers)
    setLoadingProfileTimeline(true);
    try {
      const [accounts, entries, vouchers, tickets, jvs, invoices, payments] = await Promise.all([
        fetchLedgerAccounts(),
        fetchLedgerEntries(),
        fetchVouchers(),
        fetchTickets(),
        fetchJournalVouchers(),
        fetchVisaInvoices(),
        fetchPayments(),
      ]);
      const acc = accounts.find((a) => a.linkedAgentId === agent.id);
      const accId = acc?.id || null;
      setProfileTimeline({
        accountId: accId,
        vouchers: vouchers.filter((v: any) => v.agentId === agent.id),
        tickets: tickets.filter((t: any) => t.buyerId === agent.id),
        jvs: accId ? jvs.filter((jv: any) => (jv.lines || []).some((l: any) => l.accountId === accId)) : [],
        invoices: invoices.filter((inv: any) => inv.agentId === agent.id),
        payments: accId ? payments.filter((p: any) => p.fromAccountId === accId || p.toAccountId === accId) : [],
        entries: accId ? entries.filter((e: any) => e.accountId === accId) : [],
      });
    } catch (err) {
      console.warn('Failed to load agent profile timeline:', err);
      setProfileTimeline(null);
    } finally {
      setLoadingProfileTimeline(false);
    }
  };

  // Filter agents list
  const filteredAgents = agents.filter((a) => {
    const q = search.toLowerCase();
    const matchesSearch =
      a.agentCode.toLowerCase().includes(q) ||
      a.companyName.toLowerCase().includes(q) ||
      a.contactPerson.toLowerCase().includes(q) ||
      a.mobile.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    const balanceSAR = getBalanceSAR(a.id);
    const isOverLimit = balanceSAR > a.dueLimitSAR;

    if (statusFilter === 'active') return a.isActive;
    if (statusFilter === 'inactive') return !a.isActive;
    if (statusFilter === 'overlimit') return isOverLimit;

    return true;
  });

  // Calculate high-level summary KPIs
  const totalReceivableSAR = ledgers.reduce((acc, curr) => acc + curr.currentBalanceSAR, 0);
  const overLimitCount = agents.filter((a) => getBalanceSAR(a.id) > a.dueLimitSAR).length;

  if (!canView && !isOwner) {
    return (
      <div className="py-12">
        <Card className="max-w-md mx-auto text-center p-8 border-rose-200">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Access Restricted</h2>
          <p className="text-xs text-slate-500 mb-4">
            Your staff account does not have permission to view the Agents Master registry.
          </p>
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="B2B Sub-Agents Registry"
        subtitle="Manage B2B sub-agent accounts, credit due limits, dedicated SAR/PKR forex rates, and live sub-ledgers."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Masters', href: '/masters' },
          { label: 'Agents' },
        ]}
        badge={
          <Badge variant="gold" size="md">
            Locked Registration (Owner Only)
          </Badge>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={loadData}
              disabled={loading}
            >
              Refresh
            </Button>
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Wrench className="w-3.5 h-3.5" />}
                onClick={async () => {
                  if (!userProfile) return;
                  if (!confirm('Create missing ledger accounts for agents that don\'t have one?')) return;
                  try {
                    const created = await repairMissingAgentLedgers(userProfile);
                    if (created.length > 0) {
                      success(`Repaired! Created ledgers for: ${created.join(', ')}`);
                      loadData();
                    } else {
                      info('All agents already have ledger accounts. Nothing to repair.');
                    }
                  } catch (e: any) {
                    showError(e.message || 'Repair failed');
                  }
                }}
                title="One-time fix: create ledgers for agents missing them"
              >
                Repair Ledgers
              </Button>
            )}
            {isOwner && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<UserPlus className="w-3.5 h-3.5" />}
                onClick={() => setAddModalOpen(true)}
              >
                Add Agent
              </Button>
            )}
          </>
        }
      />

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Registered B2B Agents</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">{agents.length}</span>
          <span className="text-[11px] text-slate-500">Across Pakistan & regional network</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Live Receivables (SAR)</span>
          <span className="text-2xl font-bold font-mono text-[var(--theme-primary)] mt-1 block">
            {formatMoney(totalReceivableSAR, 'SAR')}
          </span>
          <span className="text-[11px] text-slate-500 font-mono">
            ≈ {formatMoney(totalReceivableSAR * getCurrentRate('SAR-PKR'), 'PKR')}
          </span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Over Credit Limit</span>
          <span className={`text-2xl font-bold mt-1 block ${overLimitCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {overLimitCount} Agents
          </span>
          <span className="text-[11px] text-slate-500">Exceeding allocated dueLimitSAR</span>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Next Agent Code</span>
          <span className="text-2xl font-bold font-mono text-[#c9a227] mt-1 block">
            {nextCodePreview}
          </span>
          <span className="text-[11px] text-slate-500">Auto-assigned on registration</span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-80">
            <Input
              placeholder="Search code, agency, contact or mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
              {[
                { id: 'all', label: 'All' },
                { id: 'active', label: 'Active' },
                { id: 'inactive', label: 'Inactive' },
                { id: 'overlimit', label: 'Over Limit' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`px-3 py-1 rounded-md transition cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-[#0e2c4c] text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Agents Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 w-28">Code</th>
                  <th className="py-3.5 px-4">Agency & Contact</th>
                  <th className="py-3.5 px-4">Location & Mobile</th>
                  <th className="py-3.5 px-4 text-right">Due Limit (SAR)</th>
                  <th className="py-3.5 px-4 text-right">Current Balance (SAR)</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAgents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm font-semibold text-slate-700">No agent records found</p>
                      <p className="text-xs text-slate-400 mt-0.5">Try refining your search terms or filter</p>
                    </td>
                  </tr>
                ) : (
                  filteredAgents.map((agent) => {
                    const balanceSAR = getBalanceSAR(agent.id);
                    const isOverLimit = balanceSAR > agent.dueLimitSAR;
                    const balancePKR = balanceSAR * (agent.exchangeRatePKRRate || getCurrentRate('SAR-PKR'));

                    return (
                      <tr key={agent.id} className="hover:bg-slate-50/70 transition">
                        {/* Agent Code */}
                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-xs text-[var(--theme-primary)] bg-navy-50/80 px-2 py-1 rounded border border-navy-100">
                            {agent.agentCode}
                          </span>
                        </td>

                        {/* Agency & Contact */}
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-semibold text-slate-900 block">{agent.companyName}</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                              <span>Contact: {agent.contactPerson}</span>
                              <span>•</span>
                              <span className="font-mono text-slate-400">{agent.email}</span>
                            </span>
                          </div>
                        </td>

                        {/* Location & Mobile */}
                        <td className="py-3.5 px-4">
                          <div className="text-xs">
                            <span className="font-medium text-slate-800 block flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-[#c9a227]" />
                              <span>{agent.city}</span>
                            </span>
                            <span className="text-slate-500 font-mono mt-0.5 block flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{agent.mobile}</span>
                            </span>
                          </div>
                        </td>

                        {/* Due Limit (SAR) */}
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {formatMoney(agent.dueLimitSAR, 'SAR')}
                          </span>
                          <span className="text-[11px] text-slate-400 block font-mono">
                            Rate: {agent.exchangeRatePKRRate.toFixed(2)}
                          </span>
                        </td>

                        {/* Current Balance pulled live from ledger */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`font-mono text-xs font-bold ${isOverLimit ? 'text-rose-600' : 'text-slate-900'}`}>
                              {formatMoney(balanceSAR, 'SAR')}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              ≈ {formatMoney(balancePKR, 'PKR')}
                            </span>
                            {isOverLimit && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded mt-1">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>OVER LIMIT by {formatMoney(balanceSAR - agent.dueLimitSAR, 'SAR')}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
                          {agent.isActive ? (
                            <Badge variant="success" dot>Active</Badge>
                          ) : (
                            <Badge variant="danger" dot>Inactive</Badge>
                          )}
                        </td>

                        {/* Row Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Ledger */}
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<FileText className="w-3.5 h-3.5 text-[var(--theme-primary)]" />}
                              onClick={() => openLedgerModal(agent)}
                              title="View Live Sub-Ledger Statement"
                            >
                              Ledger
                            </Button>

                            {/* Owner Actions */}
                            {isOwner && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  leftIcon={<Sliders className="w-3.5 h-3.5 text-slate-500" />}
                                  onClick={() => openEditAgent(agent)}
                                  title="Edit Agent Details & Due Limit"
                                >
                                  Edit
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  leftIcon={<KeyRound className="w-3.5 h-3.5 text-slate-500" />}
                                  onClick={() => handleResetPassword(agent)}
                                  title="Reset Agent Login Password"
                                >
                                  Reset Key
                                </Button>

                                <Button
                                  variant={agent.isActive ? 'outline' : 'primary'}
                                  size="sm"
                                  onClick={() => handleToggleStatus(agent)}
                                  className={agent.isActive ? 'hover:text-rose-600 hover:border-rose-300' : ''}
                                >
                                  {agent.isActive ? 'Deactivate' : 'Activate'}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 1. "ADD AGENT" MODAL (OWNER ONLY) WITH EXACT FIELDS */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Register New B2B Sub-Agent"
        subtitle={`Creates Auth credentials, Agent profile, and auto-provisions ledger account in one flow`}
        size="2xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={creating}
              onClick={handleAddAgent}
            >
              Register Agent & Create Ledger
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddAgent} className="space-y-4">
          <div className="p-3 bg-navy-50/70 border border-navy-100 rounded-lg text-xs text-slate-700 flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-semibold text-[var(--theme-primary)]">
              <Sparkles className="w-3.5 h-3.5 text-[#c9a227]" />
              <span>Assigned Agent Code:</span>
            </span>
            <span className="font-mono font-bold text-sm text-[var(--theme-primary)] bg-white px-2 py-0.5 rounded border border-navy-200">
              {nextCodePreview}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Agent / Company Name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Al-Quds Travel & Tours"
              required
            />
            <Input
              label="Contact Person"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="e.g. Tariq Mehmood"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Mobile Number (WhatsApp Enabled)"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="e.g. +92 300 1234567"
              required
            />
            <Input
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Karachi / Islamabad / Lahore"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Due Limit (SAR)"
              type="number"
              value={dueLimitSAR}
              onChange={(e) => setDueLimitSAR(Number(e.target.value))}
              placeholder="e.g. 50000"
              helperText="Outstanding balance ceiling before alert"
              required
            />
            <Input
              label="SAR → PKR Exchange Rate"
              type="number"
              step="0.01"
              value={exchangeRatePKRRate}
              onChange={(e) => setExchangeRatePKRRate(Number(e.target.value))}
              placeholder="e.g. 74.50"
              helperText="Specific rate for this agent ledger"
              required
            />
            <Input
              label="Default Selling Price / Visa (SAR)"
              type="number"
              min="0"
              step="0.01"
              value={defSellPrice}
              onChange={(e) => setDefSellPrice(e.target.value)}
              placeholder="e.g. 525"
              helperText="Auto-fills in visa distribution"
            />
          </div>

          {/* Login Credentials Section */}
          <div className="pt-3 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
              Agent Portal Login Credentials
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Login Username (Email)"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. agent.alquds@gmail.com"
                required
              />
              <Input
                label="Login Password (Set by Owner)"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                helperText="Owner shares this manually with the agent"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Internal Notes / Terms
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes regarding commission, settlement cycle, bank details..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
            />
          </div>
        </form>
      </Modal>

      {/* 2. SUCCESS CREDENTIALS SHARING PANEL */}
      <Modal
        isOpen={successModalOpen}
        onClose={() => setSuccessModalOpen(false)}
        title="Agent Registered Successfully"
        subtitle="Credentials ready to share manually with the partner"
        size="md"
        footer={
          <Button variant="primary" size="sm" onClick={() => setSuccessModalOpen(false)}>
            Done
          </Button>
        }
      >
        {createdAgentInfo && (
          <div className="space-y-4 pt-1">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-950 flex items-start gap-2.5">
              <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong>{createdAgentInfo.companyName}</strong> has been registered with code <strong>{createdAgentInfo.agentCode}</strong>.
                Their ledger account has been auto-provisioned with opening balance SAR 0.
              </div>
            </div>

            {/* Credential Card */}
            <div className="p-4 bg-slate-100 rounded-xl border border-slate-300 font-mono text-xs space-y-2 select-all">
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-sans">
                <span className="text-slate-500 font-medium">Agent Code:</span>
                <span className="font-bold text-[var(--theme-primary)] font-mono">{createdAgentInfo.agentCode}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-sans">
                <span className="text-slate-500 font-medium">Portal URL:</span>
                <span className="text-slate-800">{window.location.origin}/login</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-1.5 font-sans">
                <span className="text-slate-500 font-medium">Username (Email):</span>
                <span className="text-slate-900 font-semibold">{createdAgentInfo.email}</span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-slate-500 font-medium">Password:</span>
                <span className="font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-300">{createdAgentInfo.password}</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="md"
              className="w-full"
              leftIcon={credentialsCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              onClick={handleCopyCredentials}
            >
              {credentialsCopied ? 'Credentials Copied to Clipboard!' : 'Copy Credentials for WhatsApp / SMS'}
            </Button>

            <p className="text-[11px] text-slate-500 text-center">
              Please share these credentials manually with {createdAgentInfo.contactPerson}. No automatic public emails are sent.
            </p>
          </div>
        )}
      </Modal>

      {/* 3. EDIT AGENT MODAL */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit Agent — ${targetAgent?.agentCode}`}
        subtitle="Update agency information, due limits, and forex benchmarks"
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={editing} onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <Input
            label="Agent / Company Name"
            value={editCompanyName}
            onChange={(e) => setEditCompanyName(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Contact Person"
              value={editContactPerson}
              onChange={(e) => setEditContactPerson(e.target.value)}
              required
            />
            <Input
              label="Mobile Number"
              value={editMobile}
              onChange={(e) => setEditMobile(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="City"
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              required
            />
            <Input
              label="Due Limit (SAR)"
              type="number"
              value={editDueLimitSAR}
              onChange={(e) => setEditDueLimitSAR(Number(e.target.value))}
              required
            />
            <Input
              label="Exchange Rate (SAR→PKR)"
              type="number"
              step="0.01"
              value={editExchangeRate}
              onChange={(e) => setEditExchangeRate(Number(e.target.value))}
              required
            />
            <Input
              label="Default Selling Price / Visa (SAR)"
              type="number"
              min="0"
              step="0.01"
              value={editDefSellPrice}
              onChange={(e) => setEditDefSellPrice(e.target.value)}
              placeholder="e.g. 525"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Internal Notes
            </label>
            <textarea
              rows={2}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
            />
          </div>
        </form>
      </Modal>

      {/* 4. TEMPORARY PASSWORD REVEAL MODAL */}
      <Modal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title="Agent Login Password Reset"
        subtitle={`One-time temporary password for ${targetAgent?.companyName}`}
        size="sm"
        footer={
          <Button variant="primary" size="sm" onClick={() => setResetModalOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4 pt-1">
          <p className="text-xs text-slate-600 leading-relaxed">
            A new temporary password has been generated for <strong>{targetAgent?.companyName}</strong> ({targetAgent?.email}). Share this once with the agent:
          </p>

          <div className="p-3.5 bg-slate-100 rounded-xl border border-slate-300 flex items-center justify-between">
            <span className="font-mono text-base font-bold text-slate-900 select-all tracking-wider">
              {tempPassword}
            </span>
            <Button
              variant="outline"
              size="sm"
              leftIcon={tempCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              onClick={() => {
                navigator.clipboard.writeText(tempPassword);
                setTempCopied(true);
                success('Temporary password copied to clipboard!');
                setTimeout(() => setTempCopied(false), 3000);
              }}
            >
              {tempCopied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            Share this via WhatsApp or direct SMS. The agent will be prompted to change it on login.
          </div>
        </div>
      </Modal>

      {/* 5. VIEW LIVE LEDGER MODAL */}
      <Modal
        isOpen={ledgerModalOpen}
        onClose={() => setLedgerModalOpen(false)}
        title={`Agent Profile — ${targetAgent?.companyName}`}
        subtitle={`Agent Code: ${targetAgent?.agentCode} • City: ${targetAgent?.city}`}
        size="lg"
        footer={
          <Button variant="outline" size="sm" onClick={() => setLedgerModalOpen(false)}>
            Close
          </Button>
        }
      >
        {selectedAgentBalance && (
          <div className="space-y-5">
            {/* Balance Overview Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block uppercase font-medium">Outstanding Balance (SAR)</span>
                <span className="text-lg font-bold font-mono text-[var(--theme-primary)] mt-0.5 block">
                  {formatMoney(selectedAgentBalance.balanceSAR, 'SAR')}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  ≈ {formatMoney(selectedAgentBalance.balancePKR, 'PKR')}
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block uppercase font-medium">Allocated Due Limit</span>
                <span className="text-lg font-bold font-mono text-slate-800 mt-0.5 block">
                  {formatMoney(selectedAgentBalance.dueLimitSAR, 'SAR')}
                </span>
                <span className="text-[10px] text-slate-400">
                  Fixed Credit Ceiling
                </span>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-500 block uppercase font-medium">Forex Exchange Rate</span>
                <span className="text-lg font-bold font-mono text-[#c9a227] mt-0.5 block">
                  1 SAR = {selectedAgentBalance.exchangeRatePKRRate.toFixed(2)} PKR
                </span>
                <span className="text-[10px] text-slate-400">
                  Agent Contract Rate
                </span>
              </div>
            </div>

            {selectedAgentBalance.isOverLimit && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Agent is Over Credit Limit by <strong>{formatMoney(selectedAgentBalance.overLimitAmountSAR, 'SAR')}</strong></span>
                </span>
                <Badge variant="danger">Restricted</Badge>
              </div>
            )}

            {/* Agent Activity Timeline — shared component with B2C customer profiles */}
            <div>
              <h4 className="font-bold text-slate-900 text-sm mb-3">Agent Activity Timeline</h4>
              {loadingProfileTimeline ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading live timeline records...</div>
              ) : profileTimeline ? (
                <ProfileTimeline
                  accountId={profileTimeline.accountId}
                  visas={[]}
                  vouchers={profileTimeline.vouchers}
                  tickets={profileTimeline.tickets}
                  jvs={profileTimeline.jvs}
                  invoices={profileTimeline.invoices}
                  payments={profileTimeline.payments}
                  entries={profileTimeline.entries}
                  masterRate={masterRate}
                  onNavigate={(path) => { setLedgerModalOpen(false); navigate(path); }}
                />
              ) : null}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
