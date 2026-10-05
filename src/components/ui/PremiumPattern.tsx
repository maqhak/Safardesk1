import React, { useMemo } from 'react';
import { KaabaIcon } from './HolySiteIcons';

/**
 * PremiumPattern — subtle luxury travel-brand overlay for the navbar & drawer.
 *
 * Layers (all pointer-events-none, never blocks interaction):
 *  1. Islamic 8-pointed star (khatam) geometric lattice, tiled as an SVG
 *     data-URI in a soft gold stroke at very low opacity.
 *  2. A gold radial sheen from the top + a soft vignette at the bottom,
 *     giving the flat theme gradient a rich, high-end depth.
 *  3. (drawer only) a large faint Kaaba silhouette watermark in the
 *     bottom corner — elegant, unmistakably Umrah-travel.
 */
const STAR_TILE = `<svg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 84 84'>
  <g fill='none' stroke='%23d4af37' stroke-width='1'>
    <rect x='20' y='20' width='44' height='44'/>
    <rect x='20' y='20' width='44' height='44' transform='rotate(45 42 42)'/>
    <circle cx='42' cy='42' r='7'/>
    <circle cx='42' cy='42' r='1.6' fill='%23d4af37' stroke='none'/>
    <path d='M42 0v12M42 72v12M0 42h12M72 42h12'/>
  </g>
</svg>`;

export const PremiumPattern: React.FC<{ variant?: 'navbar' | 'drawer' }> = ({
  variant = 'navbar',
}) => {
  const tileUrl = useMemo(
    () => `url("data:image/svg+xml,${encodeURIComponent(STAR_TILE)}")`,
    []
  );

  const patternOpacity = variant === 'drawer' ? 0.16 : 0.1;

  return (
    <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* 1. Islamic geometric lattice */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: tileUrl,
          backgroundSize: '84px 84px',
          opacity: patternOpacity,
        }}
      />
      {/* 2. Gold sheen from top + deep vignette at bottom */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 15% 0%, rgba(212,175,55,0.16) 0%, rgba(212,175,55,0.04) 40%, transparent 65%),' +
            'linear-gradient(to bottom, rgba(255,255,255,0.05) 0%, transparent 30%, rgba(0,0,0,0.14) 100%)',
        }}
      />
      {/* 3. Drawer watermark — faint Kaaba silhouette */}
      {variant === 'drawer' && (
        <KaabaIcon className="absolute -bottom-8 -right-8 w-56 h-56 opacity-[0.07] text-[#d4af37]" />
      )}
    </div>
  );
};
