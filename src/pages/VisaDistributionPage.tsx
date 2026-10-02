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

  // Batch header fields
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [buyingPrice, setBuyingPrice] = useState<number>(0);
  const [distributionDate, setDistributionDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Per group distribution mapping: groupCode -> { agentId: string (blank by default), sellingPricePerVisa: number }
  const [groupSelections, setGroupSelections] = useState<Map<string, { agentId: string; sellingPricePerVisa: number }>>(new Map());

  // Expanded groups accordion state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    try {
      const [vList, vndList, accList] = await Promise.all([
        fetchVisas(),
        fetchVendors(),
        fetchLedgerAccounts(),
      ]);

      setVisas(vList);
      setVendors(vndList.filter(v => v.isActive));
      // Filter agent accounts
      setAgents(accList.filter(a => a.accountType === 'agent' || a.accountCode.startsWith('AGT')));
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
  const handleGroupSelectionChange = (groupCode: string, field: 'agentId' | 'sellingPricePerVisa', value: any) => {
    const current = groupSelections.get(groupCode) || { agentId: '', sellingPricePerVisa: 0 };
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

  // Live Batch Summary Calculations
  const activeSelectedGroups = useMemo(() => {
    const list: Array<{ groupCode: string; groupName: string; agentId: string; sellingPricePerVisa: number; visaIds: string[]; visaCount: number }> = [];
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
          });
        }
      }
    });
    return list;
  }, [groupSelections, groupedVisas]);

  const summary = useMemo(() => {
    let totalVisas = 0;
    let totalBuying = 0;
    let totalSelling = 0;
    const agentTotals = new Map<string, { selling: number; buying: number; visas: number; name: string }>();

    activeSelectedGroups.forEach((g) => {
      const vCount = g.visaCount;
      const bCost = vCount * (buyingPrice || 0);
      const sRev = vCount * g.sellingPricePerVisa;

      totalVisas += vCount;
      totalBuying += bCost;
      totalSelling += sRev;

      const agentObj = agents.find(a => a.id === g.agentId);
      const aName = agentObj?.title || 'Selected Agent';

      const aTotal = agentTotals.get(g.agentId) || { selling: 0, buying: 0, visas: 0, name: aName };
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
      const agentGroupMap = new Map<string, { agentId: string; sellingPricePerVisa: number; groupCode: string; groupName: string; visaIds: string[] }>();

      activeSelectedGroups.forEach((g) => {
        agentGroupMap.set(`${g.groupCode}-${g.agentId}`, {
          agentId: g.agentId,
          sellingPricePerVisa: g.sellingPricePerVisa,
          groupCode: g.groupCode,
          groupName: g.groupName,
          visaIds: g.visaIds,
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
        subtitle="Manual distribution of imported visa stock grouped by Group Code. The system never auto-selects agents (Rule enforced)."
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
              min="1"
              step="1"
              value={buyingPrice || ''}
              onChange={(e) => setBuyingPrice(parseFloat(e.target.value) || 0)}
              placeholder="e.g. 380"
              required
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-[#0e2c4c]"
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
              required
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
            />
          </div>
        </div>
      </Card>

      {/* STEP 2: Undistributed Visas Grouped by Group Code */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#0e2c4c]" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Undistributed Visa Batches ({groupedVisas.length} Groups • {undistributedVisas.length} Total Visas)
            </h3>
          </div>
          <span className="text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            ⚠ Manual Assignment Required: Nothing is pre-selected
          </span>
        </div>

        {groupedVisas.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            No undistributed visa stock available in inventory. All imported visas have been distributed.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 bg-white">
            {groupedVisas.map((group) => {
              const selection = groupSelections.get(group.groupCode) || { agentId: '', sellingPricePerVisa: 0 };
              const isExpanded = expandedGroups.has(group.groupCode);

              return (
                <div key={group.groupCode} className="p-4 space-y-3 hover:bg-slate-50/50 transition">
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    {/* Group info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[#0e2c4c] bg-navy-50 px-2 py-0.5 rounded border border-navy-100">
                          {group.groupCode}
                        </span>
                        <span className="font-bold text-slate-900">{group.groupName}</span>
                        <Badge variant="navy" size="sm">{group.visaCount} Visas</Badge>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Passengers: <strong>{group.sampleNames}</strong> • Issue Dates: {group.dateRange}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleExpandGroup(group.groupCode)}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer pt-0.5"
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        <span>{isExpanded ? 'Hide Pilgrim Manifest' : `View Pilgrim Manifest (${group.visaCount})`}</span>
                      </button>
                    </div>

                    {/* Manual Agent Assignment & Selling Price */}
                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                      <div className="w-full sm:w-56">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Assign Agent (BLANK by default) *
                        </label>
                        <select
                          value={selection.agentId}
                          onChange={(e) => handleGroupSelectionChange(group.groupCode, 'agentId', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none"
                        >
                          <option value="">-- Choose Agent --</option>
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              [{a.accountCode}] {a.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-full sm:w-36">
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                          Selling Price / Visa *
                        </label>
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

      {/* STEP 3: Live Batch Summary Panel */}
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

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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

          <div className="flex items-center justify-end">
            <Button
              variant="primary"
              size="lg"
              onClick={handleSaveDistribution}
              disabled={!canSave || submitting}
              loading={submitting}
              className="w-full bg-[#c9a227] hover:bg-[#b08d20] text-slate-950 font-bold"
            >
              Save Distribution & Generate Invoices →
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
