import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);

    const duration = toast.duration ?? 4500;
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const success = useCallback((message: string, title?: string) => {
    addToast({ type: 'success', message, title });
  }, [addToast]);

  const error = useCallback((message: string, title?: string) => {
    addToast({ type: 'error', message, title });
  }, [addToast]);

  const info = useCallback((message: string, title?: string) => {
    addToast({ type: 'info', message, title });
  }, [addToast]);

  const warning = useCallback((message: string, title?: string) => {
    addToast({ type: 'warning', message, title });
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, info, warning }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => {
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-lg shadow-lg border text-sm transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 ${
                t.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : t.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                  : t.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-navy-50 border-navy-200 text-navy-950'
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                {t.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600" />}
                {t.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
                {t.type === 'info' && <Info className="w-5 h-5 text-[var(--theme-primary)]" />}
              </div>
              <div className="flex-1 min-w-0">
                {t.title && <div className="font-semibold text-xs tracking-wide uppercase opacity-90 mb-0.5">{t.title}</div>}
                <div className="text-sm font-medium leading-relaxed">{t.message}</div>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 text-slate-400 hover:text-slate-700 p-1 -mr-1 -mt-1 rounded hover:bg-black/5 transition"
                aria-label="Close notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

const noop = () => {};
const fallbackToastContext: ToastContextType = {
  toasts: [],
  addToast: noop,
  removeToast: noop,
  success: (msg: string, title?: string) => console.log('[Toast success]', title || '', msg),
  error: (msg: string, title?: string) => console.error('[Toast error]', title || '', msg),
  info: (msg: string, title?: string) => console.info('[Toast info]', title || '', msg),
  warning: (msg: string, title?: string) => console.warn('[Toast warning]', title || '', msg),
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    return fallbackToastContext;
  }
  return context;
};
