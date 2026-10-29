import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Layers,
  ShieldCheck,
  Info,
  RotateCw,
  Trash2,
  Database,
  ChevronDown,
  ChevronUp,
  History
} from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';
import {
  CURRENT_APP_VERSION_INFO,
  VERSION_HISTORY,
  isNewerVersion
} from '../../config/appVersion';
import { UserSession } from '../../types';
import { isSuperadmin } from '../../services/permissions';

interface AppUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  session?: UserSession | null;
  onOpenUpdateDatabase?: () => void;
}

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  isOpen,
  onClose,
  session = null,
  onOpenUpdateDatabase
}) => {
  const {
    status,
    currentVersion,
    latestVersion,
    releaseInfo,
    lastChecked,
    errorMessage,
    checkForUpdates,
    applyUpdate,
    clearCacheAndReload,
    setMinimized
  } = useAppUpdate();

  const [isClearingCache, setIsClearingCache] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const userIsAdmin = isSuperadmin(session);

  if (!isOpen) return null;

  const notes = releaseInfo?.releaseNotes || CURRENT_APP_VERSION_INFO.releaseNotes;
  const hasUpdate =
    status === 'available' ||
    status === 'ready' ||
    isNewerVersion(
      latestVersion,
      currentVersion,
      releaseInfo?.buildHash,
      CURRENT_APP_VERSION_INFO.buildHash
    );
  const isUpToDate = !hasUpdate && status !== 'downloading';

  const handleDeferToNavigation = () => {
    setMinimized(true);
    onClose();
  };

  const handleEmergencyReset = async () => {
    if (
      window.confirm(
        'Tindakan ini akan membersihkan cache file browser dan memuat ulang aplikasi. Sesi login Anda dan data stok di server tetap 100% aman. Lanjutkan?'
      )
    ) {
      setIsClearingCache(true);
      await clearCacheAndReload();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-[#131d31] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col my-8 max-h-[90vh]">
        {/* Header */}
        <div className="p-5 pb-4 bg-gradient-to-r from-slate-900 via-primary-950 to-slate-900 text-white relative shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center text-primary-400 shadow-inner">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                  {userIsAdmin ? 'Pembaruan Sistem WMS' : 'Pembaruan Aplikasi WMS'}
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      userIsAdmin
                        ? 'bg-purple-500/30 text-purple-200 border-purple-400/40'
                        : 'bg-emerald-500/30 text-emerald-200 border-emerald-400/40'
                    }`}
                  >
                    {userIsAdmin ? 'SUPERADMIN' : session?.role || 'AKTIF'}
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  Pembaruan aman tanpa memutus sesi login atau pekerjaan aktif
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Card Status Versi Terpasang vs Versi Cloud */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Versi Aktif di Perangkat
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-slate-800 dark:text-slate-100 font-mono">
                  {currentVersion}
                </span>
                <span
                  className="inline-block w-2 h-2 rounded-full bg-emerald-500"
                  title="Aktif di browser ini"
                />
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                Rilis: {CURRENT_APP_VERSION_INFO.buildDate}
              </span>
            </div>

            <div className="space-y-1 border-l border-slate-200 dark:border-slate-800 pl-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Versi Terbaru Server
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-black text-primary-600 dark:text-primary-400 font-mono">
                  {latestVersion}
                </span>
                {hasUpdate && (
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                    BARU
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                {lastChecked
                  ? `Dicek: ${lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : `Build: ${releaseInfo?.buildDate || CURRENT_APP_VERSION_INFO.buildDate}`}
              </span>
            </div>
          </div>

          {/* STATE 1: APPLYING UPDATE */}
          {status === 'downloading' && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 animate-in fade-in">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <RotateCw className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                  Menerapkan Pembaruan {latestVersion}...
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Memuat ulang modul terbaru dengan tetap mempertahankan sesi login Anda.
                </p>
              </div>
            </div>
          )}

          {/* STATE 2: UPDATE READY / AVAILABLE (1-CLICK APPLY OR AUTO ON MENU SWITCH) */}
          {hasUpdate && status !== 'downloading' && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 animate-in zoom-in-95">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/25 shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white">
                    Pembaruan Tersedia ({latestVersion})
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                    Jika Anda sedang mengisi form atau melakukan scan, pilih{' '}
                    <strong>Nanti (Otomatis Saat Pindah Menu)</strong> agar pekerjaan Anda tidak terputus.
                  </p>
                </div>
              </div>

              <div className="pt-1 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => applyUpdate()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                  Perbarui Sekarang (1-Klik)
                </button>
                <button
                  type="button"
                  onClick={handleDeferToNavigation}
                  className="py-2.5 px-3.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  Nanti (Saat Pindah Menu)
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: UP TO DATE */}
          {isUpToDate && (
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">
                  Aplikasi Sudah Menggunakan Versi Terbaru ({currentVersion})
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Semua modul operasional berjalan pada rilis terbaru dan terproteksi dari reload mendadak.
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
                <span className="text-[11px] text-slate-600 dark:text-slate-300 block">
                  {errorMessage}
                </span>
              </div>
            </div>
          )}

          {/* MULTI-USER SAFE UPDATE PROTECTION INFO */}
          <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-extrabold text-slate-800 dark:text-slate-100 block">
                Proteksi Multi-User & Sesi Login Aktif
              </span>
              <span>
                Sistem tidak akan pernah me-reload layar secara paksa saat Anda sedang mengetik pesanan, mengedit tabel, atau memindai barcode. Sesi login akun Anda tetap tersimpan 100% saat pembaruan diterapkan.
              </span>
            </div>
          </div>

          {/* RELEASE HIGHLIGHTS / CHANGELOG BOX */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-primary-500" />
                Catatan Rilis Terbaru
              </h4>
              <span className="text-[10px] font-bold text-slate-400 font-mono">
                {releaseInfo?.version || currentVersion} · {releaseInfo?.buildDate || CURRENT_APP_VERSION_INFO.buildDate}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px] pb-1.5 border-b border-slate-200 dark:border-slate-800">
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

            {/* Collapsible Previous Release History */}
            {VERSION_HISTORY && VERSION_HISTORY.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowHistory((prev) => !prev)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-slate-400" />
                    Riwayat Pembaruan Sebelumnya ({VERSION_HISTORY.length} versi)
                  </span>
                  {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showHistory && (
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto pr-1">
                    {VERSION_HISTORY.map((hist) => (
                      <div
                        key={hist.version}
                        className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/30 border border-slate-200/80 dark:border-slate-800/80 space-y-1.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-200">
                          <span>{hist.releaseTitle}</span>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                            {hist.buildDate}
                          </span>
                        </div>
                        <ul className="space-y-1 text-slate-500 dark:text-slate-400 text-[10px]">
                          {hist.releaseNotes.map((n, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                              <span>{n}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SUPERADMIN ONLY TOOLS: Database Update & Master Produk */}
          {userIsAdmin && (
            <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                  Menu Superadmin: Database Master Produk
                </span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-black bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-800">
                  SUPERADMIN ONLY
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Pembaruan di atas adalah versi aplikasi web. Untuk mengunggah Master Produk CSV ke database Supabase, gunakan menu di bawah:
              </p>
              {onOpenUpdateDatabase && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenUpdateDatabase();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Database className="w-3.5 h-3.5" />
                  Buka Menu Update Database Master Produk (2 CSV)
                </button>
              )}
            </div>
          )}

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
                title="Bersihkan cache file browser tanpa menghapus sesi login jika aplikasi terasa lambat"
                className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer border border-transparent hover:border-rose-200 dark:hover:border-rose-800"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset Cache</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
