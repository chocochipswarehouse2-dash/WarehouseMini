import React, { useEffect, useState, useMemo } from 'react';
import { NumberInput } from '../common/NumberInput';
import {
  Printer,
  X,
  MapPin,
  History,
  Layers,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  RotateCcw,
  RefreshCw,
  Search,
  User,
  Calendar,
  FileText,
  Tag,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Pencil,
  Trash2,
  Save,
  Check,
  Copy,
  Table2,
  LayoutGrid,
  Smartphone,
  Monitor,
  Globe,
  ClipboardList,
  ArrowDownLeft,
  ShoppingCart,
} from 'lucide-react';
import {
  KOMPARASI_5,
  KOMPARASI_LABEL,
  OFFLINE_COLS,
  ONLINE_COLS,
  STORE_COLS,
  aggregateSku,
  isAreaOn,
  isPerbaikanArea,
  type AreaFilterType,
  type InventoryRow,
} from './inventoryModel';
import { AreaBadge, SelisihCell } from './InventoryList';
import { fetchLogsBySku, deleteLogProdukItem, updateLogProdukItem, getAreaFromLokasi, supabaseFetch } from '../../services/supabase';
import { applyDelta } from './useInventoryStock';
import { formatOperatorWithPersonName } from '../../utils/userResolver';
import type { LogProdukItem, StockRealtimeItem } from '../../types';

interface DrawerProps {
  row: InventoryRow | null;
  areas: AreaFilterType[];
  onClose: () => void;
  onLoc: (loc: string) => void;
  onReloadStock?: () => void;
  onAddToCart?: (item: {
    sku: string;
    nama_produk: string;
    size: string;
    available_stock: number;
    locations: Array<{ lokasi: string; qty: number; area?: string }>;
  }, qty?: number) => void;
}

type DrawerTab = 'stok' | 'histori';
type LogFilterType = 'ALL' | 'IN' | 'OUT' | 'SO' | 'ADJ';

const Tile: React.FC<{ label: string; value: number; tone: 'amber' | 'slate' | 'auto' }> = ({ label, value, tone }) => {
  const color =
    tone === 'amber'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'slate'
      ? 'text-slate-800 dark:text-slate-100'
      : value === 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : value > 0
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-rose-600 dark:text-rose-400';
  return (
    <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`mt-0.5 text-xl font-black font-mono ${color}`}>
        {tone === 'auto' && value > 0 ? '+' : ''}
        {value.toLocaleString('id-ID')}
      </div>
    </div>
  );
};

