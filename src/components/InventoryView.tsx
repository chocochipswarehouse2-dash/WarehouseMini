import React, { useState, useMemo, useDeferredValue, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Download,
  MapPin,
  Printer,
  Package,
  Layers,
  Building,
  CheckCircle2,
  AlertCircle,
  Filter,
  ChevronDown,
  X,
  Boxes,
  SlidersHorizontal,
} from 'lucide-react';
import type { ProductItem, UserSession } from '../types';
import { hasPermission } from '../services/permissions';
import { InventoryLokasiExportModal } from './InventoryLokasiExportModal';
import {
  buildCatalogBases,
  composeRows,
  filterRows,
  sortRows,
  computeStats,
  buildInventoryCsv,
  toggleArea,
  areaLabel,
  ALL_AREAS,
  type AreaFilterType,
  type InventorySortOption,
  type InventoryRow,
} from './inventory/inventoryModel';
import {
  useInventoryStock,
  getStockBySku,
  flattenStock,
} from './inventory/useInventoryStock';
import { InventoryList } from './inventory/InventoryList';
import { InventoryDetailDrawer } from './inventory/InventoryDetailDrawer';

export interface InventoryViewProps {
  session?: UserSession | null;
  currentLocations?: string[];
  productCatalog?: ProductItem[];
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshCatalog?: (forceRefresh?: boolean) => Promise<void> | void;
}

