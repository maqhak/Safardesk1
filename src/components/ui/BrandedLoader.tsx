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
        {/* Logo with PROPER 3D orbit: the pathway is a tilted ring and the
            golden jet flies it — passing BEHIND the logo at the back and
            IN FRONT at the front. Each tenant sees its own cached logo. */}
        <div className="relative inline-block [perspective:1100px]">
          <div className="relative w-72 h-72 mx-auto [transform-style:preserve-3d]">
            {/* Tilted orbit disc — spins around its own (tilted) axis */}
            <div className="absolute inset-0 [transform-style:preserve-3d] animate-[orbitSpin_9s_linear_infinite] pointer-events-none">
              {/* pathway — one clean luminous ring */}
              <div className="absolute inset-0 rounded-full border border-[#c9a227]/45 shadow-[0_0_24px_rgba(201,162,39,0.25)]" />
              {/* Realistic top-view golden jet riding the pathway, with a contrail
                  streak — like a live flight path: nose always points along
                  travel, never upside-down, physics intact */}
              <div className="absolute left-1/2 top-0 -ml-8 -mt-8">
                <img
                  src="/images/gold-jet-top.png"
                  alt=""
                  className="w-16 h-auto drop-shadow-[0_10px_18px_rgba(201,162,39,0.55)]"
                />
                <div className="absolute right-[76%] top-1/2 -translate-y-1/2 h-[3px] w-16 rounded-full bg-gradient-to-l from-white/60 via-white/25 to-transparent blur-[1px]" />
              </div>
            </div>

            {/* Tenant's own logo at the heart of the orbit — NO box */}
            <div className="absolute inset-0 flex items-center justify-center [transform:translateZ(12px)]">
              <div className="w-44 h-44 animate-[floatY_3s_ease-in-out_infinite]">
                <div className="w-full h-full relative animate-[tilt3d_4.5s_ease-in-out_infinite] [transform-style:preserve-3d]">
                  {logoUrl ? (
                    <img src={logoUrl} alt={companyName} className="w-full h-full object-contain drop-shadow-[0_18px_40px_rgba(201,162,39,0.35)] [transform:translateZ(24px)]" />
                  ) : (
                    <Plane className="w-24 h-24 text-[#c9a227] -rotate-12 mx-auto drop-shadow-[0_18px_40px_rgba(201,162,39,0.35)] [transform:translateZ(24px)]" />
                  )}
                  {/* Shine sweep across the logo */}
                  <div className="absolute inset-y-0 -left-[60%] w-1/2 pointer-events-none bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shine_3.2s_ease-in-out_infinite] [transform:translateZ(36px)_skewX(-12deg)]" />
                </div>
              </div>
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
        @keyframes orbitSpin {
          0% { transform: rotateX(35deg) rotateZ(0deg); }
          100% { transform: rotateX(35deg) rotateZ(360deg); }
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
