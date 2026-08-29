import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  RefreshCw,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardList,
  CheckCircle2,
  Clock,
  Search,
  Check,
  Trash2,
  Filter,
  AlertTriangle,
  CheckSquare,
  Square,
  ArrowRightLeft,
  SlidersHorizontal,
  Loader2,
  ShieldCheck,
  XCircle,
  MapPin,
  Tag,
  Boxes,
  Lock,
} from 'lucide-react';
import {
  LogProdukItem,
  StockOpnameQueueItem,
  StockRealtimeItem,
  ProductItem,
  UserSession,
} from '../types';
import {
  fetchRecentLogs,
  fetchAllLogs,
  fetchStockOpnameQueue,
  fetchStockForLocations,
  fetchAllStockRealtime,
  approveStockOpnameQueueItems,
  rejectStockOpnameQueueItems,
  deleteStockOpnameQueueItems,
  getAreaFromLokasi,
} from '../services/supabase';
import { hasPermission, isSuperadmin } from '../services/permissions';

interface LiveInventoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocations: string[];
  productCatalog?: ProductItem[];
  session?: UserSession | null;
  onRefreshCatalog?: () => Promise<void> | void;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const LiveInventoryDrawer: React.FC<LiveInventoryDrawerProps> = ({
  isOpen,
  onClose,
  currentLocations,
  productCatalog = [],
  session,
  onRefreshCatalog,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<'logs' | 'so' | 'stock'>('logs');
  const [logs, setLogs] = useState<LogProdukItem[]>([]);
  const [soQueue, setSoQueue] = useState<StockOpnameQueueItem[]>([]);
  const [stockList, setStockList] = useState<StockRealtimeItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);

  // Tab 1: Logs filters & search
  const [logSearch, setLogSearch] = useState('');
  const [logTypeFilter, setLogTypeFilter] = useState<'ALL' | 'IN' | 'OUT' | 'ADJ_IN' | 'ADJ_OUT'>('ALL');
  const [logAreaFilter, setLogAreaFilter] = useState<string>('ALL');

  // Tab 2: SO Queue filters, selection & search
  const [soSearch, setSoSearch] = useState('');
  const [soStatusFilter, setSoStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [soDiffFilter, setSoDiffFilter] = useState<'ALL' | 'DIFF' | 'PLUS' | 'MINUS' | 'ZERO'>('ALL');
  const [selectedSoIds, setSelectedSoIds] = useState<string[]>([]);

  // Tab 3: Stock Lokasi filters & search
  const [stockSearch, setStockSearch] = useState('');
  const [stockLocationMode, setStockLocationMode] = useState<'ALL' | 'ACTIVE_ONLY'>('ALL');
  const [stockAreaFilter, setStockAreaFilter] = useState<string>('ALL');
  const [showDealposComparison, setShowDealposComparison] = useState(true);

  // Map product catalog by SKU for rapid DealPOS comparison
  const catalogMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    for (const p of productCatalog) {
      if (p && p.k) {
        map.set(p.k.toUpperCase().trim(), p);
      }
    }
    return map;
  }, [productCatalog]);

  const canApproveSo = hasPermission(session, 'can_approve_so');
  const canExportData = hasPermission(session, 'can_export_data');
  const canSyncDealpos = hasPermission(session, 'can_sync_dealpos');

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'logs') {
        const data = await fetchAllLogs(50000);
        setLogs(data);
      } else if (activeTab === 'so') {
        const data = await fetchStockOpnameQueue('ALL', 50000);
        setSoQueue(data);
        setSelectedSoIds([]); // reset selection
      } else if (activeTab === 'stock') {
        if (stockLocationMode === 'ACTIVE_ONLY' && currentLocations.length > 0) {
          const data = await fetchStockForLocations(currentLocations);
          setStockList(data);
        } else {
          const data = await fetchAllStockRealtime(50000);
          setStockList(data);
        }
      }
    } catch (e) {
      console.warn('Error loading live data:', e);
      if (onNotify) {
        onNotify('Gagal memuat data dari Supabase.', 'warning');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSyncCatalog = async () => {
    if (!onRefreshCatalog) return;
    setIsSyncingCatalog(true);
    try {
      await onRefreshCatalog();
      if (onNotify) {
        onNotify('Katalog produk & stok DealPOS berhasil disinkronisasi.', 'success');
      }
    } catch (err) {
      console.warn('Error syncing catalog:', err);
      if (onNotify) {
        onNotify('Gagal sinkronisasi katalog DealPOS.', 'error');
      }
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, activeTab, stockLocationMode]);

  // Distinct areas in logs
  const distinctLogAreas = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) {
      if (l.area) set.add(l.area);
      else if (l.lokasi) set.add(getAreaFromLokasi(l.lokasi));
    }
    return Array.from(set).sort();
  }, [logs]);

  // Distinct areas in stock list
  const distinctStockAreas = useMemo(() => {
    const set = new Set<string>();
    for (const s of stockList) {
      if (s.area) set.add(s.area);
      else if (s.lokasi) set.add(getAreaFromLokasi(s.lokasi));
    }
    return Array.from(set).sort();
  }, [stockList]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Search Query
      if (logSearch.trim()) {
        const q = logSearch.toLowerCase().trim();
        const matchSku = (log.sku || '').toLowerCase().includes(q);
        const matchName = (log.nama_produk || '').toLowerCase().includes(q);
        const matchLok = (log.lokasi || '').toLowerCase().includes(q);
        const matchInv = (log.invoice || '').toLowerCase().includes(q);
        const matchOp = (log.operator || '').toLowerCase().includes(q);
        const matchKet = (log.keterangan || '').toLowerCase().includes(q);
        if (!matchSku && !matchName && !matchLok && !matchInv && !matchOp && !matchKet) {
          return false;
        }
      }

      // 2. Type Filter
      if (logTypeFilter !== 'ALL') {
        if (log.type !== logTypeFilter) return false;
      }

      // 3. Area Filter
      if (logAreaFilter !== 'ALL') {
        const logArea = log.area || getAreaFromLokasi(log.lokasi);
        if (logArea.toUpperCase() !== logAreaFilter.toUpperCase()) return false;
      }

      return true;
    });
  }, [logs, logSearch, logTypeFilter, logAreaFilter]);

  // Filtered SO Queue
  const filteredSoQueue = useMemo(() => {
    return soQueue.filter((item) => {
      // 1. Status filter (Default PENDING)
      if (soStatusFilter !== 'ALL') {
        const itemStatus = (item.status || 'PENDING').toUpperCase();
        if (itemStatus !== soStatusFilter) return false;
      }

      // 2. Diff filter
      if (soDiffFilter === 'DIFF' && item.selisih === 0) return false;
      if (soDiffFilter === 'PLUS' && item.selisih <= 0) return false;
      if (soDiffFilter === 'MINUS' && item.selisih >= 0) return false;
      if (soDiffFilter === 'ZERO' && item.selisih !== 0) return false;

      // 3. Search Query
      if (soSearch.trim()) {
        const q = soSearch.toLowerCase().trim();
        const matchSku = (item.sku || '').toLowerCase().includes(q);
        const matchName = (item.nama_produk || '').toLowerCase().includes(q);
        const matchLok = (item.lokasi || '').toLowerCase().includes(q);
        const matchOp = (item.operator || '').toLowerCase().includes(q);
        const matchSesi = (item.sesi_id || '').toLowerCase().includes(q);
        if (!matchSku && !matchName && !matchLok && !matchOp && !matchSesi) {
          return false;
        }
      }

      return true;
    });
  }, [soQueue, soStatusFilter, soDiffFilter, soSearch]);

  // Pending count for SO badge
  const pendingSoCount = useMemo(() => {
    return soQueue.filter((item) => (item.status || 'PENDING').toUpperCase() === 'PENDING').length;
  }, [soQueue]);

  // Filtered Stock List
  const filteredStockList = useMemo(() => {
    return stockList.filter((item) => {
      // 1. Search Query
      if (stockSearch.trim()) {
        const q = stockSearch.toLowerCase().trim();
        const matchSku = (item.sku || '').toLowerCase().includes(q);
        const matchName = (item.nama_produk || '').toLowerCase().includes(q);
        const matchLok = (item.lokasi || '').toLowerCase().includes(q);
        if (!matchSku && !matchName && !matchLok) {
          return false;
        }
      }

      // 2. Area Filter
      if (stockAreaFilter !== 'ALL') {
        const itemArea = item.area || getAreaFromLokasi(item.lokasi);
        if (itemArea.toUpperCase() !== stockAreaFilter.toUpperCase()) return false;
      }

      return true;
    });
  }, [stockList, stockSearch, stockAreaFilter]);

  // Checkbox handlers for SO Queue
  const isAllFilteredSelected = useMemo(() => {
    if (filteredSoQueue.length === 0) return false;
    return filteredSoQueue.every((it) => it.id && selectedSoIds.includes(it.id));
  }, [filteredSoQueue, selectedSoIds]);

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      // Unselect only filtered ones
      const filteredIds = new Set(filteredSoQueue.map((it) => it.id).filter(Boolean) as string[]);
      setSelectedSoIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      // Select all filtered ones
      const newIds = new Set(selectedSoIds);
      filteredSoQueue.forEach((it) => {
        if (it.id) newIds.add(it.id);
      });
      setSelectedSoIds(Array.from(newIds));
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedSoIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // SO Actions (Approve, Reject, Delete)
  const currentOperator = session?.username || 'Operator';

  const handleApproveSelected = async () => {
    if (selectedSoIds.length === 0) return;
    const itemsToApprove = soQueue.filter((it) => it.id && selectedSoIds.includes(it.id));
    if (!itemsToApprove.length) return;

    if (!confirm(`Konfirmasi Approve Adjustment untuk ${itemsToApprove.length} item SO terpilih?\nPenyesuaian stok akan otomatis dicatat ke Log Produk.`)) {
      return;
    }

    setIsActionLoading(true);
    try {
      const res = await approveStockOpnameQueueItems(itemsToApprove, currentOperator);
      if (res.success) {
        if (onNotify) onNotify(`Berhasil Approve ${res.count} item SO & mencatat log adjustment!`, 'success');
        await loadData();
      } else {
        if (onNotify) onNotify(`Gagal approve: ${res.error}`, 'error');
      }
    } catch (e: any) {
      if (onNotify) onNotify(`Terjadi kesalahan: ${e.message}`, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRejectSelected = async () => {
    if (selectedSoIds.length === 0) return;
    const itemsToReject = soQueue.filter((it) => it.id && selectedSoIds.includes(it.id));
    if (!itemsToReject.length) return;

    if (!confirm(`Konfirmasi Reject untuk ${itemsToReject.length} item SO terpilih?`)) {
      return;
    }

    setIsActionLoading(true);
    try {
      const res = await rejectStockOpnameQueueItems(itemsToReject, currentOperator);
      if (res.success) {
        if (onNotify) onNotify(`Berhasil me-Reject ${res.count} item SO.`, 'info');
        await loadData();
      } else {
        if (onNotify) onNotify(`Gagal reject: ${res.error}`, 'error');
      }
    } catch (e: any) {
      if (onNotify) onNotify(`Terjadi kesalahan: ${e.message}`, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedSoIds.length === 0) return;

    if (!confirm(`Hapus permanen ${selectedSoIds.length} baris riwayat SO terpilih dari database?`)) {
      return;
    }

    setIsActionLoading(true);
    try {
      const res = await deleteStockOpnameQueueItems(selectedSoIds);
      if (res.success) {
        if (onNotify) onNotify(`Berhasil menghapus ${res.count} item dari antrean SO.`, 'info');
        await loadData();
      } else {
        if (onNotify) onNotify(`Gagal menghapus: ${res.error}`, 'error');
      }
    } catch (e: any) {
      if (onNotify) onNotify(`Terjadi kesalahan: ${e.message}`, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Single Item Handlers
  const handleSingleApprove = async (item: StockOpnameQueueItem) => {
    setIsActionLoading(true);
    try {
      const res = await approveStockOpnameQueueItems([item], currentOperator);
      if (res.success) {
        if (onNotify) onNotify(`Item ${item.sku} berhasil di-Approve!`, 'success');
        await loadData();
      } else {
        if (onNotify) onNotify(`Gagal approve: ${res.error}`, 'error');
      }
    } catch (e: any) {
      if (onNotify) onNotify(e.message, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSingleReject = async (item: StockOpnameQueueItem) => {
    setIsActionLoading(true);
    try {
      const res = await rejectStockOpnameQueueItems([item], currentOperator);
      if (res.success) {
        if (onNotify) onNotify(`Item ${item.sku} di-Reject.`, 'info');
        await loadData();
      } else {
        if (onNotify) onNotify(`Gagal reject: ${res.error}`, 'error');
      }
    } catch (e: any) {
      if (onNotify) onNotify(e.message, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSingleDelete = async (id: string) => {
    if (!confirm('Hapus baris SO ini secara permanen?')) return;
    setIsActionLoading(true);
    try {
      const res = await deleteStockOpnameQueueItems([id]);
      if (res.success) {
        if (onNotify) onNotify('Item berhasil dihapus.', 'info');
        await loadData();
      } else {
        if (onNotify) onNotify(`Gagal menghapus: ${res.error}`, 'error');
      }
    } catch (e: any) {
      if (onNotify) onNotify(e.message, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="liveInventoryDrawerOverlay"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end"
    >
      <div
        id="liveInventoryDrawer"
        className="w-full max-w-xl bg-white dark:bg-[#09090B] h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800/80 transition-colors relative"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-[#0F0F12]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Layers className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  Supabase Real-time Sync
                </h2>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live DB
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Audit Mutasi, Approval Stock Opname, & Komparasi Stok
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              id="btnRefreshLiveSync"
              type="button"
              onClick={loadData}
              disabled={isLoading || isActionLoading}
              title="Refresh Data Terkini"
              className="p-2 text-slate-400 hover:text-emerald-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
            <button
              id="btnCloseLiveSync"
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs Header */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-3 pt-2 gap-1 bg-slate-50/70 dark:bg-[#0F0F12]/70 overflow-x-auto no-scrollbar">
          <button
            id="tabMutasiLog"
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
              activeTab === 'logs'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-extrabold'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Mutasi Log</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 font-mono text-slate-600 dark:text-slate-300">
              {filteredLogs.length}
            </span>
          </button>

          <button
            id="tabSoQueue"
            type="button"
            onClick={() => setActiveTab('so')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
              activeTab === 'so'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-extrabold'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>SO Queue</span>
            {pendingSoCount > 0 ? (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500 text-black font-extrabold animate-pulse">
                {pendingSoCount} pending
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 font-mono text-slate-600 dark:text-slate-300">
                {soQueue.length}
              </span>
            )}
          </button>

          <button
            id="tabStokLokasi"
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
              activeTab === 'stock'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-extrabold'
                : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Stok Lokasi</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-800 font-mono text-slate-600 dark:text-slate-300">
              {filteredStockList.length}
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 pb-24">
          {/* ========================================================================= */}
          {/* TAB 1: MUTASI LOG (ALL DATA, FILTER, SEARCH) */}
          {/* ========================================================================= */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              {/* Search & Filters Controls (Sticky Top) */}
              <div className="sticky -top-3 sm:-top-4 z-20 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-md pt-1 pb-2.5 border-b border-slate-200 dark:border-slate-800 -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-2 shadow-sm">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="inputSearchLog"
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Cari SKU, nama produk, invoice, lokasi, operator..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {logSearch && (
                    <button
                      type="button"
                      onClick={() => setLogSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter Pills: Type */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-0.5">
                    <Filter className="w-2.5 h-2.5" /> Tipe:
                  </span>
                  {(['ALL', 'IN', 'OUT', 'ADJ_IN', 'ADJ_OUT'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setLogTypeFilter(t)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer flex-shrink-0 ${
                        logTypeFilter === t
                          ? t === 'IN'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : t === 'OUT'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : t === 'ADJ_IN'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : t === 'ADJ_OUT'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'bg-slate-800 dark:bg-slate-200 text-white dark:text-black shadow-sm'
                          : 'bg-white dark:bg-[#09090B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      {t === 'ALL' ? 'Semua Tipe' : `#${t}`}
                    </button>
                  ))}
                </div>

                {/* Filter Row: Area & Counter */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-slate-400">Area:</span>
                    <select
                      id="selectLogAreaFilter"
                      value={logAreaFilter}
                      onChange={(e) => setLogAreaFilter(e.target.value)}
                      className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-md px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-200 font-medium focus:outline-none"
                    >
                      <option value="ALL">Semua Area ({distinctLogAreas.length})</option>
                      {distinctLogAreas.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-[10px] font-mono text-slate-400">
                    Menampilkan <b>{filteredLogs.length}</b> dari {logs.length} data
                  </span>
                </div>
              </div>

              {/* Logs List Container */}
              {isLoading ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-500" />
                  <p className="text-xs">Memuat riwayat log dari Supabase...</p>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-16 bg-slate-50/50 dark:bg-[#0F0F12]/50 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <Clock className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Tidak ada catatan mutasi yang cocok
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {logSearch || logTypeFilter !== 'ALL' || logAreaFilter !== 'ALL'
                      ? 'Coba sesuaikan filter atau kata kunci pencarian.'
                      : 'Belum ada catatan mutasi di log_produk Supabase.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLogs.map((log, idx) => {
                    const isAdj = log.type === 'ADJ_IN' || log.type === 'ADJ_OUT';
                    const isIn = log.type === 'IN' || log.type === 'ADJ_IN';

                    return (
                      <div
                        key={log.id || `${log.sku}_${idx}`}
                        className="p-3 bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs space-y-1.5 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm"
                      >
                        {/* Header Row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-extrabold px-2 py-0.5 rounded text-[10px] flex items-center gap-1 ${
                                log.type === 'IN'
                                  ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                                  : log.type === 'OUT'
                                  ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                  : log.type === 'ADJ_IN'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {isIn ? (
                                <ArrowDownLeft className="w-3 h-3" />
                              ) : (
                                <ArrowUpRight className="w-3 h-3" />
                              )}
                              #{log.type}
                            </span>
                            {isAdj && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                Adjustment
                              </span>
                            )}
                          </div>

                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {log.created_at ? new Date(log.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                          </span>
                        </div>

                        {/* SKU & Product Name */}
                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                            {log.sku}
                          </div>
                          <div className="text-slate-600 dark:text-slate-300 text-xs font-medium truncate mt-0.5">
                            {log.nama_produk} {log.size && log.size !== '-' ? `(Size: ${log.size})` : ''}
                          </div>
                        </div>

                        {/* Location, Qty, and Invoice */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <span className="flex items-center gap-0.5 text-slate-700 dark:text-slate-300 font-mono">
                              <MapPin className="w-3 h-3 text-emerald-500" />
                              <b>#{log.lokasi}</b> ({log.area || getAreaFromLokasi(log.lokasi)})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 font-mono text-[10px]">
                              Inv: <span className="text-slate-600 dark:text-slate-300">{log.invoice}</span>
                            </span>
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white font-mono bg-slate-100 dark:bg-[#09090B] px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                              Qty: {log.qty}
                            </span>
                          </div>
                        </div>

                        {/* Keterangan & Operator */}
                        {(log.keterangan || log.operator) && (
                          <div className="text-[10px] text-slate-400 bg-slate-50/70 dark:bg-[#09090B]/60 p-1.5 rounded-md border border-slate-100 dark:border-slate-800/50 flex items-center justify-between">
                            <span className="truncate max-w-[260px]">
                              {log.keterangan ? `Ket: ${log.keterangan}` : `Op: ${log.operator}`}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 flex-shrink-0 ml-1">
                              Op: {log.operator}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: STOCK OPNAME QUEUE (STATUS PENDING ONLY, APPROVE/REJECT/DELETE BATCH) */}
          {/* ========================================================================= */}
          {activeTab === 'so' && (
            <div className="space-y-3">
              {/* Search & Status Filters (Sticky Top) */}
              <div className="sticky -top-3 sm:-top-4 z-20 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-md pt-1 pb-2.5 border-b border-slate-200 dark:border-slate-800 -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-2 shadow-sm">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="inputSearchSoQueue"
                    type="text"
                    value={soSearch}
                    onChange={(e) => setSoSearch(e.target.value)}
                    placeholder="Cari SKU, nama produk, lokasi, sesi, operator..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {soSearch && (
                    <button
                      type="button"
                      onClick={() => setSoSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter Toggle Pills */}
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-0.5">
                    <Filter className="w-2.5 h-2.5" /> Status:
                  </span>
                  {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((st) => {
                    const count =
                      st === 'ALL'
                        ? soQueue.length
                        : soQueue.filter((x) => (x.status || 'PENDING').toUpperCase() === st).length;

                    return (
                      <button
                        key={st}
                        id={`btnFilterSoStatus_${st}`}
                        type="button"
                        onClick={() => setSoStatusFilter(st)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer flex-shrink-0 flex items-center gap-1 ${
                          soStatusFilter === st
                            ? st === 'PENDING'
                              ? 'bg-amber-500 text-black shadow-sm font-extrabold ring-1 ring-amber-500/50'
                              : st === 'APPROVED'
                              ? 'bg-emerald-600 text-white shadow-sm font-extrabold'
                              : st === 'REJECTED'
                              ? 'bg-rose-600 text-white shadow-sm font-extrabold'
                              : 'bg-slate-800 dark:bg-slate-200 text-white dark:text-black font-extrabold'
                            : 'bg-white dark:bg-[#09090B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        {st === 'PENDING' && <Clock className="w-3 h-3 text-black" />}
                        {st === 'APPROVED' && <CheckCircle2 className="w-3 h-3 text-emerald-300" />}
                        {st === 'REJECTED' && <XCircle className="w-3 h-3 text-rose-300" />}
                        <span>
                          {st === 'PENDING'
                            ? 'Pending'
                            : st === 'APPROVED'
                            ? 'Approved'
                            : st === 'REJECTED'
                            ? 'Rejected'
                            : 'Semua'}
                        </span>
                        <span
                          className={`text-[9px] px-1 py-0.1 rounded-full font-mono ${
                            soStatusFilter === st
                              ? 'bg-black/20 text-current'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Secondary Diff Filter */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 text-[10px]">
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    <span className="text-slate-400">Selisih:</span>
                    <button
                      type="button"
                      onClick={() => setSoDiffFilter('ALL')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        soDiffFilter === 'ALL'
                          ? 'bg-slate-700 text-white font-bold'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setSoDiffFilter('DIFF')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        soDiffFilter === 'DIFF'
                          ? 'bg-amber-600 text-white font-bold'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      Ada Selisih (≠0)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSoDiffFilter('PLUS')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        soDiffFilter === 'PLUS'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      Lebih (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSoDiffFilter('MINUS')}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        soDiffFilter === 'MINUS'
                          ? 'bg-rose-600 text-white font-bold'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      Kurang (-)
                    </button>
                  </div>

                  <span className="text-slate-400 font-mono flex-shrink-0">
                    Total <b>{filteredSoQueue.length}</b> baris
                  </span>
                </div>
              </div>

              {/* Master Select All Bar */}
              {filteredSoQueue.length > 0 && (
                <div className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-[#0F0F12] rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                  <button
                    id="btnToggleSelectAllSo"
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200 hover:text-emerald-500 cursor-pointer"
                  >
                    {isAllFilteredSelected ? (
                      <CheckSquare className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Pilih Semua di Halaman ({filteredSoQueue.length})</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {selectedSoIds.length > 0 && (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        {selectedSoIds.length} terpilih
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* SO Items List */}
              {isLoading ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-500" />
                  <p className="text-xs">Memuat antrean Stock Opname dari Supabase...</p>
                </div>
              ) : filteredSoQueue.length === 0 ? (
                <div className="text-center py-16 bg-slate-50/50 dark:bg-[#0F0F12]/50 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <ShieldCheck className="w-8 h-8 text-emerald-500/60 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Tidak ada antrean Stock Opname{' '}
                    {soStatusFilter === 'PENDING'
                      ? 'pending'
                      : soStatusFilter === 'APPROVED'
                      ? 'approved'
                      : soStatusFilter === 'REJECTED'
                      ? 'rejected'
                      : ''}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {soStatusFilter === 'PENDING'
                      ? 'Semua data scan SO telah di-review / tidak ada selisih pending.'
                      : 'Coba ubah filter status atau kata kunci pencarian.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredSoQueue.map((item, idx) => {
                    const isSelected = item.id ? selectedSoIds.includes(item.id) : false;
                    const statusUpper = (item.status || 'PENDING').toUpperCase();
                    const isPending = statusUpper === 'PENDING';
                    const isApproved = statusUpper === 'APPROVED';
                    const isRejected = statusUpper === 'REJECTED';

                    return (
                      <div
                        key={item.id || `${item.sku}_${idx}`}
                        className={`p-3.5 bg-white dark:bg-[#0F0F12] border rounded-xl text-xs space-y-2.5 transition-all shadow-sm ${
                          isSelected
                            ? 'border-emerald-500 ring-1 ring-emerald-500/40 bg-emerald-50/10 dark:bg-emerald-950/10'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        {/* Top Bar with Checkbox, SKU, and Status Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            {item.id && (
                              <button
                                type="button"
                                onClick={() => handleToggleSelectItem(item.id!)}
                                className="mt-0.5 text-slate-400 hover:text-emerald-500 cursor-pointer"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-emerald-500" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            )}

                            <div>
                              <div className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm sm:text-base">
                                {item.sku}
                              </div>
                              <div className="text-slate-600 dark:text-slate-300 font-semibold text-xs mt-0.5">
                                {item.nama_produk} {item.size && item.size !== '-' ? `(Size: ${item.size})` : ''}
                              </div>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <span
                            className={`font-extrabold px-2 py-0.5 rounded text-[10px] uppercase flex items-center gap-1 flex-shrink-0 ${
                              isPending
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                : isApproved
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {isPending && <Clock className="w-3 h-3 text-amber-500" />}
                            {isApproved && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                            {isRejected && <XCircle className="w-3 h-3 text-rose-500" />}
                            {statusUpper}
                          </span>
                        </div>

                        {/* 3-Column Stock Comparison Grid */}
                        <div className="grid grid-cols-3 gap-1 bg-slate-50 dark:bg-[#09090B] border border-slate-100 dark:border-slate-800 p-2.5 rounded-lg text-center">
                          <div>
                            <div className="text-slate-400 dark:text-slate-500 text-[10px] font-medium">
                              Sistem
                            </div>
                            <div className="font-bold text-slate-700 dark:text-slate-300 font-mono text-sm">
                              {item.qty_sistem}
                            </div>
                          </div>

                          <div className="border-x border-slate-200 dark:border-slate-800/80 px-1">
                            <div className="text-slate-400 dark:text-slate-500 text-[10px] font-medium">
                              Fisik Scan
                            </div>
                            <div className="font-extrabold text-slate-900 dark:text-white font-mono text-sm">
                              {item.qty_fisik}
                            </div>
                          </div>

                          <div>
                            <div className="text-slate-400 dark:text-slate-500 text-[10px] font-medium">
                              Selisih
                            </div>
                            <div
                              className={`font-black font-mono text-sm ${
                                item.selisih > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : item.selisih < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {item.selisih > 0 ? `+${item.selisih}` : item.selisih}
                            </div>
                          </div>
                        </div>

                        {/* Footer Details: Location, Operator, Sesi */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-400 flex-wrap gap-1">
                          <span className="flex items-center gap-1 font-mono text-slate-600 dark:text-slate-300">
                            <MapPin className="w-3 h-3 text-emerald-500" />
                            <b>#{item.lokasi}</b> ({item.area || getAreaFromLokasi(item.lokasi)})
                          </span>

                          <span className="font-mono">
                            Op: <b className="text-slate-600 dark:text-slate-300">{item.operator}</b>
                          </span>

                          {item.sesi_id && (
                            <span className="text-[9px] text-slate-400 font-mono truncate max-w-[120px]">
                              Sesi: {item.sesi_id}
                            </span>
                          )}
                        </div>

                        {/* Single Item Action Buttons */}
                        <div className="flex items-center justify-end gap-1.5 pt-1">
                          {isPending && (
                            canApproveSo ? (
                              <>
                                <button
                                  id={`btnApproveSingle_${item.id}`}
                                  type="button"
                                  disabled={isActionLoading}
                                  onClick={() => handleSingleApprove(item)}
                                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                                >
                                  <Check className="w-3 h-3" /> Approve Adj
                                </button>

                                <button
                                  id={`btnRejectSingle_${item.id}`}
                                  type="button"
                                  disabled={isActionLoading}
                                  onClick={() => handleSingleReject(item)}
                                  className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                                >
                                  <X className="w-3 h-3" /> Reject
                                </button>
                              </>
                            ) : (
                              <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md">
                                <Lock className="w-3 h-3" />
                                <span>Menunggu Otorisasi Superadmin</span>
                              </div>
                            )
                          )}

                          {item.id && canApproveSo && (
                            <button
                              id={`btnDeleteSingle_${item.id}`}
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => handleSingleDelete(item.id!)}
                              title="Hapus baris SO ini"
                              className="p-1 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: STOK LOKASI (DENGAN KOMPARASI DEALPOS & FILTER/SEARCH) */}
          {/* ========================================================================= */}
          {activeTab === 'stock' && (
            <div className="space-y-3">
              {/* Search & Stock Filters (Sticky Top) */}
              <div className="sticky -top-3 sm:-top-4 z-20 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-md pt-1 pb-2.5 border-b border-slate-200 dark:border-slate-800 -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-2 shadow-sm">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="inputSearchStock"
                    type="text"
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    placeholder="Cari SKU, nama produk, atau lokasi rak..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {stockSearch && (
                    <button
                      type="button"
                      onClick={() => setStockSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Location Scope & Comparison Toggles */}
                <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
                  <div className="flex items-center gap-1">
                    <button
                      id="btnStockScopeAll"
                      type="button"
                      onClick={() => setStockLocationMode('ALL')}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                        stockLocationMode === 'ALL'
                          ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-black font-extrabold shadow-sm'
                          : 'bg-white dark:bg-[#09090B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      Semua Rak Gudang
                    </button>

                    <button
                      id="btnStockScopeActive"
                      type="button"
                      onClick={() => setStockLocationMode('ACTIVE_ONLY')}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                        stockLocationMode === 'ACTIVE_ONLY'
                          ? 'bg-emerald-600 text-white font-extrabold shadow-sm'
                          : 'bg-white dark:bg-[#09090B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      Rak Aktif Saja ({currentLocations.length})
                    </button>
                  </div>

                  {/* Toggle DealPOS Comparison & Sync */}
                  <div className="flex items-center gap-1.5">
                    <button
                      id="btnToggleDealposComparison"
                      type="button"
                      onClick={() => setShowDealposComparison((v) => !v)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        showDealposComparison
                          ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30'
                          : 'bg-white dark:bg-[#09090B] text-slate-400 border border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <ArrowRightLeft className="w-3 h-3" />
                      <span>Komparasi DealPOS {showDealposComparison ? 'ON' : 'OFF'}</span>
                    </button>

                    {onRefreshCatalog && (
                      <button
                        id="btnSyncDealposCatalog"
                        type="button"
                        onClick={handleManualSyncCatalog}
                        disabled={isSyncingCatalog}
                        title="Sync Katalog & Stok DealPOS dari GAS/Sheets/Supabase"
                        className="px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncingCatalog ? 'animate-spin' : ''}`} />
                        <span>Sync DealPOS</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Area Filter Row */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-slate-400">Area:</span>
                    <select
                      id="selectStockAreaFilter"
                      value={stockAreaFilter}
                      onChange={(e) => setStockAreaFilter(e.target.value)}
                      className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-md px-2 py-0.5 text-[11px] text-slate-700 dark:text-slate-200 font-medium focus:outline-none"
                    >
                      <option value="ALL">Semua Area ({distinctStockAreas.length})</option>
                      {distinctStockAreas.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-[10px] font-mono text-slate-400">
                    Menampilkan <b>{filteredStockList.length}</b> SKU
                  </span>
                </div>
              </div>

              {/* Stock Items List */}
              {isLoading ? (
                <div className="py-16 text-center text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-500" />
                  <p className="text-xs">Memuat data stok lokasi dari Supabase...</p>
                </div>
              ) : filteredStockList.length === 0 ? (
                <div className="text-center py-16 bg-slate-50/50 dark:bg-[#0F0F12]/50 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4">
                  <Boxes className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Tidak ada data stok di lokasi terpilih
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {stockSearch || stockAreaFilter !== 'ALL'
                      ? 'Coba sesuaikan kata kunci pencarian atau ganti filter area.'
                      : 'Belum ada data stok tersimpan di view_stok_realtime.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredStockList.map((st, idx) => {
                    const catalogItem = catalogMap.get((st.sku || '').toUpperCase());
                    const namaProduk = st.nama_produk || catalogItem?.p || st.sku;
                    const size = st.size || catalogItem?.s || '-';
                    const fisikStok = Number(st.sisa_stok) || 0;

                    // Calculate Dealpos comparison if available
                    let dealposQty: number | null = null;
                    if (catalogItem) {
                      const dMap = catalogItem.stokMap ?? 0;
                      const dStudio = catalogItem.stokStudio ?? 0;
                      const dShp = catalogItem.stokShp ?? 0;
                      const dTtk = catalogItem.stokTtk ?? 0;
                      const sumDp = dMap + dStudio + dShp + dTtk;
                      if (sumDp > 0 || catalogItem.stokMap !== undefined) {
                        dealposQty = sumDp;
                      }
                    }

                    const selisihDp = dealposQty !== null ? fisikStok - dealposQty : null;

                    return (
                      <div
                        key={st.id || `${st.sku}_${st.lokasi}_${idx}`}
                        className="p-3 bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl text-xs space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-sm"
                      >
                        {/* Top: SKU, Location, Area */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                              {st.sku}
                            </div>
                            <div className="text-slate-600 dark:text-slate-300 font-medium text-xs truncate mt-0.5">
                              {namaProduk} {size && size !== '-' ? `(Size: ${size})` : ''}
                            </div>
                          </div>

                          <span className="bg-slate-100 dark:bg-[#09090B] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 flex-shrink-0">
                            <MapPin className="w-3 h-3 text-emerald-500" />
                            #{st.lokasi}
                          </span>
                        </div>

                        {/* Comparison Card Box */}
                        {showDealposComparison ? (
                          <div className="grid grid-cols-3 gap-1 bg-slate-50 dark:bg-[#09090B] border border-slate-100 dark:border-slate-800 p-2 rounded-lg text-center">
                            <div>
                              <div className="text-slate-400 dark:text-slate-500 text-[10px] font-semibold">
                                Fisik WMS
                              </div>
                              <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                {fisikStok}
                              </div>
                            </div>

                            <div className="border-x border-slate-200 dark:border-slate-800/80 px-1">
                              <div className="text-slate-400 dark:text-slate-500 text-[10px] font-semibold">
                                DealPOS
                              </div>
                              <div className="text-base font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                                {dealposQty !== null ? dealposQty : '-'}
                              </div>
                            </div>

                            <div>
                              <div className="text-slate-400 dark:text-slate-500 text-[10px] font-semibold">
                                Komparasi
                              </div>
                              <div
                                className={`text-base font-black font-mono ${
                                  selisihDp === null
                                    ? 'text-slate-400'
                                    : selisihDp > 0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : selisihDp < 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-400'
                                }`}
                              >
                                {selisihDp === null
                                  ? '-'
                                  : selisihDp > 0
                                  ? `+${selisihDp}`
                                  : selisihDp}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between bg-slate-50 dark:bg-[#09090B] border border-slate-100 dark:border-slate-800 p-2 rounded-lg">
                            <span className="text-[11px] text-slate-500 font-medium">
                              Sisa Stok Fisik:
                            </span>
                            <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                              {fisikStok} pcs
                            </span>
                          </div>
                        )}

                        {/* Footer: Area & Last Updated */}
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                          <span>
                            Area: <b className="text-slate-600 dark:text-slate-300">{st.area || getAreaFromLokasi(st.lokasi)}</b>
                          </span>
                          <span className="font-mono text-[9px]">
                            {st.updated_at ? `Update: ${new Date(st.updated_at).toLocaleTimeString()}` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Batch Action Bottom Bar for SO Queue */}
        {activeTab === 'so' && selectedSoIds.length > 0 && (
          <div
            id="soQueueBatchActionBar"
            className="absolute bottom-0 inset-x-0 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-3 shadow-2xl flex items-center justify-between gap-2 z-10"
          >
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono mr-1">
                {selectedSoIds.length}
              </span>
              Item Terpilih
            </div>

            {canApproveSo ? (
              <div className="flex items-center gap-1.5">
                <button
                  id="btnApproveBatchSo"
                  type="button"
                  disabled={isActionLoading}
                  onClick={handleApproveSelected}
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  {isActionLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Approve ({selectedSoIds.length})</span>
                </button>

                <button
                  id="btnRejectBatchSo"
                  type="button"
                  disabled={isActionLoading}
                  onClick={handleRejectSelected}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-xl transition-all active:scale-95 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>

                <button
                  id="btnDeleteBatchSo"
                  type="button"
                  disabled={isActionLoading}
                  onClick={handleDeleteSelected}
                  className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Hapus Terpilih"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 px-2.5 py-1 rounded-xl">
                <Lock className="w-3.5 h-3.5" />
                <span>Otorisasi Approve Hanya untuk Superadmin</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
