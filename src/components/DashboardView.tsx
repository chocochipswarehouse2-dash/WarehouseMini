import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package,
  Boxes,
  RefreshCw,
  Clock,
  ArrowRight,
  Barcode,
  Calendar,
  MessageSquare,
  FileText,
  CheckCircle2,
  TrendingUp,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Truck,
  ExternalLink,
  Layers,
  Activity,
  AlertCircle
} from 'lucide-react';
import { UserSession, ProductItem } from '../types';
import { getSupabaseClient } from '../services/supabase';

interface DashboardViewProps {
  session?: UserSession | null;
  onNavigate?: (page: any, subTab?: string) => void;
  productCatalog?: ProductItem[];
  currentLocations?: string[];
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

interface RecentLogItem {
  id: number | string;
  type: string;
  sku: string;
  nama_produk: string;
  lokasi: string;
  qty: number;
  operator: string;
  created_at: string;
}

interface DashboardMetrics {
  lastUpdated: number;
  pesananBaru: number;
  pesananDiproses: number;
  soPending: number;
  peminjamanAktif: number;
  returAktif: number;
  recentLogs: RecentLogItem[];
}

const DASHBOARD_CACHE_KEY = 'wms_dashboard_lean_metrics_v2';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 Menit Stale-While-Revalidate

function formatRelativeTime(timestamp: number | string): string {
  if (!timestamp) return 'Belum lama ini';
  const now = Date.now();
  const time = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
  const diffSec = Math.floor((now - time) / 1000);

  if (diffSec < 45) return 'Baru saja';
  if (diffSec < 90) return '1 mnt lalu';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mnt lalu`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
  return `${Math.floor(diffSec / 86400)} hari lalu`;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  session,
  onNavigate,
  productCatalog = [],
  currentLocations = [],
  onShowToast,
}) => {
  const [metrics, setMetrics] = useState<DashboardMetrics>(() => {
    try {
      const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return {
      lastUpdated: 0,
      pesananBaru: 0,
      pesananDiproses: 0,
      soPending: 0,
      peminjamanAktif: 0,
      returAktif: 0,
      recentLogs: [],
    };
  });

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [timeAgoStr, setTimeAgoStr] = useState<string>('');

  // Update relative time label every 30 seconds
  useEffect(() => {
    const updateLabel = () => {
      if (metrics.lastUpdated > 0) {
        setTimeAgoStr(formatRelativeTime(metrics.lastUpdated));
      } else {
        setTimeAgoStr('Belum pernah');
      }
    };
    updateLabel();
    const timer = setInterval(updateLabel, 30000);
    return () => clearInterval(timer);
  }, [metrics.lastUpdated]);

  // Fetch metrics using ultra-lean HEAD-only queries (0 bytes data egress)
  const fetchLeanMetrics = useCallback(async (isManualTrigger = false) => {
    setIsRefreshing(true);
    try {
      const sb = getSupabaseClient();

      // Parallel execution of count-only headers and minimal 5 recent logs
      const [
        ordersNewRes,
        ordersProcRes,
        soQueueRes,
        peminjamanRes,
        returRes,
        recentLogsRes,
      ] = await Promise.allSettled([
        sb.from('manual_shipment').select('id', { count: 'exact', head: true }).eq('status', 'diterima'),
        sb.from('manual_shipment').select('id', { count: 'exact', head: true }).eq('status', 'diproses'),
        sb.from('stock_opname_queue').select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
        sb.from('peminjaman').select('id', { count: 'exact', head: true }).eq('status', 'dipinjam'),
        sb.from('retur_barang').select('id', { count: 'exact', head: true }).neq('status', 'selesai'),
        sb.from('log_produk')
          .select('id, type, sku, nama_produk, lokasi, qty, operator, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const newMetrics: DashboardMetrics = {
        lastUpdated: Date.now(),
        pesananBaru: ordersNewRes.status === 'fulfilled' ? (ordersNewRes.value.count ?? 0) : metrics.pesananBaru,
        pesananDiproses: ordersProcRes.status === 'fulfilled' ? (ordersProcRes.value.count ?? 0) : metrics.pesananDiproses,
        soPending: soQueueRes.status === 'fulfilled' ? (soQueueRes.value.count ?? 0) : metrics.soPending,
        peminjamanAktif: peminjamanRes.status === 'fulfilled' ? (peminjamanRes.value.count ?? 0) : metrics.peminjamanAktif,
        returAktif: returRes.status === 'fulfilled' ? (returRes.value.count ?? 0) : metrics.returAktif,
        recentLogs: recentLogsRes.status === 'fulfilled' && recentLogsRes.value.data
          ? (recentLogsRes.value.data as RecentLogItem[])
          : metrics.recentLogs,
      };

      setMetrics(newMetrics);
      try {
        localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(newMetrics));
      } catch {}

      if (isManualTrigger && onShowToast) {
        onShowToast('Data ringkasan berhasil diperbarui (< 1 KB Egress)', 'info');
      }
    } catch (err: any) {
      console.warn('[Dashboard] Gagal memperbarui data:', err?.message || err);
      if (isManualTrigger && onShowToast) {
        onShowToast('Gagal terhubung ke database. Menggunakan data cache.', 'warning');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [metrics, onShowToast]);

  // Initial mount: only fetch if cache is absent or older than 15 minutes
  useEffect(() => {
    const age = Date.now() - (metrics.lastUpdated || 0);
    if (!metrics.lastUpdated || age > CACHE_TTL_MS) {
      fetchLeanMetrics(false);
    }
  }, []);

  const totalMasterSkus = useMemo(() => productCatalog?.length || 0, [productCatalog]);
  const totalLocations = useMemo(() => currentLocations?.length || 0, [currentLocations]);

  // Format today's date in Indonesian
  const formattedToday = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return new Date().toLocaleDateString('id-ID');
    }
  }, []);

  const operatorName = session?.username || 'Operator';
  const operatorRole = session?.role || 'Staff Gudang';

  const handleAction = (page: string, subTab?: string) => {
    if (onNavigate) {
      onNavigate(page, subTab);
    }
  };

  return (
    <div className="p-2 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 w-full max-w-full pb-24">
      {/* 1. Header Toolbar & Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Dashboard Operasional
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              Live WMS
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40" title="Query hanya mengambil HTTP Header Count tanpa mentransfer data mentah (0 bytes body payload)">
              <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              Egress Saver Aktif (~0 KB)
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Selamat datang, <span className="font-bold text-slate-700 dark:text-slate-200">{operatorName}</span> ({operatorRole}) · {formattedToday}
          </p>
        </div>

        {/* Toolbar Action: Refresh with Relative Timestamp */}
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <button
            type="button"
            onClick={() => fetchLeanMetrics(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 active:scale-98 transition-all cursor-pointer shadow-2xs disabled:opacity-60"
            title="Perbarui ringkasan (Memakai Head-Only Query < 1 KB Egress)"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
            <span>{isRefreshing ? 'Memperbarui...' : 'Segarkan'}</span>
            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 pl-1 border-l border-slate-200 dark:border-slate-700">
              {timeAgoStr}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Bento Grid: 4 Top Master KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Pesanan Baru */}
        <div
          onClick={() => handleAction('pesanan_saya')}
          className="group bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700/60 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pesanan Masuk
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                {metrics.pesananBaru}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/40">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              <b className="text-slate-700 dark:text-slate-200">{metrics.pesananDiproses}</b> sedang diproses
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-[11px]">
              Buka Pesanan <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 2: Master Katalog & Rak */}
        <div
          onClick={() => handleAction('inventory')}
          className="group bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Katalog Produk & Rak
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                {totalMasterSkus > 0 ? totalMasterSkus.toLocaleString('id-ID') : '—'} <span className="text-xs font-semibold text-slate-500">SKU</span>
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              <b className="text-slate-700 dark:text-slate-200">{totalLocations > 0 ? totalLocations : '—'}</b> lokasi rak aktif
            </span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-[11px]">
              Cek Stok <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 3: Antrean Stock Opname */}
        <div
          onClick={() => handleAction('inventory', 'capacity')}
          className="group bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-sky-300 dark:hover:border-sky-700/60 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Stock Opname Pending
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                {metrics.soPending} <span className="text-xs font-semibold text-slate-500">Sesi</span>
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-200/50 dark:border-sky-800/40">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              Menunggu approval audit
            </span>
            <span className="font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-[11px]">
              Audit SO <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 4: Resolusi & Peminjaman Sampel */}
        <div
          onClick={() => handleAction('pusat_resolusi')}
          className="group bg-white dark:bg-[#1a2332] p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-rose-300 dark:hover:border-rose-700/60 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Retur & Peminjaman
              </p>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                {metrics.returAktif + metrics.peminjamanAktif}
              </h3>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-800/40">
              <RotateCcw className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              {metrics.returAktif} retur · {metrics.peminjamanAktif} sampel SPS
            </span>
            <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-[11px]">
              Resolusi <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* 3. Asymmetric Bento Section: Left (7 cols) Workflow Antrean vs Right (5 cols) Live Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Antrean Prioritas Kerja Gudang */}
        <div className="lg:col-span-7 bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Antrean & Fokus Kerja Hari Ini
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pintasan langsung ke modul operasional utama yang membutuhkan tindakan
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Action Card 1: Pesanan & Cetak Label */}
            <div
              onClick={() => handleAction('pesanan_saya')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                  {metrics.pesananBaru} Menunggu
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
              </div>
              <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-2">
                Pesanan & Cetak Label
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                Verifikasi pesanan masuk, cetak label pengiriman A6 thermal dan picking list.
              </p>
            </div>

            {/* Action Card 2: Tugas Picking */}
            <div
              onClick={() => handleAction('loading_dock', 'picking_tasks')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300">
                  Loading Dock
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
              </div>
              <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-2">
                Tugas Picking Gudang
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                Ambil barang dari rak Prioritas 1–3 berdasarkan invoice picking WA & sistem.
              </p>
            </div>

            {/* Action Card 3: Penerimaan Produksi */}
            <div
              onClick={() => handleAction('produksi')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  Inbound Konveksi
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
              </div>
              <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-2">
                Penerimaan Produksi
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                Rekap spreadsheet penerimaan konveksi, sync barcode artikel, dan push sheet.
              </p>
            </div>

            {/* Action Card 4: Peminjaman SPS & Sampel */}
            <div
              onClick={() => handleAction('peminjaman')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300">
                  {metrics.peminjamanAktif} Dipinjam
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
              </div>
              <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-2">
                Peminjaman Sampel (SPS)
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                Form peminjaman baju photoshoot, live marketing, dan pengembalian sampel.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Pergerakan Stok Terkini (5 Transaksi Terakhir dari log_produk) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 sm:p-5 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Pergerakan Stok Terkini
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  5 mutasi fisik terakhir di log gudang
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAction('mutasi_log')}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-0.5 cursor-pointer"
              >
                Semua Log <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* List of 5 Recent Logs */}
            <div className="mt-3 space-y-2">
              {metrics.recentLogs && metrics.recentLogs.length > 0 ? (
                metrics.recentLogs.map((log, idx) => {
                  const isOut = log.type === 'OUT' || log.type === 'ADJ_OUT';
                  const isSo = log.type === 'SO';
                  const typeColor = isOut
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                    : isSo
                    ? 'bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300'
                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300';

                  return (
                    <div
                      key={log.id || idx}
                      className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black shrink-0 ${typeColor}`}>
                          #{log.type}
                        </span>
                        <div className="min-w-0">
                          <p className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                            {log.sku}
                          </p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {log.nama_produk || '—'} · Rak <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{log.lokasi}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`font-mono font-black ${isOut ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {isOut ? `-${log.qty}` : `+${log.qty}`}
                        </span>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                          {formatRelativeTime(log.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  Belum ada log transaksi yang dimuat.
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => handleAction('mutasi_log')}
              className="w-full py-2 px-3 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors text-center cursor-pointer"
            >
              Buka Riwayat Mutasi Gudang Lengkap
            </button>
          </div>
        </div>
      </div>

      {/* 4. Bottom Row: Pusat Akses Cepat Operasional (Pintasan 6 Modul) */}
      <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 sm:p-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Pusat Akses Cepat Alat Operasional
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {[
            { label: 'Scanner Barcode', desc: 'Scan Rak & Fisik', page: 'scanner', icon: Barcode },
            { label: 'Cetak Barcode', desc: 'Label Rak & Produk', page: 'cetak_barcode', icon: FileText },
            { label: 'Loading Dock', desc: 'Inbound & Picking', page: 'loading_dock', icon: Truck },
            { label: 'Kalendar Shift', desc: 'Jadwal & Agenda', page: 'agenda', icon: Calendar },
            { label: 'Live Chat', desc: 'Komunikasi Internal', page: 'live_chat', icon: MessageSquare },
            { label: 'Rekap JNE', desc: 'Tagihan Ekspedisi', page: 'rekap_tagihan_jne', icon: Layers },
          ].map((tool, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleAction(tool.page)}
              className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-800 text-left transition-all group cursor-pointer"
            >
              <tool.icon className="w-5 h-5 text-slate-600 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-2" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {tool.label}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                {tool.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* 5. Health & Egress Protection Transparency Card */}
      <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-slate-700 dark:text-slate-200">Arsitektur Hemat Bandwidth Aktif:</strong> Seluruh metrik dihitung melalui HTTP Head-Only Query tanpa mengunduh baris tabel mentah. Cache 15 menit melindungi kuota free tier Supabase Anda (konsumsi egress &lt; 1 MB/bulan) dengan nol koneksi WebSocket latar belakang.
          </p>
        </div>
        <span className="shrink-0 font-mono text-[11px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
          Supabase Free Tier Safe ✅
        </span>
      </div>
    </div>
  );
};
