import React, { useState, useEffect } from 'react';
import {
  Factory,
  Minimize2,
  X,
  ExternalLink,
  Wifi,
  WifiOff,
  RefreshCw,
  CloudUpload,
  ShieldCheck,
  FileText
} from 'lucide-react';
import { UserSession, ProductItem } from '../types';
import { PenerimaanProduksiView } from './PenerimaanProduksiView';
import { syncOfflinePenerimaanProduksi } from '../services/supabase';
import { getPendingOfflineProduksiCount } from '../services/localDb';
import { getActiveProduksiInputDraftSummary } from '../services/scannerOutboxService';

export interface ProduksiInputPopupModalProps {
  isOpen: boolean;
  isMinimized: boolean;
  onMinimizeChange: (minimized: boolean) => void;
  onClose: () => void;
  onOpenFullPage: () => void;
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onNotify: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const ProduksiInputPopupModal: React.FC<ProduksiInputPopupModalProps> = ({
  isOpen,
  isMinimized,
  onMinimizeChange,
  onClose,
  onOpenFullPage,
  session,
  productCatalog = [],
  onNotify
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(() =>
    getPendingOfflineProduksiCount()
  );
  const [draftSummary, setDraftSummary] = useState(() => getActiveProduksiInputDraftSummary());
  const [isSyncingOffline, setIsSyncingOffline] = useState<boolean>(false);

  const refreshStatus = () => {
    setPendingOfflineCount(getPendingOfflineProduksiCount());
    setDraftSummary(getActiveProduksiInputDraftSummary());
  };

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    refreshStatus();

    const handleOnline = () => {
      setIsOnline(true);
      refreshStatus();
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('wms_produksi_draft_updated', refreshStatus);
    window.addEventListener('wms_penerimaan_produksi_updated', refreshStatus);
    window.addEventListener('wms_scanner_outbox_updated', refreshStatus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('wms_produksi_draft_updated', refreshStatus);
      window.removeEventListener('wms_penerimaan_produksi_updated', refreshStatus);
      window.removeEventListener('wms_scanner_outbox_updated', refreshStatus);
    };
  }, [isOpen, isMinimized]);

  // Escape key minimizes the popup instead of destroying work
  useEffect(() => {
    if (!isOpen || isMinimized) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const activeTag = document.activeElement?.tagName.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
          return;
        }
        onMinimizeChange(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMinimized, onMinimizeChange]);

  const handleManualSyncOffline = async () => {
    if (!isOnline || isSyncingOffline) return;
    setIsSyncingOffline(true);
    try {
      const res = await syncOfflinePenerimaanProduksi();
      refreshStatus();
      if (res.synced > 0) {
        onNotify(
          `✅ Berhasil menyinkronkan ${res.synced} baris penerimaan produksi offline ke Supabase (Zero Double-Input)!`,
          'success'
        );
      } else if (res.failed > 0) {
        onNotify(
          `⚠️ Sebagian data belum terkirim (${res.errors[0] || 'Gangguan jaringan'}). Data tetap aman di antrean lokal.`,
          'warning'
        );
      } else {
        onNotify('Seluruh antrean offline penerimaan produksi sudah tersinkron.', 'info');
      }
    } finally {
      setIsSyncingOffline(false);
    }
  };

  // ZERO-DOM WHEN MINIMIZED OR CLOSED (Anti-Freeze Guard)
  // Minimized pill is rendered by Unified MinimizedWorkspacesDock
  if (!isOpen || isMinimized) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-3 lg:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 print:hidden">
      <div className="bg-slate-50 dark:bg-[#0f172a] w-full max-w-[1680px] h-[95dvh] sm:h-[92dvh] rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <div className="px-3.5 sm:px-5 py-2.5 sm:py-3.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-white flex items-center justify-center shadow-sm shrink-0 ${
                draftSummary.kategori === 'Kargo'
                  ? 'bg-blue-600 shadow-blue-500/20'
                  : 'bg-teal-600 shadow-teal-500/20'
              }`}
            >
              <Factory className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight truncate">
                  {draftSummary.kategori === 'Kargo'
                    ? 'Form Input Penerimaan Kargo'
                    : 'Form Input Penerimaan Produksi (CMT & Kargo)'}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    draftSummary.kategori === 'Kargo'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/60'
                      : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border-teal-200/60 dark:border-teal-800/60'
                  }`}
                >
                  {draftSummary.kategori === 'Kargo' ? '🚚 Kargo' : '🏭 Lokal CMT'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    isOnline
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                  }`}
                >
                  {isOnline ? (
                    <>
                      <Wifi className="w-3 h-3 text-emerald-500" />
                      <span>Online · Auto-Save Aktif</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3 text-amber-500" />
                      <span>Mode Offline · Draft Terlindungi</span>
                    </>
                  )}
                </span>
                {draftSummary.hasDraft && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                    <FileText className="w-3 h-3" />
                    Draft: {draftSummary.noSuratJalan || 'SJ/Resi Baru'} ({draftSummary.modelCount} Kode · {draftSummary.totalPcs} pcs)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Pencatatan kedatangan Lokal CMT &amp; Kargo dengan penyimpanan draft otomatis &amp; antrean offline
              </p>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            <button
              type="button"
              onClick={onOpenFullPage}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/70 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Buka di Halaman Produksi Penuh"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Halaman Penuh</span>
            </button>

            <button
              type="button"
              onClick={() => onMinimizeChange(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Minimize ke Dock Bawah (Tetap menyimpan draft tanpa membebani RAM)"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Minimize</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
              title="Tutup Popup (Draft form tetap tersimpan aman)"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Offline Outbox Banner (Visible when there are pending offline rows or device is offline) */}
        {(pendingOfflineCount > 0 || !isOnline) && (
          <div
            className={`px-4 py-2 border-b flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 ${
              !isOnline
                ? 'bg-amber-500/15 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                : 'bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
              <div className="min-w-0">
                {pendingOfflineCount > 0 ? (
                  <span>
                    <strong>Antrean Sinkronisasi:</strong>{' '}
                    <span className="font-mono font-bold">{pendingOfflineCount} baris varian</span>{' '}
                    tersimpan di perangkat dan siap dikirim ke server.
                  </span>
                ) : (
                  <span>
                    <strong>Mode Offline:</strong> Data Surat Jalan yang disimpan akan disinkronkan otomatis saat koneksi kembali tersedia.
                  </span>
                )}
              </div>
            </div>

            {pendingOfflineCount > 0 && isOnline && (
              <button
                type="button"
                onClick={handleManualSyncOffline}
                disabled={isSyncingOffline}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isSyncingOffline ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyinkronkan...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>Kirim Sekarang ({pendingOfflineCount})</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Main Workspace Body */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 lg:p-5">
          <PenerimaanProduksiView
            session={session}
            productCatalog={productCatalog}
            onShowToast={onNotify}
            popupMode="input"
            onSubmittedSuccess={refreshStatus}
          />
        </div>
      </div>
    </div>
  );
};
