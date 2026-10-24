import React, { useEffect, useState, useMemo } from 'react';
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
} from 'lucide-react';
import {
  KOMPARASI_5,
  KOMPARASI_LABEL,
  OFFLINE_COLS,
  ONLINE_COLS,
  STORE_COLS,
  isAreaOn,
  type AreaFilterType,
  type InventoryRow,
} from './inventoryModel';
import { SelisihCell } from './InventoryList';
import { fetchLogsBySku, deleteLogProdukItem, updateLogProdukItem } from '../../services/supabase';
import type { LogProdukItem } from '../../types';

interface DrawerProps {
  row: InventoryRow | null;
  areas: AreaFilterType[];
  onClose: () => void;
  onLoc: (loc: string) => void;
  onReloadStock?: () => void;
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

export const InventoryDetailDrawer: React.FC<DrawerProps> = ({ row, areas, onClose, onLoc, onReloadStock }) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('stok');
  const [logs, setLogs] = useState<LogProdukItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [logFilter, setLogFilter] = useState<LogFilterType>('ALL');
  const [logSearch, setLogSearch] = useState<string>('');

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

  // Load product logs automatically whenever a row is selected
  const loadProductLogs = React.useCallback(async (sku: string) => {
    if (!sku) return;
    setLoadingLogs(true);
    try {
      const data = await fetchLogsBySku(sku, 150);
      setLogs(data);
    } catch (err) {
      console.warn('Gagal memuat log produk untuk SKU:', sku, err);
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (row?.sku) {
      loadProductLogs(row.sku);
    } else {
      setLogs([]);
    }
  }, [row?.sku, loadProductLogs]);

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
      className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end bg-black/55 backdrop-blur-xs animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail stok ${row.produk}`}
    >
      <div className="w-full sm:w-[520px] max-h-[92vh] sm:max-h-none sm:h-full overflow-hidden bg-white dark:bg-[#161F30] rounded-t-3xl sm:rounded-none sm:rounded-l-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="shrink-0 p-4 bg-white/95 dark:bg-[#161F30]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 leading-snug break-words">
              {row.produk}
            </h2>
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {row.sku}
              </span>
              <span className="px-1.5 rounded font-mono text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {row.size}
              </span>
              {row.selisih !== 0 && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Selisih {row.selisih > 0 ? `+${row.selisih}` : row.selisih} pcs
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="w-8 h-8 shrink-0 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="shrink-0 flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-[#121824] px-4 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('stok')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'stok'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Status Stok & Channel</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('histori')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'histori'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Histori Mutasi</span>
            {logs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-extrabold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                {logs.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {activeTab === 'stok' ? (
            <>
              {/* Totals */}
              <div className="grid grid-cols-3 gap-2">
                <Tile label="Fisik Gudang" value={row.totalFisik} tone="amber" />
                <Tile label="DealPOS" value={row.totalDp} tone="slate" />
                <Tile label="Selisih" value={row.selisih} tone="auto" />
              </div>

              {/* Shortcut Card to History Log */}
              <button
                type="button"
                onClick={() => setActiveTab('histori')}
                className="w-full flex items-center justify-between p-3 rounded-2xl bg-amber-50/60 dark:bg-[#121927] border border-amber-200/80 dark:border-amber-900/50 hover:border-amber-400 dark:hover:border-amber-600 text-slate-700 dark:text-slate-300 transition-all cursor-pointer group shadow-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <History className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-black text-slate-900 dark:text-white">
                      Histori Rekam Mutasi & Opname
                    </div>
                    <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                      {loadingLogs
                        ? 'Memuat riwayat...'
                        : logs.length > 0
                        ? `${logs.length} mutasi fisik tercatat di log gudang`
                        : 'Klik untuk memeriksa riwayat pergerakan fisik barang'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-extrabold shrink-0">
                  <span>Lihat Log</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>

              {/* 5 Komparasi */}
              {showGudang && (
                <section>
                  <h3 className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                    Fisik vs DealPOS per Area
                  </h3>
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                    <div className="grid grid-cols-[1fr_56px_56px_64px] gap-x-2 px-3 py-1.5 bg-slate-100 dark:bg-[#121824] text-[10px] font-extrabold uppercase text-slate-500">
                      <span>Area</span>
                      <span className="text-center">Fisik</span>
                      <span className="text-center">DP</span>
                      <span className="text-center">Selisih</span>
                    </div>
                    {KOMPARASI_5.map((k) => {
                      const f = row.fisik[k] || 0;
                      const d = row.dp[k] || 0;
                      return (
                        <div
                          key={k}
                          className="grid grid-cols-[1fr_56px_56px_64px] gap-x-2 items-center px-3 py-2 border-t border-slate-100 dark:border-slate-800/60"
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
                <h3 className="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  Lokasi Rak ({row.locs.length})
                </h3>
                {row.locs.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Tidak ada stok fisik di rak manapun.</p>
                ) : (
                  <div className="space-y-1.5">
                    {row.locs.map((l) => (
                      <div
                        key={l.name}
                        className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-100 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-2 font-mono text-xs min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{l.name}</span>
                          <span
                            className={`px-1.5 rounded text-[10px] ${
                              l.neg
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-bold'
                                : 'bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {l.qty} pcs
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onLoc(l.name)}
                          className="shrink-0 text-[10px] px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 hover:text-amber-600 dark:text-slate-300 dark:hover:text-amber-300 inline-flex items-center gap-1 cursor-pointer hover:border-amber-300"
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

              {/* Channel DealPOS */}
              {(showOffline || showStore || showOnline) && (
                <section className="space-y-4">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Total Mutasi</div>
                  <div className="mt-0.5 text-base font-black font-mono text-slate-800 dark:text-slate-200">
                    {logs.length}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
                  <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                    Total Masuk
                  </div>
                  <div className="mt-0.5 text-base font-black font-mono text-emerald-600 dark:text-emerald-400">
                    +{logStats.inQty} pcs
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
                  <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">
                    Total Keluar
                  </div>
                  <div className="mt-0.5 text-base font-black font-mono text-rose-600 dark:text-rose-400">
                    -{logStats.outQty} pcs
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40">
                  <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                    Stock Opname
                  </div>
                  <div className="mt-0.5 text-base font-black font-mono text-blue-600 dark:text-blue-400">
                    {logStats.soCount} scan
                  </div>
                </div>
              </div>

              {/* Filters & Search */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { key: 'ALL', label: `Semua (${logs.length})` },
                      { key: 'IN', label: 'Masuk / IN' },
                      { key: 'OUT', label: 'Keluar / OUT' },
                      { key: 'SO', label: `SO (${logStats.soCount})` },
                      { key: 'ADJ', label: `Adjust (${logStats.adjCount})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setLogFilter(f.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        logFilter === f.key
                          ? 'bg-amber-500 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => row.sku && loadProductLogs(row.sku)}
                    disabled={loadingLogs}
                    className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Segarkan data log"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin text-amber-500' : ''}`} />
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Cari invoice, lokasi rak, atau operator..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0E1420] text-xs font-medium text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
                  />
                  {logSearch && (
                    <button
                      type="button"
                      onClick={() => setLogSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Logs List */}
              {loadingLogs ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500" />
                  <div className="text-xs font-bold">Memuat histori mutasi dari Supabase...</div>
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="py-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 space-y-2">
                  <History className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Tidak Ditemukan Histori Mutasi
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    {logs.length === 0
                      ? `Belum ada log pergerakan (IN, OUT, SO) yang tercatat untuk SKU ${row.sku}.`
                      : 'Tidak ada log yang cocok dengan filter yang Anda pilih.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLogs.map((log, idx) => {
                    const isPlus = log.type === 'IN' || log.type === 'ADJ_IN';
                    const isMinus = log.type === 'OUT' || log.type === 'ADJ_OUT';
                    const isSo = log.type === 'SO';

                    const typeBadgeClass = isPlus
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : isMinus
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                      : isSo
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';

                    const qtyPrefix = isPlus ? '+' : isMinus ? '-' : '';

                    return (
                      <div
                        key={log.id || `${log.invoice}_${idx}`}
                        className="p-3 rounded-2xl bg-slate-50/70 dark:bg-[#0E1420] border border-slate-200/80 dark:border-slate-800 space-y-2 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                      >
                        {/* Top Row: Type Badge + Qty + Date + Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border font-mono ${typeBadgeClass}`}
                            >
                              {log.type}
                            </span>
                            <span
                              className={`font-mono text-sm font-black ${
                                isPlus
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : isMinus
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-blue-600 dark:text-blue-400'
                              }`}
                            >
                              {qtyPrefix}
                              {Math.abs(Number(log.qty) || 0)} pcs
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{formatDateTime(log.created_at)}</span>
                            </div>

                            {/* Edit & Delete Action Buttons */}
                            <div className="flex items-center gap-0.5 pl-1.5 border-l border-slate-200 dark:border-slate-800">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(log);
                                }}
                                className="p-1 rounded-md text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                                title="Edit mutasi ini"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingLog(log);
                                }}
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                                title="Hapus mutasi ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Middle Row: Location & Invoice */}
                        <div className="flex items-center justify-between text-xs gap-2 pt-0.5">
                          <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-bold min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="font-mono">{log.lokasi || '-'}</span>
                            {log.area && (
                              <span className="text-[10px] text-slate-400 font-normal">
                                ({log.area})
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate font-semibold">
                            {log.invoice || '-'}
                          </div>
                        </div>

                        {/* Bottom Row: Operator & Keterangan */}
                        {(log.operator || log.keterangan) && (
                          <div className="pt-1 border-t border-slate-100 dark:border-slate-800/80 text-[10.5px] text-slate-500 dark:text-slate-400 flex flex-col gap-0.5">
                            {log.operator && (
                              <div className="flex items-center gap-1 truncate">
                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="font-medium text-slate-600 dark:text-slate-300 truncate">
                                  {log.operator}
                                </span>
                              </div>
                            )}
                            {log.keterangan && (
                              <div className="italic text-slate-500 dark:text-slate-400 truncate" title={log.keterangan}>
                                &ldquo;{log.keterangan}&rdquo;
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
                <input
                  type="number"
                  min="1"
                  value={editForm.qty}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, qty: Math.max(1, parseInt(e.target.value) || 1) }))}
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
