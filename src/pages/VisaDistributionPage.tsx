import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileCheck, 
  Users, 
  Building2, 
  DollarSign, 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  AlertCircle, 
  ShieldAlert, 
  Search, 
  ArrowRight,
  TrendingUp,
  Receipt
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { fetchVisas, VisaDoc } from '../services/visaService';
import { fetchVendors } from '../services/masterService';
import { fetchLedgerAccounts } from '../services/accountingService';
import { createVisaDistributionBatch } from '../services/visaDistributionService';
import { fetchAgents } from '../services/agentService';
import { getCurrentRate } from '../services/exchangeRateService';
import { AgentDoc } from '../types/agent';
import { VendorDoc } from '../types/master';
import { LedgerAccountDoc } from '../types/accounting';
import { useNavigate } from 'react-router-dom';

interface GroupedVisaBatch {
  groupCode: string;
  groupName: string;
  visas: VisaDoc[];
  visaCount: number;
  sampleNames: string;
  dateRange: string;
}

interface GroupSelectionData {
  agentId: string;
  sellingPricePerVisa: number;
  commissionEnabled?: boolean;
  commissionRecipientName?: string;
  commissionContactNumber?: string;
  commissionAmountSAR?: number;
}

export const VisaDistributionPage: React.FC = () => {
  const { userProfile } = useAuth();
  const { profile: company } = useCompany();
  const { success, error: showError, info } = useToast();
  const useNavigateInstance = useNavigate();

  const canCreate = useCan('Visas', 'create');

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [visas, setVisas] = useState<VisaDoc[]>([]);
  const [vendors, setVendors] = useState<VendorDoc[]>([]);
  const [agents, setAgents] = useState<LedgerAccountDoc[]>([]);
  const [agentMasters, setAgentMasters] = useState<AgentDoc[]>([]);
  // Fix #29: manually entered SAR->PKR rate per agent (keyed by agent ledger account id)
  const [agentRates, setAgentRates] = useState<Map<string, number>>(new Map());

  // Batch header fields
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [buyingPrice, setBuyingPrice] = useState<number>(0);
  const [distributionDate, setDistributionDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Per group distribution mapping
  const [groupSelections, setGroupSelections] = useState<Map<string, GroupSelectionData>>(new Map());

  // Expanded groups accordion state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    try {
      const [vList, vndList, accList, agList] = await Promise.all([
        fetchVisas(),
        fetchVendors(),
        fetchLedgerAccounts(),
        fetchAgents(),
      ]);

      setVisas(vList);
      setVendors(vndList.filter(v => v.isActive));
      setAgents(accList.filter(a => a.accountType === 'agent' || a.accountCode.startsWith('AGT')));
      setAgentMasters(agList);
    } catch {
      showError('Failed to load undistributed visas and master lists.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter undistributed visas
  const undistributedVisas = useMemo(() => {
    return visas.filter((v) => v.status !== 'Distributed');
  }, [visas]);

  // Group undistributed visas by Group Code
  const groupedVisas: GroupedVisaBatch[] = useMemo(() => {
    const map = new Map<string, VisaDoc[]>();
    undistributedVisas.forEach((v) => {
      const code = v.groupCode || 'GRP-DEFAULT';
      const list = map.get(code) || [];
      list.push(v);
      map.set(code, list);
    });

    const result: GroupedVisaBatch[] = [];
    map.forEach((gVisas, code) => {
      const names = gVisas.slice(0, 3).map(v => v.pilgrimName).join(', ');
      const dates = gVisas.map(v => v.createdAt?.split('T')[0] || '').filter(Boolean).sort();
      const dateRange = dates.length > 0 ? `${dates[0]} to ${dates[dates.length - 1]}` : 'Recent';

      result.push({
        groupCode: code,
        groupName: `Umrah Group ${code}`,
        visas: gVisas,
        visaCount: gVisas.length,
        sampleNames: gVisas.length > 3 ? `${names} +${gVisas.length - 3} more` : names,
        dateRange,
      });
    });

    return result;
  }, [undistributedVisas]);

  // Update selection for a group
  const handleGroupSelectionChange = (groupCode: string, field: keyof GroupSelectionData, value: any) => {
    const current = groupSelections.get(groupCode) || { agentId: '', sellingPricePerVisa: 0, commissionEnabled: false };
    const updated = new Map(groupSelections);
    updated.set(groupCode, {
      ...current,
      [field]: value,
    });
    setGroupSelections(updated);
  };

  const toggleExpandGroup = (code: string) => {
    const next = new Set(expandedGroups);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
    }
    setExpandedGroups(next);
  };

  // Fix #29: effective SAR->PKR rate for an agent — manual entry wins, then the
  // agent master's own rate, then the global Exchange Rate Master as last resort.
  const rateForAgent = (agentLedgerAccountId: string): number => {
    const manual = agentRates.get(agentLedgerAccountId);
    if (manual && manual > 0) return manual;
    const ledgerAcc = agents.find(a => a.id === agentLedgerAccountId) as any;
    const master = agentMasters.find(m => m.id === ledgerAcc?.linkedId || m.id === ledgerAcc?.linkedAgentId);
    if (master?.exchangeRatePKRRate && master.exchangeRatePKRRate > 0) return master.exchangeRatePKRRate;
    return getCurrentRate('SAR-PKR');
  };

  const handleAgentRateChange = (agentLedgerAccountId: string, value: number) => {
    const updated = new Map(agentRates);
    if (value > 0) updated.set(agentLedgerAccountId, value);
    else updated.delete(agentLedgerAccountId);
    setAgentRates(updated);
  };

  // Live Batch Summary Calculations
  const activeSelectedGroups = useMemo(() => {
    const list: Array<{
      groupCode: string;
      groupName: string;
      agentId: string;
      sellingPricePerVisa: number;
      visaIds: string[];
      visaCount: number;
      exchangeRateSARPKR: number;
      commission?: { enabled: boolean; recipientName: string; contactNumber: string; amountSAR: number };
    }> = [];

    groupSelections.forEach((sel, groupCode) => {
      if (sel.agentId && sel.sellingPricePerVisa > 0) {
        const groupObj = groupedVisas.find((g) => g.groupCode === groupCode);
        if (groupObj) {
          list.push({
            groupCode,
            groupName: groupObj.groupName,
            agentId: sel.agentId,
            sellingPricePerVisa: sel.sellingPricePerVisa,
            visaIds: groupObj.visas.map(v => v.id),
            visaCount: groupObj.visaCount,
            exchangeRateSARPKR: rateForAgent(sel.agentId),
            commission: sel.commissionEnabled ? {
              enabled: true,
              recipientName: sel.commissionRecipientName || '',
              contactNumber: sel.commissionContactNumber || '',
              amountSAR: sel.commissionAmountSAR || 0,
            } : undefined,
          });
        }
      }
    });
    return list;
  }, [groupSelections, groupedVisas, agentRates, agentMasters, agents]);

  const summary = useMemo(() => {
    let totalVisas = 0;
    let totalBuying = 0;
    let totalSelling = 0;
    const agentTotals = new Map<string, { agentId: string; selling: number; buying: number; visas: number; name: string }>();

    activeSelectedGroups.forEach((g) => {
      const vCount = g.visaCount;
      const bCost = vCount * (buyingPrice || 0);
      const sRev = vCount * g.sellingPricePerVisa;

      totalVisas += vCount;
      totalBuying += bCost;
      totalSelling += sRev;

      const agentObj = agents.find(a => a.id === g.agentId);
      const aName = agentObj?.title || 'Selected Agent';

      const aTotal = agentTotals.get(g.agentId) || { agentId: g.agentId, selling: 0, buying: 0, visas: 0, name: aName };
      aTotal.selling += sRev;
      aTotal.buying += bCost;
      aTotal.visas += vCount;
      agentTotals.set(g.agentId, aTotal);
    });

    const margin = totalSelling - totalBuying;

    return {
      totalVisas,
      totalBuying,
      totalSelling,
      margin,
      agentTotals: Array.from(agentTotals.values()),
    };
  }, [activeSelectedGroups, buyingPrice, agents]);

  const canSave = Boolean(
    selectedVendorId &&
    buyingPrice > 0 &&
    activeSelectedGroups.length > 0
  );

  const handleSaveDistribution = async () => {
    if (!canSave) {
      showError('Please select a Shirka Vendor, enter a valid buying price, and assign at least one group to an agent with a selling price.');
      return;
    }

    setSubmitting(true);
    try {
      const agentGroupMap = new Map<string, {
        agentId: string;
        sellingPricePerVisa: number;
        groupCode: string;
        groupName: string;
        visaIds: string[];
        exchangeRateSARPKR: number;
        commission?: { enabled: boolean; recipientName: string; contactNumber: string; amountSAR: number };
      }>();

      activeSelectedGroups.forEach((g) => {
        agentGroupMap.set(`${g.groupCode}-${g.agentId}`, {
          agentId: g.agentId,
          sellingPricePerVisa: g.sellingPricePerVisa,
          groupCode: g.groupCode,
          groupName: g.groupName,
          visaIds: g.visaIds,
          exchangeRateSARPKR: g.exchangeRateSARPKR,
          commission: g.commission,
        });
      });

      await createVisaDistributionBatch({
        vendorId: selectedVendorId,
        buyingPricePerVisa: buyingPrice,
        agentGroupMap,
        date: distributionDate,
        createdBy: userProfile?.name || 'Operator',
      });

      success(`Visa distribution batch saved successfully. Sales invoices generated.`);
      useNavigateInstance('/visas/invoices');
    } catch (err: any) {
      showError(err.message || 'Failed to complete visa distribution.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visa Stock Distribution"
        subtitle="Manual distribution of imported visa stock grouped by Group Code with optional commission box."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Visas', href: '/visas' },
          { label: 'Distribution' }
        ]}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => useNavigateInstance('/visas/invoices')}
          >
            View Generated Invoices →
          </Button>
        }
      />

      {/* STEP 1: Top Batch Parameters (Vendor & Buying Price) */}
      <Card padding="md" className="border-slate-200 shadow-xs space-y-4 bg-slate-50/50">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#0e2c4c]" />
            <span>Step 1: Source Shirka Vendor & Buying Cost</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">Mandatory for batch cost calculation</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Shirka / Vendor Source *
            </label>
            <select
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              required
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none"
            >
              <option value="">-- Select Shirka Vendor --</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.city}, {v.country})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Buying Price Per Visa (SAR) *
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={buyingPrice || ''}
              onChange={(e) => setBuyingPrice(parseFloat(e.target.value) || 0)}
              placeholder="e.g. 350"
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Distribution Date *
            </label>
            <input
              type="date"
              value={distributionDate}
              onChange={(e) => setDistributionDate(e.target.value)}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900"
            />
          </div>
        </div>
      </Card>

      {/* STEP 2: Group Assignment Checklist & Optional Commission Box */}
      <Card padding="md" className="border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0e2c4c]" />
            <span>Step 2: Assign Undistributed Groups to B2B Agents & Add Optional Commission</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">
            {groupedVisas.length} Available Group Batches ({undistributedVisas.length} total visas)
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading undistributed visa batches...</div>
        ) : groupedVisas.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs space-y-2">
            <p className="font-bold text-slate-700">No undistributed visas available in inventory.</p>
            <p>Upload a Nusuk Excel batch or register new visa applications to begin distribution.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedVisas.map((group) => {
              const selection = groupSelections.get(group.groupCode) || { agentId: '', sellingPricePerVisa: 0, commissionEnabled: false };
              const isExpanded = expandedGroups.has(group.groupCode);

              return (
                <div key={group.groupCode} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 transition hover:bg-slate-100/50">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => toggleExpandGroup(group.groupCode)}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded transition"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#0e2c4c] text-sm">{group.groupCode}</span>
                          <Badge variant="navy" size="sm">{group.visaCount} Visas</Badge>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Applicants: <span className="font-medium">{group.sampleNames}</span> • Issued: {group.dateRange}
                        </p>
                      </div>
                    </div>

                    {/* Assignment Controls */}
                    <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                      <div className="w-full sm:w-56">
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Assign B2B Agent *</label>
                        <select
                          value={selection.agentId}
                          onChange={(e) => handleGroupSelectionChange(group.groupCode, 'agentId', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none"
                        >
                          <option value="">-- Select Agent (No Auto-Fill) --</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>{a.title} ({a.accountCode})</option>
                          ))}
                        </select>
                      </div>

                      <div className="w-full sm:w-36">
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Selling Price / Visa *</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={selection.sellingPricePerVisa || ''}
                          onChange={(e) => handleGroupSelectionChange(group.groupCode, 'sellingPricePerVisa', parseFloat(e.target.value) || 0)}
                          placeholder="SAR 0.00"
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-emerald-700 text-right"
                        />
                      </div>

                      <div className="text-right pt-4 sm:pt-0">
                        <span className="text-[10px] text-slate-400 block uppercase">Group Total</span>
                        <strong className="font-mono text-xs text-slate-900">
                          SAR {(group.visaCount * selection.sellingPricePerVisa).toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Optional Commission Box */}
                  <div className="pt-2 border-t border-slate-200/60">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800">
                      <input
                        type="checkbox"
                        checked={Boolean(selection.commissionEnabled)}
                        onChange={(e) => handleGroupSelectionChange(group.groupCode, 'commissionEnabled', e.target.checked)}
                        className="rounded text-[#0e2c4c] focus:ring-0"
                      />
                      <span>Add optional commission for this distribution</span>
                    </label>

                    {selection.commissionEnabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 p-3 bg-white border border-slate-200 rounded-xl">
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Commission Recipient Name</label>
                          <input
                            type="text"
                            value={selection.commissionRecipientName || ''}
                            onChange={(e) => handleGroupSelectionChange(group.groupCode, 'commissionRecipientName', e.target.value)}
                            placeholder="e.g. Sub-Agent / Rep"
                            className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Contact Number</label>
                          <input
                            type="text"
                            value={selection.commissionContactNumber || ''}
                            onChange={(e) => handleGroupSelectionChange(group.groupCode, 'commissionContactNumber', e.target.value)}
                            placeholder="e.g. +923001234567"
                            className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Commission Amount (SAR)</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={selection.commissionAmountSAR || ''}
                            onChange={(e) => handleGroupSelectionChange(group.groupCode, 'commissionAmountSAR', parseFloat(e.target.value) || 0)}
                            placeholder="e.g. 500"
                            className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-[#c9a227]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded Pilgrim Manifest */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-slate-200 bg-slate-50 p-3 rounded-lg">
                      <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Pilgrim Manifest for {group.groupCode} ({group.visaCount} Applicants)
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {group.visas.map((v) => (
                          <div key={v.id} className="p-2 bg-white border border-slate-200 rounded text-xs flex items-center justify-between">
                            <div>
                              <div className="font-bold text-slate-900">{v.pilgrimName}</div>
                              <div className="font-mono text-[10px] text-slate-500">{v.passportNumber} • {v.nationality}</div>
                            </div>
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">
                              Ready
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* STEP 3: Live Batch Summary Panel & Per-Agent Totals Breakdown */}
      <Card padding="md" className="border-slate-200 shadow-xs bg-[#0e2c4c] text-white space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 className="text-xs font-bold text-[#c9a227] uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            <span>Step 3: Live Batch Financial Summary & Expected Margin</span>
          </h3>
          <span className="text-[11px] text-slate-300">
            Selected Visas: <strong>{summary.totalVisas}</strong> / {undistributedVisas.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/10 p-3 rounded-xl border border-white/10">
            <span className="text-[10px] text-slate-300 uppercase font-bold block">Total Buying Cost (Shirka)</span>
            <div className="text-xl font-mono font-bold text-rose-300 mt-1">
              SAR {summary.totalBuying.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400">Payable to Shirka Vendor</span>
          </div>

          <div className="bg-white/10 p-3 rounded-xl border border-white/10">
            <span className="text-[10px] text-slate-300 uppercase font-bold block">Total Selling Revenue (Agents)</span>
            <div className="text-xl font-mono font-bold text-emerald-300 mt-1">
              SAR {summary.totalSelling.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400">Receivable from B2B Agents</span>
          </div>

          <div className="bg-white/10 p-3 rounded-xl border border-white/10">
            <span className="text-[10px] text-slate-300 uppercase font-bold block">Expected Gross Margin</span>
            <div className="text-xl font-mono font-bold text-[#c9a227] mt-1">
              SAR {summary.margin.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-slate-400">Company Income (Selling − Buying)</span>
          </div>
        </div>

        {/* Per-Agent Totals Breakdown */}
        {summary.agentTotals.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#c9a227] block">Per-Agent Distribution Breakdown</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {summary.agentTotals.map((at, idx) => (
                <div key={idx} className="bg-white/10 p-2.5 rounded-lg border border-white/10 text-xs space-y-1">
                  <div className="font-bold text-white">{at.name}</div>
                  <div className="flex items-center justify-between font-mono text-slate-300 text-[11px]">
                    <span>Assigned Visas:</span>
                    <strong className="text-[#c9a227]">{at.visas} Pax</strong>
                  </div>
                  <div className="flex items-center justify-between font-mono text-slate-300 text-[11px]">
                    <span>Total Selling:</span>
                    <strong className="text-emerald-300">SAR {at.selling.toLocaleString()}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Rate SAR→PKR *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rateForAgent(at.agentId) || ''}
                      onChange={(e) => handleAgentRateChange(at.agentId, parseFloat(e.target.value) || 0)}
                      title="Manually entered exchange rate for this agent's invoice"
                      className="w-24 p-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-mono font-bold text-[#c9a227] text-right focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between font-mono text-slate-300 text-[11px]">
                    <span>Total PKR:</span>
                    <strong className="text-slate-100">{Math.round(at.selling * rateForAgent(at.agentId)).toLocaleString()}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            variant="primary"
            size="lg"
            onClick={handleSaveDistribution}
            disabled={!canSave || submitting}
            loading={submitting}
            className="w-full sm:w-auto bg-[#c9a227] hover:bg-[#b08d20] text-slate-950 font-bold"
          >
            Save Distribution & Generate Invoices →
          </Button>
        </div>
      </Card>
    </div>
  );
};
