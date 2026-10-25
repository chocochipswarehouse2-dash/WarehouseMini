import React from 'react';
import { Download, Sparkles, CheckCircle2, RotateCw, X } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';

interface AppUpdateFloatingWidgetProps {
  onOpenModal: () => void;
}

export const AppUpdateFloatingWidget: React.FC<AppUpdateFloatingWidgetProps> = ({ onOpenModal }) => {
  const { status, progress, latestVersion, downloadStats, applyUpdate, setMinimized } = useAppUpdate();

  // Show floating widget if downloading (minimized or not) or if update is ready
  if (status !== 'downloading' && status !== 'ready' && status !== 'available') {
    return null;
  }

  // If available but not downloading yet, we don't need a noisy floating widget unless user clicks check, but let's show subtle badge
  if (status === 'available') {
    return (
      <div className="fixed bottom-20 right-4 z-40 print:hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
        <button
          type="button"
          onClick={onOpenModal}
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-900/90 dark:bg-slate-800/90 hover:bg-slate-900 text-white backdrop-blur-md shadow-xl border border-amber-500/40 text-xs font-bold transition-all hover:scale-102 cursor-pointer ring-2 ring-amber-500/20"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <span>Update Tersedia: <strong className="font-mono text-amber-300">{latestVersion}</strong></span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300 font-extrabold uppercase">
            Unduh
          </span>
        </button>
      </div>
    );
  }

  if (status === 'downloading') {
    return (
      <div className="fixed bottom-20 right-4 z-40 print:hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div
          onClick={onOpenModal}
          className="flex flex-col gap-1.5 p-3 rounded-2xl bg-slate-900/95 dark:bg-slate-800/95 text-white backdrop-blur-md shadow-2xl border border-primary-500/50 cursor-pointer min-w-[240px] max-w-xs transition-all hover:scale-102 ring-2 ring-primary-500/20"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 font-bold text-slate-200">
              <Download className="w-3.5 h-3.5 text-primary-400 animate-bounce" />
              Mengunduh Update...
            </span>
            <span className="font-mono font-black text-primary-400">{progress}%</span>
          </div>

          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary-500 to-emerald-400 h-full rounded-full transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>{downloadStats.currentMB} / {downloadStats.totalMB} MB</span>
            <span className="text-primary-300">{downloadStats.speed}</span>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <div className="fixed bottom-20 right-4 z-40 print:hidden animate-in zoom-in-95 duration-300">
        <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-emerald-950/90 text-white backdrop-blur-md shadow-2xl border border-emerald-500/50 ring-2 ring-emerald-500/20">
          <div className="w-7 h-7 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-left pr-1 cursor-pointer" onClick={onOpenModal}>
            <div className="text-xs font-black text-emerald-300 leading-tight">Update Siap Dipasang!</div>
            <div className="text-[10px] text-slate-300 font-mono">{latestVersion}</div>
          </div>
          <button
            type="button"
            onClick={() => applyUpdate()}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <RotateCw className="w-3 h-3" />
            Mulai Ulang
          </button>
        </div>
      </div>
    );
  }

  return null;
};
