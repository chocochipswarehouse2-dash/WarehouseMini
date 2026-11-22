import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import {
  RefreshCw,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft, Info,
  SlidersHorizontal,
  Loader2,
  Trash2,
  Edit3,
  Calendar,
  Layers,
  MapPin,
  Tag,
  AlertTriangle,
  CheckCircle2,
  X,
  Plus,
  Save,
  Download,
  FileSpreadsheet,
  Package,
  Smartphone,
  Copy,
  Check,
  User,
  Clock,
  LayoutGrid,
  ClipboardList,
  Monitor,
  MessageSquare,
  Globe,
  MoreHorizontal,
  Table2,
} from 'lucide-react';
import { AppActionSheet } from './common/AppActionSheet';
import { AreaBadge } from './inventory/InventoryList';
import { ProductItem, UserSession, LogProdukItem } from '../types';
import {
  fetchRecentLogs,
  fetchSupabaseStokFisikDirect,
  fetchAllLogs, fetchLogsBySearch,
  getSupabaseClient,
  fetchLogsByInvoice,
  updateLogProdukInvoiceBatch,
  deleteLogProdukItem,
  deleteLogProdukInvoice,
  deleteLogProdukBatch,
  deleteLogProdukByDateRange,
  getAreaFromLokasi,
  supabaseFetch,
} from '../services/supabase';
import { globalRealtimeStore } from '../services/store';
import { showGlobalLoading, hideGlobalLoading } from '../utils/globalLoading';
import { hasPermission, isSuperadmin } from '../services/permissions';
import { partialSearchMatch, cleanProductName, resolveProductName, resolveProductDisplaySize } from '../utils/sortUtils';
import { formatOperatorWithPersonName } from '../utils/userResolver';

interface MutasiLogViewProps {
  session?: UserSession | null;
  productCatalog?: ProductItem[];
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshCatalog?: () => Promise<void> | void;
}

export type ScanSourceFilter = 'ALL' | 'WA' | 'WEB';

export const getLogSource = (item: LogProdukItem): 'WA' | 'WEB' | 'OTHER' => {
  const inv = (item.invoice || '').toUpperCase();
  const op = (item.operator || '').toLowerCase();
  const ket = (item.keterangan || '').toLowerCase();
  
  if (
    inv.startsWith('WA') ||
    op.includes('@g.us') ||
    op.includes('628') ||
    /628\d+/.test(op) ||
    ket.includes('wa') ||
    ket.includes('fonnte')
  ) {
    return 'WA';
  }
  if (
    inv.startsWith('WEB') ||
    op.includes('scannerweb') ||
    op.includes('web') ||
    ket.includes('web') ||
    ket.includes('browser') ||
    op.includes('staging')
  ) {
    return 'WEB';
  }
  return 'OTHER';
};

interface EditableLogItem {
  id: string | number;
  merged_ids?: (string | number)[];
  type: string;
  sku: string;
  nama_produk: string;
  size: string;
  lokasi: string;
  area: string;
  qty: number | string;
  keterangan: string;
}

export interface ConsolidatedLogItem extends LogProdukItem {
  merged_ids?: (string | number)[];
  raw_count?: number;
  total_qty?: number;
  is_merged?: boolean;
  stok_saat_itu?: number;
}

