import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, CloudUpload, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getPendingOfflinePengecekanSJ, syncPendingOfflinePengecekanSJ } from '../services/gasTarikanMD';
import { getPendingOfflinePeminjaman, clearPendingOfflinePeminjaman, getPendingOfflineProduksiCount } from '../services/localDb';
import { savePeminjamanToSupabase, syncOfflinePenerimaanProduksi } from '../services/supabase';
import {
  getPendingScannerOutboxCount,
  syncAllScannerOutboxBatches,
  getPendingRecountOutboxCount,
  syncAllRecountOutboxBatches,
  getPendingPickingOutboxCount,
  syncAllPickingOutboxBatches
} from '../services/scannerOutboxService';

interface OfflineProtectionBarProps {
  onNotify?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const OfflineProtectionBar: React.FC<OfflineProtectionBarProps> = ({ onNotify }) => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [pendingSJCount, setPendingSJCount] = useState<number>(0);
  const [pendingPeminjamanCount, setPendingPeminjamanCount] = useState<number>(0);
  const [pendingProduksiCount, setPendingProduksiCount] = useState<number>(0);
  const [pendingScannerCount, setPendingScannerCount] = useState<number>(0);
  const [pendingRecountCount, setPendingRecountCount] = useState<number>(0);
  const [pendingPickingCount, setPendingPickingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const checkPendingCounts = () => {
    const sjList = getPendingOfflinePengecekanSJ();
    const pemList = getPendingOfflinePeminjaman();
    const prodCount = getPendingOfflineProduksiCount();
    const scanOutboxCount = getPendingScannerOutboxCount();
    const recountOutboxCount = getPendingRecountOutboxCount();
    const pickingOutboxCount = getPendingPickingOutboxCount();
    setPendingSJCount(sjList.length);
    setPendingPeminjamanCount(pemList.length);
    setPendingProduksiCount(prodCount);
    setPendingScannerCount(scanOutboxCount);
    setPendingRecountCount(recountOutboxCount);
    setPendingPickingCount(pickingOutboxCount);
  };

  const syncAllOfflineData = async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);

    try {
      let totalSynced = 0;

      // 0. Sync Scanner Outbox Batches (Idempotent Step-by-Step)
      const scannerResult = await syncAllScannerOutboxBatches();
      totalSynced += scannerResult.syncedBatches;

      // 1. Sync Pengecekan SJ
      const sjResult = await syncPendingOfflinePengecekanSJ();
      totalSynced += sjResult.successCount;

      // 2. Sync Peminjaman
      const pendingPeminjaman = getPendingOfflinePeminjaman();
      if (pendingPeminjaman.length > 0) {
        let pSuccess = 0;
        for (const item of pendingPeminjaman) {
          try {
            const ok = await savePeminjamanToSupabase(item);
            if (ok) pSuccess++;
          } catch {}
        }
        if (pSuccess > 0) {
          clearPendingOfflinePeminjaman();
          totalSynced += pSuccess;
        }
      }

      // 3. Sync Penerimaan Produksi Offline (Idempotent Pre-Flight Check)
      const prodResult = await syncOfflinePenerimaanProduksi();
      totalSynced += prodResult.synced;

      // 4. Sync Audit Hitung Ulang Offline Outbox (Idempotent PATCH)
      const recountResult = await syncAllRecountOutboxBatches();
      totalSynced += recountResult.syncedBatches;

      // 5. Sync Tugas Picking Offline Outbox (Idempotent Step-by-Step)
      const pickingResult = await syncAllPickingOutboxBatches();
      totalSynced += pickingResult.syncedBatches;

      checkPendingCounts();

      if (totalSynced > 0) {
        if (onNotify) {
          onNotify(`✅ Berhasil menyinkronkan ${totalSynced} antrean data offline ke Database Supabase!`, 'success');
        }
      }
    } catch (err) {
      console.warn('Sync offline data error:', err);
      if (onNotify) onNotify('Gagal menyinkronkan sebagian data offline', 'warning');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    checkPendingCounts();

    const handleOnline = () => {
      setIsOnline(true);
      if (onNotify) onNotify('⚡ Koneksi internet kembali aktif! Memeriksa antrean data offline...', 'info');
      syncAllOfflineData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      checkPendingCounts();
      if (onNotify) onNotify('⚠️ Koneksi internet terputus. Mode proteksi offline aktif: Seluruh pekerjaan Anda tetap aman tersimpan.', 'warning');
    };

    const handleOutboxUpdated = () => {
      checkPendingCounts();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('wms_scanner_outbox_updated', handleOutboxUpdated);
    window.addEventListener('wms_picking_outbox_updated', handleOutboxUpdated);
    window.addEventListener('wms_penerimaan_produksi_updated', handleOutboxUpdated);

    // Periodically poll for pending offline items (e.g. every 5 seconds)
    const interval = setInterval(() => {
      checkPendingCounts();
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('wms_scanner_outbox_updated', handleOutboxUpdated);
      window.removeEventListener('wms_picking_outbox_updated', handleOutboxUpdated);
      window.removeEventListener('wms_penerimaan_produksi_updated', handleOutboxUpdated);
      clearInterval(interval);
    };
  }, []);

  const totalPending = pendingSJCount + pendingPeminjamanCount + pendingProduksiCount + pendingScannerCount + pendingRecountCount + pendingPickingCount;

  // If online and no pending items, remain completely invisible (zero-clutter UI)
  if (isOnline && totalPending === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Status Koneksi & Proteksi Offline"
      className={`w-full px-3 sm:px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b transition-colors shadow-2xs print:hidden ${
        !isOnline
          ? 'bg-amber-500 text-amber-950 dark:bg-amber-600/95 dark:text-white border-amber-600/30'
          : 'bg-blue-600 text-white dark:bg-blue-700 border-blue-800/40'
      }`}
    >
      <div className="flex items-center gap-2 font-medium min-w-0">
        {!isOnline ? (
          <>
            <WifiOff className="w-4 h-4 shrink-0 text-amber-950 dark:text-white" />
            <span className="leading-snug">
              <strong>Mode Offline</strong>
              <span className="hidden sm:inline"> — Koneksi terputus. Data tersimpan di perangkat dan akan disinkronkan saat kembali online.</span>
              <span className="sm:hidden"> — Data tersimpan di perangkat.</span>
            </span>
          </>
        ) : (
          <>
            <CloudUpload className="w-4 h-4 shrink-0" />
            <span className="leading-snug">
              <strong className="font-mono tabular-nums">{totalPending}</strong> pekerjaan offline siap disinkronkan.
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {totalPending > 0 && isOnline && (
          <button
            type="button"
            onClick={syncAllOfflineData}
            disabled={isSyncing}
            className="px-2.5 py-1 bg-white text-blue-700 hover:bg-blue-50 font-bold rounded-lg shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer text-[11px] disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan'}</span>
          </button>
        )}
        {!isOnline && totalPending > 0 && (
          <span className="bg-amber-600/30 dark:bg-black/20 px-2 py-0.5 rounded font-mono tabular-nums text-[10.5px] whitespace-nowrap">
            {totalPending} draft
          </span>
        )}
      </div>
    </aside>
  );
};
