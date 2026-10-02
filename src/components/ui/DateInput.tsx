import React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '../../utils/formatters';

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ label, helperText, error, required, className = '', id, value, ...props }, ref) => {
    const inputId = id || `date-input-${Math.random().toString(36).substring(2, 7)}`;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1">
            <span>{label}</span>
            {required && <span className="text-rose-500">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type="date"
            value={value}
            className={cn(
              'w-full px-3.5 py-2 pl-10 text-sm bg-white border rounded-lg text-slate-900',
              'transition-all duration-150 shadow-2xs font-mono',
              'focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/30 focus:border-[#0e2c4c]',
              error
                ? 'border-rose-400 focus:ring-rose-200 focus:border-rose-500'
                : 'border-slate-300 hover:border-slate-400',
              className
            )}
            {...props}
          />
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
            <Calendar className="w-4 h-4" />
          </div>
        </div>
        {error ? (
          <p className="text-xs text-rose-600 font-medium">{error}</p>
        ) : helperText ? (
          <p className="text-xs text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

DateInput.displayName = 'DateInput';
