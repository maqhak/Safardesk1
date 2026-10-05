import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  ArrowRight,
  Command,
  X
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { TENANT } from '../../config';
import { fetchVouchers, fetchVouchersForAgent } from '../../services/voucherService';
import { fetchVendors } from '../../services/masterService';
import { fetchVisas } from '../../services/visaService';
import { fetchVisaDistributions } from '../../services/visaDistributionService';
import { VoucherDoc } from '../../types/voucher';
import { VendorDoc } from '../../types/master';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [vouchers, setVouchers] = useState<VoucherDoc[]>([]);
  const [vendors, setVendors] = useState<VendorDoc[]>([]);
  const [visaMeta, setVisaMeta] = useState<Map<string, { groupCode: string; shirka: string }>>(new Map());
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setLoading(true);
      // Agents get a server-side filtered query (unfiltered collection reads are
      // rejected by Firestore rules for the agent role)
      const vouchersPromise = role === 'agent' && userProfile?.agentId
        ? fetchVouchersForAgent(userProfile.agentId)
        : fetchVouchers();
      Promise.all([vouchersPromise, fetchVendors(), fetchVisas(), fetchVisaDistributions()])
        .then(([vList, vndList, visaList, distList]) => {
          setVouchers(vList);
          setVendors(vndList);
          // Fix #25: resolve real group codes + shirka names from visa/distribution data
          const vndMap = new Map(vndList.map(v => [v.id, v.name]));
          const meta = new Map<string, { groupCode: string; shirka: string }>();
          visaList.forEach(v => {
            meta.set(v.id, { groupCode: v.groupCode || '', shirka: '' });
          });
          distList.forEach(d => {
            const shirka = vndMap.get(d.vendorId) || '';
            (d.groups || []).forEach(g => {
              (g.visaIds || []).forEach(vid => {
                const cur = meta.get(vid) || { groupCode: g.groupCode || '', shirka: '' };
                meta.set(vid, { groupCode: cur.groupCode || g.groupCode || '', shirka: shirka || cur.shirka });
              });
            });
          });
          setVisaMeta(meta);
        })
        .finally(() => setLoading(false));

      // Load recent searches from localStorage
      const savedRecent = localStorage.getItem('safardesk_recent_searches');
      if (savedRecent) {
        try {
          setRecentSearches(JSON.parse(savedRecent));
        } catch {
          // ignore
        }
      }
    }
  }, [isOpen]);

  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.id, v.name])), [vendors]);

  // Server-side / query-side role filtering (Agents see ONLY their own vouchers)
  const accessibleVouchers = useMemo(() => {
    if (role === 'agent') {
      const myAgentId = userProfile?.agentId;
      return vouchers.filter(v => v.agentId === myAgentId);
    }
    return vouchers;
  }, [vouchers, role, userProfile]);

  // Search filter matching Voucher No, Passport Number, Group Code, Passenger Name, Shirka
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();

    const matches: Array<{
      voucher: VoucherDoc;
      matchedPassenger?: { name: string; passportNumber: string };
      shirkaName: string;
      groupCode: string;
    }> = [];

    const resolveMeta = (v: VoucherDoc): { groupCode: string; shirka: string } => {
      for (const vid of v.visaIds || []) {
        const m = visaMeta.get(vid);
        if (m && (m.groupCode || m.shirka)) return m;
      }
      return { groupCode: '', shirka: '' };
    };

    accessibleVouchers.forEach((v) => {
      const voucherNo = (v.voucherNo || '').toLowerCase();
      const { groupCode, shirka } = resolveMeta(v);
      const shirkaName = shirka;
      const shirkaLower = shirkaName.toLowerCase();

      let matchedPassenger = v.passengers?.[0];
      let hasMatch = 
        voucherNo.includes(q) || 
        groupCode.toLowerCase().includes(q) || 
        shirkaLower.includes(q);

      if (!hasMatch && v.passengers) {
        const foundPassenger = v.passengers.find(
          p => (p.name || '').toLowerCase().includes(q) || (p.passportNumber || '').toLowerCase().includes(q)
        );
        if (foundPassenger) {
          hasMatch = true;
          matchedPassenger = foundPassenger;
        }
      }

      if (hasMatch) {
        matches.push({
          voucher: v,
          matchedPassenger,
          shirkaName,
          groupCode,
        });
      }
    });

    return matches;
  }, [accessibleVouchers, query, vendorMap]);

  const handleSelectVoucher = (voucherNo: string) => {
    if (query.trim() && !recentSearches.includes(query.trim())) {
      const updated = [query.trim(), ...recentSearches.slice(0, 4)];
      setRecentSearches(updated);
      localStorage.setItem('safardesk_recent_searches', JSON.stringify(updated));
    }

    navigate('/vouchers', { state: { highlightVoucherNo: voucherNo } });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity" 
        onClick={onClose} 
      />

      {/* Search Container */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50/50">
          <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vouchers by Voucher No, Passport Number, Group Code, Passenger Name, or Shirka..."
            className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Results / Empty State */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-slate-100">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Loading live Firestore vouchers directory...
            </div>
          ) : !query.trim() ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-10 h-10 bg-navy-50 text-[#0e2c4c] rounded-xl flex items-center justify-center mx-auto">
                <Command className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Whole-Website Vouchers Search</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Type to search live company vouchers by Voucher No, Passport Number, Group Code, Mutamer Name, or Shirka.
                </p>
              </div>

              {recentSearches.length > 0 && (
                <div className="pt-2 text-left max-w-xs mx-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Recent Searches</span>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map((rec, i) => (
                      <button
                        key={i}
                        onClick={() => setQuery(rec)}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium transition"
                      >
                        {rec}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="text-xs font-bold text-slate-800">No matching vouchers found</div>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                No vouchers match "{query}". Please check your search parameters or passport number.
              </p>
            </div>
          ) : (
            <div className="space-y-1 py-1">
              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Voucher Results ({searchResults.length})
              </div>
              {searchResults.map(({ voucher, matchedPassenger, shirkaName, groupCode }, idx) => (
                <div
                  key={voucher.id || idx}
                  onClick={() => handleSelectVoucher(voucher.voucherNo)}
                  className="p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition flex items-center justify-between group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#0e2c4c] text-sm group-hover:underline">
                        {voucher.voucherNo}
                      </span>
                      <Badge variant="navy" size="sm">{groupCode || '—'}</Badge>
                      {shirkaName ? (
                        <span className="text-[11px] text-slate-500 font-medium">
                          Shirka: <strong>{shirkaName}</strong>
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs font-semibold text-slate-900">
                      Passenger: {matchedPassenger?.name || voucher.passengers?.[0]?.name || 'N/A'} 
                      <span className="font-mono font-normal text-slate-500 ml-2">
                        Passport: {matchedPassenger?.passportNumber || voucher.passengers?.[0]?.passportNumber || 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 group-hover:text-[#0e2c4c]">
                    <span className="text-xs font-bold">Open Voucher</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
          <span>Press ESC to close</span>
          <span className="font-mono">{TENANT.companyName} Global Search</span>
        </div>
      </div>
    </div>
  );
};
