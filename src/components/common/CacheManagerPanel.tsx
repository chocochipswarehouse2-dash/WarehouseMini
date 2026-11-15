import React, { useEffect, useState, useCallback } from 'react';
import { Trash2, RefreshCw, CheckSquare, Square, AlertTriangle, ShieldCheck } from 'lucide-react';
import {
  CACHE_MODULES,
  CacheModuleStats,
  clearAllSafeModuleCaches,
  clearCacheModules,
  formatCacheBytes,
  getCacheModulesStats,
} from '../../services/cacheManagerService';

interface CacheManagerPanelProps {
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  compact?: boolean;
}

export const CacheManagerPanel: React.FC<CacheManagerPanelProps> = ({
  onNotify,
  compact = false,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(['katalog_stok'])
  );
  const [stats, setStats] = useState<Record<string, CacheModuleStats>>({});
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const next = await getCacheModulesStats();
      setStats(next);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const toggleModule = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllSafe = () => {
    setSelectedIds(
      new Set(CACHE_MODULES.filter((m) => !m.isLocalOnly).map((m) => m.id))
    );
  };

  const selectAllIncludingLocal = () => {
    setSelectedIds(new Set(CACHE_MODULES.map((m) => m.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleClearSelected = async () => {
    if (selectedIds.size === 0 || isClearing) return;

    const selectedModules = CACHE_MODULES.filter((m) => selectedIds.has(m.id));
    const localOnlyModules = selectedModules.filter((m) => m.isLocalOnly);

    if (localOnlyModules.length > 0) {
      const names = localOnlyModules.map((m) => m.label).join(', ');
      const confirmed = window.confirm(
        `Perhatian: Modul berikut berisi data lokal yang hanya tersimpan di browser ini:\n\n• ${names}\n\nJika dihapus, data lokal tersebut tidak bisa dikembalikan kecuali di-import ulang. Lanjutkan?`
      );
      if (!confirmed) return;
    }

    setIsClearing(true);
    try {
      const { clearedLabels } = await clearCacheModules(Array.from(selectedIds));
      await loadStats();
      onNotify?.(
        `Cache lokal dibersihkan (${clearedLabels.length} modul): ${clearedLabels.join(', ')}.`,
        'success'
      );
    } catch (err: any) {
      onNotify?.(err?.message || 'Gagal membersihkan cache terpilih.', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const handleClearAllSafe = async () => {
    if (isClearing) return;
    setIsClearing(true);
    try {
      const { clearedLabels } = await clearAllSafeModuleCaches();
      await loadStats();
      onNotify?.(
        `Semua cache server & aplikasi berhasil dibersihkan (${clearedLabels.length} modul). Data lokal Shopee/Website & sesi login tetap aman.`,
        'success'
      );
    } catch (err: any) {
      onNotify?.(err?.message || 'Gagal membersihkan semua cache aman.', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3.5 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Kelola &amp; Bersihkan Cache Lokal (Per Modul / Semua)</span>
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Pilih modul tertentu (mis. Shopee, Picking, Katalog) atau bersihkan seluruh cache sekaligus. Sesi login &amp; tema tetap aman.
          </p>
        </div>

        <button
          type="button"
          onClick={loadStats}
          disabled={isLoadingStats}
          title="Hitung ulang ukuran cache lokal"
          className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold hover:border-indigo-500 flex items-center gap-1 cursor-pointer shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isLoadingStats ? 'animate-spin' : ''}`} />
          <span>Cek Ukuran</span>
        </button>
      </div>

      {/* Quick Select Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={selectAllSafe}
          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-indigo-500 cursor-pointer"
        >
          Pilih Semua Aman
        </button>
        <button
          type="button"
          onClick={selectAllIncludingLocal}
          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-amber-500 cursor-pointer"
        >
          Pilih Semua (+Data Lokal)
        </button>
        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
          >
            Kosongkan Pilihan
          </button>
        )}
      </div>

      {/* Module Checklist */}
      <div
        className={`grid grid-cols-1 ${
          compact ? 'gap-1.5 max-h-56' : 'sm:grid-cols-2 gap-2 max-h-72'
        } overflow-y-auto pr-1`}
      >
        {CACHE_MODULES.map((mod) => {
          const checked = selectedIds.has(mod.id);
          const stat = stats[mod.id];
          const hasData = stat && (stat.bytes > 0 || stat.idbCount > 0);

          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => toggleModule(mod.id)}
              className={`text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                checked
                  ? 'bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-400 dark:border-indigo-600'
                  : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <span className="mt-0.5 text-indigo-600 dark:text-indigo-400 shrink-0">
                {checked ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                    {mod.label}
                  </span>
                  {mod.isLocalOnly ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Data Lokal
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      Aman
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {mod.description}
                </p>

                {stat && (
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {stat.idbCount > 0 && <span>{stat.idbCount.toLocaleString('id-ID')} item</span>}
                    {stat.bytes > 0 && <span>{formatCacheBytes(stat.bytes)}</span>}
                    {!hasData && <span className="text-slate-400 dark:text-slate-500">Kosong</span>}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Action Buttons: max 1 solid primary + neutral outline secondary */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleClearAllSafe}
          disabled={isClearing}
          className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-500 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
        >
          Bersihkan Semua Cache Aman
        </button>

        <button
          type="button"
          onClick={handleClearSelected}
          disabled={isClearing || selectedIds.size === 0}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>
            {isClearing
              ? 'Membersihkan...'
              : `Bersihkan Modul Terpilih (${selectedIds.size})`}
          </span>
        </button>
      </div>
    </div>
  );
};
