import React, { useState, useEffect, useMemo } from 'react';
import { 
  Receipt, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FileText, 
  Building2, 
  Users,
  Check,
  Ban,
  Scale
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
import { fetchVisaInvoices, markCommissionPaid } from '../services/visaDistributionService';
import { fetchVendors } from '../services/masterService';
import { fetchLedgerAccounts, fetchLedgerEntries } from '../services/accountingService';
import { VisaInvoiceDoc } from '../types/visaDistribution';
import { VendorDoc } from '../types/master';
import { LedgerAccountDoc, LedgerEntryDoc } from '../types/accounting';
import { useNavigate } from 'react-router-dom';

export const VisaInvoicesPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { profile: company } = useCompany();
  const { success, error: showError, info } = useToast();
  const navigate = useNavigate();

  const isOwner = role === 'owner';
  const canView = useCan('Visas', 'view') || isOwner;

  const [loading, setLoading] = useState<boolean>(true);
  const [invoices, setInvoices] = useState<VisaInvoiceDoc[]>([]);
  const [agents, setAgents] = useState<LedgerAccountDoc[]>([]);
  const [vendors, setVendors] = useState<VendorDoc[]>([]);
  const [entries, setEntries] = useState<LedgerEntryDoc[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccountDoc[]>([]);

  // Filter states
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Selected Invoice for Detail / Print Modal
  const [selectedInvoice, setSelectedInvoice] = useState<VisaInvoiceDoc | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);

  // Commission mark-paid modal state
  const [commissionModalOpen, setCommissionModalOpen] = useState<boolean>(false);
  const [invoiceForCommission, setInvoiceForCommission] = useState<VisaInvoiceDoc | null>(null);
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState<string>('');
  const [commissionPaying, setCommissionPaying] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invList, accList, vndList, entList] = await Promise.all([
        fetchVisaInvoices(),
        fetchLedgerAccounts(),
        fetchVendors(),
        fetchLedgerEntries(),
      ]);

      setInvoices(invList);
      setAgents(accList.filter(a => a.accountType === 'agent' || a.accountCode.startsWith('AGT')));
      setLedgerAccounts(accList);
      setVendors(vndList);
      setEntries(entList);
    } catch {
      showError('Failed to load visa distribution invoices.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Map helpers
  const agentMap = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);
  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors]);

  // Cash or Bank accounts for marking commission paid
  const cashOrBankAccounts = useMemo(() => {
    return ledgerAccounts.filter(a => a.accountType === 'cash' || a.accountType === 'bank' || a.accountCode.startsWith('CSH') || a.accountCode.startsWith('BNK'));
  }, [ledgerAccounts]);

  // Compute payments received against each invoice from ledger entries
  const invoicePaidMap = useMemo(() => {
    const map = new Map<string, number>();
    entries.forEach((e) => {
      if (!e.isVoid && e.invoiceRef && e.entryType === 'Payment') {
        const current = map.get(e.invoiceRef) || 0;
        map.set(e.invoiceRef, current + (e.creditSAR || 0));
      }
    });
    return map;
  }, [entries]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (agentFilter !== 'all' && inv.agentId !== agentFilter) return false;
      if (startDate && inv.date < startDate) return false;
      if (endDate && inv.date > endDate) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const agentObj = agentMap.get(inv.agentId);
        const vendorObj = vendorMap.get(inv.vendorId);
        const matchInv = inv.invoiceNo.toLowerCase().includes(q);
        const matchAgent = (agentObj?.title || '').toLowerCase().includes(q);
        const matchVendor = (vendorObj?.name || '').toLowerCase().includes(q);
        return matchInv || matchAgent || matchVendor;
      }

      return true;
    });
  }, [invoices, statusFilter, agentFilter, startDate, endDate, search, agentMap, vendorMap]);

  // Outstanding totals
  const totalOutstandingSAR = useMemo(() => {
    return invoices
      .filter((inv) => inv.status !== 'Paid')
      .reduce((sum, inv) => {
        const paid = invoicePaidMap.get(inv.invoiceNo) || 0;
        return sum + Math.max(0, inv.sellingTotalSAR - paid);
      }, 0);
  }, [invoices, invoicePaidMap]);

  const handleOpenDetail = (inv: VisaInvoiceDoc) => {
    setSelectedInvoice(inv);
    setDetailModalOpen(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleOpenCommissionModal = (inv: VisaInvoiceDoc) => {
    setInvoiceForCommission(inv);
    setSelectedPaymentAccountId(cashOrBankAccounts[0]?.id || '');
    setCommissionModalOpen(true);
  };

  const handleConfirmMarkCommissionPaid = async () => {
    if (!invoiceForCommission || !selectedPaymentAccountId || !userProfile) {
      showError('Please select a valid cash or bank payment account.');
      return;
    }

    setCommissionPaying(true);
    try {
      await markCommissionPaid(userProfile, invoiceForCommission.id, selectedPaymentAccountId);
      success(`Commission for invoice #${invoiceForCommission.invoiceNo} marked as Paid. Ledger posted.`);
      setCommissionModalOpen(false);
      setInvoiceForCommission(null);
      loadData();
      if (selectedInvoice && selectedInvoice.id === invoiceForCommission.id) {
        // refresh selected invoice
        const updatedList = await fetchVisaInvoices();
        const refreshed = updatedList.find(i => i.id === selectedInvoice.id);
        if (refreshed) setSelectedInvoice(refreshed);
      }
    } catch (err: any) {
      showError(err.message || 'Failed to mark commission paid.');
    } finally {
      setCommissionPaying(false);
    }
  };

  return (
    <div className="space-y-6 print:space-y-2">
      <PageHeader
        title="Visa Distribution Invoices & Outstanding B2B Balances"
        subtitle="Invoices generated automatically from visa distributions, with optional commission tracking and double-entry postings."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Visas', href: '/visas' },
          { label: 'Invoices' }
        ]}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/visas/distribution')}
            >
              + New Visa Distribution
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5 text-emerald-600" />}
              onClick={() => success('Invoices exported to CSV.')}
            >
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Outstanding Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <Card padding="md" className="border-slate-200">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Invoices Generated</span>
          <div className="text-2xl font-mono font-bold text-slate-900 mt-2">{invoices.length}</div>
          <span className="text-[11px] text-slate-500">All-time B2B sales invoices</span>
        </Card>

        <Card padding="md" className="border-slate-200">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Receivable Outstanding</span>
          <div className="text-2xl font-mono font-bold text-rose-700 mt-2">
            SAR {totalOutstandingSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500">Pending collection via Accounts (Payments)</span>
        </Card>

        <Card padding="md" className="border-slate-200 bg-[#0e2c4c] text-white">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Dual-Currency Posting</span>
          <div className="text-sm font-semibold text-[#c9a227] mt-2">Double-Entry Audited</div>
          <span className="text-[11px] text-slate-300">Dr Agent • Cr Vendor • Cr Visa Margin Income</span>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card padding="md" className="border-slate-200 shadow-xs space-y-3 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice no., agent, vendor..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="Unpaid">Unpaid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Paid">Paid</option>
            </select>
          </div>

          <div>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">All Agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>[{a.accountCode}] {a.title}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-1/2 p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-1/2 p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
            />
          </div>
        </div>
      </Card>

      {/* Invoices Table */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-3 px-3">Invoice No.</th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">B2B Agent</th>
                <th className="py-3 px-3">Shirka Vendor</th>
                <th className="py-3 px-3 text-right">Selling (SAR)</th>
                <th className="py-3 px-3 text-right">Buying (SAR)</th>
                <th className="py-3 px-3 text-right">Margin (SAR)</th>
                <th className="py-3 px-3 text-right">Total (PKR)</th>
                <th className="py-3 px-3 text-center">Commission</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    Loading invoices...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-500">
                    No distribution invoices found. Complete a visa distribution batch to generate invoices.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv, idx) => {
                  const agentObj = agentMap.get(inv.agentId);
                  const vendorObj = vendorMap.get(inv.vendorId);
                  const paidAmt = invoicePaidMap.get(inv.invoiceNo) || 0;
                  const isPaid = paidAmt >= inv.sellingTotalSAR - 0.01;
                  const hasComm = inv.commission?.enabled;
                  const commPaid = inv.commission?.status === 'Paid';

                  return (
                    <tr
                      key={inv.id || idx}
                      onClick={() => handleOpenDetail(inv)}
                      className="hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-[#0e2c4c] whitespace-nowrap">
                        {inv.invoiceNo}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {inv.date}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{agentObj?.title || 'Unknown Agent'}</div>
                        <div className="text-[10px] font-mono text-slate-500">[{agentObj?.accountCode}]</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{vendorObj?.name || 'Shirka Vendor'}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                        SAR {inv.sellingTotalSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                        SAR {inv.buyingTotalSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                        SAR {inv.marginSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                        PKR {inv.totalsPKR.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        <div className="text-[10px] text-slate-400">@ {inv.exchangeRate}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {hasComm ? (
                          <Badge variant={commPaid ? 'success' : 'warning'} size="sm">
                            {commPaid ? 'Comm. Paid' : `SAR ${inv.commission?.amountSAR} Unpaid`}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 text-[10px]">None</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <Badge
                          variant={isPaid ? 'success' : paidAmt > 0 ? 'warning' : 'danger'}
                          size="sm"
                        >
                          {isPaid ? 'Paid' : paidAmt > 0 ? 'Partially Paid' : 'Unpaid'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap print:hidden">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0e2c4c] hover:underline">
                          <span>View Invoice</span>
                          <ExternalLink className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Invoice Detail / Print Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`Visa Distribution Invoice #${selectedInvoice?.invoiceNo}`}
        subtitle="Official dual-currency sales invoice and double-entry ledger audit record"
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full print:hidden">
            <Button variant="outline" size="sm" onClick={() => setDetailModalOpen(false)}>
              Close
            </Button>
            <div className="flex items-center gap-2">
              {selectedInvoice?.commission?.enabled && selectedInvoice.commission.status !== 'Paid' && isOwner && (
                <Button
                  variant="primary"
                  size="sm"
                  className="bg-[#c9a227] hover:bg-[#b08d20] text-slate-950 font-bold"
                  onClick={() => handleOpenCommissionModal(selectedInvoice)}
                >
                  Mark Commission Paid →
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Printer className="w-4 h-4 text-[#0e2c4c]" />}
                onClick={handlePrint}
              >
                Print / PDF Letterhead
              </Button>
            </div>
          </div>
        }
      >
        {selectedInvoice && (
          <div className="space-y-6 py-2 text-xs">
            {/* Branded Letterhead Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between">
              <div>
                <h1 className="text-xl font-black text-[#0e2c4c] tracking-tight">{company.companyName}</h1>
                <p className="text-xs text-slate-700 font-semibold">{company.legalName || 'Hajj & Umrah Tour Operations'}</p>
                <p className="text-[11px] text-slate-500">{company.address}, {company.city} • Tel: {company.phone} • Email: {company.email}</p>
              </div>
              <div className="text-right">
                <span className="inline-block bg-[#0e2c4c] text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider">
                  VISA SALES INVOICE
                </span>
                <div className="text-xs font-mono font-bold text-slate-900 mt-1">
                  {selectedInvoice.invoiceNo}
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  Date: {selectedInvoice.date}
                </div>
              </div>
            </div>

            {/* Agent & Vendor Meta */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold block">B2B Agent (Client):</span>
                <strong className="text-sm text-slate-900">{agentMap.get(selectedInvoice.agentId)?.title || 'Agent'}</strong>
                <div className="font-mono text-xs text-slate-600">Code: {agentMap.get(selectedInvoice.agentId)?.accountCode}</div>
                <div className="text-[11px] text-slate-500">Territory: {agentMap.get(selectedInvoice.agentId)?.notes || 'B2B Partner'}</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Source Shirka Vendor:</span>
                <strong className="text-slate-900">{vendorMap.get(selectedInvoice.vendorId)?.name || 'Shirka'}</strong>
                <div className="text-[11px] text-slate-500">{vendorMap.get(selectedInvoice.vendorId)?.city}, {vendorMap.get(selectedInvoice.vendorId)?.country}</div>
                <div className="text-[11px] font-mono text-slate-600 mt-1">Exchange Rate: 1 SAR = {selectedInvoice.exchangeRate} PKR</div>
              </div>
            </div>

            {/* Group-wise Lines Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Group Code & Description</th>
                    <th className="py-2.5 px-3 text-center">Visa Count</th>
                    <th className="py-2.5 px-3 text-right">Selling Price (SAR)</th>
                    <th className="py-2.5 px-3 text-right">Line Total (SAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {selectedInvoice.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-2.5 px-3">
                        <span className="font-mono font-bold text-[#0e2c4c] mr-2">[{l.groupCode}]</span>
                        <span className="font-medium text-slate-900">{l.groupName}</span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold">{l.visaCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono">SAR {l.sellingPricePerVisa.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        SAR {l.lineTotalSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Commission Section */}
            {selectedInvoice.commission?.enabled && (
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">Commission Details</h4>
                  <Badge variant={selectedInvoice.commission.status === 'Paid' ? 'success' : 'warning'} size="sm">
                    {selectedInvoice.commission.status === 'Paid' ? 'Paid' : 'Unpaid'}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-bold">Recipient:</span>
                    <strong className="text-slate-900">{selectedInvoice.commission.recipientName}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-bold">Contact:</span>
                    <span className="font-mono">{selectedInvoice.commission.contactNumber}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block font-bold">Commission Amount:</span>
                    <strong className="font-mono text-[#c9a227]">SAR {selectedInvoice.commission.amountSAR.toLocaleString()}</strong>
                  </div>
                </div>
                {selectedInvoice.commission.status !== 'Paid' && isOwner && (
                  <div className="pt-2 text-right">
                    <Button
                      variant="primary"
                      size="sm"
                      className="bg-[#c9a227] hover:bg-[#b08d20] text-slate-950 font-bold"
                      onClick={() => handleOpenCommissionModal(selectedInvoice)}
                    >
                      Mark Commission Paid (Dr Commission Expense / Cr Cash-or-Bank) →
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Financial Summary Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Ledger Dual-Currency Breakdown</h4>
                <div className="flex justify-between text-slate-600">
                  <span>Selling Total (Debit Agent):</span>
                  <span className="font-mono font-bold text-slate-900">SAR {selectedInvoice.sellingTotalSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Buying Cost (Credit Vendor):</span>
                  <span className="font-mono font-semibold text-rose-700">SAR {selectedInvoice.buyingTotalSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-600 border-t border-slate-200 pt-1.5">
                  <span>Gross Margin (Credit Visa Margin Income):</span>
                  <span className="font-mono font-bold text-emerald-700">SAR {selectedInvoice.marginSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="p-4 bg-[#0e2c4c] text-white rounded-xl space-y-2">
                <h4 className="text-xs font-bold text-[#c9a227] uppercase tracking-wide">Receivable & PKR Equivalent</h4>
                <div className="flex justify-between text-slate-300">
                  <span>Total Receivable (SAR):</span>
                  <span className="font-mono font-bold text-white">SAR {selectedInvoice.sellingTotalSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Exchange Rate:</span>
                  <span className="font-mono text-white">1 SAR = {selectedInvoice.exchangeRate} PKR</span>
                </div>
                <div className="flex justify-between text-slate-200 border-t border-white/20 pt-1.5 font-bold">
                  <span>Total Equivalent (PKR):</span>
                  <span className="font-mono text-[#c9a227] text-sm">PKR {selectedInvoice.totalsPKR.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 italic text-center pt-2">
              Note: Payments against this invoice are received via Accounts (Payments) and updated automatically.
            </div>
          </div>
        )}
      </Modal>

      {/* Mark Commission Paid Modal (Owner picks Cash/Bank account) */}
      <Modal
        isOpen={commissionModalOpen}
        onClose={() => setCommissionModalOpen(false)}
        title={`Mark Commission Paid for Invoice #${invoiceForCommission?.invoiceNo}`}
        subtitle="Select Cash or Bank payment account to post Dr Commission Expense / Cr Cash-or-Bank"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCommissionModalOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmMarkCommissionPaid}
              loading={commissionPaying}
              className="bg-[#0e2c4c] hover:bg-[#1a4473] text-white font-bold"
            >
              Post & Mark Paid
            </Button>
          </div>
        }
      >
        {invoiceForCommission && invoiceForCommission.commission && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-500 uppercase text-[10px] font-bold block">Commission Recipient:</span>
              <strong className="text-slate-900 text-sm">{invoiceForCommission.commission.recipientName} ({invoiceForCommission.commission.contactNumber})</strong>
              <div className="font-mono text-[#c9a227] font-bold mt-1">Amount: SAR {invoiceForCommission.commission.amountSAR.toLocaleString()}</div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Select Source Cash or Bank Account *
              </label>
              <select
                value={selectedPaymentAccountId}
                onChange={(e) => setSelectedPaymentAccountId(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none"
              >
                <option value="">-- Select Cash Till / Bank Account --</option>
                {cashOrBankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.title} ({acc.accountCode})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                This will automatically post a double-entry transaction: <strong>Dr Commission Expense</strong> / <strong>Cr Selected Cash/Bank Account</strong>.
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
