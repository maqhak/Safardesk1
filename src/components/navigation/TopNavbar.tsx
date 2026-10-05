import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { 
  Compass, 
  Search, 
  User, 
  Key, 
  LogOut, 
  ChevronDown, 
  Menu, 
  X, 
  ShieldCheck, 
  Briefcase, 
  DollarSign,
  LayoutDashboard,
  FileCheck,
  Ticket,
  Building,
  Plane,
  Calculator,
  Database,
  BarChart3,
  Settings as SettingsIcon,
  Check,
  Users as UsersIcon,
  Eye,
  EyeOff
} from 'lucide-react';
import { TENANT } from '../../config';
import { getCurrentRate } from '../../services/exchangeRateService';
import { fetchCompanyProfile } from '../../services/companyService';
import { useAuth } from '../../contexts/AuthContext';
import { LicensePill } from '../auth/LicensePill';
import { useToast } from '../../contexts/ToastContext';
import { UserRole, AppModule } from '../../types/auth';
import { GlobalSearchModal } from './GlobalSearchModal';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { checkCan } from '../../hooks/useCan';

interface NavChild {
  name: string;
  path: string;
  module?: AppModule;
}

interface NavItem {
  name: string;
  path: string;
  module?: AppModule;
  icon: any;
  children?: NavChild[];
}

const ALL_NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard', path: '/', module: 'Dashboard', icon: LayoutDashboard },
  {
    name: 'Accounts', path: '/accounts', module: 'Accounts', icon: Calculator,
    children: [
      { name: 'Ledgers', path: '/accounts', module: 'Accounts' },
      { name: 'Balances Summary', path: '/accounts/balances', module: 'Accounts' },
      { name: 'Payments', path: '/accounts/payments', module: 'Accounts' },
      { name: 'Day Book', path: '/accounts/day-book', module: 'Accounts' },
      { name: 'Journal Vouchers', path: '/accounts/journal-vouchers', module: 'Accounts' },
    ],
  },
  { name: 'Vendors', path: '/vendors', module: 'Masters', icon: Briefcase },
  {
    name: 'Inventory', path: '/inventory', module: 'Masters', icon: Database,
    children: [
      { name: 'Makkah Hotels', path: '/inventory/makkah', module: 'Masters' },
      { name: 'Madina Hotels', path: '/inventory/madina', module: 'Masters' },
      { name: 'Transport', path: '/inventory/transport', module: 'Masters' },
    ],
  },
  { name: 'Visas', path: '/visas', module: 'Visas', icon: FileCheck },
  { name: 'Customers', path: '/customers', module: 'Visas', icon: UsersIcon },
  { name: 'Vouchers', path: '/vouchers', module: 'Vouchers', icon: Building },
  { name: 'Tickets', path: '/tickets', module: 'Tickets', icon: Plane },
  { name: 'Masters', path: '/masters', module: 'Masters', icon: Compass },
  { name: 'Reports', path: '/reports', module: 'Reports', icon: BarChart3 },
  { name: 'Settings', path: '/settings', module: 'Settings', icon: SettingsIcon },
];