const ChannelGroup: React.FC<{ title: string; codes: readonly string[]; values: Record<string, number>; accent: string }> = ({
  title,
  codes,
  values,
  accent,
}) => {
  let sum = 0;
  for (const c of codes) sum += values[c] || 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200 uppercase">{title}</span>
        <span className={`text-[11px] font-black font-mono ${accent}`}>{sum.toLocaleString('id-ID')} pcs</span>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
        {codes.map((c) => {
          const v = values[c] || 0;
          return (
            <div
              key={c}
              className={`px-1.5 py-1 rounded-lg border text-center ${
                v === 0
                  ? 'border-slate-100 dark:border-slate-800 opacity-50'
                  : v < 0
                  ? 'border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E1420]'
              }`}
            >
              <div className="text-[9px] font-bold text-slate-400">{c}</div>
              <div
                className={`font-mono text-xs font-black ${
                  v < 0 ? 'text-rose-600 dark:text-rose-400' : v > 0 ? accent : 'text-slate-300 dark:text-slate-600'
                }`}
              >
                {v === 0 ? '·' : v}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function formatDateTime(isoString: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export const InventoryDetailDrawer: React.FC<DrawerProps> = ({
  row,
  areas,
  onClose,
  onLoc,
  onReloadStock,
  onAddToCart,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('stok');
  const [logs, setLogs] = useState<LogProdukItem[]>([]);
  const [liveStockRows, setLiveStockRows] = useState<StockRealtimeItem[] | null>(null);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [logFilter, setLogFilter] = useState<LogFilterType>('ALL');
  const [logSearch, setLogSearch] = useState<string>('');
  const [logViewMode, setLogViewMode] = useState<'TABLE' | 'CARD'>(() => {
    try {
      const saved = localStorage.getItem('wms_drawer_log_view_mode');
      if (saved === 'TABLE' || saved === 'CARD') return saved;
    } catch {}
    return 'TABLE';
  });
  const [copiedInv, setCopiedInv] = useState<string | null>(null);

  const handleSetLogViewMode = (mode: 'TABLE' | 'CARD') => {
    setLogViewMode(mode);
    try {
      localStorage.setItem('wms_drawer_log_view_mode', mode);
    } catch {}
  };

  const handleCopyInv = (inv?: string) => {
    if (!inv || inv === '-') return;
    try {
      navigator.clipboard.writeText(inv);
      setCopiedInv(inv);
      setTimeout(() => setCopiedInv(null), 1800);
    } catch {}
  };

  // Edit & Delete Log states
  const [editingLog, setEditingLog] = useState<LogProdukItem | null>(null);
  const [editForm, setEditForm] = useState<{
    type: string;
    qty: number;
    lokasi: string;
    keterangan: string;
  }>({
    type: 'IN',
    qty: 1,
    lokasi: '',
    keterangan: '',
  });
  const [deletingLog, setDeletingLog] = useState<LogProdukItem | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-dismiss feedback
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  const handleStartEdit = (log: LogProdukItem) => {
    setEditingLog(log);
    setEditForm({
      type: log.type || 'IN',
      qty: Math.abs(Number(log.qty) || 1),
      lokasi: log.lokasi || '',
      keterangan: log.keterangan || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingLog) return;
    const qty = Number(editForm.qty);
    if (!qty || qty <= 0) {
      setFeedback({ type: 'error', message: 'Kuantitas (Qty) harus lebih dari 0!' });
      return;
    }
    const lokasi = editForm.lokasi.trim().toUpperCase();
    if (!lokasi) {
      setFeedback({ type: 'error', message: 'Lokasi rak tidak boleh kosong!' });
      return;
    }

    setActionLoading(true);
    try {
      const res = await updateLogProdukItem(editingLog.id, {
        type: editForm.type as any,
        qty,
        lokasi,
        keterangan: editForm.keterangan.trim(),
      });
      if (!res.success) {
        throw new Error(res.error || 'Gagal mengubah log mutasi');
      }
      setFeedback({ type: 'success', message: 'Log mutasi berhasil diperbarui!' });
      setEditingLog(null);
      if (row?.sku) loadProductLogs(row.sku);
      if (onReloadStock) onReloadStock();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Terjadi kesalahan saat menyimpan perubahan' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingLog) return;
    setActionLoading(true);
    try {
      const res = await deleteLogProdukItem(deletingLog.id);
      if (!res.success) {
        throw new Error(res.error || 'Gagal menghapus log mutasi');
      }
      setFeedback({ type: 'success', message: 'Log mutasi berhasil dihapus!' });
      setDeletingLog(null);
      if (row?.sku) loadProductLogs(row.sku);
      if (onReloadStock) onReloadStock();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Terjadi kesalahan saat menghapus log' });
    } finally {
      setActionLoading(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onClose]);

  // Load product logs & live physical stock automatically whenever a row is selected
  const loadProductLogs = React.useCallback(async (sku: string) => {
    if (!sku) return;
    setLoadingLogs(true);
    try {
      const [data, liveSrf] = await Promise.all([
        fetchLogsBySku(sku, 150),
        supabaseFetch<StockRealtimeItem[]>('stok_real_fisik', 'GET', null, `sku=eq.${encodeURIComponent(sku)}`).catch(() => null),
      ]);
      setLogs(data);
      if (liveSrf && Array.isArray(liveSrf)) {
        setLiveStockRows(liveSrf);
        applyDelta([sku], liveSrf);
      }
    } catch (err) {
      console.warn('Gagal memuat log produk untuk SKU:', sku, err);
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (row?.sku) {
      setLiveStockRows(null);
      loadProductLogs(row.sku);
    } else {
      setLogs([]);
      setLiveStockRows(null);
    }
  }, [row?.sku, loadProductLogs]);

  const activeLocs = useMemo(() => {
    if (liveStockRows !== null) {
      return liveStockRows
        .map((r) => ({
          name: String(r.lokasi || '').trim().toUpperCase(),
          qty: Number(r.sisa_stok) || 0,
          area: r.area || getAreaFromLokasi(r.lokasi),
          neg: (Number(r.sisa_stok) || 0) < 0,
        }))
        .filter((r) => r.name && r.name !== '-' && r.qty !== 0)
        .sort((a, b) => (b.qty !== a.qty ? b.qty - a.qty : a.name.localeCompare(b.name)));
    }
    return row?.locs || [];
  }, [liveStockRows, row?.locs]);

  const currentTotalFisik = useMemo(() => {
    if (liveStockRows !== null) {
      return liveStockRows.reduce((sum, r) => sum + (Number(r.sisa_stok) || 0), 0);
    }
    return row?.totalFisik ?? 0;
  }, [liveStockRows, row?.totalFisik]);

  const currentSelisih = useMemo(() => {
    return currentTotalFisik - (row?.totalDp ?? 0);
  }, [currentTotalFisik, row?.totalDp]);

  const activeFisik = useMemo(() => {
    if (liveStockRows !== null) {
      const agg = aggregateSku(liveStockRows);
      if (agg) return agg.fisik;
    }
    return row?.fisik || { MAP: 0, LIVE: 0, STUDIO: 0, PERMAK: 0, DEFECT: 0 };
  }, [liveStockRows, row?.fisik]);

  // Summary counts for logs
  const logStats = useMemo(() => {
    let inQty = 0;
    let outQty = 0;
    let soCount = 0;
    let adjCount = 0;
    logs.forEach((l) => {
      const q = Math.abs(Number(l.qty) || 0);
      if (l.type === 'IN') inQty += q;
      else if (l.type === 'OUT') outQty += q;
      else if (l.type === 'ADJ_IN') {
        inQty += q;
        adjCount++;
      } else if (l.type === 'ADJ_OUT') {
        outQty += q;
        adjCount++;
      } else if (l.type === 'SO') {
        soCount++;
      }
    });
    return { inQty, outQty, soCount, adjCount };
  }, [logs]);

  // Pre-calculate running balance (saldo stok saat itu) per lokasi rak dari live stock
  const logStockMap = useMemo(() => {
    const stockAtMoment = new Map<string | number, number>();
    const locLiveMap = new Map<string, number>();
    activeLocs.forEach((l) => {
      locLiveMap.set((l.name || 'Warehouse').toUpperCase().trim(), Number(l.qty) || 0);
    });

    const logsByLoc = new Map<string, LogProdukItem[]>();
    for (let i = 0; i < logs.length; i++) {
      const item = logs[i];
      const locKey = (item.lokasi || 'Warehouse').toUpperCase().trim();
      let list = logsByLoc.get(locKey);
      if (!list) {
        list = [];
        logsByLoc.set(locKey, list);
      }
      list.push(item);
    }

    logsByLoc.forEach((list, locKey) => {
      const currentStock = locLiveMap.get(locKey);
      let running = currentStock !== undefined ? currentStock : 0;
      for (let i = 0; i < list.length; i++) {
        const log = list[i];
        const logKey = log.id || `${log.invoice}_${log.sku}_${log.created_at}`;
        stockAtMoment.set(logKey, running);

        const delta =
          log.type === 'IN' || log.type === 'ADJ_IN'
            ? Number(log.qty) || 0
            : log.type === 'OUT' || log.type === 'ADJ_OUT'
            ? -(Number(log.qty) || 0)
            : 0;
        running = running - delta;
      }
    });

    return stockAtMoment;
  }, [logs, activeLocs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (logFilter === 'IN') {
      result = result.filter((l) => l.type === 'IN' || l.type === 'ADJ_IN');
    } else if (logFilter === 'OUT') {
      result = result.filter((l) => l.type === 'OUT' || l.type === 'ADJ_OUT');
    } else if (logFilter === 'SO') {
      result = result.filter((l) => l.type === 'SO');
    } else if (logFilter === 'ADJ') {
      result = result.filter((l) => l.type === 'ADJ_IN' || l.type === 'ADJ_OUT');
    }

    if (logSearch.trim()) {
      const q = logSearch.toLowerCase().trim();
      result = result.filter(
        (l) =>
          (l.invoice && l.invoice.toLowerCase().includes(q)) ||
          (l.lokasi && l.lokasi.toLowerCase().includes(q)) ||
          (l.operator && l.operator.toLowerCase().includes(q)) ||
          (l.keterangan && l.keterangan.toLowerCase().includes(q))
      );
    }
    return result;
  }, [logs, logFilter, logSearch]);

  if (!row) return null;

  const showGudang = isAreaOn(areas, 'GUDANG');
  const showOffline = isAreaOn(areas, 'OFFLINE');
  const showStore = isAreaOn(areas, 'STORE');
  const showOnline = isAreaOn(areas, 'ONLINE');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail stok ${row.produk}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden bg-white dark:bg-[#161F30] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 bg-slate-50/70 dark:bg-[#0E1420] border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 leading-snug break-words">
              {row.produk}
            </h2>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                {row.sku}
              </span>
              <span className="px-2 py-0.5 rounded-md font-mono text-xs font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {row.size}
              </span>
              {currentSelisih !== 0 && (
                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Selisih {currentSelisih > 0 ? `+${currentSelisih}` : currentSelisih} pcs
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onAddToCart && (() => {
              const commercialLocs = (activeLocs || []).filter(l => !isPerbaikanArea(getAreaFromLokasi(l.name)));
              const commStock = commercialLocs.reduce((s, l) => s + (Number(l.qty) || 0), 0);
              return (
                <button
                  type="button"
                  disabled={commStock <= 0}
                  onClick={() => {
                    if (commStock <= 0) return;
                    onAddToCart({
                      sku: row.sku,
                      nama_produk: row.produk,
                      size: row.size,
                      available_stock: commStock,
                      locations: commercialLocs.map(l => ({ lokasi: l.name, qty: l.qty })),
                    }, 1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 ${
                    commStock > 0
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 opacity-40 cursor-not-allowed'
                  }`}
                  title={commStock > 0 ? `Tambah ke Keranjang Order Picking (${commStock} pcs)` : 'Stok fisik gudang kosong (0 pcs)'}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>+ Keranjang</span>
                </button>
              );
            })()}
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="p-2 rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="shrink-0 flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#121824] px-6 pt-2.5 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('stok')}
            className={`flex items-center gap-2 pb-2.5 px-3.5 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
              activeTab === 'stok'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Status Stok &amp; Channel</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('histori')}
            className={`flex items-center gap-2 pb-2.5 px-3.5 text-xs font-extrabold border-b-2 transition-all cursor-pointer ${
              activeTab === 'histori'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Log Produk</span>
            {logs.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                {logs.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeTab === 'stok' ? (
            <>
              {/* Top Row: Totals + Shortcut Card to History Log */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                <div className="lg:col-span-7 grid grid-cols-3 gap-3">
                  <Tile label="Fisik Gudang" value={currentTotalFisik} tone="amber" />
                  <Tile label="DealPOS" value={row.totalDp} tone="slate" />
                  <Tile label="Selisih" value={currentSelisih} tone="auto" />
                </div>

                {/* Shortcut Card to History Log */}
                <button
                  type="button"
                  onClick={() => setActiveTab('histori')}
                  className="lg:col-span-5 w-full flex items-center justify-between p-4 rounded-2xl bg-amber-50/60 dark:bg-[#121927] border border-amber-200/80 dark:border-amber-900/50 hover:border-amber-400 dark:hover:border-amber-600 text-slate-700 dark:text-slate-300 transition-all cursor-pointer group shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <History className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-black text-slate-900 dark:text-white">
                        Log Produk (Rekam IN / OUT / SO)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {loadingLogs
                          ? 'Memuat riwayat...'
                          : logs.length > 0
                          ? `${logs.length} log produk tercatat di gudang`
                          : 'Klik untuk memeriksa log pergerakan fisik barang'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-extrabold shrink-0">
                    <span>Lihat Log</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              </div>

              {/* Two-Column Main Content: Left (Area Comparison & Rack Locations) + Right (DealPOS Channels) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Fisik vs DealPOS per Area + Lokasi Rak */}
                <div className="lg:col-span-6 space-y-5">
                  {/* 5 Komparasi */}
                  {showGudang && (
                    <section>
                      <h3 className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                        Fisik vs DealPOS per Area
                      </h3>
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                        <div className="grid grid-cols-[1fr_64px_64px_72px] gap-x-2 px-4 py-2 bg-slate-100 dark:bg-[#121824] text-[10px] font-extrabold uppercase text-slate-500">
                          <span>Area</span>
                          <span className="text-center">Fisik</span>
                          <span className="text-center">DP</span>
                          <span className="text-center">Selisih</span>
                        </div>
                        {KOMPARASI_5.map((k) => {
                          const f = activeFisik[k] || 0;
                          const d = row.dp[k] || 0;
                          return (
                            <div
                              key={k}
                              className="grid grid-cols-[1fr_64px_64px_72px] gap-x-2 items-center px-4 py-2.5 border-t border-slate-100 dark:border-slate-800/60"
                            >
                              <span className="font-bold text-slate-700 dark:text-slate-200">
                                {KOMPARASI_LABEL[k]}
                              </span>
                              <span className="text-center font-mono font-black text-amber-600 dark:text-amber-400">
                                {f || '·'}
                              </span>
                              <span className="text-center font-mono font-semibold text-slate-700 dark:text-slate-300">
                                {d || '·'}
                              </span>
                              <span className="flex justify-center">
                                <SelisihCell v={f - d} hasData={f !== 0 || d !== 0} />
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Lokasi rak */}
                  <section>
                    <h3 className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">
                      Lokasi Rak ({activeLocs.length})
                    </h3>
                    {activeLocs.length === 0 ? (
                      <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400 italic">
                        Tidak ada stok fisik di rak manapun.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {activeLocs.map((l) => (
                          <div
                            key={l.name}
                            className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200/80 dark:border-slate-800"
                          >
                            <div className="flex items-center gap-2 font-mono text-xs min-w-0">
                              <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                {l.name}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  l.neg
                                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                    : 'bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {l.qty} pcs
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => onLoc(l.name)}
                              className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-300 inline-flex items-center gap-1 cursor-pointer hover:border-amber-300"
                              title={`Ekspor / cetak lokasi ${l.name}`}
                            >
                              <Printer className="w-3 h-3" />
                              Cetak
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                {/* Right Column: Channel DealPOS */}
                {(showOffline || showStore || showOnline) && (
                  <section className="lg:col-span-6 p-4 rounded-2xl bg-slate-50/50 dark:bg-[#121824]/70 border border-slate-200/80 dark:border-slate-800 space-y-4">
                    <h3 className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Stok DealPOS per Channel
                    </h3>
                    {showOffline && (
                      <ChannelGroup
                        title="Offline"
                        codes={OFFLINE_COLS}
                        values={row.channels}
                        accent="text-slate-800 dark:text-slate-100"
                      />
                    )}
                    {showStore && (
                      <ChannelGroup
                        title="Store (15 Cabang)"
                        codes={STORE_COLS}
                        values={row.channels}
                        accent="text-blue-600 dark:text-blue-400"
                      />
                    )}
                    {showOnline && (
                      <ChannelGroup
                        title="Online"
                        codes={ONLINE_COLS}
                        values={row.channels}
                        accent="text-emerald-600 dark:text-emerald-400"
                      />
                    )}
                  </section>
                )}
              </div>
            </>
          ) : (
            /* ========================================================
               TAB 2: HISTORI MUTASI (LOG PRODUK)
               ======================================================== */
            <div className="space-y-4">
              {/* Feedback Toast */}
              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 shadow-xs transition-all ${
                    feedback.type === 'success'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {feedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                    <span>{feedback.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFeedback(null)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Total Log Produk</div>
                  <div className="mt-0.5 text-lg font-black font-mono text-slate-800 dark:text-slate-200">
                    {logs.length}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
                  <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                    Total Masuk
                  </div>
                  <div className="mt-0.5 text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
                    +{logStats.inQty} pcs
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
                  <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">
                    Total Keluar
                  </div>
                  <div className="mt-0.5 text-lg font-black font-mono text-rose-600 dark:text-rose-400">
                    -{logStats.outQty} pcs
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40">
                  <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                    Stock Opname
                  </div>
                  <div className="mt-0.5 text-lg font-black font-mono text-blue-600 dark:text-blue-400">
                    {logStats.soCount} scan
                  </div>
                </div>
              </div>

              {/* Filters, Search & View Mode Switcher (Tabel vs Kartu) */}
              <div className="flex flex-col gap-2">
                {/* Search + View Switcher + Refresh */}
                <div className="flex items-center gap-2 w-full">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      placeholder="Cari invoice, rak, operator..."
                      className="w-full min-h-[38px] pl-8 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    {logSearch && (
                      <button
                        type="button"
                        onClick={() => setLogSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm cursor-pointer"
                        aria-label="Hapus pencarian"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* View Mode Switcher: Kartu vs Tabel */}
                  <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800/90 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/80 shrink-0 min-h-[38px]">
                    <button
                      type="button"
                      onClick={() => handleSetLogViewMode('TABLE')}
                      className={`h-8 px-2.5 text-[11px] font-bold rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                        logViewMode === 'TABLE'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                      title="Tampilan Tabel"
                    >
                      <Table2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Tabel</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetLogViewMode('CARD')}
                      className={`h-8 px-2.5 text-[11px] font-bold rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                        logViewMode === 'CARD'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                      title="Tampilan Kartu"
                    >
                      <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                      <span>Kartu</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => row.sku && loadProductLogs(row.sku)}
                    disabled={loadingLogs}
                    className="w-[38px] h-[38px] inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                    title="Segarkan data log produk"
                    aria-label="Segarkan data log produk"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin text-indigo-500' : ''}`} />
                  </button>
                </div>

                {/* Horizontal-swipe quick type filter strip */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {(
                    [
                      { key: 'ALL', label: `Semua (${logs.length})` },
                      { key: 'IN', label: 'Masuk (IN)' },
                      { key: 'OUT', label: 'Keluar (OUT)' },
                      { key: 'SO', label: `Opname (${logStats.soCount})` },
                      { key: 'ADJ', label: `Adjust (${logStats.adjCount})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setLogFilter(f.key)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
                        logFilter === f.key
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logs Content (Table or Card) */}
              {loadingLogs ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500" />
                  <div className="text-xs font-bold">Memuat log produk dari Supabase...</div>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="py-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 space-y-2">
                  <History className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Tidak Ditemukan Log Produk
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    {logs.length === 0
                      ? `Belum ada log pergerakan (IN, OUT, SO) yang tercatat untuk SKU ${row.sku}.`
                      : 'Tidak ada log yang cocok dengan filter yang Anda pilih.'}
                  </p>
                </div>
              ) : logViewMode === 'TABLE' ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
                  {/* MOBILE INVENTORY-STYLE TABLE (< md): 4 Proportional Columns, Zero Horizontal Scroll */}
                  <div className="block md:hidden w-full">
                    <table className="w-full table-fixed border-collapse text-left">
                      <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-[#121824]/95 text-slate-600 dark:text-slate-300 text-[10px] font-extrabold uppercase border-b border-slate-300 dark:border-slate-700">
                        <tr>
                          <th className="py-2 pl-2.5 pr-1.5 w-[44%] border-r border-slate-200/90 dark:border-slate-700/80">
                            Tipe &amp; Invoice
                          </th>
                          <th className="py-2 px-1 w-[14%] text-center border-r border-slate-200/90 dark:border-slate-700/80">
                            Qty
                          </th>
                          <th className="py-2 px-1 w-[14%] text-center bg-slate-200/40 dark:bg-slate-800/60 border-r border-slate-200/90 dark:border-slate-700/80">
                            Stok
                          </th>
                          <th className="py-2 pl-1.5 pr-2 w-[28%]">
                            Lokasi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/90 dark:divide-slate-800">
                        {filteredLogs.map((log, idx) => {
                          const isPlus = log.type === 'IN' || log.type === 'ADJ_IN';
                          const isMinus = log.type === 'OUT' || log.type === 'ADJ_OUT';
                          const isSo = log.type === 'SO';
                          const resolvedArea = getAreaFromLokasi(log.lokasi || '', log.area);
                          const isLocAnomaly = resolvedArea === 'Anomali';
                          const logKey = log.id || `${log.invoice}_${log.sku}_${log.created_at}`;
                          const stokSaatItu = logStockMap.get(logKey) ?? 0;
                          const qtyCellBg = isPlus
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                            : isMinus
                            ? 'bg-rose-50/40 dark:bg-rose-950/20'
                            : 'bg-indigo-50/35 dark:bg-indigo-950/20';

                          return (
                            <tr
                              key={log.id || `${log.invoice}_${idx}`}
                              className="bg-white dark:bg-[#0E1420]"
                            >
                              {/* Col 1: Type, Invoice, Time, Operator */}
                              <td className="py-2 pl-2.5 pr-1.5 align-top border-r border-slate-200/80 dark:border-slate-800">
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border font-mono leading-none ${
                                        log.type === 'IN'
                                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                                          : log.type === 'OUT'
                                          ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                                          : log.type === 'ADJ_IN'
                                          ? 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20'
                                          : log.type === 'ADJ_OUT'
                                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
                                          : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'
                                      }`}
                                    >
                                      {log.type}
                                    </span>
                                    <span className="text-[9.5px] font-mono text-slate-400 tabular-nums">
                                      {formatDateTime(log.created_at)}
                                    </span>
                                  </div>

                                  {log.invoice && log.invoice !== '-' && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyInv(log.invoice)}
                                      className="inline-flex items-center gap-1 max-w-full font-mono text-[10.5px] font-bold text-slate-800 dark:text-slate-100 hover:text-indigo-600 cursor-pointer"
                                      title="Salin invoice"
                                    >
                                      <span className="truncate">{log.invoice}</span>
                                      {copiedInv === log.invoice ? (
                                        <Check className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                      ) : (
                                        <Copy className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                      )}
                                    </button>
                                  )}

                                  {log.operator && (
                                    <div className="flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-slate-300 min-w-0">
                                      <User className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                      <span className="truncate">{formatOperatorWithPersonName(log.operator)}</span>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Col 2: Qty */}
                              <td
                                className={`py-2 px-1 align-middle text-center font-mono tabular-nums border-r border-slate-200/80 dark:border-slate-800 ${qtyCellBg}`}
                              >
                                <span
                                  className={`text-[12.5px] font-black ${
                                    isPlus
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : isMinus
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : isSo
                                      ? 'text-blue-600 dark:text-blue-400'
                                      : 'text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  {isPlus ? '+' : isMinus ? '-' : ''}
                                  {Math.abs(Number(log.qty) || 0)}
                                </span>
                              </td>

                              {/* Col 3: Stok */}
                              <td className="py-2 px-1 align-middle text-center font-mono tabular-nums bg-slate-50/60 dark:bg-slate-800/30 border-r border-slate-200/80 dark:border-slate-800">
                                <span
                                  className={`text-[12.5px] font-black ${
                                    stokSaatItu > 0
                                      ? 'text-slate-900 dark:text-slate-100'
                                      : stokSaatItu === 0
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {stokSaatItu}
                                </span>
                              </td>

                              {/* Col 4: Area + Rak + Actions */}
                              <td className="py-2 pl-1.5 pr-2 align-middle">
                                <div className="space-y-1 min-w-0">
                                  <div>
                                    {isLocAnomaly ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase leading-none bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800">
                                        Anomali
                                      </span>
                                    ) : (
                                      <AreaBadge area={resolvedArea} compact />
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border leading-none truncate ${
                                        isLocAnomaly
                                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200/90 dark:border-slate-700'
                                      }`}
                                    >
                                      {log.lokasi || '-'}
                                    </span>
                                    <div className="inline-flex items-center gap-0.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleStartEdit(log);
                                        }}
                                        className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
                                        title="Edit log"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeletingLog(log);
                                        }}
                                        className="w-6 h-6 inline-flex items-center justify-center rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                        title="Hapus log"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* DESKTOP INVENTORY-STYLE TABLE (hidden md:block) */}
                  <div className="hidden md:block overflow-x-auto scrollbar-thin">
                    <table className="w-full text-left text-xs border-collapse lg:table-fixed">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-[#121824] border-b-2 border-slate-300 dark:border-slate-600 text-[10px] font-extrabold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                          <th className="py-2.5 px-3 w-[16%] border-r border-slate-300/80 dark:border-slate-700">Tipe &amp; Waktu</th>
                          <th className="py-2.5 px-3 w-[20%] border-r border-slate-300/80 dark:border-slate-700">Invoice &amp; Sumber</th>
                          <th className="py-2.5 px-3 w-[15%] border-r border-slate-300/80 dark:border-slate-700">Area &amp; Lokasi</th>
                          <th className="py-2.5 px-2 w-[8%] text-center border-r border-slate-300/80 dark:border-slate-700">Qty</th>
                          <th className="py-2.5 px-2 w-[9%] text-center bg-slate-200/45 dark:bg-slate-800/50 border-r border-slate-300/80 dark:border-slate-700">Stok</th>
                          <th className="py-2.5 px-3 w-[23%] border-r border-slate-300/80 dark:border-slate-700">Operator &amp; Catatan</th>
                          <th className="py-2.5 px-3 w-[9%] text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {filteredLogs.map((log, idx) => {
                          const isPlus = log.type === 'IN' || log.type === 'ADJ_IN';
                          const isMinus = log.type === 'OUT' || log.type === 'ADJ_OUT';
                          const isSo = log.type === 'SO';
                          const resolvedArea = getAreaFromLokasi(log.lokasi || '', log.area);
                          const isLocAnomaly = resolvedArea === 'Anomali';
                          const invUpper = (log.invoice || '').toUpperCase();
                          const opLower = (log.operator || '').toLowerCase();
                          const isWa =
                            invUpper.startsWith('WA') ||
                            opLower.includes('@g.us') ||
                            opLower.includes('628');
                          const isWeb =
                            invUpper.startsWith('WEB') ||
                            opLower.includes('web') ||
                            opLower.includes('staging');
                          const logKey = log.id || `${log.invoice}_${log.sku}_${log.created_at}`;
                          const stokSaatItu = logStockMap.get(logKey) ?? 0;
                          const qtyCellBg = isPlus
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                            : isMinus
                            ? 'bg-rose-50/40 dark:bg-rose-950/20'
                            : 'bg-indigo-50/35 dark:bg-indigo-950/20';

                          return (
                            <tr
                              key={log.id || `${log.invoice}_${idx}`}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              {/* 1. Tipe & Waktu */}
                              <td className="py-2.5 px-3 whitespace-nowrap border-r border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 border font-mono ${
                                      log.type === 'IN'
                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                                        : log.type === 'OUT'
                                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                                        : log.type === 'ADJ_IN'
                                        ? 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20'
                                        : log.type === 'ADJ_OUT'
                                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
                                        : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'
                                    }`}
                                  >
                                    {isSo ? (
                                      <ClipboardList className="w-3 h-3" />
                                    ) : isPlus ? (
                                      <ArrowDownLeft className="w-3 h-3" />
                                    ) : (
                                      <ArrowUpRight className="w-3 h-3" />
                                    )}
                                    {log.type}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                                  {formatDateTime(log.created_at)}
                                </div>
                              </td>

                              {/* 2. Invoice & Sumber */}
                              <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800">
                                <div className="flex flex-col gap-1 items-start">
                                  <div className="flex items-center gap-1.5 max-w-full">
                                    <span className="font-mono font-bold text-slate-800 dark:text-slate-100 text-[11px] truncate select-all">
                                      {log.invoice || '-'}
                                    </span>
                                    {log.invoice && log.invoice !== '-' && (
                                      <button
                                        type="button"
                                        onClick={() => handleCopyInv(log.invoice)}
                                        title="Salin invoice"
                                        className="p-0.5 text-slate-400 hover:text-indigo-500 transition-colors rounded cursor-pointer shrink-0"
                                      >
                                        {copiedInv === log.invoice ? (
                                          <Check className="w-3 h-3 text-emerald-500" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                  <div>
                                    {isWa ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                        <Smartphone className="w-2.5 h-2.5" /> WhatsApp
                                      </span>
                                    ) : isWeb ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 dark:text-sky-400">
                                        <Monitor className="w-2.5 h-2.5" /> Web App
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                        <Globe className="w-2.5 h-2.5" /> System
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* 3. Area & Lokasi */}
                              <td className="py-2.5 px-3 whitespace-nowrap border-r border-slate-200 dark:border-slate-800">
                                <div>
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
                                      isLocAnomaly
                                        ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                                    }`}
                                  >
                                    {log.lokasi || '-'}
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

                              {/* 4. Qty */}
                              <td
                                className={`py-2.5 px-2 text-center whitespace-nowrap font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 ${qtyCellBg}`}
                              >
                                <span
                                  className={`font-black text-[13px] ${
                                    isPlus
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : isMinus
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-blue-600 dark:text-blue-400'
                                  }`}
                                >
                                  {isPlus ? '+' : isMinus ? '-' : ''}
                                  {Math.abs(Number(log.qty) || 0)}
                                </span>
                              </td>

                              {/* 5. Stok (Saldo Saat Mutasi) */}
                              <td
                                className="py-2.5 px-2 text-center whitespace-nowrap font-mono tabular-nums bg-slate-50/70 dark:bg-slate-800/35 border-r border-slate-200 dark:border-slate-800"
                                title={`Sisa stok di ${log.lokasi || 'rak'} pada detik transaksi ini: ${stokSaatItu} pcs`}
                              >
                                <span
                                  className={`font-black text-[13px] ${
                                    stokSaatItu > 0
                                      ? 'text-slate-900 dark:text-slate-100'
                                      : stokSaatItu === 0
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {stokSaatItu}
                                </span>
                              </td>

                              {/* 6. Operator & Catatan */}
                              <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800">
                                {log.operator && (
                                  <div className="flex items-center gap-1 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                    <User className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="truncate">{formatOperatorWithPersonName(log.operator)}</span>
                                  </div>
                                )}
                                {log.keterangan && (
                                  <div
                                    className="text-[11px] italic text-slate-500 dark:text-slate-400 truncate mt-0.5"
                                    title={log.keterangan}
                                  >
                                    &ldquo;{log.keterangan}&rdquo;
                                  </div>
                                )}
                              </td>

                              {/* 7. Aksi */}
                              <td className="py-2.5 px-2 text-center whitespace-nowrap">
                                <div className="inline-flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartEdit(log);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
                                    title="Edit log produk ini"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingLog(log);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                    title="Hapus log produk ini"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredLogs.map((log, idx) => {
                    const isPlus = log.type === 'IN' || log.type === 'ADJ_IN';
                    const isMinus = log.type === 'OUT' || log.type === 'ADJ_OUT';
                    const isSo = log.type === 'SO';
                    const resolvedArea = getAreaFromLokasi(log.lokasi || '', log.area);
                    const isLocAnomaly = resolvedArea === 'Anomali';
                    const invUpper = (log.invoice || '').toUpperCase();
                    const opLower = (log.operator || '').toLowerCase();
                    const isWa =
                      invUpper.startsWith('WA') ||
                      opLower.includes('@g.us') ||
                      opLower.includes('628');
                    const isWeb =
                      invUpper.startsWith('WEB') ||
                      opLower.includes('web') ||
                      opLower.includes('staging');

                    const typeBadgeClass = isPlus
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                      : isMinus
                      ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                      : isSo
                      ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';

                    const qtyCellBg = isPlus
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                      : isMinus
                      ? 'bg-rose-50/40 dark:bg-rose-950/20'
                      : 'bg-indigo-50/35 dark:bg-indigo-950/20';

                    const qtyPrefix = isPlus ? '+' : isMinus ? '-' : '';
                    const logKey = log.id || `${log.invoice}_${log.sku}_${log.created_at}`;
                    const stokSaatItu = logStockMap.get(logKey) ?? 0;

                    return (
                      <div
                        key={log.id || `${log.invoice}_${idx}`}
                        className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col justify-between divide-y divide-slate-100 dark:divide-slate-800/80"
                      >
                        {/* Body */}
                        <div className="p-3.5 space-y-2.5">
                          {/* Top Row: Type + Source | Timestamp */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border font-mono ${typeBadgeClass}`}
                              >
                                {log.type}
                              </span>
                              <span className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                                {isWa ? 'WhatsApp' : isWeb ? 'Web App' : 'System'}
                              </span>
                            </div>

                            <div className="text-[10.5px] font-mono text-slate-400 dark:text-slate-500 flex items-center gap-1 tabular-nums shrink-0">
                              <Calendar className="w-3 h-3 shrink-0" />
                              <span>{formatDateTime(log.created_at)}</span>
                            </div>
                          </div>

                          {/* Structured 3-Column Metrics Bar: QTY | STOK | LOKASI */}
                          <div className="grid grid-cols-3 divide-x divide-slate-200/80 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
                            <div className={`px-2 py-2 text-center ${qtyCellBg}`}>
                              <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Qty
                              </div>
                              <div
                                className={`font-mono text-[15px] font-black tabular-nums leading-tight mt-0.5 ${
                                  isPlus
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : isMinus
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-blue-600 dark:text-blue-400'
                                }`}
                              >
                                {qtyPrefix}
                                {Math.abs(Number(log.qty) || 0)}
                              </div>
                            </div>

                            <div className="px-2 py-2 text-center">
                              <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Stok
                              </div>
                              <div
                                className={`font-mono text-[15px] font-black tabular-nums leading-tight mt-0.5 ${
                                  stokSaatItu > 0
                                    ? 'text-slate-900 dark:text-white'
                                    : stokSaatItu === 0
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                                title={`Sisa stok di ${log.lokasi || 'rak'} saat itu`}
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
                                className={`font-mono text-[13px] font-extrabold leading-tight mt-0.5 truncate ${
                                  isLocAnomaly
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-indigo-600 dark:text-indigo-400'
                                }`}
                                title={log.lokasi || '-'}
                              >
                                {log.lokasi || '-'}
                              </div>
                            </div>
                          </div>

                          {/* Metadata Rows */}
                          <div className="space-y-1 text-[11px]">
                            <div className="flex items-center justify-between gap-2">
                              {log.operator ? (
                                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 min-w-0">
                                  <User className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="font-medium truncate">
                                    {formatOperatorWithPersonName(log.operator)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}

                              {log.invoice && log.invoice !== '-' ? (
                                <button
                                  type="button"
                                  onClick={() => handleCopyInv(log.invoice)}
                                  className="inline-flex items-center gap-1 font-mono font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 truncate max-w-[55%] cursor-pointer shrink-0"
                                  title="Ketuk untuk menyalin invoice"
                                >
                                  <span className="truncate">{log.invoice}</span>
                                  {copiedInv === log.invoice ? (
                                    <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                                  )}
                                </button>
                              ) : (
                                <span className="font-mono text-slate-400">-</span>
                              )}
                            </div>

                            {log.keterangan && (
                              <div
                                className="italic text-slate-500 dark:text-slate-400 line-clamp-2"
                                title={log.keterangan}
                              >
                                &ldquo;{log.keterangan}&rdquo;
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Clean 2-Button Touch Footer */}
                        <div className="px-3 py-2 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(log);
                            }}
                            className="flex-1 sm:flex-none min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5 text-slate-500" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingLog(log);
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-white dark:bg-slate-800 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end bg-slate-50/70 dark:bg-[#0E1420]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-extrabold text-slate-700 dark:text-slate-200 bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-xl cursor-pointer transition-colors"
          >
            Tutup Detail Produk
          </button>
        </div>
      </div>

      {/* ========================================================
          DELETE CONFIRMATION MODAL
          ======================================================== */}
      {deletingLog && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                  Hapus Baris Log Mutasi?
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tindakan ini permanen dan langsung mengubah stok fisik di Supabase.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Tipe / Qty:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {deletingLog.type} ({deletingLog.qty} pcs)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Lokasi Rak:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {deletingLog.lokasi || '-'}
                </span>
              </div>
              <div className="flex justify-between truncate">
                <span className="text-slate-400 font-sans">Invoice:</span>
                <span className="text-slate-600 dark:text-slate-300 truncate max-w-[170px]">
                  {deletingLog.invoice || '-'}
                </span>
              </div>
              {deletingLog.keterangan && (
                <div className="pt-1 border-t border-slate-200 dark:border-slate-800 font-sans italic text-[11px] text-slate-500">
                  &ldquo;{deletingLog.keterangan}&rdquo;
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setDeletingLog(null)}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-black rounded-xl bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{actionLoading ? 'Menghapus...' : 'Ya, Hapus'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          EDIT LOG MODAL
          ======================================================== */}
      {editingLog && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                    Edit Log Mutasi
                  </h4>
                  <span className="font-mono text-[11px] font-bold text-slate-400">
                    {editingLog.sku}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingLog(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Tipe Mutasi */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Tipe Mutasi
                </label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="IN">IN (Barang Masuk)</option>
                  <option value="OUT">OUT (Barang Keluar)</option>
                  <option value="ADJ_IN">ADJ_IN (Penyesuaian Masuk)</option>
                  <option value="ADJ_OUT">ADJ_OUT (Penyesuaian Keluar)</option>
                  <option value="SO">SO (Stock Opname Scan)</option>
                </select>
              </div>

              {/* Kuantitas */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Kuantitas (Qty Pcs)
                </label>
                <NumberInput
                  min={1}
                  value={editForm.qty}
                  selectOnFocus
                  onValueChange={(val) => setEditForm((prev) => ({ ...prev, qty: Math.max(1, val) }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Lokasi Rak */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Lokasi Rak
                </label>
                <input
                  type="text"
                  value={editForm.lokasi}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, lokasi: e.target.value.toUpperCase() }))}
                  placeholder="Contoh: A002, B037, DF004..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 font-mono font-bold text-slate-800 dark:text-slate-200 uppercase focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Keterangan / Catatan
                </label>
                <input
                  type="text"
                  value={editForm.keterangan}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, keterangan: e.target.value }))}
                  placeholder="Catatan alasan perubahan..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10.5px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Perubahan lokasi rak atau qty akan langsung mengoreksi stok fisik di Supabase.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setEditingLog(null)}
                className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleSaveEdit}
                className="px-4 py-2 text-xs font-black rounded-xl bg-amber-500 hover:bg-amber-600 text-black flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{actionLoading ? 'Menyimpan...' : 'Simpan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
