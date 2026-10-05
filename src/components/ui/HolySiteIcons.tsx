import React from 'react';

/**
 * Minimal Kaaba icon — black cube with gold band
 */
export const KaabaIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <rect x="4" y="7" width="16" height="13" rx="1" fill="#1a1a1a" />
    <rect x="4" y="10" width="16" height="2.5" fill="#c9a227" />
    <rect x="4" y="7" width="16" height="13" rx="1" stroke="currentColor" strokeWidth="1" opacity="0.2" />
  </svg>
);

/**
 * Minimal Masjid Nabawi icon — mosque with dome and minarets
 */
export const MasjidNabawiIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    {/* Main building */}
    <rect x="6" y="12" width="12" height="8" rx="1" fill="currentColor" opacity="0.85" />
    {/* Dome */}
    <path d="M12 4 C 9 7, 8 9, 8 12 L 16 12 C 16 9, 15 7, 12 4 Z" fill="currentColor" />
    {/* Crescent on dome */}
    <path d="M12 2.5 a1.2 1.2 0 1 0 0.1 0" stroke="#c9a227" strokeWidth="1" fill="none" />
    {/* Minarets */}
    <rect x="3.5" y="8" width="1.8" height="12" rx="0.9" fill="currentColor" opacity="0.7" />
    <rect x="18.7" y="8" width="1.8" height="12" rx="0.9" fill="currentColor" opacity="0.7" />
    <circle cx="4.4" cy="7" r="1" fill="currentColor" opacity="0.7" />
    <circle cx="19.6" cy="7" r="1" fill="currentColor" opacity="0.7" />
    {/* Door */}
    <rect x="10.8" y="15" width="2.4" height="5" rx="1.2" fill="#fff" opacity="0.9" />
  </svg>
);
