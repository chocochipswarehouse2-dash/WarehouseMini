import React, { useState } from 'react';
import { Sparkles, RotateCw, X, Info, Check } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { CURRENT_APP_VERSION_INFO, isNewerVersion } from '../../config/appVersion';

interface AppUpdateFloatingWidgetProps {
  onOpenModal: () => void;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const AppUpdateFloatingWidget: React.FC<AppUpdateFloatingWidgetProps> = ({ onOpenModal, onNotify }) => {
  const { status, latestVersion, currentVersion, releaseInfo, isMinimized, prepareUpdateInBackground, setMinimized } = useAppUpdate();
  const [isPrepared, setIsPrepared] = useState(false);

  const hasUpdate =
    status === 'available' ||
    status === 'ready' ||
    isNewerVersion(
      latestVersion,
      currentVersion,
      releaseInfo?.buildHash,
      CURRENT_APP_VERSION_INFO.buildHash
    );

  if (status === 'downloading') {
    return (
      <div className="fixed bottom-36 lg:bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-sm z-40 print:hidden animate-in fade-in duration-200">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-slate-900/95 text-white backdrop-blur-md shadow-2xl border border-emerald-500/40 text-xs font-bold">
          <RotateCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
          <span className="truncate">Mempersiapkan pembaruan {latestVersion}...</span>
        </div>
      </div>
    );
  }

  if (!hasUpdate || isMinimized) {
    return null;
  }

  const handlePrepareInBackground = () => {
    prepareUpdateInBackground();
    setIsPrepared(true);
    if (onNotify) {
      onNotify(`✅ Pembaruan ${latestVersion} disiapkan di latar belakang. Akan aktif otomatis saat berpindah menu tanpa reload layar sekarang.`, 'success');
    }
    setTimeout(() => {
      setMinimized(true);
    }, 1500);
  };

  return (
    <div className="fixed bottom-36 lg:bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-40 print:hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 p-2 sm:p-2.5 rounded-2xl bg-slate-900/95 dark:bg-slate-800/95 text-white backdrop-blur-md shadow-2xl border border-amber-500/40 ring-2 ring-amber-500/15 max-w-full overflow-hidden">
        <div
          onClick={onOpenModal}
          className="flex items-center gap-2 cursor-pointer pr-1 group min-w-0 flex-1"
          title="Lihat detail pembaruan & catatan rilis"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="text-left min-w-0 flex-1">
            <div className="text-[11px] sm:text-xs font-black text-white flex items-center gap-1.5 leading-tight">
              <span className="truncate">Update Tersedia</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                {latestVersion}
              </span>
            </div>
            <div className="text-[10px] text-slate-300 group-hover:text-amber-200 transition-colors truncate">
              {isPrepared ? '✅ Tersimpan (Aktif saat pindah menu)' : 'Aktif saat pindah menu · Lihat info'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handlePrepareInBackground}
            disabled={isPrepared}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] font-black transition-all flex items-center gap-1 sm:gap-1.5 cursor-pointer shadow-md shrink-0 ${
              isPrepared
                ? 'bg-emerald-700 text-white cursor-default'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title="Siapkan pembaruan di latar belakang (otomatis aktif saat Anda berpindah menu tanpa me-reload sekarang)"
          >
            {isPrepared ? (
              <>
                <Check className="w-3 h-3 shrink-0" />
                <span>Tersimpan</span>
              </>
            ) : (
              <>
                <RotateCw className="w-3 h-3 shrink-0" />
                <span>Perbarui</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenModal}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Lihat catatan rilis & opsi pembaruan"
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
    </div>
  );
};
