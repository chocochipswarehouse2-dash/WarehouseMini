import { getLocalUsers } from '../utils/localStore';
import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { showGlobalLoading, hideGlobalLoading } from '../utils/globalLoading';
import {
  FileText, Info,
  Plus,
  Trash2,
  Send,
  RefreshCw,
  Download,
  Share2,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Calendar,
  Layers,
  Search,
  Check,
  Copy,
  ChevronDown,
  X,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Building,
  Smartphone,
  Phone,
  ExternalLink,
  MessageSquare,
  Loader2,
  MapPin,
  Edit2,
} from 'lucide-react';
import {
  sendPeminjamanAutoWhatsApp,
  sendFonnteMessage,
  generatePeminjamanGroupMessage,
  generatePeminjamanPersonalMessage,
  getWhatsAppWebUrl,
  getFonnteConfig,
  normalizeWhatsAppNumber,
} from '../services/whatsapp';
import { ProductItem, PeminjamanItemForm, PeminjamanRecord, ChannelStockItem, UserSession, PickingListItem, StockRealtimeItem } from '../types';
import {
  fetchPeminjamanFromSupabase,
  savePeminjamanToSupabase,
  updatePeminjamanInSupabase,
  deletePeminjamanFromSupabase,
  returnPeminjamanSupabase,
  getSupabaseClient,
  fetchRealtimeChannelStocksSupabase,
  fetchChannelStocksBySkus,
  fetchStockForSkus,
  isWarehouseLocation,
  supabaseFetch,
} from '../services/supabase';
import { globalRealtimeStore } from '../services/store';
import {
  getLocalPeminjamanRecords,
  saveLocalPeminjamanRecords,
  FALLBACK_CHANNEL_STOCKS,
} from '../utils/localStore';
import { sortAlphabeticalAndSize, fuzzySearchMultiple, fuzzySearch, partialSearchMatch, extractSizeFromSku, formatProductNameWithSize } from '../utils/sortUtils';
import { isSuperadmin, hasPermission } from '../services/permissions';

interface ProductLocationInfo {
  lokasi: string;
  qty?: number;
  isPrimary?: boolean;
  source?: 'REALTIME_STOCK' | 'CATALOG' | 'SJ';
  area?: string;
}

interface PeminjamanViewProps {
  session: UserSession | null;
  productCatalog: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshCatalog: () => void;
}

