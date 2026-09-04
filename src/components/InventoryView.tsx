import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import {
  RefreshCw,
  Search,
  Layers,
  MapPin,
  Tag,
  Boxes,
  SlidersHorizontal,
  Loader2,
  Download,
  AlertTriangle,
  FileSpreadsheet,
  X,
  Package,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Filter,
  Check,
  Smartphone,
  Monitor,
  Building,
  Video,
  Wrench,
  Sparkles,
  PieChart as PieChartIcon,
  Shirt,
  Scissors,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';
import { StockRealtimeItem, ProductItem, UserSession } from '../types';
import { saveInventoryStocksToLocalDb, getAllInventoryStocksFromLocalDb } from '../services/localDb';
import {
  fetchAllStockRealtime,
  fetchSupabaseStokFisikDirect,
  fetchSupabaseStokFisikBySkus,
  fetchStockForLocations,
  getAreaFromLokasi,
  getSupabaseClient,
  supabaseFetch,
} from '../services/supabase';
import { globalRealtimeStore } from '../services/store';
import { hasPermission } from '../services/permissions';
import { partialSearchMatch } from '../utils/sortUtils';

// ========================================================
// DEFINISI KONSTANTA KOLOM AREA SESUAI SPESIFIKASI WMS
// ========================================================
export const KOMPARASI_5 = ['MAP', 'LIVE', 'STUDIO', 'PERMAK', 'DEFECT'] as const;
export const OFFLINE_COLS = ['WH', 'QC', 'GA', 'LOG'] as const;
export const STORE_COLS = [
  'LMP', 'MKG', 'BTS', 'CPJ', 'CWS', 'LWS', 'DPM', 'PHB', 'PMS', 'NSJ', 'PIM', 'SPM', 'GAIA', 'GST', 'LVL',
] as const;
export const ONLINE_COLS = ['WEB', 'SHP', 'TPD', 'TTK', 'LZD', 'WOO'] as const;

export type AreaFilterType = 'ALL' | 'GUDANG' | 'STORE' | 'ONLINE' | 'OFFLINE';

export interface NormalizedInventoryItem {
  sku: string;
  produk: string;
  size: string;
  locList: (string | { lokasi: string; qty?: number })[];
  locStr: string;
  komparasi: {
    MAP: { fisik: number; dp: number };
    LIVE: { fisik: number; dp: number };
    STUDIO: { fisik: number; dp: number };
    PERMAK: { fisik: number; dp: number };
    DEFECT: { fisik: number; dp: number };
  };
  singles: { [key: string]: number };
  totalFisikGudang: number;
  totalStore: number;
  totalOnline: number;
  totalOffline: number;
  // Precomputed for ultra-fast sorting and search (avoids localeCompare CPU freeze)
  _s?: string;
  _pLower?: string;
  _skuLower?: string;
  _sizeOrder?: number;
}

export type InventorySortOption =
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'SKU_ASC'
  | 'SKU_DESC'
  | 'STOCK_DESC'
  | 'STOCK_ASC'
  | 'DIFF_DESC'
  | 'DIFF_ASC'
  | 'LOCATION_ASC'
  | 'LOCATION_DESC';

export interface InventoryViewProps {
  session?: UserSession | null;
  currentLocations?: string[];
  productCatalog?: ProductItem[];
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshCatalog?: (forceRefresh?: boolean) => Promise<void> | void;
}

// Modal types for KPI Drill-Down
type KpiModalType = 'CATEGORY' | 'MAP' | 'BLOK_F' | 'PERBAIKAN' | null;

// Module-level in-memory cache to make tab transitions 100% instant (0ms)
let globalInventoryStockCache: StockRealtimeItem[] | null = null;
let globalInventoryLastFetch = 0;
const CACHE_STALE_TTL = 3 * 60 * 1000; // 3 minutes

export const InventoryView: React.FC<InventoryViewProps> = React.memo(({
  session,
  currentLocations = [],
  productCatalog = [],
  onNotify,
  onRefreshCatalog,
}) => {
  // Master state initialized immediately from cache for 0ms page switch
  const [stockList, setStockList] = useState<StockRealtimeItem[]>(() => {
    if (globalInventoryStockCache && globalInventoryStockCache.length > 0) {
      return globalInventoryStockCache;
    }
    try {
      const saved = localStorage.getItem('wms_inventory_stock_cache');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          globalInventoryStockCache = parsed;
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    // Only show full loading if there is zero cached data
    return !globalInventoryStockCache || globalInventoryStockCache.length === 0;
  });
  const [isSyncingBackground, setIsSyncingBackground] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState<boolean>(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState<boolean>(true);

  // View Mode: 'TABLE' (Spreadsheet multi-level) | 'CARD' (Mobile / Grid card) | 'LOCATION' (Per Location) | 'SKU' (Per SKU)
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARD' | 'LOCATION' | 'SKU'>(() => {
    const saved = localStorage.getItem('wms_inventory_view_mode');
    if (saved === 'card') return 'CARD';
    if (saved === 'table') return 'TABLE';
    if (saved === 'LOCATION' || saved === 'SKU') return saved;
    return window.innerWidth <= 768 ? 'CARD' : 'TABLE';
  });

  // Area Filters (Multiselect)
  const [activeAreaFilters, setActiveAreaFilters] = useState<AreaFilterType[]>(() => {
    try {
      const saved = localStorage.getItem('wms_filter_areas_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return ['ALL', 'GUDANG', 'STORE', 'ONLINE', 'OFFLINE'];
  });
  const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState<boolean>(false);
  const areaDropdownRef = useRef<HTMLDivElement>(null);

  // Search, Sort & Pagination
  const [searchQuery, setSearchQuery] = useState<string>('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [sortOption, setSortOption] = useState<InventorySortOption>('NAME_ASC');
  const [onlyWithStock, setOnlyWithStock] = useState<boolean>(false);
  const [displayLimit, setDisplayLimit] = useState<number>(30);
  const RENDER_STEP = 30;

  // KPI Modal Drilldown State
  const [kpiModal, setKpiModal] = useState<KpiModalType>(null);
  const [kpiMapTab, setKpiMapTab] = useState<'ALL' | 'A' | 'B' | 'C' | 'D' | 'BELT' | 'Z'>('ALL');
  const [kpiBlokFTab, setKpiBlokFTab] = useState<'STUDIO' | 'SHOPEE' | 'TIKTOK' | 'ALL'>('STUDIO');
  const [kpiPerbaikanTab, setKpiPerbaikanTab] = useState<'ALL' | 'PERMAK' | 'DEFECT' | 'CUCI'>('ALL');
  const [kpiModalSearch, setKpiModalSearch] = useState<string>('');
  const [modalDisplayLimit, setModalDisplayLimit] = useState<number>(50);

  // Reset modal display limit whenever drilldown filters change
  useEffect(() => {
    setModalDisplayLimit(50);
  }, [kpiModal, kpiMapTab, kpiBlokFTab, kpiPerbaikanTab, kpiModalSearch]);

  const canExportData = hasPermission(session, 'can_export_data');
  const canSyncDealpos = hasPermission(session, 'can_sync_dealpos');

  // Close area dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (areaDropdownRef.current && !areaDropdownRef.current.contains(e.target as Node)) {
        setIsAreaDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Sync viewMode to localStorage
  useEffect(() => {
    localStorage.setItem('wms_inventory_view_mode', viewMode === 'CARD' ? 'card' : 'table');
  }, [viewMode]);

  // Sync activeAreaFilters to localStorage
  useEffect(() => {
    localStorage.setItem('wms_filter_areas_v2', JSON.stringify(activeAreaFilters));
  }, [activeAreaFilters]);

  // ========================================================
  // 1. DATA FETCHING & REALTIME AGGREGATION FROM SUPABASE (STALE-WHILE-REVALIDATE)
  // ========================================================
  const loadStockData = async (isManualRefresh = false, forceNetwork = false) => {
    // If cache is fresh and not a manual/realtime refresh, use memory cache
    const now = Date.now();
    const isCacheFresh = globalInventoryStockCache && globalInventoryStockCache.length > 0 && now - globalInventoryLastFetch < CACHE_STALE_TTL;
    if (!isManualRefresh && !forceNetwork && isCacheFresh) {
      return;
    }

    let hasCachedData = (globalInventoryStockCache && globalInventoryStockCache.length > 0) || stockList.length > 0;
    if (!hasCachedData) {
      try {
        const localStocks = await getAllInventoryStocksFromLocalDb();
        if (localStocks && localStocks.length > 0) {
          globalInventoryStockCache = localStocks;
          globalInventoryLastFetch = Date.now();
          setStockList(localStocks);
          hasCachedData = true;
        }
      } catch {}
    }

    if (!hasCachedData) {
      setIsLoading(true);
    } else {
      setIsSyncingBackground(true);
    }
    setFetchError(null);

    if (isManualRefresh && onNotify) {
      onNotify('Menyinkronkan data inventori terbaru dari Supabase & Katalog...', 'info');
    }

    try {
      // 1. Fetch physical stock rows from Supabase view_stok_realtime (Direct GAS Method)
      const realtimeData = await fetchSupabaseStokFisikDirect(isManualRefresh || forceNetwork);
      if (realtimeData && Array.isArray(realtimeData) && realtimeData.length > 0) {
        globalInventoryStockCache = realtimeData;
        globalInventoryLastFetch = Date.now();
        setStockList(realtimeData);

        // Store snapshot to local IndexedDB (zero truncation limit)
        saveInventoryStocksToLocalDb(realtimeData).catch(() => {});
        try {
          localStorage.setItem('wms_inventory_stock_cache', JSON.stringify(realtimeData.slice(0, 1000)));
        } catch (storageErr) {
          console.warn('Local storage quota full or error:', storageErr);
        }
      }

      if (isManualRefresh) {
        if (onRefreshCatalog) await onRefreshCatalog(true);
        if (onNotify) {
          onNotify(`Inventori berhasil disinkronkan (${realtimeData.length} baris lokasi)!`, 'success');
        }
      }
    } catch (e: any) {
      console.error('Error loading inventory stock:', e);
      // Fallback if direct fetch failed and no cached data exists
      if (!hasCachedData) {
        try {
          const fallbackData = await fetchAllStockRealtime(30000);
          if (fallbackData && fallbackData.length > 0) {
            globalInventoryStockCache = fallbackData;
            globalInventoryLastFetch = Date.now();
            setStockList(fallbackData);
          }
        } catch (err: any) {
          setFetchError(err.message || 'Gagal memuat data stok realtime');
          if (onNotify) onNotify('Gagal memuat data stok realtime.', 'error');
        }
      }
    } finally {
      setIsLoading(false);
      setIsSyncingBackground(false);
    }
  };

  useEffect(() => {
    loadStockData();

    // Supabase Realtime Subscription via global store
    let debounceTimer: any = null;
    let pendingSkus = new Set<string>();

    const updateDeltaStocks = async () => {
      if (pendingSkus.size === 0) return;
      const skus = Array.from(pendingSkus);
      pendingSkus.clear();
      
      try {
        const deltaRows = await fetchSupabaseStokFisikBySkus(skus);
        
        // Remove old rows for these SKUs, insert new ones
        setStockList((prev) => {
          const filtered = prev.filter(p => !skus.includes(p.sku || ''));
          const merged = [...filtered, ...deltaRows];
          globalInventoryStockCache = merged;
          return merged;
        });
      } catch (err) {
        console.warn('Delta stock fetch failed:', err);
      }
    };

    const triggerDebouncedDelta = (payload: any) => {
      if (payload && payload.new && payload.new.sku) {
        pendingSkus.add(payload.new.sku);
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        updateDeltaStocks();
      }, 500);
    };

    const triggerDebouncedReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadStockData(false, true);
      }, 300);
    };

    const unsubLog = globalRealtimeStore.subscribe('log_produk', triggerDebouncedDelta);
    const unsubMaster = globalRealtimeStore.subscribe('master_produk', triggerDebouncedReload);
    const unsubStok = globalRealtimeStore.subscribe('view_stok_realtime', triggerDebouncedDelta);

    setIsRealtimeActive(true);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubLog();
      unsubMaster();
      unsubStok();
    };
  }, []);

  // Helper string formatter for locations
  const formatLocationString = (locList?: (string | { lokasi: string; qty?: number })[]) => {
    if (!Array.isArray(locList) || locList.length === 0) return '-';
    const locParts: string[] = [];
    locList.forEach((l) => {
      if (!l) return;
      if (typeof l === 'object' && l !== null) {
        const name = String(l.lokasi || '').trim();
        const q = Number(l.qty) || 0;
        if (name) locParts.push(q > 0 ? `${name} (${q})` : name);
      } else if (typeof l === 'string') {
        const parts = l.split(':');
        const name = String(parts[0] || '').trim();
        const q = Number(parts[1]) || 0;
        if (name) locParts.push(q > 0 ? `${name} (${q})` : name);
      }
    });
    return locParts.length > 0 ? locParts.join(', ') : '-';
  };

  // ========================================================
  // 2. NORMALISASI & 5-KOMPARASI STOCK AGGREGATION (IDENTIK SCRIPT GAS)
  // ========================================================
  const normalizedInventory = useMemo<NormalizedInventoryItem[]>(() => {
    // A. Build skuStockMap (applyDirectSupabaseStock from GAS script)
    const skuStockMap: Record<
      string,
      {
        f: Record<string, number>;
        l: string[];
        nama_produk?: string;
        size?: string;
      }
    > = {};

    stockList.forEach((sRow) => {
      const sku = String(sRow.sku || '').trim().toUpperCase();
      const lokasi = String(sRow.lokasi || '').trim();
      const area = String(sRow.area || '').trim();
      const qty = Number(sRow.sisa_stok) || 0;
      if (!sku || qty === 0) return;

      if (!skuStockMap[sku]) {
        skuStockMap[sku] = {
          f: {},
          l: [],
          nama_produk: sRow.nama_produk,
          size: sRow.size,
        };
      }

      const a = area.toUpperCase();
      const l = lokasi.toUpperCase();
      let kat = 'Gudang Utama';

      if (a === 'WAREHOUSE' || a.includes('GUDANG') || a.includes('MAP') || a.includes('AKSESORIS') || l.startsWith('BELT')) {
        kat = 'Gudang Utama';
      } else if (
        (a === 'BLOK F' || a.includes('BLOK')) &&
        (l === 'SHOPEE' || l === 'TIKTOK' || l === 'TT' || l === 'LIVE' || l.includes('SHP') || l.includes('TTK'))
      ) {
        kat = 'Barang Live';
      } else if (
        a === 'STUDIO' ||
        a.includes('STUDIO') ||
        ((a === 'BLOK F' || a.includes('BLOK')) && (l === 'STUDIO' || l === 'SAMPLE'))
      ) {
        kat = 'Sample Studio';
      } else if (
        (a === 'PERBAIKAN' || a.includes('PERMAK') || a.includes('CUCI')) &&
        (l.startsWith('PMK') || l.startsWith('CC') || l.includes('PERMAK') || l.includes('CUCI'))
      ) {
        kat = 'Permak / Cuci';
      } else if (
        (a === 'PERBAIKAN' || a.includes('DEFECT') || a.includes('CACAT')) &&
        (l.startsWith('DF') || l.includes('DEFECT') || l.includes('CACAT'))
      ) {
        kat = 'Barang Cacat';
      } else if (a.includes('PERBAIKAN') || a.includes('DEFECT') || a.includes('PERMAK')) {
        if (l.startsWith('PMK') || l.startsWith('CC') || l.includes('CUCI') || l.includes('PERMAK')) {
          kat = 'Permak / Cuci';
        } else {
          kat = 'Barang Cacat';
        }
      } else if (a === 'DEALPOS OFFLINE' && l === 'WH') {
        kat = 'WH';
      } else if (a === 'DEALPOS OFFLINE' && l === 'QC') {
        kat = 'QC';
      } else if (a === 'DEALPOS OFFLINE' && (l === 'DD' || l === 'DEFECT')) {
        kat = 'Barang Cacat';
      } else if (a === 'DEALPOS OFFLINE' && l === 'GA') {
        kat = 'GA';
      } else {
        kat = 'Gudang Utama';
      }

      skuStockMap[sku].f[kat] = (skuStockMap[sku].f[kat] || 0) + qty;
      skuStockMap[sku].l.push(`${lokasi}:${qty}`);
    });

    // B. Merge with catalog list & normalize in single-pass
    const result: NormalizedInventoryItem[] = [];
    const seenSkus = new Set<string>();

    const normalizeRow = (row: any, sku: string, mapped?: any): NormalizedInventoryItem => {
      const f = (row?.f || mapped?.f || {}) as Record<string, number>;
      const dpRaw = (row?.dealpos_channels || {}) as any;
      const d = (row?.d || dpRaw?.d || dpRaw || {}) as Record<string, number>;
      const b = (row?.b || dpRaw?.b || dpRaw?.cabang || dpRaw || {}) as Record<string, number>;

      const mapFisik = Number(f['MAP'] || f['Gudang Utama'] || f['Warehouse'] || 0);
      const mapDp = Number(d['MAP'] || d['Gudang Utama'] || d['Marketplace'] || dpRaw?.MAP || dpRaw?.['Gudang Utama'] || dpRaw?.Marketplace || row?.stokMap || row?.q || 0);

      const liveFisik = Number(f['LIVE'] || f['Barang Live'] || f['Sample Live'] || 0);
      const liveDp = Number(d['LIVE'] || d['Barang Live'] || d['Sample Live'] || dpRaw?.LIVE || dpRaw?.['Barang Live'] || dpRaw?.['Sample Live'] || 0);

      const studioFisik = Number(f['STUDIO'] || f['Sample Studio'] || 0);
      const studioDp = Number(d['STUDIO'] || d['Sample Studio'] || dpRaw?.STUDIO || dpRaw?.['Sample Studio'] || row?.stokStudio || 0);

      const permakFisik = Number(f['PERMAK'] || f['Permak / Cuci'] || f['Permak'] || 0);
      const permakDp = Number(d['PERMAK'] || d['Permak / Cuci'] || d['Permak'] || dpRaw?.PERMAK || dpRaw?.['Permak / Cuci'] || dpRaw?.Permak || 0);

      const defectFisik = Number(f['DEFECT'] || f['Barang Cacat'] || f['Cacat'] || 0);
      const defectDp = Number(d['DEFECT'] || d['Barang Cacat'] || d['Diskon Defect'] || d['Cacat'] || dpRaw?.DEFECT || dpRaw?.['Barang Cacat'] || dpRaw?.['Diskon Defect'] || dpRaw?.Cacat || 0);

      const singleVals: { [key: string]: number } = {};
      [...OFFLINE_COLS, ...STORE_COLS, ...ONLINE_COLS].forEach((code) => {
        singleVals[code] = Number(
          b[code] ||
          d[code] ||
          f[code] ||
          dpRaw?.[code] ||
          dpRaw?.cabang?.[code] ||
          dpRaw?.b?.[code] ||
          0
        );
      });

      const locList = Array.isArray(mapped?.l) ? mapped.l : Array.isArray(row?.l) ? row.l : Array.isArray(row?.locList) ? row.locList : [];
      const locStr = formatLocationString(locList);

      const produk = String(row?.p || row?.produk || row?.nama_produk || mapped?.nama_produk || sku);
      const size = String(row?.s || row?.size || mapped?.size || '-');

      let sTot = 0;
      STORE_COLS.forEach((c) => (sTot += singleVals[c] || 0));

      let onTot = 0;
      ONLINE_COLS.forEach((c) => (onTot += singleVals[c] || 0));

      let offTot = 0;
      OFFLINE_COLS.forEach((c) => (offTot += singleVals[c] || 0));

      const pLower = produk.toLowerCase();
      const skuLower = sku.toLowerCase();
      const sizeLower = size.toLowerCase();
      const locStrLower = locStr.toLowerCase();

      return {
        sku,
        produk,
        size,
        locList,
        locStr,
        komparasi: {
          MAP: { fisik: mapFisik, dp: mapDp },
          LIVE: { fisik: liveFisik, dp: liveDp },
          STUDIO: { fisik: studioFisik, dp: studioDp },
          PERMAK: { fisik: permakFisik, dp: permakDp },
          DEFECT: { fisik: defectFisik, dp: defectDp },
        },
        singles: singleVals,
        totalFisikGudang: mapFisik + liveFisik + studioFisik + permakFisik + defectFisik,
        totalStore: sTot,
        totalOnline: onTot,
        totalOffline: offTot,
        _s: `${pLower} ${skuLower} ${sizeLower} ${locStrLower}`,
        _pLower: pLower,
        _skuLower: skuLower,
        _sizeOrder: getSizeOrder(size),
      };
    };

    productCatalog.forEach((item) => {
      if (!item) return;
      const sku = String(item.k || item.sku || '').trim().toUpperCase();
      if (!sku) return;
      seenSkus.add(sku);
      result.push(normalizeRow(item, sku, skuStockMap[sku]));
    });

    // C. Add extra SKUs present in Supabase stock but not yet in productCatalog
    Object.keys(skuStockMap).forEach((sku) => {
      if (!seenSkus.has(sku)) {
        result.push(normalizeRow(null, sku, skuStockMap[sku]));
      }
    });

    return result;
  }, [productCatalog, stockList]);

  // ========================================================
  // 3. FILTERING & SORTING LOGIC (OPTIMIZED WITH FAST COMPARATORS)
  // ========================================================
  const SIZE_ORDER_MAP: Record<string, number> = {
    'ALL': 0, 'DEFAULT': 1, 'FREE': 2, 'XS': 3, 'S': 4, 'M': 5, 'L': 6, 'XL': 7, 'XXL': 8, '3XL': 9, '4XL': 10
  };

  const getSizeOrder = (size: string): number => {
    const s = String(size || '').toUpperCase();
    return SIZE_ORDER_MAP[s] !== undefined ? SIZE_ORDER_MAP[s] : 99;
  };

  const filteredInventory = useMemo(() => {
    let list = normalizedInventory;

    // Search query filter (ultra-fast precomputed search text)
    if (deferredSearch.trim()) {
      const keywords = deferredSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter((item) => {
        const text = item._s || `${item.produk} ${item.sku} ${item.size} ${item.locStr}`.toLowerCase();
        return keywords.every((kw) => text.includes(kw));
      });
    }

    // Filter only items with physical/channel stock
    if (onlyWithStock) {
      list = list.filter(
        (item) =>
          item.totalFisikGudang > 0 ||
          item.totalStore > 0 ||
          item.totalOnline > 0 ||
          item.totalOffline > 0
      );
    }

    // Fast sort with direct string comparison (0.015s vs 4.5s localeCompare)
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortOption) {
        case 'NAME_ASC': {
          const aP = a._pLower || a.produk.toLowerCase();
          const bP = b._pLower || b.produk.toLowerCase();
          if (aP < bP) return -1;
          if (aP > bP) return 1;
          const sA = a._sizeOrder ?? 99;
          const sB = b._sizeOrder ?? 99;
          if (sA !== sB) return sA - sB;
          const aS = a._skuLower || a.sku.toLowerCase();
          const bS = b._skuLower || b.sku.toLowerCase();
          return aS < bS ? -1 : (aS > bS ? 1 : 0);
        }
        case 'NAME_DESC': {
          const aP = a._pLower || a.produk.toLowerCase();
          const bP = b._pLower || b.produk.toLowerCase();
          if (aP > bP) return -1;
          if (aP < bP) return 1;
          const aS = a._skuLower || a.sku.toLowerCase();
          const bS = b._skuLower || b.sku.toLowerCase();
          return bS < aS ? -1 : (bS > aS ? 1 : 0);
        }
        case 'SKU_ASC': {
          const aS = a._skuLower || a.sku.toLowerCase();
          const bS = b._skuLower || b.sku.toLowerCase();
          return aS < bS ? -1 : (aS > bS ? 1 : 0);
        }
        case 'SKU_DESC': {
          const aS = a._skuLower || a.sku.toLowerCase();
          const bS = b._skuLower || b.sku.toLowerCase();
          return bS < aS ? -1 : (bS > aS ? 1 : 0);
        }
        case 'STOCK_DESC':
          return b.totalFisikGudang - a.totalFisikGudang;
        case 'STOCK_ASC':
          return a.totalFisikGudang - b.totalFisikGudang;
        case 'DIFF_DESC': {
          const diffA = a.totalFisikGudang - (a.komparasi.MAP.dp || 0);
          const diffB = b.totalFisikGudang - (b.komparasi.MAP.dp || 0);
          return diffB - diffA;
        }
        case 'DIFF_ASC': {
          const diffA = a.totalFisikGudang - (a.komparasi.MAP.dp || 0);
          const diffB = b.totalFisikGudang - (b.komparasi.MAP.dp || 0);
          return diffA - diffB;
        }
        default: {
          const aP = a._pLower || a.produk.toLowerCase();
          const bP = b._pLower || b.produk.toLowerCase();
          return aP < bP ? -1 : (aP > bP ? 1 : 0);
        }
      }
    });

    return sorted;
  }, [normalizedInventory, deferredSearch, sortOption, onlyWithStock]);

  const itemsWithStockCount = useMemo(() => {
    return normalizedInventory.filter(
      (item) =>
        item.totalFisikGudang > 0 ||
        item.totalStore > 0 ||
        item.totalOnline > 0 ||
        item.totalOffline > 0
    ).length;
  }, [normalizedInventory]);

  // Baseline KPI calculation (computed once for normalizedInventory)
  const baseKpiStats = useMemo(() => {
    let totalMap = 0;
    let totalBlokF = 0;
    let totalPerbaikan = 0;
    let totalRealFisik = 0;

    for (let i = 0; i < normalizedInventory.length; i++) {
      const it = normalizedInventory[i];
      totalMap += it.komparasi.MAP.fisik || 0;
      totalBlokF += (it.komparasi.STUDIO.fisik || 0) + (it.komparasi.LIVE.fisik || 0);
      totalPerbaikan += (it.komparasi.PERMAK.fisik || 0) + (it.komparasi.DEFECT.fisik || 0);
      totalRealFisik += it.totalFisikGudang || 0;
    }

    return {
      totalSku: normalizedInventory.length,
      totalMap,
      totalBlokF,
      totalPerbaikan,
      totalRealFisik,
    };
  }, [normalizedInventory]);

  // Dynamic KPI Stats (instant for un-filtered, filtered loop only when necessary)
  const kpiStats = useMemo(() => {
    const hasActiveFilter = Boolean(deferredSearch.trim() || onlyWithStock);
    if (!hasActiveFilter) {
      return baseKpiStats;
    }

    let totalMap = 0;
    let totalBlokF = 0;
    let totalPerbaikan = 0;
    let totalRealFisik = 0;

    for (let i = 0; i < filteredInventory.length; i++) {
      const it = filteredInventory[i];
      totalMap += it.komparasi.MAP.fisik || 0;
      totalBlokF += (it.komparasi.STUDIO.fisik || 0) + (it.komparasi.LIVE.fisik || 0);
      totalPerbaikan += (it.komparasi.PERMAK.fisik || 0) + (it.komparasi.DEFECT.fisik || 0);
      totalRealFisik += it.totalFisikGudang || 0;
    }

    return {
      totalSku: filteredInventory.length,
      totalMap,
      totalBlokF,
      totalPerbaikan,
      totalRealFisik,
    };
  }, [baseKpiStats, filteredInventory, deferredSearch, onlyWithStock]);

  // Category detection helper
  const detectKategori = (produkName: string) => {
    const name = String(produkName || '').toUpperCase();
    if (name.includes('DRESS')) return 'Dress';
    if (name.includes('TOP') || name.includes('SHIRT') || name.includes('BLOUSE') || name.includes('KEMEJA') || name.includes('TEE') || name.includes('POLO')) return 'Top';
    if (name.includes('BOTTOM') || name.includes('PANTS') || name.includes('CELANA') || name.includes('SHORT') || name.includes('CULOTTE')) return 'Bottom';
    if (name.includes('SKIRT') || name.includes('ROK')) return 'Skirt';
    if (name.includes('OUTER') || name.includes('JACKET') || name.includes('COAT') || name.includes('CARDIGAN') || name.includes('BLAZER')) return 'Outer';
    if (name.includes('SET')) return 'Set';
    if (name.includes('BASIC')) return 'Basic';
    if (name.includes('ACC') || name.includes('BAG') || name.includes('BELT') || name.includes('HIJAB') || name.includes('SCARF')) return 'Accessories';
    return 'Lainnya';
  };

  // Classify MAP items (A, B, C, D, BELT, Z)
  const classifyMapItem = (item: NormalizedInventoryItem) => {
    const nama = String(item.produk || '').trim().toLowerCase();
    const sku = String(item.sku || '').trim().toLowerCase();
    const hasZLoc = item.locStr.toUpperCase().includes('Z') || item.locStr.toUpperCase().includes('SLOW');

    if (sku.startsWith('z-') || sku.startsWith('z_') || sku === 'z' || nama.includes('slow moving') || nama.includes('slowmoving') || hasZLoc) {
      return { code: 'Z', label: 'Z. SLOW MOVING', short: 'Z', icon: '⏳', color: 'bg-slate-500 text-white' };
    }
    if (sku.startsWith('ds') || sku.startsWith('sc') || nama.includes('special condition') || nama.includes('clearance') || nama.includes('sale') || sku.includes('sale')) {
      return { code: 'D', label: 'D. SALE', short: 'D', icon: '🏷️', color: 'bg-rose-500 text-white' };
    }
    if (nama.includes('belt') || nama.includes('aksesoris') || nama.includes('accessories') || nama.includes('acc') || nama.includes('bag') || nama.includes('gift') || nama.includes('box') || nama.includes('paperbag') || sku.startsWith('pb-') || sku.startsWith('acc-') || sku.startsWith('blt')) {
      return { code: 'BELT', label: 'BELT (AKSESORIS)', short: 'BELT', icon: '🎀', color: 'bg-purple-500 text-white' };
    }
    if (nama.includes('pants') || nama.includes('skirt') || nama.includes('skort') || nama.includes('culotte') || nama.includes('shorts') || nama.includes('bottom') || nama.includes('jeans') || nama.includes('trouser') || nama.includes('celana') || nama.includes('rok') || nama.includes('kulot') || nama.includes('legging')) {
      return { code: 'B', label: 'B. BOTTOM', short: 'B', icon: '👖', color: 'bg-blue-500 text-white' };
    }
    if (nama.includes('dress') || nama.includes('jumpsuit') || nama.includes('one set') || nama.includes('oneset') || nama.includes('set') || nama.includes('romper') || nama.includes('gown') || nama.includes('maxi') || nama.includes('midi')) {
      return { code: 'A', label: 'A. DRESS', short: 'A', icon: '👗', color: 'bg-amber-500 text-white' };
    }
    return { code: 'C', label: 'C. TOP', short: 'C', icon: '👚', color: 'bg-emerald-500 text-white' };
  };

  // ========================================================
  // 5. AREA CHECKBOX TOGGLE HANDLERS
  // ========================================================
  const handleAreaToggle = (code: AreaFilterType) => {
    if (code === 'ALL') {
      if (activeAreaFilters.includes('ALL')) {
        setActiveAreaFilters(['GUDANG']);
      } else {
        setActiveAreaFilters(['ALL', 'GUDANG', 'STORE', 'ONLINE', 'OFFLINE']);
      }
    } else {
      let next: AreaFilterType[] = activeAreaFilters.filter((x) => x !== 'ALL');
      if (next.includes(code)) {
        next = next.filter((x) => x !== code);
      } else {
        next.push(code);
      }

      if (next.length === 0) {
        next = ['ALL', 'GUDANG', 'STORE', 'ONLINE', 'OFFLINE'];
      } else if (next.includes('GUDANG') && next.includes('STORE') && next.includes('ONLINE') && next.includes('OFFLINE')) {
        next = ['ALL', 'GUDANG', 'STORE', 'ONLINE', 'OFFLINE'];
      }
      setActiveAreaFilters(next);
    }
  };

  const isAreaActive = (code: AreaFilterType) => {
    return (
      activeAreaFilters.includes('ALL') ||
      activeAreaFilters.includes(code)
    );
  };

  // Area Label Text
  const areaLabelText = useMemo(() => {
    if (activeAreaFilters.includes('ALL') || (isAreaActive('GUDANG') && isAreaActive('STORE') && isAreaActive('ONLINE') && isAreaActive('OFFLINE'))) {
      return 'SEMUA AREA';
    }
    const names: string[] = [];
    if (activeAreaFilters.includes('GUDANG')) names.push('GUDANG');
    if (activeAreaFilters.includes('STORE')) names.push('STORE');
    if (activeAreaFilters.includes('ONLINE')) names.push('ONLINE');
    if (activeAreaFilters.includes('OFFLINE')) names.push('OFFLINE');
    if (names.length === 1) return names[0];
    return `${names.join(', ')} (${names.length})`;
  }, [activeAreaFilters]);

  // ========================================================
  // 6. CSV EXPORT FULL & MODAL
  // ========================================================
  const handleExportFullCSV = () => {
    if (!filteredInventory.length) {
      if (onNotify) onNotify('Tidak ada data produk yang bisa diekspor.', 'warning');
      return;
    }

    const showGudang = isAreaActive('GUDANG');
    const showOffline = isAreaActive('OFFLINE');
    const showStore = isAreaActive('STORE');
    const showOnline = isAreaActive('ONLINE');

    const headers: string[] = ['PRODUK', 'SIZE', 'CODE', 'STOK_REAL_FISIK', 'SELISIH_MAP', 'LOKASI_RAK'];
    if (showGudang) {
      KOMPARASI_5.forEach((k) => {
        headers.push(`${k}_FISIK`, `${k}_DP`);
      });
    }
    if (showOffline) OFFLINE_COLS.forEach((c) => headers.push(c));
    if (showStore) STORE_COLS.forEach((c) => headers.push(c));
    if (showOnline) ONLINE_COLS.forEach((c) => headers.push(c));

    const rows = filteredInventory.map((item) => {
      const diff = item.totalFisikGudang - (item.komparasi.MAP.dp || 0);
      const row: (string | number)[] = [
        `"${(item.produk || '').replace(/"/g, '""')}"`,
        `"${(item.size || '-').replace(/"/g, '""')}"`,
        `"${(item.sku || '').replace(/"/g, '""')}"`,
        item.totalFisikGudang,
        diff,
        `"${(item.locStr || '-').replace(/"/g, '""')}"`,
      ];

      if (showGudang) {
        KOMPARASI_5.forEach((k) => {
          const kd = item.komparasi[k] || { fisik: 0, dp: 0 };
          row.push(kd.fisik, kd.dp);
        });
      }
      if (showOffline) OFFLINE_COLS.forEach((c) => row.push(item.singles[c] || 0));
      if (showStore) STORE_COLS.forEach((c) => row.push(item.singles[c] || 0));
      if (showOnline) ONLINE_COLS.forEach((c) => row.push(item.singles[c] || 0));

      return row.join(',');
    });

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `WMS_INVENTORY_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onNotify) onNotify(`File CSV Inventory berhasil diunduh (${filteredInventory.length} SKU)!`, 'success');
  };

  const handleExportModalCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent = '\uFEFF' + headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',') + '\n' +
      rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (onNotify) onNotify(`Data ${filename} berhasil diekspor!`, 'success');
  };

  // Header column toggle sort helper
  const handleToggleColumnSort = (column: 'NAME' | 'SKU' | 'STOCK' | 'DIFF') => {
    switch (column) {
      case 'NAME':
        setSortOption((prev) => (prev === 'NAME_ASC' ? 'NAME_DESC' : 'NAME_ASC'));
        break;
      case 'SKU':
        setSortOption((prev) => (prev === 'SKU_ASC' ? 'SKU_DESC' : 'SKU_ASC'));
        break;
      case 'STOCK':
        setSortOption((prev) => (prev === 'STOCK_DESC' ? 'STOCK_ASC' : 'STOCK_DESC'));
        break;
      case 'DIFF':
        setSortOption((prev) => (prev === 'DIFF_DESC' ? 'DIFF_ASC' : 'DIFF_DESC'));
        break;
    }
  };

  // ========================================================
  // 7. RENDER VIEW: UNIFIED MULTI-LEVEL SPREADSHEET TABLE
  // ========================================================
  const renderUnifiedTableView = () => {
    const showGudang = isAreaActive('GUDANG');
    const showOffline = isAreaActive('OFFLINE');
    const showStore = isAreaActive('STORE');
    const showOnline = isAreaActive('ONLINE');

    let totalWidth = 260 + 55 + 130 + 90 + 75;
    if (showGudang) totalWidth += 5 * 88;
    if (showOffline) totalWidth += OFFLINE_COLS.length * 44;
    if (showStore) totalWidth += STORE_COLS.length * 44;
    if (showOnline) totalWidth += ONLINE_COLS.length * 44;

    const itemsToRender = filteredInventory.slice(0, displayLimit);

    return (
      <div className="overflow-x-auto max-h-[68vh] border border-slate-200 dark:border-slate-800 rounded-2xl relative shadow-xs">
        <table className="w-full text-left text-xs border-collapse font-sans" style={{ minWidth: `${totalWidth}px` }}>
          <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#121824] text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[10px] font-bold border-b border-slate-200 dark:border-slate-800 shadow-xs">
            {/* Top Header Row */}
            <tr>
              <th rowSpan={2} className="p-3 w-[260px] min-w-[260px] border-r border-slate-200 dark:border-slate-800 align-middle">
                <button
                  type="button"
                  onClick={() => handleToggleColumnSort('NAME')}
                  className="flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 font-extrabold uppercase"
                >
                  <span>PRODUK &amp; LOKASI</span>
                  {sortOption === 'NAME_ASC' ? (
                    <ArrowUp className="w-3 h-3 text-amber-500" />
                  ) : sortOption === 'NAME_DESC' ? (
                    <ArrowDown className="w-3 h-3 text-amber-500" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  )}
                </button>
              </th>
              <th rowSpan={2} className="p-2.5 w-[55px] min-w-[55px] text-center border-r border-slate-200 dark:border-slate-800 align-middle">
                SIZE
              </th>
              <th rowSpan={2} className="p-3 w-[130px] min-w-[130px] border-r border-slate-200 dark:border-slate-800 align-middle">
                <button
                  type="button"
                  onClick={() => handleToggleColumnSort('SKU')}
                  className="flex items-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 font-extrabold uppercase"
                >
                  <span>CODE (SKU)</span>
                  {sortOption === 'SKU_ASC' ? (
                    <ArrowUp className="w-3 h-3 text-amber-500" />
                  ) : sortOption === 'SKU_DESC' ? (
                    <ArrowDown className="w-3 h-3 text-amber-500" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  )}
                </button>
              </th>

              {/* STOK REAL (TOTAL FISIK GUDANG) */}
              <th
                rowSpan={2}
                className="p-2.5 w-[90px] min-w-[90px] text-center border-r border-slate-200 dark:border-slate-800 align-middle bg-amber-500/10 dark:bg-amber-500/20"
              >
                <button
                  type="button"
                  onClick={() => handleToggleColumnSort('STOCK')}
                  className="w-full flex items-center justify-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 font-black text-[10.5px] text-amber-800 dark:text-amber-300 uppercase tracking-tight"
                  title="Klik untuk mengurutkan berdasarkan Total Stok Real Fisik Gudang"
                >
                  <span>STOK REAL</span>
                  {sortOption === 'STOCK_ASC' ? (
                    <ArrowUp className="w-3 h-3 text-amber-500" />
                  ) : sortOption === 'STOCK_DESC' ? (
                    <ArrowDown className="w-3 h-3 text-amber-500" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  )}
                </button>
              </th>

              {/* SELISIH REAL VS MAP DP */}
              <th
                rowSpan={2}
                className="p-2 w-[75px] min-w-[75px] text-center border-r border-slate-200 dark:border-slate-800 align-middle"
              >
                <button
                  type="button"
                  onClick={() => handleToggleColumnSort('DIFF')}
                  className="w-full flex items-center justify-center gap-1 hover:text-amber-600 dark:hover:text-amber-400 font-black text-[10px] text-slate-700 dark:text-slate-300 uppercase tracking-tight"
                  title="Klik untuk mengurutkan berdasarkan Selisih (Total Stok Real Fisik vs DP MAP)"
                >
                  <span>SELISIH</span>
                  {sortOption === 'DIFF_ASC' ? (
                    <ArrowUp className="w-3 h-3 text-amber-500" />
                  ) : sortOption === 'DIFF_DESC' ? (
                    <ArrowDown className="w-3 h-3 text-amber-500" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  )}
                </button>
              </th>

              {showGudang &&
                KOMPARASI_5.map((k) => (
                  <th
                    key={k}
                    colSpan={2}
                    className="p-1.5 text-center border-r border-slate-200 dark:border-slate-800 font-black text-slate-800 dark:text-slate-100 bg-amber-500/5 dark:bg-amber-500/10"
                  >
                    {k}
                  </th>
                ))}

              {showOffline && (
                <th
                  colSpan={OFFLINE_COLS.length}
                  className="p-1.5 text-center border-r border-slate-200 dark:border-slate-800 font-black text-slate-800 dark:text-slate-100 bg-slate-500/5 dark:bg-slate-500/10"
                >
                  OFFLINE
                </th>
              )}

              {showStore && (
                <th
                  colSpan={STORE_COLS.length}
                  className="p-1.5 text-center border-r border-slate-200 dark:border-slate-800 font-black text-slate-800 dark:text-slate-100 bg-blue-500/5 dark:bg-blue-500/10"
                >
                  STORE (15 CABANG)
                </th>
              )}

              {showOnline && (
                <th
                  colSpan={ONLINE_COLS.length}
                  className="p-1.5 text-center border-r border-slate-200 dark:border-slate-800 font-black text-slate-800 dark:text-slate-100 bg-emerald-500/5 dark:bg-emerald-500/10"
                >
                  ONLINE
                </th>
              )}
            </tr>

            {/* Sub Header Row for Fisik vs DP */}
            <tr className="border-t border-slate-200/80 dark:border-slate-800/80 text-[9.5px]">
              {showGudang &&
                KOMPARASI_5.map((k) => (
                  <React.Fragment key={`${k}-sub`}>
                    <th className="p-1 text-center w-[44px] text-amber-600 dark:text-amber-400 font-black border-r border-slate-200 dark:border-slate-800 bg-amber-500/5">
                      FISIK
                    </th>
                    <th className="p-1 text-center w-[44px] text-slate-500 font-medium border-r border-slate-200 dark:border-slate-800">
                      DP
                    </th>
                  </React.Fragment>
                ))}

              {showOffline &&
                OFFLINE_COLS.map((c) => (
                  <th key={c} className="p-1 text-center w-[44px] border-r border-slate-200 dark:border-slate-800 font-bold">
                    {c}
                  </th>
                ))}

              {showStore &&
                STORE_COLS.map((c) => (
                  <th key={c} className="p-1 text-center w-[44px] border-r border-slate-200 dark:border-slate-800 font-bold">
                    {c}
                  </th>
                ))}

              {showOnline &&
                ONLINE_COLS.map((c) => (
                  <th key={c} className="p-1 text-center w-[44px] border-r border-slate-200 dark:border-slate-800 font-bold">
                    {c}
                  </th>
                ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#0E1420]">
            {itemsToRender.map((item, idx) => {
              const displaySize = item.size && item.size.toUpperCase() !== 'DEFAULT' ? item.size : 'ALL';
              return (
                <tr key={`${item.sku}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-[#161F30] transition-colors">
                  {/* Produk & Lokasi */}
                  <td className="p-3 border-r border-slate-100 dark:border-slate-800/60 max-w-[260px]">
                    <div className="font-bold text-slate-900 dark:text-slate-100 text-xs leading-snug break-words">
                      {item.produk}
                    </div>
                    {item.locStr && item.locStr !== '-' && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.locList.map((loc, lIdx) => {
                          const lStr = typeof loc === 'object' && loc !== null ? `${loc.lokasi}${loc.qty ? ` (${loc.qty})` : ''}` : String(loc);
                          return (
                            <span
                              key={lIdx}
                              className="text-[9.5px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded font-mono border border-slate-200 dark:border-slate-700 inline-flex items-center gap-0.5"
                            >
                              📍 {lStr}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>

                  {/* Size */}
                  <td className="p-2 text-center border-r border-slate-100 dark:border-slate-800/60">
                    <span className="inline-block px-1.5 py-0.5 rounded font-mono text-[10.5px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {displaySize}
                    </span>
                  </td>

                  {/* SKU / Code */}
                  <td className="p-3 border-r border-slate-100 dark:border-slate-800/60">
                    <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800/70 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-slate-700/60">
                      {item.sku}
                    </span>
                  </td>

                  {/* Total Stok Real Fisik Gudang */}
                  <td className="p-2 text-center border-r border-slate-100 dark:border-slate-800/60 bg-amber-500/5 dark:bg-amber-500/10">
                    {item.totalFisikGudang > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black font-mono bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                        {item.totalFisikGudang.toLocaleString('id-ID')}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 text-[10px]">0</span>
                    )}
                  </td>

                  {/* Selisih: Total Fisik vs MAP DealPOS */}
                  <td className="p-2 text-center border-r border-slate-100 dark:border-slate-800/60 font-mono text-xs">
                    {(() => {
                      const mapDp = item.komparasi.MAP.dp || 0;
                      const diff = item.totalFisikGudang - mapDp;
                      if (item.totalFisikGudang === 0 && mapDp === 0) {
                        return <span className="text-slate-300 dark:text-slate-600 text-[10px]">0</span>;
                      }
                      if (diff === 0) {
                        return (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" title="Stok Fisik Sesuai dengan Sistem DealPOS">
                            ✓ 0
                          </span>
                        );
                      }
                      if (diff > 0) {
                        return (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" title={`Stok Fisik Lebih Banyak (+${diff})`}>
                            +{diff}
                          </span>
                        );
                      }
                      return (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-black text-rose-600 dark:text-rose-400 bg-rose-500/10" title={`Stok Fisik Kurang (${diff})`}>
                          {diff}
                        </span>
                      );
                    })()}
                  </td>

                  {/* 5 Komparasi: MAP, LIVE, STUDIO, PERMAK, DEFECT */}
                  {showGudang &&
                    KOMPARASI_5.map((k) => {
                      const kd = item.komparasi[k] || { fisik: 0, dp: 0 };
                      return (
                        <React.Fragment key={`${k}-val`}>
                          <td className="p-2 text-center border-r border-slate-100 dark:border-slate-800/60">
                            {kd.fisik > 0 ? (
                              <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400">
                                {kd.fisik}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-[10px]">·</span>
                            )}
                          </td>
                          <td className="p-2 text-center border-r border-slate-100 dark:border-slate-800/60">
                            {kd.dp > 0 ? (
                              <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                                {kd.dp}
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-[10px]">·</span>
                            )}
                          </td>
                        </React.Fragment>
                      );
                    })}

                  {/* Offline Columns */}
                  {showOffline &&
                    OFFLINE_COLS.map((c) => {
                      const val = item.singles[c] || 0;
                      return (
                        <td key={c} className="p-2 text-center border-r border-slate-100 dark:border-slate-800/60 font-mono text-xs">
                          {val > 0 ? <span className="font-bold text-slate-800 dark:text-slate-200">{val}</span> : <span className="text-slate-300 dark:text-slate-600 text-[10px]">·</span>}
                        </td>
                      );
                    })}

                  {/* Store Columns */}
                  {showStore &&
                    STORE_COLS.map((c) => {
                      const val = item.singles[c] || 0;
                      return (
                        <td key={c} className="p-2 text-center border-r border-slate-100 dark:border-slate-800/60 font-mono text-xs">
                          {val > 0 ? <span className="font-bold text-blue-600 dark:text-blue-400">{val}</span> : <span className="text-slate-300 dark:text-slate-600 text-[10px]">·</span>}
                        </td>
                      );
                    })}

                  {/* Online Columns */}
                  {showOnline &&
                    ONLINE_COLS.map((c) => {
                      const val = item.singles[c] || 0;
                      return (
                        <td key={c} className="p-2 text-center border-r border-slate-100 dark:border-slate-800/60 font-mono text-xs">
                          {val > 0 ? <span className="font-bold text-emerald-600 dark:text-emerald-400">{val}</span> : <span className="text-slate-300 dark:text-slate-600 text-[10px]">·</span>}
                        </td>
                      );
                    })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ========================================================
  // 8. RENDER VIEW: MOBILE CARD VIEW
  // ========================================================
  const renderCardView = () => {
    const showGudang = isAreaActive('GUDANG');
    const showOffline = isAreaActive('OFFLINE');
    const showStore = isAreaActive('STORE');
    const showOnline = isAreaActive('ONLINE');

    const itemsToRender = filteredInventory.slice(0, displayLimit);

    return (
      <div className="space-y-3">
        {itemsToRender.map((item, idx) => {
          const displaySize = item.size && item.size.toUpperCase() !== 'DEFAULT' ? item.size : 'ALL';
          const totalStoreQty = item.totalStore + item.totalOffline + item.totalOnline;

          return (
            <div
              key={`${item.sku}_${idx}`}
              className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-xs hover:border-amber-500/40 transition-all space-y-3"
            >
              {/* Card Header: Product name, size & Stok Real */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                    {item.produk}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                      {item.sku}
                    </span>
                    {item.locStr && item.locStr !== '-' && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-0.5">
                        📍 {item.locStr}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="text-[9px] font-black text-amber-600 dark:text-amber-400 uppercase">STOK REAL</div>
                    <div className="px-2 py-0.5 rounded-full font-mono text-xs font-black bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      {item.totalFisikGudang} <span className="text-[10px] font-normal">pcs</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded font-mono text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {displaySize}
                  </span>
                </div>
              </div>

              {/* 5-Komparasi Mini Boxes (Gudang Utama) */}
              {showGudang && (
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Stok Gudang Utama (Fisik vs DP)</span>
                    <span className="text-amber-500 font-mono font-bold">
                      Total: {item.totalFisikGudang} Pcs
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {KOMPARASI_5.map((k) => {
                      const kd = item.komparasi[k] || { fisik: 0, dp: 0 };
                      return (
                        <div
                          key={k}
                          className="bg-slate-50 dark:bg-[#0E1420] border border-slate-200/80 dark:border-slate-800 rounded-lg p-1 text-center"
                        >
                          <div className="text-[9px] font-extrabold text-slate-500 uppercase">{k}</div>
                          <div className="text-[10px] flex items-center justify-between px-1 mt-0.5">
                            <span className="text-[8px] text-slate-400">F:</span>
                            <span className="font-mono font-extrabold text-amber-600 dark:text-amber-400">
                              {kd.fisik > 0 ? kd.fisik : '·'}
                            </span>
                          </div>
                          <div className="text-[10px] flex items-center justify-between px-1">
                            <span className="text-[8px] text-slate-400">DP:</span>
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                              {kd.dp > 0 ? kd.dp : '·'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Collapsible details for Store & Online */}
              {(showOffline || showStore || showOnline) && (
                <details className="group border-t border-slate-100 dark:border-slate-800/80 pt-2 text-xs">
                  <summary className="flex items-center justify-between cursor-pointer list-none text-slate-500 hover:text-amber-500 font-bold text-[11px] py-1">
                    <span className="flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5" />
                      <span>Cabang, Store &amp; Online</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono text-[10px]">
                      {totalStoreQty} Pcs ▾
                    </span>
                  </summary>

                  <div className="pt-2 space-y-2">
                    {showOffline && (
                      <div>
                        <div className="text-[9.5px] font-bold text-slate-400 uppercase mb-1">Offline Dept</div>
                        <div className="flex flex-wrap gap-1">
                          {OFFLINE_COLS.map((c) => {
                            const val = item.singles[c] || 0;
                            return (
                              <span
                                key={c}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                                  val > 0
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white border-slate-300'
                                    : 'bg-slate-50 dark:bg-slate-900/40 text-slate-400 border-slate-200 dark:border-slate-800'
                                }`}
                              >
                                {c}: {val > 0 ? val : '·'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {showStore && (
                      <div>
                        <div className="text-[9.5px] font-bold text-slate-400 uppercase mb-1">Store Cabang (15)</div>
                        <div className="flex flex-wrap gap-1">
                          {STORE_COLS.map((c) => {
                            const val = item.singles[c] || 0;
                            return (
                              <span
                                key={c}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                                  val > 0
                                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                                    : 'bg-slate-50 dark:bg-slate-900/40 text-slate-400 border-slate-200 dark:border-slate-800'
                                }`}
                              >
                                {c}: {val > 0 ? val : '·'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {showOnline && (
                      <div>
                        <div className="text-[9.5px] font-bold text-slate-400 uppercase mb-1">Online Marketplace</div>
                        <div className="flex flex-wrap gap-1">
                          {ONLINE_COLS.map((c) => {
                            const val = item.singles[c] || 0;
                            return (
                              <span
                                key={c}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                                  val > 0
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                    : 'bg-slate-50 dark:bg-slate-900/40 text-slate-400 border-slate-200 dark:border-slate-800'
                                }`}
                              >
                                {c}: {val > 0 ? val : '·'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div id="inventoryViewContainer" className="space-y-4 max-w-7xl mx-auto pb-16">
      {/* ========================================================
          1. TOP KPI STAT CARDS (4-GRID DENGAN INTERACTIVE MODAL)
          ======================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: TOTAL SKU */}
        <div
          onClick={() => setKpiModal('CATEGORY')}
          className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:border-amber-500/40 hover:-translate-y-0.5 transition-all cursor-pointer relative overflow-hidden group"
          title="Klik untuk melihat diagram kategori produk"
        >
          <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-500" />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                TOTAL SKU PRODUK
              </span>
              <div className="text-lg sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono">
                {kpiStats.totalSku.toLocaleString('id-ID')}
              </div>
              <span className="text-[10px] text-slate-400 block truncate">Katalog terdaftar &amp; aktif</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg shrink-0 group-hover:scale-110 transition-transform">
              📦
            </div>
          </div>
        </div>

        {/* KPI 2: TOTAL STOK REAL (MAP + KANAL FISIK) */}
        <div
          onClick={() => setKpiModal('MAP')}
          className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:border-emerald-500/40 hover:-translate-y-0.5 transition-all cursor-pointer relative overflow-hidden group"
          title="Klik untuk melihat rincian stok MAP & kanal fisik"
        >
          <div className="absolute top-0 left-0 bottom-0 w-1 bg-emerald-500" />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                TOTAL STOK REAL
              </span>
              <div className="text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                {kpiStats.totalRealFisik.toLocaleString('id-ID')} <span className="text-xs font-normal">pcs</span>
              </div>
              <span className="text-[10px] text-slate-400 block truncate">
                MAP: {kpiStats.totalMap.toLocaleString('id-ID')} pcs · Klik rincian
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg shrink-0 group-hover:scale-110 transition-transform">
              🏢
            </div>
          </div>
        </div>

        {/* KPI 3: STOK BLOK F */}
        <div
          onClick={() => setKpiModal('BLOK_F')}
          className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:border-blue-500/40 hover:-translate-y-0.5 transition-all cursor-pointer relative overflow-hidden group"
          title="Klik untuk melihat stok Studio, Shopee & TikTok"
        >
          <div className="absolute top-0 left-0 bottom-0 w-1 bg-blue-500" />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                STOK BLOK F
              </span>
              <div className="text-lg sm:text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
                {kpiStats.totalBlokF.toLocaleString('id-ID')} <span className="text-xs font-normal">pcs</span>
              </div>
              <span className="text-[10px] text-slate-400 block truncate">Sample Live &amp; Studio</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-lg shrink-0 group-hover:scale-110 transition-transform">
              🎥
            </div>
          </div>
        </div>

        {/* KPI 4: STOK PERBAIKAN */}
        <div
          onClick={() => setKpiModal('PERBAIKAN')}
          className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-3.5 sm:p-4.5 shadow-xs hover:border-rose-500/40 hover:-translate-y-0.5 transition-all cursor-pointer relative overflow-hidden group"
          title="Klik untuk melihat daftar antrean Permak & Defect"
        >
          <div className="absolute top-0 left-0 bottom-0 w-1 bg-rose-500" />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] sm:text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                STOK PERBAIKAN
              </span>
              <div className="text-lg sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
                {kpiStats.totalPerbaikan.toLocaleString('id-ID')} <span className="text-xs font-normal">pcs</span>
              </div>
              <span className="text-[10px] text-slate-400 block truncate">Permak &amp; Barang Defect</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center text-lg shrink-0 group-hover:scale-110 transition-transform">
              🛠️
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          2. MAIN TOOLBAR & CONTROLS (SEARCH, AREA MULTISELECT, VIEW TABS)
          ======================================================== */}
      <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[200px]">
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* ADA STOK FILTER TOGGLE */}
            <button
              type="button"
              id="btnFilterOnlyWithStock"
              onClick={() => setOnlyWithStock(!onlyWithStock)}
              className={`px-3 py-2 text-xs font-extrabold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                onlyWithStock
                  ? 'bg-amber-500 text-black border-amber-500 shadow-xs'
                  : 'bg-slate-50 dark:bg-[#0E1420] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
              }`}
              title={onlyWithStock ? 'Menampilkan HANYA produk yang memiliki stok. Klik untuk menampilkan semua katalog.' : 'Klik untuk memfilter hanya produk yang memiliki stok'}
            >
              <span>📦</span>
              <span className="hidden sm:inline">ADA STOK</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${onlyWithStock ? 'bg-black/20 text-black font-black' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                {itemsWithStockCount.toLocaleString('id-ID')}
              </span>
            </button>

            {/* MULTISELECT FILTER AREA DROPDOWN */}
            <div className="relative" ref={areaDropdownRef}>
              <button
                type="button"
                id="btnFilterArea"
                onClick={() => setIsAreaDropdownOpen(!isAreaDropdownOpen)}
                className="px-3 py-2 text-xs font-extrabold bg-slate-50 dark:bg-[#0E1420] hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-800 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                title="Pilih area kolom data yang ingin ditampilkan"
              >
                <Filter className="w-3.5 h-3.5" />
                <span className="truncate max-w-[130px]">{areaLabelText}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {isAreaDropdownOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-50 p-2 text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    Kolom Area Ditampilkan
                  </div>
                  <label
                    onClick={() => handleAreaToggle('ALL')}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer font-bold text-slate-800 dark:text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={activeAreaFilters.includes('ALL')}
                      onChange={() => {}}
                      className="rounded text-amber-500 accent-amber-500"
                    />
                    <span>SEMUA AREA</span>
                  </label>
                  <label
                    onClick={() => handleAreaToggle('GUDANG')}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={isAreaActive('GUDANG')}
                      onChange={() => {}}
                      className="rounded text-amber-500 accent-amber-500"
                    />
                    <span>GUDANG UTAMA (5 KOMPARASI)</span>
                  </label>
                  <label
                    onClick={() => handleAreaToggle('STORE')}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={isAreaActive('STORE')}
                      onChange={() => {}}
                      className="rounded text-amber-500 accent-amber-500"
                    />
                    <span>STORE (15 CABANG)</span>
                  </label>
                  <label
                    onClick={() => handleAreaToggle('ONLINE')}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={isAreaActive('ONLINE')}
                      onChange={() => {}}
                      className="rounded text-amber-500 accent-amber-500"
                    />
                    <span>ONLINE (MARKETPLACE)</span>
                  </label>
                  <label
                    onClick={() => handleAreaToggle('OFFLINE')}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer text-slate-700 dark:text-slate-300"
                  >
                    <input
                      type="checkbox"
                      checked={isAreaActive('OFFLINE')}
                      onChange={() => {}}
                      className="rounded text-amber-500 accent-amber-500"
                    />
                    <span>OFFLINE (WH/QC/GA/LOG)</span>
                  </label>
                </div>
              )}
            </div>

            {/* REALTIME STATUS BADGE */}
            <span
              className={`px-2.5 py-1.5 text-[11px] font-extrabold rounded-xl border flex items-center gap-1.5 ${
                isRealtimeActive
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              }`}
              title="Realtime sync otomatis Supabase aktif"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline">REALTIME SYNC</span>
            </span>

            {/* VIEW MODE TOGGLE BUTTON */}
            <button
              type="button"
              id="btnToggleViewMode"
              onClick={() => setViewMode(viewMode === 'CARD' ? 'TABLE' : 'CARD')}
              className="px-3 py-2 text-xs font-extrabold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              title={viewMode === 'CARD' ? 'Ganti ke Mode Tabel Spreadsheet' : 'Ganti ke Mode Kartu Seluler'}
            >
              {viewMode === 'CARD' ? (
                <>
                  <Monitor className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">MODE TABEL</span>
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">MODE KARTU</span>
                </>
              )}
            </button>

            {/* REFRESH BUTTON */}
            <button
              type="button"
              disabled={isLoading || isSyncingBackground}
              onClick={() => loadStockData(true)}
              className="px-3 py-2 text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-black rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Perbarui Data Inventori dari Database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isSyncingBackground ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isSyncingBackground ? 'SYNCING...' : 'REFRESH'}
              </span>
            </button>

            {/* CSV EXPORT */}
            {canExportData && (
              <button
                type="button"
                onClick={handleExportFullCSV}
                className="px-3 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                title="Unduh CSV Inventory Lengkap"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* Info bar: Total filtered vs total */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div>
              Menampilkan <b className="text-slate-800 dark:text-slate-200">{Math.min(displayLimit, filteredInventory.length)}</b> dari{' '}
              <b className="text-amber-500">{filteredInventory.length}</b> Produk
            </div>
            <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md font-sans">
              💾 100% Tersimpan di DB Lokal ({productCatalog.length.toLocaleString('id-ID')} SKU)
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <span>
              MAP Fisik: <b className="text-emerald-500 font-bold">{kpiStats.totalMap} pcs</b>
            </span>
            <span>&bull;</span>
            <span>
              Blok F: <b className="text-blue-500 font-bold">{kpiStats.totalBlokF} pcs</b>
            </span>
            <span>&bull;</span>
            <span>
              Perbaikan: <b className="text-rose-500 font-bold">{kpiStats.totalPerbaikan} pcs</b>
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================
          3. MAIN DATA SECTION (TABLE vs CARD RENDER)
          ======================================================== */}
      {isLoading && stockList.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
            Memuat inventori langsung dari Supabase...
          </span>
        </div>
      ) : filteredInventory.length === 0 ? (
        <div className="py-16 text-center space-y-2 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl">
          <Boxes className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Tidak Ada Produk yang Sesuai Filter
          </div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Coba gunakan kata kunci pencarian lain atau aktifkan area kolom lainnya.
          </p>
        </div>
      ) : viewMode === 'CARD' ? (
        renderCardView()
      ) : (
        renderUnifiedTableView()
      )}

      {/* Pagination Load More */}
      {filteredInventory.length > displayLimit && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-3 pb-1">
          <button
            type="button"
            onClick={() => setDisplayLimit((prev) => prev + RENDER_STEP)}
            className="px-5 py-2 text-xs font-extrabold bg-white dark:bg-[#161F30] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-xl transition-all shadow-xs cursor-pointer"
          >
            ⬇️ Tampilkan +{RENDER_STEP} Produk (Sisa {filteredInventory.length - displayLimit})
          </button>
          {filteredInventory.length - displayLimit > 50 && (
            <button
              type="button"
              onClick={() => setDisplayLimit((prev) => Math.min(prev + 100, filteredInventory.length))}
              className="px-5 py-2 text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all shadow-xs cursor-pointer"
            >
              ⚡ Tampilkan +100 Produk
            </button>
          )}
          {displayLimit > 30 && (
            <button
              type="button"
              onClick={() => setDisplayLimit(30)}
              className="px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800/80 rounded-xl transition-all cursor-pointer"
            >
              Tampilkan 30 Saja (Mode Ringan)
            </button>
          )}
        </div>
      )}

      {/* ========================================================
          4. INTERACTIVE KPI DRILL-DOWN MODALS
          ======================================================== */}
      {kpiModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setKpiModal(null);
          }}
        >
          <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {kpiModal === 'CATEGORY' ? '📦' : kpiModal === 'MAP' ? '🏢' : kpiModal === 'BLOK_F' ? '🎥' : '🛠️'}
                </span>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 uppercase">
                  {kpiModal === 'CATEGORY'
                    ? 'Total SKU Berdasarkan Kategori'
                    : kpiModal === 'MAP'
                    ? 'Stok Fisik MAP (Gudang Utama)'
                    : kpiModal === 'BLOK_F'
                    ? 'Stok Tersedia di Blok F'
                    : 'Stok Perbaikan (Permak & Defect)'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setKpiModal(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {/* MODAL 1: KATEGORI DOUGHNUT BREAKDOWN */}
              {kpiModal === 'CATEGORY' && (
                (() => {
                  const katMap: Record<string, number> = {};
                  normalizedInventory.forEach((it) => {
                    const kat = detectKategori(it.produk);
                    katMap[kat] = (katMap[kat] || 0) + 1;
                  });
                  const sortedKats = Object.keys(katMap).sort((a, b) => katMap[b] - katMap[a]);
                  const total = normalizedInventory.length || 1;

                  const colors = [
                    'bg-amber-500 text-amber-500',
                    'bg-emerald-500 text-emerald-500',
                    'bg-blue-500 text-blue-500',
                    'bg-rose-500 text-rose-500',
                    'bg-purple-500 text-purple-500',
                    'bg-pink-500 text-pink-500',
                    'bg-teal-500 text-teal-500',
                    'bg-cyan-500 text-cyan-500',
                    'bg-slate-500 text-slate-500',
                  ];

                  return (
                    <div className="space-y-4">
                      {/* Doughnut Chart Progress Visual */}
                      <div className="p-4 bg-slate-50 dark:bg-[#0E1420] rounded-2xl border border-slate-200/80 dark:border-slate-800">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                          <span>Distribusi Kategori Master Produk</span>
                          <span className="font-mono">{total} Total SKU</span>
                        </div>
                        <div className="h-4 w-full flex rounded-full overflow-hidden gap-0.5">
                          {sortedKats.map((k, idx) => {
                            const count = katMap[k];
                            const pct = ((count / total) * 100).toFixed(1);
                            const colClass = colors[idx % colors.length].split(' ')[0];
                            return (
                              <div
                                key={k}
                                style={{ width: `${pct}%` }}
                                title={`${k}: ${count} SKU (${pct}%)`}
                                className={`${colClass} h-full transition-all`}
                              />
                            );
                          })}
                        </div>
                      </div>

                      {/* List Table */}
                      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 dark:bg-[#0E1420] text-[10px] font-extrabold uppercase text-slate-500">
                            <tr>
                              <th className="p-3">Kategori</th>
                              <th className="p-3 text-center">Jumlah SKU</th>
                              <th className="p-3 text-right">Persentase</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                            {sortedKats.map((k, idx) => {
                              const count = katMap[k];
                              const pct = ((count / total) * 100).toFixed(1);
                              const colClass = colors[idx % colors.length].split(' ')[0];
                              return (
                                <tr key={k} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="p-3 flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                                    <span className={`w-2.5 h-2.5 rounded-full ${colClass}`} />
                                    <span>{k}</span>
                                  </td>
                                  <td className="p-3 text-center font-mono font-extrabold text-amber-600 dark:text-amber-400">
                                    {count} SKU
                                  </td>
                                  <td className="p-3 text-right font-mono font-bold text-slate-500">
                                    {pct}%
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* MODAL 2: STOK MAP DRILLDOWN (A/B/C/D/BELT/Z) */}
              {kpiModal === 'MAP' && (
                (() => {
                  let list = normalizedInventory
                    .filter((p) => (p.komparasi.MAP.fisik || 0) > 0)
                    .map((p) => ({ ...p, kat: classifyMapItem(p) }));

                  if (kpiMapTab !== 'ALL') {
                    list = list.filter((p) => p.kat.code === kpiMapTab);
                  }
                  if (kpiModalSearch.trim()) {
                    list = list.filter((p) =>
                      partialSearchMatch(kpiModalSearch, p.produk, p.sku, p.size, p.kat.label, p.locStr)
                    );
                  }

                  const totalPcs = list.reduce((sum, it) => sum + it.komparasi.MAP.fisik, 0);

                  return (
                    <div className="space-y-3">
                      {/* Segmented Tabs */}
                      <div className="flex gap-1.5 overflow-x-auto p-1 bg-slate-100 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold">
                        {(
                          [
                            { id: 'ALL', label: '🌐 SEMUA' },
                            { id: 'A', label: '👗 A. DRESS' },
                            { id: 'B', label: '👖 B. BOTTOM' },
                            { id: 'C', label: '👚 C. TOP' },
                            { id: 'D', label: '🏷️ D. SALE' },
                            { id: 'BELT', label: '🎀 BELT' },
                            { id: 'Z', label: '⏳ Z. SLOW' },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setKpiMapTab(tab.id)}
                            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                              kpiMapTab === tab.id
                                ? 'bg-amber-500 text-black font-extrabold shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Search & Export */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={kpiModalSearch}
                          onChange={(e) => setKpiModalSearch(e.target.value)}
                          placeholder="🔍 Cari Produk / SKU / Lokasi..."
                          className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const headers = ['PRODUK', 'SIZE', 'SKU', 'KATEGORI', 'LOKASI / RAK', 'QTY MAP'];
                            const rows = list.map((it) => [
                              it.produk,
                              it.size,
                              it.sku,
                              it.kat.label,
                              it.locStr || '-',
                              it.komparasi.MAP.fisik,
                            ]);
                            handleExportModalCSV(`stok_map_${kpiMapTab}`, headers, rows);
                          }}
                          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Export CSV</span>
                        </button>
                      </div>

                      {/* Table */}
                      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-[360px] overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 dark:bg-[#0E1420] text-[10px] font-extrabold uppercase text-slate-500 sticky top-0">
                            <tr>
                              <th className="p-2.5">Produk</th>
                              <th className="p-2.5 text-center">Size</th>
                              <th className="p-2.5">SKU</th>
                              <th className="p-2.5 text-center">Kategori</th>
                              <th className="p-2.5 text-right">Qty MAP</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {list.slice(0, modalDisplayLimit).map((it, idx) => (
                              <tr key={`${it.sku}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">
                                  {it.produk}
                                  {it.locStr !== '-' && <div className="text-[10px] text-emerald-600 font-mono font-normal">📍 {it.locStr}</div>}
                                </td>
                                <td className="p-2.5 text-center">
                                  <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 font-mono text-[10px] font-bold rounded">
                                    {it.size}
                                  </span>
                                </td>
                                <td className="p-2.5 font-mono text-slate-500">{it.sku}</td>
                                <td className="p-2.5 text-center">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${it.kat.color}`}>
                                    {it.kat.short}
                                  </span>
                                </td>
                                <td className="p-2.5 text-right font-mono font-extrabold text-amber-600 dark:text-amber-400">
                                  {it.komparasi.MAP.fisik}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {list.length > modalDisplayLimit && (
                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={() => setModalDisplayLimit((prev) => prev + 50)}
                            className="px-4 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all cursor-pointer shadow-xs"
                          >
                            ⬇️ Tampilkan +50 Produk (Sisa {list.length - modalDisplayLimit})
                          </button>
                        </div>
                      )}

                      <div className="text-right text-[11px] text-slate-500 font-mono">
                        Total: <b className="text-slate-800 dark:text-slate-200">{list.length} SKU</b> &bull;{' '}
                        <b className="text-amber-500">{totalPcs} Pcs</b> Fisik MAP
                      </div>
                    </div>
                  );
                })()
              )}

              {/* MODAL 3: STOK BLOK F (STUDIO / SHOPEE / TIKTOK / ALL) */}
              {kpiModal === 'BLOK_F' && (
                (() => {
                  let list = normalizedInventory
                    .filter((p) => (p.komparasi.STUDIO.fisik || 0) + (p.komparasi.LIVE.fisik || 0) > 0)
                    .map((p) => {
                      const studioQty = p.komparasi.STUDIO.fisik || 0;
                      const shpQty = p.singles['SHP'] || 0;
                      const ttkQty = p.singles['TTK'] || 0;
                      return {
                        ...p,
                        studioQty,
                        shpQty,
                        ttkQty,
                        totalLive: studioQty + (p.komparasi.LIVE.fisik || 0),
                      };
                    });

                  if (kpiBlokFTab === 'STUDIO') list = list.filter((p) => p.studioQty > 0);
                  else if (kpiBlokFTab === 'SHOPEE') list = list.filter((p) => p.shpQty > 0);
                  else if (kpiBlokFTab === 'TIKTOK') list = list.filter((p) => p.ttkQty > 0);

                  if (kpiModalSearch.trim()) {
                    list = list.filter((p) =>
                      partialSearchMatch(kpiModalSearch, p.produk, p.sku, p.size, p.locStr)
                    );
                  }

                  const totalPcs = list.reduce((sum, it) => sum + it.totalLive, 0);

                  return (
                    <div className="space-y-3">
                      <div className="flex gap-1.5 overflow-x-auto p-1 bg-slate-100 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold">
                        {(
                          [
                            { id: 'STUDIO', label: '📍 STUDIO' },
                            { id: 'SHOPEE', label: '🧡 SHOPEE' },
                            { id: 'TIKTOK', label: '🖤 TIKTOK' },
                            { id: 'ALL', label: '🌐 SEMUA' },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setKpiBlokFTab(tab.id)}
                            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                              kpiBlokFTab === tab.id
                                ? 'bg-blue-600 text-white font-extrabold shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={kpiModalSearch}
                          onChange={(e) => setKpiModalSearch(e.target.value)}
                          placeholder="🔍 Cari Produk / SKU..."
                          className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const headers = ['PRODUK', 'SIZE', 'SKU', 'LOKASI', 'STUDIO', 'SHOPEE', 'TIKTOK', 'TOTAL'];
                            const rows = list.map((it) => [
                              it.produk,
                              it.size,
                              it.sku,
                              it.locStr || '-',
                              it.studioQty,
                              it.shpQty,
                              it.ttkQty,
                              it.totalLive,
                            ]);
                            handleExportModalCSV(`stok_blokf_${kpiBlokFTab}`, headers, rows);
                          }}
                          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Export CSV</span>
                        </button>
                      </div>

                      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-[360px] overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 dark:bg-[#0E1420] text-[10px] font-extrabold uppercase text-slate-500 sticky top-0">
                            <tr>
                              <th className="p-2.5">Produk</th>
                              <th className="p-2.5 text-center">Size</th>
                              <th className="p-2.5">SKU</th>
                              <th className="p-2.5 text-center text-emerald-600">Studio</th>
                              <th className="p-2.5 text-center text-amber-600">SHP</th>
                              <th className="p-2.5 text-center text-slate-800 dark:text-slate-200">TTK</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {list.slice(0, modalDisplayLimit).map((it, idx) => (
                              <tr key={`${it.sku}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">
                                  {it.produk}
                                  {it.locStr !== '-' && <div className="text-[10px] text-blue-500 font-mono font-normal">📍 {it.locStr}</div>}
                                </td>
                                <td className="p-2.5 text-center font-mono font-bold text-xs">{it.size}</td>
                                <td className="p-2.5 font-mono text-slate-500">{it.sku}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-emerald-600">{it.studioQty}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-amber-600">{it.shpQty}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-slate-800 dark:text-slate-200">{it.ttkQty}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {list.length > modalDisplayLimit && (
                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={() => setModalDisplayLimit((prev) => prev + 50)}
                            className="px-4 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all cursor-pointer shadow-xs"
                          >
                            ⬇️ Tampilkan +50 Produk (Sisa {list.length - modalDisplayLimit})
                          </button>
                        </div>
                      )}

                      <div className="text-right text-[11px] text-slate-500 font-mono">
                        Total: <b className="text-slate-800 dark:text-slate-200">{list.length} SKU</b> &bull;{' '}
                        <b className="text-blue-500">{totalPcs} Pcs</b> Tersedia di Blok F
                      </div>
                    </div>
                  );
                })()
              )}

              {/* MODAL 4: STOK PERBAIKAN (PERMAK & DEFECT & CUCI) */}
              {kpiModal === 'PERBAIKAN' && (
                (() => {
                  let list = normalizedInventory
                    .filter((p) => (p.komparasi.PERMAK.fisik || 0) + (p.komparasi.DEFECT.fisik || 0) > 0)
                    .map((p) => ({
                      ...p,
                      permakQty: p.komparasi.PERMAK.fisik || 0,
                      defectQty: p.komparasi.DEFECT.fisik || 0,
                      totalPerbaikan: (p.komparasi.PERMAK.fisik || 0) + (p.komparasi.DEFECT.fisik || 0),
                    }));

                  if (kpiPerbaikanTab === 'PERMAK') list = list.filter((p) => p.permakQty > 0);
                  else if (kpiPerbaikanTab === 'DEFECT') list = list.filter((p) => p.defectQty > 0);

                  if (kpiModalSearch.trim()) {
                    list = list.filter((p) =>
                      partialSearchMatch(kpiModalSearch, p.produk, p.sku, p.size, p.locStr)
                    );
                  }

                  const totalPcs = list.reduce((sum, it) => sum + it.totalPerbaikan, 0);

                  return (
                    <div className="space-y-3">
                      <div className="flex gap-1.5 overflow-x-auto p-1 bg-slate-100 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold">
                        {(
                          [
                            { id: 'ALL', label: '🌐 SEMUA' },
                            { id: 'PERMAK', label: '🪡 PERMAK' },
                            { id: 'DEFECT', label: '⚠️ DEFECT' },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setKpiPerbaikanTab(tab.id)}
                            className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                              kpiPerbaikanTab === tab.id
                                ? 'bg-rose-600 text-white font-extrabold shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={kpiModalSearch}
                          onChange={(e) => setKpiModalSearch(e.target.value)}
                          placeholder="🔍 Cari Produk / SKU..."
                          className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-rose-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const headers = ['PRODUK', 'SIZE', 'SKU', 'LOKASI', 'PERMAK', 'DEFECT', 'TOTAL'];
                            const rows = list.map((it) => [
                              it.produk,
                              it.size,
                              it.sku,
                              it.locStr || '-',
                              it.permakQty,
                              it.defectQty,
                              it.totalPerbaikan,
                            ]);
                            handleExportModalCSV(`stok_perbaikan_${kpiPerbaikanTab}`, headers, rows);
                          }}
                          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Export CSV</span>
                        </button>
                      </div>

                      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-[360px] overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 dark:bg-[#0E1420] text-[10px] font-extrabold uppercase text-slate-500 sticky top-0">
                            <tr>
                              <th className="p-2.5">Produk</th>
                              <th className="p-2.5 text-center">Size</th>
                              <th className="p-2.5">SKU</th>
                              <th className="p-2.5 text-center text-amber-600">Permak</th>
                              <th className="p-2.5 text-center text-rose-600">Defect</th>
                              <th className="p-2.5 text-right font-extrabold">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                            {list.slice(0, modalDisplayLimit).map((it, idx) => (
                              <tr key={`${it.sku}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">
                                  {it.produk}
                                  {it.locStr !== '-' && <div className="text-[10px] text-rose-500 font-mono font-normal">📍 {it.locStr}</div>}
                                </td>
                                <td className="p-2.5 text-center font-mono font-bold text-xs">{it.size}</td>
                                <td className="p-2.5 font-mono text-slate-500">{it.sku}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-amber-600">{it.permakQty}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-rose-600">{it.defectQty}</td>
                                <td className="p-2.5 text-right font-mono font-black text-rose-600">{it.totalPerbaikan}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {list.length > modalDisplayLimit && (
                        <div className="flex justify-center pt-1">
                          <button
                            type="button"
                            onClick={() => setModalDisplayLimit((prev) => prev + 50)}
                            className="px-4 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all cursor-pointer shadow-xs"
                          >
                            ⬇️ Tampilkan +50 Produk (Sisa {list.length - modalDisplayLimit})
                          </button>
                        </div>
                      )}

                      <div className="text-right text-[11px] text-slate-500 font-mono">
                        Total: <b className="text-slate-800 dark:text-slate-200">{list.length} SKU</b> &bull;{' '}
                        <b className="text-rose-500">{totalPcs} Pcs</b> Antrean Perbaikan
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
