import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X, ArrowRight } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div
      id="toastContainer"
      className="fixed top-4 right-4 left-4 md:left-auto md:w-96 z-[100] flex flex-col gap-2 pointer-events-none print:hidden"
    >
      {toasts.map((toast, tIdx) => {
        let bgClass = 'bg-slate-900/95 border-slate-800 text-slate-100 shadow-2xl';
        let icon = <Info className="w-4 h-4 text-sky-400 flex-shrink-0" />;

        if (toast.type === 'success') {
          bgClass = 'bg-[#0F0F12]/95 border-emerald-500/40 text-slate-100 shadow-[0_0_20px_rgba(16,185,129,0.2)]';
          icon = <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
        } else if (toast.type === 'error') {
          bgClass = 'bg-[#0F0F12]/95 border-rose-500/40 text-slate-100 shadow-[0_0_20px_rgba(244,63,94,0.2)]';
          icon = <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />;
        } else if (toast.type === 'warning') {
          bgClass = 'bg-[#0F0F12]/95 border-amber-500/40 text-slate-100 shadow-[0_0_20px_rgba(245,158,11,0.2)]';
          icon = <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />;
        }

        const isClickable = typeof toast.onClick === 'function';

        return (
          <div
            key={toast.id ? `toast-${toast.id}` : `toast-idx-${tIdx}`}
            id={`toast-${toast.id}`}
            onClick={() => {
              if (toast.onClick) {
                toast.onClick();
                onDismiss(toast.id);
              }
            }}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            className={`pointer-events-auto flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl border backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 ${bgClass} ${
              isClickable ? 'cursor-pointer hover:border-indigo-400/80 hover:scale-[1.01] active:scale-[0.99]' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
              {icon}
              <span className="text-xs font-medium leading-snug break-words">{toast.message}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isClickable && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold whitespace-nowrap shadow-xs">
                  <span>{toast.actionLabel || 'Buka'}</span>
                  <ArrowRight className="w-3 h-3" />
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(toast.id);
                }}
                className="p-1 text-slate-400 hover:text-slate-100 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
                aria-label="Dismiss toast"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
