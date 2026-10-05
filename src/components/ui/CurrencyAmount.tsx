import React from 'react';
import { formatDualCurrency, cn } from '../../utils/formatters';
import { TENANT } from '../../config';
import { getCurrentRate } from '../../services/exchangeRateService';

interface CurrencyAmountProps {
  amountSar: number | null | undefined;
  rate?: number;
  layout?: 'stacked' | 'inline' | 'dual-badge' | 'sar-only';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  align?: 'left' | 'right' | 'center';
  className?: string;
  showRateTooltip?: boolean;
}

export const CurrencyAmount: React.FC<CurrencyAmountProps> = ({
  amountSar,
  rate = getCurrentRate('SAR-PKR'),
  layout = 'stacked',
  size = 'md',
  align = 'right',
  className = '',
  showRateTooltip = true,
}) => {
  const { sar, pkr, rawSar, rawPkr } = formatDualCurrency(amountSar, rate);

  const alignStyles = {
    left: 'text-left items-start',
    right: 'text-right items-end',
    center: 'text-center items-center',
  };

  const sizeStyles = {
    sm: {
      sar: 'text-xs font-semibold',
      pkr: 'text-[11px] text-slate-500',
    },
    md: {
      sar: 'text-sm font-semibold',
      pkr: 'text-xs text-slate-500',
    },
    lg: {
      sar: 'text-base font-bold',
      pkr: 'text-xs text-slate-500',
    },
    xl: {
      sar: 'text-xl font-bold',
      pkr: 'text-sm text-slate-500',
    },
  };

  if (layout === 'sar-only') {
    return (
      <span className={cn('font-mono tabular-nums text-slate-900', sizeStyles[size].sar, className)}>
        {sar}
      </span>
    );
  }

  if (layout === 'inline') {
    return (
      <span
        title={showRateTooltip ? `Conversion Rate: 1 SAR = ${rate.toFixed(2)} PKR` : undefined}
        className={cn(
          'inline-flex items-center gap-1.5 font-mono tabular-nums whitespace-nowrap',
          sizeStyles[size].sar,
          className
        )}
      >
        <span className="text-slate-900">{sar}</span>
        <span className="text-slate-300 font-normal">/</span>
        <span className="text-slate-500 font-normal text-xs">{pkr}</span>
      </span>
    );
  }

  if (layout === 'dual-badge') {
    return (
      <div className={cn('inline-flex items-center gap-1.5', className)}>
        <span className="px-2 py-0.5 rounded bg-navy-50 text-[#0e2c4c] border border-navy-100 font-mono font-semibold text-xs tabular-nums">
          {sar}
        </span>
        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 font-mono text-xs tabular-nums">
          {pkr}
        </span>
      </div>
    );
  }

  // Default 'stacked' layout
  return (
    <div
      title={showRateTooltip ? `Rate: 1 SAR = ${rate.toFixed(2)} PKR` : undefined}
      className={cn('flex flex-col font-mono tabular-nums leading-tight', alignStyles[align], className)}
    >
      <span className={cn('text-slate-900 tracking-tight', sizeStyles[size].sar)}>
        {sar}
      </span>
      <span className={cn('tracking-normal font-sans', sizeStyles[size].pkr)}>
        ≈ {pkr}
      </span>
    </div>
  );
};
