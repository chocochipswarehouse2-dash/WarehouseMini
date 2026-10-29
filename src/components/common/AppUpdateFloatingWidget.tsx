import React from 'react';
import { Sparkles, RotateCw, X, Info } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';

interface AppUpdateFloatingWidgetProps {
  onOpenModal: () => void;
}

export const AppUpdateFloatingWidget: React.FC<AppUpdateFloatingWidgetProps> = ({ onOpenModal }) => {
  const { status, latestVersion, isMinimized, applyUpdate, setMinimized } = useAppUpdate();

  if (status === 'downloading') {
    return (
      <div className="fixed bottom-20 right-4 z-40 print:hidden animate-in fade-in duration-200">
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-slate-900/95 text-white backdrop-blur-md shadow-2xl border border-emerald-500/40 text-xs font-bold">
          <RotateCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
          <span>Menerapkan pembaruan {latestVersion}...</span>
        </div>
      </div>
    );
  }

  if ((status !== 'available' && status !== 'ready') || isMinimized) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 print:hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-2 p-2.5 rounded-2xl bg-slate-900/95 dark:bg-slate-800/95 text-white backdrop-blur-md shadow-2xl border border-amber-500/40 ring-2 ring-amber-500/15">
        <div
          onClick={onOpenModal}
          className="flex items-center gap-2.5 cursor-pointer pr-1 group"
          title="Lihat detail pembaruan & catatan rilis"
        >
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-xs font-black text-white flex items-center gap-1.5 leading-tight">
              <span>Update Tersedia</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {latestVersion}
              </span>
            </div>
            <div className="text-[10px] text-slate-300 group-hover:text-amber-200 transition-colors">
              Aktif otomatis saat pindah menu · Lihat info
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => applyUpdate()}
          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md shrink-0"
          title="Muat ulang halaman sekarang tanpa menghapus sesi login"
        >
          <RotateCw className="w-3 h-3" />
          <span>Perbarui</span>
        </button>

        <button
          type="button"
          onClick={onOpenModal}
          className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          title="Lihat catatan rilis"
        >
          <Info className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          title="Sembunyikan ke Sidebar (Pembaruan akan otomatis aktif saat Anda pindah menu)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
