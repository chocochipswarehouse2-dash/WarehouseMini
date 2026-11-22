import React, { useRef, useEffect } from 'react';
import {
  ArrowUpDown,
  Ban,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  FileText,
  Filter,
  LayoutGrid,
  Loader2,
  MoreHorizontal,
  Package,
  Printer,
  RefreshCw,
  RotateCcw,
  Scissors,
  Search,
  Send,
  Sparkles,
  Table,
  Truck,
  X,
} from 'lucide-react';
import { OutletItem } from '../../services/gasManualShipment';

export interface RekapToolbarProps {
  viewMode: 'table' | 'card';
  onSetViewMode: (mode: 'table' | 'card') => void;
  filteredOrdersCount: number;
  directionScopedOrdersCount: number;
  scopedOrdersCount: number;
  loading: boolean;
  userIsAdmin: boolean;
  isStoreUser: boolean;
  userAssignedStore: string;
  // Counts
  countBaru: number;
  countDiproses: number;
  countSelesai: number;
  countBatal: number;
  countOutgoing: number;
  countIncoming: number;
  totalManualPureCount: number;
  totalManualWithAlterCount: number;
  totalArCount: number;
  unassignedResiCount: number;
  unprintedLabelCount: number;
  unprintedPickingCount: number;
  printedLabelCount: number;
  pendingSjCount: number;
  unprintedPickingFilteredCount: number;
  // Filter states
  stageTab: string;
  onSetStageTab: (tab: any) => void;
  filterStoreDirection: 'all' | 'outgoing' | 'incoming';
  onSelectStoreDirection: (dir: 'all' | 'outgoing' | 'incoming') => void;
  filterOrderType: string;
  onSetFilterOrderType: (t: any) => void;
  filterPrintStatus: string;
  onSetFilterPrintStatus: (p: any) => void;
  searchTerm: string;
  onSetSearchTerm: (s: string) => void;
  sortBy: string;
  onSetSortBy: (s: any) => void;
  isFilterExpanded: boolean;
  onToggleFilterExpanded: () => void;
  filterStore: string;
  onSetFilterStore: (s: string) => void;
  filterJasaKirim: string;
  onSetFilterJasaKirim: (s: string) => void;
  filterStatus: string;
  onSetFilterStatus: (s: string) => void;
  filterAlterStatus: string;
  onSetFilterAlterStatus: (s: any) => void;
  filterDealposSj: string;
  onSetFilterDealposSj: (s: any) => void;
  filterSoldStatus: string;
  onSetFilterSoldStatus: (s: any) => void;
  filterStartDate: string;
  onSetFilterStartDate: (s: string) => void;
  filterEndDate: string;
  onSetFilterEndDate: (s: string) => void;
  onResetAllFilters: () => void;
  outlets: OutletItem[];
  jasaKirimList: string[];
  // Utility menu
  isUtilsMenuOpen: boolean;
  onSetUtilsMenuOpen: (v: boolean) => void;
  onOpenBulkResi: () => void;
  onOpenSopPresentation: () => void;
  onExportCsv: () => void;
  onRefreshDelta: () => void;
  onForceReload: () => void;
  // Quick print mass actions
  isSendingPickingWa: boolean;
  onQuickPrintMassLabel: () => void;
  onQuickPrintMassPicking: () => void;
  onQuickSendPickingWaGroup: () => void;
  // Selection / Batch bar
  selectedCount: number;
  selectedAlterCount: number;
  isAllFilteredSelected: boolean;
  isSomeFilteredSelected: boolean;
  onToggleSelectAllFiltered: () => void;
  onUnselectAll: () => void;
  onBatchPrintSjStruk: () => void;
  onBatchPrintPicking: () => void;
  onBatchSendPickingWaGroup: () => void;
  onBatchPrintLabel: () => void;
  onBatchPrintAlterSpk: () => void;
}

