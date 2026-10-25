import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Download,
  Smartphone,
  Layers,
  ArrowRight,
  ShieldCheck,
  Minimize2,
  HardDriveDownload,
  Info,
  RotateCw,
  Trash2
} from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import { CURRENT_APP_VERSION, CURRENT_APP_VERSION_INFO } from '../../config/appVersion';

interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({ isOpen, onClose }) => {
  const {
    status,
    currentVersion,
    latestVersion,
    releaseInfo,
    progress,
    downloadStats,
    lastChecked,
    errorMessage,
    checkForUpdates,
    startDownload,
    applyUpdate,
    clearCacheAndReload,
    setMinimized
  } = useAppUpdate();

  const [isClearingCache, setIsClearingCache] = useState(false);

  if (!isOpen) return null;

  const notes = releaseInfo?.releaseNotes || CURRENT_APP_VERSION_INFO.releaseNotes;
  const isUpToDate = status === 'up-to-date' || (status !== 'available' && status !== 'ready' && currentVersion === latestVersion);

  const handleMinimize = () => {
    setMinimized(true);
    onClose();
  };

  const handleEmergencyReset = async () => {
    if (window.confirm('Tindakan ini akan membersihkan semua cache browser, unregister Service Worker, dan me-reload aplikasi. Lanjutkan?')) {
      setIsClearingCache(true);
      await clearCacheAndReload();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#131d31] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col my-8">
        
        {/* Header ala Android System Update */}
        <div className="p-5 pb-4 bg-gradient-to-r from-slate-900 via-primary-950 to-slate-900 text-white relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-primary-400 shadow-inner">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                  Pembaruan Sistem WMS
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-500/30 text-primary-300 border border-primary-500/40">
                    OTA Update
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  Pusat manajemen versi & rilis aplikasi pergudangan
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {status === 'downloading' && (
                <button
                  type="button"
                  onClick={handleMinimize}
                  title="Minimize ke latar belakang"
                  className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          
          {/* Card Status Versi Terpasang vs Versi Cloud */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Versi Terpasang
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-slate-800 dark:text-slate-100 font-mono">
                  {currentVersion}
                </span>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Aktif di browser ini" />
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                Build: {CURRENT_APP_VERSION_INFO.buildDate}
              </span>
            </div>

            <div className="space-y-1 border-l border-slate-200 dark:border-slate-800 pl-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Versi Terbaru Cloud
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-primary-600 dark:text-primary-400 font-mono">
                  {latestVersion}
                </span>
                {status === 'available' && (
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                    BARU
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                {lastChecked ? `Dicek: ${lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Belum dicek'}
              </span>
            </div>
          </div>

          {/* STATE 1: DOWNLOADING (ANIMASI 0 - 100%) */}
          {status === 'downloading' && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary-500/5 via-primary-500/10 to-transparent border border-primary-500/30 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-primary-500 text-white flex items-center justify-center animate-bounce shadow-md shadow-primary-500/30">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                      Mengunduh Pembaruan...
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {downloadStats.stepMessage}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-primary-600 dark:text-primary-400 font-mono">
                    {progress}%
                  </span>
                </div>
              </div>

              {/* Progress Bar Smooth */}
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 shadow-inner">
                <div
                  className="bg-gradient-to-r from-primary-600 via-primary-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out relative"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>

              {/* Data metrics */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-1">
                <span>{downloadStats.currentMB} MB / {downloadStats.totalMB} MB</span>
                <span className="font-bold text-primary-500">{downloadStats.speed}</span>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Bebas Bekerja:</strong> Proses pengunduhan berjalan di latar belakang. Anda dapat menutup jendela ini dan tetap memindai / picking seperti biasa.
                </span>
              </div>
            </div>
          )}

          {/* STATE 2: READY TO APPLY (100% SELESAI) */}
          {status === 'ready' && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 animate-in zoom-in-95">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    Pembaruan Siap Diterapkan!
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Modul baru {latestVersion} telah siap dipasang. Klik tombol di bawah untuk memuat ulang aplikasi.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => applyUpdate()}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                  Mulai Ulang & Pasang Sekarang
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  Nanti Saja
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: UPDATE AVAILABLE (BELUM DIUNDUH) */}
          {status === 'available' && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    Versi Baru Tersedia: {latestVersion}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Peningkatan sistem, fitur baru, dan perbaikan stabilitas gudang telah dirilis.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={startDownload}
                className="w-full py-3 px-4 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-black shadow-lg shadow-primary-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <HardDriveDownload className="w-4 h-4" />
                Unduh Pembaruan Sekarang (4.8 MB)
              </button>
            </div>
          )}

          {/* STATE 4: UP TO DATE */}
          {isUpToDate && status !== 'downloading' && (
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">
                  Sistem Sudah Menggunakan Versi Terbaru
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tidak ada pembaruan tertunda. Semua modul operasional siap digunakan dengan lancar.
                </p>
              </div>
            </div>
          )}

          {/* ERROR ALERT */}
          {status === 'error' && errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <span className="font-bold block">Pemeriksaan Pembaruan Terkendala</span>
                <span className="text-[11px] text-slate-600 dark:text-slate-300 block">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* RELEASE HIGHLIGHTS / CHANGELOG BOX */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary-500" />
                Catatan Rilis & Fitur Baru
              </h4>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {releaseInfo?.version || currentVersion}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px] pb-1 border-b border-slate-200 dark:border-slate-800">
                {releaseInfo?.releaseTitle || CURRENT_APP_VERSION_INFO.releaseTitle}
              </div>
              <ul className="space-y-1.5 text-slate-600 dark:text-slate-400 text-[11px]">
                {notes.map((note, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 shrink-0" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* TOMBOL TINDAKAN: PERIKSA PEMBARUAN & BERSIHKAN CACHE */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => checkForUpdates(false)}
                disabled={status === 'checking' || status === 'downloading'}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${status === 'checking' ? 'animate-spin' : ''}`} />
                {status === 'checking' ? 'Memeriksa Server...' : 'Periksa Pembaruan'}
              </button>

              <button
                type="button"
                onClick={handleEmergencyReset}
                disabled={isClearingCache}
                title="Bersihkan cache browser jika aplikasi terasa lambat atau stuck di versi lama"
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer border border-transparent hover:border-rose-200 dark:hover:border-rose-800"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Bersihkan Cache</span>
              </button>
            </div>
            
            <p className="text-[10px] text-center text-slate-400 dark:text-slate-500">
              Pembaruan berjalan dengan aman tanpa menghapus riwayat scan atau data lokal perangkat Anda.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