export const InventoryView: React.FC<InventoryViewProps> = React.memo(({
  session,
  currentLocations = [],
  productCatalog = [],
  onNotify,
  onRefreshCatalog,
}) => {
  // 1. Stock store & realtime sync
  const { version: stockVersion, phase, error: stockError, isEmpty, reload } = useInventoryStock();

  // 2. Search, filters, and sort states
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);

  const [onlyActive, setOnlyActive] = useState(false);
  const [onlySelisih, setOnlySelisih] = useState(false);
  const [sortOption, setSortOption] = useState<InventorySortOption>('NAME_ASC');

  // Multiselect Area filter
  const [activeAreas, setActiveAreas] = useState<AreaFilterType[]>(() => {
    try {
      const saved = localStorage.getItem('wms_filter_areas_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [...ALL_AREAS];
  });
  const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);
  const areaDropdownRef = useRef<HTMLDivElement>(null);

  // Close area dropdown on outside click
  useEffect(() => {
    if (!isAreaDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (areaDropdownRef.current && !areaDropdownRef.current.contains(e.target as Node)) {
        setIsAreaDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAreaDropdownOpen]);

  const handleToggleArea = (code: AreaFilterType) => {
    const next = toggleArea(activeAreas, code);
    setActiveAreas(next);
    try {
      localStorage.setItem('wms_filter_areas_v2', JSON.stringify(next));
    } catch {}
  };

  // 3. Selected SKU for Detail Drawer
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  // 4. Modal Lokasi Export & Print PDF
  const [isLokasiExportModalOpen, setIsLokasiExportModalOpen] = useState(false);
  const [selectedExportLocation, setSelectedExportLocation] = useState('CC001');

  const handleOpenLokasiExport = useCallback((locName?: string) => {
    if (locName) setSelectedExportLocation(locName);
    setIsLokasiExportModalOpen(true);
  }, []);

  // 5. Data composition (Memoized O(N) pipeline)
  // Step A: Catalog parsing (cached via WeakMap per item)
  const catalogBases = useMemo(() => {
    return buildCatalogBases(productCatalog);
  }, [productCatalog]);

  // Step B: Join with physical stock map
  const allRows = useMemo(() => {
    // stockVersion triggers re-evaluation when stockBySku updates
    void stockVersion;
    const map = getStockBySku();
    return composeRows(catalogBases, map);
  }, [catalogBases, stockVersion]);

  // Step C: Filter by query, active, selisih
  const filteredRows = useMemo(() => {
    return filterRows(allRows, {
      query: deferredSearch,
      onlyActive,
      onlySelisih,
    });
  }, [allRows, deferredSearch, onlyActive, onlySelisih]);

  // Step D: Sort
  const sortedRows = useMemo(() => {
    return sortRows(filteredRows, sortOption);
  }, [filteredRows, sortOption]);

  // Step E: KPI Stats (calculated on filtered rows for live response)
  const stats = useMemo(() => {
    return computeStats(filteredRows);
  }, [filteredRows]);

  // Find currently selected row object for Drawer
  const selectedRow = useMemo(() => {
    if (!selectedSku) return null;
    return allRows.find((r) => r.sku === selectedSku) || null;
  }, [allRows, selectedSku]);

  // 6. Manual Refresh handler
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onNotify) onNotify('Menyinkronkan inventori & katalog dari Supabase...', 'info');
      await Promise.all([
        reload(true),
        onRefreshCatalog ? onRefreshCatalog(true) : Promise.resolve(),
      ]);
      if (onNotify) onNotify('Data inventori berhasil diperbarui!', 'success');
    } catch (e: any) {
      if (onNotify) onNotify(e?.message || 'Gagal memperbarui inventori', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  // 7. CSV Export
  const canExportData = hasPermission(session, 'action_export_data');
  const handleExportCsv = () => {
    if (!sortedRows.length) {
      if (onNotify) onNotify('Tidak ada data yang bisa diekspor.', 'warning');
      return;
    }
    const csv = buildInventoryCsv(sortedRows, activeAreas);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `WMS_INVENTORY_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (onNotify) onNotify(`File CSV berhasil diunduh (${sortedRows.length} SKU)!`, 'success');
  };

  // Stock list snapshot for Lokasi Export Modal (only flattened when modal is open)
  const exportStockSnapshot = useMemo(() => {
    if (!isLokasiExportModalOpen) return [];
    return flattenStock();
  }, [isLokasiExportModalOpen, stockVersion]);

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto p-2 sm:p-4 animate-in fade-in duration-150">
      {/* ========================================================
          1. KPI CARDS HEADER (Stok Fisik vs DealPOS)
          ======================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* KPI 1: Total SKU */}
        <div className="p-3.5 rounded-2xl border bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>TOTAL SKU TERDATA</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {stats.skuCount.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">SKU</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {allRows.length !== stats.skuCount ? `Difilter dari ${allRows.length.toLocaleString('id-ID')} total` : 'Seluruh master produk'}
          </div>
        </div>

        {/* KPI 2: Total Fisik Gudang */}
        <div className="p-3.5 rounded-2xl border bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>TOTAL FISIK GUDANG</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {stats.totalFisik.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">pcs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Stok fisik nyata di rak gudang
          </div>
        </div>

        {/* KPI 3: Total DealPOS */}
        <div className="p-3.5 rounded-2xl border bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>TOTAL DEALPOS</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
            {stats.totalDp.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">pcs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Total sistem DealPOS (5 area)
          </div>
        </div>

        {/* KPI 4: Selisih (Fisik - DealPOS) */}
        <div
          onClick={() => setOnlySelisih((prev) => !prev)}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            onlySelisih
              ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/30'
              : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
          title="Klik untuk memfilter hanya SKU yang memiliki selisih"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>SELISIH FISIK vs DP</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              stats.totalSelisih === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
            }`}>
              {stats.totalSelisih === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            </div>
          </div>
          <div className={`text-xl sm:text-2xl font-black font-mono ${
            stats.totalSelisih === 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : stats.totalSelisih > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-rose-600 dark:text-rose-400'
          }`}>
            {stats.totalSelisih > 0 ? `+${stats.totalSelisih.toLocaleString('id-ID')}` : stats.totalSelisih.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">pcs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate flex items-center justify-between">
            <span>{stats.skuSelisih.toLocaleString('id-ID')} SKU berbeda</span>
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
              {onlySelisih ? '✓ Difilter' : 'Klik filter'}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================
          2. TOOLBAR (Search, Quick Filters, Area Multiselect, Actions)
          ======================================================== */}
      <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full lg:flex-1 lg:min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="inputSearchInventory"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Nama Produk / SKU / Lokasi Rak..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Filter Toggles & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* ADA STOK FILTER */}
            <button
              type="button"
              onClick={() => setOnlyActive((prev) => !prev)}
              className={`px-3 py-2 text-xs font-extrabold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                onlyActive
                  ? 'bg-amber-500 text-black border-amber-500 shadow-xs'
                  : 'bg-slate-50 dark:bg-[#0E1420] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
              title="Tampilkan hanya produk yang memiliki stok (fisik atau DealPOS)"
            >
              <Package className="w-3.5 h-3.5" />
              <span>ADA STOK</span>
            </button>

            {/* HANYA SELISIH FILTER */}
            <button
              type="button"
              onClick={() => setOnlySelisih((prev) => !prev)}
              className={`px-3 py-2 text-xs font-extrabold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                onlySelisih
                  ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                  : 'bg-slate-50 dark:bg-[#0E1420] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
              title="Tampilkan hanya produk dengan perbedaan antara fisik dan DealPOS"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>HANYA SELISIH</span>
            </button>

            {/* MULTISELECT FILTER AREA */}
            <div className="relative" ref={areaDropdownRef}>
              <button
                type="button"
                onClick={() => setIsAreaDropdownOpen(!isAreaDropdownOpen)}
                className="px-3 py-2 text-xs font-extrabold bg-slate-50 dark:bg-[#0E1420] hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-800 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                title="Pilih area data yang diaktifkan"
              >
                <Filter className="w-3.5 h-3.5" />
                <span className="truncate max-w-[130px]">{areaLabel(activeAreas)}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {isAreaDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-50 p-2 text-xs space-y-1 animate-in fade-in duration-100">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    Area yang Ditampilkan
                  </div>
                  <label
                    onClick={() => handleToggleArea('ALL')}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer font-bold text-slate-800 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={activeAreas.includes('ALL')}
                      onChange={() => {}}
                      className="rounded text-amber-500 accent-amber-500"
                    />
                    <span>SEMUA AREA</span>
                  </label>
                  {(['GUDANG', 'STORE', 'ONLINE', 'OFFLINE'] as AreaFilterType[]).map((code) => (
                    <label
                      key={code}
                      onClick={() => handleToggleArea(code)}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer text-slate-700 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={activeAreas.includes('ALL') || activeAreas.includes(code)}
                        onChange={() => {}}
                        className="rounded text-amber-500 accent-amber-500"
                      />
                      <span>
                        {code === 'GUDANG' && 'GUDANG UTAMA (5 AREA)'}
                        {code === 'STORE' && 'STORE (15 CABANG)'}
                        {code === 'ONLINE' && 'ONLINE (MARKETPLACE)'}
                        {code === 'OFFLINE' && 'OFFLINE (WH / QC / GA / LOG)'}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* LOKASI & PRINT MODAL BUTTON */}
            <button
              type="button"
              onClick={() => handleOpenLokasiExport()}
              className="px-3 py-2 text-xs font-extrabold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Ekspor Data & Cetak PDF per Lokasi Rak"
            >
              <MapPin className="w-3.5 h-3.5" />
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">LOKASI &amp; PRINT</span>
            </button>

            {/* CSV EXPORT */}
            {canExportData && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Unduh hasil inventori sebagai file CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            )}

            {/* REFRESH BUTTON */}
            <button
              type="button"
              disabled={isRefreshing || phase === 'syncing'}
              onClick={handleManualRefresh}
              className="px-3 py-2 text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Sinkronkan data terbaru dari database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || phase === 'syncing' ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isRefreshing || phase === 'syncing' ? 'SYNCING...' : 'REFRESH'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. WARNING / ERROR BANNER
          ======================================================== */}
      {stockError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3.5 text-xs text-rose-900 dark:text-rose-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            <p className="font-medium">{stockError}</p>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-xl transition-all text-xs cursor-pointer shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}

      {isEmpty && phase === 'ready' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="font-bold">Stok Fisik Kosong / Belum Termuat</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Katalog master siap, namun belum ada baris stok fisik rak gudang.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-extrabold rounded-xl transition-all text-xs cursor-pointer shrink-0"
          >
            Muat Sekarang
          </button>
        </div>
      )}

      {/* ========================================================
          4. VIRTUALIZED INVENTORY LIST
          ======================================================== */}
      {phase === 'loading' && isEmpty ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            Memuat data inventori dari Supabase &amp; IndexedDB...
          </span>
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="py-16 text-center space-y-2 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl">
          <Boxes className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Tidak Ada Produk yang Sesuai Filter
          </div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Coba bersihkan kata kunci pencarian atau matikan filter &ldquo;Ada Stok&rdquo; / &ldquo;Hanya Selisih&rdquo;.
          </p>
        </div>
      ) : (
        <InventoryList
          rows={sortedRows}
          sort={sortOption}
          onSort={setSortOption}
          onOpen={setSelectedSku}
          onLoc={handleOpenLokasiExport}
          resetKey={`${deferredSearch}_${onlyActive}_${onlySelisih}_${sortOption}`}
        />
      )}

      {/* Bottom status note */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 px-2 gap-1">
        <span>
          Menampilkan <strong className="text-slate-700 dark:text-slate-300 font-mono">{sortedRows.length.toLocaleString('id-ID')}</strong> dari{' '}
          <strong className="text-slate-700 dark:text-slate-300 font-mono">{allRows.length.toLocaleString('id-ID')}</strong> SKU master produk. Klik baris untuk detail perbandingan channel.
        </span>
        <span className="text-[10px]">
          Virtual Rendering Aktif · 60 FPS
        </span>
      </div>

      {/* ========================================================
          5. DETAIL DRAWER (Per-SKU 5-Area & Channel Breakdown)
          ======================================================== */}
      <InventoryDetailDrawer
        row={selectedRow}
        areas={activeAreas}
        onClose={() => setSelectedSku(null)}
        onLoc={(loc) => {
          setSelectedSku(null);
          handleOpenLokasiExport(loc);
        }}
      />

      {/* ========================================================
          6. MODAL EKSPOR & PRINT LOKASI
          ======================================================== */}
      {isLokasiExportModalOpen && (
        <InventoryLokasiExportModal
          isOpen={isLokasiExportModalOpen}
          onClose={() => setIsLokasiExportModalOpen(false)}
          initialLocation={selectedExportLocation}
          stockList={exportStockSnapshot}
          productCatalog={productCatalog}
          currentLocations={currentLocations}
          session={session}
          onNotify={onNotify}
        />
      )}
    </div>
  );
});

export default InventoryView;
