import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, CloudUpload, RefreshCw, CheckCircle2 } from 'lucide-react';
import { getPendingOfflinePengecekanSJ, syncPendingOfflinePengecekanSJ } from '../services/gasTarikanMD';
import { getPendingOfflinePeminjaman, clearPendingOfflinePeminjaman, getPendingOfflineProduksiCount } from '../services/localDb';
import { savePeminjamanToSupabase, syncOfflinePenerimaanProduksi } from '../services/supabase';

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
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const checkPendingCounts = () => {
    const sjList = getPendingOfflinePengecekanSJ();
    const pemList = getPendingOfflinePeminjaman();
    const prodCount = getPendingOfflineProduksiCount();
    setPendingSJCount(sjList.length);
    setPendingPeminjamanCount(pemList.length);
    setPendingProduksiCount(prodCount);
  };

  const syncAllOfflineData = async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);

    try {
      let totalSynced = 0;

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

      // 3. Sync Penerimaan Produksi Offline
      const prodResult = await syncOfflinePenerimaanProduksi();
      totalSynced += prodResult.synced;

      checkPendingCounts();

      if (totalSynced > 0) {
        if (onNotify) {
          onNotify(`✅ Berhasil menyinkronkan ${totalSynced} data offline ke Database Supabase!`, 'success');
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

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodically poll for pending offline items (e.g. every 5 seconds)
    const interval = setInterval(() => {
      checkPendingCounts();
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const totalPending = pendingSJCount + pendingPeminjamanCount + pendingProduksiCount;

  // If online and no pending items, remain completely invisible (zero-clutter UI)
  if (isOnline && totalPending === 0) {
    return null;
  }

  return (
    <aside 
      aria-label="Status Koneksi & Proteksi Offline"
      className={`w-full px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 border-b transition-colors shadow-2xs ${
      !isOnline
        ? 'bg-amber-500 text-amber-950 dark:bg-amber-600/90 dark:text-white border-amber-600/30'
        : 'bg-blue-600 text-white dark:bg-blue-700 border-blue-800/40'
    }`}>
      <div className="flex items-center gap-2 font-medium">
        {!isOnline ? (
          <>
            <WifiOff className="w-4 h-4 shrink-0 animate-pulse text-amber-950 dark:text-white" />
            <span>
              <strong>Mode Offline Aktif</strong> — Internet terputus. Status pekerjaan Anda tetap aman tersimpan di perangkat (IndexedDB & Cache Lokal).
            </span>
          </>
        ) : (
          <>
            <CloudUpload className="w-4 h-4 shrink-0" />
            <span>
              <strong>{totalPending} pekerjaan offline</strong> siap disinkronkan ke Database Supabase.
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {totalPending > 0 && isOnline && (
          <button
            type="button"
            onClick={syncAllOfflineData}
            disabled={isSyncing}
            className="px-3 py-1 bg-white text-blue-700 hover:bg-blue-50 font-bold rounded-lg shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer text-[11px] disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
          </button>
        )}
        {!isOnline && totalPending > 0 && (
          <span className="bg-amber-600/30 dark:bg-black/20 px-2 py-0.5 rounded font-mono text-[10.5px]">
            {totalPending} draft tersimpan offline
          </span>
        )}
      </div>
    </aside>
  );
};
