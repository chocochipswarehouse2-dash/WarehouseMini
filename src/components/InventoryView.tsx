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
} from 'lucide-react';
import type { ProductItem, UserSession } from '../types';
import { hasPermission } from '../services/permissions';
import { InventoryLokasiExportModal } from './InventoryLokasiExportModal';
import {
  buildCatalogBases,
  composeAreaRows,
  filterAreaRows,
  sortAreaRows,
  computeAreaStats,
  buildAreaInventoryCsv,
  composeRows,
  ALL_AREAS,
  type AreaFilterType,
  type InventorySortOption,
  type InventoryAreaRow,
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

const AVAILABLE_AREAS = [
  { id: 'ALL', label: 'Semua Area' },
  { id: 'Warehouse', label: 'Warehouse' },
  { id: 'Blok F', label: 'Blok F' },
  { id: 'Koli', label: 'Koli' },
  { id: 'Perbaikan', label: 'Perbaikan' },
  { id: 'Aksesoris', label: 'Aksesoris' },
  { id: 'Transit', label: 'Transit' },
];

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

  const [selectedArea, setSelectedArea] = useState<string>('ALL');
  const [onlyActive, setOnlyActive] = useState(true);
  const [sortOption, setSortOption] = useState<InventorySortOption>('NAME_ASC');

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

  // Step B: Compose Product per Area Rows (Kategori | Nama Produk | Size | SKU | Area | Qty)
  const allAreaRows = useMemo(() => {
    void stockVersion;
    const map = getStockBySku();
    return composeAreaRows(catalogBases, map);
  }, [catalogBases, stockVersion]);

  // Step C: Filter Area Rows
  const filteredAreaRows = useMemo(() => {
    return filterAreaRows(allAreaRows, {
      query: deferredSearch,
      selectedArea,
      onlyActive,
    });
  }, [allAreaRows, deferredSearch, selectedArea, onlyActive]);

  // Step D: Sort Area Rows
  const sortedAreaRows = useMemo(() => {
    return sortAreaRows(filteredAreaRows, sortOption);
  }, [filteredAreaRows, sortOption]);

  // Step E: KPI Stats (calculated strictly on filtered physical rows)
  const stats = useMemo(() => {
    return computeAreaStats(filteredAreaRows);
  }, [filteredAreaRows]);

  // For Detail Drawer (when operator wants full SKU audit)
  const allSkuRows = useMemo(() => {
    void stockVersion;
    const map = getStockBySku();
    return composeRows(catalogBases, map);
  }, [catalogBases, stockVersion]);

  const selectedRow = useMemo(() => {
    if (!selectedSku) return null;
    return allSkuRows.find((r) => r.sku === selectedSku) || null;
  }, [allSkuRows, selectedSku]);

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

  // 7. CSV Export (Product per Area format)
  const canExportData = hasPermission(session, 'action_export_data');
  const handleExportCsv = () => {
    if (!sortedAreaRows.length) {
      if (onNotify) onNotify('Tidak ada data yang bisa diekspor.', 'warning');
      return;
    }
    const csv = buildAreaInventoryCsv(sortedAreaRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `WMS_INVENTORY_AREA_${selectedArea.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (onNotify) onNotify(`File CSV berhasil diunduh (${sortedAreaRows.length} baris area)!`, 'success');
  };

  // Stock list snapshot for Lokasi Export Modal
  const exportStockSnapshot = useMemo(() => {
    if (!isLokasiExportModalOpen) return [];
    return flattenStock();
  }, [isLokasiExportModalOpen, stockVersion]);

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto p-2 sm:p-4 animate-in fade-in duration-150">
      {/* ========================================================
          1. KPI CARDS HEADER (Stok Fisik Nyata Gudang)
          ======================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* KPI 1: Total SKU */}
        <div className="p-3.5 rounded-2xl border bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>TOTAL SKU TERDATA</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {stats.skuCount.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">SKU</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {catalogBases.length !== stats.skuCount ? `Difilter dari ${catalogBases.length.toLocaleString('id-ID')} master SKU` : 'Seluruh master produk'}
          </div>
        </div>

        {/* KPI 2: Total Fisik Gudang (Pcs) */}
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
            Total barang fisik nyata di rak gudang
          </div>
        </div>

        {/* KPI 3: Total Baris Area */}
        <div className="p-3.5 rounded-2xl border bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>BARIS AREA TERCATAT</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {stats.areaRowCount.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">baris</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Alokasi stok produk per area
          </div>
        </div>

        {/* KPI 4: Titik Rak Terisi */}
        <div className="p-3.5 rounded-2xl border bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>TITIK RAK TERISI</span>
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
            {stats.activeLocationsCount.toLocaleString('id-ID')}{' '}
            <span className="text-xs font-normal text-slate-400">titik rak</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Lokasi rak fisik aktif dengan stok &gt; 0
          </div>
        </div>
      </div>

      {/* ========================================================
          2. TOOLBAR (Search, Filter Area, Ada Stok, Actions)
          ======================================================== */}
      <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3.5 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full lg:flex-1 lg:min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="inputSearchInventory"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Kategori / Nama Produk / SKU / Area / Lokasi Rak..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium transition-all"
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
              title="Tampilkan hanya produk yang memiliki stok fisik di rak"
            >
              <Package className="w-3.5 h-3.5" />
              <span>ADA STOK</span>
            </button>

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
                title="Unduh hasil inventori per area sebagai file CSV"
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

        {/* Area Filter Tabs (Semua, Warehouse, Blok F, Koli, Perbaikan, Aksesoris, Transit) */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 border-t border-slate-100 dark:border-slate-800/80">
          <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
            <Filter className="w-3 h-3 text-amber-500" />
            <span>Filter Area:</span>
          </span>
          <div className="flex items-center gap-1">
            {AVAILABLE_AREAS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedArea(a.id)}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all cursor-pointer shrink-0 ${
                  selectedArea === a.id
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#0E1420] dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {a.label}
              </button>
            ))}
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
      ) : sortedAreaRows.length === 0 ? (
        <div className="py-16 text-center space-y-2 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl">
          <Boxes className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Tidak Ada Produk yang Sesuai Filter
          </div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Coba bersihkan kata kunci pencarian atau matikan filter &ldquo;Ada Stok&rdquo; / ubah filter area.
          </p>
        </div>
      ) : (
        <InventoryList
          rows={sortedAreaRows}
          sort={sortOption}
          onSort={setSortOption}
          onOpen={setSelectedSku}
          onLoc={handleOpenLokasiExport}
          resetKey={`${selectedArea}_${deferredSearch}_${onlyActive}_${sortOption}`}
        />
      )}

      {/* Bottom status note */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 px-2 gap-1">
        <span>
          Menampilkan <strong className="text-slate-700 dark:text-slate-300 font-mono">{sortedAreaRows.length.toLocaleString('id-ID')}</strong> baris produk per area (dari{' '}
          <strong className="text-slate-700 dark:text-slate-300 font-mono">{stats.skuCount.toLocaleString('id-ID')}</strong> total SKU fisik). Klik baris produk untuk melihat rincian titik rak dan qty.
        </span>
        <span className="text-[10px]">
          Virtual Rendering Aktif · 60 FPS
        </span>
      </div>

      {/* ========================================================
          5. DETAIL DRAWER (Per-SKU Audit & Mutasi History)
          ======================================================== */}
      <InventoryDetailDrawer
        row={selectedRow}
        areas={[...ALL_AREAS]}
        onClose={() => setSelectedSku(null)}
        onLoc={(loc) => {
          setSelectedSku(null);
          handleOpenLokasiExport(loc);
        }}
        onReloadStock={handleManualRefresh}
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
