import React, { useState } from 'react';
import {
  Search,
  X,
  RefreshCw,
  SlidersHorizontal,
  ArrowRightLeft,
  ClipboardList,
  Sparkles,
  CheckSquare,
  Square,
  LayoutGrid,
  List,
  ChevronRight,
  RotateCcw,
  Sliders,
  Trash2,
  MapPin,
} from 'lucide-react';
import type { PutawayTask } from '../../types';
import type { ComputedRackSlot, RackStatusLevel, RackZoneColor } from '../../services/rackCapacityService';

// Local structural types matching RackCapacityDashboard summaryStats
export interface MobileZoneStat {
  zoneId: string;
  zoneName: string;
  area: string;
  category: string;
  color: RackZoneColor;
  rackCount: number;
  activeRackCount: number;
  overloadRackCount: number;
  emptyRackCount: number;
  currentQty: number;
  maxCapacity: number;
  defaultMaxCapacity: number;
}

export interface MobileSummaryStats {
  kpiTitle: string;
  kpiSubtitle: string;
  totalRacks: number;
  totalCapacity: number;
  totalFilled: number;
  overallPercent: number;
  emptyCount: number;
  safeCount: number;
  warningFullCount: number;
  overloadCount: number;
  warehouseTotal: {
    totalRacks: number;
    totalFilled: number;
    totalCapacity: number;
    overallPercent: number;
    overloadCount: number;
  };
  rak: {
    rackCount: number;
    totalFilled: number;
    totalCapacity: number;
    overallPercent: number;
    overloadCount: number;
  };
  koli: {
    rackCount: number;
    totalFilled: number;
    totalCapacity: number;
    overallPercent: number;
    overloadCount: number;
  };
  blokF: {
    rackCount: number;
    totalFilled: number;
    totalCapacity: number;
    overallPercent: number;
    overloadCount: number;
  };
  zones: MobileZoneStat[];
}

export type MobileStatusFilter = 'ALL' | 'OVERLOAD' | 'WARNING_FULL' | 'SAFE' | 'EMPTY';

export interface RackCapacityMobileViewProps {
  summaryStats: MobileSummaryStats;
  filteredSlots: ComputedRackSlot[];
  totalAllSlots: number;
  selectedArea: string;
  onSelectArea: (area: string) => void;
  selectedZoneId: string;
  onSelectZoneId: (zoneId: string) => void;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  availableCategories: string[];
  statusFilter: MobileStatusFilter;
  onSelectStatusFilter: (st: MobileStatusFilter) => void;
  searchQuery: string;
  onChangeSearchQuery: (q: string) => void;
  onResetAllFilters: () => void;
  onSelectRack: (lokasi: string) => void;
  // Tools & Permissions
  canRelocateRack: boolean;
  canUsePutaway: boolean;
  canManageCapacityConfig: boolean;
  canMultiSelectRacks: boolean;
  userIsSuperadmin: boolean;
  activePutawayCount: number;
  putawayOutboxCount: number;
  simulationMovesCount: number;
  isPutawayPanelOpen: boolean;
  isSimPanelOpen: boolean;
  onOpenRelocation: () => void;
  onTogglePutawayPanel: () => void;
  onToggleSimPanel: () => void;
  onOpenSetupModal: () => void;
  onRefreshStock?: () => void;
  isRefreshingStock?: boolean;
  // Multi-select
  isMultiSelectMode: boolean;
  selectedMultiLocs: Set<string>;
  selectedMultiStats: {
    rackCount: number;
    filledRackCount: number;
    totalQty: number;
    putawayEligibleList: string[];
  };
  filteredFilledCount: number;
  onToggleMultiSelectMode: () => void;
  onToggleMultiRack: (loc: string) => void;
  onSelectFilledFiltered: () => void;
  onClearMultiSelection: () => void;
  onExitMultiSelectMode: () => void;
  onStartMultiPutaway: () => void;
  onOpenMultiRelocation: () => void;
  onOpenMultiPurge: () => void;
  // Putaway badge maps
  activePutawayBySource: Map<string, PutawayTask>;
  reservedDestQtyMap: Map<string, number>;
}

