import React from 'react';
import { TENANT } from '../../config';

/**
 * AnimatedLogoLoader — Shows the company logo with a gentle pulse animation
 * during loading states, instead of a generic spinner.
 */
export const AnimatedLogoLoader: React.FC<{
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}> = ({ logoUrl, size = 'md', message }) => {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <div className="relative">
        {/* Pulsing ring */}
        <div
          className={`absolute inset-0 rounded-2xl animate-ping opacity-20 ${sizeClasses[size]}`}
          style={{ backgroundColor: 'var(--theme-primary)' }}
        />
        {/* Logo container with gentle float animation */}
        <div
          className={`${sizeClasses[size]} rounded-2xl bg-white shadow-lg border border-slate-200 flex items-center justify-center overflow-hidden animate-[float_3s_ease-in-out_infinite]`}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={TENANT.companyName}
              className="w-full h-full object-contain p-2"
            />
          ) : (
            <span
              className="text-2xl font-extrabold"
              style={{ color: 'var(--theme-primary)' }}
            >
              {TENANT.companyName.charAt(0)}
            </span>
          )}
        </div>
      </div>
      {message && (
        <p className="text-sm text-slate-500 font-medium animate-pulse">{message}</p>
      )}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
};
