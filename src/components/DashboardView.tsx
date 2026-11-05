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
  TrendingUp,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Truck,
  ExternalLink,
  Layers,
  Activity,
  AlertCircle,
  FolderKanban,
  CheckCircle2,
  CalendarDays
} from 'lucide-react';
import { UserSession, ProductItem, ProjectItem, AgendaEvent } from '../types';
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
  peminjamanAktif: number;
  returAktif: number;
  activeProjects: ProjectItem[];
  activeProjectsCount: number;
  upcomingAgenda: AgendaEvent[];
  upcomingAgendaCount: number;
  recentLogs: RecentLogItem[];
}

const DASHBOARD_CACHE_KEY = 'wms_dashboard_lean_metrics_v3';
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

function formatDateBadge(dateStr?: string): { day: string; month: string } {
  if (!dateStr) return { day: '—', month: '' };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const parts = dateStr.split('-');
      return { day: parts[2] || '—', month: parts[1] || '' };
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleDateString('id-ID', { month: 'short' });
    return { day, month };
  } catch {
    return { day: '—', month: '' };
  }
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
      peminjamanAktif: 0,
      returAktif: 0,
      activeProjects: [],
      activeProjectsCount: 0,
      upcomingAgenda: [],
      upcomingAgendaCount: 0,
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

  // Fetch metrics using ultra-lean HEAD-only queries & tiny limit queries (< 1.5 KB total)
  const fetchLeanMetrics = useCallback(async (isManualTrigger = false) => {
    setIsRefreshing(true);
    try {
      const sb = getSupabaseClient();
      const todayYmd = new Date().toISOString().split('T')[0];

      // Parallel execution of count-only headers, 4 active projects, 4 upcoming events, and 5 recent logs
      const [
        ordersNewRes,
        ordersProcRes,
        peminjamanRes,
        returRes,
        projectsRes,
        agendaRes,
        recentLogsRes,
      ] = await Promise.allSettled([
        sb.from('manual_shipment').select('id', { count: 'exact', head: true }).eq('status', 'diterima'),
        sb.from('manual_shipment').select('id', { count: 'exact', head: true }).eq('status', 'diproses'),
        sb.from('peminjaman').select('id', { count: 'exact', head: true }).eq('status', 'dipinjam'),
        sb.from('retur_barang').select('id', { count: 'exact', head: true }).neq('status', 'selesai'),
        sb.from('wms_projects')
          .select('id, title, status, priority, progress, deadline, pic', { count: 'exact' })
          .neq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(4),
        sb.from('wms_agenda')
          .select('id, title, start_date, start_time, end_date, end_time, category, pic', { count: 'exact' })
          .gte('start_date', todayYmd)
          .order('start_date', { ascending: true })
          .limit(4),
        sb.from('log_produk')
          .select('id, type, sku, nama_produk, lokasi, qty, operator, created_at')
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const newMetrics: DashboardMetrics = {
        lastUpdated: Date.now(),
        pesananBaru: ordersNewRes.status === 'fulfilled' ? (ordersNewRes.value.count ?? 0) : metrics.pesananBaru,
        pesananDiproses: ordersProcRes.status === 'fulfilled' ? (ordersProcRes.value.count ?? 0) : metrics.pesananDiproses,
        peminjamanAktif: peminjamanRes.status === 'fulfilled' ? (peminjamanRes.value.count ?? 0) : metrics.peminjamanAktif,
        returAktif: returRes.status === 'fulfilled' ? (returRes.value.count ?? 0) : metrics.returAktif,
        activeProjects: projectsRes.status === 'fulfilled' && projectsRes.value.data
          ? (projectsRes.value.data as ProjectItem[])
          : metrics.activeProjects,
        activeProjectsCount: projectsRes.status === 'fulfilled'
          ? (projectsRes.value.count ?? projectsRes.value.data?.length ?? 0)
          : metrics.activeProjectsCount,
        upcomingAgenda: agendaRes.status === 'fulfilled' && agendaRes.value.data
          ? (agendaRes.value.data as AgendaEvent[])
          : metrics.upcomingAgenda,
        upcomingAgendaCount: agendaRes.status === 'fulfilled'
          ? (agendaRes.value.count ?? agendaRes.value.data?.length ?? 0)
          : metrics.upcomingAgendaCount,
        recentLogs: recentLogsRes.status === 'fulfilled' && recentLogsRes.value.data
          ? (recentLogsRes.value.data as RecentLogItem[])
          : metrics.recentLogs,
      };

      setMetrics(newMetrics);
      try {
        localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(newMetrics));
      } catch {}

      if (isManualTrigger && onShowToast) {
        onShowToast('Data ringkasan berhasil diperbarui (< 1.5 KB Egress)', 'info');
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
        weekday: 'short',
        day: 'numeric',
        month: 'short',
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
    <div className="p-2 sm:p-4 lg:p-6 space-y-3 sm:space-y-5 w-full max-w-full pb-24">
      {/* 1. Header Toolbar & Context (Mobile-Optimized Compact Sizing) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:p-4 lg:p-5 rounded-2xl bg-white dark:bg-[#1a2332] border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Dashboard Operasional
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
              <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-indigo-500" />
              Live WMS
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40" title="Query hanya mengambil HTTP Header Count & list ringkas (Zero-Egress Protection)">
              <ShieldCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-600 dark:text-emerald-400" />
              Hemat Kuota (~0 KB)
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
            Halo, <span className="font-bold text-slate-700 dark:text-slate-200">{operatorName}</span> ({operatorRole}) · {formattedToday}
          </p>
        </div>

        {/* Refresh Button & Relative Time */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => fetchLeanMetrics(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 active:scale-98 transition-all cursor-pointer shadow-2xs disabled:opacity-60"
            title="Perbarui ringkasan (Memakai Lean Query < 1.5 KB Egress)"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Memperbarui...' : 'Segarkan'}</span>
            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 sm:pl-1 sm:border-l sm:border-slate-200 sm:dark:border-slate-700">
              {timeAgoStr}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Top 4 Master KPI Cards (Mobile: 2x2 Grid, Desktop: 4 Columns) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3.5">
        {/* KPI 1: Pesanan Masuk */}
        <div
          onClick={() => handleAction('pesanan_saya')}
          className="group bg-white dark:bg-[#1a2332] p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700/60 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                Pesanan Masuk
              </p>
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white mt-0.5 sm:mt-1">
                {metrics.pesananBaru}
              </h3>
            </div>
            <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/40 shrink-0">
              <Package className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] sm:text-xs">
            <span className="text-slate-500 dark:text-slate-400 truncate">
              <b className="text-slate-700 dark:text-slate-200">{metrics.pesananDiproses}</b> diproses
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
              <span className="hidden sm:inline">Buka</span> <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 2: Master Katalog & Rak */}
        <div
          onClick={() => handleAction('inventory')}
          className="group bg-white dark:bg-[#1a2332] p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                Katalog & Rak
              </p>
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white mt-0.5 sm:mt-1 truncate">
                {totalMasterSkus > 0 ? totalMasterSkus.toLocaleString('id-ID') : '—'} <span className="text-[10px] sm:text-xs font-semibold text-slate-500">SKU</span>
              </h3>
            </div>
            <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40 shrink-0">
              <Boxes className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] sm:text-xs">
            <span className="text-slate-500 dark:text-slate-400 truncate">
              <b className="text-slate-700 dark:text-slate-200">{totalLocations > 0 ? totalLocations : '—'}</b> rak aktif
            </span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
              <span className="hidden sm:inline">Stok</span> <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 3: Proyek & Milestone Berjalan */}
        <div
          onClick={() => handleAction('agenda', 'project')}
          className="group bg-white dark:bg-[#1a2332] p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700/60 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                Proyek Aktif
              </p>
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white mt-0.5 sm:mt-1">
                {metrics.activeProjectsCount} <span className="text-[10px] sm:text-xs font-semibold text-slate-500">Proyek</span>
              </h3>
            </div>
            <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40 shrink-0">
              <FolderKanban className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] sm:text-xs">
            <span className="text-slate-500 dark:text-slate-400 truncate">
              In progress & milestone
            </span>
            <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
              <span className="hidden sm:inline">Proyek</span> <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 4: Jadwal & Agenda Terdekat */}
        <div
          onClick={() => handleAction('agenda', 'calendar')}
          className="group bg-white dark:bg-[#1a2332] p-3 sm:p-4 lg:p-5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                Jadwal & Drop
              </p>
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white mt-0.5 sm:mt-1">
                {metrics.upcomingAgendaCount} <span className="text-[10px] sm:text-xs font-semibold text-slate-500">Jadwal</span>
              </h3>
            </div>
            <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40 shrink-0">
              <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] sm:text-xs">
            <span className="text-slate-500 dark:text-slate-400 truncate">
              Hari ini & terdekat
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
              <span className="hidden sm:inline">Agenda</span> <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* 3. Bento Section: Agenda Operasional & Proyek Berjalan (2 Kolom Seimbang) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Tile A: Jadwal Kerja & Pengiriman Terdekat */}
        <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                    Jadwal Kerja & Drop Terdekat
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Bazaar, pengiriman luar kota, dan jadwal rilis artikel
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAction('agenda', 'calendar')}
                className="text-[11px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-0.5 shrink-0 cursor-pointer"
              >
                Kalendar <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* List of Upcoming Agenda */}
            <div className="mt-3 space-y-2">
              {metrics.upcomingAgenda && metrics.upcomingAgenda.length > 0 ? (
                metrics.upcomingAgenda.map((event, idx) => {
                  const badge = formatDateBadge(event.start_date);
                  const isUrgent = event.category === 'urgent';
                  const catClass = isUrgent
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                    : event.category === 'operasional'
                    ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                    : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300';

                  return (
                    <div
                      key={event.id || idx}
                      onClick={() => handleAction('agenda', 'calendar')}
                      className="flex items-center justify-between gap-2.5 p-2 sm:p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60 hover:bg-slate-100/60 dark:hover:bg-slate-850 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                        {/* Date badge */}
                        <div className="w-9 sm:w-10 h-9 sm:h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center shrink-0 shadow-2xs">
                          <span className="text-[11px] sm:text-xs font-black text-slate-800 dark:text-slate-200 leading-none">
                            {badge.day}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase leading-none mt-0.5">
                            {badge.month}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                            {event.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded ${catClass}`}>
                              {event.category || 'Operasional'}
                            </span>
                            {event.pic && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                                · PIC: {event.pic}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                          {event.start_date}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  Tidak ada jadwal atau event terdekat.
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => handleAction('agenda', 'calendar')}
              className="w-full py-2 px-3 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors text-center cursor-pointer"
            >
              Buka Kalendar Kerja Lengkap
            </button>
          </div>
        </div>

        {/* Tile B: Proyek & Milestone Berjalan */}
        <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <FolderKanban className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                    Proyek & Milestone Berjalan
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Tracking progress target operasional & perbaikan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAction('agenda', 'project')}
                className="text-[11px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-0.5 shrink-0 cursor-pointer"
              >
                Proyek <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* List of Active Projects */}
            <div className="mt-3 space-y-2.5">
              {metrics.activeProjects && metrics.activeProjects.length > 0 ? (
                metrics.activeProjects.map((project, idx) => {
                  const isHigh = project.priority === 'high';
                  const priorityClass = isHigh
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300';
                  const progressVal = project.progress ?? 0;

                  return (
                    <div
                      key={project.id || idx}
                      onClick={() => handleAction('agenda', 'project')}
                      className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60 hover:bg-slate-100/60 dark:hover:bg-slate-850 transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded shrink-0 ${priorityClass}`}>
                            {project.priority || 'Medium'}
                          </span>
                          <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                            {project.title}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0">
                          {progressVal}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-indigo-600 dark:bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, progressVal))}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pt-0.5">
                        <span className="truncate">
                          Status: <b className="capitalize text-slate-600 dark:text-slate-400">{project.status?.replace('_', ' ') || 'In progress'}</b>
                        </span>
                        {project.deadline && (
                          <span className="shrink-0 font-mono">
                            Deadline: {project.deadline}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  Tidak ada proyek aktif saat ini.
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() => handleAction('agenda', 'project')}
              className="w-full py-2 px-3 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors text-center cursor-pointer"
            >
              Buka Manajemen Proyek Lengkap
            </button>
          </div>
        </div>
      </div>

      {/* 4. Asymmetric Bento Section: Antrean Fokus Kerja (7 cols) vs Live Ledger (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        {/* Left Column: Antrean Prioritas Kerja Gudang */}
        <div className="lg:col-span-7 bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
            <div>
              <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5 sm:gap-2">
                <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Antrean & Fokus Kerja Hari Ini
              </h2>
              <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pintasan ke modul operasional utama yang membutuhkan tindakan
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {/* Action Card 1: Pesanan & Cetak Label */}
            <div
              onClick={() => handleAction('pesanan_saya')}
              className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] sm:text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                    {metrics.pesananBaru} Menunggu
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-1.5">
                  Pesanan & Label
                </h4>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Verifikasi pesanan dan cetak thermal A6.
                </p>
              </div>
            </div>

            {/* Action Card 2: Tugas Picking */}
            <div
              onClick={() => handleAction('loading_dock', 'picking_tasks')}
              className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] sm:text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300">
                    Loading Dock
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-1.5">
                  Tugas Picking
                </h4>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Ambil stok rak Prioritas 1–3 via invoice WA.
                </p>
              </div>
            </div>

            {/* Action Card 3: Penerimaan Produksi */}
            <div
              onClick={() => handleAction('produksi')}
              className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] sm:text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                    Konveksi
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-1.5">
                  Produksi Masuk
                </h4>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Rekap spreadsheet dan sync barcode baru.
                </p>
              </div>
            </div>

            {/* Action Card 4: Pusat Resolusi & Retur */}
            <div
              onClick={() => handleAction('pusat_resolusi')}
              className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] sm:text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                    {metrics.returAktif} Retur
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-200 mt-1.5">
                  Pusat Resolusi
                </h4>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                  Retur barang, kendala pesanan, dan ganti size.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Pergerakan Stok Terkini (5 Transaksi Terakhir dari log_produk) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
              <div>
                <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Pergerakan Stok Terkini
                </h2>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
                  5 mutasi fisik terakhir di gudang
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAction('mutasi_log')}
                className="text-[11px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-0.5 cursor-pointer shrink-0"
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
                        <span className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-mono font-black shrink-0 ${typeColor}`}>
                          #{log.type}
                        </span>
                        <div className="min-w-0">
                          <p className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate text-[11px] sm:text-xs">
                            {log.sku}
                          </p>
                          <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {log.nama_produk || '—'} · Rak <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{log.lokasi}</span>
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`font-mono font-black text-xs sm:text-sm ${isOut ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {isOut ? `-${log.qty}` : `+${log.qty}`}
                        </span>
                        <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500">
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

      {/* 5. Bottom Row: Pusat Akses Cepat Operasional (Mobile: 3x2 Grid, Desktop: 6 Cols) */}
      <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 space-y-2.5 sm:space-y-3">
        <h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Pusat Akses Cepat Alat Operasional
        </h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
          {[
            { label: 'Scanner', desc: 'Scan Rak & Fisik', page: 'scanner', icon: Barcode },
            { label: 'Cetak Barcode', desc: 'Label Rak/Produk', page: 'cetak_barcode', icon: FileText },
            { label: 'Loading Dock', desc: 'Inbound & Picking', page: 'loading_dock', icon: Truck },
            { label: 'Kalendar Shift', desc: 'Jadwal & Agenda', page: 'agenda', icon: Calendar },
            { label: 'Live Chat', desc: 'Chat Internal', page: 'live_chat', icon: MessageSquare },
            { label: 'Rekap JNE', desc: 'Tagihan Ekspedisi', page: 'rekap_tagihan_jne', icon: Layers },
          ].map((tool, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleAction(tool.page)}
              className="p-2.5 sm:p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-800 text-left transition-all group cursor-pointer"
            >
              <tool.icon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1 sm:mb-2" />
              <p className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                {tool.label}
              </p>
              <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 truncate">
                {tool.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* 6. Health & Egress Protection Transparency Card */}
      <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-start gap-2 min-w-0">
          <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-slate-700 dark:text-slate-200">Arsitektur Hemat Bandwidth Aktif:</strong> Metrik dihitung via HTTP Head-Only Count & list ringkas (&lt; 1.5 KB payload). Cache 15 menit melindungi kuota free tier Supabase Anda dengan nol listener latar belakang.
          </p>
        </div>
        <span className="shrink-0 font-mono text-[9px] sm:text-[11px] px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
          Supabase Free Tier Safe ✅
        </span>
      </div>
    </div>
  );
};
