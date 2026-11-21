import React, { useState, useMemo, useDeferredValue, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Download,
  MapPin,
  Printer,
  AlertCircle,
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
  Maximize2,
  Sparkles,
  ArrowUpDown,
  RotateCcw,
  MoreHorizontal,
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
import { hasPermission, isSuperadmin, isStoreAccountSession } from '../services/permissions';
import { InventoryLokasiExportModal } from './InventoryLokasiExportModal';
import {
  buildCatalogBases,
  composeAreaRows,
  filterAreaRows,
  sortAreaRows,
  computeAreaStats,
  buildAreaInventoryCsv,
  composeRows,
  getSizeOrder,
  ALL_AREAS,
  type InventorySortOption,
  type InventoryStockStatusFilter,
} from './inventory/inventoryModel';
import { isCorruptedColorCodeSize } from '../utils/sortUtils';
import {
  useInventoryStock,
  getStockBySku,
  flattenStock,
} from './inventory/useInventoryStock';
import { InventoryList } from './inventory/InventoryList';
import { InventoryDetailDrawer } from './inventory/InventoryDetailDrawer';
import { RackCapacityDashboard } from './inventory/RackCapacityDashboard';
import { StockTakeRecommendationModal } from './inventory/StockTakeRecommendationModal';
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
  onOpenScannerPopup?: () => void;
  initialTab?: InventoryPageTab;
}

const AVAILABLE_AREAS = [
  { id: 'ALL', label: 'Semua Area', mobileLabel: 'Semua' },
  { id: 'Warehouse', label: 'Warehouse', mobileLabel: 'Warehouse' },
  { id: 'Blok F', label: 'Blok F', mobileLabel: 'Blok F' },
  { id: 'Koli', label: 'Koli', mobileLabel: 'Koli' },
  { id: 'Perbaikan', label: 'Perbaikan', mobileLabel: 'Perbaikan' },
  { id: 'Aksesoris', label: 'Aksesoris', mobileLabel: 'Aksesoris' },
  { id: 'Transit', label: 'Transit', mobileLabel: 'Transit' },
];

const SORT_OPTIONS: Array<{ value: InventorySortOption; label: string; shortLabel: string }> = [
  { value: 'NAME_ASC', label: 'Nama Produk A–Z', shortLabel: 'Nama A–Z' },
  { value: 'NAME_DESC', label: 'Nama Produk Z–A', shortLabel: 'Nama Z–A' },
  { value: 'FISIK_DESC', label: 'Fisik Terbanyak', shortLabel: 'Fisik ↓' },
  { value: 'FISIK_ASC', label: 'Fisik Tersedikit', shortLabel: 'Fisik ↑' },
  { value: 'DP_DESC', label: 'DealPOS Terbanyak', shortLabel: 'DP ↓' },
  { value: 'DP_ASC', label: 'DealPOS Tersedikit', shortLabel: 'DP ↑' },
  { value: 'SKU_ASC', label: 'Kode SKU A–Z', shortLabel: 'SKU A–Z' },
  { value: 'SIZE_ASC', label: 'Size Kecil → Besar', shortLabel: 'Size ↑' },
  { value: 'AREA_ASC', label: 'Area A–Z', shortLabel: 'Area A–Z' },
];