function getMobileStatusStyle(status: RackStatusLevel) {
  switch (status) {
    case 'OVERLOAD':
      return {
        label: 'Overload',
        badgeBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/70',
        barBg: 'bg-rose-600',
        text: 'text-rose-600 dark:text-rose-400',
        tileBorder: 'border-rose-300 dark:border-rose-800/80',
      };
    case 'FULL':
    case 'WARNING':
      return {
        label: status === 'FULL' ? 'Penuh' : 'Hampir Penuh',
        badgeBg: 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
        barBg: 'bg-amber-500',
        text: 'text-amber-600 dark:text-amber-400',
        tileBorder: 'border-amber-200 dark:border-amber-800/70',
      };
    case 'SAFE':
      return {
        label: 'Tersedia',
        badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
        barBg: 'bg-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-400',
        tileBorder: 'border-emerald-200/90 dark:border-emerald-800/60',
      };
    case 'EMPTY':
    default:
      return {
        label: 'Kosong',
        badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
        barBg: 'bg-slate-300 dark:bg-slate-700',
        text: 'text-slate-500 dark:text-slate-400',
        tileBorder: 'border-slate-200 dark:border-slate-800',
      };
  }
}

export const RackCapacityMobileView: React.FC<RackCapacityMobileViewProps> = ({
  summaryStats,
  filteredSlots,
  totalAllSlots,
  selectedArea,
  onSelectArea,
  selectedZoneId,
  onSelectZoneId,
  selectedCategory,
  onSelectCategory,
  availableCategories,
  statusFilter,
  onSelectStatusFilter,
  searchQuery,
  onChangeSearchQuery,
  onResetAllFilters,
  onSelectRack,
  canRelocateRack,
  canUsePutaway,
  canManageCapacityConfig,
  canMultiSelectRacks,
  userIsSuperadmin,
  activePutawayCount,
  putawayOutboxCount,
  simulationMovesCount,
  isPutawayPanelOpen,
  isSimPanelOpen,
  onOpenRelocation,
  onTogglePutawayPanel,
  onToggleSimPanel,
  onOpenSetupModal,
  onRefreshStock,
  isRefreshingStock,
  isMultiSelectMode,
  selectedMultiLocs,
  selectedMultiStats,
  filteredFilledCount,
  onToggleMultiSelectMode,
  onToggleMultiRack,
  onSelectFilledFiltered,
  onClearMultiSelection,
  onExitMultiSelectMode,
  onStartMultiPutaway,
  onOpenMultiRelocation,
  onOpenMultiPurge,
  activePutawayBySource,
  reservedDestQtyMap,
}) => {
  const [mobileDisplayMode, setMobileDisplayMode] = useState<'LIST' | 'MAP'>('LIST');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const activeFiltersCount =
    (selectedZoneId !== 'ALL' ? 1 : 0) +
    (selectedCategory !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0);

  // Circular SVG Ring calculations
  const clampedPct = Math.min(100, Math.max(0, summaryStats.overallPercent));
  const ringRadius = 21;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - clampedPct / 100);
  const ringStrokeClass =
    summaryStats.overallPercent > 100
      ? 'stroke-rose-500'
      : summaryStats.overallPercent >= 85
      ? 'stroke-amber-500'
      : 'stroke-indigo-600 dark:stroke-indigo-400';

  const shortScopeTitle =
    selectedArea === 'RAK_ABCD' || selectedArea === 'Warehouse'
      ? 'Rak Utama A–D'
      : selectedArea === 'KOLI_ALL' ||
        selectedArea === 'Kolian' ||
        selectedArea === 'Transit' ||
        selectedArea === 'Perbaikan'
      ? 'Area Koli & Transit'
      : selectedArea === 'BLOK_F' || selectedArea === 'Blok F'
      ? 'Blok F (Live & Studio)'
      : 'Semua Warehouse';

  const areaSegments = [
    {
      key: 'ALL',
      label: 'Semua',
      active: selectedArea === 'ALL',
      pct: summaryStats.warehouseTotal.overallPercent,
      overload: summaryStats.warehouseTotal.overloadCount,
      bar: 'bg-indigo-600',
    },
    {
      key: 'RAK_ABCD',
      label: 'Rak A–D',
      active: selectedArea === 'RAK_ABCD' || selectedArea === 'Warehouse',
      pct: summaryStats.rak.overallPercent,
      overload: summaryStats.rak.overloadCount,
      bar: 'bg-blue-600',
    },
    {
      key: 'KOLI_ALL',
      label: 'Koli',
      active:
        selectedArea === 'KOLI_ALL' ||
        selectedArea === 'Kolian' ||
        selectedArea === 'Transit' ||
        selectedArea === 'Perbaikan',
      pct: summaryStats.koli.overallPercent,
      overload: summaryStats.koli.overloadCount,
      bar: 'bg-amber-500',
    },
    {
      key: 'BLOK_F',
      label: 'Blok F',
      active: selectedArea === 'BLOK_F' || selectedArea === 'Blok F',
      pct: summaryStats.blokF.overallPercent,
      overload: summaryStats.blokF.overloadCount,
      bar: 'bg-purple-600',
    },
  ];

  const statusChips: Array<{ id: MobileStatusFilter; label: string; count: number; activeCls: string }> = [
    {
      id: 'ALL',
      label: 'Semua',
      count: summaryStats.totalRacks,
      activeCls: 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-600 dark:border-indigo-600',
    },
    {
      id: 'OVERLOAD',
      label: 'Overload',
      count: summaryStats.overloadCount,
      activeCls: 'bg-rose-600 text-white border-rose-600',
    },
    {
      id: 'WARNING_FULL',
      label: 'Penuh',
      count: summaryStats.warningFullCount,
      activeCls: 'bg-amber-500 text-white border-amber-500',
    },
    {
      id: 'SAFE',
      label: 'Tersedia',
      count: summaryStats.safeCount,
      activeCls: 'bg-emerald-600 text-white border-emerald-600',
    },
    {
      id: 'EMPTY',
      label: 'Kosong',
      count: summaryStats.emptyCount,
      activeCls: 'bg-slate-700 text-white border-slate-700',
    },
  ];

  const selectedZoneObj =
    selectedZoneId !== 'ALL' ? summaryStats.zones.find((z) => z.zoneId === selectedZoneId) : undefined;

  return (
    <div className="md:hidden space-y-2.5 pb-24">
      {/* 1. NATIVE APP HERO RING CARD (Compact, Single-Elevation, Thumb-Ready Top Actions) */}
      <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between gap-2.5">
          {/* SVG Circular Occupancy Ring */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-[52px] h-[52px] shrink-0 flex items-center justify-center">
              <svg className="w-[52px] h-[52px] -rotate-90" viewBox="0 0 52 52">
                <circle
                  cx="26"
                  cy="26"
                  r={ringRadius}
                  fill="none"
                  strokeWidth="5"
                  className="stroke-slate-100 dark:stroke-slate-800"
                />
                <circle
                  cx="26"
                  cy="26"
                  r={ringRadius}
                  fill="none"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringDashOffset}
                  className={`transition-all duration-300 ${ringStrokeClass}`}
                />
              </svg>
              <span className="absolute text-[11px] font-black font-mono tabular-nums text-slate-900 dark:text-white">
                {summaryStats.overallPercent}%
              </span>
            </div>

            <div className="min-w-0">
              <div className="text-sm font-black text-slate-900 dark:text-white tracking-tight truncate">
                {shortScopeTitle}
              </div>
              <div className="text-xs font-mono font-bold tabular-nums text-slate-700 dark:text-slate-300 mt-0.5">
                {summaryStats.totalFilled.toLocaleString('id-ID')}{' '}
                <span className="text-slate-400 font-normal">
                  / {summaryStats.totalCapacity.toLocaleString('id-ID')} pcs
                </span>
              </div>
              <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 font-mono tabular-nums">
                {summaryStats.overloadCount > 0 ? (
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    {summaryStats.overloadCount} overload
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Aman</span>
                )}
                <span aria-hidden="true">·</span>
                <span>{summaryStats.emptyCount} kosong</span>
                <span aria-hidden="true">·</span>
                <span>{summaryStats.totalRacks} rak</span>
              </div>
            </div>
          </div>

          {/* Right 44x44 Tactile Buttons: Filter Sheet + Refresh */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsFilterSheetOpen(true)}
              className={`relative w-11 h-11 rounded-2xl border flex items-center justify-center transition-colors active:scale-95 cursor-pointer ${
                activeFiltersCount > 0
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400'
                  : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
              aria-label="Filter Zona & Kategori"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-black font-mono flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {onRefreshStock && (
              <button
                type="button"
                onClick={onRefreshStock}
                disabled={isRefreshingStock}
                className="w-11 h-11 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
                aria-label="Sinkronkan Stok"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshingStock ? 'animate-spin text-indigo-600' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* 2. HORIZONTAL SNAP AREA RAIL (52px tall instead of 360px vertical stack) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar snap-x -mx-0.5 px-0.5 pt-0.5">
          {areaSegments.map((seg) => (
            <button
              key={seg.key}
              type="button"
              onClick={() => {
                if (seg.key === 'ALL') onSelectArea('ALL');
                else onSelectArea(seg.active ? 'ALL' : seg.key);
                onSelectZoneId('ALL');
              }}
              className={`snap-start shrink-0 min-w-[94px] px-2.5 py-2 rounded-xl border text-left transition-all active:scale-[0.97] cursor-pointer ${
                seg.active
                  ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-500 ring-1 ring-indigo-500/20'
                  : 'bg-slate-50/70 dark:bg-[#0E1420] border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] font-extrabold text-slate-900 dark:text-white whitespace-nowrap">
                  {seg.label}
                </span>
                <span
                  className={`text-[11px] font-black font-mono tabular-nums ${
                    seg.pct > 100 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {seg.pct}%
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full bg-slate-200/80 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full origin-left ${seg.pct > 100 ? 'bg-rose-600' : seg.bar}`}
                  style={{ transform: `scaleX(${Math.min(1, seg.pct / 100)})` }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 3. NATIVE SEARCH BAR + VIEW SWITCHER + QUICK STATUS CHIPS */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onChangeSearchQuery(e.target.value)}
              placeholder="Cari rak (A001), kategori, atau SKU..."
              className="w-full h-11 pl-10 pr-9 text-xs font-medium bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onChangeSearchQuery('')}
                className="w-8 h-8 flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                aria-label="Hapus pencarian"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tactile Segmented Toggle: Daftar vs Peta 3-Kolom */}
          <div className="flex items-center p-1 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl h-11 shrink-0 shadow-2xs">
            <button
              type="button"
              onClick={() => setMobileDisplayMode('LIST')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                mobileDisplayMode === 'LIST'
                  ? 'bg-slate-900 text-white dark:bg-indigo-600'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              aria-label="Tampilan Daftar"
              title="Daftar Rak"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMobileDisplayMode('MAP')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                mobileDisplayMode === 'MAP'
                  ? 'bg-slate-900 text-white dark:bg-indigo-600'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              aria-label="Tampilan Peta 3 Kolom"
              title="Peta Rak 3 Kolom"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Horizontal Status Chips + Active Filter Info */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap -mx-0.5 px-0.5">
          {statusChips.map((st) => {
            const isActive = statusFilter === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() =>
                  onSelectStatusFilter(statusFilter === st.id && st.id !== 'ALL' ? 'ALL' : st.id)
                }
                className={`h-8 px-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 shrink-0 transition-colors active:scale-95 cursor-pointer ${
                  isActive
                    ? st.activeCls
                    : 'bg-white dark:bg-[#131d31] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                <span>{st.label}</span>
                <span
                  className={`font-mono tabular-nums text-[10px] ${
                    isActive ? 'opacity-90' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {st.count}
                </span>
              </button>
            );
          })}

          {selectedZoneObj && (
            <button
              type="button"
              onClick={() => onSelectZoneId('ALL')}
              className="h-8 px-2.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>Zona: {selectedZoneObj.zoneName}</span>
              <X className="w-3 h-3" />
            </button>
          )}

          {selectedCategory !== 'ALL' && (
            <button
              type="button"
              onClick={() => onSelectCategory('ALL')}
              className="h-8 px-2.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>{selectedCategory}</span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 4. NATIVE RACK CONTENT FEED: Interactive List Rows OR 3-Column Heatmap Tiles */}
      {filteredSlots.length === 0 ? (
        <div className="py-12 px-4 text-center bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
          <MapPin className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Tidak ada lokasi rak yang cocok
          </div>
          <button
            type="button"
            onClick={onResetAllFilters}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white active:scale-95 transition-transform cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Semua Filter</span>
          </button>
        </div>
      ) : mobileDisplayMode === 'LIST' ? (
        /* NATIVE MOBILE LIST ROWS (60px+ touch targets, hairline dividers, right disclosure) */
        <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800/80 overflow-hidden shadow-2xs">
          {filteredSlots.map((slot) => {
            const vis = getMobileStatusStyle(slot.status);
            const upperLoc = slot.lokasi.toUpperCase();
            const isSelected = selectedMultiLocs.has(upperLoc);
            const hasPutaway = activePutawayBySource.has(upperLoc);
            const reservedQty = reservedDestQtyMap.get(upperLoc) || 0;

            return (
              <button
                key={slot.lokasi}
                type="button"
                onClick={() => {
                  if (isMultiSelectMode) onToggleMultiRack(upperLoc);
                  else onSelectRack(slot.lokasi);
                }}
                className={`w-full px-3 py-2.5 flex items-center gap-3 text-left transition-colors active:bg-slate-50 dark:active:bg-slate-800/60 cursor-pointer min-h-[62px] ${
                  isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/35' : ''
                }`}
              >
                {/* Left Slot: Multi-Select Checkbox OR Rack Code Tile */}
                {isMultiSelectMode && canMultiSelectRacks ? (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                ) : null}

                <div
                  className={`min-w-[56px] h-11 px-2 rounded-xl border flex flex-col items-center justify-center shrink-0 ${vis.badgeBg}`}
                >
                  <span className="font-mono font-black text-xs tracking-tight leading-none">
                    {slot.lokasi}
                  </span>
                  <span className="text-[9px] font-bold opacity-80 mt-0.5 leading-none">
                    {slot.fillPercent}%
                  </span>
                </div>

                {/* Middle Slot: Category, Area, Progress Bar & Status Flags */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {slot.category}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">· {slot.area}</span>
                    </div>
                    <span className="font-mono tabular-nums text-xs font-black text-slate-900 dark:text-white shrink-0">
                      {slot.currentQty}
                      <span className="text-[10px] font-normal text-slate-400">/{slot.maxCapacity}</span>
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full origin-left ${vis.barBg}`}
                      style={{ transform: `scaleX(${Math.min(1, Math.max(0, slot.fillPercent / 100))})` }}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="font-mono tabular-nums">
                        {slot.skuCount > 0 ? `${slot.skuCount} SKU` : 'Kosong'}
                      </span>
                      {hasPutaway && (
                        <span className="font-mono font-extrabold text-cyan-700 dark:text-cyan-400">
                          · PUTAWAY
                        </span>
                      )}
                      {reservedQty > 0 && (
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          · +{reservedQty} res
                        </span>
                      )}
                    </div>
                    <span className={`font-bold shrink-0 ${vis.text}`}>
                      {slot.overCapacityQty > 0
                        ? `+${slot.overCapacityQty} over`
                        : slot.availableSpace > 0
                        ? `Sisa ${slot.availableSpace}`
                        : 'Penuh'}
                    </span>
                  </div>
                </div>

                {!isMultiSelectMode && (
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        /* 3-COLUMN COMPACT VISUAL RACK HEATMAP (15-18 racks visible per screen on phone!) */
        <div className="grid grid-cols-3 gap-2">
          {filteredSlots.map((slot) => {
            const vis = getMobileStatusStyle(slot.status);
            const upperLoc = slot.lokasi.toUpperCase();
            const isSelected = selectedMultiLocs.has(upperLoc);
            const hasPutaway = activePutawayBySource.has(upperLoc);

            return (
              <button
                key={slot.lokasi}
                type="button"
                onClick={() => {
                  if (isMultiSelectMode) onToggleMultiRack(upperLoc);
                  else onSelectRack(slot.lokasi);
                }}
                className={`relative rounded-2xl border p-2.5 text-left flex flex-col justify-between min-h-[88px] active:scale-[0.96] transition-all cursor-pointer bg-white dark:bg-[#131d31] ${
                  isSelected
                    ? 'ring-2 ring-indigo-600 border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30'
                    : vis.tileBorder
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-mono font-black text-xs text-slate-900 dark:text-white tracking-tight truncate">
                    {slot.lokasi}
                  </span>
                  {isMultiSelectMode ? (
                    isSelected ? (
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )
                  ) : (
                    <span className={`font-mono font-black text-[10.5px] tabular-nums shrink-0 ${vis.text}`}>
                      {slot.fillPercent}%
                    </span>
                  )}
                </div>

                <div className="text-[9.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {hasPutaway ? (
                    <span className="font-bold text-cyan-600 dark:text-cyan-400">PUTAWAY</span>
                  ) : (
                    slot.category
                  )}
                </div>

                <div className="mt-2 space-y-1">
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full origin-left ${vis.barBg}`}
                      style={{ transform: `scaleX(${Math.min(1, Math.max(0, slot.fillPercent / 100))})` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[9.5px] font-mono tabular-nums">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {slot.currentQty}/{slot.maxCapacity}
                    </span>
                    <span className="text-slate-400">
                      {slot.skuCount > 0 ? `${slot.skuCount}s` : '0'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="text-center text-[10.5px] text-slate-400 font-mono tabular-nums pt-1">
        {filteredSlots.length.toLocaleString('id-ID')} dari {totalAllSlots.toLocaleString('id-ID')} rak · Ketuk rak untuk rincian
      </div>

      {/* 5. NATIVE FILTER, ZONA & SETUP BOTTOM SHEET */}
      {isFilterSheetOpen && (
        <div
          onClick={() => setIsFilterSheetOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-end justify-center animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[86dvh] bg-white dark:bg-[#131d31] rounded-t-3xl border-t border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
          >
            {/* Drag Handle */}
            <div className="pt-2.5 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Sheet Header */}
            <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Filter Zona &amp; Kategori</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Saring rak berdasarkan zona penyimpanan atau kategori produk
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onResetAllFilters();
                    }}
                    className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsFilterSheetOpen(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sheet Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Kategori Chips */}
              <div className="space-y-2">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Kategori Produk
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectCategory('ALL')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      selectedCategory === 'ALL'
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-600 dark:border-indigo-600'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Semua Kategori
                  </button>
                  {availableCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => onSelectCategory(selectedCategory === cat ? 'ALL' : cat)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-indigo-600 dark:border-indigo-600'
                          : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Zona Rak List with Live Fill Bars */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Zona Rak ({summaryStats.zones.length})
                  </span>
                  {selectedZoneId !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => onSelectZoneId('ALL')}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer"
                    >
                      Semua Zona
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {summaryStats.zones.map((z) => {
                    const pct = z.maxCapacity > 0 ? Math.round((z.currentQty / z.maxCapacity) * 100) : 0;
                    const isSelected = selectedZoneId === z.zoneId;
                    return (
                      <button
                        key={z.zoneId}
                        type="button"
                        onClick={() => onSelectZoneId(isSelected ? 'ALL' : z.zoneId)}
                        className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500/30'
                            : 'bg-slate-50/70 dark:bg-[#0E1420] border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {z.zoneName}
                          </span>
                          <span
                            className={`text-xs font-black font-mono tabular-nums shrink-0 ${
                              pct > 100 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {pct}%
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">{z.category}</div>
                        <div className="mt-1.5 h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full origin-left ${pct > 100 ? 'bg-rose-600' : 'bg-indigo-600'}`}
                            style={{ transform: `scaleX(${Math.min(1, pct / 100)})` }}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-500">
                          <span>
                            {z.currentQty}/{z.maxCapacity}
                          </span>
                          {z.overloadRackCount > 0 && (
                            <span className="text-rose-600 font-bold">{z.overloadRackCount} over</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Admin Setup Link inside Sheet */}
              {canManageCapacityConfig && (
                <button
                  type="button"
                  onClick={() => {
                    setIsFilterSheetOpen(false);
                    onOpenSetupModal();
                  }}
                  className="w-full p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-slate-500" />
                    <span>Pengaturan Setup Kapasitas &amp; Zona</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </div>

            {/* Pinned Sheet Footer CTA */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#131d31] shrink-0">
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(false)}
                className="w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-sm font-extrabold flex items-center justify-center transition-transform cursor-pointer shadow-md shadow-indigo-600/20"
              >
                Tampilkan {filteredSlots.length.toLocaleString('id-ID')} Rak
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. THUMB-ZONE FIXED MOBILE BOTTOM ACTION BAR (Normal Tools OR Multi-Select Batch Bar) */}
      {isMultiSelectMode || selectedMultiLocs.size > 0 ? (
        <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white/95 dark:bg-[#0E1420]/95 backdrop-blur-md border-t border-indigo-300 dark:border-indigo-800 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] px-3 pt-2.5 pb-[calc(0.65rem+env(safe-area-inset-bottom))] space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5 min-w-0">
              <span className="px-2 py-0.5 rounded-lg bg-indigo-600 text-white font-mono text-[11px] tabular-nums">
                {selectedMultiStats.rackCount} rak
              </span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                {selectedMultiStats.totalQty.toLocaleString('id-ID')} pcs
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {filteredFilledCount > 0 && (
                <button
                  type="button"
                  onClick={onSelectFilledFiltered}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10.5px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Terisi ({filteredFilledCount})
                </button>
              )}
              {selectedMultiLocs.size > 0 && (
                <button
                  type="button"
                  onClick={onClearMultiSelection}
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={onExitMultiSelectMode}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center cursor-pointer"
                aria-label="Keluar mode pilih banyak"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {canUsePutaway && selectedMultiStats.putawayEligibleList.length > 0 && (
              <button
                type="button"
                onClick={onStartMultiPutaway}
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-indigo-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <ClipboardList className="w-4 h-4 shrink-0" />
                <span>Putaway ({selectedMultiStats.putawayEligibleList.length})</span>
              </button>
            )}
            {canRelocateRack && (
              <button
                type="button"
                disabled={selectedMultiStats.filledRackCount === 0}
                onClick={onOpenMultiRelocation}
                className="flex-1 min-h-[42px] px-3 rounded-xl bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 cursor-pointer"
              >
                <ArrowRightLeft className="w-4 h-4 shrink-0" />
                <span>Pindah ({selectedMultiStats.filledRackCount})</span>
              </button>
            )}
            {userIsSuperadmin && (
              <button
                type="button"
                disabled={selectedMultiLocs.size === 0}
                onClick={onOpenMultiPurge}
                className="min-h-[42px] px-3 rounded-xl bg-rose-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                <span>Kosongkan</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <nav
          aria-label="Aksi Cepat Kapasitas Rak"
          className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white/95 dark:bg-[#0E1420]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] px-2 pt-1.5 pb-[calc(0.45rem+env(safe-area-inset-bottom))]"
        >
          <div className="grid grid-cols-4 gap-1">
            {canRelocateRack ? (
              <button
                type="button"
                onClick={onOpenRelocation}
                className="min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-indigo-600 dark:text-indigo-400 active:bg-indigo-50 dark:active:bg-indigo-950/50 transition-colors cursor-pointer"
              >
                <ArrowRightLeft className="w-5 h-5" />
                <span className="text-[10px] font-bold tracking-tight">Relokasi</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(true)}
                className="min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-bold tracking-tight">Zona</span>
              </button>
            )}

            {canUsePutaway ? (
              <button
                type="button"
                onClick={onTogglePutawayPanel}
                className={`relative min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                  isPutawayPanelOpen
                    ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300'
                    : 'text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800'
                }`}
              >
                <div className="relative">
                  <ClipboardList className="w-5 h-5" />
                  {(activePutawayCount > 0 || putawayOutboxCount > 0) && (
                    <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-cyan-600 text-white text-[9px] font-mono font-black flex items-center justify-center">
                      {activePutawayCount || putawayOutboxCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-bold tracking-tight">Putaway</span>
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={onToggleSimPanel}
              className={`relative min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                isSimPanelOpen
                  ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                  : 'text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800'
              }`}
            >
              <div className="relative">
                <Sparkles className="w-5 h-5" />
                {simulationMovesCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full bg-purple-600 text-white text-[9px] font-mono font-black flex items-center justify-center">
                    {simulationMovesCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold tracking-tight">Saran Rak</span>
            </button>

            {canMultiSelectRacks ? (
              <button
                type="button"
                onClick={onToggleMultiSelectMode}
                className="min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 transition-colors cursor-pointer"
              >
                <CheckSquare className="w-5 h-5" />
                <span className="text-[10px] font-bold tracking-tight">Pilih Rak</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(true)}
                className="min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-bold tracking-tight">Filter</span>
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
};

export default RackCapacityMobileView;
