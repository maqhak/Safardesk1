import React from 'react';
import { Plane } from 'lucide-react';
import { TENANT } from '../../config';

/**
 * Branded animated full-screen loader for SafarDesk.
 * Shows the TENANT's company name + logo (falls back to plane icon).
 * Never shows the "SafarDesk" product name — white-labeled per tenant.
 */
export const BrandedLoader: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  const companyName = TENANT.companyName || '';
  // Try cached company logo (saved by CompanyContext); fallback to plane icon
  let logoUrl = '';
  try {
    logoUrl = localStorage.getItem('safardesk_company_logo') || '';
  } catch {
    /* ignore */
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#101a30] via-[#16233f] to-[#0d1526] relative overflow-hidden">
      {/* Animated background blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#c9a227]/10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-[#2b5aa6]/15 blur-3xl animate-pulse" style={{ animationDelay: '1.2s' }} />
      </div>

      <div className="text-center relative z-10 px-6">
        {/* Logo + name with orbiting plane */}
        <div className="relative inline-block">
          {/* Orbiting plane — circles around logo and name */}
          <div className="absolute inset-0 pointer-events-none animate-[orbit_6s_linear_infinite]">
            <Plane className="absolute -top-3 left-1/2 -ml-4 w-8 h-8 text-[#c9a227] drop-shadow-lg" />
          </div>
          {/* Orbit ring (subtle) */}
          <div className="absolute -inset-8 rounded-full border border-white/5 pointer-events-none" />

          {/* Logo mark — company logo if available, else plane icon */}
          <div className="mx-auto mb-6 w-20 h-20 rounded-3xl bg-gradient-to-br from-[#c9a227] to-[#9a7b1a] flex items-center justify-center shadow-2xl shadow-[#c9a227]/20 animate-[floatY_3s_ease-in-out_infinite] overflow-hidden relative">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="w-full h-full object-contain bg-white/10 p-1.5" />
            ) : (
              <Plane className="w-10 h-10 text-[#101a30] -rotate-12" />
            )}
          </div>

          {/* Tenant company name — never the product name */}
          {companyName ? (
            <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1">
              {companyName}
            </h1>
          ) : null}
        </div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400 mb-8">
          Travel Business Management
        </p>

        {/* Animated dots */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-[#c9a227] animate-bounce"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
        <p className="text-sm font-medium text-slate-300">{message}</p>
      </div>

      <style>{`
        @keyframes orbit {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes floatY {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};

/**
 * Compact inline loader for cards/sections (light background).
 */
export const InlineLoader: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  return (
    <div className="p-10 text-center">
      <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0e2c4c] to-[#1a4473] flex items-center justify-center animate-[floatY_3s_ease-in-out_infinite]">
        <Plane className="w-6 h-6 text-[#c9a227] -rotate-12" />
      </div>
      <div className="flex items-center justify-center gap-1.5 mb-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-[#0e2c4c] animate-bounce"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
      <p className="text-sm font-medium text-slate-500">{message}</p>
      <style>{`
        @keyframes floatY {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
};
