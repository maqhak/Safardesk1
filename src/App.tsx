import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { CompanyProvider } from './contexts/CompanyContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { BrandedLoader } from './components/ui/BrandedLoader';
import { AppShell } from './components/layout/AppShell';

// Pages — lazy loaded for faster initial load (code splitting)
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const VisasPage = lazy(() => import('./pages/VisasPage').then(m => ({ default: m.VisasPage })));
const CustomersPage = lazy(() => import('./pages/CustomersPage').then(m => ({ default: m.CustomersPage })));
const VouchersPage = lazy(() => import('./pages/VouchersPage').then(m => ({ default: m.VouchersPage })));
const VoucherCreatePage = lazy(() => import('./pages/VoucherCreatePage').then(m => ({ default: m.VoucherCreatePage })));
const VoucherSharedView = lazy(() => import('./pages/VoucherSharedView').then(m => ({ default: m.VoucherSharedView })));
const TicketsPage = lazy(() => import('./pages/TicketsPage').then(m => ({ default: m.TicketsPage })));
const MovementReportsPage = lazy(() => import('./pages/MovementReportsPage').then(m => ({ default: m.MovementReportsPage })));
const AccountsPage = lazy(() => import('./pages/AccountsPage').then(m => ({ default: m.AccountsPage })));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage').then(m => ({ default: m.PaymentsPage })));
const BalancesSummaryPage = lazy(() => import('./pages/BalancesSummaryPage').then(m => ({ default: m.BalancesSummaryPage })));
const DayBookPage = lazy(() => import('./pages/DayBookPage').then(m => ({ default: m.DayBookPage })));
const JournalVouchersPage = lazy(() => import('./pages/JournalVouchersPage').then(m => ({ default: m.JournalVouchersPage })));
const ItemServicePage = lazy(() => import('./pages/ItemServicePage').then(m => ({ default: m.ItemServicePage })));
const MastersPage = lazy(() => import('./pages/MastersPage').then(m => ({ default: m.MastersPage })));
const VendorsPage = lazy(() => import('./pages/VendorsPage').then(m => ({ default: m.VendorsPage })));
const HotelsPage = lazy(() => import('./pages/HotelsPage').then(m => ({ default: m.HotelsPage })));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage').then(m => ({ default: m.VehiclesPage })));
const AgentsPage = lazy(() => import('./pages/AgentsPage').then(m => ({ default: m.AgentsPage })));
const AirlinesPage = lazy(() => import('./pages/AirlinesPage').then(m => ({ default: m.AirlinesPage })));
const ExchangeRatesPage = lazy(() => import('./pages/ExchangeRatesPage').then(m => ({ default: m.ExchangeRatesPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const CompanyProfilePage = lazy(() => import('./pages/CompanyProfilePage').then(m => ({ default: m.CompanyProfilePage })));
const UsersAndPermissionsPage = lazy(() => import('./pages/UsersAndPermissionsPage').then(m => ({ default: m.UsersAndPermissionsPage })));
const AgentPortalPage = lazy(() => import('./pages/AgentPortalPage').then(m => ({ default: m.AgentPortalPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const VisaDistributionPage = lazy(() => import('./pages/VisaDistributionPage').then(m => ({ default: m.VisaDistributionPage })));
const VisaInvoicesPage = lazy(() => import('./pages/VisaInvoicesPage').then(m => ({ default: m.VisaInvoicesPage })));
const QaReportPage = lazy(() => import('./pages/QaReportPage').then(m => ({ default: m.QaReportPage })));
import { LicenseGate } from './components/auth/LicenseGate';

/** Loading fallback shown while a lazy page chunk loads. */
function PageLoader() {
  return <BrandedLoader />;
}

/**
 * Global number-input behavior: when ANY number field in the CRM is focused,
 * select its whole value so typing REPLACES it instead of appending.
 * (Fixes: field shows "1", user types "5" -> "15" and has to delete the "1".)
 */
function GlobalNumberInputBehavior() {
  React.useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'number') {
        const input = el as HTMLInputElement;
        requestAnimationFrame(() => {
          try {
            input.select();
          } catch {
            /* older browsers: no-op */
          }
        });
      }
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <GlobalNumberInputBehavior />
      <ToastProvider>
        <ThemeProvider>
        <AuthProvider>
          <CompanyProvider>
            <LicenseGate>
              <Suspense fallback={<PageLoader />}>
              <Routes>
              {/* Public Auth Route (Strictly No Public Registration) */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected CRM Workspace Shell */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route
                  path="/visas"
                  element={
                    <ProtectedRoute requiredModule="Visas">
                      <VisasPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/customers"
                  element={
                    <ProtectedRoute requiredModule="Visas">
                      <CustomersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/vouchers"
                  element={
                    <ProtectedRoute requiredModule="Vouchers">
                      <VouchersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/vouchers/new"
                  element={
                    <ProtectedRoute requiredModule="Vouchers">
                      <VoucherCreatePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/vouchers/shared/:voucherId"
                  element={
                    <ProtectedRoute requiredModule="Vouchers">
                      <VoucherSharedView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tickets"
                  element={
                    <ProtectedRoute requiredModule="Tickets">
                      <TicketsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/tickets/movement-reports"
                  element={
                    <ProtectedRoute requiredModule="Tickets">
                      <MovementReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/accounts"
                  element={
                    <ProtectedRoute requiredModule="Accounts">
                      <AccountsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/accounts/payments"
                  element={
                    <ProtectedRoute requiredModule="Accounts">
                      <PaymentsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/accounts/balances"
                  element={
                    <ProtectedRoute requiredModule="Accounts">
                      <BalancesSummaryPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/accounts/day-book"
                  element={
                    <ProtectedRoute requiredModule="Accounts">
                      <DayBookPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/accounts/journal-vouchers"
                  element={
                    <ProtectedRoute requiredModule="Accounts">
                      <JournalVouchersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/accounts/item-service"
                  element={
                    <ProtectedRoute requiredModule="Accounts">
                      <ItemServicePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/accounts/jv"
                  element={
                    <ProtectedRoute requiredModule="Accounts">
                      <JournalVouchersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/vendors"
                  element={
                    <ProtectedRoute requiredModule="Masters">
                      <VendorsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/inventory"
                  element={<Navigate to="/inventory/makkah" replace />}
                />
                <Route
                  path="/inventory/makkah"
                  element={
                    <ProtectedRoute requiredModule="Masters">
                      <HotelsPage lockedCity="Makkah" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/inventory/madina"
                  element={
                    <ProtectedRoute requiredModule="Masters">
                      <HotelsPage lockedCity="Madinah" />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/inventory/transport"
                  element={
                    <ProtectedRoute requiredModule="Masters">
                      <VehiclesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/masters"
                  element={
                    <ProtectedRoute requiredModule="Masters">
                      <MastersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/masters/agents"
                  element={
                    <ProtectedRoute requiredModule="Masters">
                      <AgentsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/masters/airlines"
                  element={
                    <ProtectedRoute requiredModule="Masters">
                      <AirlinesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/masters/exchange-rates"
                  element={
                    <ProtectedRoute requiredModule="Masters">
                      <ExchangeRatesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute requiredModule="Reports">
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute requiredModule="Settings">
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings/company"
                  element={
                    <ProtectedRoute ownerOnly>
                      <CompanyProfilePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings/users"
                  element={
                    <ProtectedRoute ownerOnly>
                      <UsersAndPermissionsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/visas/distribution"
                  element={
                    <ProtectedRoute requiredModule="Visas">
                      <VisaDistributionPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/visas/invoices"
                  element={
                    <ProtectedRoute requiredModule="Visas">
                      <VisaInvoicesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings/qa-report"
                  element={
                    <ProtectedRoute ownerOnly>
                      <QaReportPage />
                    </ProtectedRoute>
                  }
                />
                {/* Fix #34: explicitly wrapped in ProtectedRoute (defense in depth) */}
                <Route
                  path="/agent-portal"
                  element={
                    <ProtectedRoute>
                      <AgentPortalPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <ProfilePage />
                    </ProtectedRoute>
                  }
                />
              </Route>

              {/* Catch-all redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
              </Suspense>
            </LicenseGate>
          </CompanyProvider>
        </AuthProvider>
        </ThemeProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