export const RekapToolbar: React.FC<RekapToolbarProps> = ({
  viewMode,
  onSetViewMode,
  filteredOrdersCount,
  directionScopedOrdersCount,
  scopedOrdersCount,
  loading,
  userIsAdmin,
  isStoreUser,
  userAssignedStore,
  countBaru,
  countDiproses,
  countSelesai,
  countBatal,
  countOutgoing,
  countIncoming,
  totalManualPureCount,
  totalManualWithAlterCount,
  totalArCount,
  unassignedResiCount,
  unprintedLabelCount,
  unprintedPickingCount,
  printedLabelCount,
  pendingSjCount,
  unprintedPickingFilteredCount,
  stageTab,
  onSetStageTab,
  filterStoreDirection,
  onSelectStoreDirection,
  filterOrderType,
  onSetFilterOrderType,
  filterPrintStatus,
  onSetFilterPrintStatus,
  searchTerm,
  onSetSearchTerm,
  sortBy,
  onSetSortBy,
  isFilterExpanded,
  onToggleFilterExpanded,
  filterStore,
  onSetFilterStore,
  filterJasaKirim,
  onSetFilterJasaKirim,
  filterStatus,
  onSetFilterStatus,
  filterAlterStatus,
  onSetFilterAlterStatus,
  filterDealposSj,
  onSetFilterDealposSj,
  filterSoldStatus,
  onSetFilterSoldStatus,
  filterStartDate,
  onSetFilterStartDate,
  filterEndDate,
  onSetFilterEndDate,
  onResetAllFilters,
  outlets,
  jasaKirimList,
  isUtilsMenuOpen,
  onSetUtilsMenuOpen,
  onOpenBulkResi,
  onOpenSopPresentation,
  onExportCsv,
  onRefreshDelta,
  onForceReload,
  isSendingPickingWa,
  onQuickPrintMassLabel,
  onQuickPrintMassPicking,
  onQuickSendPickingWaGroup,
  selectedCount,
  selectedAlterCount,
  isAllFilteredSelected,
  isSomeFilteredSelected,
  onToggleSelectAllFiltered,
  onUnselectAll,
  onBatchPrintSjStruk,
  onBatchPrintPicking,
  onBatchSendPickingWaGroup,
  onBatchPrintLabel,
  onBatchPrintAlterSpk,
}) => {
  const utilsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isUtilsMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (utilsRef.current && !utilsRef.current.contains(e.target as Node)) {
        onSetUtilsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isUtilsMenuOpen, onSetUtilsMenuOpen]);

  const activeFilterCount = [
    filterStore !== 'all',
    filterJasaKirim !== 'all',
    filterStatus !== 'all',
    filterAlterStatus !== 'all',
    filterOrderType !== 'all',
    filterDealposSj !== 'all',
    filterSoldStatus !== 'all',
    filterPrintStatus !== 'all',
    filterStartDate !== '',
    filterEndDate !== '',
  ].filter(Boolean).length;

  const hasAnyActiveFilterOrSort =
    Boolean(searchTerm) || sortBy !== 'newest' || activeFilterCount > 0;

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      {/* ROW 1: Clean Title + Consolidated Right Controls (Max 1 Primary CTA + View Switcher) */}
      <div className="px-3 sm:px-4 pt-3 pb-2.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-[15px] sm:text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
            Rekap Pesanan
          </h2>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
            {filteredOrdersCount} pesanan
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Single Primary Action (Admin: Update Resi Massal) */}
          {userIsAdmin && (
            <button
              type="button"
              onClick={onOpenBulkResi}
              className="h-9 sm:h-8 px-2.5 sm:px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Update No. Resi Massal via Tabel atau Import CSV"
            >
              <Truck className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Resi Massal</span>
              <span className="sm:hidden">Resi</span>
              {unassignedResiCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-white/20 text-white text-[10px] font-mono font-bold tabular-nums">
                  {unassignedResiCount}
                </span>
              )}
            </button>
          )}

          {/* Neutral Refresh Button */}
          <button
            type="button"
            onClick={onRefreshDelta}
            className="h-9 w-9 sm:h-8 sm:w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Refresh data terbaru"
            aria-label="Refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Consolidated Utility Menu (Export CSV, Muat Ulang Penuh, Slide SOP) */}
          <div className="relative" ref={utilsRef}>
            <button
              type="button"
              onClick={() => onSetUtilsMenuOpen(!isUtilsMenuOpen)}
              className="h-9 w-9 sm:h-8 sm:w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Menu Utilitas (Export CSV, Muat Ulang Penuh, SOP)"
              aria-label="Menu utilitas"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isUtilsMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    onSetUtilsMenuOpen(false);
                    onExportCsv();
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <div>
                    <div>Export CSV Database</div>
                    <div className="text-[10px] font-normal text-slate-400">
                      Unduh rekap sesuai filter aktif
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSetUtilsMenuOpen(false);
                    onForceReload();
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <div>
                    <div>Muat Ulang Penuh</div>
                    <div className="text-[10px] font-normal text-slate-400">
                      Reset cache lokal &amp; sinkron ulang
                    </div>
                  </div>
                </button>
                {userIsAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetUtilsMenuOpen(false);
                      onOpenSopPresentation();
                    }}
                    className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2.5 border-t border-slate-100 dark:border-slate-800 mt-1 pt-2 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <div>
                      <div>Slide Presentasi SOP</div>
                      <div className="text-[10px] font-normal text-slate-400">
                        Panduan alur Manual &amp; Alter
                      </div>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 2-Option Segmented View Switcher ONLY: Tabel | Kartu */}
          <div className="inline-flex p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onSetViewMode('table')}
              className={`h-8 sm:h-7 px-2.5 rounded-md text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Tampilan Tabel"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Tabel</span>
            </button>
            <button
              type="button"
              onClick={() => onSetViewMode('card')}
              className={`h-8 sm:h-7 px-2.5 rounded-md text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                viewMode === 'card'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Tampilan Kartu"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kartu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Store Direction Strip (Store accounts only) */}
      {isStoreUser && userAssignedStore && (
        <div className="px-3 sm:px-4 pb-2 flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1 shrink-0">
            <Building2 className="w-3.5 h-3.5 text-amber-600" />
            <span>{userAssignedStore}:</span>
          </span>
          <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold gap-0.5">
            <button
              type="button"
              onClick={() => onSelectStoreDirection('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterStoreDirection === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Semua ({scopedOrdersCount})
            </button>
            <button
              type="button"
              onClick={() => onSelectStoreDirection('outgoing')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                filterStoreDirection === 'outgoing'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Toko Ini ({countOutgoing})
            </button>
            <button
              type="button"
              onClick={() => onSelectStoreDirection('incoming')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1 ${
                filterStoreDirection === 'incoming'
                  ? 'bg-orange-600 text-white shadow-2xs'
                  : 'text-orange-700 dark:text-orange-300'
              }`}
            >
              <Truck className="w-3 h-3" />
              <span>Ambil Toko Lain ({countIncoming})</span>
            </button>
          </div>
        </div>
      )}

      {/* ROW 2: Stage Tabs (Horizontal swipe on mobile) + Sub-type Filter (Desktop) */}
      <div className="px-3 sm:px-4 pb-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap -mx-1 px-1">
          {[
            { id: 'baru', label: 'Baru', count: countBaru, icon: Clock, active: 'bg-amber-500 text-white' },
            { id: 'diproses', label: 'Diproses', count: countDiproses, icon: Package, active: 'bg-indigo-600 text-white' },
            { id: 'selesai', label: 'Selesai', count: countSelesai, icon: CheckCircle2, active: 'bg-emerald-600 text-white' },
            { id: 'batal', label: 'Batal', count: countBatal, icon: Ban, active: 'bg-rose-600 text-white' },
            { id: 'semua', label: 'Semua', count: directionScopedOrdersCount, icon: null, active: 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = stageTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onSetStageTab(tab.id);
                  onSetFilterPrintStatus('all');
                }}
                className={`h-8 px-2.5 sm:px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? tab.active
                    : 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                <span>{tab.label}</span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.2 rounded tabular-nums ${
                    isActive
                      ? 'bg-black/15 text-current'
                      : 'bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sub-Type Segmented Filter (Desktop inline; mobile accessible in Filter drawer) */}
        <div className="hidden lg:inline-flex p-0.5 bg-slate-100/90 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-lg text-[11px] font-semibold shrink-0">
          {[
            { id: 'all', label: 'Semua Jenis' },
            { id: 'manual_shipment', label: `Manual (${totalManualPureCount})` },
            { id: 'manual_with_alter', label: `+ Alter (${totalManualWithAlterCount})` },
            { id: 'alteration_repair', label: `AR (${totalArCount})` },
          ].map((opt) => {
            const isActive = filterOrderType === opt.id && filterAlterStatus === 'all';
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onSetFilterOrderType(opt.id);
                  onSetFilterAlterStatus('all');
                }}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ROW 3: Search + Sort + Filter Toggle (Unified Single Row) */}
      <div className="px-3 sm:px-4 pb-2.5 flex items-center gap-1.5 sm:gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSetSearchTerm(e.target.value)}
            placeholder="Cari #order, customer, resi, SKU..."
            className="w-full h-9 sm:h-8 pl-8 pr-7 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSetSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              aria-label="Hapus pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Compact Sort Dropdown */}
        <div className="h-9 sm:h-8 flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 shrink-0">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={sortBy}
            onChange={(e) => onSetSortBy(e.target.value)}
            className={`text-xs bg-transparent focus:outline-none cursor-pointer max-w-[105px] sm:max-w-[165px] ${
              sortBy !== 'newest'
                ? 'font-bold text-indigo-600 dark:text-indigo-400'
                : 'font-medium text-slate-700 dark:text-slate-200'
            }`}
            aria-label="Urutkan pesanan"
          >
            <option value="newest">Terbaru</option>
            <option value="oldest">Terlama (FIFO)</option>
            <option value="store_asc">Store (A-Z)</option>
            <option value="store_desc">Store (Z-A)</option>
            <option value="customer_asc">Customer (A-Z)</option>
            <option value="customer_desc">Customer (Z-A)</option>
            <option value="courier_asc">Kurir (A-Z)</option>
            <option value="qty_desc">Qty Terbanyak</option>
            <option value="qty_asc">Qty Tersedikit</option>
            <option value="unprinted_first">Belum Cetak Dulu</option>
            <option value="target_alter_asc">Target Alter Terdekat</option>
          </select>
        </div>

        {/* Filter Toggle */}
        <button
          type="button"
          onClick={onToggleFilterExpanded}
          className={`h-9 sm:h-8 px-2.5 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
            isFilterExpanded || activeFilterCount > 0
              ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <Filter className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Filter</span>
          {activeFilterCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${isFilterExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        {hasAnyActiveFilterOrSort && (
          <button
            type="button"
            onClick={onResetAllFilters}
            className="h-9 sm:h-8 px-2.5 rounded-lg border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
            title="Reset semua filter"
          >
            <X className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        )}
      </div>

      {/* Quick Print Filter Strip — Admin & Warehouse ONLY (Hidden from Store users) */}
      {!isStoreUser && (
        <div className="px-3 sm:px-4 pb-2.5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mr-0.5 hidden sm:inline">
              Cetak:
            </span>
            <button
              type="button"
              onClick={() =>
                onSetFilterPrintStatus(filterPrintStatus === 'unprinted_picking' ? 'all' : 'unprinted_picking')
              }
              className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                filterPrintStatus === 'unprinted_picking'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-3 h-3" />
              <span>Belum Picking</span>
              <span className="font-mono text-[10px] opacity-80 tabular-nums">{unprintedPickingCount}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onSetFilterPrintStatus(filterPrintStatus === 'unprinted_label' ? 'all' : 'unprinted_label')
              }
              className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                filterPrintStatus === 'unprinted_label'
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <Printer className="w-3 h-3" />
              <span>Belum Label</span>
              <span className="font-mono text-[10px] opacity-80 tabular-nums">{unprintedLabelCount}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onSetFilterPrintStatus(filterPrintStatus === 'printed_label' ? 'all' : 'printed_label')
              }
              className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                filterPrintStatus === 'printed_label'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Sudah Label ({printedLabelCount})</span>
            </button>
          </div>

          {/* Contextual Mass Action when quick print filter is active */}
          <div className="flex items-center gap-1.5 shrink-0">
            {filterPrintStatus === 'unprinted_label' && filteredOrdersCount > 0 && (
              <button
                type="button"
                onClick={onQuickPrintMassLabel}
                className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Printer className="w-3 h-3" />
                <span>Cetak Label ({filteredOrdersCount})</span>
              </button>
            )}
            {filterPrintStatus === 'unprinted_picking' && filteredOrdersCount > 0 && (
              <button
                type="button"
                onClick={onQuickPrintMassPicking}
                className="h-7 px-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <FileText className="w-3 h-3" />
                <span>Cetak Picking ({filteredOrdersCount})</span>
              </button>
            )}
            {userIsAdmin &&
              (filterPrintStatus === 'unprinted_picking' || stageTab === 'baru') &&
              filteredOrdersCount > 0 && (
                <button
                  type="button"
                  disabled={isSendingPickingWa}
                  onClick={onQuickSendPickingWaGroup}
                  className="h-7 px-2.5 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {isSendingPickingWa ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  <span>WA Picking ({unprintedPickingFilteredCount})</span>
                </button>
              )}
          </div>
        </div>
      )}

      {/* Collapsible Advanced Filters Drawer */}
      {isFilterExpanded && (
        <div className="px-3 sm:px-4 pb-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 animate-in fade-in duration-150">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Jenis Pesanan</label>
            <select
              value={filterOrderType}
              onChange={(e) => {
                onSetFilterOrderType(e.target.value);
                onSetFilterAlterStatus('all');
              }}
              className="h-8 px-2 text-xs rounded-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white"
            >
              <option value="all">Semua Jenis</option>
              <option value="manual_shipment">Manual ({totalManualPureCount})</option>
              <option value="manual_with_alter">Manual + Alter ({totalManualWithAlterCount})</option>
              <option value="alteration_repair">AR Standalone ({totalArCount})</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Store</label>
            <select
              value={filterStore}
              onChange={(e) => onSetFilterStore(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white truncate"
            >
              <option value="all">Semua Store</option>
              {outlets.map((o, idx) => (
                <option key={idx} value={o.nama}>
                  {o.nama}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Jasa Kirim</label>
            <select
              value={filterJasaKirim}
              onChange={(e) => onSetFilterJasaKirim(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white truncate"
            >
              <option value="all">Semua Kurir</option>
              {jasaKirimList.map((jk, idx) => (
                <option key={idx} value={jk}>
                  {jk}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => onSetFilterStatus(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white"
            >
              <option value="all">Semua Status</option>
              <option value="pending">Pending</option>
              <option value="diterima">Diterima</option>
              <option value="diproses">Diproses</option>
              <option value="dikirim">Dikirim</option>
              <option value="batal">Batal</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Alteration</label>
            <select
              value={filterAlterStatus}
              onChange={(e) => onSetFilterAlterStatus(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white"
            >
              <option value="all">Semua Kondisi</option>
              <option value="manual_with_alter">Manual + Alter ({totalManualWithAlterCount})</option>
              <option value="all_alter">Semua Alter ({totalManualWithAlterCount + totalArCount})</option>
              <option value="no_alter">Tanpa Alter</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">SJ DealPOS</label>
            <select
              value={filterDealposSj}
              onChange={(e) => onSetFilterDealposSj(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white"
            >
              <option value="all">Semua SJ</option>
              <option value="need_sj">Butuh SJ {pendingSjCount > 0 ? `(${pendingSjCount})` : ''}</option>
              <option value="has_sj">Ada SJ</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Stok &amp; Cetak</label>
            <select
              value={filterSoldStatus !== 'all' ? 'has_sold' : filterPrintStatus}
              onChange={(e) => {
                if (e.target.value === 'has_sold') {
                  onSetFilterSoldStatus('has_sold');
                  onSetFilterPrintStatus('all');
                } else {
                  onSetFilterSoldStatus('all');
                  onSetFilterPrintStatus(e.target.value);
                }
              }}
              className="h-8 px-2 text-xs rounded-lg border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white"
            >
              <option value="all">Semua Kondisi</option>
              <option value="has_sold">Ada Item Sold Out</option>
              <option value="unprinted_label">Belum Cetak Label ({unprintedLabelCount})</option>
              <option value="unprinted_picking">Belum Cetak Picking ({unprintedPickingCount})</option>
              <option value="incomplete_print">Belum Lengkap 2 Cetak</option>
              <option value="complete_print">Lengkap 2 Cetak</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Rentang Tanggal</label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => onSetFilterStartDate(e.target.value)}
                className="h-8 px-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white rounded-lg w-full"
              />
              <span className="text-xs text-slate-400">-</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => onSetFilterEndDate(e.target.value)}
                className="h-8 px-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white rounded-lg w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Contextual Batch Selection Strip (Clean & Calm — expands only when orders are selected, or slim select-all in Card mode) */}
      {(selectedCount > 0 || viewMode === 'card') && (
        <div
          className={`px-3 sm:px-4 py-2 border-t flex items-center justify-between gap-2 flex-wrap ${
            selectedCount > 0
              ? 'bg-indigo-50/80 dark:bg-indigo-950/35 border-indigo-200/80 dark:border-indigo-900/60'
              : 'bg-slate-50/70 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
              <input
                type="checkbox"
                ref={(el) => {
                  if (el) el.indeterminate = isSomeFilteredSelected;
                }}
                checked={isAllFilteredSelected}
                onChange={onToggleSelectAllFiltered}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>
                {selectedCount > 0 ? `${selectedCount} pesanan dipilih` : `Pilih semua (${filteredOrdersCount})`}
              </span>
            </label>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={onUnselectAll}
                className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 cursor-pointer"
              >
                Batal
              </button>
            )}
          </div>

          {selectedCount > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
              <button
                type="button"
                onClick={onBatchPrintSjStruk}
                className="h-8 px-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Printer className="w-3.5 h-3.5 text-amber-600" />
                <span>SJ Struk ({selectedCount})</span>
              </button>

              {!isStoreUser && (
                <>
                  <button
                    type="button"
                    onClick={onBatchPrintPicking}
                    className="h-8 px-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Picking ({selectedCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={onBatchPrintLabel}
                    className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Label A6 ({selectedCount})</span>
                  </button>
                  {userIsAdmin && (
                    <button
                      type="button"
                      disabled={isSendingPickingWa}
                      onClick={onBatchSendPickingWaGroup}
                      className="h-8 px-2.5 bg-white dark:bg-slate-800 hover:bg-emerald-50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {isSendingPickingWa ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>WA Grup ({selectedCount})</span>
                    </button>
                  )}
                  {selectedAlterCount > 0 && (
                    <button
                      type="button"
                      onClick={onBatchPrintAlterSpk}
                      className="h-8 px-2.5 bg-white dark:bg-slate-800 hover:bg-rose-50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>SPK ({selectedAlterCount})</span>
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
