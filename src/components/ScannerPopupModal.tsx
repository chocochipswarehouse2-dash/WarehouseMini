import React, { useState, useEffect } from 'react';
import {
  ScanBarcode,
  Minus,
  Maximize2,
  X,
  Columns2,
  Table2,
  LayoutList,
  FileSpreadsheet,
  Wifi,
  WifiOff,
  CloudUpload,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  Tag,
  ExternalLink
} from 'lucide-react';
import { CategoryType, ScannedItem } from '../types';
import {
  ScannerOutboxBatch,
  getScannerOutboxBatches,
  syncAllScannerOutboxBatches
} from '../services/scannerOutboxService';

export type ScannerPopupLayoutMode = 'split' | 'table' | 'compact';

interface ScannerPopupModalProps {
  isOpen: boolean;
  isMinimized: boolean;
  onMinimizeChange: (minimized: boolean) => void;
  onClose: () => void;
  onOpenFullPage?: () => void;
  onOpenImportModal?: () => void;
  scannedItems: ScannedItem[];
  currentCategory: CategoryType;
  currentLocation: string;
  isSaving: boolean;
  onNotify?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  renderScannerWorkspace: (layoutMode: ScannerPopupLayoutMode, isCameraAllowed: boolean) => React.ReactNode;
}

export const ScannerPopupModal: React.FC<ScannerPopupModalProps> = ({
  isOpen,
  isMinimized,
  onMinimizeChange,
  onClose,
  onOpenFullPage,
  onOpenImportModal,
  scannedItems,
  currentCategory,
  currentLocation,
  isSaving,
  onNotify,
  renderScannerWorkspace
}) => {
  const [layoutMode, setLayoutMode] = useState<ScannerPopupLayoutMode>('split');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [outboxBatches, setOutboxBatches] = useState<ScannerOutboxBatch[]>(() =>
    getScannerOutboxBatches()
  );
  const [isSyncingOutbox, setIsSyncingOutbox] = useState<boolean>(false);

  const refreshOutbox = () => {
    setOutboxBatches(getScannerOutboxBatches());
  };

  useEffect(() => {
    refreshOutbox();
    const handleOnline = () => {
      setIsOnline(true);
      refreshOutbox();
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshOutbox();
    };
    const handleOutboxUpdate = () => {
      refreshOutbox();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('wms_scanner_outbox_updated', handleOutboxUpdate);
    window.addEventListener('storage', handleOutboxUpdate);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('wms_scanner_outbox_updated', handleOutboxUpdate);
      window.removeEventListener('storage', handleOutboxUpdate);
    };
  }, [isOpen, isMinimized]);

  const handleManualOutboxSync = async () => {
    if (!isOnline || isSyncingOutbox) return;
    setIsSyncingOutbox(true);
    try {
      const res = await syncAllScannerOutboxBatches();
      refreshOutbox();
      if (res.syncedBatches > 0) {
        onNotify?.(
          `✅ Berhasil mengirim ${res.syncedBatches} antrean scan (${res.syncedItems} item) ke Database Supabase!`,
          'success'
        );
      } else if (res.errors.length > 0) {
        onNotify?.(`⚠️ Sebagian antrean tertunda: ${res.errors[0]}`, 'warning');
      }
    } finally {
      setIsSyncingOutbox(false);
    }
  };

  if (!isOpen) return null;

  const validSkuItems = scannedItems.filter((it) => it && !it.isCategory && !it.isLocation);
  const totalPcs = validSkuItems.reduce((sum, it) => sum + (Number(it.qty) || 1), 0);
  const pendingOutboxItemsCount = outboxBatches.reduce(
    (sum, b) => sum + (Number(b.totalItemsCount) || b.logs.length || 0),
    0
  );

  // ===========================================================================
  // FLOATING COMPANION PILL WHEN MINIMIZED
  // (Camera stream is automatically unmounted via isCameraAllowed=false)
  // ===========================================================================
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 p-2 sm:p-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200 select-none max-w-[calc(100vw-2rem)]">
        <div
          onClick={() => onMinimizeChange(false)}
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity min-w-0"
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0 ${
              !isOnline
                ? 'bg-amber-600'
                : isSaving || isSyncingOutbox
                ? 'bg-indigo-600 animate-pulse'
                : 'bg-indigo-600'
            }`}
          >
            <ScanBarcode className="w-5 h-5" />
          </div>

          <div className="flex flex-col pr-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                Popup Scanner
              </span>
              {currentCategory && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-black font-mono uppercase ${
                    currentCategory === 'IN'
                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                      : currentCategory === 'OUT'
                      ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                      : 'bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  #{currentCategory}
                </span>
              )}
              {currentLocation && (
                <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-mono font-bold">
                  {currentLocation}
                </span>
              )}
              {!isOnline && (
                <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 text-[9px] font-bold">
                  Offline
                </span>
              )}
            </div>

            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[210px] sm:max-w-[280px]">
              {validSkuItems.length > 0
                ? `${validSkuItems.length} baris (${totalPcs} pcs) di draft scan`
                : outboxBatches.length > 0
                ? `${outboxBatches.length} batch (${pendingOutboxItemsCount} item) menunggu sync`
                : 'Kamera dijeda · Klik untuk lanjut scan'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 pl-1.5 border-l border-slate-200 dark:border-slate-800 shrink-0">
          {outboxBatches.length > 0 && isOnline && (
            <button
              type="button"
              onClick={handleManualOutboxSync}
              disabled={isSyncingOutbox}
              title="Kirim antrean offline sekarang"
              className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncingOutbox ? 'animate-spin' : ''}`} />
              <span>Sync ({outboxBatches.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onMinimizeChange(false)}
            title="Perbesar Popup Scanner"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Tutup Popup (Draft scan tetap aman tersimpan)"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // WIDE POPUP MODAL VIEW
  // ===========================================================================
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-3 lg:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="flex flex-col w-full max-w-[98vw] 2xl:max-w-[1600px] h-[94vh] max-h-[920px] bg-[#f4f6f8] dark:bg-[#0f172a] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
        {/* TOP HEADER */}
        <div className="px-3 py-2.5 sm:px-5 sm:py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <ScanBarcode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-tight truncate">
                  Popup Scanner Gudang
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
                {currentCategory && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-black uppercase border ${
                      currentCategory === 'IN'
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : currentCategory === 'OUT'
                        ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}
                  >
                    Mode #{currentCategory}
                  </span>
                )}
                {currentLocation && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    <MapPin className="w-3 h-3 text-indigo-500" />
                    <span>{currentLocation}</span>
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate hidden sm:block mt-0.5">
                Bisa diminimize sambil cek halaman lain · Anti double-input &amp; otomatis lanjut kirim saat sinyal kembali
              </p>
            </div>
          </div>

          {/* RIGHT TOOLBAR */}
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            {/* Layout Mode Switcher */}
            <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setLayoutMode('split')}
                className={`py-1 px-2 text-[11px] font-bold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  layoutMode === 'split'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Panel Rapi 2 Kolom (Input Kiri, Daftar Scan Kanan)"
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Panel Rapi</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('table')}
                className={`py-1 px-2 text-[11px] font-bold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  layoutMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilan Tabel Penuh"
              >
                <Table2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('compact')}
                className={`py-1 px-2 text-[11px] font-bold rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  layoutMode === 'compact'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilan 1 Kolom Ringkas"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Ringkas</span>
              </button>
            </div>

            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="py-1.5 px-2.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 rounded-lg transition-all cursor-pointer"
                title="Impor Data Excel / CSV (IN / OUT / SO)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Impor Excel</span>
              </button>
            )}

            {onOpenFullPage && (
              <button
                type="button"
                onClick={onOpenFullPage}
                className="py-1.5 px-2.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 hidden lg:flex items-center gap-1.5 rounded-lg transition-all cursor-pointer"
                title="Buka di Tab Inventory & Scanner Halaman Penuh"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                <span>Halaman Penuh</span>
              </button>
            )}

            {/* Minimize Button */}
            <button
              type="button"
              onClick={() => onMinimizeChange(true)}
              title="Minimize ke pojok layar (Kamera dijeda otomatis & Anda bisa buka halaman lain)"
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
              <span className="hidden sm:inline">Minimize</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              title="Tutup Popup Scanner (Draft scan tetap tersimpan aman)"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* OUTBOX QUEUE STATUS BAR (SHOWN WHEN OFFLINE OR WHEN THERE ARE PENDING BATCHES) */}
        {(outboxBatches.length > 0 || !isOnline) && (
          <div
            className={`px-4 py-2 border-b text-xs flex flex-wrap items-center justify-between gap-2 shrink-0 ${
              !isOnline
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200'
                : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/70 text-indigo-900 dark:text-indigo-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CloudUpload className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <div className="min-w-0">
                {outboxBatches.length > 0 ? (
                  <span>
                    <strong className="font-mono">{outboxBatches.length} batch</strong> (
                    <strong className="font-mono">{pendingOutboxItemsCount} item</strong>) berada di{' '}
                    <strong>Outbox Anti-Duplikat</strong>
                    {outboxBatches.some((b) => b.logsSynced && !b.soSynced)
                      ? ' — Step 1 (Log Produk) sudah masuk, menunggu Step 2 (Antrean SO) tanpa mengulang Step 1.'
                      : ' — Siap dikirim otomatis tanpa double input maupun tabrakan dengan Webhook WA.'}
                  </span>
                ) : (
                  <span>
                    <strong>Mode Offline Aktif:</strong> Silakan lanjut scan dan klik Simpan. Seluruh batch akan diamankan di Outbox lokal dan otomatis dikirim saat sinyal kembali.
                  </span>
                )}
              </div>
            </div>

            {outboxBatches.length > 0 && isOnline && (
              <button
                type="button"
                onClick={handleManualOutboxSync}
                disabled={isSyncingOutbox}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOutbox ? 'animate-spin' : ''}`} />
                <span>{isSyncingOutbox ? 'Menyinkronkan...' : 'Kirim Sekarang'}</span>
              </button>
            )}
          </div>
        )}

        {/* MAIN SCROLLABLE SCANNER WORKSPACE */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {renderScannerWorkspace(layoutMode, !isMinimized)}
        </div>
      </div>
    </div>
  );
};
