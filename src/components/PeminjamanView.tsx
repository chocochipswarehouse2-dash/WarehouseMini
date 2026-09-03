import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { showGlobalLoading, hideGlobalLoading } from '../utils/globalLoading';
import {
  FileText,
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
} from 'lucide-react';
import { ProductItem, PeminjamanItemForm, PeminjamanRecord, ChannelStockItem, UserSession, PickingListItem } from '../types';
import {
  fetchPeminjamanFromSupabase,
  savePeminjamanToSupabase,
  deletePeminjamanFromSupabase,
  returnPeminjamanSupabase,
  getSupabaseClient,
  fetchRealtimeChannelStocksSupabase,
  supabaseFetch,
} from '../services/supabase';
import { globalRealtimeStore } from '../services/store';
import {
  getLocalPeminjamanRecords,
  saveLocalPeminjamanRecords,
  FALLBACK_CHANNEL_STOCKS,
} from '../utils/localStore';
import { sortAlphabeticalAndSize, fuzzySearchMultiple, fuzzySearch, partialSearchMatch } from '../utils/sortUtils';

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
  // Navigation tabs for mobile / view switcher
  const [activeTab, setActiveTab] = useState<'form' | 'stok' | 'riwayat'>('form');

  // Form State
  const [namaPeminjam, setNamaPeminjam] = useState<string>('');
  const [keperluan, setKeperluan] = useState<string>('');
  const [tglPinjam, setTglPinjam] = useState<string>(() => new Date().toISOString().slice(0, 10));
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
    },
  ]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Channel stock state - Loaded directly from Supabase realtime
  const [selectedChannel, setSelectedChannel] = useState<'STUDIO' | 'SHOPEE' | 'TIKTOK' | 'ALL'>('STUDIO');
  const [searchStock, setSearchStock] = useState<string>('');
  const [searchHistory, setSearchHistory] = useState<string>('');
  const [channelStocks, setChannelStocks] = useState<ChannelStockItem[]>([]);
  const [loadingStock, setLoadingStock] = useState<boolean>(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [activeComboIndex, setActiveComboIndex] = useState<number>(-1);
  const [inputSearchTerm, setInputSearchTerm] = useState<{ [id: string]: string }>({});
  const [extraSearchedProducts, setExtraSearchedProducts] = useState<ProductItem[]>([]);

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

    const triggerDebouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!isMounted) return;
        fetchPeminjamanFromSupabase().then((d) => {
          if (isMounted && d && d.length > 0) setRecords(d);
        });
        loadChannelStocks();
      }, 400);
    };

    const unsubPeminjaman = globalRealtimeStore.subscribe('peminjaman', triggerDebouncedSync);
    const unsubLog = globalRealtimeStore.subscribe('log_produk', triggerDebouncedSync);

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

    // 1. Process ChannelStocks first (direct realtime from view_stok_realtime)
    channelStocks.forEach((cs) => {
      const skuUpper = (cs.sku || '').toUpperCase().trim();
      if (!skuUpper) return;
      const total = typeof cs.totalQty === 'number' ? cs.totalQty : ((cs.whQty || 0) + (cs.studioQty || 0) + (cs.shpQty || 0) + (cs.ttkQty || 0));
      const itemData = {
        sku: cs.sku,
        produk: cs.produk || cs.sku,
        size: cs.size || 'ALL',
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
    const combinedCatalog = [...productCatalog, ...extraSearchedProducts];
    combinedCatalog.forEach((p) => {
      const skuUpper = (p.k || '').toUpperCase().trim();
      if (!skuUpper) return;
      
      const existing = skuMap.get(skuUpper);
      if (existing) {
        // If existing has 0 stok but p has stokMap or channel stock
        if (existing.stok === 0 && p.stokMap !== undefined && p.stokMap > 0) {
          existing.stok = p.stokMap;
        }
        if (existing.produk === skuUpper && p.p && p.p !== skuUpper) {
          existing.produk = p.p;
        }
        if ((!existing.size || existing.size === 'ALL') && p.s) {
          existing.size = p.s;
        }
        return;
      }

      const stok = p.stokMap !== undefined
        ? Number(p.stokMap)
        : ((p.stokStudio || 0) + (p.stokShp || 0) + (p.stokTtk || 0));

      const itemData = {
        sku: p.k || '',
        produk: p.p || p.k || '',
        size: p.s || 'ALL',
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
  }, [productCatalog, channelStocks, extraSearchedProducts]);

  // Debounced search on Supabase master_produk when typing
  const searchSupabaseMaster = async (query: string) => {
    if (!query || query.trim().length < 2) return;
    try {
      const qClean = encodeURIComponent(query.trim());
      const res = await supabaseFetch<any[]>(
        'master_produk',
        'GET',
        undefined,
        `or=(sku.ilike.*${qClean}*,nama_produk.ilike.*${qClean}*)&select=sku,nama_produk,size&limit=25`
      );
      if (res && Array.isArray(res) && res.length > 0) {
        const newItems: ProductItem[] = res.map((r: any) => ({
          k: String(r.sku || ''),
          p: String(r.nama_produk || r.sku || ''),
          s: String(r.size || 'ALL'),
          lokasi: 'Warehouse',
          stokMap: 0,
          stokStudio: 0,
          stokShp: 0,
          stokTtk: 0,
        }));
        setExtraSearchedProducts((prev) => {
          const map = new Map<string, ProductItem>();
          prev.forEach((p) => map.set((p.k || '').toUpperCase(), p));
          newItems.forEach((n) => map.set((n.k || '').toUpperCase(), n));
          return Array.from(map.values());
        });
      }
    } catch (e) {
      console.warn('Supabase master search error:', e);
    }
  };

  // Fast Product Input Change Handler (Handles Datalist chip click / barcode scan / typing)
  const handleProductInputChange = (itemId: string, rawVal: string) => {
    setActiveComboIndex(-1);
    const trimmed = rawVal.trim();
    const upper = trimmed.toUpperCase();

    // Trigger debounced Supabase lookup if 2+ characters
    if (trimmed.length >= 2) {
      const timer = setTimeout(() => {
        searchSupabaseMaster(trimmed);
      }, 250);
      // Cleanup timer via input state if needed
    }

    // 1. Direct O(1) matching against SKU map
    if (skuLookupMap.has(upper)) {
      const matched = skuLookupMap.get(upper)!;
      handleItemChange(itemId, {
        sku: matched.sku,
        produk: matched.produk,
        size: matched.size,
        lokasi: matched.lokasi,
        stokMap: matched.stok,
        stokStudio: matched.studioQty,
        stokShp: matched.shpQty,
        stokTtk: matched.ttkQty,
      });
      return;
    }

    // 2. Direct O(1) matching against Name map
    const lower = trimmed.toLowerCase();
    if (nameLookupMap.has(lower)) {
      const matched = nameLookupMap.get(lower)!;
      handleItemChange(itemId, {
        sku: matched.sku,
        produk: matched.produk,
        size: matched.size,
        lokasi: matched.lokasi,
        stokMap: matched.stok,
        stokStudio: matched.studioQty,
        stokShp: matched.shpQty,
        stokTtk: matched.ttkQty,
      });
      return;
    }

    // If typing custom / in-progress text
    handleItemChange(itemId, {
      sku: rawVal,
      produk: rawVal,
    });
  };

  // Fast custom dropdown renderer inside form with keyboard navigation
  const renderSuggestions = (itemId: string, currentVal: string) => {
    if (focusedItemId !== itemId || !currentVal.trim()) return null;
    const lower = currentVal.trim().toLowerCase();
    const keywords = lower.split(/\s+/).filter(Boolean);
    
    // Exact SKU match doesn't need dropdown if it's already selected
    if (skuLookupMap.has(currentVal.trim().toUpperCase())) return null;

    // Multi-keyword filter + cap to 30 items
    const suggestions = productOptionsList
      .filter((p) => {
        const text = `${p.sku} ${p.produk} ${p.size}`.toLowerCase();
        return keywords.every((kw) => text.includes(kw));
      })
      .slice(0, 30);

    if (suggestions.length === 0) {
      return (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-50 p-4 text-center text-xs text-slate-400 italic">
          ❌ Produk tidak ditemukan
        </div>
      );
    }

    return (
      <div
        id={`combo-panel-${itemId}`}
        className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-50 max-h-64 overflow-y-auto"
      >
        {suggestions.map((s, idx) => {
          const isActive = idx === activeComboIndex;
          return (
            <div
              key={s.sku}
              data-index={idx}
              onMouseDown={(e) => {
                e.preventDefault();
                handleItemChange(itemId, {
                  sku: s.sku,
                  produk: s.produk,
                  size: s.size,
                  lokasi: s.lokasi,
                  stokMap: s.stok,
                  stokStudio: s.studioQty,
                  stokShp: s.shpQty,
                  stokTtk: s.ttkQty,
                });
                setFocusedItemId(null);
                setActiveComboIndex(-1);
              }}
              className={`px-3 py-2.5 text-xs cursor-pointer border-b border-slate-100 dark:border-slate-800/60 last:border-0 transition-colors ${
                isActive
                  ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500 pl-2'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800'
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
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${s.stok > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-500/20'}`}>
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
    const lower = currentVal.trim().toLowerCase();
    const keywords = lower.split(/\s+/).filter(Boolean);
    const suggestions = productOptionsList
      .filter((p) => {
        const text = `${p.sku} ${p.produk} ${p.size}`.toLowerCase();
        return keywords.every((kw) => text.includes(kw));
      })
      .slice(0, 30);

    if (suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveComboIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveComboIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      if (activeComboIndex >= 0 && activeComboIndex < suggestions.length) {
        e.preventDefault();
        const s = suggestions[activeComboIndex];
        handleItemChange(itemId, {
          sku: s.sku,
          produk: s.produk,
          size: s.size,
          lokasi: s.lokasi,
          stokMap: s.stok,
          stokStudio: s.studioQty,
          stokShp: s.shpQty,
          stokTtk: s.ttkQty,
        });
        setFocusedItemId(null);
        setActiveComboIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setFocusedItemId(null);
      setActiveComboIndex(-1);
    }
  };

  // Blur / Enter matching for partial input (e.g. typing "Taylor" then tapping outside / next)
  const handleProductInputBlur = (itemId: string, currentVal: string) => {
    const trimmed = currentVal.trim();
    if (!trimmed) return;
    const upper = trimmed.toUpperCase();
    if (skuLookupMap.has(upper)) return;

    // Check prefix / substring match (case insensitive)
    const found = productOptionsList.find((p) =>
      p.sku.toUpperCase() === upper ||
      p.sku.toUpperCase().includes(upper) ||
      p.produk.toLowerCase().includes(trimmed.toLowerCase())
    );
    if (found) {
      handleItemChange(itemId, {
        sku: found.sku,
        produk: found.produk,
        size: found.size,
        lokasi: found.lokasi,
        stokMap: found.stok,
        stokStudio: found.studioQty,
        stokShp: found.shpQty,
        stokTtk: found.ttkQty,
      });
    }
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

    const validItems = items.filter((it) => it.produk.trim() && it.qty > 0);
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
        keperluan: keperluan.trim(),
        tglPinjam,
        timestamp: nowIso,
        status: 'Dipinjam',
        items: validItems.map((it) => ({
          produk: it.produk,
          sku: it.sku || `SKU-${it.produk.slice(0, 4).toUpperCase()}`,
          size: it.size || 'ALL',
          qty: it.qty,
          lokasi: it.lokasi || 'BLOK F',
        })),
        username: session?.username || 'Operator',
      };

      // 1. Save directly to Supabase peminjaman
      await savePeminjamanToSupabase(newRecord);

      // 2. Also create picking tasks in Supabase for Fulfillment
      try {
        const pickingTasks: PickingListItem[] = validItems.map((it) => ({
          no_sj: noSps,
          tanggal: tglPinjam,
          tujuan: `SPS: ${namaPeminjam.trim()} - ${keperluan.trim()}`,
          sku: it.sku.toUpperCase(),
          nama_produk: it.produk,
          qty_req: it.qty,
          qty_picked: 0,
          lokasi: it.lokasi || 'BLOK F',
          status: 'PENDING',
          created_at: nowIso,
        }));
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
      setNamaPeminjam('');
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

      onShowToast(`Peminjaman ${noSps} berhasil disimpan ke Database!`, 'success');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Gagal mengirim pengajuan peminjaman';
      onShowToast(errMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Export Channel Stock to CSV
  const handleExportStockCSV = () => {
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
  const generateWaMessage = (record: PeminjamanRecord, type: 'personal' | 'grup') => {
    if (type === 'personal') {
      const itemsList = record.items.map((it) => `- ${it.produk} (Qty: ${it.qty})`).join('\n');
      return (
        `Halo Ka ${record.namaPeminjam},\n` +
        `Pengajuan peminjaman produk kamu telah kami terima:\n\n` +
        `No Invoice : ${record.noPeminjaman}\n` +
        `Keperluan  : ${record.keperluan}\n` +
        `Tanggal    : ${record.tglPinjam}\n\n` +
        `Daftar Produk:\n` +
        `${itemsList}\n\n` +
        `Telah kami terima dan akan segera diproses di gudang ya.`
      );
    } else {
      const itemsList = record.items
        .map((it) => `📦 ${it.produk}\n🔢 Qty: ${it.qty} pcs | 📍 Lokasi: ${it.lokasi}`)
        .join('\n\n');
      return (
        `@vina @yesi @novi @ria @nur\n` +
        `@eka Cetak SJ Peminjamannya ya\n\n` +
        `*PEMINJAMAN BARU (SPS)*\n` +
        `PIC: ${record.namaPeminjam}\n` +
        `No Invoice: ${record.noPeminjaman}\n` +
        `Keperluan: ${record.keperluan}\n` +
        `Tanggal: ${record.tglPinjam}\n\n` +
        `${itemsList}`
      );
    }
  };

  // Send WhatsApp Text via Fonnte
  const handleSendWa = async (record: PeminjamanRecord, type: 'personal' | 'grup') => {
    const text = generateWaMessage(record, type);
    const token = localStorage.getItem('wms_fonnte_token');
    
    // As fallback, still copy to clipboard
    navigator.clipboard.writeText(text);

    if (!token) {
      onShowToast(`Pesan disalin! (Token Fonnte belum diatur di Pengaturan)`, 'warning');
      return;
    }

    // Default to group target if personal number is unknown, or you can prompt for it
    const groupTarget = localStorage.getItem('wms_fonnte_group_target') || '';
    
    // Ideally we should ask for personal number, but for now we just use the group target or a placeholder
    const target = type === 'grup' ? groupTarget : (prompt("Masukkan nomor tujuan PIC (Cth: 628...):", "") || "");
    
    if (!target) {
       onShowToast('Nomor tujuan tidak ada. Pesan hanya disalin ke clipboard.', 'warning');
       return;
    }

    try {
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { 'Authorization': token.trim() },
        body: new URLSearchParams({ target: target, message: text }),
      });
      const data = await res.json();
      
      if (data.status) {
        setCopiedWaType(type);
        onShowToast(`Pesan WA (${type === 'personal' ? 'Personal' : 'Grup'}) berhasil dikirim!`, 'success');
        setTimeout(() => setCopiedWaType(null), 2500);
      } else {
        throw new Error(data.reason || 'Gagal mengirim pesan');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error menghubungi API Fonnte';
      onShowToast(`Gagal kirim via Fonnte: ${msg}`, 'error');
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
      .map(
        (it, idx) => `
      <tr>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.produk}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1;">${it.size}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${it.sku}</td>
        <td style="text-align:center; padding: 6px; border: 1px solid #cbd5e1; font-weight: bold;">${it.qty}</td>
        <td style="padding: 6px; border: 1px solid #cbd5e1;">${it.lokasi}</td>
      </tr>
    `
      )
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
            <div class="logo-title">CHOCOCHIPS WMS</div>
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

  return (
    <div id="peminjamanContainer" className="flex-1 p-3 sm:p-5 max-w-7xl mx-auto w-full space-y-4">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg">
              <FileText className="w-4 h-4" />
            </span>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight uppercase">
              Form Peminjaman Sementara (SPS)
            </h2>
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-mono">
              Live & Studio
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Modul pengajuan peminjaman barang untuk Divisi Live TikTok, Shopee, Foto Studio, dan Warehouse.
          </p>
        </div>

        {/* View Switcher / Tab Buttons */}
        <div className="grid grid-cols-3 bg-slate-100 dark:bg-black/50 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-[10px] sm:text-xs font-bold w-full sm:w-auto gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`w-full py-2 sm:py-1.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'form'
                ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-center">Form Pengajuan</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stok')}
            className={`w-full py-2 sm:py-1.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'stok'
                ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-center">Stok Live <br className="sm:hidden"/>({totalStockPcs})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('riwayat')}
            className={`w-full py-2 sm:py-1.5 rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 ${
              activeTab === 'riwayat'
                ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-center">Riwayat <br className="sm:hidden"/>({records.length})</span>
          </button>
        </div>
      </div>

      {/* Main 2-Panel Split Container for Desktop & Responsive Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: FORM PENGAJUAN (Visible in 'form' tab or on lg screens) */}
        <div
          className={`lg:col-span-6 xl:col-span-7 bg-white dark:bg-[#09090B] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4 ${
            activeTab === 'stok' ? 'hidden lg:block' : activeTab === 'riwayat' ? 'hidden' : 'block'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
                📝 FORM PENGAJUAN PEMINJAMAN SEMENTARA (SPS)
              </span>
            </div>
            <button
              type="button"
              onClick={handleFullRefresh}
              className="px-2.5 py-1 bg-slate-100 dark:bg-[#0F0F12] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1.5 transition-all"
              title="Refresh Stok & Data SPS"
            >
              <RefreshCw className={`w-3 h-3 text-emerald-500 ${loadingStock ? 'animate-spin' : ''}`} />
              <span>REFRESH</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
              1. INFORMASI PEMINJAM (DIVISI LIVE / STUDIO)
            </div>

            {/* PIC & Keperluan 2-Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  NAMA / PIC PEMINJAM <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={namaPeminjam}
                    onChange={(e) => setNamaPeminjam(e.target.value)}
                    placeholder="Contoh: Sarah / Host Live"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                  KEPERLUAN PEMINJAMAN <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={keperluan}
                  onChange={(e) => setKeperluan(e.target.value)}
                  placeholder="Contoh: Live TikTok / Live Shopee / Studio"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Tanggal Pinjam */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">
                TANGGAL PINJAM <span className="text-rose-500">*</span>
              </label>
              <div className="relative max-w-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="date"
                  required
                  value={tglPinjam}
                  onChange={(e) => setTglPinjam(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Multi-item rows section */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
                  2. DAFTAR BARANG YANG DIPINJAM ({items.length} ITEM)
                </span>
                <button
                  type="button"
                  id="btnTambahItemAtas"
                  onClick={handleAddItem}
                  className="px-2.5 py-1 bg-slate-100 dark:bg-[#0F0F12] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1 transition-all"
                >
                  <Plus className="w-3 h-3 text-emerald-500" />
                  <span>+ TAMBAH ITEM</span>
                </button>
              </div>

              {/* Items List */}
              <div className="space-y-3" id="itemContainer">
                {items.map((item, index) => {
                  const hasSelected = Boolean(item.sku || item.produk);
                  const mapStok = item.stokMap || 0;
                  const isKosong = mapStok <= 0;
                  const isKurang = item.qty > mapStok;

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800/80 rounded-xl space-y-2.5 relative shadow-sm"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[10px] flex items-center justify-center font-black">
                            {index + 1}
                          </span>
                          <span>PILIH PRODUK &amp; SIZE <span className="text-rose-500">*</span></span>
                        </span>
                        {hasSelected && (
                          <span
                            className={`font-mono text-[10px] font-extrabold px-2 py-0.5 rounded border ${
                              isKosong
                                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                                : isKurang
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
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
                              className="w-full pl-3 pr-8 py-2 bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
                              autoComplete="off"
                            />
                            {item.sku && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleItemChange(item.id, { produk: '', sku: '', size: '', stokMap: 0 });
                                }}
                                className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
                                title="Hapus / Reset"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {renderSuggestions(item.id, item.sku || item.produk || '')}
                          </div>

                          {/* Selected Item Detail preview card */}
                          {item.produk && item.sku && (
                            <div className="mt-1.5 px-2.5 py-1.5 bg-white dark:bg-[#09090B] border border-slate-200/80 dark:border-slate-800 rounded-lg flex items-center justify-between text-xs">
                              <div className="min-w-0 pr-2">
                                <div className="font-bold text-slate-900 dark:text-slate-100 whitespace-normal break-words leading-tight text-[11px]">
                                  {item.produk}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                                  <span>SKU: <b className="text-slate-700 dark:text-slate-300">{item.sku}</b></span>
                                  <span>&bull;</span>
                                  <span>Size: <b className="text-emerald-600 dark:text-emerald-400">{item.size || 'ALL'}</b></span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${(item.stokMap || 0) > 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                                  {(item.stokMap || 0) > 0 ? `${item.stokMap} pcs` : 'Sold'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Qty Stepper (3 cols) */}
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            QTY <span className="text-rose-500">*</span>
                          </label>
                          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-[#09090B] overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleItemChange(item.id, { qty: Math.max(1, item.qty - 1) })}
                              className="px-2.5 py-2 text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.qty || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                handleItemChange(item.id, { qty: val === '' ? 0 : Math.max(1, parseInt(val, 10) || 1) });
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
                              onClick={() => handleItemChange(item.id, { qty: item.qty + 1 })}
                              className="px-2.5 py-2 text-slate-400 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
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
                            className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border border-rose-500/20 transition-all disabled:opacity-30 disabled:pointer-events-none"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>HAPUS</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Submit Buttons */}
            <div className="pt-3 flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleAddItem}
                className="flex-[1] py-3 bg-slate-100 dark:bg-[#0F0F12] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 transition-all text-center leading-tight"
              >
                <Plus className="w-4 h-4 text-emerald-500" />
                <span>+ Tambah<br className="sm:hidden" /> Item Lain</span>
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="flex-[1.5] sm:flex-[2] py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] text-[11px] sm:text-xs tracking-wider uppercase flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all disabled:opacity-50 cursor-pointer text-center leading-tight"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>AJUKAN<br className="sm:hidden" /> PEMINJAMAN</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: STOK TERSEDIA (Visible in 'stok' tab or on lg screens) */}
        <div
          className={`lg:col-span-6 xl:col-span-5 bg-white dark:bg-[#09090B] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4 ${
            activeTab === 'form' ? 'hidden lg:block' : activeTab === 'riwayat' ? 'hidden' : 'block'
          }`}
        >
          {/* Channel Header & Refresh */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
                  {selectedChannel === 'STUDIO'
                    ? '📍 STOK TERSEDIA DI STUDIO (BLOK F)'
                    : selectedChannel === 'SHOPEE'
                    ? '🧡 STOK TERSEDIA DI SHOPEE (SHP)'
                    : selectedChannel === 'TIKTOK'
                    ? '🖤 STOK TERSEDIA DI TIKTOK (TTK)'
                    : '🌐 GABUNGAN STOK (STUDIO / SHP / TTK)'}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Total: <b className="text-slate-800 dark:text-slate-200">{totalStockItems} SKU</b> &bull; <b className="text-emerald-500">{totalStockPcs} Pcs Tersedia</b>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportStockCSV}
                title="Export Stok ke CSV"
                className="p-1.5 bg-slate-100 dark:bg-[#0F0F12] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-emerald-500 text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  loadChannelStocks(true);
                  onRefreshCatalog();
                }}
                title="Sinkronisasi Stok Real-Time Database"
                className={`p-1.5 bg-slate-100 dark:bg-[#0F0F12] hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-400 hover:text-white text-xs transition-colors ${
                  loadingStock ? 'animate-spin text-emerald-500' : ''
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Segmented Channel & Location Buttons (4-tabs including SEMUA) */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-black/50 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] sm:text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setSelectedChannel('STUDIO')}
              className={`py-1.5 rounded-lg transition-all text-center ${
                selectedChannel === 'STUDIO'
                  ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📍 Studio
            </button>
            <button
              type="button"
              onClick={() => setSelectedChannel('SHOPEE')}
              className={`py-1.5 rounded-lg transition-all text-center ${
                selectedChannel === 'SHOPEE'
                  ? 'bg-amber-500 text-black font-extrabold shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🧡 Shopee
            </button>
            <button
              type="button"
              onClick={() => setSelectedChannel('TIKTOK')}
              className={`py-1.5 rounded-lg transition-all text-center ${
                selectedChannel === 'TIKTOK'
                  ? 'bg-slate-800 text-white font-extrabold border border-slate-700 shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🖤 TikTok
            </button>
            <button
              type="button"
              onClick={() => setSelectedChannel('ALL')}
              className={`py-1.5 rounded-lg transition-all text-center ${
                selectedChannel === 'ALL'
                  ? 'bg-cyan-600 text-white font-extrabold shadow-[0_0_10px_rgba(8,145,178,0.3)]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🌐 Semua
            </button>
          </div>

          {/* Guide Callout Box */}
          <div className="px-3 py-2 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
            <span className="shrink-0 mt-0.5">💡</span>
            <p className="leading-snug">
              <b>Acuan Peminjam Divisi Live:</b> Daftar barang yang sudah tersedia di channel/lokasi terpilih. Anda dapat meminjam langsung atau menghindari pengajuan ganda.
            </p>
          </div>

          {/* Search stock input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchStock}
              onChange={(e) => setSearchStock(e.target.value)}
              placeholder="🔍 Cari Nama Produk / SKU / Lokasi..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Table of Available Stocks */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse font-sans">
              <thead className="bg-slate-100 dark:bg-[#0F0F12] text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                {selectedChannel === 'ALL' ? (
                  <tr>
                    <th className="p-2.5">Produk & SKU</th>
                    <th className="p-2.5 text-center w-10">Size</th>
                    <th className="p-2.5 text-center w-12 text-emerald-600 dark:text-emerald-400">Studio</th>
                    <th className="p-2.5 text-center w-12 text-amber-600 dark:text-amber-400">SHP</th>
                    <th className="p-2.5 text-center w-12 text-slate-700 dark:text-slate-300">TTK</th>
                    <th className="p-2.5 text-center w-12 text-cyan-600 dark:text-cyan-400">Total</th>
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
                        <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
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
                  filteredStocks.map((stk) => {
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
                          key={stk.sku}
                          className="hover:bg-slate-50 dark:hover:bg-[#121217] transition-colors group"
                        >
                          <td className="p-2.5">
                            <div className="font-bold text-slate-800 dark:text-slate-200 whitespace-normal break-words leading-tight text-xs">
                              {stk.produk}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-0.5">
                              <span className="font-semibold text-slate-600 dark:text-slate-300">{stk.sku}</span>
                              <span>&bull;</span>
                              <span className="text-emerald-600 dark:text-emerald-400">{stk.locStr}</span>
                            </div>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-bold">
                              {stk.size}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`font-mono text-xs font-bold ${stk.studioQty > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'}`}>
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
                            <span className="font-mono text-xs font-extrabold text-cyan-600 dark:text-cyan-400">
                              {totalLive}
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={stk.sku}
                        className="hover:bg-slate-50 dark:hover:bg-[#121217] transition-colors group"
                      >
                        <td className="p-2.5">
                          <div className="font-bold text-slate-800 dark:text-slate-200 whitespace-normal break-words leading-tight text-xs">
                            {stk.produk}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-0.5">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">{stk.sku}</span>
                            <span>&bull;</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{stk.locStr}</span>
                          </div>
                          {/* Channel breakdown pills */}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {stk.ttkQty > 0 && (
                              <span className="inline-flex items-center text-[9px] px-1.5 py-0.2 bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-200 rounded font-mono font-bold">
                                🖤 TikTok: {stk.ttkQty}
                              </span>
                            )}
                            {stk.shpQty > 0 && (
                              <span className="inline-flex items-center text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded font-mono font-bold">
                                🧡 Shopee: {stk.shpQty}
                              </span>
                            )}
                            {stk.studioQty > 0 && (
                              <span className="inline-flex items-center text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded font-mono font-bold">
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
                            <span className="font-mono text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                              {displayQty}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                              Sold
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FULL WIDTH: RIWAYAT PENGAJUAN (Visible in 'riwayat' tab) */}
        {activeTab === 'riwayat' && (
          <div className="col-span-12 bg-white dark:bg-[#09090B] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-3 gap-3">
              <div>
                <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider font-mono">
                  RIWAYAT PENGAJUAN PEMINJAMAN SEMENTARA ({filteredHistory.length})
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
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
                  placeholder="🔍 Cari Invoice / PIC / Produk / SKU..."
                  className="w-full pl-8 pr-8 py-2 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                />
                {searchHistory && (
                  <button
                    type="button"
                    onClick={() => setSearchHistory('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs italic bg-slate-50 dark:bg-[#0F0F12] rounded-xl border border-slate-200 dark:border-slate-800">
                Tidak ada data riwayat peminjaman yang cocok dengan pencarian &quot;{searchHistory}&quot;
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredHistory.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5 shadow-sm"
                  >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-extrabold text-emerald-500">
                      {rec.noPeminjaman}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleReturn(rec.id)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer transition-all ${
                        rec.status === 'Dipinjam'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {rec.status}
                    </button>
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

                  <div className="p-2 bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800/80 rounded-lg space-y-1 text-[11px]">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">
                      Barang Dipinjam ({rec.items.length} SKU):
                    </div>
                    {rec.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                        <span className="line-clamp-1">
                          &bull; {it.produk} ({it.size})
                        </span>
                        <span className="font-mono font-bold text-emerald-500">{it.qty} Pcs</span>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedRecordForModal(rec)}
                      className="py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                    >
                      <FileText className="w-3 h-3 text-emerald-400" />
                      <span>Detail</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintSJ(rec)}
                      className="py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-colors"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Cetak SJ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendWa(rec, 'grup')}
                      className="py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-lg text-[10px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Share2 className="w-3 h-3" />
                      <span>Kirim WA</span>
                    </button>
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
          <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-[#0F0F12]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                    Surat Peminjaman Sementara ({selectedRecordForModal.noPeminjaman})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    PIC: {selectedRecordForModal.namaPeminjam} &bull; {selectedRecordForModal.tglPinjam}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecordForModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Document Summary Card */}
              <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">No Invoice:</span>
                  <span className="font-bold text-emerald-400">{selectedRecordForModal.noPeminjaman}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">PIC Peminjam:</span>
                  <span className="text-slate-200">{selectedRecordForModal.namaPeminjam}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Keperluan:</span>
                  <span className="text-slate-200">{selectedRecordForModal.keperluan}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Tanggal:</span>
                  <span className="text-slate-200">{selectedRecordForModal.tglPinjam}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="space-y-1.5">
                <div className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                  Daftar Barang ({selectedRecordForModal.items.length} Item):
                </div>
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-[#0F0F12] text-slate-400 text-[10px] font-bold uppercase">
                      <tr>
                        <th className="p-2">Produk</th>
                        <th className="p-2 text-center">Size</th>
                        <th className="p-2 text-center">Qty</th>
                        <th className="p-2">Lokasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                      {selectedRecordForModal.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-sans font-semibold text-slate-800 dark:text-slate-200">{it.produk}</td>
                          <td className="p-2 text-center text-slate-400">{it.size}</td>
                          <td className="p-2 text-center font-bold text-emerald-400">{it.qty}</td>
                          <td className="p-2 text-slate-400">{it.lokasi}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* WhatsApp Fonnte Templates */}
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Kirim Notifikasi WhatsApp (Fonnte):</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendWa(selectedRecordForModal, 'personal')}
                    className="p-3 bg-slate-50 dark:bg-[#0F0F12] hover:bg-slate-100 dark:hover:bg-[#16161a] border border-slate-200 dark:border-slate-800 rounded-xl text-left transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-400">
                        1. Pesan Personal PIC
                      </span>
                      {copiedWaType === 'personal' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Kirim konfirmasi pengajuan langsung ke WhatsApp peminjam.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendWa(selectedRecordForModal, 'grup')}
                    className="p-3 bg-slate-50 dark:bg-[#0F0F12] hover:bg-slate-100 dark:hover:bg-[#16161a] border border-slate-200 dark:border-slate-800 rounded-xl text-left transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-400">
                        2. Pesan Grup Gudang
                      </span>
                      {copiedWaType === 'grup' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Kirim perintah cetak Surat Jalan ke grup WhatsApp gudang.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedRecordForModal(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => handlePrintSJ(selectedRecordForModal)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl shadow-[0_0_12px_rgba(16,185,129,0.3)] text-xs flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Surat Jalan (PDF)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