const STOCK_STATUS_OPTIONS: Array<{ value: InventoryStockStatusFilter; label: string; shortLabel: string }> = [
  { value: 'ADA_STOK', label: 'Ada Stok (Aktif)', shortLabel: 'Ada Stok' },
  { value: 'FISIK_ONLY', label: 'Fisik di Rak > 0', shortLabel: 'Fisik > 0' },
  { value: 'DP_ONLY', label: 'Ada di DP, Fisik 0', shortLabel: 'DP > 0, Fisik 0' },
  { value: 'STOK_MINUS', label: 'Stok Minus / Anomali', shortLabel: 'Stok Minus' },
  { value: 'ALL', label: 'Semua Master Produk', shortLabel: 'Semua Master' },
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
  onOpenScannerPopup,
  initialTab,
}) => {
  const userIsAdmin = isSuperadmin(session ?? null);
  const canViewInventory = userIsAdmin || hasPermission(session ?? null, 'menu_ops_inventory');
  const canUsePutaway =
    !isStoreAccountSession(session ?? null) &&
    (userIsAdmin ||
      hasPermission(session ?? null, 'menu_ops_putaway') ||
      hasPermission(session ?? null, 'menu_ops_picking'));
  const canViewCapacity = canViewInventory || canUsePutaway;
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
    if (canViewCapacity) return 'capacity';
    if (!canViewInventory && canUseScanner) return 'scanner';
    if (!canViewInventory && canViewLogs) return 'logs';
    return 'capacity';
  });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    const handleOpenInventoryTab = (e: Event) => {
      const targetTab = (e as CustomEvent)?.detail?.tab as InventoryPageTab | undefined;
      if (targetTab) {
        setActiveTab(targetTab);
      }
    };
    window.addEventListener('wms_open_inventory_tab', handleOpenInventoryTab);
    return () => window.removeEventListener('wms_open_inventory_tab', handleOpenInventoryTab);
  }, []);

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
  const [stockStatus, setStockStatus] = useState<InventoryStockStatusFilter>('ADA_STOK');
  const [selectedSize, setSelectedSize] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<InventorySortOption>('NAME_ASC');
  const [isMobileActionsOpen, setIsMobileActionsOpen] = useState(false);

  const hasCustomFilters =
    searchQuery.trim() !== '' ||
    selectedArea !== 'ALL' ||
    stockStatus !== 'ADA_STOK' ||
    selectedSize !== 'ALL' ||
    sortOption !== 'NAME_ASC';

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedArea('ALL');
    setStockStatus('ADA_STOK');
    setSelectedSize('ALL');
    setSortOption('NAME_ASC');
  }, []);

  // 3. Selected SKU for Detail Drawer
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  // 4. Modal Lokasi Export & Print PDF + Stock Take Recommendation
  const [isLokasiExportModalOpen, setIsLokasiExportModalOpen] = useState(false);
  const [selectedExportLocation, setSelectedExportLocation] = useState('CC001');
  const [isStockTakeRecOpen, setIsStockTakeRecOpen] = useState(false);

  useEffect(() => {
    const handleOpenStockTakeRec = () => setIsStockTakeRecOpen(true);
    window.addEventListener('wms_open_stock_take_recommendations', handleOpenStockTakeRec);
    return () => window.removeEventListener('wms_open_stock_take_recommendations', handleOpenStockTakeRec);
  }, []);

  const handleOpenLokasiExport = useCallback((locName?: string) => {
    if (locName) setSelectedExportLocation(locName);
    setIsLokasiExportModalOpen(true);
  }, []);

  useEffect(() => {
    const consumePending = () => {
      const pending = (window as any).__wms_pending_lokasi_export;
      if (pending) {
        delete (window as any).__wms_pending_lokasi_export;
        handleOpenLokasiExport(typeof pending === 'string' ? pending : undefined);
      }
    };
    consumePending();
    const handleEvent = (e: Event) => {
      const loc = (e as CustomEvent<{ lokasi?: string }>)?.detail?.lokasi;
      handleOpenLokasiExport(loc);
    };
    window.addEventListener('wms_open_lokasi_export_modal', handleEvent);
    return () => window.removeEventListener('wms_open_lokasi_export_modal', handleEvent);
  }, [handleOpenLokasiExport]);

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

  // Available clean master sizes for quick size filtering
  const availableSizes = useMemo(() => {
    const sizeCounts = new Map<string, number>();
    for (let i = 0; i < allAreaRows.length; i++) {
      const r = allAreaRows[i];
      if (!r.isFirstOfSku) continue;
      const raw = String(r.size || '').trim().toUpperCase();
      if (!raw || raw === '-' || isCorruptedColorCodeSize(raw)) continue;
      sizeCounts.set(raw, (sizeCounts.get(raw) || 0) + 1);
    }
    return Array.from(sizeCounts.keys()).sort((a, b) => {
      const oa = getSizeOrder(a);
      const ob = getSizeOrder(b);
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b);
    });
  }, [allAreaRows]);

  // Step C: Filter Area Rows
  const filteredAreaRows = useMemo(() => {
    return filterAreaRows(allAreaRows, {
      query: deferredSearch,
      selectedArea,
      stockStatus,
      selectedSize,
    });
  }, [allAreaRows, deferredSearch, selectedArea, stockStatus, selectedSize]);

  // Step D: Sort Area Rows
  const sortedAreaRows = useMemo(() => {
    return sortAreaRows(filteredAreaRows, sortOption);
  }, [filteredAreaRows, sortOption]);

  // Step E: KPI Stats (calculated strictly on filtered physical rows)
  const stats = useMemo(() => {
    return computeAreaStats(filteredAreaRows);
  }, [filteredAreaRows]);

  // For Detail Drawer (only compute 28k SKU composition when a SKU drawer is actually opened)
  const allSkuRows = useMemo(() => {
    if (!selectedSku) return [];
    void stockVersion;
    const map = getStockBySku();
    return composeRows(catalogBases, map);
  }, [selectedSku, catalogBases, stockVersion]);

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

  // Sinkronisasi otomatis saat AI atau sesi lain mengupdate keranjang picking
  useEffect(() => {
    const handleCartSync = () => {
      try {
        const saved = localStorage.getItem('wms_inventory_picking_cart');
        if (saved) setCartItems(JSON.parse(saved));
        else setCartItems([]);
      } catch {}
    };

    window.addEventListener('wms_inventory_cart_updated', handleCartSync);
    window.addEventListener('storage', handleCartSync);

    // Cek jika ada sinyal buka keranjang dari Asisten AI
    if (typeof window !== 'undefined' && (window as any).__wms_open_inventory_cart) {
      delete (window as any).__wms_open_inventory_cart;
      setIsCartDrawerOpen(true);
    }

    return () => {
      window.removeEventListener('wms_inventory_cart_updated', handleCartSync);
      window.removeEventListener('storage', handleCartSync);
    };
  }, []);

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

  // Derived available rows for Quick Search in Cart (only built when cart drawer is open)
  const availableRowsForCart = useMemo(() => {
    if (!isCartDrawerOpen) return [];
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
  }, [isCartDrawerOpen, allAreaRows]);

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
    <div className="w-full max-w-full min-w-0 overflow-x-hidden px-1 sm:px-3 lg:px-4 py-2 sm:py-4 space-y-4 animate-in fade-in duration-150">
      {/* ========================================================
          0. NAVIGATION TABS (4 TABS):
          1. Dashboard Interaktif Kapasitas
          2. Data Inventory Produk
          3. Scanner Barcode
          4. Log Produk
          ======================================================== */}
      <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 sm:p-2 flex flex-col lg:flex-row lg:items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap py-0.5 px-0.5 w-full lg:w-auto">
          {canViewCapacity && (
            <button
              type="button"
              onClick={() => setActiveTab('capacity')}
              className={`px-3 sm:px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'capacity'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Kapasitas</span>
              <span className="hidden sm:inline">Dashboard Interaktif Kapasitas</span>
            </button>
          )}

          {canViewInventory && (
            <button
              type="button"
              id="tab-inventory-3d-visual"
              onClick={() => setActiveTab('visual_3d')}
              className={`px-3 sm:px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'visual_3d'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Box className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Denah 3D</span>
              <span className="hidden sm:inline">3D Visual Kapasitas</span>
            </button>
          )}

          {canViewInventory && (
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`px-3 sm:px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'inventory'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Boxes className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Stok Produk</span>
              <span className="hidden sm:inline">Data Inventory Produk</span>
            </button>
          )}

          {canUseScanner && scannerComponent && (
            <button
              type="button"
              id="tab-inventory-scanner"
              onClick={() => setActiveTab('scanner')}
              className={`px-3 sm:px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'scanner'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ScanBarcode className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Scanner</span>
              <span className="hidden sm:inline">Scanner Barcode</span>
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
              className={`px-3 sm:px-3.5 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'logs'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">Log</span>
              <span className="hidden sm:inline">Log Produk</span>
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

            {onOpenScannerPopup && (
              <button
                type="button"
                onClick={onOpenScannerPopup}
                className="py-1.5 px-3 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-1.5 rounded-lg transition-all cursor-pointer shadow-2xs shrink-0"
                title="Buka di Popup Scanner Luas (Bisa Diminimize Sambil Buka Halaman Lain)"
              >
                <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Popup Luas</span>
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

      {activeTab === 'capacity' && canViewCapacity && (
        <RackCapacityDashboard
          stockRows={flatStockSnapshot}
          productCatalog={productCatalog}
          session={session}
          onNotify={onNotify}
          onOpenPrintModal={handleOpenLokasiExport}
          onRefreshStock={handleManualRefresh}
          onRelocationSuccess={() => reload(true)}
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
              1. OPTIMIZED COMPACT TOOLBAR (Mobile App-Like & Desktop Spreadsheet)
              Kartu Ringkasan KPI ditiadakan (tersedia di tab Kapasitas) agar
              tabel stok produk & kontrol filter/sort langsung tampil optimal.
              ======================================================== */}
          <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-2.5 sm:p-3 shadow-xs space-y-2">
            {/* ROW 1: Search + Desktop Filter/Sort/Actions + Mobile Quick Actions */}
            <div className="flex items-center gap-2">
              {/* Search Input */}
              <div className="relative flex-1 min-w-0 lg:min-w-[260px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="inputSearchInventory"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari produk, SKU, rak..."
                  className="w-full h-9 pl-9 pr-8 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-indigo-500 font-medium transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Bersihkan pencarian"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* DESKTOP INLINE SELECTORS (Status Stok, Size, Sort) */}
              <div className="hidden lg:flex items-center gap-2 shrink-0">
                <select
                  aria-label="Filter Status Stok"
                  value={stockStatus}
                  onChange={(e) => setStockStatus(e.target.value as InventoryStockStatusFilter)}
                  className={`h-9 px-2.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                    stockStatus !== 'ADA_STOK'
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {STOCK_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {availableSizes.length > 0 && (
                  <select
                    aria-label="Filter Size"
                    value={selectedSize}
                    onChange={(e) => setSelectedSize(e.target.value)}
                    className={`h-9 px-2.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      selectedSize !== 'ALL'
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <option value="ALL">Semua Size</option>
                    {availableSizes.map((sz) => (
                      <option key={sz} value={sz}>
                        Size {sz}
                      </option>
                    ))}
                  </select>
                )}

                <div className="relative flex items-center">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <select
                    aria-label="Urutkan Stok Produk"
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as InventorySortOption)}
                    className={`h-9 pl-8 pr-2.5 text-xs font-bold rounded-xl border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                      sortOption !== 'NAME_ASC'
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* DESKTOP ACTION BUTTONS (Anti-Pelangi: Neutral Outlines + Primary Indigo only for active Cart) */}
              <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenLokasiExport()}
                  className="h-9 px-2.5 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Ekspor Data & Cetak PDF per Lokasi Rak"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span className="hidden xl:inline">Lokasi &amp; Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsStockTakeRecOpen(true)}
                  className="h-9 px-2.5 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Rekomendasi Stock Take Ulang & Reset Scan Data"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="hidden xl:inline">Rekomendasi SO</span>
                </button>

                <button
                  type="button"
                  id="btn-inventory-picking-cart"
                  onClick={() => setIsCartDrawerOpen(true)}
                  className={`h-9 px-3 text-xs font-bold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                    cartItems.length > 0
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-600 ring-2 ring-indigo-500/25'
                      : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  }`}
                  title="Buka Keranjang Order Picking"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Keranjang</span>
                  {cartItems.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black font-mono bg-white text-indigo-700">
                      {cartItems.length}
                    </span>
                  )}
                </button>

                {canExportData && (
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="h-9 px-2.5 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Unduh hasil inventori per area sebagai file CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="hidden xl:inline">CSV</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isRefreshing || phase === 'syncing'}
                  onClick={handleManualRefresh}
                  className="h-9 px-2.5 text-xs font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
                  title="Sinkronkan data terbaru dari database"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 ${isRefreshing || phase === 'syncing' ? 'animate-spin text-indigo-500' : ''}`} />
                  <span className="hidden 2xl:inline">
                    {isRefreshing || phase === 'syncing' ? 'Sync...' : 'Refresh'}
                  </span>
                </button>
              </div>

              {/* MOBILE COMPACT ACTION ICONS (< lg) */}
              <div className="flex lg:hidden items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCartDrawerOpen(true)}
                  aria-label="Keranjang Order Picking"
                  className={`relative h-9 w-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                    cartItems.length > 0
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  {cartItems.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9.5px] font-black font-mono flex items-center justify-center shadow-xs">
                      {cartItems.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isRefreshing || phase === 'syncing'}
                  onClick={handleManualRefresh}
                  aria-label="Sinkronkan Data Inventori"
                  className="h-9 w-9 rounded-xl border bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing || phase === 'syncing' ? 'animate-spin text-indigo-500' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => setIsMobileActionsOpen((prev) => !prev)}
                  aria-label="Menu Aksi Inventori"
                  aria-expanded={isMobileActionsOpen}
                  className={`h-9 w-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                    isMobileActionsOpen
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* MOBILE COLLAPSIBLE SECONDARY ACTIONS BAR (Lokasi & Print, Rekomendasi SO, CSV) */}
            {isMobileActionsOpen && (
              <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto no-scrollbar pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileActionsOpen(false);
                    handleOpenLokasiExport();
                  }}
                  className="h-8 px-2.5 text-[11px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Lokasi &amp; Print</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileActionsOpen(false);
                    setIsStockTakeRecOpen(true);
                  }}
                  className="h-8 px-2.5 text-[11px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Rekomendasi SO</span>
                </button>

                {canExportData && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileActionsOpen(false);
                      handleExportCsv();
                    }}
                    className="h-8 px-2.5 text-[11px] font-bold bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Unduh CSV</span>
                  </button>
                )}
              </div>
            )}

            {/* ROW 2: Horizontal Area Filter Pills + Desktop Reset & Count */}
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap flex-1 min-w-0">
                {AVAILABLE_AREAS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedArea(a.id)}
                    className={`px-2.5 py-1 text-[11.5px] sm:text-xs rounded-lg font-bold transition-all cursor-pointer shrink-0 active:scale-95 ${
                      selectedArea === a.id
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-[#0E1420] dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span className="sm:hidden">{a.mobileLabel}</span>
                    <span className="hidden sm:inline">{a.label}</span>
                  </button>
                ))}
              </div>

              {/* Desktop inline reset & filtered count */}
              <div className="hidden lg:flex items-center gap-2 shrink-0">
                {hasCustomFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  <strong className="text-slate-800 dark:text-slate-200">
                    {stats.skuCount.toLocaleString('id-ID')}
                  </strong>{' '}
                  SKU ·{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {sortedAreaRows.length.toLocaleString('id-ID')}
                  </strong>{' '}
                  baris
                </span>
              </div>
            </div>

            {/* ROW 3 (MOBILE ONLY < lg): Horizontal Swipeable Sort + Status Stok + Size + Reset Chips */}
            <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap pt-1 border-t border-slate-100 dark:border-slate-800/80">
              <div className="relative inline-flex items-center shrink-0">
                <ArrowUpDown className="w-3 h-3 text-slate-500 dark:text-slate-400 absolute left-2 pointer-events-none" />
                <select
                  aria-label="Urutkan"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as InventorySortOption)}
                  className={`h-7 pl-6 pr-2 text-[11px] font-bold rounded-lg border appearance-none cursor-pointer focus:outline-none ${
                    sortOption !== 'NAME_ASC'
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                      : 'bg-slate-50 dark:bg-[#0E1420] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.shortLabel}
                    </option>
                  ))}
                </select>
              </div>

              <select
                aria-label="Status Stok"
                value={stockStatus}
                onChange={(e) => setStockStatus(e.target.value as InventoryStockStatusFilter)}
                className={`h-7 px-2 text-[11px] font-bold rounded-lg border shrink-0 cursor-pointer focus:outline-none ${
                  stockStatus !== 'ADA_STOK'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                    : 'bg-slate-50 dark:bg-[#0E1420] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {STOCK_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.shortLabel}
                  </option>
                ))}
              </select>

              {availableSizes.length > 0 && (
                <select
                  aria-label="Filter Size"
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  className={`h-7 px-2 text-[11px] font-bold rounded-lg border shrink-0 cursor-pointer focus:outline-none ${
                    selectedSize !== 'ALL'
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                      : 'bg-slate-50 dark:bg-[#0E1420] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <option value="ALL">Size: Semua</option>
                  {availableSizes.map((sz) => (
                    <option key={sz} value={sz}>
                      Size: {sz}
                    </option>
                  ))}
                </select>
              )}

              {hasCustomFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="h-7 px-2 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 inline-flex items-center gap-1 shrink-0 active:scale-95 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* ========================================================
              2. WARNING / ERROR BANNER
              ======================================================== */}
          {stockError && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 text-xs text-rose-900 dark:text-rose-200 flex items-center justify-between gap-3 shadow-xs">
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
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 shadow-xs">
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
              3. VIRTUALIZED INVENTORY LIST
              ======================================================== */}
          {phase === 'loading' && isEmpty ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl">
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Memuat data inventori dari Supabase &amp; IndexedDB...
              </span>
            </div>
          ) : sortedAreaRows.length === 0 ? (
            <div className="py-14 px-4 text-center space-y-2.5 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl">
              <Boxes className="w-11 h-11 text-slate-300 dark:text-slate-700 mx-auto" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Tidak Ada Produk yang Sesuai Filter
              </div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Coba ubah kata kunci pencarian, status stok, size, atau filter area yang aktif.
              </p>
              {hasCustomFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Semua Filter</span>
                </button>
              )}
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
              resetKey={`${selectedArea}_${deferredSearch}_${stockStatus}_${selectedSize}_${sortOption}`}
            />
          )}

          {/* Subtle Desktop Micro-Caption (Mobile uses InventoryList header bar) */}
          <div className="hidden md:flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>
              Menampilkan{' '}
              <strong className="text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                {stats.skuCount.toLocaleString('id-ID')}
              </strong>{' '}
              SKU (
              <strong className="text-slate-700 dark:text-slate-300 font-mono tabular-nums">
                {sortedAreaRows.length.toLocaleString('id-ID')}
              </strong>{' '}
              baris area) · Klik nama produk untuk detail &amp; riwayat mutasi.
            </span>
            <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-semibold">
              Side-by-Side DP &amp; Fisik
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
        <div className="fixed bottom-36 sm:bottom-40 lg:bottom-5 right-5 sm:right-6 lg:right-52 z-40 animate-in slide-in-from-bottom-4 duration-200">
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

      {/* ========================================================
          10. REKOMENDASI STOCK TAKE ULANG & RESET SCAN DATA MODAL
          ======================================================== */}
      <StockTakeRecommendationModal
        isOpen={isStockTakeRecOpen}
        onClose={() => setIsStockTakeRecOpen(false)}
        productCatalog={productCatalog}
        stockRows={flatStockSnapshot}
        session={session}
        onNotify={onNotify}
        onOpenScanner={() => setActiveTab('scanner')}
      />
    </div>
  );
});

export default InventoryView;
