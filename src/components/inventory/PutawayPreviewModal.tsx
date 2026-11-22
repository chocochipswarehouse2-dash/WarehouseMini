import React, { useState, useEffect, useMemo } from 'react';
import { NumberInput } from '../common/NumberInput';
import {
  X,
  Package,
  MapPin,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Layers,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import type {
  RackCapacityConfig,
  ComputedRackSlot,
  EnrichedCatalogEntry,
} from '../../services/rackCapacityService';
import {
  fetchLivePutawaySourceStock,
  generateLivePutawayRoute,
  createPutawayTask,
  broadcastPutawayRealtime,
  type LivePutawaySourceItem,
} from '../../services/putawayService';
import { saveActivePutawaySession } from '../../services/scannerOutboxService';
import type { PutawayTask } from '../../types';

interface PutawayPreviewModalProps {
  isOpen: boolean;
  sourceLocations: string[];
  allSlots: ComputedRackSlot[];
  config: RackCapacityConfig;
  activeTasks: PutawayTask[];
  catalogMap: Map<string, EnrichedCatalogEntry>;
  currentUser: string;
  onClose: () => void;
  onTaskStarted: (task: PutawayTask) => void;
  onNotify?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const PutawayPreviewModal: React.FC<PutawayPreviewModalProps> = ({
  isOpen,
  sourceLocations,
  allSlots,
  config,
  activeTasks,
  catalogMap,
  currentUser,
  onClose,
  onTaskStarted,
  onNotify,
}) => {
  const [loading, setLoading] = useState(false);
  const [sourceItems, setSourceItems] = useState<LivePutawaySourceItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [customQtyByKey, setCustomQtyByKey] = useState<Record<string, number>>({});
  const [enableKoliSplit, setEnableKoliSplit] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const sourcesKey = sourceLocations.map((s) => s.toUpperCase()).sort().join(',');

  const loadLiveSource = async () => {
    if (!isOpen || sourceLocations.length === 0) return;
    setLoading(true);
    try {
      const live = await fetchLivePutawaySourceStock(sourceLocations, catalogMap, activeTasks);
      setSourceItems(live);
      setSelectedKeys(new Set(live.map((it) => it.key)));
      const qtyInit: Record<string, number> = {};
      live.forEach((it) => {
        qtyInit[it.key] = it.availableQty;
      });
      setCustomQtyByKey(qtyInit);
    } catch (err: any) {
      onNotify?.(err?.message || 'Gagal memuat stok live lokasi sumber putaway.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLiveSource();
    }
  }, [isOpen, sourcesKey]);

  const hasTransitSource = useMemo(
    () => sourceItems.some((it) => it.source_area.toUpperCase() === 'TRANSIT'),
    [sourceItems]
  );

  const routePreview = useMemo(
    () =>
      generateLivePutawayRoute({
        sourceItems,
        allSlots,
        config,
        activeTasks,
        catalogMap,
        enableKoliSplitForTransit: enableKoliSplit,
        selectedKeys,
        customQtyByKey,
      }),
    [
      sourceItems,
      allSlots,
      config,
      activeTasks,
      catalogMap,
      enableKoliSplit,
      selectedKeys,
      customQtyByKey,
    ]
  );

  const groupedPreview = useMemo(() => {
    const groups = new Map<
      string,
      { destLoc: string; totalPcs: number; items: typeof routePreview.items }
    >();
    for (const item of routePreview.items) {
      const destLoc = (item.recommended_lokasi || '').trim().toUpperCase() || 'PILIH MANUAL';
      let g = groups.get(destLoc);
      if (!g) {
        g = { destLoc, totalPcs: 0, items: [] };
        groups.set(destLoc, g);
      }
      g.items.push(item);
      g.totalPcs += item.qty_target;
    }
    return Array.from(groups.values());
  }, [routePreview.items]);

  const totalTargetPcs = useMemo(
    () => routePreview.items.reduce((s, it) => s + (Number(it.qty_target) || 0), 0),
    [routePreview.items]
  );

  if (!isOpen) return null;

  const toggleItem = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedKeys.size === sourceItems.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(sourceItems.map((it) => it.key)));
    }
  };

  const handleStartTask = async () => {
    if (routePreview.items.length === 0 || totalTargetPcs <= 0) {
      onNotify?.('Pilih minimal 1 item dengan kuantitas > 0 untuk memulai Tugas Putaway.', 'warning');
      return;
    }
    setIsCreating(true);
    try {
      const effectiveSourceLocations = Array.from(
        new Set(routePreview.items.map((it) => it.source_lokasi))
      );
      const created = await createPutawayTask({
        sourceLocations: effectiveSourceLocations,
        items: routePreview.items,
        createdBy: currentUser,
        safeCapPercent: routePreview.safeCapPercent,
      });

      saveActivePutawaySession({
        taskId: created.id,
        task: created,
        activeTargetLoc: '',
        rekapCatatan: '',
        isMinimized: false,
        timestamp: Date.now(),
      });

      broadcastPutawayRealtime('task_created', {
        taskId: created.id,
        actor: currentUser,
        ts: Date.now(),
      });

      onNotify?.(
        `✅ Tugas Putaway ${created.invoice_putaway} dimulai (${totalTargetPcs} pcs ke ${groupedPreview.length} titik rak).`,
        'success'
      );
      onTaskStarted(created);
    } catch (err: any) {
      onNotify?.(err?.message || 'Gagal memulai Tugas Putaway.', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const maxPerSkuAbcd = Math.max(1, Number(config.refillMaxPerSkuAbcd) || 12);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[92vh] bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0E1420] flex items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Ambil Tugas Putaway</span>
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800">
                Plafon Aman {routePreview.safeCapPercent}%
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span>Sumber:</span>
              {sourceLocations.map((loc) => (
                <span
                  key={loc}
                  className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono font-bold text-[10px]"
                >
                  {loc}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={loadLiveSource}
              disabled={loading}
              className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 cursor-pointer disabled:opacity-50"
              title="Hitung ulang stok live dari database"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
              <span>Mengambil stok live &amp; menghitung rute putaway terbaik...</span>
            </div>
          ) : sourceItems.length === 0 ? (
            <div className="py-12 text-center space-y-2 bg-slate-50 dark:bg-[#0E1420] rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                Tidak Ada Stok Tersedia untuk Putaway Baru
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Seluruh stok pada lokasi yang dipilih sudah habis (0 pcs) atau seluruh kuantitasnya sudah masuk dalam Tugas Putaway yang sedang aktif.
              </p>
            </div>
          ) : (
            <>
              {/* Info & Anti-Collision Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {routePreview.reservedRacksCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 font-bold text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Anti-Tabrakan Aktif: {routePreview.reservedRacksCount} rak di-reserve tugas lain
                      </span>
                    </span>
                  )}
                  {routePreview.splitToKoliPcs > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 font-bold text-[11px] font-mono">
                      Auto-Split Kolian: {routePreview.splitToKoliPcs} pcs
                    </span>
                  )}
                  {routePreview.unfittedAbcdPcs > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800 font-bold text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{routePreview.unfittedAbcdPcs} pcs melebihi plafon (pilih manual/sisakan)</span>
                    </span>
                  )}
                </div>

                {hasTransitSource && (
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={enableKoliSplit}
                      onChange={(e) => setEnableKoliSplit(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Auto-Split Qty Besar ke Kolian (Maks {maxPerSkuAbcd} pcs/SKU di ABCD)</span>
                  </label>
                )}
              </div>

              {/* Master-Detail Two-Pane Preview */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left: Source Items Checklist */}
                <div className="lg:col-span-5 space-y-2.5 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Pilih Barang Sumber ({selectedKeys.size}/{sourceItems.length} SKU)</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleAll}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {selectedKeys.size === sourceItems.length ? 'Batal Semua' : 'Pilih Semua'}
                    </button>
                  </div>

                  <div className="max-h-[42vh] lg:max-h-[48vh] overflow-y-auto space-y-1.5 pr-1">
                    {sourceItems.map((it) => {
                      const isChecked = selectedKeys.has(it.key);
                      const chosenQty = customQtyByKey[it.key] ?? it.availableQty;
                      return (
                        <div
                          key={it.key}
                          className={`p-2.5 rounded-xl border transition-colors ${
                            isChecked
                              ? 'bg-white dark:bg-[#0E1420] border-indigo-200 dark:border-indigo-900/70'
                              : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-65'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleItem(it.key)}
                              className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                                  {it.sku}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px] text-slate-700 dark:text-slate-300 shrink-0">
                                  {it.source_lokasi}
                                </span>
                              </div>
                              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-1">
                                {it.nama_produk}
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                <span>
                                  Size <strong className="font-mono text-slate-700 dark:text-slate-300">{it.size}</strong>
                                  {it.reservedInActiveTaskQty > 0 && (
                                    <span className="ml-1.5 text-amber-600 dark:text-amber-400">
                                      ({it.reservedInActiveTaskQty} pcs di tugas lain)
                                    </span>
                                  )}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <NumberInput
                                    min={1}
                                    max={it.availableQty}
                                    disabled={!isChecked}
                                    value={chosenQty}
                                    selectOnFocus
                                    onValueChange={(val) => {
                                      const clamped = Math.max(1, Math.min(it.availableQty, Math.floor(val)));
                                      setCustomQtyByKey((prev) => ({ ...prev, [it.key]: clamped }));
                                    }}
                                    className="w-14 px-1.5 py-0.5 text-right text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white disabled:opacity-50"
                                  />
                                  <span className="font-mono text-[10px]">/ {it.availableQty}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Live Computed Route Preview */}
                <div className="lg:col-span-7 space-y-2.5 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>
                        Pratinjau Rute Tujuan ({groupedPreview.length} Rak · {totalTargetPcs} pcs)
                      </span>
                    </div>
                  </div>

                  {groupedPreview.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                      Centang minimal 1 SKU di sebelah kiri untuk melihat rute penempatan.
                    </div>
                  ) : (
                    <div className="max-h-[42vh] lg:max-h-[48vh] overflow-y-auto space-y-2.5 pr-1">
                      {groupedPreview.map((grp, idx) => (
                        <div
                          key={grp.destLoc}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1420] overflow-hidden"
                        >
                          <div className="px-3 py-2 bg-slate-100/90 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700/70 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                STOP #{idx + 1}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md font-mono font-black text-xs ${
                                  grp.destLoc === 'PILIH MANUAL'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                                    : 'bg-indigo-600 text-white'
                                }`}
                              >
                                {grp.destLoc}
                              </span>
                            </div>
                            <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                              {grp.items.length} baris · {grp.totalPcs} pcs
                            </span>
                          </div>

                          <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                            {grp.items.map((item) => (
                              <div
                                key={item.id}
                                className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                                      {item.sku}
                                    </span>
                                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                      Dari {item.source_lokasi}
                                    </span>
                                    {item.is_koli_overflow && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                        Kolian
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                                    {item.nama_produk} ({item.size})
                                  </div>
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                    {item.recommended_reason}
                                  </div>
                                </div>
                                <div className="text-right font-mono font-black text-sm text-indigo-600 dark:text-indigo-400 shrink-0">
                                  {item.qty_target} pcs
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#0E1420] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Picker tetap dapat mengubah rak tujuan atau memecah qty per rak saat eksekusi di lapangan.
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={loading || isCreating || totalTargetPcs <= 0}
              onClick={handleStartTask}
              className="px-4 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>Mulai Tugas Putaway ({totalTargetPcs} pcs)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
