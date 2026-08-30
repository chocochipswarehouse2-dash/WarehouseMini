import React from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
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
      className="fixed top-4 right-4 left-4 md:left-auto md:w-96 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => {
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

        return (
          <div
            key={toast.id}
            id={`toast-${toast.id}`}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 ${bgClass}`}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              {icon}
              <span className="text-xs font-medium leading-snug break-words">{toast.message}</span>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="p-1 text-slate-400 hover:text-slate-100 rounded-lg transition-colors flex-shrink-0"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
