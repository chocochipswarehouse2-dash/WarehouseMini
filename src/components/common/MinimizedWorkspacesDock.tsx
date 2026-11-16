import React, { useState, useEffect, useCallback } from 'react';
import {
  ScanBarcode,
  ClipboardPlus,
  ClipboardList,
  Scale,
  Maximize2,
  X,
  RefreshCw,
  WifiOff,
  Layers,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { CategoryType, ScannedItem } from '../../types';
import {
  getScannerOutboxBatches,
  syncAllScannerOutboxBatches,
  getRecountOutboxBatches,
  syncAllRecountOutboxBatches,
  getPickingOutboxBatches,
  syncAllPickingOutboxBatches,
  getActiveProduksiInputDraftSummary,
  getActiveRecountDraftSummary,
  getActivePickingDraftSummary,
  setActivePickingSessionMinimized,
  clearActivePickingSession,
} from '../../services/scannerOutboxService';
import { syncOfflinePenerimaanProduksi } from '../../services/supabase';
import { getPendingOfflineProduksiCount } from '../../services/localDb';
import { DraggableFloatingBubble, BubbleDragHandle } from './DraggableFloatingBubble';

interface MinimizedWorkspacesDockProps {
  // 1. Scanner Popup
  isScannerOpen: boolean;
  isScannerMinimized: boolean;
  onMaximizeScanner: () => void;
  onCloseScanner: () => void;
  scannedItems: ScannedItem[];
  currentCategory: CategoryType;
  currentLocation: string;
  isScannerSaving?: boolean;

  // 2. Input Penerimaan Produksi Popup
  isProduksiInputOpen: boolean;
  isProduksiInputMinimized: boolean;
  onMaximizeProduksiInput: () => void;
  onCloseProduksiInput: () => void;

  // 3. Antrean Hitung Ulang Popup
  isHitungUlangOpen: boolean;
  isHitungUlangMinimized: boolean;
  onMaximizeHitungUlang: () => void;
  onCloseHitungUlang: () => void;
  recountQueueCount?: number;

  // 4. Tugas Picking Active Session
  onMaximizePickingTask?: () => void;

  onNotify?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const MinimizedWorkspacesDock: React.FC<MinimizedWorkspacesDockProps> = ({
  isScannerOpen,
  isScannerMinimized,
  onMaximizeScanner,
  onCloseScanner,
  scannedItems,
  currentCategory,
  currentLocation,
  isScannerSaving = false,
  isProduksiInputOpen,
  isProduksiInputMinimized,
  onMaximizeProduksiInput,
  onCloseProduksiInput,
  isHitungUlangOpen,
  isHitungUlangMinimized,
  onMaximizeHitungUlang,
  onCloseHitungUlang,
  recountQueueCount = 0,
  onMaximizePickingTask,
  onNotify,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [scannerOutboxCount, setScannerOutboxCount] = useState<number>(0);
  const [produksiOutboxCount, setProduksiOutboxCount] = useState<number>(0);
  const [recountOutboxCount, setRecountOutboxCount] = useState<number>(0);
  const [pickingOutboxCount, setPickingOutboxCount] = useState<number>(0);
  const [produksiDraft, setProduksiDraft] = useState(() => getActiveProduksiInputDraftSummary());
  const [recountDraft, setRecountDraft] = useState(() => getActiveRecountDraftSummary());
  const [pickingDraft, setPickingDraft] = useState(() => getActivePickingDraftSummary());
  const [syncingKey, setSyncingKey] = useState<'scanner' | 'produksi' | 'recount' | 'picking' | null>(null);
  const [isMobileCollapsed, setIsMobileCollapsed] = useState<boolean>(false);

  const refreshDockState = useCallback(() => {
    setScannerOutboxCount(getScannerOutboxBatches().length);
    setProduksiOutboxCount(getPendingOfflineProduksiCount());
    setRecountOutboxCount(getRecountOutboxBatches().length);
    setPickingOutboxCount(getPickingOutboxBatches().length);
    setProduksiDraft(getActiveProduksiInputDraftSummary());
    setRecountDraft(getActiveRecountDraftSummary());
    setPickingDraft(getActivePickingDraftSummary());
  }, []);

  useEffect(() => {
    refreshDockState();
    const handleOnline = () => {
      setIsOnline(true);
      refreshDockState();
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshDockState();
    };
    const handleAnyUpdate = () => {
      refreshDockState();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('wms_scanner_outbox_updated', handleAnyUpdate);
    window.addEventListener('wms_recount_outbox_updated', handleAnyUpdate);
    window.addEventListener('wms_picking_outbox_updated', handleAnyUpdate);
    window.addEventListener('wms_produksi_draft_updated', handleAnyUpdate);
    window.addEventListener('wms_recount_draft_updated', handleAnyUpdate);
    window.addEventListener('wms_picking_session_updated', handleAnyUpdate);
    window.addEventListener('storage', handleAnyUpdate);

    const timer = setInterval(refreshDockState, 3000);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('wms_scanner_outbox_updated', handleAnyUpdate);
      window.removeEventListener('wms_recount_outbox_updated', handleAnyUpdate);
      window.removeEventListener('wms_picking_outbox_updated', handleAnyUpdate);
      window.removeEventListener('wms_produksi_draft_updated', handleAnyUpdate);
      window.removeEventListener('wms_recount_draft_updated', handleAnyUpdate);
      window.removeEventListener('wms_picking_session_updated', handleAnyUpdate);
      window.removeEventListener('storage', handleAnyUpdate);
    };
  }, [
    refreshDockState,
    isScannerOpen,
    isScannerMinimized,
    isProduksiInputOpen,
    isProduksiInputMinimized,
    isHitungUlangOpen,
    isHitungUlangMinimized,
  ]);

  const showScannerPill = isScannerOpen && isScannerMinimized;
  const showProduksiPill = isProduksiInputOpen && isProduksiInputMinimized;
  const showHitungUlangPill = isHitungUlangOpen && isHitungUlangMinimized;
  const showPickingPill = (pickingDraft.hasSession && pickingDraft.isMinimized) || pickingOutboxCount > 0;

  const activePillCount =
    (showScannerPill ? 1 : 0) +
    (showProduksiPill ? 1 : 0) +
    (showHitungUlangPill ? 1 : 0) +
    (showPickingPill ? 1 : 0);

  if (activePillCount === 0) return null;

  const validSkuItems = scannedItems.filter((it) => it && !it.isCategory && !it.isLocation);
  const totalScanPcs = validSkuItems.reduce((sum, it) => sum + (Number(it.qty) || 1), 0);

  const handleSyncScanner = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOnline || syncingKey) return;
    setSyncingKey('scanner');
    try {
      const res = await syncAllScannerOutboxBatches();
      refreshDockState();
      if (res.syncedBatches > 0) {
        onNotify?.(`✅ Berhasil mengirim ${res.syncedBatches} batch Scanner (${res.syncedItems} item)!`, 'success');
      }
    } finally {
      setSyncingKey(null);
    }
  };

  const handleSyncProduksi = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOnline || syncingKey) return;
    setSyncingKey('produksi');
    try {
      const res = await syncOfflinePenerimaanProduksi();
      refreshDockState();
      if (res.synced > 0) {
        onNotify?.(`✅ Berhasil mengirim ${res.synced} item Penerimaan Produksi ke Supabase!`, 'success');
      }
    } finally {
      setSyncingKey(null);
    }
  };

  const handleSyncRecount = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOnline || syncingKey) return;
    setSyncingKey('recount');
    try {
      const res = await syncAllRecountOutboxBatches();
      refreshDockState();
      if (res.syncedBatches > 0) {
        onNotify?.(`✅ Berhasil mengirim ${res.syncedBatches} kode Hitung Ulang!`, 'success');
      }
    } finally {
      setSyncingKey(null);
    }
  };

  const handleSyncPicking = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOnline || syncingKey) return;
    setSyncingKey('picking');
    try {
      const res = await syncAllPickingOutboxBatches();
      refreshDockState();
      if (res.syncedBatches > 0) {
        onNotify?.(`✅ Berhasil menyinkronkan ${res.syncedBatches} Surat Jalan Tugas Picking ke Database!`, 'success');
      }
    } finally {
      setSyncingKey(null);
    }
  };

  const handleMaximizePicking = () => {
    setActivePickingSessionMinimized(false);
    refreshDockState();
    onMaximizePickingTask?.();
  };

  const handleClosePickingPill = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentNoSj = pickingDraft.noSj;
    clearActivePickingSession();
    refreshDockState();
    if (currentNoSj) {
      onNotify?.(
        `Sesi Tugas Picking SJ ${currentNoSj} ditutup dari dock. Progres scan Anda tetap tersimpan aman di draft perangkat.`,
        'info'
      );
    }
  };

  return (
    <DraggableFloatingBubble
      storageKey="minimized_workspaces_dock"
      defaultAnchor="bottom-left"
      defaultOffset={{ x: 12, y: 12 }}
      zIndexClass="z-[60]"
      className="max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)]"
      ariaLabel="Minimized Workspaces Dock"
    >
      <div className="flex flex-col items-start gap-1.5">
        {/* Mobile Multi-Window Compact Header Toggle when >= 2 popups are minimized */}
        {activePillCount >= 2 && (
          <div className="sm:hidden inline-flex items-center gap-1 pl-1.5 pr-2.5 py-1 rounded-full bg-slate-900/95 dark:bg-slate-800/95 text-white text-[10px] font-extrabold shadow-lg border border-slate-700">
            <BubbleDragHandle tone="dark" />
            <button
              type="button"
              onClick={() => setIsMobileCollapsed((prev) => !prev)}
              className="inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Layers className="w-3 h-3 text-indigo-400" />
              <span>{activePillCount} Jendela Kerja Diminimize</span>
              {!isOnline && <WifiOff className="w-3 h-3 text-amber-400" />}
              {isMobileCollapsed ? (
                <ChevronUp className="w-3 h-3 text-slate-300" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-300" />
              )}
            </button>
          </div>
        )}

        {/* Horizontal / Wrap Non-Colliding Dock Container */}
        <div
          className={`${
            activePillCount >= 2 && isMobileCollapsed ? 'hidden sm:flex' : 'flex'
          } flex-wrap items-center gap-2 max-w-full`}
        >
          {/* 1. PILL: SCANNER GUDANG */}
          {showScannerPill && (
            <div className="flex items-center gap-1.5 p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
              <BubbleDragHandle tone="light" className="-ml-0.5" />
              <div
                onClick={onMaximizeScanner}
                className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity min-w-0"
              >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0 ${
                  !isOnline
                    ? 'bg-amber-600'
                    : isScannerSaving || syncingKey === 'scanner'
                    ? 'bg-indigo-600 animate-pulse'
                    : 'bg-indigo-600'
                }`}
              >
                <ScanBarcode className="w-4 h-4" />
              </div>

              <div className="flex flex-col pr-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] font-extrabold text-slate-900 dark:text-white truncate">
                    Scanner
                  </span>
                  {currentCategory && (
                    <span
                      className={`px-1 py-0.2 rounded text-[9px] font-black font-mono uppercase ${
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
                    <span className="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-mono font-bold">
                      {currentLocation}
                    </span>
                  )}
                </div>

                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[165px] sm:max-w-[210px]">
                  {validSkuItems.length > 0
                    ? `${validSkuItems.length} SKU (${totalScanPcs} pcs) di draft`
                    : scannerOutboxCount > 0
                    ? `${scannerOutboxCount} batch menunggu sync`
                    : 'Kamera dijeda · Klik buka'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-0.5 pl-1.5 border-l border-slate-200 dark:border-slate-800 shrink-0">
              {scannerOutboxCount > 0 && isOnline && (
                <button
                  type="button"
                  onClick={handleSyncScanner}
                  disabled={syncingKey === 'scanner'}
                  title="Kirim antrean offline Scanner"
                  className="px-1.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${syncingKey === 'scanner' ? 'animate-spin' : ''}`} />
                  <span>{scannerOutboxCount}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onMaximizeScanner}
                title="Perbesar Popup Scanner"
                className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onCloseScanner}
                title="Tutup Popup Scanner (Draft tetap tersimpan aman)"
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 2. PILL: INPUT PENERIMAAN PRODUKSI */}
        {showProduksiPill && (
          <div className="flex items-center gap-1.5 p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
            <BubbleDragHandle tone="light" className="-ml-0.5" />
            <div
              onClick={onMaximizeProduksiInput}
              className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity min-w-0"
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0 ${
                  !isOnline
                    ? 'bg-amber-600'
                    : syncingKey === 'produksi'
                    ? 'bg-emerald-600 animate-pulse'
                    : 'bg-emerald-600'
                }`}
              >
                <ClipboardPlus className="w-4 h-4" />
              </div>

              <div className="flex flex-col pr-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] font-extrabold text-slate-900 dark:text-white truncate">
                    Input Produksi
                  </span>
                  {produksiDraft.noSuratJalan && (
                    <span className="px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-[9px] font-mono font-bold">
                      SJ {produksiDraft.noSuratJalan}
                    </span>
                  )}
                </div>

                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[165px] sm:max-w-[210px]">
                  {produksiDraft.hasDraft
                    ? `${produksiDraft.totalPcs} pcs (${produksiDraft.modelCount} model) di draft`
                    : produksiOutboxCount > 0
                    ? `${produksiOutboxCount} item menunggu sync`
                    : 'Draft siap · Klik buka'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-0.5 pl-1.5 border-l border-slate-200 dark:border-slate-800 shrink-0">
              {produksiOutboxCount > 0 && isOnline && (
                <button
                  type="button"
                  onClick={handleSyncProduksi}
                  disabled={syncingKey === 'produksi'}
                  title="Kirim antrean offline Penerimaan Produksi"
                  className="px-1.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${syncingKey === 'produksi' ? 'animate-spin' : ''}`} />
                  <span>{produksiOutboxCount}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onMaximizeProduksiInput}
                title="Perbesar Popup Input Penerimaan Produksi"
                className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onCloseProduksiInput}
                title="Tutup Popup Input Produksi (Draft form tetap tersimpan aman)"
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 3. PILL: ANTREAN HITUNG ULANG */}
        {showHitungUlangPill && (
          <div className="flex items-center gap-1.5 p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
            <BubbleDragHandle tone="light" className="-ml-0.5" />
            <div
              onClick={onMaximizeHitungUlang}
              className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity min-w-0"
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0 ${
                  !isOnline
                    ? 'bg-amber-600'
                    : syncingKey === 'recount'
                    ? 'bg-amber-600 animate-pulse'
                    : 'bg-amber-600'
                }`}
              >
                <Scale className="w-4 h-4" />
              </div>

              <div className="flex flex-col pr-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] font-extrabold text-slate-900 dark:text-white truncate">
                    Hitung Ulang
                  </span>
                  {recountDraft.selectedCode ? (
                    <span className="px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[9px] font-mono font-bold">
                      {recountDraft.selectedCode}
                    </span>
                  ) : recountQueueCount > 0 ? (
                    <span className="px-1 py-0.2 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 text-[9px] font-mono font-bold">
                      {recountQueueCount} Antrean
                    </span>
                  ) : null}
                </div>

                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[165px] sm:max-w-[210px]">
                  {recountDraft.hasActiveWorkspaceDraft
                    ? `${recountDraft.filledVariantsCount} varian di draft`
                    : recountOutboxCount > 0
                    ? `${recountOutboxCount} kode menunggu sync`
                    : 'Draft aman · Klik buka'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-0.5 pl-1.5 border-l border-slate-200 dark:border-slate-800 shrink-0">
              {recountOutboxCount > 0 && isOnline && (
                <button
                  type="button"
                  onClick={handleSyncRecount}
                  disabled={syncingKey === 'recount'}
                  title="Kirim antrean offline Hitung Ulang"
                  className="px-1.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[9px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${syncingKey === 'recount' ? 'animate-spin' : ''}`} />
                  <span>{recountOutboxCount}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onMaximizeHitungUlang}
                title="Perbesar Popup Hitung Ulang"
                className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onCloseHitungUlang}
                title="Tutup Popup Hitung Ulang (Draft angka hitung tetap tersimpan aman)"
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 4. PILL: TUGAS PICKING AKTIF */}
        {showPickingPill && (
          <div className="flex items-center gap-1.5 p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
            <BubbleDragHandle tone="light" className="-ml-0.5" />
            <div
              onClick={handleMaximizePicking}
              className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition-opacity min-w-0"
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0 ${
                  !isOnline
                    ? 'bg-amber-600'
                    : syncingKey === 'picking'
                    ? 'bg-indigo-600 animate-pulse'
                    : 'bg-indigo-600'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
              </div>

              <div className="flex flex-col pr-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[11px] font-extrabold text-slate-900 dark:text-white truncate">
                    Tugas Picking
                  </span>
                  {pickingDraft.noSj && (
                    <span className="px-1 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[9px] font-mono font-bold">
                      {pickingDraft.noSj}
                    </span>
                  )}
                  {pickingDraft.activeLocation && (
                    <span className="px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[9px] font-mono font-bold">
                      {pickingDraft.activeLocation}
                    </span>
                  )}
                </div>

                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[165px] sm:max-w-[215px]">
                  {pickingDraft.hasSession
                    ? `${pickingDraft.totalPicked}/${pickingDraft.totalReq} pcs (${pickingDraft.progressPct}%) · ${pickingDraft.tujuan}`
                    : pickingOutboxCount > 0
                    ? `${pickingOutboxCount} SJ selesai menunggu sync`
                    : 'Draft aman · Klik lanjutkan'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-0.5 pl-1.5 border-l border-slate-200 dark:border-slate-800 shrink-0">
              {pickingOutboxCount > 0 && isOnline && (
                <button
                  type="button"
                  onClick={handleSyncPicking}
                  disabled={syncingKey === 'picking'}
                  title="Kirim antrean offline Tugas Picking ke Database"
                  className="px-1.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${syncingKey === 'picking' ? 'animate-spin' : ''}`} />
                  <span>{pickingOutboxCount}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleMaximizePicking}
                title="Buka & Lanjutkan Sesi Tugas Picking"
                className="p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClosePickingPill}
                title="Tutup dari Dock (Progres scan SJ tetap tersimpan aman di draft)"
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </DraggableFloatingBubble>
  );
};

