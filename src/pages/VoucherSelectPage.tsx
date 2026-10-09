import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, Users } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { InlineLoader } from '../components/ui/BrandedLoader';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { fetchVouchers } from '../services/voucherService';
import { fetchVisas, VisaDoc } from '../services/visaService';
import { fetchAgents } from '../services/agentService';
import { fetchVendors } from '../services/masterService';

/**
 * STEP 1 of voucher creation: select Agent + Shirka + Passengers.
 * The voucher form (/vouchers/new) is only reachable from here —
 * exactly the selected passengers are carried through.
 */
export const VoucherSelectPage: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const { error: showError } = useToast();
  const isAgent = role === 'agent';

  const [loading, setLoading] = useState(true);
  const [availableVisas, setAvailableVisas] = useState<VisaDoc[]>([]);
  const [usedVisaIds, setUsedVisaIds] = useState<Set<string>>(new Set());
  const [agentsList, setAgentsList] = useState<any[]>([]);
  const [vendorsMaster, setVendorsMaster] = useState<any[]>([]);

  const [agentId, setAgentId] = useState('');
  const [shirkaVendorId, setShirkaVendorId] = useState('');
  const [shirkaId, setShirkaId] = useState('');
  const [selectedVisaIds, setSelectedVisaIds] = useState<string[]>([]);
  const [paxSearch, setPaxSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [vList, visaList, aList, vndList] = await Promise.all([
          fetchVouchers(),
          fetchVisas(),
          fetchAgents(),
          fetchVendors(),
        ]);
        const used = new Set<string>();
        vList.forEach((v: any) => (v.visaIds || []).forEach((id: string) => used.add(id)));
        setUsedVisaIds(used);
        setAvailableVisas(visaList);
        setAgentsList(aList);
        setVendorsMaster(vndList || []);
      } catch {
        showError('Failed to load data.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAgent && userProfile?.agentId && !agentId) setAgentId(userProfile.agentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAgent, userProfile]);

  const agentDisplayName = (a: any, fallback = ''): string =>
    (a && (a.companyName || a.name || a.agencyName || a.contactPerson || a.agentCode)) || fallback || (a && a.id) || '';

  const remainingVisas = useMemo(
    () => availableVisas.filter((v) => !usedVisaIds.has(v.id)),
    [availableVisas, usedVisaIds]
  );

  const pendingList = useMemo(() => {
    if (!agentId) return [];
    let list = remainingVisas.filter((v) => (v.agentId || '') === agentId);
    if (shirkaVendorId) {
      list = list.filter((v) => !v.vendorId || (v.vendorId === shirkaVendorId && (v.shirkaId || '') === (shirkaId || '')));
    }
    const q = paxSearch.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (v) => (v.pilgrimName || '').toUpperCase().includes(q) || (v.passportNumber || '').toUpperCase().includes(q)
      );
    }
    return list;
  }, [remainingVisas, agentId, shirkaVendorId, shirkaId, paxSearch]);

  const toggleVisa = (id: string) =>
    setSelectedVisaIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectAll = () => setSelectedVisaIds(pendingList.map((v) => v.id));
  const clearAll = () => setSelectedVisaIds([]);

  const handleContinue = () => {
    if (!agentId) { showError('Please select an Agent first.'); return; }
    if (!shirkaVendorId) { showError('Please select a Shirka.'); return; }
    if (selectedVisaIds.length === 0) { showError('Please select at least one passenger.'); return; }
    navigate('/vouchers/new', {
      state: { preselectedVisaIds: selectedVisaIds, agentId, shirkaVendorId, shirkaId },
    });
  };

  const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1';
  const inputCls = 'w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e2c4c] bg-white';

  return (
    <div className="pb-16">
      <PageHeader title="New Voucher — Select Passengers" subtitle="Step 1: choose agent, shirka and passengers. Step 2 is the voucher form." />

      <div className="px-4 sm:px-6 space-y-4 max-w-5xl mx-auto">
        {loading ? (
          <Card><InlineLoader message="Loading..." /></Card>
        ) : (
          <>
            <div className="bg-[#0e2c4c] rounded-2xl p-4 flex flex-wrap items-center gap-4 shadow">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-white text-[#0e2c4c] font-bold flex items-center justify-center text-sm">1</span>
                <label className="text-white font-bold text-sm tracking-wide">SELECT AGENT *</label>
              </div>
              <select
                value={agentId}
                onChange={(e) => { setAgentId(e.target.value); setSelectedVisaIds([]); }}
                disabled={isAgent}
                className="flex-1 min-w-[220px] bg-white text-slate-900 font-semibold rounded-xl px-4 py-2.5 text-sm outline-none"
              >
                <option value="">-- Select Agent --</option>
                {agentsList.map((a: any) => (
                  <option key={a.id} value={a.id}>{agentDisplayName(a, a.id)}</option>
                ))}
              </select>
            </div>

            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Shirka *</label>
                  <select value={shirkaVendorId} onChange={(e) => { setShirkaVendorId(e.target.value); setShirkaId(''); setSelectedVisaIds([]); }} className={inputCls}>
                    <option value="">-- Select Shirka --</option>
                    {(vendorsMaster || []).filter((v: any) => v.isActive !== false).map((v: any) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Sub-Shirka</label>
                  <select value={shirkaId} onChange={(e) => setShirkaId(e.target.value)} className={inputCls} disabled={!shirkaVendorId}>
                    <option value="">-- None --</option>
                    {((vendorsMaster || []).find((v: any) => v.id === shirkaVendorId)?.shirkas || []).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Search Passport / Name</label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={paxSearch} onChange={(e) => setPaxSearch(e.target.value)} placeholder="Search..." className={`${inputCls} pl-9`} />
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-[#0e2c4c] flex items-center gap-2">
                  <Users className="w-4 h-4" /> Pending Passports
                  {agentId && <span className="text-sm font-semibold text-slate-500">— {agentDisplayName(agentsList.find((x: any) => x.id === agentId), '')}</span>}
                </h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll} disabled={pendingList.length === 0}>Select All</Button>
                  <Button variant="outline" size="sm" onClick={clearAll} disabled={selectedVisaIds.length === 0}>Clear</Button>
                </div>
              </div>

              {!agentId ? (
                <div className="p-8 text-center text-sm text-slate-500">Please select an <b>Agent</b> above first — passports appear only after agent selection.</div>
              ) : pendingList.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No pending pilgrims for this agent — vouchered ones are auto-removed.</div>
              ) : (
                <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {pendingList.map((v) => {
                    const checked = selectedVisaIds.includes(v.id);
                    return (
                      <label key={v.id} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 ${checked ? 'bg-blue-50' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleVisa(v.id)} className="w-4 h-4 accent-[#0e2c4c]" />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-slate-900 truncate">{v.pilgrimName}</div>
                          <div className="text-xs text-slate-500 font-mono">{v.passportNumber} {v.groupCode ? `· ${v.groupCode}` : ''}</div>
                        </div>
                        <span className="text-xs text-slate-400">{v.age ? `${v.age}y` : ''}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200">
                <div className="text-sm text-slate-600">
                  <b className="text-[#0e2c4c] text-base">{selectedVisaIds.length}</b> passenger(s) selected
                </div>
                <Button onClick={handleContinue} disabled={selectedVisaIds.length === 0}>
                  Create Voucher <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};