export const MutasiLogView: React.FC<MutasiLogViewProps> = React.memo(({
  session,
  productCatalog = [],
  onNotify,
  onRefreshCatalog,
}) => {
  const [logs, setLogs] = useState<LogProdukItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilters, setTypeFilters] = useState<string[]>(['ALL']);
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [sourceFilter, setSourceFilter] = useState<ScanSourceFilter>('ALL');
  const [viewDateFilter, setViewDateFilter] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [displayLimit, setDisplayLimit] = useState(30);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [actionSheetLog, setActionSheetLog] = useState<ConsolidatedLogItem | null>(null);
  const [isToolbarMenuOpen, setIsToolbarMenuOpen] = useState(false);

  // Debounce search input by 180ms to keep input instant and 60fps smooth
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // View Mode: 'CARD' (Mobile / Smartphone optimized) | 'TABLE' (Spreadsheet multi-column)
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARD'>(() => {
    try {
      const isMobileScreen = typeof window !== 'undefined' && window.innerWidth <= 768;
      const saved = localStorage.getItem('wms_mutasi_view_mode');
      if (saved === 'TABLE' || saved === 'CARD') return saved;
      if (isMobileScreen) return 'CARD';
    } catch {}
    return typeof window !== 'undefined' && window.innerWidth <= 768 ? 'CARD' : 'TABLE';
  });

  const [copiedInvoice, setCopiedInvoice] = useState<string | null>(null);

  const handleToggleViewMode = (mode: 'TABLE' | 'CARD') => {
    setViewMode(mode);
    try {
      localStorage.setItem('wms_mutasi_view_mode', mode);
    } catch {}
  };

  const handleCopyInvoice = (inv: string) => {
    if (!inv || inv === '-') return;
    try {
      navigator.clipboard.writeText(inv);
      setCopiedInvoice(inv);
      setTimeout(() => setCopiedInvoice(null), 1800);
      if (onNotify) onNotify(`Nomor invoice ${inv} berhasil disalin ke clipboard!`, 'info');
    } catch {}
  };

  // Bulk Delete State
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [isBulkMenuOpen, setIsBulkMenuOpen] = useState(false);
  const [dateFilterModal, setDateFilterModal] = useState<{ isOpen: boolean; start: string; end: string }>({ isOpen: false, start: '', end: '' });

  // Edit Invoice Modal State
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);
  const [editInvoiceItems, setEditInvoiceItems] = useState<EditableLogItem[]>([]);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Mode Ringkas Baku (Always Enabled as Standard WMS View)
  const isConsolidatedMode = true;

  // Live Physical Stock Map (SKU + Lokasi -> sisa_stok)
  const [physicalStockMap, setPhysicalStockMap] = useState<Map<string, number>>(new Map());

  const loadPhysicalStocks = async () => {
    try {
      const stocks = await fetchSupabaseStokFisikDirect();
      const map = new Map<string, number>();
      if (stocks && Array.isArray(stocks)) {
        for (let i = 0; i < stocks.length; i++) {
          const s = stocks[i];
          const skuKey = (s.sku || '').toUpperCase().trim();
          const locKey = (s.lokasi || 'Warehouse').toUpperCase().trim();
          const key = `${skuKey}__${locKey}`;
          map.set(key, (map.get(key) || 0) + (Number(s.sisa_stok) || 0));
        }
      }
      setPhysicalStockMap(map);
      return map;
    } catch (err) {
      console.warn('Gagal memuat physicalStockMap:', err);
      return new Map<string, number>();
    }
  };

  // Active filter counter (excluding default settings)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (sourceFilter !== 'ALL') count++;
    if (!typeFilters.includes('ALL') && typeFilters.length > 0) count++;
    if (areaFilter !== 'ALL') count++;
    if (viewDateFilter.start || viewDateFilter.end) count++;
    return count;
  }, [sourceFilter, typeFilters, areaFilter, viewDateFilter]);

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSourceFilter('ALL');
    setTypeFilters(['ALL']);
    setAreaFilter('ALL');
    setViewDateFilter({ start: '', end: '' });
    if (onNotify) onNotify('Filter telah direset ke bawaan.', 'info');
  };

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const canExportData = hasPermission(session, 'action_export_data');
  const userIsAdmin = isSuperadmin(session);

  // Map product catalog for fast SKU lookups
  const catalogMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    for (const p of productCatalog) {
      if (p && p.k) {
        map.set(p.k.toUpperCase().trim(), p);
      }
    }
    return map;
  }, [productCatalog]);

  // Load all logs and physical stock concurrently from Database
  const loadLogs = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [data] = await Promise.all([
        fetchRecentLogs(5000),
        loadPhysicalStocks().catch(() => new Map())
      ]);
      const filtered = (data || []).filter(
        (item) => item && String(item.type) !== 'QC_INSPEKSI' && !String(item.type || '').startsWith('QC_')
      );
      // Deduplicate by ID
      const unique = Array.from(
        new Map(filtered.map((item) => [item.id || `${item.invoice}_${item.sku}_${item.created_at}`, item])).values()
      );
      setLogs(unique);
    } catch (e: any) {
      console.error('Error loading logs:', e);
      setFetchError(e.message || 'Gagal memuat log mutasi dari Database');
      if (onNotify) onNotify('Gagal memuat mutasi log.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Force full reload: fetch fresh data from database
   */
  const forceReloadLogs = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [data] = await Promise.all([
        fetchRecentLogs(5000),
        loadPhysicalStocks().catch(() => new Map())
      ]);
      const filtered = (data || []).filter(
        (item) => item && String(item.type) !== 'QC_INSPEKSI' && !String(item.type || '').startsWith('QC_')
      );
      const unique = Array.from(
        new Map(filtered.map((item) => [item.id || `${item.invoice}_${item.sku}_${item.created_at}`, item])).values()
      );
      setLogs(unique);
      if (onNotify) onNotify(`Muat ulang penuh selesai — ${unique.length} baris dimuat.`, 'success');
    } catch (e: any) {
      console.error('Error force reloading logs:', e);
      setFetchError(e.message || 'Gagal memuat ulang penuh');
      if (onNotify) onNotify('Gagal muat ulang penuh.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const [isServerSearching, setIsServerSearching] = useState(false);

  const handleServerSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsServerSearching(true);
    try {
      const q = searchQuery.trim().toLowerCase();
      const matchingSkus = (productCatalog || [])
        .filter(p => (p.k && p.k.toLowerCase().includes(q)) || (p.n && p.n.toLowerCase().includes(q)))
        .map(p => p.k);

      const data = await fetchLogsBySearch(searchQuery.trim(), 2000, matchingSkus);
      const filteredData = (data || []).filter(
        (item) => item && String(item.type) !== 'QC_INSPEKSI' && !String(item.type || '').startsWith('QC_')
      );
      if (filteredData && filteredData.length > 0) {
        // Reset type, area, and source filters if active to ensure search results are immediately visible
        if (!typeFilters.includes('ALL') || areaFilter !== 'ALL' || sourceFilter !== 'ALL') {
          setTypeFilters(['ALL']);
          setAreaFilter('ALL');
          setSourceFilter('ALL');
        }
        // Merge with existing logs and deduplicate
        const merged = [...logs, ...filteredData];
        const unique = Array.from(
          new Map(merged.map((item) => [item.id || `${item.invoice}_${item.sku}_${item.created_at}`, item])).values()
        );
        // Sort descending by created_at
        unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setLogs(unique);
        if (onNotify) onNotify(`Ditemukan ${filteredData.length} hasil pencarian dari database.`, 'success');
      } else {
        if (onNotify) onNotify('Tidak ditemukan hasil tambahan di database untuk kata kunci ini.', 'info');
      }
    } catch (err) {
      console.error(err);
      if (onNotify) onNotify('Gagal mencari di server.', 'error');
    } finally {
      setIsServerSearching(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Calculate Source Counts
  const sourceCounts = useMemo(() => {
    let wa = 0;
    let web = 0;
    let other = 0;
    logs.forEach((item) => {
      const src = getLogSource(item);
      if (src === 'WA') wa++;
      else if (src === 'WEB') web++;
      else other++;
    });
    return {
      all: logs.length,
      wa,
      web,
      other,
    };
  }, [logs]);

  // Reset pagination displayLimit to 30 when filters or search change so DOM stays fast
  useEffect(() => {
    setDisplayLimit(30);
  }, [debouncedSearch, sourceFilter, typeFilters, areaFilter, viewDateFilter]);

  // Filtered logs using zero-overhead short-circuit evaluation (0ms on initial open, <1ms on search)
  const filteredLogs = useMemo(() => {
    const query = debouncedSearch.toLowerCase().trim();
    const keywords = query ? query.split(/\s+/).filter(Boolean) : [];
    const hasKeywords = keywords.length > 0;
    const hasDateStart = Boolean(viewDateFilter.start);
    const hasDateEnd = Boolean(viewDateFilter.end);
    const hasSource = sourceFilter !== 'ALL';
    const hasType = !typeFilters.includes('ALL') && typeFilters.length > 0;
    const hasArea = areaFilter !== 'ALL';

    // Fast path: when no filters or search are active, return logs directly with zero processing
    if (!hasKeywords && !hasDateStart && !hasDateEnd && !hasSource && !hasType && !hasArea) {
      return logs;
    }

    const areaFilterUpper = hasArea ? areaFilter.toUpperCase() : '';
    const result: LogProdukItem[] = [];

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];

      // Ignore QC inspections or non-inventory logs
      if (String(log.type) === 'QC_INSPEKSI' || String(log.type || '').startsWith('QC_')) continue;

      // View Date Filter
      if (hasDateStart || hasDateEnd) {
        const logDateStr = log.created_at
          ? log.created_at.includes('T')
            ? log.created_at.split('T')[0]
            : log.created_at.substring(0, 10)
          : '';
        if (logDateStr) {
          if (hasDateStart && logDateStr < viewDateFilter.start) continue;
          if (hasDateEnd && logDateStr > viewDateFilter.end) continue;
        }
      }

      // Source Filter (Scan via WA vs Scan via Web App)
      if (hasSource) {
        const src = getLogSource(log);
        if (sourceFilter === 'WA' && src !== 'WA') continue;
        if (sourceFilter === 'WEB' && src !== 'WEB') continue;
      }

      // Type Filter
      if (hasType && !typeFilters.includes(log.type)) continue;

      // Area Filter
      if (hasArea) {
        const itemArea = getAreaFromLokasi(log.lokasi || '', log.area).toUpperCase();
        if (!itemArea.includes(areaFilterUpper)) continue;
      }

      // Search Query: short-circuit field-by-field check without string concatenation or heavy catalog resolution
      if (hasKeywords) {
        let allMatched = true;
        let itemCatLookedUp = false;
        let catNameLower = '';

        for (let k = 0; k < keywords.length; k++) {
          const kw = keywords[k];
          if (
            (log.sku && log.sku.toLowerCase().includes(kw)) ||
            (log.invoice && log.invoice.toLowerCase().includes(kw)) ||
            (log.lokasi && log.lokasi.toLowerCase().includes(kw)) ||
            (log.nama_produk && log.nama_produk.toLowerCase().includes(kw)) ||
            (log.operator && log.operator.toLowerCase().includes(kw)) ||
            (log.keterangan && log.keterangan.toLowerCase().includes(kw)) ||
            (log.area && log.area.toLowerCase().includes(kw)) ||
            (log.type && log.type.toLowerCase().includes(kw)) ||
            (log.size && log.size.toLowerCase().includes(kw))
          ) {
            continue;
          }

          if (!itemCatLookedUp) {
            itemCatLookedUp = true;
            const cat = catalogMap.get((log.sku || '').toUpperCase().trim());
            if (cat) {
              catNameLower = `${cat.n || ''} ${(cat as any).p || ''} ${cat.s || ''}`.toLowerCase();
            }
          }

          if (catNameLower && catNameLower.includes(kw)) {
            continue;
          }

          allMatched = false;
          break;
        }

        if (!allMatched) continue;
      }

      result.push(log);
    }

    return result;
  }, [logs, catalogMap, sourceFilter, typeFilters, areaFilter, debouncedSearch, viewDateFilter]);

  // Pre-calculate running balance (saldo stok saat itu) across historical ledger
  const logStockMap = useMemo(() => {
    const stockAtMoment = new Map<string | number, number>();

    // 1. Group all raw logs by SKU + Lokasi (ordered newest to oldest)
    const logsBySkuLoc = new Map<string, LogProdukItem[]>();
    for (let i = 0; i < logs.length; i++) {
      const item = logs[i];
      const skuKey = (item.sku || '').toUpperCase().trim();
      const locKey = (item.lokasi || 'Warehouse').toUpperCase().trim();
      const groupKey = `${skuKey}__${locKey}`;

      let list = logsBySkuLoc.get(groupKey);
      if (!list) {
        list = [];
        logsBySkuLoc.set(groupKey, list);
      }
      list.push(item);
    }

    // 2. For each SKU + Lokasi, reverse-calculate running balance from live physical stock
    logsBySkuLoc.forEach((list, groupKey) => {
      let running = physicalStockMap.get(groupKey) ?? 0;

      for (let i = 0; i < list.length; i++) {
        const log = list[i];
        const logId = log.id || `${log.invoice}_${log.sku}_${log.created_at}`;

        // The stock at that moment right after this transaction
        stockAtMoment.set(logId, running);

        // Before this mutation occurred, what was the balance?
        const delta = (log.type === 'IN' || log.type === 'ADJ_IN')
          ? (Number(log.qty) || 0)
          : (log.type === 'OUT' || log.type === 'ADJ_OUT')
          ? -(Number(log.qty) || 0)
          : 0;

        running = running - delta;
      }
    });

    return stockAtMoment;
  }, [logs, physicalStockMap]);

  // Display logs: Consolidated (Grouped & Summed by Invoice + Type + SKU + Size + Lokasi) with Stok Saat Itu
  const displayLogs = useMemo<ConsolidatedLogItem[]>(() => {
    // Group by Invoice + Type + SKU + Size + Lokasi
    const map = new Map<string, ConsolidatedLogItem>();

    for (let i = 0; i < filteredLogs.length; i++) {
      const item = filteredLogs[i];
      const invKey = (item.invoice || '').toUpperCase().trim();
      const typeKey = (item.type || 'IN').toUpperCase().trim();
      const skuKey = (item.sku || '').toUpperCase().trim();
      const sizeKey = (item.size || '-').toUpperCase().trim();
      const locKey = (item.lokasi || 'Warehouse').toUpperCase().trim();
      const groupKey = `${invKey}__${typeKey}__${skuKey}__${sizeKey}__${locKey}`;

      const itemQty = Number(item.qty) || 1;
      const itemId = item.id || '';
      const rawLogId = item.id || `${item.invoice}_${item.sku}_${item.created_at}`;
      const stokSaatItu = logStockMap.get(rawLogId) ?? (physicalStockMap.get(`${skuKey}__${locKey}`) ?? 0);

      const existing = map.get(groupKey);
      if (!existing) {
        map.set(groupKey, {
          ...item,
          merged_ids: itemId ? [itemId] : [],
          raw_count: 1,
          total_qty: itemQty,
          qty: itemQty,
          is_merged: false,
          stok_saat_itu: stokSaatItu,
        });
      } else {
        existing.total_qty = (Number(existing.total_qty) || 0) + itemQty;
        existing.qty = existing.total_qty;
        existing.raw_count = (existing.raw_count || 1) + 1;
        existing.is_merged = true;
        if (itemId && existing.merged_ids && !existing.merged_ids.includes(itemId)) {
          existing.merged_ids.push(itemId);
        }
        if (item.keterangan && !existing.keterangan?.includes(item.keterangan)) {
          existing.keterangan = existing.keterangan ? `${existing.keterangan}; ${item.keterangan}` : item.keterangan;
        }
      }
    }

    return Array.from(map.values());
  }, [filteredLogs, logStockMap, physicalStockMap]);

  // Set of all underlying database IDs currently displayed
  const allCurrentIds = useMemo(() => {
    const set = new Set<string | number>();
    displayLogs.forEach((l) => {
      if (l.merged_ids && l.merged_ids.length > 0) {
        l.merged_ids.forEach((id) => set.add(id));
      } else if (l.id) {
        set.add(l.id);
      }
    });
    return set;
  }, [displayLogs]);

  // Unique areas for dropdown
  const uniqueAreas = useMemo(() => {
    const set = new Set<string>(['Warehouse', 'Blok F', 'Kolian', 'Aksesoris', 'Transit', 'Perbaikan', 'Anomali']);
    logs.forEach((it) => {
      const a = getAreaFromLokasi(it.lokasi || '');
      if (a) set.add(a);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Count of logs with anomalous location (e.g. 'Warehouse', '-', or invalid rack code)
  const anomalyLocationCount = useMemo(() => {
    let count = 0;
    logs.forEach((it) => {
      if (getAreaFromLokasi(it.lokasi || '') === 'Anomali') count++;
    });
    return count;
  }, [logs]);

  // Open Edit Modal for an Invoice
  const handleOpenEditInvoice = async (invoice: string) => {
    setEditingInvoice(invoice);
    setIsEditLoading(true);

    try {
      // Fetch fresh items for this invoice or filter from current state
      let invoiceItems = logs.filter((l) => l.invoice === invoice);
      if (!invoiceItems.length) {
        invoiceItems = await fetchLogsByInvoice(invoice);
      }

      // Group and sum items with identical type, SKU, size, and location within this invoice
      const groupMap = new Map<string, EditableLogItem>();

      invoiceItems.forEach((item) => {
        const typeKey = (item.type || 'IN').toUpperCase().trim();
        const skuKey = (item.sku || '').toUpperCase().trim();
        const sizeKey = (item.size || '-').toUpperCase().trim();
        const locKey = (item.lokasi || 'Warehouse').toUpperCase().trim();
        const groupKey = `${typeKey}__${skuKey}__${sizeKey}__${locKey}`;

        const q = Number(item.qty) || 1;
        const itemId = item.id || '';

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            id: itemId,
            merged_ids: itemId ? [itemId] : [],
            type: item.type || 'IN',
            sku: item.sku || '',
            nama_produk: item.nama_produk || '',
            size: item.size || '-',
            lokasi: item.lokasi || 'Warehouse',
            area: getAreaFromLokasi(item.lokasi || 'Warehouse'),
            qty: q,
            keterangan: item.keterangan || '',
          });
        } else {
          const existing = groupMap.get(groupKey)!;
          existing.qty = (Number(existing.qty) || 0) + q;
          if (itemId && existing.merged_ids && !existing.merged_ids.includes(itemId)) {
            existing.merged_ids.push(itemId);
          }
          if (item.keterangan && !existing.keterangan.includes(item.keterangan)) {
            existing.keterangan = existing.keterangan ? `${existing.keterangan}; ${item.keterangan}` : item.keterangan;
          }
        }
      });

      setEditInvoiceItems(Array.from(groupMap.values()));
    } catch (err: any) {
      console.error('Error fetching invoice for edit:', err);
      if (onNotify) onNotify('Gagal memuat detail invoice.', 'error');
    } finally {
      setIsEditLoading(false);
      setIsActionLoading(false);
      hideGlobalLoading();
    }
  };

  // Handle field change in edit modal
  const handleItemFieldChange = (
    index: number,
    field: keyof EditableLogItem,
    value: string | number
  ) => {
    setEditInvoiceItems((prev) => {
      const copy = [...prev];
      const current = { ...copy[index], [field]: value };

      // Auto update product info if SKU changed
      if (field === 'sku') {
        const skuStr = String(value).toUpperCase().trim();
        const matched = catalogMap.get(skuStr);
        if (matched) {
          current.nama_produk = matched.n || current.nama_produk;
          current.size = matched.s || current.size;
        }
      }

      // Auto update area if location changed
      if (field === 'lokasi') {
        current.area = getAreaFromLokasi(String(value).trim());
      }

      copy[index] = current;
      return copy;
    });
  };

  // Save changes to invoice
  const handleSaveInvoiceEdit = async () => {
    if (!editInvoiceItems.length || !editingInvoice) return;

    setIsSavingEdit(true);
    showGlobalLoading('Menyimpan Perubahan...');
    try {
      const cleanedItems = editInvoiceItems.map((item) => ({
        ...item,
        qty: Math.max(1, Number(item.qty) || 1),
      }));

      // 1. Update primary consolidated items in batch
      const res = await updateLogProdukInvoiceBatch(cleanedItems as any);

      // 2. Delete redundant merged row IDs from Supabase if duplicates were combined
      const redundantIds: (string | number)[] = [];
      editInvoiceItems.forEach((item) => {
        if (item.merged_ids && item.merged_ids.length > 1) {
          const extras = item.merged_ids.filter((mId) => String(mId) !== String(item.id));
          redundantIds.push(...extras);
        }
      });

      if (redundantIds.length > 0) {
        try {
          await deleteLogProdukBatch(redundantIds);
        } catch (delErr) {
          console.warn('Error deleting redundant merged rows:', delErr);
        }
      }

      if (res.success) {
        if (onNotify) {
          onNotify(
            `Invoice ${editingInvoice} berhasil diperbarui (${res.count} produk unik disimpan)!`,
            'success'
          );
        }
        setEditingInvoice(null);
        if (onRefreshCatalog) {
          await onRefreshCatalog();
        }
        const freshLogs = await fetchRecentLogs(displayLimit);
        setLogs(freshLogs);
      } else {
        if (onNotify) onNotify(`Gagal menyimpan perubahan: ${res.error}`, 'error');
      }
    } catch (err: any) {
      console.error('Error saving invoice edit:', err);
      if (onNotify) onNotify(`Terjadi kesalahan: ${err.message}`, 'error');
    } finally {
      setIsSavingEdit(false);
      hideGlobalLoading();
    }
  };

  // Delete single item from modal or table
  const handleDeleteSingleItem = (
    id: string | number,
    skuName?: string,
    fromModal = false,
    mergedIds?: (string | number)[]
  ) => {
    const idsToDelete = mergedIds && mergedIds.length > 0 ? mergedIds : [id];
    setConfirmModal({
      title: 'Hapus Item Mutasi Log',
      message: `Hapus baris mutasi ${skuName ? `"${skuName}"` : ''}${idsToDelete.length > 1 ? ` (${idsToDelete.length} baris mutasi tergabung)` : ''} secara permanen dari database Supabase? Tindakan ini akan mempengaruhi perhitungan sisa stok.`,
      confirmLabel: 'Hapus Item',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsActionLoading(true);
        showGlobalLoading('Menghapus log...');

        const prevLogs = [...logs];
        const prevEditItems = [...editInvoiceItems];

        // Optimistic UI updates
        const idsSet = new Set(idsToDelete.map(String));
        setLogs((prev) => prev.filter((it) => !idsSet.has(String(it.id))));
        if (fromModal) {
          setEditInvoiceItems((prev) => prev.filter((it) => !idsSet.has(String(it.id))));
        }

        try {
          let res: { success: boolean; error?: string };
          if (idsToDelete.length > 1) {
            const batchRes = await deleteLogProdukBatch(idsToDelete);
            res = { success: batchRes.success, error: batchRes.error };
          } else {
            res = await deleteLogProdukItem(id);
          }

          if (res.success) {
            if (onNotify) onNotify('Item mutasi log berhasil dihapus.', 'info');
          } else {
            if (onNotify) onNotify(`Gagal menghapus item: ${res.error}`, 'error');
            setLogs(prevLogs);
            if (fromModal) setEditInvoiceItems(prevEditItems);
          }
        } catch (err: any) {
          if (onNotify) onNotify(`Error: ${err.message}`, 'error');
          setLogs(prevLogs);
          if (fromModal) setEditInvoiceItems(prevEditItems);
        } finally {
          setIsActionLoading(false);
          hideGlobalLoading();
        }
      },
    });
  };

  // Delete whole invoice
  const handleDeleteFullInvoice = (invoice: string) => {
    setConfirmModal({
      title: 'Hapus Seluruh Invoice',
      message: `PERINGATAN: Hapus SELURUH item mutasi dalam invoice "${invoice}" secara permanen? Semua baris log dengan nomor invoice ini akan dihapus dari Supabase.`,
      confirmLabel: 'Hapus 1 Invoice Full',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setEditingInvoice(null);
        setIsActionLoading(true);
        showGlobalLoading('Menghapus invoice...');

        const prevLogs = [...logs];

        // Optimistic update
        setLogs((prev) => prev.filter((it) => it.invoice !== invoice));

        try {
          const res = await deleteLogProdukInvoice(invoice);
          if (res.success) {
            if (onNotify) onNotify(`Seluruh mutasi pada invoice ${invoice} berhasil dihapus.`, 'info');
            
          } else {
            if (onNotify) onNotify(`Gagal menghapus invoice: ${res.error}`, 'error');
            setLogs(prevLogs);
          }
        } catch (err: any) {
          if (onNotify) onNotify(`Error: ${err.message}`, 'error');
          setLogs(prevLogs);
        } finally {
          setIsActionLoading(false);
          hideGlobalLoading();
        }
      },
    });
  };

  // Batch Delete Selected
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    
    setConfirmModal({
      title: 'Hapus Log Terpilih',
      message: `PERINGATAN: Hapus ${selectedIds.size} baris mutasi secara permanen dari database Supabase? Tindakan ini akan mempengaruhi perhitungan sisa stok dan TIDAK DAPAT DIBATALKAN.`,
      confirmLabel: `Hapus ${selectedIds.size} Item`,
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsActionLoading(true);
        showGlobalLoading('Menghapus batch...');

        const idsArray = Array.from(selectedIds) as (string | number)[];
        const selectedSet = new Set(selectedIds);
        try {
          const res = await deleteLogProdukBatch(idsArray);
          if (res.success) {
            setLogs((prev) => prev.filter((it) => !selectedSet.has(it.id!)));
            setSelectedIds(new Set());
            if (onNotify) {
              if (res.count > 0) {
                onNotify(`${res.count} item mutasi berhasil dihapus.`, 'success');
              } else {
                onNotify('Item terpilih berhasil dibersihkan dari tampilan.', 'info');
              }
            }
          } else {
            if (onNotify) onNotify(`Gagal menghapus item: ${res.error}`, 'error');
          }
        } catch (err: any) {
          if (onNotify) onNotify(`Error: ${err.message}`, 'error');
        } finally {
          setIsActionLoading(false);
          hideGlobalLoading();
        }
      },
    });
  };

  // Delete All Filtered
  const handleDeleteFiltered = () => {
    if (filteredLogs.length === 0) return;
    
    setConfirmModal({
      title: 'Hapus Semua Hasil Filter',
      message: `PERINGATAN: Anda akan menghapus ${filteredLogs.length} baris mutasi secara permanen sesuai filter pencarian yang aktif saat ini. Yakin lanjutkan?`,
      confirmLabel: 'Hapus Semua Filtered',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsActionLoading(true);
        setIsBulkMenuOpen(false);
        showGlobalLoading('Menghapus hasil filter...');

        const idsArray = filteredLogs.map(l => l.id).filter(id => id != null) as (string | number)[];
        const idsSet = new Set(idsArray);
        
        try {
          const res = await deleteLogProdukBatch(idsArray);
          if (res.success) {
            setLogs((prev) => prev.filter((it) => !idsSet.has(it.id!)));
            setSelectedIds(new Set());
            if (onNotify) {
              if (res.count > 0) {
                onNotify(`${res.count} item mutasi hasil filter berhasil dihapus.`, 'success');
              } else {
                onNotify('Item hasil filter berhasil dibersihkan dari tampilan.', 'info');
              }
            }
          } else {
            if (onNotify) onNotify(`Gagal menghapus item: ${res.error}`, 'error');
          }
        } catch (err: any) {
          if (onNotify) onNotify(`Error: ${err.message}`, 'error');
        } finally {
          setIsActionLoading(false);
          hideGlobalLoading();
        }
      },
    });
  };

  // Delete By Date Range
  const handleDeleteByDateRange = () => {
    if (!dateFilterModal.start || !dateFilterModal.end) {
      if (onNotify) onNotify('Silakan pilih rentang tanggal (Mulai & Selesai).', 'warning');
      return;
    }
    
    setConfirmModal({
      title: 'Hapus Log Berdasarkan Tanggal',
      message: `PERINGATAN: Hapus seluruh mutasi log dari tanggal ${dateFilterModal.start} hingga ${dateFilterModal.end}? Tindakan ini TIDAK DAPAT DIBATALKAN.`,
      confirmLabel: 'Hapus Rentang Tanggal',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsActionLoading(true);
        setDateFilterModal(prev => ({ ...prev, isOpen: false }));
        showGlobalLoading('Menghapus rentang tanggal...');

        try {
          const res = await deleteLogProdukByDateRange(dateFilterModal.start, dateFilterModal.end);
          if (res.success) {
            if (onNotify) onNotify(`Mutasi log rentang tanggal ${dateFilterModal.start} - ${dateFilterModal.end} berhasil dihapus.`, 'success');
            setSelectedIds(new Set());
            await forceReloadLogs();
          } else {
            if (onNotify) onNotify(`Gagal menghapus item: ${res.error}`, 'error');
          }
        } catch (err: any) {
          if (onNotify) onNotify(`Error: ${err.message}`, 'error');
        } finally {
          setIsActionLoading(false);
          hideGlobalLoading();
        }
      },
    });
  };

  // Toggle row selection (supports single ID or array of merged IDs)
  const toggleSelection = (idOrIds: string | number | (string | number)[]) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      const list = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
      const allSelected = list.length > 0 && list.every((id) => newSet.has(id));
      if (allSelected) {
        list.forEach((id) => newSet.delete(id));
      } else {
        list.forEach((id) => newSet.add(id));
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size >= allCurrentIds.size && allCurrentIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allCurrentIds));
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredLogs.length) {
      if (onNotify) onNotify('Tidak ada data mutasi untuk diekspor.', 'warning');
      return;
    }

    const headers = ['ID', 'Waktu', 'Tipe', 'Invoice', 'SKU', 'Nama Produk', 'Size', 'Lokasi', 'Area', 'Qty', 'Stok Saat Itu', 'Operator', 'Keterangan'];
    const rows = displayLogs.map((l) => [
      l.id || '',
      l.created_at || '',
      l.type || '',
      `"${(l.invoice || '').replace(/"/g, '""')}"`,
      `"${(l.sku || '').replace(/"/g, '""')}"`,
      `"${(l.nama_produk || '').replace(/"/g, '""')}"`,
      `"${(l.size || '').replace(/"/g, '""')}"`,
      `"${(l.lokasi || '').replace(/"/g, '""')}"`,
      `"${(l.area || '').replace(/"/g, '""')}"`,
      l.qty || 1,
      l.stok_saat_itu ?? 0,
      `"${(l.operator || '').replace(/"/g, '""')}"`,
      `"${(l.keterangan || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Mutasi_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onNotify) onNotify(`Berhasil mengekspor ${filteredLogs.length} baris log mutasi.`, 'success');
  };

  const renderTypeStyle = (type: string) => {
    switch (type) {
      case 'IN':
        return {
          badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80',
          dot: 'bg-emerald-500',
          qty: 'text-emerald-700 dark:text-emerald-400',
          cellBg: 'bg-emerald-50/40 dark:bg-emerald-950/20',
          prefix: '+',
        };
      case 'OUT':
        return {
          badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/80',
          dot: 'bg-rose-500',
          qty: 'text-rose-600 dark:text-rose-400',
          cellBg: 'bg-rose-50/40 dark:bg-rose-950/20',
          prefix: '-',
        };
      case 'ADJ_IN':
        return {
          badge: 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80',
          dot: 'bg-teal-500',
          qty: 'text-teal-700 dark:text-teal-400',
          cellBg: 'bg-teal-50/40 dark:bg-teal-950/20',
          prefix: '+',
        };
      case 'ADJ_OUT':
        return {
          badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80',
          dot: 'bg-amber-500',
          qty: 'text-amber-700 dark:text-amber-400',
          cellBg: 'bg-amber-50/40 dark:bg-amber-950/20',
          prefix: '-',
        };
      default:
        return {
          badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80',
          dot: 'bg-indigo-500',
          qty: 'text-indigo-600 dark:text-indigo-400',
          cellBg: 'bg-indigo-50/35 dark:bg-indigo-950/20',
          prefix: '',
        };
    }
  };

  const formatShortTime = (iso?: string) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const quickTypeTabs: { id: string; label: string; values: string[] }[] = [
    { id: 'ALL', label: 'Semua', values: ['ALL'] },
    { id: 'IN', label: 'Masuk (IN)', values: ['IN'] },
    { id: 'OUT', label: 'Keluar (OUT)', values: ['OUT'] },
    { id: 'SO', label: 'Opname (SO)', values: ['SO'] },
    { id: 'ADJ', label: 'Adjustment', values: ['ADJ_IN', 'ADJ_OUT'] },
  ];

  const isQuickTabActive = (values: string[]) => {
    if (values.includes('ALL')) return typeFilters.includes('ALL') || typeFilters.length === 0;
    return values.length === typeFilters.length && values.every((v) => typeFilters.includes(v));
  };

  return (
    <div id="mutasiLogViewContainer" className="space-y-2.5 w-full max-w-full pb-24 sm:pb-16">
      {/* 1. Sleek App Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xs space-y-2">
        {/* ROW 1: Search + Controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="inputSearchMutasiLog"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery) {
                  handleServerSearch();
                }
              }}
              placeholder="Cari invoice, SKU, produk, rak, operator..."
              className="w-full pl-9 pr-8 min-h-[40px] text-xs sm:text-sm bg-slate-50/80 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setDebouncedSearch('');
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer rounded-full"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {searchQuery && (
            <button
              type="button"
              onClick={handleServerSearch}
              disabled={isServerSearching}
              className="inline-flex items-center gap-1.5 px-3 min-h-[40px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 shrink-0 cursor-pointer active:scale-[0.98]"
              title="Cari riwayat lama di seluruh server"
            >
              {isServerSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Cari Server</span>
              <span className="sm:hidden">Server</span>
            </button>
          )}

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            {/* 2-Mode Switcher: Tabel | Kartu */}
            <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
              <button
                type="button"
                onClick={() => handleToggleViewMode('TABLE')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'TABLE'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleViewMode('CARD')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'CARD'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Kartu</span>
              </button>
            </div>

            {/* Filter Button */}
            <button
              id="btnOpenMutasiFilterModalDesktop"
              type="button"
              onClick={() => setIsFilterModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-semibold rounded-xl transition-colors cursor-pointer border ${
                activeFilterCount > 0
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                  : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-mono font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Anomaly Quick Chip */}
            {anomalyLocationCount > 0 && (
              <button
                type="button"
                onClick={() => setAreaFilter(areaFilter === 'Anomali' ? 'ALL' : 'Anomali')}
                className={`inline-flex items-center gap-1.5 px-2.5 min-h-[40px] text-xs font-semibold rounded-xl transition-colors cursor-pointer border ${
                  areaFilter === 'Anomali'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/70'
                }`}
                title="Filter lokasi anomali"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden lg:inline">Anomali</span>
                <span className="font-mono font-bold text-[11px] tabular-nums">{anomalyLocationCount}</span>
              </button>
            )}

            {/* Neutral Refresh */}
            <button
              type="button"
              disabled={isLoading}
              onClick={forceReloadLogs}
              className="w-10 h-10 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors inline-flex items-center justify-center cursor-pointer disabled:opacity-50"
              title="Muat ulang data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Neutral CSV Export */}
            {canExportData && (
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-semibold bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                title="Ekspor CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* ROW 2 (Mobile): Native App Segmented View Switcher + Filter + Menu */}
        <div className="flex md:hidden items-center justify-between gap-2">
          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/70 dark:border-slate-700/70">
            <button
              type="button"
              onClick={() => handleToggleViewMode('CARD')}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'CARD'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kartu</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleViewMode('TABLE')}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'TABLE'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Tabel</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {anomalyLocationCount > 0 && (
              <button
                type="button"
                onClick={() => setAreaFilter(areaFilter === 'Anomali' ? 'ALL' : 'Anomali')}
                className={`inline-flex items-center gap-1 px-2.5 min-h-[38px] text-xs font-bold rounded-xl transition-colors cursor-pointer border ${
                  areaFilter === 'Anomali'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-rose-50/70 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900'
                }`}
                title="Filter lokasi anomali"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="font-mono text-[11px] tabular-nums">{anomalyLocationCount}</span>
              </button>
            )}

            <button
              id="btnOpenMutasiFilterModalMobile"
              type="button"
              onClick={() => setIsFilterModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 min-h-[38px] text-xs font-semibold rounded-xl transition-colors cursor-pointer border ${
                activeFilterCount > 0
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-mono font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsToolbarMenuOpen(true)}
              className="w-9 h-9 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl inline-flex items-center justify-center cursor-pointer"
              aria-label="Menu utilitas log"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ROW 3: Horizontal-Swipe Quick Type Filter Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
          {quickTypeTabs.map((tab) => {
            const active = isQuickTabActive(tab.values);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilters(tab.values)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100/80 hover:bg-slate-200/70 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Active Secondary Filter Chips (Only shown when real filters or search are active) */}
        {(activeFilterCount > 0 || searchQuery.trim().length > 0) && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
            <span className="text-slate-400 font-semibold text-[10px]">Aktif:</span>

            {sourceFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold">
                {sourceFilter === 'WA' ? 'WhatsApp' : 'Web App'}
                <button type="button" onClick={() => setSourceFilter('ALL')} className="hover:text-rose-500 cursor-pointer ml-0.5">
                  ×
                </button>
              </span>
            )}
            {!typeFilters.includes('ALL') && typeFilters.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold">
                Tipe: {typeFilters.join(', ')}
                <button type="button" onClick={() => setTypeFilters(['ALL'])} className="hover:text-rose-500 cursor-pointer ml-0.5">
                  ×
                </button>
              </span>
            )}
            {areaFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold">
                Area: {areaFilter}
                <button type="button" onClick={() => setAreaFilter('ALL')} className="hover:text-rose-500 cursor-pointer ml-0.5">
                  ×
                </button>
              </span>
            )}
            {(viewDateFilter.start || viewDateFilter.end) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono text-[10px] font-semibold">
                {viewDateFilter.start || '...'} – {viewDateFilter.end || '...'}
                <button type="button" onClick={() => setViewDateFilter({ start: '', end: '' })} className="hover:text-rose-500 cursor-pointer ml-0.5">
                  ×
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={handleResetAllFilters}
              className="ml-auto text-rose-600 dark:text-rose-400 hover:underline font-semibold text-[11px] cursor-pointer"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* 2. Main Content Area */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2.5">
            <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Memuat log produk dari Supabase...
            </span>
          </div>
        ) : fetchError ? (
          <div className="py-14 px-4 text-center space-y-3">
            <AlertTriangle className="w-9 h-9 text-rose-500 mx-auto" />
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Gagal Mengambil Data</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{fetchError}</p>
            <button
              type="button"
              onClick={loadLogs}
              className="px-4 min-h-[40px] text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-14 text-center space-y-3 px-4">
            <Package className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Tidak Ada Log Produk Ditemukan
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || activeFilterCount > 0
                ? 'Tidak ada data yang cocok dengan filter atau kata kunci saat ini.'
                : 'Belum ada riwayat mutasi produk di database.'}
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleServerSearch}
                  disabled={isServerSearching}
                  className="px-4 min-h-[40px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {isServerSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>{isServerSearching ? 'Mencari...' : `Cari "${searchQuery}" di Server`}</span>
                </button>
              )}
              {(searchQuery || activeFilterCount > 0) && (
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="px-4 min-h-[40px] bg-white hover:bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            {/* Compact Selection & Count Header Strip */}
            <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800 text-[11px]">
              <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300 select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer"
                  checked={allCurrentIds.size > 0 && selectedIds.size >= allCurrentIds.size}
                  onChange={toggleSelectAll}
                />
                <span>
                  Pilih Semua{selectedIds.size > 0 ? ` (${selectedIds.size}/${allCurrentIds.size})` : ''}
                </span>
              </label>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {Math.min(displayLimit, displayLogs.length)} / {displayLogs.length} baris
                <span className="hidden sm:inline"> ({filteredLogs.length} scan)</span>
              </span>
            </div>

            {viewMode === 'CARD' ? (
              /* ======================================================= */
              /* MODE KARTU: Clean Single-Elevation App Cards            */
              /* ======================================================= */
              <div className="p-2.5 sm:p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 sm:gap-3 bg-slate-50/50 dark:bg-slate-950/30">
                {displayLogs.slice(0, displayLimit).map((item) => {
                  const style = renderTypeStyle(item.type);
                  const isSelected =
                    item.merged_ids && item.merged_ids.length > 0
                      ? item.merged_ids.every((id) => selectedIds.has(id))
                      : selectedIds.has(item.id!);
                  const itemCat = catalogMap.get((item.sku || '').toUpperCase().trim());
                  const displayName = resolveProductName(item.sku, item.nama_produk, itemCat);
                  const displaySize = resolveProductDisplaySize(item.sku, item.size, itemCat?.s);
                  const resolvedArea = getAreaFromLokasi(item.lokasi || '', item.area);
                  const isLocAnomaly = resolvedArea === 'Anomali';
                  const src = getLogSource(item);
                  const stokSaatItu = item.stok_saat_itu ?? 0;

                  return (
                    <div
                      key={item.id || `${item.invoice}_${item.sku}_${item.created_at}`}
                      className={`rounded-2xl border transition-colors flex flex-col justify-between overflow-hidden ${
                        isSelected
                          ? 'bg-indigo-50/50 dark:bg-indigo-950/25 border-indigo-300 dark:border-indigo-700'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="p-3 sm:p-3.5 space-y-2.5">
                        {/* Card Top Row: Checkbox + Type + Source + Time + Menu */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer shrink-0"
                              checked={isSelected}
                              onChange={() =>
                                toggleSelection(item.merged_ids && item.merged_ids.length > 0 ? item.merged_ids : item.id!)
                              }
                            />
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 ${style.badge}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                              {item.type}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 shrink-0">
                              {src === 'WA' ? 'WA' : src === 'WEB' ? 'Web' : 'Sys'}
                            </span>
                            {item.raw_count && item.raw_count > 1 && (
                              <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                                {item.raw_count}x
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] font-mono tabular-nums text-slate-400">
                              {formatShortTime(item.created_at)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActionSheetLog(item)}
                              className="w-8 h-8 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center cursor-pointer transition-colors"
                              aria-label="Aksi log"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Hero Product Block: Nama Produk + Size (Prominent) -> SKU (Secondary) */}
                        <div className="space-y-0.5">
                          <div className="flex items-start justify-between gap-2">
                            <h4
                              className="text-[14px] font-bold text-slate-900 dark:text-white leading-snug break-words flex-1 min-w-0"
                              title={displayName}
                            >
                              {displayName}
                            </h4>
                            {displaySize && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 font-mono text-xs font-extrabold shrink-0">
                                {displaySize}
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400 select-all">
                            {item.sku}
                          </div>
                        </div>

                        {/* Structured 3-Column Metrics Bar: QTY | STOK | LOKASI */}
                        <div className="grid grid-cols-3 divide-x divide-slate-200/80 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
                          <div className={`px-2 py-2 text-center ${style.cellBg}`}>
                            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Qty
                            </div>
                            <div className={`font-mono font-black text-[15px] tabular-nums leading-tight mt-0.5 ${style.qty}`}>
                              {style.prefix}
                              {item.qty}
                            </div>
                          </div>

                          <div className="px-2 py-2 text-center">
                            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Stok
                            </div>
                            <div
                              className={`font-mono font-black text-[15px] tabular-nums leading-tight mt-0.5 ${
                                stokSaatItu < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : stokSaatItu === 0
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {stokSaatItu}
                            </div>
                          </div>

                          <div className="px-2 py-2 text-center min-w-0">
                            <div
                              className={`text-[9.5px] font-bold uppercase tracking-wider truncate ${
                                isLocAnomaly
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {isLocAnomaly ? 'Anomali' : resolvedArea}
                            </div>
                            <div
                              className={`font-mono font-extrabold text-[13px] leading-tight mt-0.5 truncate ${
                                isLocAnomaly
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-indigo-600 dark:text-indigo-400'
                              }`}
                              title={item.lokasi || '-'}
                            >
                              {item.lokasi || '-'}
                            </div>
                          </div>
                        </div>

                        {/* Clean Typographic Metadata */}
                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 min-w-0">
                              <User className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{formatOperatorWithPersonName(item.operator)}</span>
                            </div>

                            {item.invoice && item.invoice !== '-' && (
                              <button
                                type="button"
                                onClick={() => handleCopyInvoice(item.invoice)}
                                className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[52%] cursor-pointer shrink-0"
                                title="Salin invoice"
                              >
                                <span className="truncate">{item.invoice}</span>
                                {copiedInvoice === item.invoice ? (
                                  <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                                ) : (
                                  <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                                )}
                              </button>
                            )}
                          </div>

                          {item.keterangan && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 italic truncate" title={item.keterangan}>
                              &ldquo;{item.keterangan}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Clean 2-Control Footer */}
                      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20">
                        <button
                          type="button"
                          onClick={() => handleOpenEditInvoice(item.invoice)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[36px] text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Edit Invoice</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionSheetLog(item)}
                          className="inline-flex items-center justify-center w-9 h-9 text-slate-500 dark:text-slate-300 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer shrink-0"
                          title="Aksi lainnya"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ======================================================= */
              /* MODE TABEL: True Inventory-Style Table (Mobile & Desk)  */
              /* ======================================================= */
              <>
                {/* MOBILE TABLE (< md): Identical Structure to Inventory Table (4 Proportional Columns, Zero Horizontal Scroll) */}
                <div className="block md:hidden w-full">
                  <table className="w-full table-fixed border-collapse text-left">
                    <thead className="sticky top-0 z-20 bg-slate-100/95 dark:bg-[#121824]/95 text-slate-600 dark:text-slate-300 text-[10px] font-extrabold uppercase border-b border-slate-300 dark:border-slate-700 backdrop-blur-xs">
                      <tr>
                        <th className="py-2 pl-2 pr-1.5 w-[47%] border-r border-slate-200/90 dark:border-slate-700/80">
                          Produk
                        </th>
                        <th className="py-2 px-1 w-[13%] text-center border-r border-slate-200/90 dark:border-slate-700/80">
                          Qty
                        </th>
                        <th className="py-2 px-1 w-[13%] text-center bg-slate-200/40 dark:bg-slate-800/60 border-r border-slate-200/90 dark:border-slate-700/80">
                          Stok
                        </th>
                        <th className="py-2 pl-1.5 pr-2 w-[27%]">
                          Lokasi
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-200/90 dark:divide-slate-800">
                      {displayLogs.slice(0, displayLimit).map((item) => {
                        const style = renderTypeStyle(item.type);
                        const isSelected =
                          item.merged_ids && item.merged_ids.length > 0
                            ? item.merged_ids.every((id) => selectedIds.has(id))
                            : selectedIds.has(item.id!);
                        const itemCat = catalogMap.get((item.sku || '').toUpperCase().trim());
                        const displayName = resolveProductName(item.sku, item.nama_produk, itemCat);
                        const displaySize = resolveProductDisplaySize(item.sku, item.size, itemCat?.s);
                        const resolvedArea = getAreaFromLokasi(item.lokasi || '', item.area);
                        const isLocAnomaly = resolvedArea === 'Anomali';
                        const stokSaatItu = item.stok_saat_itu ?? 0;

                        return (
                          <tr
                            key={`m_${item.id || `${item.invoice}_${item.sku}_${item.created_at}`}`}
                            onClick={() => setActionSheetLog(item)}
                            className={`transition-colors cursor-pointer active:bg-slate-50 dark:active:bg-slate-800/60 ${
                              isSelected ? 'bg-indigo-50/45 dark:bg-indigo-950/20' : 'bg-white dark:bg-[#0E1420]'
                            }`}
                          >
                            {/* Col 1: Produk + Size (Prominent) | SKU (Secondary) | Tipe & Waktu */}
                            <td className="py-2 pl-2 pr-1.5 align-top border-r border-slate-200/80 dark:border-slate-800">
                              <div className="flex items-start gap-1.5 min-w-0">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer shrink-0"
                                  checked={isSelected}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={() =>
                                    toggleSelection(item.merged_ids && item.merged_ids.length > 0 ? item.merged_ids : item.id!)
                                  }
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[12px] font-bold text-slate-900 dark:text-slate-100 leading-snug break-words">
                                    <span>{displayName}</span>
                                    {displaySize && (
                                      <span className="ml-1 inline-block px-1 py-0.2 rounded font-mono text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/90 dark:border-slate-700 align-middle leading-tight">
                                        {displaySize}
                                      </span>
                                    )}
                                  </div>

                                  <div className="font-mono text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                    {item.sku}
                                  </div>

                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    <span
                                      className={`px-1 py-0.2 rounded text-[8.5px] font-extrabold uppercase leading-tight ${style.badge}`}
                                    >
                                      {item.type}
                                    </span>
                                    <span className="font-mono text-[9.5px] text-slate-400 tabular-nums">
                                      {formatShortTime(item.created_at)}
                                    </span>
                                  </div>

                                  {item.operator && (
                                    <div className="flex items-center gap-1 mt-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300 min-w-0">
                                      <User className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                      <span className="truncate" title={formatOperatorWithPersonName(item.operator)}>
                                        {formatOperatorWithPersonName(item.operator)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Col 2: Qty (Dedicated Centered Cell) */}
                            <td
                              className={`py-2 px-1 align-middle text-center font-mono tabular-nums border-r border-slate-200/80 dark:border-slate-800 ${style.cellBg}`}
                            >
                              <span className={`text-[12.5px] font-black ${style.qty}`}>
                                {style.prefix}
                                {item.qty}
                              </span>
                            </td>

                            {/* Col 3: Stok (Dedicated Centered Cell) */}
                            <td className="py-2 px-1 align-middle text-center font-mono tabular-nums bg-slate-50/60 dark:bg-slate-800/30 border-r border-slate-200/80 dark:border-slate-800">
                              <span
                                className={`text-[12.5px] font-black ${
                                  stokSaatItu < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : stokSaatItu === 0
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {stokSaatItu}
                              </span>
                            </td>

                            {/* Col 4: Area + Rak Chip + Invoice */}
                            <td className="py-2 pl-1.5 pr-2 align-middle">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-1">
                                  {isLocAnomaly ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase leading-none bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800">
                                      Anomali
                                    </span>
                                  ) : (
                                    <AreaBadge area={resolvedArea} compact />
                                  )}
                                </div>

                                <div>
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border leading-none max-w-full truncate ${
                                      isLocAnomaly
                                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200/90 dark:border-slate-700'
                                    }`}
                                  >
                                    {item.lokasi || '-'}
                                  </span>
                                </div>

                                {item.invoice && item.invoice !== '-' && (
                                  <div className="font-mono text-[9.5px] text-slate-400 truncate" title={item.invoice}>
                                    {item.invoice}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* DESKTOP STRUCTURED INVENTORY-STYLE TABLE */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse lg:table-fixed">
                    <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#121824] text-slate-600 dark:text-slate-300 text-[10.5px] font-extrabold uppercase tracking-wider border-b-2 border-slate-300 dark:border-slate-600">
                      <tr>
                        <th className="py-2.5 px-2.5 w-[4%] text-center border-r border-slate-300/80 dark:border-slate-700">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer"
                            checked={allCurrentIds.size > 0 && selectedIds.size >= allCurrentIds.size}
                            onChange={toggleSelectAll}
                          />
                        </th>
                        <th className="py-2.5 px-3 w-[25%] border-r border-slate-300/80 dark:border-slate-700">
                          Produk &amp; SKU
                        </th>
                        <th className="py-2.5 px-2.5 w-[12%] border-r border-slate-300/80 dark:border-slate-700">
                          Tipe &amp; Waktu
                        </th>
                        <th className="py-2.5 px-2.5 w-[15%] border-r border-slate-300/80 dark:border-slate-700">
                          Invoice
                        </th>
                        <th className="py-2.5 px-2.5 w-[13%] border-r border-slate-300/80 dark:border-slate-700">
                          Area &amp; Lokasi
                        </th>
                        <th className="py-2.5 px-2 w-[7%] text-center border-r border-slate-300/80 dark:border-slate-700">
                          Qty
                        </th>
                        <th className="py-2.5 px-2 w-[7%] text-center bg-slate-200/45 dark:bg-slate-800/50 border-r border-slate-300/80 dark:border-slate-700">
                          Stok
                        </th>
                        <th className="py-2.5 px-2.5 w-[12%] border-r border-slate-300/80 dark:border-slate-700">
                          Operator
                        </th>
                        <th className="py-2.5 px-2 w-[5%] text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {displayLogs.slice(0, displayLimit).map((item) => {
                        const style = renderTypeStyle(item.type);
                        const isSelected =
                          item.merged_ids && item.merged_ids.length > 0
                            ? item.merged_ids.every((id) => selectedIds.has(id))
                            : selectedIds.has(item.id!);
                        const itemCat = catalogMap.get((item.sku || '').toUpperCase().trim());
                        const displayName = resolveProductName(item.sku, item.nama_produk, itemCat);
                        const displaySize = resolveProductDisplaySize(item.sku, item.size, itemCat?.s);
                        const resolvedArea = getAreaFromLokasi(item.lokasi || '', item.area);
                        const isLocAnomaly = resolvedArea === 'Anomali';
                        const src = getLogSource(item);
                        const stokSaatItu = item.stok_saat_itu ?? 0;

                        return (
                          <tr
                            key={item.id || `${item.invoice}_${item.sku}_${item.created_at}`}
                            className={`transition-colors ${
                              isSelected
                                ? 'bg-indigo-50/50 dark:bg-indigo-950/20'
                                : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-2.5 px-2.5 text-center border-r border-slate-200 dark:border-slate-800">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 cursor-pointer"
                                checked={isSelected}
                                onChange={() =>
                                  toggleSelection(item.merged_ids && item.merged_ids.length > 0 ? item.merged_ids : item.id!)
                                }
                              />
                            </td>

                            {/* Produk + Size (Prominent) | SKU (Secondary) */}
                            <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800">
                              <div className="flex items-start justify-between gap-2 min-w-0">
                                <span
                                  className="font-bold text-[12.5px] text-slate-900 dark:text-slate-100 leading-snug line-clamp-2"
                                  title={displayName}
                                >
                                  {displayName}
                                </span>
                                {displaySize && (
                                  <span className="px-1.5 py-0.5 rounded font-mono text-[11px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shrink-0 leading-none">
                                    {displaySize}
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-[10.5px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5 select-all">
                                {item.sku}
                              </div>
                            </td>

                            {/* Tipe & Waktu */}
                            <td className="py-2.5 px-2.5 whitespace-nowrap border-r border-slate-200 dark:border-slate-800">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${style.badge}`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                {item.type}
                              </span>
                              <div className="text-[10px] text-slate-400 mt-1 font-mono tabular-nums">
                                {formatShortTime(item.created_at)}
                              </div>
                            </td>

                            {/* Invoice */}
                            <td className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100 text-[11px] truncate select-all">
                                  {item.invoice || '-'}
                                </span>
                                {item.invoice && item.invoice !== '-' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyInvoice(item.invoice)}
                                    title="Salin invoice"
                                    className="p-0.5 text-slate-400 hover:text-indigo-600 transition-colors rounded cursor-pointer shrink-0"
                                  >
                                    {copiedInvoice === item.invoice ? (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                                <span>{src === 'WA' ? 'WhatsApp' : src === 'WEB' ? 'Web App' : 'System'}</span>
                                {item.raw_count && item.raw_count > 1 && (
                                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                    · {item.raw_count}x scan
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Area & Lokasi */}
                            <td className="py-2.5 px-2.5 whitespace-nowrap border-r border-slate-200 dark:border-slate-800">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
                                    isLocAnomaly
                                      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  {item.lokasi || '-'}
                                </span>
                              </div>
                              <div className="mt-1">
                                {isLocAnomaly ? (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[9.5px] font-bold uppercase leading-none bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800">
                                    Anomali
                                  </span>
                                ) : (
                                  <AreaBadge area={resolvedArea} compact />
                                )}
                              </div>
                            </td>

                            {/* Qty (Dedicated Centered Column) */}
                            <td
                              className={`py-2.5 px-2 text-center whitespace-nowrap font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 ${style.cellBg}`}
                            >
                              <span className={`font-black text-[13px] ${style.qty}`}>
                                {style.prefix}
                                {item.qty}
                              </span>
                            </td>

                            {/* Stok (Dedicated Centered Column) */}
                            <td
                              className="py-2.5 px-2 text-center whitespace-nowrap font-mono tabular-nums bg-slate-50/70 dark:bg-slate-800/35 border-r border-slate-200 dark:border-slate-800"
                              title={`Sisa stok di ${item.lokasi || 'rak'} saat transaksi: ${stokSaatItu} pcs`}
                            >
                              <span
                                className={`font-black text-[13px] ${
                                  stokSaatItu < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : stokSaatItu === 0
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {stokSaatItu}
                              </span>
                            </td>

                            {/* Operator & Catatan */}
                            <td className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800">
                              <div className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200 text-[11px] min-w-0">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate" title={formatOperatorWithPersonName(item.operator)}>
                                  {formatOperatorWithPersonName(item.operator)}
                                </span>
                              </div>
                              {item.keterangan && (
                                <div className="text-[10px] text-slate-400 truncate italic mt-0.5" title={item.keterangan}>
                                  &ldquo;{item.keterangan}&rdquo;
                                </div>
                              )}
                            </td>

                            {/* Aksi */}
                            <td className="py-2.5 px-2 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setActionSheetLog(item)}
                                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center cursor-pointer transition-colors"
                                title="Aksi log"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Pagination / Show More */}
            {displayLogs.length > displayLimit && (
              <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => setDisplayLimit((prev) => prev + 150)}
                  className="px-4 min-h-[40px] text-xs font-bold bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  Muat Lebih Banyak ({displayLogs.length - displayLimit} baris lagi)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: EDIT INVOICE (Mobile Bottom-Sheet Friendly + Clean Desktop Modal)  */}
      {/* ========================================================================= */}
      {editingInvoice && (
        <div
          id="editInvoiceModalOverlay"
          className="fixed inset-0 z-[125] bg-slate-950/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            id="editInvoiceModalBox"
            className="w-full max-w-4xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-150"
          >
            {/* Mobile Drag Handle */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Modal Header */}
            <div className="px-4 sm:px-5 py-3 bg-slate-50/70 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                  <span>Edit Invoice</span>
                  <span className="font-mono text-xs bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md text-indigo-700 dark:text-indigo-300">
                    {editingInvoice}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {editInvoiceItems.length} item unik dalam invoice ini
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDeleteFullInvoice(editingInvoice)}
                  className="px-2.5 min-h-[36px] text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer border border-rose-200 dark:border-rose-900/70"
                  title="Hapus seluruh baris log dengan nomor invoice ini"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Hapus 1 Invoice</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="w-9 h-9 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl inline-flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-2.5">
              {isEditLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
                  <span className="text-xs text-slate-400">Memuat list item invoice...</span>
                </div>
              ) : editInvoiceItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Tidak ada item ditemukan dalam invoice ini.
                </div>
              ) : (
                <div className="space-y-3">
                  {editInvoiceItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3 sm:p-3.5 bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold font-mono text-slate-500">
                            Item #{idx + 1}
                          </span>
                          {item.merged_ids && item.merged_ids.length > 1 && (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                              Gabungan {item.merged_ids.length} baris
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteSingleItem(item.id, item.sku, true, item.merged_ids)}
                          className="text-xs text-rose-600 dark:text-rose-400 font-semibold inline-flex items-center gap-1 cursor-pointer hover:underline"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5">
                        <div className="col-span-2 sm:col-span-3">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Kategori Mutasi
                          </label>
                          <select
                            value={item.type}
                            onChange={(e) => handleItemFieldChange(idx, 'type', e.target.value)}
                            className="w-full px-2.5 min-h-[40px] text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                          >
                            <option value="IN">IN (Barang Masuk)</option>
                            <option value="OUT">OUT (Barang Keluar)</option>
                            <option value="ADJ_IN">ADJ_IN (Penyesuaian Masuk)</option>
                            <option value="ADJ_OUT">ADJ_OUT (Penyesuaian Keluar)</option>
                            <option value="SO">SO (Stock Opname)</option>
                          </select>
                        </div>

                        <div className="col-span-2 sm:col-span-4">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Barcode SKU
                          </label>
                          <input
                            type="text"
                            value={item.sku}
                            onChange={(e) => handleItemFieldChange(idx, 'sku', e.target.value)}
                            className="w-full px-2.5 min-h-[40px] text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                            placeholder="Contoh: F26DBH348CRL"
                          />
                        </div>

                        <div className="col-span-1 sm:col-span-3">
                          {(() => {
                            const editArea = getAreaFromLokasi(item.lokasi || '');
                            const isEditLocAnomaly = editArea === 'Anomali';
                            return (
                              <>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1 truncate">
                                  Lokasi ({' '}
                                  <span
                                    className={
                                      isEditLocAnomaly
                                        ? 'text-rose-600 dark:text-rose-400'
                                        : 'text-indigo-600 dark:text-indigo-400'
                                    }
                                  >
                                    {editArea}
                                  </span>
                                  )
                                </label>
                                <input
                                  type="text"
                                  value={item.lokasi}
                                  onChange={(e) => handleItemFieldChange(idx, 'lokasi', e.target.value)}
                                  className={`w-full px-2.5 min-h-[40px] text-xs font-mono font-bold uppercase bg-white dark:bg-slate-800 border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden ${
                                    isEditLocAnomaly
                                      ? 'border-rose-400 dark:border-rose-700 text-rose-600 dark:text-rose-400'
                                      : 'border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400'
                                  }`}
                                  placeholder="B038"
                                />
                              </>
                            );
                          })()}
                        </div>

                        <div className="col-span-1 sm:col-span-2">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Qty</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            value={item.qty ?? ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleItemFieldChange(idx, 'qty', val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
                            }}
                            onBlur={() => {
                              if (item.qty === '' || Number(item.qty) < 1) {
                                handleItemFieldChange(idx, 'qty', 1);
                              }
                            }}
                            className="w-full px-2.5 min-h-[40px] text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                          />
                        </div>

                        <div className="col-span-2 sm:col-span-7">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Nama Produk
                          </label>
                          <input
                            type="text"
                            value={item.nama_produk}
                            onChange={(e) => handleItemFieldChange(idx, 'nama_produk', e.target.value)}
                            className="w-full px-2.5 min-h-[40px] text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                          />
                        </div>

                        <div className="col-span-2 sm:col-span-5">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Catatan / Keterangan
                          </label>
                          <input
                            type="text"
                            value={item.keterangan}
                            onChange={(e) => handleItemFieldChange(idx, 'keterangan', e.target.value)}
                            placeholder="Alasan edit / keterangan"
                            className="w-full px-2.5 min-h-[40px] text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 sm:px-5 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5 bg-slate-50/70 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                <strong className="text-slate-900 dark:text-white">{editInvoiceItems.length}</strong> item ·{' '}
                <strong className="text-indigo-600 dark:text-indigo-400">
                  {editInvoiceItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0)} pcs
                </strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingInvoice(null)}
                  className="px-3.5 min-h-[40px] text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="button"
                  disabled={isSavingEdit || editInvoiceItems.length === 0}
                  onClick={handleSaveInvoiceEdit}
                  className="px-4 min-h-[40px] text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{isSavingEdit ? 'Menyimpan...' : 'Simpan'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Selection Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-md animate-in slide-in-from-bottom-5 fade-in duration-200">
          <div className="bg-slate-900 dark:bg-slate-800 text-white border border-slate-700 shadow-2xl rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2.5">
            <div className="text-xs sm:text-sm font-bold flex items-center gap-1.5 min-w-0 font-mono tabular-nums">
              <span className="text-indigo-400 font-black">{selectedIds.size}</span>
              <span className="font-sans text-slate-200 truncate">log terpilih</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="px-3.5 min-h-[38px] text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="w-9 h-9 text-slate-400 hover:text-white transition-colors rounded-xl inline-flex items-center justify-center cursor-pointer"
                title="Batal Pilih"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Filter Modal for Bulk Delete */}
      {dateFilterModal.isOpen && (
        <div className="fixed inset-0 z-[125] bg-slate-950/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl p-4 sm:p-5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-5 space-y-3 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-150">
            <div className="sm:hidden flex justify-center -mt-1 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rose-600" />
                Hapus via Rentang Tanggal
              </h3>
              <button
                type="button"
                onClick={() => setDateFilterModal((prev) => ({ ...prev, isOpen: false }))}
                className="w-8 h-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Tanggal Mulai</label>
                <input
                  type="date"
                  value={dateFilterModal.start}
                  onChange={(e) => setDateFilterModal((prev) => ({ ...prev, start: e.target.value }))}
                  className="w-full px-3 min-h-[42px] text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Tanggal Selesai</label>
                <input
                  type="date"
                  value={dateFilterModal.end}
                  onChange={(e) => setDateFilterModal((prev) => ({ ...prev, end: e.target.value }))}
                  className="w-full px-3 min-h-[42px] text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleDeleteByDateRange}
              disabled={!dateFilterModal.start || !dateFilterModal.end}
              className="w-full min-h-[42px] text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              Hapus Data pada Rentang Ini
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div
          id="confirmModalOverlay"
          className="fixed inset-0 z-[135] bg-slate-950/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            id="confirmModalBox"
            className="w-full sm:max-w-sm bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl p-4 sm:p-5 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-5 space-y-3 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-150"
          >
            <div className="sm:hidden flex justify-center -mt-1 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  confirmModal.isDanger
                    ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {confirmModal.isDanger ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{confirmModal.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setConfirmModal(null)}
                className="px-4 min-h-[40px] text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={isActionLoading}
                onClick={confirmModal.onConfirm}
                className={`px-4 min-h-[40px] text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  confirmModal.isDanger
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                {isActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{confirmModal.confirmLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILTER & OPSI BOTTOM SHEET / MODAL */}
      {isFilterModalOpen && (
        <div
          className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsFilterModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[86vh] flex flex-col overflow-hidden border-t sm:border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle on Mobile */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Filter &amp; Opsi Log</span>
                  {activeFilterCount > 0 && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                      {activeFilterCount} aktif
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                  {logs.length.toLocaleString('id-ID')} scan dimuat · {displayLogs.length.toLocaleString('id-ID')} baris ringkas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="w-8 h-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl inline-flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* 1. Sumber Scan */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                  Sumber Scan
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ALL' as const, label: 'Semua', count: sourceCounts.all },
                    { id: 'WA' as const, label: 'WhatsApp', count: sourceCounts.wa },
                    { id: 'WEB' as const, label: 'Web App', count: sourceCounts.web },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSourceFilter(opt.id)}
                      className={`py-2 px-2 text-center rounded-xl border font-bold cursor-pointer transition-colors ${
                        sourceFilter === opt.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5">
                        {opt.count.toLocaleString('id-ID')}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Rentang Tanggal */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                  Rentang Tanggal Log
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={viewDateFilter.start}
                    onChange={(e) => setViewDateFilter((prev) => ({ ...prev, start: e.target.value }))}
                    className="w-full px-3 min-h-[40px] text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                  />
                  <input
                    type="date"
                    value={viewDateFilter.end}
                    onChange={(e) => setViewDateFilter((prev) => ({ ...prev, end: e.target.value }))}
                    className="w-full px-3 min-h-[40px] text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* 3. Jenis Mutasi */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                  Jenis Mutasi
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTypeFilters(['ALL'])}
                    className={`px-3 min-h-[36px] rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                      typeFilters.includes('ALL')
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    Semua
                  </button>
                  {['IN', 'OUT', 'ADJ_IN', 'ADJ_OUT', 'SO'].map((val) => {
                    const active = typeFilters.includes(val) && !typeFilters.includes('ALL');
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          setTypeFilters((prev) => {
                            const withoutAll = prev.filter((p) => p !== 'ALL');
                            if (withoutAll.includes(val)) {
                              const next = withoutAll.filter((p) => p !== val);
                              return next.length === 0 ? ['ALL'] : next;
                            }
                            return [...withoutAll, val];
                          });
                        }}
                        className={`px-3 min-h-[36px] rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                          active
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Area Gudang */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                  Area Gudang
                </label>
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  className="w-full px-3 min-h-[40px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="ALL">Semua Area Gudang</option>
                  {uniqueAreas.map((area) => (
                    <option key={area} value={area}>
                      Area: {area}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Batas Baris Ditampilkan */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">
                  Batas Baris Tampil
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[30, 50, 100, 250, 1000].map((lim) => (
                    <button
                      key={lim}
                      type="button"
                      onClick={() => setDisplayLimit(lim)}
                      className={`px-3 min-h-[34px] rounded-xl border font-mono font-bold text-[11px] cursor-pointer transition-colors ${
                        displayLimit === lim
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {lim}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Administrator Bulk Actions */}
              {userIsAdmin && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <label className="block text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                    Aksi Administrator (Hapus Massal)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFilterModalOpen(false);
                        handleDeleteFiltered();
                      }}
                      className="min-h-[40px] px-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300 font-bold text-center cursor-pointer transition-colors"
                    >
                      Hapus Hasil Filter ({filteredLogs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsFilterModalOpen(false);
                        setDateFilterModal({ isOpen: true, start: '', end: '' });
                      }}
                      className="min-h-[40px] px-2.5 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-center cursor-pointer transition-colors"
                    >
                      Rentang Tanggal...
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 sm:px-5 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900">
              <button
                type="button"
                disabled={activeFilterCount === 0}
                onClick={handleResetAllFilters}
                className="px-3 min-h-[40px] text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
              >
                Reset
              </button>

              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="px-5 min-h-[40px] text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Tampilkan ({displayLogs.length} Baris)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTION SHEET 1: Per-Row / Per-Card Log Actions */}
      <AppActionSheet
        isOpen={Boolean(actionSheetLog)}
        onClose={() => setActionSheetLog(null)}
        title={actionSheetLog ? `${actionSheetLog.sku} (${actionSheetLog.type})` : 'Aksi Log'}
        subtitle={
          actionSheetLog
            ? `${actionSheetLog.invoice || '-'} · Rak ${actionSheetLog.lokasi || '-'} · Qty ${actionSheetLog.qty} (Stok ${actionSheetLog.stok_saat_itu ?? 0})`
            : undefined
        }
        groups={
          actionSheetLog
            ? [
                {
                  title: 'Tindakan Mutasi',
                  items: [
                    {
                      id: 'edit-invoice',
                      label: 'Edit Invoice',
                      description: `Ubah seluruh item pada invoice ${actionSheetLog.invoice || '-'}`,
                      icon: <Edit3 className="w-4 h-4" />,
                      tone: 'primary' as const,
                      onClick: () => handleOpenEditInvoice(actionSheetLog.invoice),
                    },
                    ...(actionSheetLog.invoice && actionSheetLog.invoice !== '-'
                      ? [
                          {
                            id: 'copy-invoice',
                            label: 'Salin Nomor Invoice',
                            description: actionSheetLog.invoice,
                            icon: <Copy className="w-4 h-4" />,
                            onClick: () => handleCopyInvoice(actionSheetLog.invoice),
                          },
                        ]
                      : []),
                    {
                      id: 'toggle-select',
                      label:
                        actionSheetLog.merged_ids && actionSheetLog.merged_ids.length > 0
                          ? actionSheetLog.merged_ids.every((id) => selectedIds.has(id))
                            ? 'Batal Pilih Baris Ini'
                            : 'Pilih Baris Ini'
                          : selectedIds.has(actionSheetLog.id!)
                          ? 'Batal Pilih Baris Ini'
                          : 'Pilih Baris Ini',
                      description: 'Tandai untuk penghapusan massal',
                      icon: <CheckCircle2 className="w-4 h-4" />,
                      onClick: () =>
                        toggleSelection(
                          actionSheetLog.merged_ids && actionSheetLog.merged_ids.length > 0
                            ? actionSheetLog.merged_ids
                            : actionSheetLog.id!
                        ),
                    },
                  ],
                },
                {
                  title: 'Hapus Data',
                  items: [
                    {
                      id: 'delete-item',
                      label: 'Hapus Baris Mutasi Ini',
                      description:
                        actionSheetLog.raw_count && actionSheetLog.raw_count > 1
                          ? `Hapus ${actionSheetLog.raw_count} scan tergabung pada SKU & lokasi ini`
                          : 'Hapus baris mutasi ini dari database',
                      icon: <Trash2 className="w-4 h-4" />,
                      tone: 'danger' as const,
                      onClick: () =>
                        handleDeleteSingleItem(
                          actionSheetLog.id!,
                          actionSheetLog.sku,
                          false,
                          actionSheetLog.merged_ids
                        ),
                    },
                    ...(actionSheetLog.invoice && actionSheetLog.invoice !== '-'
                      ? [
                          {
                            id: 'delete-full-invoice',
                            label: 'Hapus Seluruh Invoice',
                            description: `Hapus semua item dalam ${actionSheetLog.invoice}`,
                            icon: <AlertTriangle className="w-4 h-4" />,
                            tone: 'danger' as const,
                            onClick: () => handleDeleteFullInvoice(actionSheetLog.invoice),
                          },
                        ]
                      : []),
                  ],
                },
              ]
            : []
        }
      />

      {/* ACTION SHEET 2: Mobile Toolbar Utilities */}
      <AppActionSheet
        isOpen={isToolbarMenuOpen}
        onClose={() => setIsToolbarMenuOpen(false)}
        title="Utilitas Log Produk"
        subtitle={`${displayLogs.length.toLocaleString('id-ID')} baris ringkas (${filteredLogs.length.toLocaleString('id-ID')} scan)`}
        groups={[
          {
            title: 'Data & Ekspor',
            items: [
              {
                id: 'refresh-logs',
                label: 'Muat Ulang Penuh',
                description: 'Ambil data terbaru dari Supabase',
                icon: <RefreshCw className="w-4 h-4" />,
                onClick: () => forceReloadLogs(),
              },
              ...(canExportData
                ? [
                    {
                      id: 'export-csv',
                      label: 'Ekspor CSV',
                      description: `Unduh ${displayLogs.length} baris log sesuai filter`,
                      icon: <Download className="w-4 h-4" />,
                      onClick: () => handleExportCSV(),
                    },
                  ]
                : []),
            ],
          },
          ...(userIsAdmin
            ? [
                {
                  title: 'Administrator',
                  items: [
                    {
                      id: 'delete-by-date',
                      label: 'Hapus Rentang Tanggal',
                      description: 'Bersihkan log pada periode tertentu',
                      icon: <Calendar className="w-4 h-4" />,
                      tone: 'warning' as const,
                      onClick: () => setDateFilterModal({ isOpen: true, start: '', end: '' }),
                    },
                    {
                      id: 'delete-filtered',
                      label: 'Hapus Semua Hasil Filter',
                      description: `${filteredLogs.length} baris log sesuai filter aktif`,
                      icon: <Trash2 className="w-4 h-4" />,
                      tone: 'danger' as const,
                      disabled: filteredLogs.length === 0,
                      onClick: () => handleDeleteFiltered(),
                    },
                  ],
                },
              ]
            : []),
        ]}
      />
    </div>
  );
});
