import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '../../utils/formatters';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  subValue?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: {
    value: number; // e.g. 12.5 for +12.5%
    label?: string; // e.g. "vs last month"
  };
  variant?: 'default' | 'navy' | 'gold';
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subValue,
  icon,
  trend,
  variant = 'default',
  onClick,
  className = '',
}) => {
  const isPositive = trend ? trend.value > 0 : false;
  const isNeutral = trend ? trend.value === 0 : false;

  const variantStyles = {
    default: 'bg-white border-slate-200/90 text-slate-900',
    navy: 'bg-[#0e2c4c] border-[#0e2c4c] text-white',
    gold: 'bg-gradient-to-br from-[#c9a227] to-[#a8851b] border-[#c9a227] text-white',
  };

  const iconBgStyles = {
    default: 'bg-navy-50 text-[#0e2c4c]',
    navy: 'bg-white/10 text-white',
    gold: 'bg-white/20 text-white',
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border p-5 shadow-xs transition-all duration-200 flex flex-col justify-between',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-xs font-semibold uppercase tracking-wider', variant === 'default' ? 'text-slate-500' : 'text-white/80')}>
            {label}
          </p>
          <div className="mt-2 text-2xl font-bold tracking-tight tabular-nums flex items-baseline gap-2">
            {value}
          </div>
          {subValue && (
            <div className={cn('mt-1 text-xs tabular-nums', variant === 'default' ? 'text-slate-500' : 'text-white/80')}>
              {subValue}
            </div>
          )}
        </div>
        {icon && (
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', iconBgStyles[variant])}>
            {icon}
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-4 pt-3 border-t border-slate-100/80 flex items-center gap-2 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium',
              isNeutral
                ? 'bg-slate-100 text-slate-600'
                : isPositive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            )}
          >
            {isNeutral ? (
              <Minus className="w-3 h-3" />
            ) : isPositive ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            <span>{Math.abs(trend.value)}%</span>
          </span>
          <span className={cn('text-slate-500', variant !== 'default' && 'text-white/70')}>
            {trend.label || 'vs previous period'}
          </span>
        </div>
      )}
    </div>
  );
};