const MobileNavGroup: React.FC<{ item: NavItem; onNavigate: () => void }> = ({ item, onNavigate }) => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const Icon = item.icon;
  const childActive = item.children?.some((c) =>
    c.path === '/accounts' ? location.pathname === '/accounts' : location.pathname.startsWith(c.path)
  );
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
          childActive ? 'bg-white/20 text-white font-semibold' : 'text-slate-300 hover:text-white hover:bg-white/10'
        }`}
      >
        <Icon className="w-4 h-4 text-gold-400" />
        <span className="flex-1 text-left">{item.name}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-9 mt-1 space-y-0.5">
          {item.children!.map((child) => {
            const cActive = child.path === '/accounts'
              ? location.pathname === '/accounts'
              : location.pathname.startsWith(child.path);
            return (
              <NavLink
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] transition ${
                  cActive ? 'bg-white/15 text-white font-semibold' : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${cActive ? 'bg-[#c9a227]' : 'bg-slate-500'}`} />
                {child.name}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const TopNavbar: React.FC = () => {
  const { userProfile, role, signOutUser, changePassword } = useAuth();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>('');

  // Load company logo for navbar branding
  useEffect(() => {
    fetchCompanyProfile().then((p) => {
      if (p.logoUrl) setCompanyLogoUrl(p.logoUrl);
    }).catch(() => {});
  }, []);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close user dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut for Global Search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Compute visible navigation items driven by role and permissions matrix
  const visibleNavItems: NavItem[] = React.useMemo(() => {
    if (role === 'agent') {
      return [
        { name: 'Agent Portal', path: '/agent-portal', icon: LayoutDashboard },
        { name: 'My Vouchers', path: '/vouchers', icon: Ticket },
        { name: 'Visa Manifest', path: '/agent-portal#visas', icon: FileCheck },
      ];
    }

    if (role === 'owner') {
      return ALL_NAV_ITEMS;
    }

    // For Staff: show only modules where 'view' is enabled in their permissions matrix
    return ALL_NAV_ITEMS.filter((item) => {
      if (!item.module) return true;
      return checkCan(userProfile, item.module, 'view');
    }).map((item) => {
      if (!item.children) return item;
      const kids = item.children.filter((c) => !c.module || checkCan(userProfile, c.module, 'view'));
      return kids.length > 0 ? { ...item, children: kids } : { ...item, children: undefined };
    });
  }, [role, userProfile]);

  const handleLogout = async () => {
    try {
      await signOutUser();
      success('You have been signed out successfully.', 'Logged Out');
      navigate('/login');
    } catch {
      navigate('/login');
    } finally {
      setLogoutConfirmOpen(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('New password and confirmation do not match.');
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      success('Your password has been updated successfully.', 'Security Updated');
      setPasswordModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showError(err?.message || 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const roleBadgeConfig = {
    owner: { label: 'Owner', bg: 'bg-[#c9a227] text-white' },
    staff: { label: 'Staff', bg: 'bg-white/20 text-white' },
    agent: { label: 'Agent', bg: 'bg-emerald-500 text-white' },
  };

  const currentRoleBadge = roleBadgeConfig[role || 'staff'] || roleBadgeConfig.staff;

  const initials = userProfile?.name
    ? userProfile.name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'SD';

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#0e2c4c] text-white shadow-md border-b border-[#163b63]">
        <div className="w-full px-4 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between h-16 gap-3">
            
            {/* LEFT: Logo & Company Name */}
            <div className="flex items-center gap-3 shrink-0">
              <NavLink to={role === 'agent' ? '/agent-portal' : '/'} className="flex items-center gap-3 group focus:outline-none">
                {companyLogoUrl ? (
                  <img
                    src={companyLogoUrl}
                    alt={TENANT.companyName}
                    className="w-10 h-10 rounded-xl object-contain bg-white/10 p-1 shadow-sm group-hover:scale-105 transition-transform duration-150"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c9a227] to-[#dfba3f] flex items-center justify-center text-[#0e2c4c] shadow-sm group-hover:scale-105 transition-transform duration-150">
                    <Compass className="w-6 h-6 stroke-[2.2]" />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="font-extrabold text-lg tracking-tight text-white group-hover:text-gold-300 transition-colors truncate max-w-[200px] sm:max-w-none">
                    {TENANT.companyName}
                  </span>
                  <span className="text-[11px] text-slate-300 font-normal">
                    SafarDesk
                  </span>
                </div>
              </NavLink>
            </div>

            {/* RIGHT: Search, Menu Drawer, Forex pill & User Avatar Menu */}            {/* RIGHT: Search, Forex pill & User Avatar Menu */}
            <div className="flex items-center gap-2 sm:gap-3">
              
              {/* Prominent Global Search Button */}
              {role !== 'agent' && (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white/90 text-xs transition duration-150 shadow-inner group cursor-pointer"
                  title="Search records across all modules (⌘K)"
                >
                  <Search className="w-3.5 h-3.5 text-gold-400 group-hover:text-gold-300 transition-colors" />
                  <span className="hidden sm:inline font-medium text-slate-200">
                    Search...
                  </span>
                  <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-white/15 rounded text-slate-300 border border-white/20">
                    ⌘K
                  </kbd>
                </button>
              )}

              {/* License Status Pill */}
              <LicensePill />

              {/* Forex Indicator Pill (SAR / PKR) */}
              <div 
                className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono text-slate-300"
                title="Current foreign exchange benchmark"
              >
                <span className="text-[#dfba3f] font-semibold">1 SAR</span>
                <span>=</span>
                <span>{getCurrentRate('SAR-PKR').toFixed(2)} PKR</span>
              </div>

              {/* User Avatar Menu Dropdown */}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2.5 p-1 rounded-lg hover:bg-white/10 transition cursor-pointer focus:outline-none"
                  aria-expanded={userMenuOpen}
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#163b63] to-[#c9a227] text-white flex items-center justify-center font-bold text-xs shadow-xs border border-white/20">
                    {initials}
                  </div>
                  <div className="hidden md:flex flex-col text-left leading-none">
                    <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                      {userProfile?.name || 'User'}
                    </span>
                    <span className="text-[10px] text-gold-300 capitalize mt-0.5">
                      {role || 'Staff'}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-300 hidden md:block" />
                </button>

                {/* Dropdown Menu */}
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-68 bg-white text-slate-900 rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                    {/* User Info Header */}
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {userProfile?.name || 'SafarDesk User'}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5 font-mono">
                        {userProfile?.email || 'user@safardesk.com'}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-medium">Active Role:</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${currentRoleBadge.bg}`}>
                          {role || 'staff'}
                        </span>
                      </div>
                    </div>

                    {/* Links */}
                    <div className="py-1">
                      {role === 'owner' && (
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            navigate('/settings/users');
                          }}
                          className="w-full px-4 py-2 text-left text-xs font-semibold text-[#0e2c4c] bg-navy-50/40 hover:bg-navy-50 flex items-center gap-2.5 transition"
                        >
                          <UsersIcon className="w-4 h-4 text-[#0e2c4c]" />
                          <span>Users & Permissions</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate(role === 'agent' ? '/agent-portal' : '/profile');
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition"
                      >
                        <User className="w-4 h-4 text-slate-400" />
                        <span>My Profile</span>
                      </button>

                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          setPasswordModalOpen(true);
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition"
                      >
                        <Key className="w-4 h-4 text-slate-400" />
                        <span>Change Password</span>
                      </button>

                      {role !== 'agent' && (
                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            navigate('/settings');
                          }}
                          className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition"
                        >
                          <SettingsIcon className="w-4 h-4 text-slate-400" />
                          <span>Settings</span>
                        </button>
                      )}
                    </div>

                    {/* Logout */}
                    <div className="pt-1 border-t border-slate-100">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          setLogoutConfirmOpen(true);
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-rose-500" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Menu Drawer Toggle Button (right side) */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 p-2 rounded-lg text-slate-200 hover:text-white hover:bg-white/10"
                aria-label="Open Navigation Menu"
              >
                <Menu className="w-5 h-5" />
                <span className="hidden sm:inline text-sm font-medium">Menu</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right-Side Navigation Drawer */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}
        <div
          className={`fixed top-0 right-0 z-50 h-full w-[300px] max-w-[85vw] bg-[#0a223c] border-l border-white/10 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-hidden={!mobileMenuOpen}
        >
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
            <span className="text-sm font-bold text-white uppercase tracking-wider">Menu</span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
              aria-label="Close Navigation Menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              if (!item.children) {
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                        isActive
                          ? 'bg-white/20 text-white font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 text-gold-400" />
                    <span>{item.name}</span>
                  </NavLink>
                );
              }
              return (
                <MobileNavGroup
                  key={item.path}
                  item={item}
                  onNavigate={() => setMobileMenuOpen(false)}
                />
              );
            })}
          </div>
        </div>
      </header>

      {/* Global Spotlight Search Modal */}
      <GlobalSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />

      {/* Change Password Modal with Firebase Re-auth */}
      <Modal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title="Change Password"
        subtitle="Requires re-authentication with your current password"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPasswordModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={passwordLoading}
              onClick={handlePasswordSubmit}
            >
              Update Password
            </Button>
          </>
        }
      >
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <Input
              type={showCurrentPass ? 'text' : 'password'}
              label="Current Password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              required
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="hover:text-slate-700 cursor-pointer"
                  tabIndex={-1}
                >
                  {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </div>

          <div>
            <Input
              type={showNewPass ? 'text' : 'password'}
              label="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              helperText="Must be at least 6 characters with a combination of letters and digits"
              required
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="hover:text-slate-700 cursor-pointer"
                  tabIndex={-1}
                >
                  {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </div>

          <div>
            <Input
              type="password"
              label="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
            />
          </div>
        </form>
      </Modal>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={handleLogout}
        title="Sign Out"
        message="Are you sure you want to log out of SafarDesk? Your session will be safely closed."
        confirmLabel="Sign Out"
        variant="danger"
      />
    </>
  );
};
