import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  FileText, 
  Ticket, 
  Hotel, 
  CreditCard, 
  Users, 
  Plane, 
  Settings, 
  ArrowRight,
  Command,
  X
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { checkCan } from '../../hooks/useCan';
import { AppModule } from '../../types/auth';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchItem {
  id: string;
  category: 'Visas' | 'Tickets' | 'Vouchers' | 'Accounts' | 'Masters' | 'Pages';
  title: string;
  subtitle: string;
  path: string;
  badge?: string;
  icon: any;
}

const QUICK_SEARCH_INDEX: SearchItem[] = [
  {
    id: 'page-dashboard',
    category: 'Pages',
    title: 'Dashboard Overview',
    subtitle: 'System KPIs, active operations and quick metrics',
    path: '/',
    icon: Command,
  },
  {
    id: 'visa-sample-1',
    category: 'Visas',
    title: 'Mohammed Tariq Al-Ghamdi',
    subtitle: 'Passport A9823411 • Umrah Visa • Issued',
    path: '/visas',
    badge: 'SAR 450',
    icon: FileText,
  },
  {
    id: 'visa-sample-2',
    category: 'Visas',
    title: 'Amina Bibi Shah',
    subtitle: 'Passport B4302910 • Tourist Visa • Processing',
    path: '/visas',
    badge: 'SAR 520',
    icon: FileText,
  },
  {
    id: 'voucher-sample-1',
    category: 'Vouchers',
    title: 'Voucher #VCH-2026-081',
    subtitle: 'Makkah Clock Royal Tower • 4 Nights • Deluxe Room',
    path: '/vouchers',
    badge: 'SAR 4,800',
    icon: Hotel,
  },
  {
    id: 'ticket-sample-1',
    category: 'Tickets',
    title: 'PNR 9KJ2XA — Saudia SV-721',
    subtitle: 'JED -> KHI • 2 Pax • Confirmed',
    path: '/tickets',
    badge: 'SAR 2,350',
    icon: Ticket,
  },
  {
    id: 'account-sample-1',
    category: 'Accounts',
    title: 'Al-Barakah Travel & Tours Karachi',
    subtitle: 'Agent Ledger • Outstanding Balance: SAR 14,250',
    path: '/accounts',
    badge: 'Receivable',
    icon: CreditCard,
  },
  {
    id: 'master-sample-1',
    category: 'Masters',
    title: 'Hotel Directory & Rate Contracts',
    subtitle: 'Makkah & Madinah contracted partner inventory',
    path: '/masters',
    icon: Users,
  },
  {
    id: 'settings-rates',
    category: 'Pages',
    title: 'Exchange Rates & Tenant Settings',
    subtitle: 'SAR / PKR daily forex benchmarks and agency profiles',
    path: '/settings',
    icon: Settings,
  },
];

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const filteredItems = QUICK_SEARCH_INDEX.filter((item) => {
    // Permission check for Staff
    if (role === 'staff' && item.category !== 'Pages') {
      const mod = item.category as AppModule;
      if (!checkCan(userProfile, mod, 'view')) return false;
    }

    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  });

  const handleSelect = (item: SearchItem) => {
    navigate(item.path);
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
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search Visas, Passports, PNR, Vouchers, Ledgers, Masters..."
            className="w-full bg-transparent border-0 text-slate-900 placeholder:text-slate-400 focus:outline-none text-base font-medium"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-slate-400 hover:text-slate-600 p-1 text-xs"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block ml-2 px-2 py-0.5 text-[11px] font-mono text-slate-400 bg-white border border-slate-200 rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[380px] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <p className="text-sm font-medium">No results found for "{query}"</p>
              <p className="text-xs text-slate-400 mt-1">Try searching by passport, agent name, or PNR</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-150 ${
                    idx === selectedIndex ? 'bg-navy-50/80 border border-navy-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#0e2c4c] shrink-0 shadow-2xs">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {item.badge && (
                      <span className="text-xs font-mono font-semibold text-[#0e2c4c] bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs">
                        {item.badge}
                      </span>
                    )}
                    <ArrowRight className="w-4 h-4 text-slate-400 opacity-60" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>Navigation: <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]">↑</kbd> <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]">↓</kbd></span>
            <span>Select: <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px]">↵</kbd></span>
          </div>
          <span>SafarDesk Global Registry</span>
        </div>
      </div>
    </div>
  );
};
