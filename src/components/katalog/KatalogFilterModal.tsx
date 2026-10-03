import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  SlidersHorizontal,
  RotateCcw,
  Check,
  CheckSquare,
  Square,
  Globe,
  Store,
  Calendar,
  Layers,
  ArrowUpDown,
  Eye,
  EyeOff,
  Package,
  Search,
} from 'lucide-react';
import { KatalogBatch } from '../../types';
import { compareKatalogBatches, KatalogSortOrder } from './katalogStorage';

export interface KatalogFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  batches: KatalogBatch[];
  selectedCatalogIds: string[];
  onToggleCatalog: (id: string) => void;
  onSelectAllCatalogs: () => void;
  onSelectOnlyCatalog: (id: string) => void;
  onDeselectAllCatalogs?: () => void;
  channelFilter: 'all' | 'online' | 'offline' | 'online_only' | 'offline_only' | 'both' | 'none';
  setChannelFilter: (f: 'all' | 'online' | 'offline' | 'online_only' | 'offline_only' | 'both' | 'none') => void;
  channelCounts: {
    all: number;
    online: number;
    offline: number;
    online_only: number;
    offline_only: number;
    both: number;
    none: number;
  };
  sortOrder: KatalogSortOrder;
  setSortOrder: (s: KatalogSortOrder) => void;
  hideVariants: boolean;
  setHideVariants: (h: boolean) => void;
  groupByCatalog: boolean;
  setGroupByCatalog: (g: boolean) => void;
  onResetAllFilters: () => void;
  totalFilteredProducts: number;
  getBatchPalette: (name: string) => { bg: string; text: string; border: string };
}

