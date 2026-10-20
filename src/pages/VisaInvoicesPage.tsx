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
  Scale,
  Pencil
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { DeleteConfirmModal } from '../components/accounting/DeleteConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { useDeepOpen } from '../hooks/useDeepOpen';
import { fetchVisaInvoices, markCommissionPaid, backfillInvoiceShirkaIds, getVVEditData, updateVisaInvoiceRates, voidVisaInvoice, deleteVisaInvoice, VVEditGroup } from '../services/visaDistributionService';
import { PACKAGE_TYPES } from '../types/visaDistribution';
import { fetchVendors } from '../services/masterService';
import { fetchLedgerAccounts } from '../services/accountingService';
import { VisaInvoiceDoc } from '../types/visaDistribution';
import { VendorDoc } from '../types/master';
import { LedgerAccountDoc } from '../types/accounting';
import { useNavigate } from 'react-router-dom';
import { getBuyRate, getSellRate } from '../services/exchangeRateService';

export const VisaInvoicesPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { profile: company } = useCompany();
  const { success, error: showError, info } = useToast();
  const navigate = useNavigate();

  const isOwner = role === 'owner';
  const canView = useCan('Visas', 'view') || isOwner;
  // VV edit: owner always; staff only if owner granted Visas edit access
  const canEditVV = useCan('Visas', 'edit');
  // VV delete: Owner only, never Staff/Agent
  const canDeleteVV = role === 'owner';

  const [loading, setLoading] = useState<boolean>(true);
  const [invoices, setInvoices] = useState<VisaInvoiceDoc[]>([]);
  const [agents, setAgents] = useState<LedgerAccountDoc[]>([]);
  const [agentDocs, setAgentDocs] = useState<any[]>([]);
  const [vendors, setVendors] = useState<VendorDoc[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccountDoc[]>([]);

  // Filter states
  const [search, setSearch] = useState<string>('');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<string>('invoiceNo');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Selected VV for Detail / Print Modal
  const [selectedInvoice, setSelectedInvoice] = useState<VisaInvoiceDoc | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);

  // Deep link: ?open=<vvNo> opens the exact VV record
  useDeepOpen(invoices, (inv, ref) => inv.invoiceNo === ref, (inv) => {
    setSelectedInvoice(inv);
    setDetailModalOpen(true);
  });

  // Commission mark-paid modal state
  const [commissionModalOpen, setCommissionModalOpen] = useState<boolean>(false);
  const [invoiceForCommission, setInvoiceForCommission] = useState<VisaInvoiceDoc | null>(null);
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState<string>('');
  const [commissionPaying, setCommissionPaying] = useState<boolean>(false);

  // VV Edit state (owner or staff with Visas edit access)
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editInvoice, setEditInvoice] = useState<VisaInvoiceDoc | null>(null);
  const [editGroups, setEditGroups] = useState<VVEditGroup[]>([]);
  const [editDate, setEditDate] = useState<string>('');
  const [editBuyROE, setEditBuyROE] = useState<number>(0);
  const [editSellROE, setEditSellROE] = useState<number>(0);
  const [editAgentId, setEditAgentId] = useState<string>('');
  const [editVendorId, setEditVendorId] = useState<string>('');
  const [editSaving, setEditSaving] = useState<boolean>(false);
  const [editLoading, setEditLoading] = useState<boolean>(false);
  const [deleteTarget, setDeleteTarget] = useState<VisaInvoiceDoc | null>(null);
  const [deletingVV, setDeletingVV] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invList, accList, vndList] = await Promise.all([
        fetchVisaInvoices(),
        fetchLedgerAccounts(),
        fetchVendors(),
      ]);

      setInvoices(invList);
      setAgents(accList.filter(a => a.accountType === 'agent' || a.accountCode.startsWith('AGT')));
      setLedgerAccounts(accList);
      setVendors(vndList);
    } catch {
      showError('Failed to load VV documents.');
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

  // Filtered + sorted VV documents
  const filteredInvoices = useMemo(() => {
    const list = invoices.filter((inv) => {
      if (agentFilter !== 'all' && inv.agentId !== agentFilter) return false;
      if (vendorFilter !== 'all' && inv.vendorId !== vendorFilter) return false;
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
    const num = (v: any) => Number(v) || 0;
    const keyOf = (inv: VisaInvoiceDoc): any => {
      switch (sortKey) {
        case 'date': return inv.date || '';
        case 'agent': return (agentMap.get(inv.agentId)?.title || '').toLowerCase();
        case 'vendor': return (vendorMap.get(inv.vendorId)?.name || '').toLowerCase();
        case 'selling': return num(inv.sellingTotalSAR);
        case 'buying': return num(inv.buyingTotalSAR);
        case 'margin': return num(inv.marginSAR);
        case 'totalPKR': return num(inv.totalsPKR);
        default: return inv.invoiceNo || '';
      }
    };
    list.sort((a, b) => {
      const ka = keyOf(a); const kb = keyOf(b);
      const cmp = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [invoices, agentFilter, vendorFilter, startDate, endDate, search, agentMap, vendorMap, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'invoiceNo' || key === 'date' ? 'desc' : 'asc');
    }
  };
  const sortArrow = (key: string) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  // Total VV value (selling) — voided VVs excluded; coerce to Number (old docs
  // may store totals as strings, which would concatenate instead of adding)
  const totalVVSAR = useMemo(() => {
    return invoices.reduce((sum, inv) => sum + (inv.isVoid ? 0 : Number(inv.sellingTotalSAR) || 0), 0);
  }, [invoices]);

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

  const handleOpenEdit = async (inv: VisaInvoiceDoc) => {
    if (!canEditVV) {
      showError('Only the Owner (or staff with VV edit access) can edit a VV.');
      return;
    }
    setEditLoading(true);
    setEditInvoice(inv);
    setEditModalOpen(true);
    try {
      const { fetchAgents } = await import('../services/agentService');
      setAgentDocs(await fetchAgents().catch(() => []));
      const { groups } = await getVVEditData(inv.id);
      setEditGroups(groups);
      setEditDate(inv.date);
      // Dual ROE prefill. A stored rate of 1 (or less) is never a real
      // SAR→PKR rate — it means the VV was created before dual ROE was
      // wired, so fall back to the Settings rates for a one-save repair.
      setEditSellROE((inv as any).sellROE > 1 ? (inv as any).sellROE : (inv.exchangeRate > 1 ? inv.exchangeRate : getSellRate()));
      setEditBuyROE((inv as any).buyROE > 1 ? (inv as any).buyROE : getBuyRate());
      setEditAgentId(inv.agentId || '');
      setEditVendorId(inv.vendorId || '');
    } catch (err: any) {
      showError(err.message || 'Failed to load VV for editing.');
      setEditModalOpen(false);
      setEditInvoice(null);
    } finally {
      setEditLoading(false);
    }
  };

  const updateEditGroup = (code: string, field: 'sellingPricePerVisa' | 'buyingPricePerVisa' | 'packageType', value: any) => {
    setEditGroups((prev) => prev.map((g) => (g.groupCode === code ? { ...g, [field]: value } : g)));
  };

  const editTotals = useMemo(() => {
    let sell = 0, buy = 0;
    editGroups.forEach((g) => {
      sell += g.visaCount * (g.sellingPricePerVisa || 0);
      buy += g.visaCount * (g.buyingPricePerVisa || 0);
    });
    return { sell, buy, margin: sell - buy };
  }, [editGroups]);

  const handleSaveEdit = async () => {
    if (!editInvoice || !canEditVV) return;
    if (!editDate) {
      showError('Please select a date.');
      return;
    }
    if (!(editSellROE > 0) || !(editBuyROE > 0)) {
      showError('Please enter valid Buying and Selling ROE values.');
      return;
    }
    for (const g of editGroups) {
      if (!(g.sellingPricePerVisa > 0)) {
        showError(`Selling rate for group ${g.groupCode} must be greater than zero.`);
        return;
      }
      if (!(g.buyingPricePerVisa >= 0)) {
        showError(`Buying rate for group ${g.groupCode} cannot be negative.`);
        return;
      }
    }
    const confirmed = window.confirm(
      `Update VV ${editInvoice.invoiceNo}?\n\nNew totals: Selling SAR ${editTotals.sell.toLocaleString()}, Buying SAR ${editTotals.buy.toLocaleString()}, Margin SAR ${editTotals.margin.toLocaleString()}.\n\nOld ledger legs will be voided and fresh legs posted under the same VV number.`
    );
    if (!confirmed) return;
    setEditSaving(true);
    try {
      const updated = await updateVisaInvoiceRates(editInvoice.id, {
        date: editDate,
        exchangeRate: editSellROE,
        buyROE: editBuyROE,
        sellROE: editSellROE,
        agentId: editAgentId || editInvoice.agentId,
        vendorId: editVendorId || editInvoice.vendorId,
        groups: editGroups,
        editedBy: userProfile?.name || 'Owner',
      });
      success(`VV ${updated.invoiceNo} updated — Selling SAR ${updated.sellingTotalSAR.toLocaleString()}, Margin SAR ${updated.marginSAR.toLocaleString()}.`);
      setEditModalOpen(false);
      setEditInvoice(null);
      setDetailModalOpen(false);
      setSelectedInvoice(null);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to update VV.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleVoidVV = async () => {
    if (!selectedInvoice || !canEditVV || selectedInvoice.isVoid) return;
    const reason = window.prompt(`Void VV ${selectedInvoice.invoiceNo}? Enter reason (e.g. duplicate visa):`);
    if (!reason || !reason.trim()) return;
    const confirmed = window.confirm(
      `Void VV ${selectedInvoice.invoiceNo} (SAR ${selectedInvoice.sellingTotalSAR.toLocaleString()})?\n\nIts ledger legs will be voided. The VV stays in the list as Voided for audit. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await voidVisaInvoice(selectedInvoice.id, reason.trim(), userProfile?.name || 'Owner');
      success(`VV ${selectedInvoice.invoiceNo} voided.`);
      setDetailModalOpen(false);
      setSelectedInvoice(null);
      await loadData();
    } catch (err: any) {
      showError(err.message || 'Failed to void VV.');
    }
  };
  const handleDeleteVV = async () => {
    if (!deleteTarget || !userProfile) return;
    setDeletingVV(true);
    try {
      await deleteVisaInvoice(deleteTarget.id, userProfile);
      success(`VV ${deleteTarget.invoiceNo} deleted.`);
      setDeleteTarget(null);
      setSelectedInvoice(null);
      setDetailModalOpen(false);
      await loadData();
    } catch (e: any) {
      showError(e.message || 'Failed to delete VV.');
    } finally {
      setDeletingVV(false);
    }
  };


  const handleConfirmMarkCommissionPaid = async () => {
    if (!invoiceForCommission || !selectedPaymentAccountId || !userProfile) {
      showError('Please select a valid cash or bank payment account.');
      return;
    }

    setCommissionPaying(true);
    try {
      await markCommissionPaid(userProfile, invoiceForCommission.id, selectedPaymentAccountId);
      success(`Commission for VV #${invoiceForCommission.invoiceNo} marked as Paid. Ledger posted.`);
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
        title="VV — Visa Vouchers & B2B Balances"
        subtitle="VV documents generated automatically from visa distributions, with optional commission tracking and double-entry postings."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Visas', href: '/visas' },
          { label: 'VV' }
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
              onClick={() => success('VV documents exported to CSV.')}
            >
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!confirm('Update old VV documents with Sub-Vendor info from their distributions?')) return;
                try {
                  const count = await backfillInvoiceShirkaIds();
                  if (count > 0) {
                    success(`Updated ${count} old VV document(s) with Sub-Vendor!`);
                    window.location.reload();
                  } else {
                    info('All VV documents already have Sub-Vendor info.');
                  }
                } catch (e: any) {
                  showError(e.message || 'Migration failed');
                }
              }}
              title="One-time: copy Sub-Vendor from distributions to old VV documents"
            >
              Fix Old VV
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <Card padding="md" className="border-slate-200">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total VV Generated</span>
          <div className="text-2xl font-mono font-bold text-slate-900 mt-2">{invoices.length}</div>
          <span className="text-[11px] text-slate-500">All-time B2B VV documents</span>
        </Card>

        <Card padding="md" className="border-slate-200">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total VV Value</span>
          <div className="text-2xl font-mono font-bold text-rose-700 mt-2">
            SAR {totalVVSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500">Sum of VV selling totals</span>
        </Card>

        <Card padding="md" className="border-slate-200 bg-[#0e2c4c] text-white">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Dual-Currency Posting</span>
          <div className="text-sm font-semibold text-[#c9a227] mt-2">Double-Entry Audited</div>
          <span className="text-[11px] text-slate-300">Dr Agent • Cr Vendor • Cr Visa Margin Income</span>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card padding="md" className="border-slate-200 shadow-xs space-y-3 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search VV no., agent, vendor..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none"
            />
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

          <div>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">All Sub-Vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
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

      {/* VV Table */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-300">
              <tr>
                <th className="py-3 px-3"><button type="button" onClick={() => toggleSort('invoiceNo')} title="Sort by VV number">VV No.{sortArrow('invoiceNo')}</button></th>
                <th className="py-3 px-3"><button type="button" onClick={() => toggleSort('date')} title="Sort by date">Date{sortArrow('date')}</button></th>
                <th className="py-3 px-3"><button type="button" onClick={() => toggleSort('agent')} title="Sort by agent">B2B Agent{sortArrow('agent')}</button></th>
                <th className="py-3 px-3"><button type="button" onClick={() => toggleSort('vendor')} title="Sort by sub-vendor">Sub-Vendor{sortArrow('vendor')}</button></th>
                <th className="py-3 px-3 text-right"><button type="button" onClick={() => toggleSort('selling')} title="Sort by selling total">Selling (SAR){sortArrow('selling')}</button></th>
                <th className="py-3 px-3 text-right"><button type="button" onClick={() => toggleSort('buying')} title="Sort by buying total">Buying (SAR){sortArrow('buying')}</button></th>
                <th className="py-3 px-3 text-right"><button type="button" onClick={() => toggleSort('margin')} title="Sort by margin">Margin (SAR){sortArrow('margin')}</button></th>
                <th className="py-3 px-3 text-right"><button type="button" onClick={() => toggleSort('totalPKR')} title="Sort by total PKR">Total (PKR){sortArrow('totalPKR')}</button></th>
                <th className="py-3 px-3 text-center">Commission</th>
                <th className="py-3 px-3 text-center print:hidden">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500">
                    Loading VV documents...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    No VV documents found. Complete a visa distribution batch to generate VV documents.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv, idx) => {
                  const agentObj = agentMap.get(inv.agentId);
                  const vendorObj = vendorMap.get(inv.vendorId);
                  const hasComm = inv.commission?.enabled;
                  const commPaid = inv.commission?.status === 'Paid';

                  return (
                    <tr
                      key={inv.id || idx}
                      onClick={() => handleOpenDetail(inv)}
                      className={`cursor-pointer transition ${inv.isVoid ? 'bg-rose-50/40 opacity-70' : 'hover:bg-slate-50'}`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--theme-primary)] whitespace-nowrap">
                        {inv.invoiceNo}
                        {inv.isVoid && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] font-bold uppercase bg-rose-100 text-rose-700 rounded">Voided</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {inv.date}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{agentObj?.title || 'Unknown Agent'}</div>
                        <div className="text-[10px] font-mono text-slate-500">[{agentObj?.accountCode}]</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900">{vendorObj?.name || 'Sub-Vendor'}</div>
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
                      <td className="py-2.5 px-3 text-center whitespace-nowrap print:hidden">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--theme-primary)] hover:underline">
                          <span>View VV</span>
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

      {/* VV Detail / Print Modal */}
      <Modal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`VV #${selectedInvoice?.invoiceNo}`}
        subtitle="Official dual-currency VV record and double-entry ledger audit"
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
              {canEditVV && !selectedInvoice?.isVoid && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Pencil className="w-4 h-4 text-[var(--theme-primary)]" />}
                  onClick={() => selectedInvoice && handleOpenEdit(selectedInvoice)}
                >
                  Edit VV
                </Button>
              )}
              {canEditVV && !selectedInvoice?.isVoid && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-rose-700 border-rose-300 hover:bg-rose-50"
                  leftIcon={<Ban className="w-4 h-4" />}
                  onClick={handleVoidVV}
                >
                  Void VV
                </Button>
              )}
              {canDeleteVV && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => selectedInvoice && setDeleteTarget(selectedInvoice)}
                >
                  Delete
                </Button>
              )}
              {selectedInvoice?.isVoid && (
                <Badge variant="danger" size="sm">Voided{selectedInvoice.voidReason ? ` — ${selectedInvoice.voidReason}` : ''}</Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Printer className="w-4 h-4 text-[var(--theme-primary)]" />}
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
                <h1 className="text-xl font-black text-[var(--theme-primary)] tracking-tight">{company.companyName}</h1>
                <p className="text-xs text-slate-700 font-semibold">{company.legalName || 'Hajj & Umrah Tour Operations'}</p>
                <p className="text-[11px] text-slate-500">{company.address}, {company.city} • Tel: {company.phone} • Email: {company.email}</p>
              </div>
              <div className="text-right">
                <span className="inline-block bg-[#0e2c4c] text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider">
                  VV
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
                <strong className="text-sm text-slate-900">{agentMap.get(selectedInvoice.agentId)?.title || 'Agent'}</strong>
                <div className="font-mono text-xs text-slate-600">Code: {agentMap.get(selectedInvoice.agentId)?.accountCode}</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Source Sub-Vendor:</span>
                <strong className="text-slate-900">{(() => {
                  const vendor = vendorMap.get(selectedInvoice.vendorId);
                  if (selectedInvoice.shirkaId && vendor?.shirkas) {
                    const sub = vendor.shirkas.find(s => s.id === selectedInvoice.shirkaId);
                    if (sub) return sub.name;
                  }
                  return vendor?.name || 'Sub-Vendor';
                })()}</strong>
                <div className="text-[11px] text-slate-500">{vendorMap.get(selectedInvoice.vendorId)?.city}, {vendorMap.get(selectedInvoice.vendorId)?.country}</div>
                <div className="text-[11px] font-mono text-slate-600 mt-1">Payable Rate (Buying): 1 SAR = {(selectedInvoice as any).buyROE || selectedInvoice.exchangeRate} PKR</div>
                <div className="text-[11px] font-mono text-slate-600">Receivable Rate (Selling): 1 SAR = {(selectedInvoice as any).sellROE || selectedInvoice.exchangeRate} PKR</div>
              </div>
            </div>

            {/* PAX-wise Lines Table — one row per pilgrim on the single VV */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-10">#</th>
                    <th className="py-2.5 px-3">Pilgrim Name</th>
                    <th className="py-2.5 px-3">Passport No</th>
                    <th className="py-2.5 px-3">Group</th>
                    <th className="py-2.5 px-3 text-right">Rate (SAR)</th>
                    <th className="py-2.5 px-3 text-right">Total (SAR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {selectedInvoice.lines.map((l, i) => {
                    // Legacy fallback: old group-shaped lines (no pilgrimName)
                    const isLegacy = !(l as any).pilgrimName;
                    return (
                      <tr key={i}>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500">{i + 1}</td>
                        {isLegacy ? (
                          <>
                            <td className="py-2.5 px-3" colSpan={2}>
                              <span className="font-mono font-bold text-[var(--theme-primary)] mr-2">[{(l as any).groupCode}]</span>
                              <span className="font-medium text-slate-900">{(l as any).groupName} — {(l as any).visaCount} visas</span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2.5 px-3 font-semibold text-slate-900">{(l as any).pilgrimName}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-600">{(l as any).passportNumber}</td>
                          </>
                        )}
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-[var(--theme-primary)]">{l.groupCode}</span>
                          {l.groupName && l.groupName !== l.groupCode && (
                            <span className="block text-[10px] text-slate-500">{l.groupName}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">SAR {l.sellingPricePerVisa.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          SAR {l.lineTotalSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
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
                <h4 className="text-xs font-bold text-[#c9a227] uppercase tracking-wide">Totals & PKR Equivalent</h4>
                <div className="flex justify-between text-slate-300">
                  <span>Total (SAR):</span>
                  <span className="font-mono font-bold text-white">SAR {selectedInvoice.sellingTotalSAR.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Payable Rate (Buying):</span>
                  <span className="font-mono text-white">1 SAR = {(selectedInvoice as any).buyROE || selectedInvoice.exchangeRate} PKR</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Receivable Rate (Selling):</span>
                  <span className="font-mono text-white">1 SAR = {(selectedInvoice as any).sellROE || selectedInvoice.exchangeRate} PKR</span>
                </div>
                <div className="flex justify-between text-slate-200 border-t border-white/20 pt-1.5 font-bold">
                  <span>Total Equivalent (PKR):</span>
                  <span className="font-mono text-[#c9a227] text-sm">PKR {selectedInvoice.totalsPKR.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 italic text-center pt-2">
              Note: Payments are recorded separately as payment documents.
            </div>
          </div>
        )}
      </Modal>

      {/* Delete VV (Owner/Staff only) */}
      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => !deletingVV && setDeleteTarget(null)}
        title={`Delete VV ${deleteTarget?.invoiceNo || ''}`}
        recordLabel={deleteTarget ? `VV ${deleteTarget.invoiceNo} • SAR ${(deleteTarget.sellingTotalSAR || 0).toLocaleString()}${deleteTarget.isVoid ? ' (Voided)' : ''}` : ''}
        deleting={deletingVV}
        onConfirm={handleDeleteVV}
      />

      {/* Mark Commission Paid Modal (Owner picks Cash/Bank account) */}
      <Modal
        isOpen={commissionModalOpen}
        onClose={() => setCommissionModalOpen(false)}
        title={`Mark Commission Paid for VV #${invoiceForCommission?.invoiceNo}`}
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

      {/* VV Edit Modal — owner or staff with Visas edit access */}
      {canEditVV && (
        <Modal
          isOpen={editModalOpen}
          onClose={() => { setEditModalOpen(false); setEditInvoice(null); }}
          title={editInvoice ? `Edit VV ${editInvoice.invoiceNo}` : 'Edit VV'}
          subtitle="Each group's rate is changeable — on save, old ledger legs are voided and fresh legs post under the same VV number."
          size="lg"
          footer={
            <div className="flex items-center justify-end gap-2 w-full">
              <Button variant="outline" size="sm" onClick={() => { setEditModalOpen(false); setEditInvoice(null); }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveEdit} loading={editSaving} disabled={editLoading}>
                Save Changes
              </Button>
            </div>
          }
        >
          {editLoading ? (
            <div className="py-10 text-center text-xs text-slate-500">Loading VV details…</div>
          ) : (
            <div className="space-y-4 py-2 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Agent *</label>
                <select
                  value={editAgentId}
                  onChange={(e) => setEditAgentId(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- Select Agent --</option>
                  {agentDocs.map((a: any) => {
                    const label = a.companyName || a.agencyName || a.name || a.contactPerson || a.agentCode || a.id;
                    return (
                      <option key={a.id} value={a.id}>
                        {a.agentCode ? `[${a.agentCode}] ` : ''}{label}
                      </option>
                    );
                  })}
                </select>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Changing the agent moves the receivable to the new agent's ledger.
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Sub-Vendor *</label>
                <select
                  value={editVendorId}
                  onChange={(e) => setEditVendorId(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- Select Sub-Vendor --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Changing the Sub-Vendor moves the payable to the new vendor's ledger and clears the old Sub-Vendor stamp on the visas.
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">VV Date *</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Payable ROE — Buying (1 SAR = ? PKR) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editBuyROE || ''}
                    onChange={(e) => setEditBuyROE(parseFloat(e.target.value) || 0)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5">Vendor payable posts at this rate.</div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Receivable ROE — Selling (1 SAR = ? PKR) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editSellROE || ''}
                    onChange={(e) => setEditSellROE(parseFloat(e.target.value) || 0)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5">Agent receivable and margin post at this rate.</div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">Group</th>
                      <th className="p-2.5 text-center">Visas</th>
                      <th className="p-2.5">Package Type</th>
                      <th className="p-2.5 text-right">Selling / Visa (SAR) *</th>
                      <th className="p-2.5 text-right">Buying / Visa (SAR) *</th>
                      <th className="p-2.5 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {editGroups.map((g) => (
                      <tr key={g.groupCode}>
                        <td className="p-2.5">
                          <div className="font-mono font-bold text-[var(--theme-primary)]">{g.groupCode}</div>
                          <div className="text-[11px] text-slate-500">{g.groupName}</div>
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold">{g.visaCount}</td>
                        <td className="p-2.5">
                          <select
                            value={g.packageType || ''}
                            onChange={(e) => updateEditGroup(g.groupCode, 'packageType', e.target.value)}
                            className="w-32 p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                          >
                            <option value="">-- None --</option>
                            {PACKAGE_TYPES.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number" min="0" step="1"
                            value={g.sellingPricePerVisa || ''}
                            onChange={(e) => updateEditGroup(g.groupCode, 'sellingPricePerVisa', parseFloat(e.target.value) || 0)}
                            className="w-28 p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-emerald-700 text-right"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number" min="0" step="1"
                            value={g.buyingPricePerVisa || ''}
                            onChange={(e) => updateEditGroup(g.groupCode, 'buyingPricePerVisa', parseFloat(e.target.value) || 0)}
                            className="w-28 p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-rose-700 text-right"
                          />
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-700">
                          SAR {(g.visaCount * ((g.sellingPricePerVisa || 0) - (g.buyingPricePerVisa || 0))).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                    <tr>
                      <td className="p-2.5" colSpan={3}>New Totals</td>
                      <td className="p-2.5 text-right font-mono text-emerald-700">SAR {editTotals.sell.toLocaleString()}</td>
                      <td className="p-2.5 text-right font-mono text-rose-700">SAR {editTotals.buy.toLocaleString()}</td>
                      <td className="p-2.5 text-right font-mono">SAR {editTotals.margin.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 rounded-lg p-2">
                On save: the old legs are voided (audit trail preserved) and fresh legs are posted under the same VV number. The agent's receivable, the vendor's payable and the margin will all be updated.
              </p>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};
