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
  Box,
  Boxes,
  LayoutGrid,
  ClipboardList,
  ScanBarcode,
  FileSpreadsheet,
  Columns2,
  Table2,
  LayoutList,
  ShoppingCart,
  ArrowRight,
} from 'lucide-react';
import {
  InventoryPickingCartDrawer,
  type InventoryCartItem,
  type InventoryOrderPickingDetails,
} from './inventory/InventoryPickingCartDrawer';
import { DistribusiPickingModal } from './PesananSaya/DistribusiPickingModal';
import type { PengecekanSJDraft } from '../types';
import type { ProductItem, UserSession } from '../types';
import type { ScannerLayoutMode } from './OperasiStokView';
import { hasPermission, isSuperadmin } from '../services/permissions';
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
import { RackCapacityDashboard } from './inventory/RackCapacityDashboard';
import { Warehouse3DVisualTab } from './inventory/Warehouse3DVisualTab';
import { MutasiLogView } from './MutasiLogView';

export type InventoryPageTab = 'capacity' | 'visual_3d' | 'inventory' | 'scanner' | 'logs';

export interface InventoryViewProps {
  session?: UserSession | null;
  currentLocations?: string[];
  productCatalog?: ProductItem[];
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshCatalog?: (forceRefresh?: boolean) => Promise<void> | void;
  scannerComponent?: React.ReactNode | ((layoutMode: ScannerLayoutMode) => React.ReactNode);
  scannedCount?: number;
  onOpenImportModal?: () => void;
  initialTab?: InventoryPageTab;
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
  scannerComponent,
  scannedCount = 0,
  onOpenImportModal,
  initialTab,
}) => {
  const userIsAdmin = isSuperadmin(session ?? null);
  const canViewInventory = userIsAdmin || hasPermission(session ?? null, 'menu_ops_inventory');
  const canUseScanner =
    userIsAdmin ||
    hasPermission(session ?? null, 'tab_ops_mutasi_scanner') ||
    hasPermission(session ?? null, 'menu_ops_mutasi') ||
    hasPermission(session ?? null, 'menu_ops_inventory');
  const canViewLogs =
    userIsAdmin ||
    hasPermission(session ?? null, 'tab_ops_mutasi_log') ||
    hasPermission(session ?? null, 'menu_ops_mutasi') ||
    hasPermission(session ?? null, 'menu_ops_inventory');

  // 0. Top-level Inventory Sub-Tab (4 Tabs: Dashboard Interaktif Kapasitas | Data Inventory Produk | Scanner Barcode | Log Produk)
  const [activeTab, setActiveTab] = useState<InventoryPageTab>(() => {
    if (initialTab) return initialTab;
    if (!canViewInventory && canUseScanner) return 'scanner';
    if (!canViewInventory && canViewLogs) return 'logs';
    return 'capacity';
  });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Scanner Layout Mode ('split' | 'table' | 'compact')
  const [scannerLayoutMode, setScannerLayoutMode] = useState<ScannerLayoutMode>(() => {
    try {
      const saved = localStorage.getItem('wms_scanner_layout_mode') as ScannerLayoutMode | null;
      if (saved === 'split' || saved === 'table' || saved === 'compact') return saved;
    } catch {}
    return 'split';
  });

  useEffect(() => {
    try {
      localStorage.setItem('wms_scanner_layout_mode', scannerLayoutMode);
    } catch {}
  }, [scannerLayoutMode]);

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

  // Auto-heal: verify if productCatalog has dealpos_channels, if not, trigger fresh sync from Supabase
  useEffect(() => {
    if (productCatalog && productCatalog.length > 0 && onRefreshCatalog) {
      const hasDp = productCatalog.some((it) => it.dealpos_channels && Object.keys(it.dealpos_channels).length > 0);
      if (!hasDp) {
        onRefreshCatalog(true);
      }
    }
  }, [productCatalog, onRefreshCatalog]);

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
  const canExportData = hasPermission(session ?? null, 'action_export_data');
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

  // ==========================================
  // INVENTORY PICKING CART STATE & HANDLERS
  // ==========================================
  const [cartItems, setCartItems] = useState<InventoryCartItem[]>(() => {
    try {
      const saved = localStorage.getItem('wms_inventory_picking_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('wms_inventory_picking_cart', JSON.stringify(cartItems));
    } catch {}
  }, [cartItems]);

  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [isPickingModalOpen, setIsPickingModalOpen] = useState(false);
  const [pickingModalDraft, setPickingModalDraft] = useState<PengecekanSJDraft | null>(null);

  const handleAddToCart = useCallback((item: Omit<InventoryCartItem, 'qty'>, addQty: number = 1) => {
    const avail = Number(item.available_stock) || 0;
    if (avail <= 0) {
      if (onNotify) {
        onNotify(`Stok fisik ${item.nama_produk || item.sku} kosong (0 pcs), tidak dapat ditambahkan ke keranjang picking!`, 'warning');
      }
      return;
    }

    const cleanLocations = Array.isArray(item.locations)
      ? item.locations.filter(l => l && l.lokasi && l.lokasi !== '-')
      : [];

    setCartItems(prev => {
      const existingIdx = prev.findIndex(it => it.sku.toUpperCase() === item.sku.toUpperCase());
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          qty: next[existingIdx].qty + addQty,
          available_stock: avail,
          locations: cleanLocations.length > 0 ? cleanLocations : next[existingIdx].locations,
        };
        return next;
      }
      return [...prev, {
        ...item,
        available_stock: avail,
        locations: cleanLocations,
        qty: Math.max(1, addQty)
      }];
    });
    if (onNotify) {
      onNotify(`Ditambahkan ke keranjang: ${item.nama_produk || item.sku} (+${addQty} pcs)`, 'success');
    }
  }, [onNotify]);

  const handleBulkAddToCart = useCallback((itemsToAdd: Array<{ item: Omit<InventoryCartItem, 'qty'>; qty: number }>) => {
    if (!itemsToAdd || itemsToAdd.length === 0) return;
    setCartItems(prev => {
      const map = new Map<string, InventoryCartItem>();
      for (const it of prev) {
        map.set(it.sku.toUpperCase(), { ...it });
      }
      let addedCount = 0;
      for (const entry of itemsToAdd) {
        const it = entry.item;
        const q = Math.max(1, Number(entry.qty) || 1);
        const avail = Number(it.available_stock) || 0;
        if (avail <= 0) continue;
        const key = it.sku.toUpperCase();
        const cleanLocations = Array.isArray(it.locations)
          ? it.locations.filter(l => l && l.lokasi && l.lokasi !== '-')
          : [];
        const existing = map.get(key);
        if (existing) {
          existing.qty += q;
          existing.available_stock = avail;
          if (cleanLocations.length > 0) existing.locations = cleanLocations;
        } else {
          map.set(key, {
            ...it,
            available_stock: avail,
            locations: cleanLocations,
            qty: q,
          });
        }
        addedCount++;
      }
      return Array.from(map.values());
    });
    if (onNotify) {
      onNotify(`Berhasil menambahkan ${itemsToAdd.length} SKU ke keranjang picking!`, 'success');
    }
  }, [onNotify]);

  const handleUpdateCartQty = useCallback((sku: string, newQty: number) => {
    setCartItems(prev => prev.map(it => it.sku === sku ? { ...it, qty: Math.max(1, newQty) } : it));
  }, []);

  const handleRemoveFromCart = useCallback((sku: string) => {
    setCartItems(prev => prev.filter(it => it.sku !== sku));
    if (onNotify) onNotify('Item dihapus dari keranjang picking', 'info');
  }, [onNotify]);

  const handleClearCart = useCallback(() => {
    setCartItems([]);
    if (onNotify) onNotify('Keranjang picking telah dikosongkan', 'info');
  }, [onNotify]);

  // Derived available rows for Quick Search in Cart
  const availableRowsForCart = useMemo(() => {
    const map = new Map<string, {
      sku: string;
      produk: string;
      size: string;
      qty: number;
      locations: Array<{ lokasi: string; qty: number; area?: string }>;
    }>();

    for (const r of allAreaRows) {
      if (r.area === 'Perbaikan' || r.area === 'Anomali') continue;
      const existing = map.get(r.sku);
      if (!existing) {
        map.set(r.sku, {
          sku: r.sku,
          produk: r.produk,
          size: r.size,
          qty: r.qty,
          locations: [...r.locations],
        });
      } else {
        existing.qty += r.qty;
        existing.locations.push(...r.locations);
      }
    }
    return Array.from(map.values());
  }, [allAreaRows]);

  const handleProceedToPicking = useCallback((details: InventoryOrderPickingDetails) => {
    if (cartItems.length === 0) return;

    const draft: PengecekanSJDraft = {
      id: `PICK_CART_${Date.now()}`,
      no_sj: details.no_dokumen,
      source: 'Gudang Pusat',
      destination: details.destinasi || details.tujuan,
      tanggal_sj: new Date().toISOString().slice(0, 10),
      tipe_import: 'Pengiriman',
      items: cartItems.map(c => ({
        sku: c.sku,
        nama_produk: c.nama_produk,
        size: c.size,
        qty_sj: c.qty,
      })),
      scanQty: {},
      unexpected: {},
      catatan: `[Order Picking Inventory - ${details.tujuan}] ${details.catatan || ''}`.trim(),
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setPickingModalDraft(draft);
    setIsCartDrawerOpen(false);
    setIsPickingModalOpen(true);
  }, [cartItems]);

  const handlePickingSuccessSentToApp = useCallback((_draftId: string, invoicePicking?: string) => {
    setCartItems([]);
    setIsPickingModalOpen(false);
    setPickingModalDraft(null);
    if (onNotify) {
      onNotify(`Order picking ${invoicePicking ? `(${invoicePicking})` : ''} berhasil didaftarkan ke antrean Tugas Picking!`, 'success');
    }
  }, [onNotify]);

  // Stock list snapshot for Capacity Dashboard & Lokasi Export Modal
  const flatStockSnapshot = useMemo(() => {
    void stockVersion;
    return flattenStock();
  }, [stockVersion]);

  const exportStockSnapshot = useMemo(() => {
    if (!isLokasiExportModalOpen) return [];
    return flatStockSnapshot;
  }, [isLokasiExportModalOpen, flatStockSnapshot]);

  return (
    <div className="w-full max-w-full px-1 sm:px-3 lg:px-4 py-2 sm:py-4 space-y-4 animate-in fade-in duration-150">
      {/* ========================================================
          0. NAVIGATION TABS (4 TABS):
          1. Dashboard Interaktif Kapasitas
          2. Data Inventory Produk
          3. Scanner Barcode
          4. Log Produk
          ======================================================== */}
      <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl p-2 flex flex-col lg:flex-row lg:items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap py-1 px-1 -mx-1 sm:mx-0 w-full lg:w-auto">
          {canViewInventory && (
            <button
              type="button"
              onClick={() => setActiveTab('capacity')}
              className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'capacity'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <span>Dashboard Interaktif Kapasitas</span>
            </button>
          )}

          {canViewInventory && (
            <button
              type="button"
              id="tab-inventory-3d-visual"
              onClick={() => setActiveTab('visual_3d')}
              className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'visual_3d'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Box className="w-4 h-4 shrink-0" />
              <span>3D Visual Kapasitas</span>
            </button>
          )}

          {canViewInventory && (
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'inventory'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Boxes className="w-4 h-4 shrink-0" />
              <span>Data Inventory Produk</span>
            </button>
          )}

          {canUseScanner && scannerComponent && (
            <button
              type="button"
              id="tab-inventory-scanner"
              onClick={() => setActiveTab('scanner')}
              className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'scanner'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ScanBarcode className="w-4 h-4 shrink-0" />
              <span>Scanner Barcode</span>
              {scannedCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black font-mono ${
                    activeTab === 'scanner'
                      ? 'bg-white/20 text-white dark:bg-black/20 dark:text-black'
                      : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  {scannedCount}
                </span>
              )}
            </button>
          )}

          {canViewLogs && (
            <button
              type="button"
              id="tab-inventory-logs"
              onClick={() => setActiveTab('logs')}
              className={`px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'logs'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>Log Produk</span>
            </button>
          )}
        </div>

        {/* Right Side: Scanner Layout Switcher + Import Button (when on Scanner tab) OR Inventory Summary */}
        {activeTab === 'scanner' ? (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <div
              className="inline-flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700/80"
              title="Pilih tampilan halaman Scanner"
            >
              <button
                type="button"
                onClick={() => setScannerLayoutMode('split')}
                className={`py-1 px-2.5 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  scannerLayoutMode === 'split'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilan Panel Rapi 2 Kolom (Input di Kiri, Antrean di Kanan)"
              >
                <Columns2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Panel Rapi</span>
              </button>

              <button
                type="button"
                onClick={() => setScannerLayoutMode('table')}
                className={`py-1 px-2.5 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  scannerLayoutMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilan Spreadsheet Tabel Lebar Penuh"
              >
                <Table2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Tabel</span>
              </button>

              <button
                type="button"
                onClick={() => setScannerLayoutMode('compact')}
                className={`py-1 px-2.5 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  scannerLayoutMode === 'compact'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilan Fokus 1 Kolom Ringkas"
              >
                <LayoutList className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Ringkas</span>
              </button>
            </div>

            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="py-1.5 px-3 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 rounded-lg transition-all cursor-pointer shadow-2xs shrink-0"
                title="Impor Data Excel / CSV (IN / OUT / SO)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="hidden sm:inline">Impor Excel</span>
                <span className="sm:hidden">Impor</span>
              </button>
            )}
          </div>
        ) : (
          <div className="hidden lg:flex items-center gap-2 text-[11px] text-slate-400 px-2 font-mono tabular-nums shrink-0">
            <span>{stats.skuCount.toLocaleString('id-ID')} SKU</span>
            <span aria-hidden="true">·</span>
            <span>{stats.totalFisik.toLocaleString('id-ID')} pcs fisik</span>
            <span aria-hidden="true">·</span>
            <span>{stats.activeLocationsCount.toLocaleString('id-ID')} titik rak aktif</span>
          </div>
        )}
      </div>

      {activeTab === 'capacity' && (
        <RackCapacityDashboard
          stockRows={flatStockSnapshot}
          productCatalog={productCatalog}
          session={session}
          onNotify={onNotify}
          onOpenPrintModal={handleOpenLokasiExport}
          onRefreshStock={handleManualRefresh}
          isRefreshingStock={isRefreshing || phase === 'syncing'}
        />
      )}

      {activeTab === 'visual_3d' && (
        <Warehouse3DVisualTab
          stockRows={flatStockSnapshot}
          productCatalog={productCatalog}
          session={session}
          onNotify={onNotify}
          onOpenPrintModal={handleOpenLokasiExport}
          onRefreshStock={handleManualRefresh}
          isRefreshingStock={isRefreshing || phase === 'syncing'}
        />
      )}

      {scannerComponent && (
        <div className={activeTab === 'scanner' ? 'block pb-20' : 'hidden'}>
          {typeof scannerComponent === 'function'
            ? scannerComponent(scannerLayoutMode)
            : scannerComponent}
        </div>
      )}

      {activeTab === 'logs' && (
        <MutasiLogView
          session={session}
          productCatalog={productCatalog}
          onNotify={onNotify}
          onRefreshCatalog={() => {
            reload(true);
            if (onRefreshCatalog) onRefreshCatalog(true);
          }}
        />
      )}

      {activeTab === 'inventory' && (
        <>
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
              className={`px-3 py-2 text-xs font-extrabold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                onlyActive
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-white'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
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
              className="px-3 py-2 text-xs font-extrabold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Ekspor Data & Cetak PDF per Lokasi Rak"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span className="hidden sm:inline">LOKASI &amp; PRINT</span>
            </button>

            {/* KERANJANG PICKING BUTTON */}
            <button
              type="button"
              id="btn-inventory-picking-cart"
              onClick={() => setIsCartDrawerOpen(true)}
              className={`px-3 py-2 text-xs font-extrabold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                cartItems.length > 0
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-600 ring-2 ring-indigo-500/30'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
              title="Buka Keranjang Order Picking"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>KERANJANG</span>
              {cartItems.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black font-mono bg-white text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {cartItems.length}
                </span>
              )}
            </button>

            {/* CSV EXPORT */}
            {canExportData && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-2 text-xs font-extrabold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Unduh hasil inventori per area sebagai file CSV"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            )}

            {/* REFRESH BUTTON */}
            <button
              type="button"
              disabled={isRefreshing || phase === 'syncing'}
              onClick={handleManualRefresh}
              className="px-3 py-2 text-xs font-extrabold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Sinkronkan data terbaru dari database"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isRefreshing || phase === 'syncing' ? 'animate-spin' : ''}`} />
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
          onAddToCart={handleAddToCart}
          onNotify={onNotify}
          resetKey={`${selectedArea}_${deferredSearch}_${onlyActive}_${sortOption}`}
        />
      )}

      {/* Bottom status note */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 px-2 gap-1">
        <span>
          Menampilkan <strong className="text-slate-700 dark:text-slate-300 font-mono">{sortedAreaRows.length.toLocaleString('id-ID')}</strong> baris area (dari{' '}
          <strong className="text-slate-700 dark:text-slate-300 font-mono">{stats.skuCount.toLocaleString('id-ID')}</strong> total SKU fisik). Data tersaji berdampingan dengan DealPOS tanpa kalkulasi selisih.
        </span>
        <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
          Side-by-Side DP &amp; Fisik Aktif
        </span>
      </div>
      </>
      )}

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
        onAddToCart={handleAddToCart}
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

      {/* ========================================================
          7. FLOATING ACTION BUTTON (FAB) ORDER PICKING
          ======================================================== */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40 animate-in slide-in-from-bottom-4 duration-200">
          <button
            type="button"
            onClick={() => setIsCartDrawerOpen(true)}
            className="px-4 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl hover:shadow-2xl flex items-center gap-2.5 text-xs font-black transition-all cursor-pointer ring-4 ring-indigo-500/20 active:scale-95"
          >
            <div className="relative">
              <ShoppingCart className="w-4 h-4" />
              <span className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black flex items-center justify-center shadow-xs">
                {cartItems.length}
              </span>
            </div>
            <span>Order Picking ({cartItems.reduce((s, it) => s + (Number(it.qty) || 0), 0)} pcs)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================
          8. INVENTORY PICKING CART DRAWER
          ======================================================== */}
      <InventoryPickingCartDrawer
        isOpen={isCartDrawerOpen}
        onClose={() => setIsCartDrawerOpen(false)}
        cartItems={cartItems}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveFromCart}
        onClearCart={handleClearCart}
        onAddToCart={handleAddToCart}
        onBulkAddToCart={handleBulkAddToCart}
        onNotify={onNotify}
        productCatalog={productCatalog}
        availableRows={availableRowsForCart}
        onProceedToPicking={handleProceedToPicking}
      />

      {/* ========================================================
          9. DISTRIBUSI PICKING MODAL (WA / TUGAS APP / CETAK A4)
          ======================================================== */}
      {isPickingModalOpen && (
        <DistribusiPickingModal
          isOpen={isPickingModalOpen}
          onClose={() => setIsPickingModalOpen(false)}
          draft={pickingModalDraft}
          productCatalog={productCatalog}
          session={session}
          onNotify={onNotify || (() => {})}
          onSuccessSentToApp={handlePickingSuccessSentToApp}
        />
      )}
    </div>
  );
});

export default InventoryView;
