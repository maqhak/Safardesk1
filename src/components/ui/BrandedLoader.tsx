import React from 'react';
import { Plane } from 'lucide-react';
import { TENANT } from '../../config';

/** Small golden 3D-style jet (top view) used as the orbiting plane. */
const GoldPlane: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="branded-gold-plane" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f6d67c" />
        <stop offset="0.45" stopColor="#d9ab2e" />
        <stop offset="1" stopColor="#8a6d14" />
      </linearGradient>
    </defs>
    {/* main wings */}
    <path d="M30 22 L4 44 c-1 1 -.5 2.5 1 2.5 L9.5 46 L30 32 Z" fill="url(#branded-gold-plane)" />
    <path d="M34 22 L60 44 c1 1 .5 2.5 -1 2.5 L54.5 46 L34 32 Z" fill="url(#branded-gold-plane)" />
    {/* tail wings */}
    <path d="M30.5 43 L17.5 53.5 c-.9 .7 -.5 2.2 .8 2 L30.5 49.5 Z" fill="url(#branded-gold-plane)" />
    <path d="M33.5 43 L46.5 53.5 c.9 .7 .5 2.2 -.8 2 L33.5 49.5 Z" fill="url(#branded-gold-plane)" />
    {/* fuselage */}
    <path d="M32 4 c2.6 0 4.2 3 4.2 7 L35 47 c0 3 -1.4 5.5 -3 5.5 c-1.6 0 -3 -2.5 -3 -5.5 L27.8 11 c0 -4 1.6 -7 4.2 -7 Z" fill="url(#branded-gold-plane)" />
    {/* cockpit glint */}
    <ellipse cx="32" cy="12" rx="1.6" ry="3.2" fill="#fff8e1" opacity="0.85" />
  </svg>
);

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
            <GoldPlane className="absolute -top-4 left-1/2 -ml-5 w-10 h-10 drop-shadow-[0_6px_14px_rgba(201,162,39,0.55)]" />
          </div>
          {/* Orbit ring (subtle) */}
          <div className="absolute -inset-8 rounded-full border border-white/5 pointer-events-none" />

          {/* Tenant logo shown directly — NO box. Bigger + more visible.
              3D effect: gentle perspective tilt + travelling shine sweep + float. */}
          <div className="mx-auto mb-6 w-44 h-44 [perspective:800px] animate-[floatY_3s_ease-in-out_infinite]">
            <div className="w-full h-full relative animate-[tilt3d_4.5s_ease-in-out_infinite] [transform-style:preserve-3d]">
              {logoUrl ? (
                <img src={logoUrl} alt={companyName} className="w-full h-full object-contain drop-shadow-[0_18px_40px_rgba(201,162,39,0.35)] [transform:translateZ(24px)]" />
              ) : (
                <Plane className="w-24 h-24 text-[#c9a227] -rotate-12 mx-auto drop-shadow-[0_18px_40px_rgba(201,162,39,0.35)] [transform:translateZ(24px)]" />
              )}
              {/* Shine sweep across the logo */}
              <div className="absolute inset-y-0 -left-[60%] w-1/2 pointer-events-none bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shine_3.2s_ease-in-out_infinite] [transform:translateZ(36px) skewX(-12deg)]" />
            </div>
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
        @keyframes tilt3d {
          0%, 100% { transform: perspective(700px) rotateY(-16deg) rotateX(5deg); }
          50% { transform: perspective(700px) rotateY(16deg) rotateX(-5deg); }
        }
        @keyframes shine {
          0% { left: -60%; }
          55%, 100% { left: 130%; }
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
