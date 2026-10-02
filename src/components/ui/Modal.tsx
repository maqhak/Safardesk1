import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/formatters';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  className?: string;
  closeOnEsc?: boolean;
  closeOnBackdrop?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  className = '',
  closeOnEsc = true,
  closeOnBackdrop = true,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-5xl',
    full: 'max-w-[95vw] h-[90vh]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto print:static print:block print:p-0 print:overflow-visible">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200 print:hidden"
        onClick={() => closeOnBackdrop && onClose()}
        aria-hidden="true"
      />

      {/* Modal Dialog Box */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative w-full bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-10 flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150',
          sizeClasses[size],
          'print:max-w-none print:max-h-none print:rounded-none print:shadow-none print:border-0 print:overflow-visible print:block',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4.5 border-b border-slate-100 bg-slate-50/50 print:hidden">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors -mr-1"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1 text-sm text-slate-700 leading-relaxed print:overflow-visible print:px-0 print:py-0">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-3 print:hidden">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
