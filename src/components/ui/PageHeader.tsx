import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '../../utils/formatters';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
  badge,
  className = '',
}) => {
  return (
    <div className={cn('mb-6 pb-4 border-b border-slate-200/80', className)}>
      {/* Breadcrumb Navigation */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-slate-500 mb-2.5 font-medium" aria-label="Breadcrumb">
          <Link to="/" className="flex items-center gap-1 text-slate-400 hover:text-slate-700 transition">
            <Home className="w-3.5 h-3.5" />
            <span className="sr-only">Home</span>
          </Link>
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <React.Fragment key={index}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                {item.href && !isLast ? (
                  <Link
                    to={item.href}
                    className="hover:text-slate-900 transition-colors truncate max-w-[150px]"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className={cn(isLast ? 'text-slate-900 font-semibold truncate max-w-[200px]' : '')}>
                    {item.label}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      {/* Title & Actions Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--theme-primary)] sm:text-3xl">
              {title}
            </h1>
            {badge && <div>{badge}</div>}
          </div>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-500 max-w-3xl leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
