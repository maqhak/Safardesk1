import React from 'react';
import { Plane } from 'lucide-react';

/**
 * Branded animated full-screen loader for SafarDesk.
 * Dark navy gradient, flying plane trail, shimmer brand text, animated dots.
 */
export const BrandedLoader: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#101a30] via-[#16233f] to-[#0d1526] relative overflow-hidden">
      {/* Animated background blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#c9a227]/10 blur-3xl animate-pulse" />
        <div className="absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-[#2b5aa6]/15 blur-3xl animate-pulse" style={{ animationDelay: '1.2s' }} />
      </div>

      {/* Flying plane with dotted trail */}
      <div className="absolute inset-x-0 top-1/3 pointer-events-none overflow-hidden">
        <div className="animate-[flyAcross_4s_linear_infinite] flex items-center">
          <div className="flex items-center gap-1 mr-2">
            {[...Array(8)].map((_, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <Plane className="w-8 h-8 text-[#c9a227] -rotate-12 drop-shadow-lg" />
        </div>
      </div>

      <div className="text-center relative z-10 px-6">
        {/* Logo mark */}
        <div className="mx-auto mb-6 w-20 h-20 rounded-3xl bg-gradient-to-br from-[#c9a227] to-[#9a7b1a] flex items-center justify-center shadow-2xl shadow-[#c9a227]/20 animate-[floatY_3s_ease-in-out_infinite]">
          <Plane className="w-10 h-10 text-[#101a30] -rotate-12" />
        </div>

        {/* Brand with shimmer */}
        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-1">
          Safar<span className="text-[#c9a227]">Desk</span>
        </h1>
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
        @keyframes flyAcross {
          0% { transform: translateX(-15%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateX(115%); opacity: 0; }
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
