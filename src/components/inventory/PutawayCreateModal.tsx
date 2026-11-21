import React, { useMemo, useState } from 'react';
import {
  X,
  Search,
  ClipboardList,
  CheckSquare,
  Square,
  Package,
  ArrowRight,
  Layers,
} from 'lucide-react';
import {
  isPutawayEligibleSource,
  type ComputedRackSlot,
} from '../../services/rackCapacityService';
import type { PutawayTask } from '../../types';

interface PutawayCreateModalProps {
  isOpen: boolean;
  allSlots: ComputedRackSlot[];
  activeTasks: PutawayTask[];
  onClose: () => void;
  onProceedToPreview: (sourceLocations: string[]) => void;
}

type AreaFilter = 'ALL' | 'TRANSIT' | 'KOLIAN';

export const PutawayCreateModal: React.FC<PutawayCreateModalProps> = ({
  isOpen,
  allSlots,
  activeTasks,
  onClose,
  onProceedToPreview,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('ALL');
  const [selectedLocs, setSelectedLocs] = useState<Set<string>>(() => new Set());

  // Map active putaway tasks per source location for status badges
  const activeTaskBySourceLoc = useMemo(() => {
    const map = new Map<string, { invoices: string[]; claimedQty: number }>();
    for (const task of activeTasks) {
      if (task.status !== 'AKTIF') continue;
      for (const item of task.items || []) {
        for (const bucket of item.source_buckets || []) {
          const locUp = (bucket.lokasiExact || (bucket as any).lokasi || '').trim().toUpperCase();
          if (!locUp) continue;
          const prev = map.get(locUp) || { invoices: [], claimedQty: 0 };
          if (!prev.invoices.includes(task.invoice_putaway)) {
            prev.invoices.push(task.invoice_putaway);
          }
          prev.claimedQty += Math.max(0, Number(bucket.qty) || 0);
          map.set(locUp, prev);
        }
      }
      // Fallback if source_locations exists without source_buckets
      for (const loc of task.source_locations || []) {
        const locUp = (loc || '').trim().toUpperCase();
        if (!locUp) continue;
        const prev = map.get(locUp) || { invoices: [], claimedQty: 0 };
        if (!prev.invoices.includes(task.invoice_putaway)) {
          prev.invoices.push(task.invoice_putaway);
        }
        map.set(locUp, prev);
      }
    }
    return map;
  }, [activeTasks]);

  const eligibleSlots = useMemo(() => {
    return allSlots
      .filter((slot) => isPutawayEligibleSource(slot.area, slot.lokasi) && slot.currentQty > 0)
      .sort((a, b) => {
        const aIsTransit = a.area.toUpperCase() === 'TRANSIT' || a.lokasi.toUpperCase().startsWith('X');
        const bIsTransit = b.area.toUpperCase() === 'TRANSIT' || b.lokasi.toUpperCase().startsWith('X');
        if (aIsTransit !== bIsTransit) return aIsTransit ? -1 : 1;
        return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [allSlots]);

  const areaCounts = useMemo(() => {
    let transit = 0;
    let kolian = 0;
    for (const slot of eligibleSlots) {
      const isTransit =
        slot.area.toUpperCase() === 'TRANSIT' || slot.lokasi.toUpperCase().startsWith('X');
      if (isTransit) transit += 1;
      else kolian += 1;
    }
    return { all: eligibleSlots.length, transit, kolian };
  }, [eligibleSlots]);

  const filteredSlots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return eligibleSlots.filter((slot) => {
      const isTransit =
        slot.area.toUpperCase() === 'TRANSIT' || slot.lokasi.toUpperCase().startsWith('X');
      if (areaFilter === 'TRANSIT' && !isTransit) return false;
      if (areaFilter === 'KOLIAN' && isTransit) return false;

      if (!q) return true;
      if (slot.lokasi.toLowerCase().includes(q)) return true;
      if (slot.area.toLowerCase().includes(q)) return true;
      return (slot.items || []).some(
        (it) =>
          it.sku.toLowerCase().includes(q) ||
          (it.nama_produk || '').toLowerCase().includes(q)
      );
    });
  }, [eligibleSlots, areaFilter, searchQuery]);

  const selectedSummary = useMemo(() => {
    let totalPcs = 0;
    const locations: string[] = [];
    for (const slot of eligibleSlots) {
      if (selectedLocs.has(slot.lokasi)) {
        locations.push(slot.lokasi);
        totalPcs += slot.currentQty;
      }
    }
    return { locations, totalPcs };
  }, [eligibleSlots, selectedLocs]);

  const allFilteredSelected =
    filteredSlots.length > 0 && filteredSlots.every((s) => selectedLocs.has(s.lokasi));

  const toggleLoc = (lokasi: string) => {
    setSelectedLocs((prev) => {
      const next = new Set(prev);
      if (next.has(lokasi)) next.delete(lokasi);
      else next.add(lokasi);
      return next;
    });
  };

  const handleToggleSelectAllFiltered = () => {
    setSelectedLocs((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredSlots.forEach((s) => next.delete(s.lokasi));
      } else {
        filteredSlots.forEach((s) => next.add(s.lokasi));
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <ClipboardList className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                Buat / Panggil Tugas Putaway
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Pilih 1 atau beberapa rak sumber dari Transit (X) &amp; Kolian (R/V/Z) untuk dipindahkan ke rak penyimpanan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            aria-label="Tutup form panggil putaway"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Area Filter */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0E1420] space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode rak (X, R024, V003), SKU, atau nama produk..."
              autoFocus
              className="w-full h-9 pl-9 pr-8 text-xs rounded-xl bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'ALL', label: `Semua (${areaCounts.all})` },
                  { id: 'TRANSIT', label: `Transit X (${areaCounts.transit})` },
                  { id: 'KOLIAN', label: `Kolian R/V/Z (${areaCounts.kolian})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAreaFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-colors ${
                    areaFilter === tab.id
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {filteredSlots.length > 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAllFiltered}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer whitespace-nowrap"
              >
                {allFilteredSelected ? 'Batal Pilih Semua' : `Pilih Semua (${filteredSlots.length})`}
              </button>
            )}
          </div>
        </div>

        {/* Eligible Racks List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {filteredSlots.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {eligibleSlots.length === 0
                  ? 'Tidak ada stok tersedia di Transit (X) maupun Kolian (R/V/Z).'
                  : 'Tidak ada rak Transit/Kolian yang cocok dengan pencarian.'}
              </div>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setAreaFilter('ALL');
                  }}
                  className="px-3 py-1.5 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
          ) : (
            filteredSlots.map((slot) => {
              const isSelected = selectedLocs.has(slot.lokasi);
              const isTransit =
                slot.area.toUpperCase() === 'TRANSIT' || slot.lokasi.toUpperCase().startsWith('X');
              const activeInfo = activeTaskBySourceLoc.get(slot.lokasi.toUpperCase());
              const previewItems = (slot.items || []).slice(0, 3);
              const extraItemCount = Math.max(0, (slot.items || []).length - previewItems.length);

              return (
                <button
                  key={slot.lokasi}
                  type="button"
                  onClick={() => toggleLoc(slot.lokasi)}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                    isSelected
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/35 border-indigo-400 dark:border-indigo-600 shadow-2xs'
                      : 'bg-white dark:bg-[#0E1420] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="pt-0.5 shrink-0 text-indigo-600 dark:text-indigo-400">
                    {isSelected ? (
                      <CheckSquare className="w-4.5 h-4.5" />
                    ) : (
                      <Square className="w-4.5 h-4.5 text-slate-300 dark:text-slate-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                          {slot.lokasi}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isTransit
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60'
                              : 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-800/60'
                          }`}
                        >
                          {isTransit ? 'Transit' : 'Kolian'}
                        </span>
                        {activeInfo && activeInfo.invoices.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800">
                            Aktif: {activeInfo.invoices[0]}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 shrink-0">
                        <span>{slot.currentQty} pcs</span>
                        <span className="text-[10px] font-sans font-semibold text-slate-400">
                          ({slot.skuCount} SKU)
                        </span>
                      </div>
                    </div>

                    {previewItems.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {previewItems.map((it) => (
                          <span
                            key={it.sku}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-[10px] text-slate-700 dark:text-slate-300 max-w-full"
                          >
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {it.sku}
                            </span>
                            <span className="truncate max-w-[140px]">{it.nama_produk}</span>
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              ×{it.qty}
                            </span>
                          </span>
                        ))}
                        {extraItemCount > 0 && (
                          <span className="text-[10px] font-semibold text-slate-400">
                            +{extraItemCount} SKU lainnya
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Sticky Footer */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0E1420] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>
              <strong className="font-mono text-slate-900 dark:text-white">
                {selectedSummary.locations.length}
              </strong>{' '}
              rak dipilih
              {selectedSummary.totalPcs > 0 && (
                <>
                  {' '}
                  •{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {selectedSummary.totalPcs} pcs
                  </strong>
                </>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={selectedSummary.locations.length === 0}
              onClick={() => {
                onClose();
                onProceedToPreview(selectedSummary.locations);
              }}
              className="px-4 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>Lanjut Pratinjau Rute ({selectedSummary.locations.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
