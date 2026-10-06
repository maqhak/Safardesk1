import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/formatters';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-dashed border-slate-300',
        className
      )}
    >
      <div className="w-14 h-14 rounded-2xl bg-navy-50 text-[var(--theme-primary)] flex items-center justify-center mb-4 border border-navy-100/50 shadow-xs">
        <Icon className="w-7 h-7 stroke-[1.75]" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 tracking-tight mb-1">
        {title}
      </h3>
      <p className="text-sm text-slate-500 max-w-md mb-6 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="primary" size="md" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
