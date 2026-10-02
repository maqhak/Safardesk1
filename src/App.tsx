import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { CompanyProvider } from './contexts/CompanyContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';

// Pages
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { VisasPage } from './pages/VisasPage';
import { CustomersPage } from './pages/CustomersPage';
import { VouchersPage } from './pages/VouchersPage';
import { VoucherSharedView } from './pages/VoucherSharedView';
import { TicketsPage } from './pages/TicketsPage';
import { MovementReportsPage } from './pages/MovementReportsPage';
import { AccountsPage } from './pages/AccountsPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { BalancesSummaryPage } from './pages/BalancesSummaryPage';
import { DayBookPage } from './pages/DayBookPage';
import { JournalVouchersPage } from './pages/JournalVouchersPage';
import { MastersPage } from './pages/MastersPage';
import { AgentsPage } from './pages/AgentsPage';
import { AirlinesPage } from './pages/AirlinesPage';
import { ExchangeRatesPage } from './pages/ExchangeRatesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { CompanyProfilePage } from './pages/CompanyProfilePage';
import { UsersAndPermissionsPage } from './pages/UsersAndPermissionsPage';
import { AgentPortalPage } from './pages/AgentPortalPage';
import { ProfilePage } from './pages/ProfilePage';
import { VisaDistributionPage } from './pages/VisaDistributionPage';
import { VisaInvoicesPage } from './pages/VisaInvoicesPage';
import { QaReportPage } from './pages/QaReportPage';
import { LicenseGate } from './components/auth/LicenseGate';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CompanyProvider>
            <LicenseGate>
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
                  path="/accounts/jv"
                  element={
                    <ProtectedRoute requiredModule="Accounts">
                      <JournalVouchersPage />
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
            </LicenseGate>
          </CompanyProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
