import { Link, useLocation } from 'react-router-dom';
import { BookOpen, CreditCard, FileSpreadsheet, Layers, Scale, Package } from 'lucide-react';

/**
 * Secondary navigation strip for the Accounts section.
 * Each item is a SEPARATE page (own route) — this is page navigation,
 * not tabs. Rendered below the PageHeader on every Accounts page so
 * all six pages stay interlinked.
 */
const ITEMS = [
  { label: 'Ledgers', path: '/accounts', icon: Layers },
  { label: 'Item/Service', path: '/accounts/item-service', icon: Package },
  { label: 'Balances Summary', path: '/accounts/balances', icon: Scale },
  { label: 'Day Book', path: '/accounts/day-book', icon: BookOpen },
  { label: 'Payments', path: '/accounts/payments', icon: CreditCard },
  { label: 'Journal Vouchers', path: '/accounts/journal-vouchers', icon: FileSpreadsheet },
];

export default function AccountsSubNav() {
  const location = useLocation();

  const isActive = (path: string) =>
    path === '/accounts'
      ? location.pathname === '/accounts'
      : location.pathname.startsWith(path);

  return (
    <nav
      aria-label="Accounts section"
      className="bg-white border border-slate-200 rounded-xl px-2 sm:px-4 flex items-center gap-1 overflow-x-auto"
    >
      {ITEMS.map(({ label, path, icon: Icon }) => {
        const active = isActive(path);
        return (
          <Link
            key={path}
            to={path}
            aria-current={active ? 'page' : undefined}
            className={`relative flex items-center gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${
              active ? 'text-[var(--theme-primary)]' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className={`w-4 h-4 ${active ? 'text-[#c9a227]' : 'text-slate-400'}`} />
            <span>{label}</span>
            {active && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#c9a227] rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
