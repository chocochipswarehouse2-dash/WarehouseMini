import React, { useState, useEffect, useCallback } from 'react';
import {
  Scale,
  Minus,
  X,
  Wifi,
  WifiOff,
  CloudUpload,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { UserSession, ProductItem, PenerimaanProduksiItem } from '../types';
import {
  fetchPenerimaanProduksiFromSupabase,
  getCachedPenerimaanProduksiSync,
} from '../services/supabase';
import {
  getRecountOutboxBatches,
  syncAllRecountOutboxBatches,
  getActiveRecountDraftSummary,
  RecountOutboxBatch,
} from '../services/scannerOutboxService';
import { AuditHitungUlangTab } from './penerimaan/AuditHitungUlangTab';

interface HitungUlangPopupModalProps {
  isOpen: boolean;
  isMinimized: boolean;
  onMinimizeChange: (minimized: boolean) => void;
  onClose: () => void;
  onOpenFullPage?: () => void;
  session: UserSession | null;
  productCatalog?: ProductItem[];
  initialTargetCode?: string;
  onNotify?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const HitungUlangPopupModal: React.FC<HitungUlangPopupModalProps> = ({
  isOpen,
  isMinimized,
  onMinimizeChange,
  onClose,
  onOpenFullPage,
  session,
  productCatalog = [],
  initialTargetCode,
  onNotify,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [penerimaanItems, setPenerimaanItems] = useState<PenerimaanProduksiItem[]>(() =>
    getCachedPenerimaanProduksiSync()
  );
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [outboxBatches, setOutboxBatches] = useState<RecountOutboxBatch[]>(() =>
    getRecountOutboxBatches()
  );
  const [isSyncingOutbox, setIsSyncingOutbox] = useState<boolean>(false);
  const [draftSummary, setDraftSummary] = useState(() => getActiveRecountDraftSummary());
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  const refreshStatus = useCallback(() => {
    setOutboxBatches(getRecountOutboxBatches());
    setDraftSummary(getActiveRecountDraftSummary());
  }, []);

  const loadPenerimaanData = useCallback(async () => {
    const cached = getCachedPenerimaanProduksiSync();
    if (cached && cached.length > 0) {
      setPenerimaanItems(cached);
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    setIsLoadingData(true);
    try {
      const fresh = await fetchPenerimaanProduksiFromSupabase();
      if (fresh && fresh.length > 0) {
        setPenerimaanItems(fresh);
      }
    } catch {
      // Fallback to cached data silently when offline
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    refreshStatus();
    loadPenerimaanData();
  }, [isOpen, isMinimized, refreshStatus, loadPenerimaanData]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshStatus();
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshStatus();
    };
    const handleUpdate = () => {
      refreshStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('wms_recount_outbox_updated', handleUpdate);
    window.addEventListener('wms_recount_draft_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('wms_recount_outbox_updated', handleUpdate);
      window.removeEventListener('wms_recount_draft_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [refreshStatus]);

  const handleManualSync = async () => {
    if (!isOnline || isSyncingOutbox) return;
    setIsSyncingOutbox(true);
    try {
      const res = await syncAllRecountOutboxBatches();
      refreshStatus();
      await loadPenerimaanData();
      if (res.syncedBatches > 0) {
        onNotify?.(
          `✅ Berhasil menyinkronkan ${res.syncedBatches} kode hasil Hitung Ulang ke Supabase & Google Sheet!`,
          'success'
        );
      } else if (res.errors.length > 0) {
        onNotify?.(`⚠️ Sebagian antrean Hitung Ulang tertunda: ${res.errors[0]}`, 'warning');
      }
    } finally {
      setIsSyncingOutbox(false);
    }
  };

  // ZERO-DOM WHEN MINIMIZED OR CLOSED:
  // Unmounts the heavy AuditHitungUlangTab DOM & useMemo hooks when minimized so the browser never freezes.
  // Minimized pill is rendered by the centralized MinimizedWorkspacesDock.
  if (!isOpen || isMinimized) return null;

  const totalPendingRows = outboxBatches.reduce((sum, b) => sum + (b.updatedItems?.length || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-2.5 lg:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150 print:hidden">
      <div className="flex flex-col w-full max-w-[99vw] 2xl:max-w-[1680px] h-[95dvh] sm:h-[92dvh] bg-[#f4f6f8] dark:bg-[#0f172a] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
        {/* TOP HEADER */}
        <div className="px-3 py-2.5 sm:px-5 sm:py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-tight truncate">
                  Popup Antrean &amp; Audit Hitung Ulang
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    isOnline
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                  }`}
                >
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  <span>{isOnline ? 'Online · Outbox Siap' : 'Offline · Auto-Queue Aktif'}</span>
                </span>
                {draftSummary.hasActiveWorkspaceDraft && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    <FileText className="w-3 h-3" />
                    <span>
                      Draft {draftSummary.selectedCode || 'Aktif'} ({draftSummary.filledVariantsCount} varian)
                    </span>
                  </span>
                )}
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Anti-Freeze &amp; Pelindung Offline</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate hidden sm:block mt-0.5">
                Angka hitung fisik tersimpan otomatis di draft per kode · Aman di-minimize atau ditutup tanpa kehilangan input
              </p>
            </div>
          </div>

          {/* RIGHT TOOLBAR */}
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            <button
              type="button"
              onClick={loadPenerimaanData}
              disabled={isLoadingData}
              title="Segarkan Data Penerimaan & Antrean Hitung Ulang"
              className="py-1.5 px-2.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isLoadingData ? 'animate-spin text-indigo-600' : ''}`} />
              <span className="hidden sm:inline">{isLoadingData ? 'Memuat...' : 'Refresh'}</span>
            </button>

            {onOpenFullPage && (
              <button
                type="button"
                onClick={onOpenFullPage}
                className="py-1.5 px-2.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 hidden lg:flex items-center gap-1.5 rounded-lg transition-all cursor-pointer"
                title="Buka di Halaman Produksi -> Hitung Ulang Penuh"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                <span>Halaman Penuh</span>
              </button>
            )}

            {/* Minimize Button */}
            <button
              type="button"
              onClick={() => onMinimizeChange(true)}
              title="Minimize ke Dock Pojok Bawah (Halaman tidak berat & draft angka hitung tetap aman)"
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
              <span className="hidden sm:inline">Minimize</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              title="Tutup Popup Hitung Ulang (Draft angka hitung fisik tetap tersimpan aman)"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* OFFLINE / OUTBOX STATUS BANNER */}
        {(outboxBatches.length > 0 || !isOnline) && (
          <div
            className={`px-4 py-2 border-b text-xs flex flex-wrap items-center justify-between gap-2 shrink-0 ${
              !isOnline
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200'
                : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/70 text-indigo-900 dark:text-indigo-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CloudUpload className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0">
                {outboxBatches.length > 0 ? (
                  <span>
                    <strong className="font-mono">{outboxBatches.length} kode</strong> (
                    <strong className="font-mono">{totalPendingRows} baris varian</strong>) berada di{' '}
                    <strong>Outbox Hitung Ulang Offline</strong> — Siap di-update idempoten ke Supabase &amp; Sheet tanpa double-input.
                  </span>
                ) : (
                  <span>
                    <strong>Mode Offline Aktif:</strong> Silakan lanjut input angka fisik dan klik Simpan &amp; Push. Data akan masuk ke Outbox lokal dan otomatis dikirim saat sinyal kembali.
                  </span>
                )}
              </div>
            </div>

            {outboxBatches.length > 0 && isOnline && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncingOutbox}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOutbox ? 'animate-spin' : ''}`} />
                <span>{isSyncingOutbox ? 'Menyinkronkan...' : 'Kirim Sekarang'}</span>
              </button>
            )}
          </div>
        )}

        {/* MAIN WORKSPACE */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4">
          <AuditHitungUlangTab
            session={session}
            penerimaanItems={penerimaanItems}
            productCatalog={productCatalog}
            initialTargetCode={initialTargetCode}
            onShowToast={(msg, type) => onNotify?.(msg, type || 'info')}
            onRefreshData={loadPenerimaanData}
            onOpenLightbox={(data) => setLightboxImage(data)}
          />
        </div>

        {/* LIGHTBOX FOR PRODUCT PHOTO */}
        {lightboxImage && (
          <div
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800"
            >
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate font-mono">
                    {lightboxImage.title}
                  </p>
                  {lightboxImage.subtitle && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {lightboxImage.subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 flex items-center justify-center bg-slate-100 dark:bg-slate-950 max-h-[70vh]">
                <img
                  src={lightboxImage.url}
                  alt={lightboxImage.title}
                  className="max-h-[62vh] w-auto object-contain rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