export const KatalogFilterModal: React.FC<KatalogFilterModalProps> = ({
  isOpen,
  onClose,
  batches,
  selectedCatalogIds,
  onToggleCatalog,
  onSelectAllCatalogs,
  onSelectOnlyCatalog,
  onDeselectAllCatalogs,
  channelFilter,
  setChannelFilter,
  channelCounts,
  sortOrder,
  setSortOrder,
  hideVariants,
  setHideVariants,
  groupByCatalog,
  setGroupByCatalog,
  onResetAllFilters,
  totalFilteredProducts,
  getBatchPalette,
}) => {
  const [catalogSearch, setCatalogSearch] = useState('');

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Urutkan dan filter daftar katalog berdasarkan search
  const filteredBatches = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    const list = !q
      ? batches
      : batches.filter((b) => b.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => compareKatalogBatches(a, b, 'newest'));
  }, [batches, catalogSearch]);

  if (!isOpen) return null;

  const isAllCatalogsSelected =
    batches.length > 0 && selectedCatalogIds.length === batches.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden animate-in slide-in-from-bottom duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-800 dark:text-white leading-tight">
                Filter &amp; Opsi Tampilan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sesuaikan katalog koleksi, saluran rilis, dan format kartu
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-xs text-slate-700 dark:text-slate-300">
          {/* SECTION 1: FILTER KATALOG KOLEKSI */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-black text-slate-900 dark:text-white flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>
                  Koleksi Katalog ({selectedCatalogIds.length} dari {batches.length} Dipilih)
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onSelectAllCatalogs}
                  className={`text-[11px] font-bold hover:underline cursor-pointer ${
                    isAllCatalogsSelected ? 'text-slate-400' : 'text-indigo-600 dark:text-indigo-400'
                  }`}
                >
                  Pilih Semua
                </button>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeselectAllCatalogs) {
                      onDeselectAllCatalogs();
                    } else {
                      selectedCatalogIds.forEach((id) => onToggleCatalog(id));
                    }
                  }}
                  className="text-[11px] font-bold text-slate-500 hover:text-red-500 cursor-pointer"
                >
                  Batal Semua
                </button>
              </div>
            </div>

            {/* Pencarian Katalog Cepat (jika katalog > 6) */}
            {batches.length > 6 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Cari nama koleksi katalog..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>
            )}

            {/* Grid Kartu Katalog */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
              {filteredBatches.map((batch) => {
                const isSelected = selectedCatalogIds.includes(batch.id);
                const palette = getBatchPalette(batch.name);
                return (
                  <div
                    key={batch.id}
                    onClick={() => onToggleCatalog(batch.id)}
                    className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${
                      isSelected
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-2xs font-bold text-slate-900 dark:text-white'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate text-xs">{batch.name}</span>
                    </div>

                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0 ${palette.bg} ${palette.text}`}
                    >
                      {batch.items.length}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: FILTER SALURAN RILIS */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="font-black text-slate-900 dark:text-white flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <Globe className="w-3.5 h-3.5 text-blue-500" />
              <span>Saluran Penjualan / Rilis</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {/* Semua */}
              <button
                type="button"
                onClick={() => setChannelFilter('all')}
                className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-between ${
                  channelFilter === 'all'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>Semua</span>
                <span className="text-[10px] opacity-75 font-normal">({channelCounts.all})</span>
              </button>

              {/* Online (Semua) */}
              <button
                type="button"
                onClick={() => setChannelFilter('online')}
                className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-between ${
                  channelFilter === 'online'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-blue-50/70 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Globe className="w-3 h-3" />
                  Online
                </span>
                <span className="text-[10px] opacity-80 font-normal">({channelCounts.online})</span>
              </button>

              {/* Offline (Semua) */}
              <button
                type="button"
                onClick={() => setChannelFilter('offline')}
                className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-between ${
                  channelFilter === 'offline'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-amber-50/70 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Store className="w-3 h-3" />
                  Offline
                </span>
                <span className="text-[10px] opacity-80 font-normal">({channelCounts.offline})</span>
              </button>

              {/* Online & Offline */}
              <button
                type="button"
                onClick={() => setChannelFilter('both')}
                className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-between ${
                  channelFilter === 'both'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-50/70 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
                }`}
              >
                <span>Online &amp; Offline</span>
                <span className="text-[10px] opacity-80 font-normal">({channelCounts.both})</span>
              </button>

              {/* Online Only */}
              <button
                type="button"
                onClick={() => setChannelFilter('online_only')}
                className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-between ${
                  channelFilter === 'online_only'
                    ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                    : 'bg-cyan-50/70 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100'
                }`}
              >
                <span>Online Only</span>
                <span className="text-[10px] opacity-80 font-normal">({channelCounts.online_only})</span>
              </button>

              {/* Offline Only */}
              <button
                type="button"
                onClick={() => setChannelFilter('offline_only')}
                className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-between ${
                  channelFilter === 'offline_only'
                    ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                    : 'bg-orange-50/70 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-800 hover:bg-orange-100'
                }`}
              >
                <span>Offline Only</span>
                <span className="text-[10px] opacity-80 font-normal">({channelCounts.offline_only})</span>
              </button>

              {/* Belum Ditentukan */}
              <button
                type="button"
                onClick={() => setChannelFilter('none')}
                className={`col-span-2 p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center justify-between ${
                  channelFilter === 'none'
                    ? 'bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900 border-slate-700 shadow-xs'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
              >
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Belum Ditentukan Tanggal Rilis
                </span>
                <span className="text-[10px] opacity-80 font-normal">({channelCounts.none})</span>
              </button>
            </div>
          </div>

          {/* SECTION 3: URUTAN TAMPILAN */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="font-black text-slate-900 dark:text-white flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-500" />
              <span>Urutan Tampilan Katalog</span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'newest', label: 'Terbaru → Terlama (Angka Besar)' },
                { key: 'oldest', label: 'Terlama → Terbaru (Angka Kecil)' },
                { key: 'name_asc', label: 'Nama Katalog A → Z' },
                { key: 'name_desc', label: 'Nama Katalog Z → A' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortOrder(opt.key as KatalogSortOrder)}
                  className={`p-2 rounded-xl text-xs font-bold border transition-all text-left flex items-center justify-between cursor-pointer ${
                    sortOrder === opt.key
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 shadow-2xs font-black'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {sortOrder === opt.key && (
                    <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* SECTION 4: OPSI TAMPILAN KARTU */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="font-black text-slate-900 dark:text-white flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <Eye className="w-3.5 h-3.5 text-purple-500" />
              <span>Format &amp; Tampilan Kartu</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Toggle Rincian Varian */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    {hideVariants ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5 text-emerald-500" />}
                    <span>Tabel Rincian Varian</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {hideVariants ? 'Ditutup (tampilan ringkas)' : 'Dibuka (tabel SKU & Qty fisik)'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setHideVariants(!hideVariants)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                    hideVariants
                      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200'
                  }`}
                >
                  {hideVariants ? 'Buka' : 'Tutup'}
                </button>
              </div>

              {/* Toggle Pengelompokan */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Pengelompokan Produk</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {groupByCatalog ? 'Per Katalog (ada header batch)' : 'Semua Grid (tampilan gabung)'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setGroupByCatalog(!groupByCatalog)}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  {groupByCatalog ? 'Gabungkan' : 'Pisah Katalog'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onResetAllFilters}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-red-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Semua Filter</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Tampilkan ({totalFilteredProducts} Produk)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
