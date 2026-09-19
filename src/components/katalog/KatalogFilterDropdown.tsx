import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Filter,
  Search,
  Check,
  CheckSquare,
  Square,
  X,
  ChevronDown,
  Layers,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { KatalogBatch } from '../../types';

interface KatalogFilterDropdownProps {
  batches: KatalogBatch[];
  selectedCatalogIds: string[];
  onToggleCatalog: (id: string) => void;
  onSelectAll: () => void;
  onSelectOnly: (id: string) => void;
  onClearSelection?: () => void;
  getBatchPalette: (name: string) => { bg: string; text: string; border: string };
}

export const KatalogFilterDropdown: React.FC<KatalogFilterDropdownProps> = ({
  batches,
  selectedCatalogIds,
  onToggleCatalog,
  onSelectAll,
  onSelectOnly,
  getBatchPalette,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto focus search input
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filtered batches inside dropdown search
  const filteredBatches = useMemo(() => {
    if (!searchQuery.trim()) return batches;
    const q = searchQuery.toLowerCase().trim();
    return batches.filter((b) => b.name.toLowerCase().includes(q));
  }, [batches, searchQuery]);

  const isAllSelected = selectedCatalogIds.length === batches.length && batches.length > 0;
  const isNoneSelected = selectedCatalogIds.length === 0;

  // Selected batch objects
  const selectedBatches = useMemo(() => {
    return batches.filter((b) => selectedCatalogIds.includes(b.id));
  }, [batches, selectedCatalogIds]);

  const totalProductsSelected = useMemo(() => {
    return selectedBatches.reduce((sum, b) => sum + b.items.length, 0);
  }, [selectedBatches]);

  const totalAllProducts = useMemo(() => {
    return batches.reduce((sum, b) => sum + b.items.length, 0);
  }, [batches]);

  // Label text for trigger button
  const triggerLabel = useMemo(() => {
    if (batches.length === 0) return 'Belum ada katalog';
    if (isAllSelected) {
      return `Semua Katalog (${batches.length})`;
    }
    if (selectedCatalogIds.length === 1 && selectedBatches[0]) {
      return `Katalog ${selectedBatches[0].name} (${selectedBatches[0].items.length})`;
    }
    return `${selectedCatalogIds.length} Katalog Dipilih (${totalProductsSelected} Model)`;
  }, [batches, isAllSelected, selectedCatalogIds, selectedBatches, totalProductsSelected]);

  return (
    <div className="relative inline-block w-full sm:w-auto" ref={dropdownRef}>
      {/* Trigger Button & Quick Action Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between gap-2.5 cursor-pointer border shadow-xs ${
            isAllSelected
              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white hover:bg-slate-800'
              : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 ring-2 ring-indigo-500/20'
          }`}
          title="Buka filter pemilihan katalog"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold text-slate-400 dark:text-slate-500 text-[11px] uppercase tracking-wider">
              Katalog:
            </span>
            <span className="truncate max-w-[200px] sm:max-w-[260px]">{triggerLabel}</span>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Quick Reset to All if filtered */}
        {!isAllSelected && (
          <button
            type="button"
            onClick={onSelectAll}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
            title="Reset ke Semua Katalog"
          >
            <span>Tampilkan Semua</span>
            <X className="w-3 h-3" />
          </button>
        )}

        {/* Active Selected Badges (Compact horizontal chips with dismiss button, max 4 visible) */}
        {!isAllSelected && selectedBatches.length > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 flex-wrap">
            {selectedBatches.slice(0, 3).map((b) => {
              const palette = getBatchPalette(b.name);
              return (
                <span
                  key={b.id}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 border ${palette.bg} ${palette.text} ${palette.border}`}
                >
                  <span>{b.name}</span>
                  <span className="text-[10px] opacity-75">({b.items.length})</span>
                  {selectedCatalogIds.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCatalog(b.id);
                      }}
                      className="hover:opacity-100 opacity-60 hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5 transition-opacity cursor-pointer ml-0.5"
                      title={`Hapus ${b.name} dari filter`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </span>
              );
            })}
            {selectedBatches.length > 3 && (
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                +{selectedBatches.length - 3} lainnya
              </button>
            )}
          </div>
        )}
      </div>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-2 w-full sm:w-[380px] md:w-[420px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
          {/* Header Popover with Search */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Pilih Katalog Produk</span>
                <span className="text-[10px] px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full font-semibold">
                  {batches.length} total
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input Cari Katalog (Efisien untuk Ratusan / Ribuan Katalog) */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ketik nama atau kode katalog..."
                className="w-full pl-8.5 pr-8 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Tombol Aksi Cepat */}
            <div className="flex items-center justify-between text-[11px] pt-0.5">
              <button
                type="button"
                onClick={onSelectAll}
                className="font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                <CheckSquare className="w-3 h-3" />
                <span>Pilih Semua ({batches.length})</span>
              </button>

              <span className="text-slate-400 dark:text-slate-500">
                {selectedCatalogIds.length} terpilih ({totalProductsSelected} model)
              </span>
            </div>
          </div>

          {/* List Katalog Scrollable */}
          <div className="max-h-[300px] overflow-y-auto p-2 space-y-1 divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredBatches.length === 0 ? (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500 space-y-1">
                <BookOpen className="w-8 h-8 mx-auto opacity-40" />
                <p className="text-xs font-medium">Katalog tidak ditemukan</p>
                <p className="text-[10px]">Coba cari dengan kata kunci lain</p>
              </div>
            ) : (
              filteredBatches.map((b) => {
                const isSelected = selectedCatalogIds.includes(b.id);
                const palette = getBatchPalette(b.name);
                const totalVariants = b.items.reduce((s, it) => s + (it.variants?.length || 0), 0);
                const totalPcs = b.items.reduce(
                  (s, it) => s + (it.variants?.reduce((vSum, v) => vSum + (v.qty || 0), 0) || 0),
                  0
                );

                return (
                  <div
                    key={b.id}
                    className={`pt-1 first:pt-0 flex items-center justify-between gap-2 p-2 rounded-xl transition-colors ${
                      isSelected
                        ? 'bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {/* Toggle Checkbox + Label */}
                    <button
                      type="button"
                      onClick={() => onToggleCatalog(b.id)}
                      className="flex-1 flex items-center gap-2.5 text-left cursor-pointer min-w-0"
                    >
                      {isSelected ? (
                        <div className="w-4 h-4 rounded bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded border border-slate-300 dark:border-slate-600 shrink-0" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${palette.bg} ${palette.text} ${palette.border}`}
                          >
                            Katalog {b.name}
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {b.items.length} Model
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                          {totalVariants} Varian • Total {totalPcs} pcs
                        </p>
                      </div>
                    </button>

                    {/* Tombol Solo (Hanya Ini) untuk Pilih Cepat 1 Katalog */}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectOnly(b.id);
                        setIsOpen(false);
                      }}
                      className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-indigo-600 hover:text-white dark:bg-slate-800 dark:hover:bg-indigo-600 text-slate-600 dark:text-slate-300 transition-colors shrink-0 cursor-pointer"
                      title={`Hanya tampilkan katalog ${b.name}`}
                    >
                      Hanya Ini
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Popover */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Total <strong>{totalProductsSelected}</strong> dari <strong>{totalAllProducts}</strong> model
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-1.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all cursor-pointer"
            >
              Terapkan Filter
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