export const PeminjamanView: React.FC<PeminjamanViewProps> = React.memo(({
  session,
  productCatalog,
  onShowToast,
  onRefreshCatalog,
}) => {
  // Permission checks
  const userIsAdmin = isSuperadmin(session);
  const canEditData = userIsAdmin || hasPermission(session, 'action_edit_master');
  const canDeleteData = userIsAdmin || hasPermission(session, 'action_delete_master');
  const canExportData = userIsAdmin || hasPermission(session, 'action_export_data');

  // Navigation tabs for mobile / view switcher
  const [activeTab, setActiveTab] = useState<'form' | 'stok' | 'riwayat'>('form');
  const [displayLimit, setDisplayLimit] = useState(30);

  // Form State
  const [namaPeminjam, setNamaPeminjam] = useState<string>('');
  const [noWaPeminjam, setNoWaPeminjam] = useState<string>('');
  const [keperluan, setKeperluan] = useState<string>('');
  const [tglPinjam, setTglPinjam] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [autoSendWa, setAutoSendWa] = useState<boolean>(() => getFonnteConfig().autoSendEnabled);
  const [items, setItems] = useState<PeminjamanItemForm[]>([
    {
      id: 'item-1',
      produk: '',
      size: '',
      sku: '',
      qty: 1,
      lokasi: 'BLOK F',
      stokMap: 0,
      stokStudio: 0,
      stokShp: 0,
      stokTtk: 0,
      selected: false,
    },
  ]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Local users list for auto-complete/suggestions
  const localUsers = useMemo(() => getLocalUsers(), []);

  // Handle borrower name input change with auto-fill phone if available
  const handleNamaPeminjamChange = (val: string) => {
    setNamaPeminjam(val);
    if (!noWaPeminjam.trim()) {
      const match = localUsers.find(
        (u) => (u.name && u.name.toLowerCase() === val.toLowerCase()) ||
               (u.username && u.username.toLowerCase() === val.toLowerCase())
      );
      if (match?.phone) {
        setNoWaPeminjam(match.phone);
      }
    }
  };

  // Channel stock state - Loaded directly from Supabase realtime
  const [selectedChannel, setSelectedChannel] = useState<'STUDIO' | 'SHOPEE' | 'TIKTOK' | 'ALL'>('STUDIO');
  const [searchStock, setSearchStock] = useState<string>('');
  const [searchHistory, setSearchHistory] = useState<string>('');
  const [channelStocks, setChannelStocks] = useState<ChannelStockItem[]>([]);
  const [loadingStock, setLoadingStock] = useState<boolean>(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [activeComboIndex, setActiveComboIndex] = useState<number>(-1);
  const [inputSearchTerm, setInputSearchTerm] = useState<{ [id: string]: string }>({});
  const [realtimeSkuStocks, setRealtimeSkuStocks] = useState<Record<string, StockRealtimeItem[]>>({});

  // Helper to extract warehouse locations with stock > 0
  const getProductLocations = (sku: string, itemLokasi?: string): ProductLocationInfo[] => {
    const cleanSku = String(sku || '').trim().toUpperCase();
    if (!cleanSku) return [];
    const map = new Map<string, ProductLocationInfo>();

    // 1. Authoritative check: live Supabase stok_real_fisik data
    const isRealtimeChecked = cleanSku in realtimeSkuStocks;
    if (isRealtimeChecked) {
      const realtimeList = realtimeSkuStocks[cleanSku] || [];
      // ONLY recommend warehouse locations that currently have physical stock (sisa_stok > 0)!
      realtimeList.forEach((stk) => {
        const loc = String(stk.lokasi || '').trim().toUpperCase();
        const qty = Number(stk.sisa_stok) || 0;
        if (loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc, stk.area) && qty > 0) {
          const existing = map.get(loc);
          if (existing) {
            existing.qty = (existing.qty || 0) + qty;
          } else {
            map.set(loc, {
              lokasi: loc,
              qty: qty,
              isPrimary: false,
              source: 'REALTIME_STOCK',
              area: stk.area || 'Warehouse',
            });
          }
        }
      });

      const sorted = Array.from(map.values()).sort((a, b) => (b.qty || 0) - (a.qty || 0));
      if (sorted.length > 0) {
        sorted[0].isPrimary = true;
      }
      return sorted;
    }

    // 2. Check channelStocks if available
    const csMatch = channelStocks.find((cs) => (cs.sku || '').toUpperCase().trim() === cleanSku);
    if (csMatch && (csMatch.whQty || 0) > 0 && csMatch.whLocStr) {
      const parts = csMatch.whLocStr
        .split(/[,/;\n|]+/)
        .map((s) => String(s || '').trim().toUpperCase())
        .filter((loc) => loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc));
      parts.forEach((loc) => {
        map.set(loc, {
          lokasi: loc,
          qty: csMatch.whQty,
          isPrimary: map.size === 0,
          source: 'REALTIME_STOCK',
        });
      });
      if (map.size > 0) return Array.from(map.values());
    }

    // 3. Fallback only while realtime data is still loading
    const strItemLokasi = String(itemLokasi || '').trim();
    if (strItemLokasi && strItemLokasi !== '-' && strItemLokasi !== '--' && !strItemLokasi.toUpperCase().includes('BLOK F')) {
      const parts = strItemLokasi
        .split(/[,/;\n|]+/)
        .map((s) => String(s || '').trim().toUpperCase())
        .filter((loc) => loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc));
      parts.forEach((loc) => {
        map.set(loc, {
          lokasi: loc,
          isPrimary: map.size === 0,
          source: 'SJ',
        });
      });
    }

    const catMatch = productCatalog.find((p) => (p.k || '').trim().toUpperCase() === cleanSku);
    if (catMatch && Array.isArray(catMatch.locList)) {
      catMatch.locList.forEach((itemLoc) => {
        if (typeof itemLoc === 'object' && itemLoc && itemLoc.lokasi) {
          const loc = String(itemLoc.lokasi || '').trim().toUpperCase();
          const qty = Number(itemLoc.qty) || 0;
          if (loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc) && qty > 0) {
            if (!map.has(loc)) {
              map.set(loc, {
                lokasi: loc,
                qty: qty,
                isPrimary: map.size === 0,
                source: 'CATALOG',
              });
            }
          }
        }
      });
    }

    const allLocs = Array.from(map.values()).filter((l) => l && l.lokasi && l.lokasi !== '-' && isWarehouseLocation(l.lokasi));
    allLocs.sort((a, b) => (b.qty || 0) - (a.qty || 0));
    return allLocs;
  };

  // Helper to get recorded rack locations that have 0 stock
  const getRecordedEmptyLocations = (sku: string): string[] => {
    const cleanSku = String(sku || '').trim().toUpperCase();
    if (!cleanSku || !(cleanSku in realtimeSkuStocks)) return [];
    const list = realtimeSkuStocks[cleanSku] || [];
    const emptyLocs: string[] = [];
    list.forEach((stk) => {
      const loc = String(stk.lokasi || '').trim().toUpperCase();
      const qty = Number(stk.sisa_stok) || 0;
      if (loc && loc !== '-' && loc !== '--' && isWarehouseLocation(loc, stk.area) && qty <= 0) {
        if (!emptyLocs.includes(loc)) emptyLocs.push(loc);
      }
    });
    return emptyLocs;
  };

  // Automatically fetch realtime warehouse stocks for all SKUs in the loan form
  const formSkusKey = useMemo(() => {
    return items
      .map((it) => (it.sku || '').trim().toUpperCase())
      .filter(Boolean)
      .sort()
      .join(',');
  }, [items]);

  useEffect(() => {
    const skus = items.map((it) => (it.sku || '').trim().toUpperCase()).filter(Boolean);
    const uniqueSkus = Array.from(new Set(skus)).filter((s) => !(s in realtimeSkuStocks));
    if (!uniqueSkus.length) return;

    fetchStockForSkus(uniqueSkus)
      .then((stocks) => {
        const map: Record<string, StockRealtimeItem[]> = {};
        uniqueSkus.forEach((s) => { map[s] = []; });
        stocks.forEach((stk) => {
          const key = (stk.sku || '').toUpperCase().trim();
          if (!map[key]) map[key] = [];
          map[key].push(stk);
        });
        setRealtimeSkuStocks((prev) => ({ ...prev, ...map }));
      })
      .catch((err) => console.warn('Gagal memuat stok lokasi realtime peminjaman:', err));
  }, [formSkusKey]);
  
  // Load real channel stocks from Supabase
  const loadChannelStocks = async (showToast = false, keyword?: string) => {
    setLoadingStock(true);
    try {
      const liveStocks = await fetchRealtimeChannelStocksSupabase(keyword);
      if (liveStocks && liveStocks.length > 0) {
        setChannelStocks((prev) => {
          const map = new Map<string, ChannelStockItem>();
          if (keyword) {
            prev.forEach((it) => map.set(it.sku.toUpperCase(), it));
          }
          liveStocks.forEach((it) => map.set(it.sku.toUpperCase(), it));
          return Array.from(map.values()).sort((a, b) => {
            if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
            return a.produk.localeCompare(b.produk);
          });
        });
        if (showToast) onShowToast(`Berhasil memuat ${liveStocks.length} data stok real-time dari Database!`, 'success');
      } else if (productCatalog && productCatalog.length > 0 && channelStocks.length === 0) {
        // Fallback to catalog if no stock logs yet
        const mapped: ChannelStockItem[] = productCatalog.map((p) => ({
          sku: p.k || '',
          produk: p.p || p.k || '',
          size: p.s || 'ALL',
          locStr: p.lokasi || 'Warehouse',
          studioQty: p.stokStudio || 0,
          shpQty: p.stokShp || 0,
          ttkQty: p.stokTtk || 0,
          whQty: 0,
          totalQty: Math.max(0, (p.stokMap !== undefined ? Number(p.stokMap) : ((p.stokStudio || 0) + (p.stokShp || 0) + (p.stokTtk || 0)))),
        }));
        setChannelStocks(mapped);
      }
    } catch (err) {
      console.warn('Error loading real stock from Supabase:', err);
      if (showToast) onShowToast('Gagal memuat stok real Database', 'error');
    } finally {
      setLoadingStock(false);
    }
  };

  // Full Refresh method matching GAS loadPeminjamanInitData
  const handleFullRefresh = async () => {
    setLoadingStock(true);
    try {
      onRefreshCatalog();
      await loadChannelStocks(true);
      const data = await fetchPeminjamanFromSupabase();
      if (data && data.length > 0) {
        setRecords(data);
      }
      onShowToast('Data SPS & Stok Peminjaman berhasil diperbarui!', 'success');
    } catch (e) {
      console.warn('Refresh error:', e);
      onShowToast('Gagal menyinkronkan data', 'error');
    } finally {
      setLoadingStock(false);
    }
  };

  // Live search debounce effect for realtime stock lookup
  useEffect(() => {
    if (!searchStock.trim() || searchStock.trim().length < 2) return;
    const timer = setTimeout(() => {
      loadChannelStocks(false, searchStock.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchStock]);

  // Loan Records history from Supabase with instant local cache
  const [records, setRecords] = useState<PeminjamanRecord[]>(() => {
    try {
      const cached = localStorage.getItem('wms_peminjaman_cache');
      if (cached) return JSON.parse(cached);
    } catch {}
    return getLocalPeminjamanRecords();
  });

  // Modal State for Surat Jalan (PDF / Print / WhatsApp)
  const [selectedRecordForModal, setSelectedRecordForModal] = useState<PeminjamanRecord | null>(null);
  const [copiedWaType, setCopiedWaType] = useState<'personal' | 'grup' | null>(null);
  const [isSendingWaType, setIsSendingWaType] = useState<'personal' | 'grup' | null>(null);
  const [modalWaPeminjam, setModalWaPeminjam] = useState<string>('');

  useEffect(() => {
    if (selectedRecordForModal) {
      setModalWaPeminjam(selectedRecordForModal.noWaPeminjam || selectedRecordForModal.no_wa_peminjam || '');
    }
  }, [selectedRecordForModal]);

  // Edit & Delete Modal States
  const [editingRecord, setEditingRecord] = useState<PeminjamanRecord | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [deleteConfirmRecord, setDeleteConfirmRecord] = useState<PeminjamanRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [editProductSearch, setEditProductSearch] = useState<string>('');
  const [showEditProductDropdown, setShowEditProductDropdown] = useState<boolean>(false);

  const editCatalogSuggestions = useMemo(() => {
    if (!editProductSearch.trim() || editProductSearch.trim().length < 2) return [];
    return productCatalog.filter((prod: any) => 
      fuzzySearchMultiple(editProductSearch.trim(), [prod.nama_produk as string, prod.sku as string, prod.nama as string, prod.size as string])
    ).slice(0, 8);
  }, [productCatalog, editProductSearch]);

  // Load SPS records and real-time stocks from Supabase on mount & set up realtime listener
  useEffect(() => {
    let isMounted = true;
    
    // Initial fetch
    fetchPeminjamanFromSupabase().then((d) => {
      if (isMounted && d && d.length > 0) setRecords(d);
    });
    loadChannelStocks();

    // Supabase Realtime via global store
    let debounceTimer: any = null;
    let pendingSkus = new Set<string>();

    const handlePeminjamanChange = () => {
      fetchPeminjamanFromSupabase().then((d) => {
        if (isMounted && d && d.length > 0) setRecords(d);
      });
    };

    const updateDeltaStocks = async () => {
      if (pendingSkus.size === 0 || !isMounted) return;
      const skus = Array.from(pendingSkus);
      pendingSkus.clear();
      
      try {
        const deltaRows = await fetchChannelStocksBySkus(skus);
        if (deltaRows.length > 0) {
          setChannelStocks((prev) => {
            const map = new Map<string, ChannelStockItem>();
            prev.forEach((it) => map.set(it.sku.toUpperCase(), it));
            deltaRows.forEach((it) => map.set(it.sku.toUpperCase(), it));
            return Array.from(map.values()).sort((a, b) => {
              if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
              return a.produk.localeCompare(b.produk);
            });
          });
        }
      } catch (err) {
        console.warn('Delta stock fetch failed:', err);
      }
    };

    const handleLogChange = (payload: any) => {
      if (payload && payload.new && payload.new.sku) {
        pendingSkus.add(payload.new.sku);
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        updateDeltaStocks();
      }, 500);
    };

    const unsubPeminjaman = globalRealtimeStore.subscribe('peminjaman', handlePeminjamanChange);
    const unsubLog = globalRealtimeStore.subscribe('log_produk', handleLogChange);

    return () => {
      isMounted = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubPeminjaman();
      unsubLog();
    };
  }, []);

  // Synchronize when catalog updates if channelStocks is still empty
  useEffect(() => {
    if (channelStocks.length === 0 && productCatalog && productCatalog.length > 0) {
      loadChannelStocks();
    }
  }, [productCatalog]);

  // Add Item to Form
  const handleAddItem = () => {
    const newItem: PeminjamanItemForm = {
      id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      produk: '',
      size: '',
      sku: '',
      qty: 1,
      lokasi: 'BLOK F',
      stokMap: 0,
      stokStudio: 0,
      stokShp: 0,
      stokTtk: 0,
      selected: false,
    };
    setItems((prev) => [...prev, newItem]);
  };

  // Remove Item from Form
  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Update Item field
  const handleItemChange = (id: string, updates: Partial<PeminjamanItemForm>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...updates } : it))
    );
  };

  // Memoized fast lookup maps and datalist options (Zero-lag, 0ms input delay)
  const { productOptionsList, skuLookupMap, nameLookupMap } = useMemo(() => {
    const skuMap = new Map<string, { sku: string; produk: string; size: string; lokasi: string; stok: number; whQty: number; studioQty: number; shpQty: number; ttkQty: number }>();
    const nameMap = new Map<string, { sku: string; produk: string; size: string; lokasi: string; stok: number; whQty: number; studioQty: number; shpQty: number; ttkQty: number }>();

    // 1. Process ChannelStocks first (direct realtime from stok_real_fisik)
    channelStocks.forEach((cs) => {
      const skuUpper = (cs.sku || '').toUpperCase().trim();
      if (!skuUpper) return;
      const total = typeof cs.totalQty === 'number' ? cs.totalQty : ((cs.whQty || 0) + (cs.studioQty || 0) + (cs.shpQty || 0) + (cs.ttkQty || 0));
      const effectiveSize = (cs.size && cs.size !== 'ALL' && cs.size !== '-') ? cs.size : extractSizeFromSku(cs.sku);
      const itemData = {
        sku: cs.sku,
        produk: cs.produk || cs.sku,
        size: effectiveSize && effectiveSize !== '-' ? effectiveSize : (cs.size || 'ALL'),
        lokasi: cs.whLocStr || cs.locStr || 'Warehouse',
        stok: Math.max(0, total),
        whQty: cs.whQty || 0,
        studioQty: cs.studioQty || 0,
        shpQty: cs.shpQty || 0,
        ttkQty: cs.ttkQty || 0,
      };
      skuMap.set(skuUpper, itemData);
      if (itemData.produk) {
        nameMap.set(itemData.produk.toLowerCase().trim(), itemData);
        nameMap.set(`${itemData.produk.toLowerCase()} ${itemData.size.toLowerCase()}`.trim(), itemData);
      }
    });

    // 2. Merge with productCatalog (from master_produk / catalog)
    const combinedCatalog = productCatalog;
    combinedCatalog.forEach((p) => {
      const skuUpper = (p.k || '').toUpperCase().trim();
      if (!skuUpper) return;
      
      const effectiveSize = (p.s && p.s !== 'ALL' && p.s !== '-') ? p.s : extractSizeFromSku(p.k || '');
      const existing = skuMap.get(skuUpper);
      if (existing) {
        if (existing.produk === skuUpper && p.p && p.p !== skuUpper) {
          existing.produk = p.p;
        }
        if ((!existing.size || existing.size === 'ALL' || existing.size === '-') && effectiveSize && effectiveSize !== '-') {
          existing.size = effectiveSize;
        }
        return;
      }

      // If channelStocks has loaded and SKU is not in channelStocks, physical stock is 0
      const stok = channelStocks.length > 0
        ? 0
        : (p.stokMap !== undefined
            ? Number(p.stokMap)
            : ((p.stokStudio || 0) + (p.stokShp || 0) + (p.stokTtk || 0)));

      const itemData = {
        sku: p.k || '',
        produk: p.p || p.k || '',
        size: effectiveSize && effectiveSize !== '-' ? effectiveSize : (p.s || 'ALL'),
        lokasi: p.lokasi || 'Warehouse',
        stok: Math.max(0, stok || 0),
        whQty: 0,
        studioQty: p.stokStudio || 0,
        shpQty: p.stokShp || 0,
        ttkQty: p.stokTtk || 0,
      };
      skuMap.set(skuUpper, itemData);
      if (itemData.produk) {
        nameMap.set(itemData.produk.toLowerCase().trim(), itemData);
        nameMap.set(`${itemData.produk.toLowerCase()} ${itemData.size.toLowerCase()}`.trim(), itemData);
      }
    });

    const list = Array.from(skuMap.values()).sort((a, b) => {
      if (b.stok !== a.stok) return b.stok - a.stok;
      return a.produk.localeCompare(b.produk);
    });
    return { productOptionsList: list, skuLookupMap: skuMap, nameLookupMap: nameMap };
  }, [productCatalog, channelStocks]);

  // Select a product from suggestions, Enter key, or barcode scanner
  const selectProduct = (
    itemId: string,
    p: {
      sku: string;
      produk: string;
      size: string;
      lokasi: string;
      stok: number;
      studioQty?: number;
      shpQty?: number;
      ttkQty?: number;
    }
  ) => {
    handleItemChange(itemId, {
      sku: p.sku,
      produk: p.produk,
      size: p.size,
      lokasi: p.lokasi,
      stokMap: p.stok,
      stokStudio: p.studioQty || 0,
      stokShp: p.shpQty || 0,
      stokTtk: p.ttkQty || 0,
      selected: true,
    });
    setFocusedItemId(null);
    setActiveComboIndex(-1);
  };

  // Fast Product Input Change Handler (Handles typing / scanning / deleting)
  const handleProductInputChange = (itemId: string, rawVal: string) => {
    setActiveComboIndex(-1);
    const trimmed = rawVal.trim();
    const upper = trimmed.toUpperCase();

    // If input is cleared or empty, reset item fields completely
    if (!trimmed) {
      handleItemChange(itemId, {
        sku: '',
        produk: '',
        size: '',
        stokMap: 0,
        selected: false,
      });
      return;
    }

    // Direct O(1) matching against SKU map ONLY for complete SKU / Barcode scans (minimum 4 characters)
    // NEVER match 1-3 characters (e.g. 'X') and NEVER auto-match against product names on typing!
    if (upper.length >= 4 && skuLookupMap.has(upper)) {
      const matched = skuLookupMap.get(upper)!;
      selectProduct(itemId, matched);
      return;
    }

    // User is actively typing / searching text (e.g. "x", "xerina", etc.)
    const inferredSize = extractSizeFromSku(rawVal);
    handleItemChange(itemId, {
      sku: rawVal,
      produk: rawVal,
      size: inferredSize !== '-' ? inferredSize : '',
      selected: false,
    });
  };

  // Fast custom dropdown renderer inside form with keyboard navigation
  const renderSuggestions = (itemId: string, currentVal: string, isSelected?: boolean) => {
    if (focusedItemId !== itemId || !currentVal.trim() || isSelected) return null;
    const lower = currentVal.trim().toLowerCase();
    const keywords = lower.split(/\s+/).filter(Boolean);

    // Multi-keyword filter + cap to 30 items
    const suggestions = productOptionsList
      .filter((p) => {
        const text = `${p.sku} ${p.produk} ${p.size}`.toLowerCase();
        return keywords.every((kw) => text.includes(kw));
      })
      .sort((a, b) => {
        const aStarts = a.produk.toLowerCase().startsWith(lower) || a.sku.toLowerCase().startsWith(lower);
        const bStarts = b.produk.toLowerCase().startsWith(lower) || b.sku.toLowerCase().startsWith(lower);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      })
      .slice(0, 30);

    if (suggestions.length === 0) {
      return (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700/80 shadow-2xl rounded-xl z-50 p-4 text-center text-xs text-slate-400 italic">
          ❌ Produk tidak ditemukan
        </div>
      );
    }

    return (
      <div
        id={`combo-panel-${itemId}`}
        className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700/80 shadow-2xl rounded-xl z-50 max-h-64 overflow-y-auto"
      >
        {suggestions.map((s, idx) => {
          const isActive = idx === activeComboIndex;
          return (
            <div
              key={`${s.sku}_${s.size || ''}_${idx}`}
              data-index={idx}
              onMouseDown={(e) => {
                e.preventDefault();
                selectProduct(itemId, s);
              }}
              className={`px-3 py-2.5 text-xs cursor-pointer border-b border-slate-100 dark:border-slate-800/60 last:border-0 transition-colors ${
                isActive
                  ? 'bg-blue-500/10 border-l-4 border-l-blue-600 pl-2'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200 whitespace-normal break-words leading-tight">
                    {s.produk}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                    <span className="bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded font-semibold text-slate-600 dark:text-slate-300">
                      {s.sku}
                    </span>
                    <span>&bull;</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Size: {s.size && s.size !== 'ALL' ? s.size : 'ALL'}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${s.stok > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/20' : 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-400 border border-primary-500/20'}`}>
                    {s.stok > 0 ? `${s.stok} pcs` : 'Kosong'}
                  </span>
                </div>
              </div>

              {/* Channel Stock Breakdown Pills */}
              <div className="flex flex-wrap gap-1 mt-1.5">
                <span className={`inline-flex items-center text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${s.stok > 0 ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' : 'bg-slate-100/50 text-slate-400 dark:bg-slate-800/40 dark:text-slate-500'}`}>
                  🏢 MAP: {s.stok || 0}
                </span>
                {(s.studioQty || 0) > 0 && (
                  <span className="inline-flex items-center text-[9px] px-1.5 py-0.2 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 rounded font-mono font-bold border border-emerald-500/20">
                    📍 Studio: {s.studioQty}
                  </span>
                )}
                {(s.shpQty || 0) > 0 && (
                  <span className="inline-flex items-center text-[9px] px-1.5 py-0.2 bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded font-mono font-bold border border-amber-500/20">
                    🧡 SHP: {s.shpQty}
                  </span>
                )}
                {(s.ttkQty || 0) > 0 && (
                  <span className="inline-flex items-center text-[9px] px-1.5 py-0.2 bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-200 rounded font-mono font-bold">
                    🖤 TTK: {s.ttkQty}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Keyboard navigation handler for Combobox input
  const handleProductInputKeyDown = (e: React.KeyboardEvent, itemId: string, currentVal: string) => {
    const trimmed = currentVal.trim();
    const lower = trimmed.toLowerCase();
    const keywords = lower.split(/\s+/).filter(Boolean);
    const upper = trimmed.toUpperCase();

    const suggestions = productOptionsList
      .filter((p) => {
        const text = `${p.sku} ${p.produk} ${p.size}`.toLowerCase();
        return keywords.every((kw) => text.includes(kw));
      })
      .slice(0, 30);

    if (e.key === 'ArrowDown') {
      if (suggestions.length > 0) {
        e.preventDefault();
        setActiveComboIndex((prev) => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      if (suggestions.length > 0) {
        e.preventDefault();
        setActiveComboIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // 1. If an item from dropdown is highlighted via arrow keys:
      if (activeComboIndex >= 0 && activeComboIndex < suggestions.length) {
        selectProduct(itemId, suggestions[activeComboIndex]);
        return;
      }
      // 2. Exact SKU match (e.g. barcode scanner ended with Enter):
      if (skuLookupMap.has(upper)) {
        selectProduct(itemId, skuLookupMap.get(upper)!);
        return;
      }
      // 3. If there are filtered suggestions, pick the first one on Enter:
      if (suggestions.length > 0) {
        selectProduct(itemId, suggestions[0]);
        return;
      }
    } else if (e.key === 'Escape') {
      setFocusedItemId(null);
      setActiveComboIndex(-1);
    }
  };

  // Blur handler: Only commit if exact SKU of length >= 4
  const handleProductInputBlur = (itemId: string, currentVal: string) => {
    const trimmed = currentVal.trim();
    if (!trimmed) return;
    const upper = trimmed.toUpperCase();

    // If exact SKU in lookup map and length >= 4, ensure it's selected
    if (upper.length >= 4 && skuLookupMap.has(upper)) {
      const matched = skuLookupMap.get(upper)!;
      selectProduct(itemId, matched);
      return;
    }
    // No fuzzy substring match on blur!
  };

  // Submit Peminjaman Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaPeminjam.trim()) {
      onShowToast('Nama / PIC Peminjam wajib diisi', 'error');
      return;
    }
    if (!keperluan.trim()) {
      onShowToast('Keperluan peminjaman wajib diisi', 'error');
      return;
    }
    if (!tglPinjam) {
      onShowToast('Tanggal pinjam wajib diisi', 'error');
      return;
    }

    const validItems = items
      .filter((it) => it.produk.trim() && Number(it.qty) > 0)
      .map((it) => ({
        ...it,
        qty: Math.max(1, Number(it.qty) || 1),
      }));
    if (validItems.length === 0) {
      onShowToast('Pilih minimal 1 item produk yang valid', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const noSps = `SPS-${Date.now().toString().slice(-6)}`;
      const nowIso = new Date().toISOString();

      const newRecord: PeminjamanRecord = {
        id: noSps,
        noPeminjaman: noSps,
        namaPeminjam: namaPeminjam.trim(),
        noWaPeminjam: noWaPeminjam.trim(),
        no_wa_peminjam: noWaPeminjam.trim(),
        keperluan: keperluan.trim(),
        tglPinjam,
        timestamp: nowIso,
        status: 'Dipinjam',
        items: validItems.map((it) => {
          const rawSize = (it.size || '').trim();
          const cleanSize = (rawSize && rawSize !== '-') 
            ? rawSize 
            : (extractSizeFromSku(it.sku) !== '-' ? extractSizeFromSku(it.sku) : 'ALL');
          const formattedNama = it.produk;
          const cleanSku = (it.sku || '').toUpperCase().trim();
          const locs = getProductLocations(cleanSku, it.lokasi);
          const emptyRacks = getRecordedEmptyLocations(cleanSku);
          const primaryLoc = locs.length > 0 
            ? locs[0].lokasi 
            : (it.lokasi && it.lokasi !== '-' && !it.lokasi.includes('BLOK F') 
                ? it.lokasi 
                : (emptyRacks.length > 0 ? `KOSONG (${emptyRacks.join(',')})` : 'BLOK F'));
          return {
            produk: formattedNama,
            sku: it.sku || `SKU-${it.produk.slice(0, 4).toUpperCase()}`,
            size: cleanSize,
            qty: it.qty,
            lokasi: primaryLoc,
          };
        }),
        username: session?.username || 'Operator',
      };

      // 1. Save directly to Supabase peminjaman
      await savePeminjamanToSupabase(newRecord);

      // 2. Also create picking tasks in Supabase for Fulfillment
      try {
        const pickingTasks: PickingListItem[] = validItems.map((it) => {
          const rawSize = (it.size || '').trim();
          const cleanSize = (rawSize && rawSize !== '-') 
            ? rawSize 
            : (extractSizeFromSku(it.sku) !== '-' ? extractSizeFromSku(it.sku) : 'ALL');
          const formattedNama = it.produk;
          const cleanSku = (it.sku || '').toUpperCase().trim();
          const locs = getProductLocations(cleanSku, it.lokasi);
          const emptyRacks = getRecordedEmptyLocations(cleanSku);
          const primaryLoc = locs.length > 0 
            ? locs[0].lokasi 
            : (it.lokasi && it.lokasi !== '-' && !it.lokasi.includes('BLOK F') 
                ? it.lokasi 
                : (emptyRacks.length > 0 ? `KOSONG (${emptyRacks.join(',')})` : 'BLOK F'));
          return {
            no_sj: noSps,
            tanggal: tglPinjam,
            tujuan: `SPS: ${namaPeminjam.trim()} - ${keperluan.trim()}`,
            sku: it.sku.toUpperCase(),
            nama_produk: formattedNama,
            size: cleanSize,
            qty_req: it.qty,
            qty_picked: 0,
            lokasi: primaryLoc,
            status: 'PENDING',
            created_at: nowIso,
          };
        });
        await supabaseFetch('picking_list', 'POST', pickingTasks);
      } catch (err) {
        console.warn('Gagal menambahkan ke picking_list Supabase', err);
      }

      // Update state & cache
      const updated = [newRecord, ...records.filter((r) => r.noPeminjaman !== noSps)];
      setRecords(updated);
      saveLocalPeminjamanRecords(updated);
      try {
        localStorage.setItem('wms_peminjaman_cache', JSON.stringify(updated));
      } catch {}

      // Open Surat Jalan preview modal for the newly created record
      setSelectedRecordForModal(newRecord);

      // Reset form
      const submittedBorrowerName = namaPeminjam.trim();
      const submittedPhone = noWaPeminjam.trim();
      setNamaPeminjam('');
      setNoWaPeminjam('');
      setKeperluan('');
      setItems([
        {
          id: 'item-1',
          produk: '',
          size: '',
          sku: '',
          qty: 1,
          lokasi: 'BLOK F',
          stokMap: 0,
          stokStudio: 0,
          stokShp: 0,
          stokTtk: 0,
        },
      ]);

      // 3. Automatic WhatsApp Notifications (Picking List ke Grup Gudang & Notif Personal ke Peminjam)
      if (autoSendWa) {
        const fonnteConfig = getFonnteConfig();
        if (!fonnteConfig.token) {
          onShowToast(`Peminjaman ${noSps} disimpan! (Token Fonnte belum diatur di Pengaturan)`, 'warning');
        } else {
          onShowToast(`Peminjaman ${noSps} tersimpan! Mengirim WhatsApp otomatis...`, 'info');
          sendPeminjamanAutoWhatsApp(newRecord, {
            noWaPeminjam: submittedPhone,
            operatorName: session?.name || session?.username || 'Petugas WMS',
            sendGroup: Boolean(fonnteConfig.groupTarget),
            sendPersonal: Boolean(submittedPhone),
          }).then((res) => {
            const successParts: string[] = [];
            const failParts: string[] = [];

            if (res.group.attempted) {
              if (res.group.success) successParts.push('Grup Gudang (Picking List)');
              else failParts.push(`Grup gagal: ${res.group.message}`);
            } else if (!fonnteConfig.groupTarget) {
              failParts.push('Target grup gudang belum diatur');
            }

            if (res.personal.attempted) {
              if (res.personal.success) successParts.push(`Peminjam (${submittedBorrowerName})`);
              else failParts.push(`Pribadi gagal: ${res.personal.message}`);
            } else if (!submittedPhone) {
              failParts.push('No WA peminjam kosong');
            }

            if (successParts.length > 0) {
              onShowToast(`✅ WA Otomatis terkirim: ${successParts.join(' & ')}!`, 'success');
            }
            if (failParts.length > 0) {
              onShowToast(`Catatan WA: ${failParts.join(', ')}`, 'info');
            }
          }).catch((err) => {
            console.error('Failed auto-send WA', err);
            onShowToast('Gagal memproses pengiriman WhatsApp otomatis', 'error');
          });
        }
      } else {
        onShowToast(`Peminjaman ${noSps} berhasil disimpan ke Database!`, 'success');
      }

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Gagal mengirim pengajuan peminjaman';
      onShowToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Export Channel Stock to CSV
  const handleExportStockCSV = () => {
    if (!canExportData) {
      onShowToast('Akses ditolak: Anda tidak memiliki izin untuk mengekspor data stok.', 'warning');
      return;
    }
    if (filteredStocks.length === 0) {
      onShowToast('Tidak ada data stok untuk diexport', 'warning');
      return;
    }

    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    if (selectedChannel === 'ALL') {
      headers = ['PRODUK', 'SIZE', 'SKU', 'LOKASI / RAK', 'STUDIO (BLOK F)', 'SHOPEE (SHP)', 'TIKTOK (TTK)', 'TOTAL LIVE'];
      rows = filteredStocks.map((it) => [
        `"${it.produk.replace(/"/g, '""')}"`,
        `"${it.size}"`,
        `"${it.sku}"`,
        `"${it.locStr || '-'}"`,
        it.studioQty,
        it.shpQty,
        it.ttkQty,
        it.studioQty + it.shpQty + it.ttkQty,
      ]);
    } else {
      const channelLabel = selectedChannel === 'STUDIO' ? 'STUDIO' : selectedChannel === 'SHOPEE' ? 'SHOPEE' : 'TIKTOK';
      headers = ['PRODUK', 'SIZE', 'SKU', 'LOKASI / RAK', `QTY ${channelLabel}`];
      rows = filteredStocks.map((it) => {
        const qty = selectedChannel === 'STUDIO' ? it.studioQty : selectedChannel === 'SHOPEE' ? it.shpQty : it.ttkQty;
        return [
          `"${it.produk.replace(/"/g, '""')}"`,
          `"${it.size}"`,
          `"${it.sku}"`,
          `"${it.locStr || '-'}"`,
          qty,
        ];
      });
    }

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stok_live_peminjaman_${selectedChannel.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Data stok peminjaman berhasil diexport ke CSV', 'success');
  };

  // Filter channel stocks
  const deferredSearchStock = useDeferredValue(searchStock);
  const filteredStocks = useMemo(() => {
    const filtered = channelStocks.filter((it) => {
      // Channel / Area filter
      if (selectedChannel === 'STUDIO') {
        if (it.studioQty <= 0) return false;
      } else if (selectedChannel === 'SHOPEE') {
        if (it.shpQty <= 0) return false;
      } else if (selectedChannel === 'TIKTOK') {
        if (it.ttkQty <= 0) return false;
      } else if (selectedChannel === 'ALL') {
        if ((it.studioQty <= 0) && (it.shpQty <= 0) && (it.ttkQty <= 0) && ((it.totalQty || 0) <= 0)) return false;
      }

      // Search query filter (Multi-keyword partial matching)
      if (!deferredSearchStock.trim()) return true;
      return partialSearchMatch(deferredSearchStock, it.sku, it.produk, it.size, it.locStr);
    });
    
    return sortAlphabeticalAndSize<ChannelStockItem>(filtered, (i) => i.produk || i.sku || '', (i) => i.size || '');
  }, [channelStocks, selectedChannel, deferredSearchStock]);

  // Filter history records
  const deferredSearchHistory = useDeferredValue(searchHistory);
  const filteredHistory = useMemo(() => {
    if (!deferredSearchHistory.trim()) return records;
    return records.filter((rec) => {
      const itemTexts = rec.items.map((it) => `${it.produk} ${it.sku} ${it.size} ${it.lokasi}`);
      return partialSearchMatch(
        deferredSearchHistory,
        rec.noPeminjaman,
        rec.namaPeminjam,
        rec.keperluan,
        rec.tglPinjam,
        rec.status,
        ...itemTexts
      );
    });
  }, [records, deferredSearchHistory]);

  // Calculate totals
  const totalStockItems = filteredStocks.length;
  const totalStockPcs = filteredStocks.reduce((acc, curr) => {
    if (selectedChannel === 'STUDIO') return acc + curr.studioQty;
    if (selectedChannel === 'SHOPEE') return acc + curr.shpQty;
    if (selectedChannel === 'TIKTOK') return acc + curr.ttkQty;
    return acc + curr.studioQty + curr.shpQty + curr.ttkQty;
  }, 0);

  // WhatsApp Message Generator
  const generateWaMessage = (record: PeminjamanRecord, type: 'personal' | 'grup', customPhone?: string) => {
    if (type === 'personal') {
      return generatePeminjamanPersonalMessage(record, session?.name || session?.username);
    } else {
      const phone = customPhone || record.noWaPeminjam || record.no_wa_peminjam;
      return generatePeminjamanGroupMessage(record, session?.name || session?.username, phone);
    }
  };

  // Send WhatsApp Text via Fonnte with Web fallback & clipboard copy
  const handleSendWa = async (record: PeminjamanRecord, type: 'personal' | 'grup', customTargetPhone?: string) => {
    const config = getFonnteConfig();
    const isPersonal = type === 'personal';
    let target = isPersonal
      ? (customTargetPhone || modalWaPeminjam || record.noWaPeminjam || record.no_wa_peminjam || '')
      : config.groupTarget;

    if (isPersonal && !target.trim()) {
      const prompted = prompt('Masukkan nomor WhatsApp PIC Peminjam (Cth: 0812... / 628...):', '');
      if (prompted && prompted.trim()) {
        target = prompted.trim();
        record.noWaPeminjam = target;
        record.no_wa_peminjam = target;
        setModalWaPeminjam(target);
      }
    }

    const text = generateWaMessage(record, type, target);

    // Always copy text to clipboard as safety net
    try {
      await navigator.clipboard.writeText(text);
    } catch {}

    if (!config.token) {
      onShowToast(`Pesan disalin ke clipboard! (Token Fonnte belum diatur di Pengaturan)`, 'warning');
      if (target) {
        window.open(getWhatsAppWebUrl(target, text), '_blank');
      }
      return;
    }

    if (!target) {
      if (isPersonal) {
        onShowToast('Nomor tujuan PIC belum diisi. Pesan disalin ke clipboard.', 'warning');
      } else {
        onShowToast('Nomor target grup gudang belum diatur di Pengaturan. Pesan disalin ke clipboard.', 'warning');
      }
      return;
    }

    setIsSendingWaType(type);
    try {
      const res = await sendFonnteMessage(target, text, config.token);
      if (res.success) {
        setCopiedWaType(type);
        onShowToast(`✅ Pesan WhatsApp (${isPersonal ? 'Notif Peminjam' : 'Picking List Grup'}) berhasil dikirim via Fonnte!`, 'success');
        setTimeout(() => setCopiedWaType(null), 3000);
      } else {
        throw new Error(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error menghubungi API Fonnte';
      onShowToast(`Gagal kirim via Fonnte: ${msg}. (Pesan telah disalin)`, 'error');
    } finally {
      setIsSendingWaType(null);
    }
  };

  // Print Surat Jalan
  const handlePrintSJ = (record: PeminjamanRecord) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      onShowToast('Popup terblokir, izinkan popup browser untuk cetak PDF', 'warning');
      return;
    }

    const itemsRows = record.items
      .map((it, idx) => {
        const cleanSku = (it.sku || '').toUpperCase().trim();
        const locs = getProductLocations(cleanSku, it.lokasi);
        let locText = it.lokasi || '-';
        let isKosong = false;
        if (locs.length > 0) {
          locText = locs.map((l) => `${l.lokasi} (${l.qty || 0} pcs)`).join(', ');
        } else if (cleanSku in realtimeSkuStocks) {
          const empty = getRecordedEmptyLocations(cleanSku);
          locText = empty.length > 0 ? `KOSONG (Rak: ${empty.join(', ')})` : 'KOSONG (0 pcs)';
          isKosong = true;
        } else if (it.lokasi && it.lokasi.includes('KOSONG')) {
          isKosong = true;
        }

        return `
      <tr>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.produk}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${it.size}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${it.sku}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.qty}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: 700; color: ${isKosong ? '#e11d48' : '#047857'};">${locText}</td>
      </tr>
    `;
      })
      .join('');

    const qrText = encodeURIComponent(`#OUT "Peminjaman Invoice ${record.noPeminjaman}"`);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${qrText}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Surat Peminjaman Sementara - ${record.noPeminjaman}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #10b981; padding-bottom: 12px; margin-bottom: 16px; }
          .logo-title { font-size: 20px; font-weight: 800; color: #0f172a; }
          .logo-sub { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
          .info-table td { padding: 4px 0; vertical-align: top; }
          .label { width: 160px; color: #64748b; font-weight: 600; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
          .items-table th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 6px; text-align: left; text-transform: uppercase; font-size: 11px; }
          .footer-sign { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; text-align: center; margin-top: 40px; font-size: 12px; }
          .sign-box { height: 65px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-title" style="display: flex; align-items: center; gap: 8px;">
              <img src="/logo.svg" alt="Logo" referrerPolicy="no-referrer" style="height: 28px; object-fit: contain;" onerror="this.style.display='none'" />
              <span>WMS</span>
            </div>
            <div class="logo-sub">Surat Peminjaman Sementara (SPS)</div>
          </div>
          <div style="text-align:right;">
            <img src="${qrUrl}" width="80" height="80" alt="QR Code" style="display:block; margin-left:auto;" />
          </div>
        </div>

        <table class="info-table">
          <tr><td class="label">No Peminjaman</td><td><b>${record.noPeminjaman}</b></td></tr>
          <tr><td class="label">Tanggal Pengajuan</td><td>${new Date(record.timestamp).toLocaleString('id-ID')}</td></tr>
          <tr><td class="label">Nama / PIC Peminjam</td><td><b>${record.namaPeminjam}</b></td></tr>
          <tr><td class="label">Keperluan</td><td>${record.keperluan}</td></tr>
          <tr><td class="label">Tanggal Peminjaman</td><td>${record.tglPinjam}</td></tr>
          <tr><td class="label">Status Dokumen</td><td><b style="color:#059669;">${record.status}</b></td></tr>
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width:35px; text-align:center;">No</th>
              <th>Nama Produk</th>
              <th style="width:55px; text-align:center;">Size</th>
              <th style="width:110px;">SKU</th>
              <th style="width:45px; text-align:center;">Qty</th>
              <th style="width:110px;">Lokasi</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="footer-sign">
          <div>
            <div>Peminjam / PIC</div>
            <div class="sign-box"></div>
            <div>( ${record.namaPeminjam} )</div>
          </div>
          <div>
            <div>Petugas Gudang / Scanner</div>
            <div class="sign-box"></div>
            <div>( ${session?.username || 'Petugas WMS'} )</div>
          </div>
          <div>
            <div>Kepala Gudang / Admin</div>
            <div class="sign-box"></div>
            <div>( .......................... )</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Toggle return status
  const handleToggleReturn = async (recordId: string) => {
    if (!canEditData) {
      onShowToast('Akses ditolak: Anda tidak memiliki izin untuk mengubah status peminjaman.', 'warning');
      return;
    }
    const target = records.find((r) => r.id === recordId || r.noPeminjaman === recordId);
    const nextStatus = target?.status === 'Dipinjam' ? 'Dikembalikan' : 'Dipinjam';

    const updated = records.map((r) => {
      if (r.id === recordId || r.noPeminjaman === recordId) {
        return { ...r, status: nextStatus as 'Dipinjam' | 'Dikembalikan' };
      }
      return r;
    });
    setRecords(updated);
    saveLocalPeminjamanRecords(updated);
    try {
      localStorage.setItem('wms_peminjaman_cache', JSON.stringify(updated));
    } catch {}

    if (target) {
      if (nextStatus === 'Dikembalikan') {
        await returnPeminjamanSupabase(target.noPeminjaman);
      } else {
        await savePeminjamanToSupabase({ ...target, status: 'Dipinjam' });
      }
    }
    onShowToast(`Status ${target?.noPeminjaman || 'peminjaman'} diubah menjadi ${nextStatus}!`, 'success');
  };

  // Open Edit Modal
  const handleStartEdit = (rec: PeminjamanRecord) => {
    if (!canEditData) {
      onShowToast('Akses ditolak: Anda tidak memiliki izin untuk mengedit data peminjaman.', 'warning');
      return;
    }
    setEditingRecord(JSON.parse(JSON.stringify(rec)));
    setEditProductSearch('');
    setShowEditProductDropdown(false);
  };

  // Add Item in Edit Modal
  const handleAddItemInEdit = (prod?: any) => {
    if (!editingRecord) return;
    const cleanSku = (prod?.sku || '').trim().toUpperCase();
    const cleanSize = prod?.size || (cleanSku ? extractSizeFromSku(cleanSku) : 'ALL');
    const newItem: PeminjamanItemForm = {
      id: `edit-item-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      produk: prod?.nama_produk || prod?.nama || prod?.produk || '',
      sku: cleanSku,
      size: cleanSize && cleanSize !== '-' ? cleanSize : 'ALL',
      qty: 1,
      lokasi: prod?.lokasi || 'BLOK F',
      stokMap: 0,
      stokStudio: 0,
      stokShp: 0,
      stokTtk: 0,
    };
    setEditingRecord({
      ...editingRecord,
      items: [...(editingRecord.items || []), newItem],
    });
    setEditProductSearch('');
    setShowEditProductDropdown(false);
  };

  // Update Item field in Edit Modal
  const handleUpdateItemInEdit = (index: number, field: string, value: any) => {
    if (!editingRecord || !editingRecord.items) return;
    const nextItems = [...editingRecord.items];
    nextItems[index] = { ...nextItems[index], [field]: value };
    setEditingRecord({ ...editingRecord, items: nextItems });
  };

  // Remove Item in Edit Modal
  const handleDeleteItemInEdit = (index: number) => {
    if (!editingRecord || !editingRecord.items) return;
    if (editingRecord.items.length <= 1) {
      onShowToast('Peminjaman minimal harus memiliki 1 barang!', 'warning');
      return;
    }
    const nextItems = editingRecord.items.filter((_, i) => i !== index);
    setEditingRecord({ ...editingRecord, items: nextItems });
  };

  // Save Edit to Supabase & Local Cache
  const handleSaveEdit = async () => {
    if (!canEditData) {
      onShowToast('Akses ditolak: Anda tidak memiliki izin untuk menyimpan perubahan peminjaman.', 'warning');
      return;
    }
    if (!editingRecord) return;
    const no = editingRecord.noPeminjaman || editingRecord.id;
    if (!no) return;

    if (!editingRecord.namaPeminjam?.trim()) {
      onShowToast('Nama peminjam wajib diisi!', 'warning');
      return;
    }

    if (!editingRecord.items || editingRecord.items.length === 0) {
      onShowToast('Daftar barang tidak boleh kosong!', 'warning');
      return;
    }

    for (const it of editingRecord.items) {
      if (!it.qty || Number(it.qty) <= 0) {
        onShowToast(`Qty barang "${it.produk || it.sku}" harus lebih dari 0!`, 'warning');
        return;
      }
    }

    setIsSavingEdit(true);
    showGlobalLoading('Menyimpan perubahan peminjaman...');
    try {
      const ok = await updatePeminjamanInSupabase(editingRecord);
      if (!ok) throw new Error('Gagal memperbarui data di Supabase');

      const updated = records.map((r) =>
        (r.noPeminjaman === no || r.id === no) ? editingRecord : r
      );
      setRecords(updated);
      saveLocalPeminjamanRecords(updated);
      try {
        localStorage.setItem('wms_peminjaman_cache', JSON.stringify(updated));
      } catch {}

      if (selectedRecordForModal && (selectedRecordForModal.noPeminjaman === no || selectedRecordForModal.id === no)) {
        setSelectedRecordForModal(editingRecord);
      }

      onShowToast(`Data peminjaman ${no} berhasil diperbarui!`, 'success');
      setEditingRecord(null);
    } catch (err: any) {
      console.error('Save edit error:', err);
      onShowToast(err.message || 'Gagal menyimpan perubahan', 'error');
    } finally {
      setIsSavingEdit(false);
      hideGlobalLoading();
    }
  };

  // Delete Record from Supabase & Local Cache
  const handleDeleteRecord = async (rec: PeminjamanRecord) => {
    if (!canDeleteData) {
      onShowToast('Akses ditolak: Anda tidak memiliki izin untuk menghapus data peminjaman.', 'warning');
      return;
    }
    const no = rec.noPeminjaman || rec.id;
    if (!no) return;

    setIsDeleting(true);
    showGlobalLoading('Menghapus data peminjaman...');
    try {
      const ok = await deletePeminjamanFromSupabase(no);
      if (!ok) throw new Error('Gagal menghapus data dari Supabase');

      const updated = records.filter((r) => r.noPeminjaman !== no && r.id !== no);
      setRecords(updated);
      saveLocalPeminjamanRecords(updated);
      try {
        localStorage.setItem('wms_peminjaman_cache', JSON.stringify(updated));
      } catch {}

      if (selectedRecordForModal && (selectedRecordForModal.noPeminjaman === no || selectedRecordForModal.id === no)) {
        setSelectedRecordForModal(null);
      }
      setDeleteConfirmRecord(null);

      onShowToast(`Data peminjaman ${no} berhasil dihapus!`, 'success');
    } catch (err: any) {
      console.error('Delete error:', err);
      onShowToast(err.message || 'Gagal menghapus peminjaman', 'error');
    } finally {
      setIsDeleting(false);
      hideGlobalLoading();
    }
  };

  return (
    <div id="peminjamanContainer" className="flex-1 p-2 sm:p-4 max-w-7xl mx-auto w-full space-y-3 sm:space-y-2">
      {/* 3 Tabs Peminjaman Sementara - Standar Style Quality Control */}
      <div className="bg-slate-100/90 dark:bg-[#09090b]/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
        <div className="grid grid-cols-3 sm:flex sm:items-center gap-1 sm:gap-1.5">
          {/* Tab 1: Form Pengajuan */}
          <button
            type="button"
            id="tab-peminjaman-form"
            onClick={() => setActiveTab('form')}
            className={`w-full flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-center transition-all duration-200 cursor-pointer ${
              activeTab === 'form'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-500/50'
                : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="text-[11px] sm:text-xs md:text-sm leading-tight">
              <span className="sm:hidden">Form</span>
              <span className="hidden sm:inline">Form Pengajuan</span>
            </span>
          </button>

          {/* Tab 2: Stok Live Channel */}
          <button
            type="button"
            id="tab-peminjaman-stok"
            onClick={() => setActiveTab('stok')}
            className={`w-full flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-center transition-all duration-200 cursor-pointer ${
              activeTab === 'stok'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-1 ring-emerald-500/50'
                : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <div className="flex items-center justify-center gap-1 min-w-0">
              <span className="text-[11px] sm:text-xs md:text-sm leading-tight">
                <span className="sm:hidden">Stok</span>
                <span className="hidden sm:inline">Stok Live</span>
              </span>
              <span
                className={`px-1.5 py-0.2 text-[9px] sm:text-[10px] font-mono rounded-full font-bold transition-colors shrink-0 ${
                  activeTab === 'stok'
                    ? 'bg-white/25 text-white'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300'
                }`}
              >
                {totalStockPcs}
              </span>
            </div>
          </button>

          {/* Tab 3: Riwayat */}
          <button
            type="button"
            id="tab-peminjaman-riwayat"
            onClick={() => setActiveTab('riwayat')}
            className={`w-full flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-center transition-all duration-200 cursor-pointer ${
              activeTab === 'riwayat'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-indigo-500/50'
                : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <div className="flex items-center justify-center gap-1 min-w-0">
              <span className="text-[11px] sm:text-xs md:text-sm leading-tight">
                <span className="sm:hidden">Riwayat</span>
                <span className="hidden sm:inline">Riwayat Peminjaman</span>
              </span>
              <span
                className={`px-1.5 py-0.2 text-[9px] sm:text-[10px] font-mono rounded-full font-bold transition-colors shrink-0 ${
                  activeTab === 'riwayat'
                    ? 'bg-white/25 text-white'
                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300'
                }`}
              >
                {records.length}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Main 2-Panel Split Container for Desktop & Responsive Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-5 items-start">
        {/* LEFT COLUMN: FORM PENGAJUAN (Visible in 'form' tab or on lg screens) */}
        <div
          className={`lg:col-span-6 xl:col-span-7 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-2 sm:p-3 shadow-xs space-y-2 ${
            activeTab === 'stok' ? 'hidden lg:block' : activeTab === 'riwayat' ? 'hidden' : 'block'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg">
                <FileText className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                  Form Pengajuan Peminjaman Sementara
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pengajuan barang untuk Live TikTok, Shopee, Foto Studio, dan Warehouse
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleFullRefresh}
              className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Refresh Stok & Data SPS"
            >
              <RefreshCw className={`w-3 h-3 text-blue-600 dark:text-blue-400 ${loadingStock ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-mono">
              1. INFORMASI PEMINJAM (DIVISI LIVE / STUDIO)
            </div>

            {/* PIC, No WA & Keperluan Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    NAMA / PIC PEMINJAM <span className="text-primary-500">*</span>
                  </label>
                  {session && (
                    <button
                      type="button"
                      onClick={() => {
                        const myName = session.name || session.username;
                        setNamaPeminjam(myName);
                        const match = localUsers.find((u) => u.username === session.username);
                        if (match?.phone) {
                          setNoWaPeminjam(match.phone);
                        } else if (session.no_hp) {
                          setNoWaPeminjam(session.no_hp);
                        }
                      }}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-bold"
                    >
                      Saya Sendiri
                    </button>
                  )}
                </div>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    list="pic-peminjam-datalist"
                    value={namaPeminjam}
                    onChange={(e) => handleNamaPeminjamChange(e.target.value)}
                    placeholder="Contoh: Sarah / Host Live"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                  />
                  <datalist id="pic-peminjam-datalist">
                    {localUsers.map((u, idx) => (
                      <option key={idx} value={u.name || u.username}>
                        {u.role ? `(${u.role})` : ''} {u.phone ? `- WA: ${u.phone}` : ''}
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider flex items-center justify-between">
                  <span>NO. WHATSAPP PEMINJAM</span>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-normal lowercase">(notif otomatis)</span>
                </label>
                <div className="relative">
                  <Smartphone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    value={noWaPeminjam}
                    onChange={(e) => setNoWaPeminjam(e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  KEPERLUAN PEMINJAMAN <span className="text-primary-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={keperluan}
                  onChange={(e) => setKeperluan(e.target.value)}
                  placeholder="Contoh: Live TikTok / Live Shopee / Studio"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Tanggal Pinjam */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                TANGGAL PINJAM <span className="text-primary-500">*</span>
              </label>
              <div className="relative max-w-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="date"
                  required
                  value={tglPinjam}
                  onChange={(e) => setTglPinjam(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Multi-item rows section */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-mono">
                  2. DAFTAR BARANG YANG DIPINJAM ({items.length} ITEM)
                </span>
                <button
                  type="button"
                  id="btnTambahItemAtas"
                  onClick={handleAddItem}
                  className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>+ Tambah Item</span>
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-3" id="itemContainer">
                {items.map((item, index) => {
                  const hasSelected = Boolean(item.selected && item.sku);
                  const mapStok = item.stokMap || 0;
                  const isKosong = mapStok <= 0;
                  const isKurang = Number(item.qty) > mapStok;

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 relative shadow-xs"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[10px] flex items-center justify-center font-black">
                            {index + 1}
                          </span>
                          <span>PILIH PRODUK &amp; SIZE <span className="text-primary-500">*</span></span>
                        </span>
                        {hasSelected && (
                          <span
                            className={`font-mono text-[10px] font-extrabold px-2 py-0.5 rounded border ${
                              isKosong
                                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900/50'
                                : isKurang
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-900/50'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900/50'
                            }`}
                          >
                            {isKosong ? '❌ MAP KOSONG' : isKurang ? `⚠️ SISA MAP: ${mapStok}` : `✅ STOK MAP: ${mapStok}`}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                        {/* Barcode / SKU / Text Input with floating instant search suggestions (7 cols) */}
                        <div className="sm:col-span-7 relative">
                          <div className="relative">
                            <input
                              id={`inputPeminjamanSku-${item.id}`}
                              type="text"
                              value={item.sku || item.produk || ''}
                              onChange={(e) => {
                                handleProductInputChange(item.id, e.target.value);
                              }}
                              onKeyDown={(e) => handleProductInputKeyDown(e, item.id, item.sku || item.produk || '')}
                              onFocus={() => setFocusedItemId(item.id)}
                              onBlur={(e) => {
                                setTimeout(() => {
                                  if (focusedItemId === item.id) setFocusedItemId(null);
                                  handleProductInputBlur(item.id, e.target.value);
                                }, 250);
                              }}
                              placeholder="Ketik nama produk / SKU..."
                              className="w-full pl-3 pr-8 py-2 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                              autoComplete="off"
                            />
                            {(item.sku || item.produk) && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleItemChange(item.id, { produk: '', sku: '', size: '', stokMap: 0, selected: false });
                                }}
                                className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded cursor-pointer"
                                title="Hapus / Reset"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {renderSuggestions(item.id, item.sku || item.produk || '', item.selected)}
                          </div>

                          {/* Selected Item Detail preview card */}
                          {item.selected && item.produk && item.sku && (
                            <div className="mt-1.5 px-2.5 py-1.5 bg-white dark:bg-[#131d31] border border-slate-200/80 dark:border-slate-800 rounded-lg flex flex-col gap-1.5 text-xs">
                              <div className="flex items-center justify-between min-w-0">
                                <div className="min-w-0 pr-2">
                                  <div className="font-bold text-slate-900 dark:text-slate-100 whitespace-normal break-words leading-tight text-[11px]">
                                    {item.produk}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
                                    <span>SKU: <b className="text-slate-700 dark:text-slate-300">{item.sku}</b></span>
                                    <span>&bull;</span>
                                    <span>Size: <b className="text-blue-600 dark:text-blue-400">{item.size || 'ALL'}</b></span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${(item.stokMap || 0) > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900/50' : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900/50'}`}>
                                    {(item.stokMap || 0) > 0 ? `${item.stokMap} pcs` : 'Sold'}
                                  </span>
                                </div>
                              </div>
                              
                              {/* Stock Locations Detail Row */}
                              <div className="flex flex-wrap items-center gap-1 mt-0.5 pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60">
                                {(() => {
                                  const cleanSku = item.sku.toUpperCase().trim();
                                  const locs = getProductLocations(cleanSku, item.lokasi);
                                  const emptyRacks = getRecordedEmptyLocations(cleanSku);
                                  const isLoaded = cleanSku in realtimeSkuStocks;
                                  
                                  if (locs.length > 0) {
                                    return locs.map((l, lIdx) => (
                                      <span
                                        key={lIdx}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-mono font-bold text-[10px] border border-emerald-500/30"
                                        title={`Rak ${l.lokasi}: Sisa stok ${l.qty} pcs`}
                                      >
                                        <MapPin className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                        <span>{l.lokasi}</span>
                                        <span className="text-[9px] font-black bg-emerald-600/20 px-1 rounded text-emerald-900 dark:text-emerald-100">
                                          {l.qty}
                                        </span>
                                      </span>
                                    ));
                                  } else if (isLoaded) {
                                    return (
                                      <span
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold text-[9px] border border-rose-500/30"
                                        title={emptyRacks.length > 0 ? `Rak tercatat: ${emptyRacks.join(', ')}` : 'Stok gudang kosong'}
                                      >
                                        <span>KOSONG (0)</span>
                                        {emptyRacks.length > 0 && <span className="text-rose-500/80 font-mono">({emptyRacks.join(',')})</span>}
                                      </span>
                                    );
                                  } else if (item.lokasi && item.lokasi !== '-' && !item.lokasi.includes('KOSONG')) {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 font-mono font-bold text-[10px] border border-amber-500/30">
                                        <MapPin className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                        <span>{item.lokasi}</span>
                                      </span>
                                    );
                                  } else {
                                    return <span className="text-[10px] text-slate-400 italic">Mencari lokasi gudang...</span>;
                                  }
                                })()}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Qty Stepper (3 cols) */}
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            QTY <span className="text-primary-500">*</span>
                          </label>
                          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-[#131d31] overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleItemChange(item.id, { qty: Math.max(1, (Number(item.qty) || 1) - 1) })}
                              className="px-2.5 py-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.qty ?? ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleItemChange(item.id, { qty: val === '' ? '' : Math.max(0, parseInt(val, 10) || 0) });
                              }}
                              onBlur={(e) => {
                                const val = e.target.value;
                                if (val === '' || parseInt(val, 10) < 1) {
                                  handleItemChange(item.id, { qty: 1 });
                                }
                              }}
                              className="w-full min-w-[30px] text-center bg-transparent border-none outline-none text-xs font-extrabold font-mono text-slate-800 dark:text-slate-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleItemChange(item.id, { qty: (Number(item.qty) || 0) + 1 })}
                              className="px-2.5 py-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Delete Button (2 cols) */}
                        <div className="sm:col-span-2">
                          <button
                            type="button"
                            disabled={items.length <= 1}
                            onClick={() => handleRemoveItem(item.id)}
                            className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Automatic WhatsApp Notification Banner */}
            <div className="p-3 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start sm:items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 sm:mt-0">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <span>Notifikasi Otomatis WhatsApp (Fonnte)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                    Mengirimkan <b>Picking List</b> ke Grup Gudang & <b>Notifikasi Penerimaan</b> ke WA Ka {namaPeminjam.trim() || 'Peminjam'}.
                  </p>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer self-start sm:self-auto px-2.5 py-1.5 bg-white dark:bg-[#131d31] border border-emerald-500/30 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 shadow-2xs">
                <input
                  type="checkbox"
                  checked={autoSendWa}
                  onChange={(e) => setAutoSendWa(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Kirim WA Otomatis</span>
              </label>
            </div>

            {/* Action Submit Buttons */}
            <div className="pt-2 flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleAddItem}
                className="flex-[1] py-2.5 sm:py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-all text-center leading-tight cursor-pointer"
              >
                <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>+ Tambah Item</span>
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="flex-[1.5] sm:flex-[2] py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md shadow-blue-600/25 ring-1 ring-blue-500/50 text-xs sm:text-sm tracking-wide flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer text-center leading-tight"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Ajukan Peminjaman</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: STOK TERSEDIA (Visible in 'stok' tab or on lg screens) */}
        <div
          className={`lg:col-span-6 xl:col-span-5 bg-white dark:bg-[#09090b] rounded-2xl border border-slate-200 dark:border-slate-800/80 p-2 sm:p-3 shadow-xs space-y-2 ${
            activeTab === 'form' ? 'hidden lg:block' : activeTab === 'riwayat' ? 'hidden' : 'block'
          }`}
        >
          {/* Channel Header & Refresh */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider font-mono">
                  {selectedChannel === 'STUDIO'
                    ? '📍 STOK TERSEDIA DI STUDIO (BLOK F)'
                    : selectedChannel === 'SHOPEE'
                    ? '🧡 STOK TERSEDIA DI SHOPEE (SHP)'
                    : selectedChannel === 'TIKTOK'
                    ? '🖤 STOK TERSEDIA DI TIKTOK (TTK)'
                    : '🌐 GABUNGAN STOK (STUDIO / SHP / TTK)'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                Total: <b className="text-slate-800 dark:text-slate-200">{totalStockItems} SKU</b> &bull; <b className="text-blue-600 dark:text-blue-400">{totalStockPcs} Pcs Tersedia</b>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {canExportData && (
                <button
                  type="button"
                  onClick={handleExportStockCSV}
                  title="Export Stok ke CSV"
                  className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 text-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  loadChannelStocks(true);
                  onRefreshCatalog();
                }}
                title="Sinkronisasi Stok Real-Time Database"
                className={`p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 text-xs transition-colors cursor-pointer ${
                  loadingStock ? 'animate-spin text-blue-600 dark:text-blue-400' : ''
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Segmented Channel & Location Buttons (4-tabs including SEMUA) */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100/90 dark:bg-[#0b1324] border border-slate-200/80 dark:border-slate-800/80 rounded-xl text-[10px] sm:text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSelectedChannel('STUDIO')}
              className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                selectedChannel === 'STUDIO'
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📍 Studio
            </button>
            <button
              type="button"
              onClick={() => setSelectedChannel('SHOPEE')}
              className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                selectedChannel === 'SHOPEE'
                  ? 'bg-amber-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🧡 Shopee
            </button>
            <button
              type="button"
              onClick={() => setSelectedChannel('TIKTOK')}
              className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                selectedChannel === 'TIKTOK'
                  ? 'bg-slate-900 dark:bg-slate-700 text-white font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🖤 TikTok
            </button>
            <button
              type="button"
              onClick={() => setSelectedChannel('ALL')}
              className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                selectedChannel === 'ALL'
                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🌐 Semua
            </button>
          </div>

          {/* Guide Callout Box */}
          <div className="px-3 py-2 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-xl text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
            <span className="shrink-0 mt-0.5">💡</span>
            <p className="leading-snug">
              <b>Acuan Peminjam Divisi Live:</b> Daftar barang yang sudah tersedia di channel/lokasi terpilih. Anda dapat meminjam langsung atau menghindari pengajuan ganda.
            </p>
          </div>

          {/* Search stock input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchStock}
              onChange={(e) => setSearchStock(e.target.value)}
              placeholder="Cari nama produk / SKU / lokasi..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
            />
          </div>

          {/* Table of Available Stocks */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead className="bg-slate-50 dark:bg-[#0b1324] text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                {selectedChannel === 'ALL' ? (
                  <tr>
                    <th className="p-2.5">Produk & SKU</th>
                    <th className="p-2.5 text-center w-10">Size</th>
                    <th className="p-2.5 text-center w-12 text-blue-600 dark:text-blue-400">Studio</th>
                    <th className="p-2.5 text-center w-12 text-amber-600 dark:text-amber-400">SHP</th>
                    <th className="p-2.5 text-center w-12 text-slate-700 dark:text-slate-300">TTK</th>
                    <th className="p-2.5 text-center w-12 text-indigo-600 dark:text-indigo-400">Total</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-2.5">Produk & Lokasi</th>
                    <th className="p-2.5 text-center w-12">Size</th>
                    <th className="p-2.5 text-center w-14">
                      {selectedChannel === 'STUDIO' ? 'Studio' : selectedChannel === 'SHOPEE' ? 'Shopee' : 'TikTok'}
                    </th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {loadingStock ? (
                  <tr>
                    <td colSpan={selectedChannel === 'ALL' ? 6 : 3} className="p-6 text-center text-slate-400 italic text-xs">
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                        <span>Memuat stok real-time dari Database...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredStocks.length === 0 ? (
                  <tr>
                    <td colSpan={selectedChannel === 'ALL' ? 6 : 3} className="p-6 text-center text-slate-400 italic text-xs">
                      Tidak ada stok pada filter ini
                    </td>
                  </tr>
                ) : (
                  <>
                  {filteredStocks.slice(0, displayLimit).map((stk, idx) => {
                    const displayQty =
                      selectedChannel === 'STUDIO'
                        ? stk.studioQty
                        : selectedChannel === 'SHOPEE'
                        ? stk.shpQty
                        : stk.ttkQty;

                    const totalLive = (stk.studioQty || 0) + (stk.shpQty || 0) + (stk.ttkQty || 0);

                    if (selectedChannel === 'ALL') {
                      return (
                        <tr
                          key={`${stk.sku}_${stk.size || ''}_all_${idx}`}
                          className="hover:bg-slate-50/80 dark:hover:bg-[#131d31]/50 transition-colors group"
                        >
                          <td className="p-2.5">
                            <div className="font-bold text-slate-800 dark:text-slate-200 whitespace-normal break-words leading-tight text-xs">
                              {stk.produk}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-0.5">
                              <span className="font-semibold text-slate-600 dark:text-slate-300">{stk.sku}</span>
                              <span>&bull;</span>
                              <span className="text-blue-600 dark:text-blue-400 font-semibold">{stk.locStr}</span>
                            </div>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-bold">
                              {stk.size}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`font-mono text-xs font-bold ${stk.studioQty > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-300 dark:text-slate-600'}`}>
                              {stk.studioQty || 0}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`font-mono text-xs font-bold ${stk.shpQty > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-300 dark:text-slate-600'}`}>
                              {stk.shpQty || 0}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`font-mono text-xs font-bold ${stk.ttkQty > 0 ? 'text-slate-800 dark:text-slate-200 font-extrabold' : 'text-slate-300 dark:text-slate-600'}`}>
                              {stk.ttkQty || 0}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="font-mono text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                              {totalLive}
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={`${stk.sku}_${stk.size || ''}_${idx}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-[#131d31]/50 transition-colors group"
                      >
                        <td className="p-2.5">
                          <div className="font-bold text-slate-800 dark:text-slate-200 whitespace-normal break-words leading-tight text-xs">
                            {stk.produk}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-0.5">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">{stk.sku}</span>
                            <span>&bull;</span>
                            <span className="text-blue-600 dark:text-blue-400 font-semibold">{stk.locStr}</span>
                          </div>
                          {/* Channel breakdown pills */}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {stk.ttkQty > 0 && (
                              <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-200 rounded font-mono font-bold">
                                🖤 TikTok: {stk.ttkQty}
                              </span>
                            )}
                            {stk.shpQty > 0 && (
                              <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded font-mono font-bold">
                                🧡 Shopee: {stk.shpQty}
                              </span>
                            )}
                            {stk.studioQty > 0 && (
                              <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded font-mono font-bold">
                                📍 Studio: {stk.studioQty}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2.5 text-center">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-bold">
                            {stk.size}
                          </span>
                        </td>
                        <td className="p-2.5 text-center">
                          {displayQty > 0 ? (
                            <span className="font-mono text-xs font-extrabold text-blue-600 dark:text-blue-400">
                              {displayQty}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                              Sold
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredStocks.length > displayLimit && (
                    <tr>
                      <td colSpan={selectedChannel === 'ALL' ? 6 : 3} className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setDisplayLimit((prev) => prev + 30)}
                          className="px-2 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors cursor-pointer"
                        >
                          Tampilkan Lebih Banyak ({filteredStocks.length - displayLimit} baris lagi)
                        </button>
                      </td>
                    </tr>
                  )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FULL WIDTH: RIWAYAT PENGAJUAN (Visible in 'riwayat' tab) */}
        {activeTab === 'riwayat' && (
          <div className="col-span-12 bg-white dark:bg-[#09090b] rounded-2xl border border-slate-200 dark:border-slate-800/80 p-2 sm:p-3 shadow-xs space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 gap-3">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider font-mono">
                  RIWAYAT PENGAJUAN PEMINJAMAN SEMENTARA ({filteredHistory.length})
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Daftar transaksi peminjaman barang, cetak surat jalan, dan kirim notifikasi WhatsApp.
                </p>
              </div>

              {/* Partial multi-keyword Search for Riwayat */}
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchHistory}
                  onChange={(e) => setSearchHistory(e.target.value)}
                  placeholder="Cari invoice / PIC / produk / SKU..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
                {searchHistory && (
                  <button
                    type="button"
                    onClick={() => setSearchHistory('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs italic bg-slate-50 dark:bg-[#0b1324] rounded-xl border border-slate-200 dark:border-slate-800">
                Tidak ada data riwayat peminjaman yang cocok dengan pencarian &quot;{searchHistory}&quot;
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredHistory.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-slate-50/70 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-xs"
                  >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                      {rec.noPeminjaman}
                    </span>
                    {canEditData ? (
                      <button
                        type="button"
                        onClick={() => handleToggleReturn(rec.id)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-all border ${
                          rec.status === 'Dipinjam'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/50 hover:opacity-80'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/50 hover:opacity-80'
                        }`}
                        title="Klik untuk mengubah status peminjaman"
                      >
                        {rec.status}
                      </button>
                    ) : (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border select-none ${
                          rec.status === 'Dipinjam'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/50'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/50'
                        }`}
                      >
                        {rec.status}
                      </span>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{rec.namaPeminjam}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      {rec.keperluan} &bull; {rec.tglPinjam}
                    </div>
                  </div>

                  <div className="p-2.5 bg-white dark:bg-[#131d31] border border-slate-200/80 dark:border-slate-800 rounded-lg space-y-1 text-xs">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">
                      Barang Dipinjam ({rec.items.length} SKU):
                    </div>
                    {rec.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between text-slate-700 dark:text-slate-300 text-[11px]">
                        <span className="line-clamp-1">
                          &bull; {it.produk} ({it.size})
                        </span>
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{it.qty} Pcs</span>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="space-y-1.5 pt-1">
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedRecordForModal(rec)}
                        className="py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <FileText className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        <span>Detail</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintSJ(rec)}
                        className="py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Cetak SJ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendWa(rec, 'grup')}
                        className="py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-xs"
                      >
                        <Share2 className="w-3 h-3" />
                        <span>Kirim WA</span>
                      </button>
                    </div>

                    {(canEditData || canDeleteData) && (
                      <div className={`grid ${canEditData && canDeleteData ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5`}>
                        {canEditData && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(rec)}
                            className="py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        )}
                        {canDeleteData && (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmRecord(rec)}
                            className="py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>

      {/* MODAL PREVIEW SURAT JALAN & WHATSAPP FONNTE */}
      {selectedRecordForModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#09090b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-2 sm:p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-[#0b1324]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Surat Peminjaman Sementara ({selectedRecordForModal.noPeminjaman})
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    PIC: {selectedRecordForModal.namaPeminjam} &bull; {selectedRecordForModal.tglPinjam}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecordForModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            {(() => {
              const modalFonnteConfig = getFonnteConfig();
              return (
            <div className="p-5 overflow-y-auto flex-1 space-y-2 text-xs">
              {/* Document Summary Card */}
              <div className="p-4 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 font-sans">No Invoice:</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">{selectedRecordForModal.noPeminjaman}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 font-sans">PIC Peminjam:</span>
                  <span className="text-slate-900 dark:text-slate-100 font-sans font-bold">{selectedRecordForModal.namaPeminjam}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 font-sans">No. WhatsApp PIC:</span>
                  <div className="flex items-center gap-1.5 font-sans">
                    <input
                      type="tel"
                      value={modalWaPeminjam}
                      onChange={(e) => {
                        const val = e.target.value;
                        setModalWaPeminjam(val);
                        selectedRecordForModal.noWaPeminjam = val;
                        selectedRecordForModal.no_wa_peminjam = val;
                      }}
                      placeholder="0812... / 628..."
                      className="px-2.5 py-1 bg-white dark:bg-[#131d31] border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-blue-600 dark:text-blue-400 w-36 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 font-sans">Keperluan:</span>
                  <span className="text-slate-800 dark:text-slate-200 font-sans">{selectedRecordForModal.keperluan}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400 font-sans">Tanggal:</span>
                  <span className="text-slate-800 dark:text-slate-200">{selectedRecordForModal.tglPinjam}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-1.5">
                <div className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                  Daftar Barang ({selectedRecordForModal.items.length} Item):
                </div>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 dark:bg-[#0b1324] text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">
                      <tr>
                        <th className="p-2.5">Produk</th>
                        <th className="p-2.5 text-center">Size</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5">Lokasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                      {selectedRecordForModal.items.map((it, idx) => {
                        const cleanSku = (it.sku || '').toUpperCase().trim();
                        const locs = getProductLocations(cleanSku, it.lokasi);
                        const isLoaded = cleanSku in realtimeSkuStocks;
                        const emptyRacks = getRecordedEmptyLocations(cleanSku);

                        return (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-[#131d31]/30">
                            <td className="p-2.5 font-sans font-semibold text-slate-900 dark:text-slate-100">{it.produk}</td>
                            <td className="p-2.5 text-center text-slate-500 dark:text-slate-400">{it.size}</td>
                            <td className="p-2.5 text-center font-bold text-blue-600 dark:text-blue-400">{it.qty}</td>
                            <td className="p-2.5 text-slate-400">
                              <div className="flex flex-wrap items-center gap-1">
                                {locs.length > 0 ? (
                                  locs.map((l, lIdx) => (
                                    <span
                                      key={lIdx}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 font-mono font-bold text-[10px] border border-blue-500/30"
                                      title={`Rak ${l.lokasi}: Sisa stok ${l.qty} pcs`}
                                    >
                                      <MapPin className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400 shrink-0" />
                                      <span>{l.lokasi}</span>
                                      <span className="text-[9px] font-bold bg-blue-600/20 px-1 rounded text-blue-900 dark:text-blue-100">
                                        {l.qty}
                                      </span>
                                    </span>
                                  ))
                                ) : isLoaded ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-bold text-[9px] border border-rose-500/30"
                                    title={emptyRacks.length > 0 ? `Rak tercatat: ${emptyRacks.join(', ')}` : 'Stok gudang kosong'}
                                  >
                                    <span>KOSONG (0)</span>
                                    {emptyRacks.length > 0 && <span className="text-[8px] text-rose-500/80 font-mono">({emptyRacks.join(',')})</span>}
                                  </span>
                                ) : it.lokasi && it.lokasi !== '-' && !it.lokasi.includes('KOSONG') ? (
                                  <span className="font-mono font-bold text-[10px] text-amber-600 dark:text-amber-400">{it.lokasi}</span>
                                ) : it.lokasi && it.lokasi.includes('KOSONG') ? (
                                  <span className="font-mono font-bold text-[10px] text-rose-600 dark:text-rose-400">{it.lokasi}</span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">-</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* WhatsApp Notification Center */}
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Share2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Notifikasi WhatsApp (Fonnte):</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Token: {modalFonnteConfig.token ? 'Aktif' : 'Belum diatur'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Card 1: Grup Gudang (Picking List) */}
                  <div className="p-3.5 bg-slate-50/70 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                        📦 1. Picking List ke Grup Gudang
                      </span>
                      {copiedWaType === 'grup' && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Terkirim!</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Target Grup: <code className="text-blue-600 dark:text-blue-400 font-mono">{modalFonnteConfig.groupTarget || '(Belum diset di Pengaturan)'}</code>
                    </p>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        disabled={isSendingWaType === 'grup'}
                        onClick={() => handleSendWa(selectedRecordForModal, 'grup')}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {isSendingWaType === 'grup' ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Kirim Fonnte</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const text = generateWaMessage(selectedRecordForModal, 'grup');
                          navigator.clipboard.writeText(text);
                          onShowToast('Teks pesan grup berhasil disalin!', 'success');
                        }}
                        title="Salin Teks Pesan"
                        className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Personal Peminjam */}
                  <div className="p-3.5 bg-slate-50/70 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                        📱 2. Notif Diterima ke Ka {selectedRecordForModal.namaPeminjam}
                      </span>
                      {copiedWaType === 'personal' && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Terkirim!</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      No WA: <code className="text-blue-600 dark:text-blue-400 font-mono">{modalWaPeminjam || selectedRecordForModal.noWaPeminjam || '(Belum diisi)'}</code>
                    </p>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        disabled={isSendingWaType === 'personal'}
                        onClick={() => handleSendWa(selectedRecordForModal, 'personal', modalWaPeminjam)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                      >
                        {isSendingWaType === 'personal' ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Kirim Fonnte</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const target = modalWaPeminjam || selectedRecordForModal.noWaPeminjam;
                          const text = generateWaMessage(selectedRecordForModal, 'personal', target);
                          if (target) {
                            window.open(getWhatsAppWebUrl(target, text), '_blank');
                          } else {
                            onShowToast('Isi nomor WA terlebih dahulu', 'warning');
                          }
                        }}
                        title="Buka via WhatsApp Web"
                        className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const text = generateWaMessage(selectedRecordForModal, 'personal');
                          navigator.clipboard.writeText(text);
                          onShowToast('Teks notifikasi personal berhasil disalin!', 'success');
                        }}
                        title="Salin Teks Pesan"
                        className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
              );
            })()}

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50/80 dark:bg-[#0b1324] border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {canEditData && (
                  <button
                    type="button"
                    onClick={() => {
                      const rec = selectedRecordForModal;
                      setSelectedRecordForModal(null);
                      handleStartEdit(rec);
                    }}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                )}
                {canDeleteData && (
                  <button
                    type="button"
                    onClick={() => {
                      const rec = selectedRecordForModal;
                      setDeleteConfirmRecord(rec);
                    }}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRecordForModal(null)}
                  className="px-2 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintSJ(selectedRecordForModal)}
                  className="px-2 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Surat Jalan (PDF)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT PEMINJAMAN */}
      {editingRecord && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#09090b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-2 sm:p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/80 dark:bg-[#0b1324]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>Edit Riwayat Peminjaman</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 font-bold">
                      {editingRecord.noPeminjaman}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Perbarui informasi peminjam, keperluan, tanggal, status, atau daftar item barang.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="p-2 sm:p-3 overflow-y-auto flex-1 space-y-2 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Nama Peminjam */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Peminjam (PIC) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingRecord.namaPeminjam || ''}
                    onChange={(e) => setEditingRecord({ ...editingRecord, namaPeminjam: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    placeholder="Contoh: Budi, Siti, dll."
                  />
                </div>

                {/* No WA Peminjam */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    No. WhatsApp PIC
                  </label>
                  <input
                    type="tel"
                    value={editingRecord.noWaPeminjam || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditingRecord({ ...editingRecord, noWaPeminjam: val, no_wa_peminjam: val });
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    placeholder="0812... / 628..."
                  />
                </div>

                {/* Keperluan */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Keperluan
                  </label>
                  <input
                    type="text"
                    value={editingRecord.keperluan || ''}
                    onChange={(e) => setEditingRecord({ ...editingRecord, keperluan: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    placeholder="Contoh: Photoshoot, Live TikTok, Display"
                  />
                </div>

                {/* Tanggal Pinjam & Status */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Tanggal Pinjam
                    </label>
                    <input
                      type="date"
                      value={editingRecord.tglPinjam || ''}
                      onChange={(e) => setEditingRecord({ ...editingRecord, tglPinjam: e.target.value })}
                      className="w-full px-2.5 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Status
                    </label>
                    <select
                      value={editingRecord.status || 'Dipinjam'}
                      onChange={(e) => setEditingRecord({ ...editingRecord, status: e.target.value })}
                      className="w-full px-2 py-2 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                    >
                      <option value="Dipinjam">Dipinjam</option>
                      <option value="Dikembalikan">Dikembalikan</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Items Section */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                    Daftar Barang ({editingRecord.items?.length || 0} Item)
                  </span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowEditProductDropdown(!showEditProductDropdown)}
                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Barang</span>
                    </button>

                    {showEditProductDropdown && (
                      <div className="absolute right-0 top-9 w-72 sm:w-80 bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 p-2.5 space-y-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            autoFocus
                            value={editProductSearch}
                            onChange={(e) => setEditProductSearch(e.target.value)}
                            placeholder="Cari produk dari katalog..."
                            className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-700 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="max-h-48 overflow-y-auto space-y-1 divide-y divide-slate-100 dark:divide-slate-800">
                          {editCatalogSuggestions.length > 0 ? (
                            editCatalogSuggestions.map((prod: any, pIdx: number) => (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => handleAddItemInEdit(prod)}
                                className="w-full text-left p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg flex items-center justify-between gap-1 transition-colors cursor-pointer"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                    {prod.nama_produk || prod.nama}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    {prod.sku} &bull; Size {prod.size || '-'}
                                  </div>
                                </div>
                                <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                              </button>
                            ))
                          ) : editProductSearch.trim().length >= 2 ? (
                            <div className="p-2 text-center text-[11px] text-slate-400">
                              SKU tidak terdaftar.
                              <button
                                type="button"
                                onClick={() => handleAddItemInEdit({ nama_produk: editProductSearch, sku: '', size: 'ALL', lokasi: 'BLOK F' } as any)}
                                className="mt-1 block mx-auto text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                              >
                                + Tambahkan &quot;{editProductSearch}&quot; secara manual
                              </button>
                            </div>
                          ) : (
                            <div className="p-2 text-center text-[11px] text-slate-400">
                              Ketik minimal 2 huruf untuk mencari
                              <button
                                type="button"
                                onClick={() => handleAddItemInEdit()}
                                className="mt-1 block mx-auto text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                              >
                                + Tambah Baris Kosong
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Items Table */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 dark:bg-[#0b1324] text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase">
                      <tr>
                        <th className="p-2.5">Produk / SKU</th>
                        <th className="p-2.5 w-20 text-center">Size</th>
                        <th className="p-2.5 w-20 text-center">Qty</th>
                        <th className="p-2.5 w-28">Lokasi</th>
                        <th className="p-2.5 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {editingRecord.items?.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-[#131d31]/30">
                          <td className="p-2">
                            <input
                              type="text"
                              value={it.produk || ''}
                              onChange={(e) => handleUpdateItemInEdit(idx, 'produk', e.target.value)}
                              placeholder="Nama Produk"
                              className="w-full px-2 py-1 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 rounded font-semibold text-slate-900 dark:text-white outline-none"
                            />
                            <input
                              type="text"
                              value={it.sku || ''}
                              onChange={(e) => handleUpdateItemInEdit(idx, 'sku', e.target.value)}
                              placeholder="SKU"
                              className="w-full px-2 py-0.5 bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 rounded text-[10px] font-mono text-slate-400 outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={it.size || ''}
                              onChange={(e) => handleUpdateItemInEdit(idx, 'size', e.target.value)}
                              className="w-full px-1.5 py-1 text-center bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded font-mono font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="1"
                              value={it.qty || 1}
                              onChange={(e) => handleUpdateItemInEdit(idx, 'qty', Math.max(1, parseInt(e.target.value, 10) || 1))}
                              className="w-full px-1.5 py-1 text-center bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded font-mono font-bold text-blue-600 dark:text-blue-400 outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={it.lokasi || ''}
                              onChange={(e) => handleUpdateItemInEdit(idx, 'lokasi', e.target.value)}
                              placeholder="Lokasi"
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-[#0b1324] border border-slate-200 dark:border-slate-800 rounded font-mono text-xs text-slate-700 dark:text-slate-300 outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteItemInEdit(idx)}
                              title="Hapus baris barang"
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50/80 dark:bg-[#0b1324] border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => setEditingRecord(null)}
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={handleSaveEdit}
                className="px-2 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSavingEdit ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan Perubahan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI HAPUS PEMINJAMAN */}
      {deleteConfirmRecord && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#09090b] border border-rose-500/30 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-5 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Hapus Riwayat Peminjaman?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                  {deleteConfirmRecord.noPeminjaman}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus data peminjaman atas nama{' '}
              <strong className="text-slate-900 dark:text-white font-bold">{deleteConfirmRecord.namaPeminjam}</strong>{' '}
              ({deleteConfirmRecord.items?.length || 0} barang)?
              <br />
              <span className="text-rose-500 font-semibold mt-1 block">
                Tindakan ini permanen dan data akan dihapus dari Supabase.
              </span>
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmRecord(null)}
                className="px-2 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleDeleteRecord(deleteConfirmRecord)}
                className="px-2 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-xs text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Permanen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
