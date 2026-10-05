import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopNavbar } from '../navigation/TopNavbar';
import { TENANT } from '../../config';
import { getCurrentRate } from '../../services/exchangeRateService';

export const AppShell: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-[#0e2c4c] selection:text-white">
      {/* Top Horizontal Navigation Bar */}
      <div className="print:hidden">
        <TopNavbar />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 w-full px-3 sm:px-4 lg:px-6 py-4">
        <Outlet />
      </main>

      {/* Professional Footer */}
      <footer className="w-full border-t border-slate-200/80 bg-white py-4 mt-auto print:hidden">
        <div className="w-full px-4 sm:px-6 lg:px-10 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">{TENANT.companyName}</span>
            <span>•</span>
            <span>{TENANT.tagline}</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Primary Currency: <strong className="text-slate-600 font-mono">{TENANT.currency.primary}</strong></span>
            <span>Forex: <strong className="text-slate-600 font-mono">1 SAR = {getCurrentRate('SAR-PKR').toFixed(2)} PKR</strong></span>
            <span>v1.0 (Phase 0 Scaffold)</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
