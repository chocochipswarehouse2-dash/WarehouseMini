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
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Truck,
  Layers,
  Activity,
  FolderKanban,
  CheckCircle2,
  CalendarDays,
  ClipboardPlus,
  Scale,
  AlertTriangle,
  ShieldAlert,
  Wrench,
  Store,
  Radio,
  ShoppingBag,
  Video,
  Warehouse,
  User,
  Copy,
  Check,
} from 'lucide-react';
import {
  UserSession,
  ProductItem,
  ProjectItem,
  AgendaEvent,
  StockRealtimeItem,
  PickingListItem,
  PenerimaanProduksiItem,
  ManualShipmentOrder,
  LogProdukItem,
} from '../types';
import {
  getSupabaseClient,
  fetchPenerimaanRecountQueueFromSupabase,
  getRecountAuditMap,
  fetchRecountAuditMapFromCloud,
  getCachedPenerimaanProduksiSync,
  fetchPenerimaanProduksiFromSupabase,
  fetchPickingListFromSupabase,
  fetchSupabaseStokFisikDirect,
  getMemoryStokFisikCache,
  getAreaFromLokasi,
} from '../services/supabase';
import {
  getPendingOfflineProduksiCount,
  getAllInventoryStocksFromLocalDb,
} from '../services/localDb';
import { fetchManualShipments } from '../services/gasManualShipment';
import {
  fetchRackCapacityConfig,
  getDefaultRackCapacityConfig,
  computeAllRackSlots,
  buildEnrichedCatalogMap,
  RackCapacityConfig,
  ComputedRackSlot,
} from '../services/rackCapacityService';
import { scanAnomalies, isCorruptedSku, AnomalyItem } from '../utils/anomalyUtils';
import { orderNeedsResi, hasRealAlterItems } from '../utils/alterationUtils';
import { isSuperadmin } from '../services/permissions';
import {
  getActiveProduksiInputDraftSummary,
  getActiveRecountDraftSummary,
  getPendingRecountOutboxCount,
} from '../services/scannerOutboxService';
import { InventoryAnomalyModal } from './InventoryAnomalyModal';
import { DashboardWorkToolsGrid } from './DashboardWorkToolsGrid';
import { AreaBadge } from './inventory/InventoryList';
import { getLogSource } from './MutasiLogView';
import { resolveProductName, resolveProductDisplaySize } from '../utils/sortUtils';
import { formatOperatorWithPersonName } from '../utils/userResolver';

export interface DashboardRecountQueueEntry {
  kode_produksi: string;
  catatan_petunjuk?: string;
  added_at?: string;
  added_by?: string;
  status: 'BELUM' | 'SELISIH' | 'MATCH';
  selisih?: number | null;
}

export interface DashboardPickingTaskSummary {
  no_sj: string;
  invoice_picking?: string;
  tujuan: string;
  tanggal: string;
  status: 'PENDING' | 'SEDANG PICKING';
  totalItems: number;
  totalQtyReq: number;
  totalQtyPicked: number;
  created_at?: string;
}

interface OrderBreakdownStats {
  baru: number;
  diproses: number;
  selesai: number;
  total: number;
}

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
  invoice?: string;
  sku: string;
  nama_produk: string;
  size?: string;
  area?: string;
  lokasi: string;
  qty: number;
  operator: string;
  keterangan?: string;
  created_at: string;
}

interface DashboardMetrics {
  lastUpdated: number;
  manualStats: OrderBreakdownStats;
  alterStats: OrderBreakdownStats;
  peminjamanAktif: number;
  returAktif: number;
  activeProjects: ProjectItem[];
  activeProjectsCount: number;
  upcomingAgenda: AgendaEvent[];
  upcomingAgendaCount: number;
  recentLogs: RecentLogItem[];
}

const EMPTY_ORDER_STATS: OrderBreakdownStats = { baru: 0, diproses: 0, selesai: 0, total: 0 };

const DASHBOARD_CACHE_KEY = 'wms_dashboard_lean_metrics_v5';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 Menit Stale-While-Revalidate

function renderLogTypeStyle(type: string) {
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
}

function formatLogShortTime(iso?: string): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

function getSessionStoreName(session: UserSession | null | undefined): string {
  if (!session || isSuperadmin(session)) return '';
  const div = String(session.divisi || '').trim();
  if (div && !['gudang', 'warehouse', 'admin', 'produksi', 'management'].includes(div.toLowerCase())) {
    return div;
  }
  return '';
}

function isSameStoreName(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const na = a.trim().toLowerCase().replace(/^store\s+/i, '');
  const nb = b.trim().toLowerCase().replace(/^store\s+/i, '');
  return na === nb || na.includes(nb) || nb.includes(na);
}

function computeOrderBreakdowns(
  orders: ManualShipmentOrder[],
  session?: UserSession | null
): { manualStats: OrderBreakdownStats; alterStats: OrderBreakdownStats } {
  const manualStats: OrderBreakdownStats = { baru: 0, diproses: 0, selesai: 0, total: 0 };
  const alterStats: OrderBreakdownStats = { baru: 0, diproses: 0, selesai: 0, total: 0 };

  const userIsAdmin = isSuperadmin(session ?? null);
  const userStore = getSessionStoreName(session);

  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (!o || o.status === 'batal') continue;

    if (!userIsAdmin && userStore) {
      const fromStore =
        isSameStoreName(o.nama_pengirim, userStore) ||
        isSameStoreName(o.alteration_repair_data?.nama_asal, userStore);
      const hasStoreItem = Array.isArray(o.items) && o.items.some((it) => isSameStoreName(it.fulfillment, userStore));
      if (!fromStore && !hasStoreItem) continue;
    }

    const noPesananUp = String(o.no_pesanan || '').toUpperCase().trim();
    const isAr =
      o.order_type === 'alteration_repair' ||
      noPesananUp.startsWith('AR-') ||
      noPesananUp.startsWith('REP-') ||
      noPesananUp.startsWith('ALT-') ||
      hasRealAlterItems(o);

    const isSelesai = !orderNeedsResi(o)
      ? Boolean(o.tgl_jadwal_kirim_store && o.tgl_jadwal_kirim_store.trim()) ||
        o.status === 'dikirim' ||
        o.status === 'selesai' ||
        o.status === 'diambil'
      : Boolean(o.no_resi && o.no_resi.trim());

    const flowStr = String(o.alteration_repair_data?.status_flow || '').toLowerCase();
    const isDiproses =
      !isSelesai &&
      (Boolean(o.is_picking_printed && o.is_label_printed) ||
        ['dalam_pengerjaan', 'selesai_qc', 'diterima_warehouse', 'siap_dikirim'].includes(flowStr));

    const target = isAr ? alterStats : manualStats;
    target.total += 1;
    if (isSelesai) target.selesai += 1;
    else if (isDiproses) target.diproses += 1;
    else target.baru += 1;
  }

  return { manualStats, alterStats };
}

/**
 * Menghitung antrean kode Hitung Ulang dengan logika identik AuditHitungUlangTab:
 * - Menggabungkan queueMap (wms_recount_selected_queue), auditMap (Cloud + Local), dan penerimaanItems.recount_qty
 * - Menggunakan field total_selisih (bukan selisih) dan target Qty Nota jika tersedia
 * - Memastikan jumlah BELUM DIHITUNG sama persis dengan kartu "ANTRIAN BELUM" di Audit Hitung Ulang
 */
function buildSyncedRecountEntries(penerimaanItems: PenerimaanProduksiItem[]): DashboardRecountQueueEntry[] {
  try {
    const rawQueue = localStorage.getItem('wms_recount_selected_queue');
    const queueMap: Record<string, any> = {};

    if (rawQueue) {
      const parsed = JSON.parse(rawQueue);
      if (Array.isArray(parsed)) {
        parsed.forEach((it: any) => {
          const code = typeof it === 'string' ? it.trim().toUpperCase() : String(it?.kode_produksi || '').trim().toUpperCase();
          if (code) queueMap[code] = typeof it === 'object' && it !== null ? it : { catatan_petunjuk: '' };
        });
      } else if (typeof parsed === 'object' && parsed !== null) {
        Object.entries(parsed).forEach(([rawCode, meta]) => {
          const code = rawCode.trim().toUpperCase();
          if (code) queueMap[code] = meta || {};
        });
      }
    }

    let notaMap: Record<string, any> = {};
    try {
      const rawNota = localStorage.getItem('wms_produksi_qty_nota_map_v1');
      if (rawNota) notaMap = JSON.parse(rawNota) || {};
    } catch {}

    const auditMap = getRecountAuditMap();

    // Agregasi baris penerimaan_produksi per kode_produksi (sama dengan AuditHitungUlangTab)
    const prodByCode = new Map<
      string,
      {
        totalAsli: number;
        hasRecountQty: boolean;
        sumFisikFromRows: number;
        notes?: string;
        hasMetaTrigger: boolean;
      }
    >();

    for (let i = 0; i < penerimaanItems.length; i++) {
      const it = penerimaanItems[i];
      const code = String(it?.kode_produksi || '')
        .replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '')
        .trim()
        .toUpperCase();
      if (!code) continue;

      let grp = prodByCode.get(code);
      if (!grp) {
        grp = { totalAsli: 0, hasRecountQty: false, sumFisikFromRows: 0, hasMetaTrigger: false };
        prodByCode.set(code, grp);
      }

      const qtyAsli = Number(it.qty) || 0;
      const hasRowRecount = it.recount_qty !== undefined && it.recount_qty !== null;
      grp.totalAsli += qtyAsli;
      if (hasRowRecount) {
        grp.hasRecountQty = true;
        grp.sumFisikFromRows += Number(it.recount_qty) || 0;
      } else {
        grp.sumFisikFromRows += qtyAsli;
      }
      if (!grp.notes && it.recount_notes) grp.notes = it.recount_notes;
      if (it.recount_notes || it.recount_round || hasRowRecount) {
        grp.hasMetaTrigger = true;
      }
    }

    const entriesMap = new Map<string, DashboardRecountQueueEntry>();
    const hasPenerimaanData = prodByCode.size > 0;

    if (hasPenerimaanData) {
      // Skenario normal (identik 100% dengan AuditHitungUlangTab): evaluasi kode yang ada di penerimaan_produksi
      prodByCode.forEach((pStats, code) => {
        const audit = auditMap[code];
        const qMeta = queueMap[code];
        const isExplicitlyQueued = Boolean(qMeta) || pStats.hasMetaTrigger;
        const isCounted =
          Boolean(audit && audit.total_fisik !== null && audit.total_fisik !== undefined) || pStats.hasRecountQty;

        if (!isExplicitlyQueued && !isCounted) return;

        let effectiveSelisih: number | null = null;
        let status: 'BELUM' | 'SELISIH' | 'MATCH' = 'BELUM';

        if (isCounted) {
          const totalFisik =
            audit && audit.total_fisik !== null && audit.total_fisik !== undefined
              ? Number(audit.total_fisik) || 0
              : pStats.sumFisikFromRows;

          const rawNota = qMeta?.qty_nota ?? notaMap[code]?.qty_nota ?? null;
          const hasNota = rawNota !== null && rawNota !== undefined && !isNaN(Number(rawNota));

          if (hasNota) {
            effectiveSelisih = totalFisik - Number(rawNota);
          } else if (audit && (audit.total_selisih !== undefined || audit.selisih !== undefined)) {
            effectiveSelisih = Number(audit.total_selisih ?? audit.selisih ?? 0);
          } else {
            effectiveSelisih = totalFisik - pStats.totalAsli;
          }

          status = effectiveSelisih !== 0 ? 'SELISIH' : 'MATCH';
        }

        entriesMap.set(code, {
          kode_produksi: code,
          catatan_petunjuk: qMeta?.catatan_petunjuk || pStats.notes || audit?.catatan || '',
          added_at: qMeta?.added_at,
          added_by: qMeta?.added_by,
          status,
          selisih: effectiveSelisih,
        });
      });
    } else {
      // Fallback sementara sebelum penerimaanItems selesai dimuat
      Object.entries(queueMap).forEach(([code, meta]) => {
        const audit = auditMap[code];
        const isCounted = Boolean(audit && audit.total_fisik !== null && audit.total_fisik !== undefined);
        const rawSelisih = isCounted ? Number(audit.total_selisih ?? audit.selisih ?? 0) : null;
        entriesMap.set(code, {
          kode_produksi: code,
          catatan_petunjuk: meta?.catatan_petunjuk || '',
          added_at: meta?.added_at,
          added_by: meta?.added_by,
          status: !isCounted ? 'BELUM' : rawSelisih !== 0 ? 'SELISIH' : 'MATCH',
          selisih: rawSelisih,
        });
      });
    }

    const priorityOrder = { BELUM: 0, SELISIH: 1, MATCH: 2 };
    return Array.from(entriesMap.values()).sort(
      (a, b) => priorityOrder[a.status] - priorityOrder[b.status] || a.kode_produksi.localeCompare(b.kode_produksi)
    );
  } catch {
    return [];
  }
}

function buildActivePickingSummary(items: PickingListItem[]): {
  activeTasks: DashboardPickingTaskSummary[];
  pendingCount: number;
  pickingCount: number;
  totalActiveItems: number;
} {
  let completedSet = new Set<string>();
  try {
    const raw = localStorage.getItem('wms_completed_sjs_set');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach((s) => completedSet.add(String(s || '').trim().toUpperCase()));
      }
    }
  } catch {}

  const grouped = new Map<
    string,
    {
      no_sj: string;
      invoice_picking?: string;
      tujuan: string;
      tanggal: string;
      created_at?: string;
      items: PickingListItem[];
      totalItems: number;
      totalQtyReq: number;
      totalQtyPicked: number;
    }
  >();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const sjKey = String(it?.no_sj || 'NO_SJ').trim().toUpperCase();
    if (!sjKey) continue;

    let grp = grouped.get(sjKey);
    if (!grp) {
      grp = {
        no_sj: sjKey,
        invoice_picking: it.invoice_picking,
        tujuan: it.tujuan || 'Marketplace / Store',
        tanggal: it.tanggal || (it.created_at ? String(it.created_at).slice(0, 10) : ''),
        created_at: it.created_at,
        items: [],
        totalItems: 0,
        totalQtyReq: 0,
        totalQtyPicked: 0,
      };
      grouped.set(sjKey, grp);
    }

    if (!grp.invoice_picking && it.invoice_picking) grp.invoice_picking = it.invoice_picking;

    if (it.is_unexpected || Number(it.qty_req) === 0) {
      grp.totalQtyPicked += Number(it.qty_picked) || 0;
    } else {
      grp.items.push(it);
      grp.totalItems += 1;
      grp.totalQtyReq += Number(it.qty_req) || 0;
      grp.totalQtyPicked += Number(it.qty_picked) || 0;
    }
  }

  const activeTasks: DashboardPickingTaskSummary[] = [];
  let pendingCount = 0;
  let pickingCount = 0;
  let totalActiveItems = 0;

  grouped.forEach((grp, sjKey) => {
    const isCompletedLocally = completedSet.has(sjKey);
    const isAllDone =
      isCompletedLocally ||
      (grp.items.length > 0 && grp.items.every((it) => String(it.status || '').toUpperCase().trim() === 'SELESAI'));
    if (isAllDone || grp.items.length === 0) return;

    const isStarted = grp.items.some(
      (it) => Number(it.qty_picked) > 0 || String(it.status || '').toUpperCase().trim() === 'SEDANG PICKING'
    );
    const status: 'PENDING' | 'SEDANG PICKING' = isStarted ? 'SEDANG PICKING' : 'PENDING';
    if (status === 'SEDANG PICKING') pickingCount++;
    else pendingCount++;
    totalActiveItems += grp.totalItems;

    activeTasks.push({
      no_sj: grp.no_sj,
      invoice_picking: grp.invoice_picking,
      tujuan: grp.tujuan,
      tanggal: grp.tanggal,
      created_at: grp.created_at,
      status,
      totalItems: grp.totalItems,
      totalQtyReq: grp.totalQtyReq,
      totalQtyPicked: grp.totalQtyPicked,
    });
  });

  // Sort SEDANG PICKING first, then newest tanggal/created_at via fast string compare
  activeTasks.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'SEDANG PICKING' ? -1 : 1;
    const da = a.created_at || a.tanggal || '';
    const db = b.created_at || b.tanggal || '';
    return db > da ? 1 : db < da ? -1 : a.no_sj.localeCompare(b.no_sj);
  });

  return { activeTasks, pendingCount, pickingCount, totalActiveItems };
}

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
        const parsed = JSON.parse(raw);
        return {
          lastUpdated: parsed.lastUpdated || 0,
          manualStats: parsed.manualStats || { ...EMPTY_ORDER_STATS },
          alterStats: parsed.alterStats || { ...EMPTY_ORDER_STATS },
          peminjamanAktif: parsed.peminjamanAktif || 0,
          returAktif: parsed.returAktif || 0,
          activeProjects: parsed.activeProjects || [],
          activeProjectsCount: parsed.activeProjectsCount || 0,
          upcomingAgenda: parsed.upcomingAgenda || [],
          upcomingAgendaCount: parsed.upcomingAgendaCount || 0,
          recentLogs: parsed.recentLogs || [],
        };
      }
    } catch {}
    return {
      lastUpdated: 0,
      manualStats: { ...EMPTY_ORDER_STATS },
      alterStats: { ...EMPTY_ORDER_STATS },
      peminjamanAktif: 0,
      returAktif: 0,
      activeProjects: [],
      activeProjectsCount: 0,
      upcomingAgenda: [],
      upcomingAgendaCount: 0,
      recentLogs: [],
    };
  });

  const [penerimaanItems, setPenerimaanItems] = useState<PenerimaanProduksiItem[]>(() =>
    getCachedPenerimaanProduksiSync()
  );
  const [recountQueueEntries, setRecountQueueEntries] = useState<DashboardRecountQueueEntry[]>(() =>
    buildSyncedRecountEntries(getCachedPenerimaanProduksiSync())
  );
  const [pickingItems, setPickingItems] = useState<PickingListItem[]>(() => {
    try {
      const raw = localStorage.getItem('wms_raw_picking_list_cache');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [stockRows, setStockRows] = useState<StockRealtimeItem[]>(() => getMemoryStokFisikCache() || []);
  const [rackConfig, setRackConfig] = useState<RackCapacityConfig>(() => getDefaultRackCapacityConfig());
  const [isAnomalyModalOpen, setIsAnomalyModalOpen] = useState(false);

  const [produksiDraft, setProduksiDraft] = useState(() => getActiveProduksiInputDraftSummary());
  const [recountDraft, setRecountDraft] = useState(() => getActiveRecountDraftSummary());
  const [offlineProduksiCount, setOfflineProduksiCount] = useState<number>(() =>
    getPendingOfflineProduksiCount()
  );
  const [offlineRecountCount, setOfflineRecountCount] = useState<number>(() =>
    getPendingRecountOutboxCount()
  );

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [timeAgoStr, setTimeAgoStr] = useState<string>('');
  const [copiedLogInvoice, setCopiedLogInvoice] = useState<string | null>(null);

  const handleCopyLogInvoice = useCallback(
    (inv?: string) => {
      if (!inv || inv === '-') return;
      try {
        navigator.clipboard.writeText(inv);
        setCopiedLogInvoice(inv);
        setTimeout(() => setCopiedLogInvoice(null), 1800);
        if (onShowToast) onShowToast(`Nomor invoice ${inv} berhasil disalin.`, 'info');
      } catch {}
    },
    [onShowToast]
  );

  const refreshLocalDraftAndQueueState = useCallback(
    (overridePenerimaan?: PenerimaanProduksiItem[]) => {
      const targetItems = overridePenerimaan || getCachedPenerimaanProduksiSync();
      if (overridePenerimaan) setPenerimaanItems(overridePenerimaan);
      setRecountQueueEntries(buildSyncedRecountEntries(targetItems));
      setProduksiDraft(getActiveProduksiInputDraftSummary());
      setRecountDraft(getActiveRecountDraftSummary());
      setOfflineProduksiCount(getPendingOfflineProduksiCount());
      setOfflineRecountCount(getPendingRecountOutboxCount());
    },
    []
  );

  // Hydrate stockRows from IndexedDB on cold memory cache so capacity & anomaly cards appear instantly
  useEffect(() => {
    let active = true;
    if (stockRows.length === 0) {
      getAllInventoryStocksFromLocalDb()
        .then((localStocks) => {
          if (active && localStocks && localStocks.length > 0) {
            setStockRows(localStocks);
          }
        })
        .catch(() => {});
    }
    if (metrics.lastUpdated && Date.now() - metrics.lastUpdated <= CACHE_TTL_MS) {
      fetchRackCapacityConfig()
        .then((cfg) => {
          if (active && cfg) setRackConfig(cfg);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    refreshLocalDraftAndQueueState(penerimaanItems);
    const handleSyncEvents = () => refreshLocalDraftAndQueueState();
    const handleRecountUpdated = () => {
      fetchRecountAuditMapFromCloud()
        .catch(() => {})
        .finally(() => refreshLocalDraftAndQueueState());
    };
    window.addEventListener('storage', handleSyncEvents);
    window.addEventListener('wms_produksi_draft_updated', handleSyncEvents);
    window.addEventListener('wms_recount_draft_updated', handleSyncEvents);
    window.addEventListener('wms_recount_outbox_updated', handleSyncEvents);
    window.addEventListener('wms_recount_queue_updated', handleSyncEvents);
    window.addEventListener('wms_recount_audit_updated', handleRecountUpdated);
    return () => {
      window.removeEventListener('storage', handleSyncEvents);
      window.removeEventListener('wms_produksi_draft_updated', handleSyncEvents);
      window.removeEventListener('wms_recount_draft_updated', handleSyncEvents);
      window.removeEventListener('wms_recount_outbox_updated', handleSyncEvents);
      window.removeEventListener('wms_recount_queue_updated', handleSyncEvents);
      window.removeEventListener('wms_recount_audit_updated', handleRecountUpdated);
    };
  }, [refreshLocalDraftAndQueueState]);

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

  // Fetch metrics & operational queues using cached/lean queries
  const fetchLeanMetrics = useCallback(
    async (isManualTrigger = false) => {
      setIsRefreshing(true);
      try {
        const sb = getSupabaseClient();
        const todayYmd = new Date().toISOString().split('T')[0];

        const [
          manualOrdersRes,
          peminjamanRes,
          returRes,
          projectsRes,
          agendaRes,
          recentLogsRes,
          cloudRecountQueueRes,
          cloudAuditMapRes,
          penerimaanRes,
          pickingListRes,
          rackCfgRes,
          stokFisikRes,
        ] = await Promise.allSettled([
          fetchManualShipments(),
          sb.from('peminjaman').select('id', { count: 'exact', head: true }).eq('status', 'dipinjam'),
          sb.from('retur_barang').select('id', { count: 'exact', head: true }).neq('status', 'selesai'),
          sb
            .from('wms_projects')
            .select('id, title, status, priority, progress, deadline, pic', { count: 'exact' })
            .neq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(4),
          sb
            .from('wms_agenda')
            .select('id, title, start_date, start_time, end_date, end_time, category, pic', { count: 'exact' })
            .gte('start_date', todayYmd)
            .order('start_date', { ascending: true })
            .limit(4),
          sb
            .from('log_produk')
            .select('id, type, invoice, sku, nama_produk, size, area, lokasi, qty, operator, keterangan, created_at')
            .order('created_at', { ascending: false })
            .limit(12),
          fetchPenerimaanRecountQueueFromSupabase(),
          fetchRecountAuditMapFromCloud(),
          fetchPenerimaanProduksiFromSupabase({ forceRefresh: isManualTrigger }),
          fetchPickingListFromSupabase(isManualTrigger),
          fetchRackCapacityConfig(),
          fetchSupabaseStokFisikDirect(isManualTrigger),
        ]);

        if (cloudRecountQueueRes.status === 'fulfilled' && cloudRecountQueueRes.value) {
          try {
            localStorage.setItem('wms_recount_selected_queue', JSON.stringify(cloudRecountQueueRes.value));
          } catch {}
        }
        void cloudAuditMapRes;

        const latestPenerimaan =
          penerimaanRes.status === 'fulfilled' && Array.isArray(penerimaanRes.value)
            ? penerimaanRes.value
            : penerimaanItems;
        refreshLocalDraftAndQueueState(latestPenerimaan);

        if (pickingListRes.status === 'fulfilled' && Array.isArray(pickingListRes.value)) {
          setPickingItems(pickingListRes.value);
        }
        if (rackCfgRes.status === 'fulfilled' && rackCfgRes.value) {
          setRackConfig(rackCfgRes.value);
        }
        if (stokFisikRes.status === 'fulfilled' && Array.isArray(stokFisikRes.value) && stokFisikRes.value.length > 0) {
          setStockRows(stokFisikRes.value);
        }

        const orderBreakdowns =
          manualOrdersRes.status === 'fulfilled' && Array.isArray(manualOrdersRes.value)
            ? computeOrderBreakdowns(manualOrdersRes.value, session)
            : { manualStats: metrics.manualStats, alterStats: metrics.alterStats };

        const newMetrics: DashboardMetrics = {
          lastUpdated: Date.now(),
          manualStats: orderBreakdowns.manualStats,
          alterStats: orderBreakdowns.alterStats,
          peminjamanAktif: peminjamanRes.status === 'fulfilled' ? peminjamanRes.value.count ?? 0 : metrics.peminjamanAktif,
          returAktif: returRes.status === 'fulfilled' ? returRes.value.count ?? 0 : metrics.returAktif,
          activeProjects:
            projectsRes.status === 'fulfilled' && projectsRes.value.data
              ? (projectsRes.value.data as ProjectItem[])
              : metrics.activeProjects,
          activeProjectsCount:
            projectsRes.status === 'fulfilled'
              ? projectsRes.value.count ?? projectsRes.value.data?.length ?? 0
              : metrics.activeProjectsCount,
          upcomingAgenda:
            agendaRes.status === 'fulfilled' && agendaRes.value.data
              ? (agendaRes.value.data as AgendaEvent[])
              : metrics.upcomingAgenda,
          upcomingAgendaCount:
            agendaRes.status === 'fulfilled'
              ? agendaRes.value.count ?? agendaRes.value.data?.length ?? 0
              : metrics.upcomingAgendaCount,
          recentLogs:
            recentLogsRes.status === 'fulfilled' && recentLogsRes.value.data
              ? (recentLogsRes.value.data as RecentLogItem[])
              : metrics.recentLogs,
        };

        setMetrics(newMetrics);
        try {
          localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(newMetrics));
        } catch {}

        if (isManualTrigger && onShowToast) {
          onShowToast('Seluruh ringkasan Dashboard berhasil diperbarui.', 'info');
        }
      } catch (err: any) {
        console.warn('[Dashboard] Gagal memperbarui data:', err?.message || err);
        if (isManualTrigger && onShowToast) {
          onShowToast('Gagal terhubung ke database. Menggunakan data cache.', 'warning');
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [metrics, penerimaanItems, onShowToast, refreshLocalDraftAndQueueState, session]
  );

  // Initial mount: fetch full lean metrics when stale, or still refresh volatile operational queues (with 90s cooldown)
  useEffect(() => {
    const age = Date.now() - (metrics.lastUpdated || 0);
    if (!metrics.lastUpdated || age > CACHE_TTL_MS) {
      try { sessionStorage.setItem('wms_dashboard_last_queue_sync_at', String(Date.now())); } catch {}
      fetchLeanMetrics(false);
    } else {
      const lastQueueSync = Number((() => { try { return sessionStorage.getItem('wms_dashboard_last_queue_sync_at') || '0'; } catch { return '0'; } })());
      if (lastQueueSync > 0 && Date.now() - lastQueueSync < 90 * 1000) {
        return;
      }
      try { sessionStorage.setItem('wms_dashboard_last_queue_sync_at', String(Date.now())); } catch {}
      // Refresh ringan antrean operasional aktif agar selalu sinkron meski cache KPI masih segar
      Promise.allSettled([
        fetchPenerimaanRecountQueueFromSupabase(),
        fetchRecountAuditMapFromCloud(),
        fetchPenerimaanProduksiFromSupabase(),
        fetchPickingListFromSupabase(false),
        fetchManualShipments(),
        fetchSupabaseStokFisikDirect(false),
      ]).then(([qRes, _aRes, pRes, pickRes, ordersRes, stockRes]) => {
        if (qRes.status === 'fulfilled' && qRes.value && Object.keys(qRes.value).length > 0) {
          try {
            localStorage.setItem('wms_recount_selected_queue', JSON.stringify(qRes.value));
          } catch {}
        }
        const latestP = pRes.status === 'fulfilled' && Array.isArray(pRes.value) ? pRes.value : undefined;
        refreshLocalDraftAndQueueState(latestP);
        if (pickRes.status === 'fulfilled' && Array.isArray(pickRes.value)) {
          setPickingItems(pickRes.value);
        }
        if (stockRes.status === 'fulfilled' && Array.isArray(stockRes.value) && stockRes.value.length > 0) {
          setStockRows(stockRes.value);
        }
        if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
          const bd = computeOrderBreakdowns(ordersRes.value, session);
          setMetrics((prev) => ({ ...prev, ...bd }));
        }
      });
    }
  }, []);

  // =========================================================================
  // COMPUTED SUMMARIES
  // =========================================================================

  // 1. Recount Queue Split (Identik dengan AuditHitungUlangTab: BELUM vs SELISIH vs MATCH)
  const belumRecountEntries = useMemo(
    () => recountQueueEntries.filter((it) => it.status === 'BELUM'),
    [recountQueueEntries]
  );
  const selisihRecountEntries = useMemo(
    () => recountQueueEntries.filter((it) => it.status === 'SELISIH'),
    [recountQueueEntries]
  );
  const actionableRecountEntries = useMemo(
    () => recountQueueEntries.filter((it) => it.status === 'BELUM' || it.status === 'SELISIH'),
    [recountQueueEntries]
  );

  // 2. Picking Queue Summary
  const pickingSummary = useMemo(() => buildActivePickingSummary(pickingItems), [pickingItems]);

  // 3. Warehouse & Blok F Channel Capacities (Warehouse Global, Shopee, TikTok, Studio, IG Live)
  const enrichedCatalogMap = useMemo(() => buildEnrichedCatalogMap(productCatalog), [productCatalog]);

  const capacitySummary = useMemo(() => {
    const slots: ComputedRackSlot[] = computeAllRackSlots(rackConfig, stockRows, [], enrichedCatalogMap);

    const rak = { filled: 0, cap: 0, overload: 0, racks: 0 };
    const koli = { filled: 0, cap: 0, overload: 0, racks: 0 };
    const shopee = { filled: 0, cap: 0 };
    const tiktok = { filled: 0, cap: 0 };
    const studio = { filled: 0, cap: 0 };
    const iglive = { filled: 0, cap: 0 };

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const a = (s.area || '').toUpperCase();
      const l = (s.lokasi || '').toUpperCase();

      const isRak = a === 'WAREHOUSE' || /^[ABCDE]-?\d+/i.test(l);
      const isKoli =
        !isRak &&
        (a === 'KOLIAN' ||
          a === 'KOLI' ||
          a === 'TRANSIT' ||
          a === 'PERBAIKAN' ||
          /^[RVZ]-?\d+/i.test(l) ||
          /^X-?\d*/i.test(l) ||
          l === 'X' ||
          l === 'TRANSIT' ||
          /^(CC|PMK|DF)-?\d*/i.test(l));

      if (isRak) {
        rak.racks++;
        rak.filled += s.currentQty;
        rak.cap += s.maxCapacity;
        if (s.status === 'OVERLOAD') rak.overload++;
      } else if (isKoli) {
        koli.racks++;
        koli.filled += s.currentQty;
        koli.cap += s.maxCapacity;
        if (s.status === 'OVERLOAD') koli.overload++;
      } else if (l === 'SHOPEE') {
        shopee.filled += s.currentQty;
        shopee.cap += s.maxCapacity;
      } else if (l === 'TIKTOK') {
        tiktok.filled += s.currentQty;
        tiktok.cap += s.maxCapacity;
      } else if (l === 'STUDIO') {
        studio.filled += s.currentQty;
        studio.cap += s.maxCapacity;
      } else if (l === 'IGLIVE' || l === 'IG LIVE') {
        iglive.filled += s.currentQty;
        iglive.cap += s.maxCapacity;
      }
    }

    const whFilled = rak.filled + koli.filled;
    const whCap = rak.cap + koli.cap;
    const pct = (f: number, c: number) => (c > 0 ? Math.round((f / c) * 100) : 0);

    return {
      hasStockLoaded: stockRows.length > 0,
      warehouse: {
        filled: whFilled,
        cap: whCap,
        percent: pct(whFilled, whCap),
        overload: rak.overload + koli.overload,
        rakFilled: rak.filled,
        koliFilled: koli.filled,
      },
      shopee: { filled: shopee.filled, cap: shopee.cap || 400, percent: pct(shopee.filled, shopee.cap || 400) },
      tiktok: { filled: tiktok.filled, cap: tiktok.cap || 250, percent: pct(tiktok.filled, tiktok.cap || 250) },
      studio: { filled: studio.filled, cap: studio.cap || 500, percent: pct(studio.filled, studio.cap || 500) },
      iglive: { filled: iglive.filled, cap: iglive.cap || 250, percent: pct(iglive.filled, iglive.cap || 250) },
    };
  }, [rackConfig, stockRows, enrichedCatalogMap]);

  // 4. Scan Data Anomalies (Physical Stock + Recent Scan Logs)
  const anomalySummary = useMemo(() => {
    const items: AnomalyItem[] = stockRows.length > 0 ? scanAnomalies(productCatalog, stockRows) : [];
    let invalidLocation = 0;
    let negativeStock = 0;
    let skuCorrupted = 0;
    let skuNotInMaster = 0;
    let mismatchMaster = 0;

    for (let i = 0; i < items.length; i++) {
      const cats = items[i].categories;
      if (cats.includes('INVALID_LOCATION')) invalidLocation++;
      if (cats.includes('NEGATIVE_STOCK')) negativeStock++;
      if (cats.includes('SKU_CORRUPTED')) skuCorrupted++;
      if (cats.includes('SKU_NOT_IN_MASTER')) skuNotInMaster++;
      if (cats.includes('MISMATCH_MASTER_DATA')) mismatchMaster++;
    }

    // Cek juga log mutasi scan terbaru apakah ada lokasi Anomali / SKU rusak
    const recentLogAnomalies = (metrics.recentLogs || []).filter((log) => {
      const area = getAreaFromLokasi(log.lokasi || '');
      return area === 'Anomali' || isCorruptedSku(log.sku);
    });

    return {
      total: items.length,
      items,
      invalidLocation,
      negativeStock,
      skuIssue: skuCorrupted + skuNotInMaster,
      mismatchMaster,
      recentLogAnomalies,
    };
  }, [productCatalog, stockRows, metrics.recentLogs]);

  const totalMasterSkus = useMemo(() => productCatalog?.length || 0, [productCatalog]);
  const totalLocations = useMemo(() => currentLocations?.length || 0, [currentLocations]);

  // O(1) Master Produk & Stok Fisik lookup untuk tabel Mutasi Stok Terkini (seragam Log Produk)
  const dashboardCatalogMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    for (let i = 0; i < productCatalog.length; i++) {
      const p = productCatalog[i];
      if (p?.k) map.set(p.k.toUpperCase().trim(), p);
    }
    return map;
  }, [productCatalog]);

  const stockBySkuLocMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < stockRows.length; i++) {
      const s = stockRows[i];
      const skuKey = (s.sku || '').toUpperCase().trim();
      const locKey = (s.lokasi || 'Warehouse').toUpperCase().trim();
      const key = `${skuKey}__${locKey}`;
      map.set(key, (map.get(key) || 0) + (Number(s.sisa_stok) || 0));
    }
    return map;
  }, [stockRows]);

  const recentDisplayLogs = useMemo(() => {
    return (metrics.recentLogs || [])
      .filter((l) => l && !String(l.type || '').startsWith('QC_'))
      .slice(0, 10);
  }, [metrics.recentLogs]);

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

  const operatorName = session?.name || session?.username || 'Operator';
  const operatorRole = session?.role || 'Staff Gudang';

  const handleAction = (page: string, subTab?: string) => {
    if (onNavigate) {
      onNavigate(page, subTab);
    }
  };

  const handleNavigateManualOrderStage = (
    filterOrderType: 'manual_shipment' | 'alteration_repair',
    stageTab: 'baru' | 'diproses' | 'selesai' | 'semua'
  ) => {
    if (typeof window !== 'undefined') {
      const target = {
        tab: 'manual_shipment',
        subTab: 'manual_shipment',
        manualSubTab: 'rekap',
        stageTab,
        filterOrderType,
      };
      (window as any).__wms_pending_pesanan_target = target;
      window.dispatchEvent(new CustomEvent('wms_open_pesanan_target', { detail: target }));
    }
    handleAction('pesanan_saya');
  };

  const getProgressColor = (pct: number) => {
    if (pct > 100) return 'bg-rose-600 dark:bg-rose-500';
    if (pct >= 85) return 'bg-amber-500 dark:bg-amber-400';
    return 'bg-emerald-600 dark:bg-emerald-500';
  };

  const getCapacityBadgeClass = (pct: number) => {
    if (pct > 100) return 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    if (pct >= 85) return 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    return 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  };

  const totalPendingOrders = metrics.manualStats.baru + metrics.alterStats.baru;
  const totalProcessingOrders = metrics.manualStats.diproses + metrics.alterStats.diproses;

  return (
    <div className="w-full max-w-full px-2 sm:px-4 lg:px-6 py-2 sm:py-4 space-y-3 sm:space-y-4 pb-24">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:p-4 lg:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <h1 className="text-base sm:text-xl font-black text-slate-900 dark:text-white tracking-tight">
              Dashboard Operasional
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
              Ringkasan Operasional
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
            Halo, <span className="font-bold text-slate-700 dark:text-slate-200">{operatorName}</span> ({operatorRole}) · {formattedToday}
          </p>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => fetchLeanMetrics(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 active:scale-98 transition-all cursor-pointer shadow-2xs disabled:opacity-60"
            title="Segarkan seluruh metrik Dashboard"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
            <span className="hidden sm:inline">{isRefreshing ? 'Memperbarui...' : 'Segarkan'}</span>
            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 sm:pl-1.5 sm:border-l sm:border-slate-200 sm:dark:border-slate-700">
              {timeAgoStr}
            </span>
          </button>
        </div>
      </div>

      {/* 1B. Alat Bantu Kerja (Shortcut Operasional 1 Klik) */}
      <DashboardWorkToolsGrid
        session={session}
        onNavigate={handleAction}
        onOpenAnomalyModal={() => setIsAnomalyModalOpen(true)}
        activePickingCount={pickingSummary.activeTasks.length}
        recountPendingCount={belumRecountEntries.length}
        anomalyTotalCount={anomalySummary.total}
        hasProduksiDraft={produksiDraft.hasDraft}
      />

      {/* 2. Top 4 Master KPI Cards (Mobile: 2x2 Grid, Desktop: 4 Columns) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {/* KPI 1: Manual & Alter Aktif */}
        <div
          onClick={() => handleNavigateManualOrderStage('manual_shipment', 'baru')}
          className="group bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-amber-300 dark:hover:border-amber-700/60 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
                Manual &amp; Alter Baru
              </p>
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-slate-900 dark:text-white mt-1">
                {totalPendingOrders}
              </h3>
            </div>
            <div className="p-2 rounded-lg sm:rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/40 shrink-0">
              <Package className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] sm:text-xs">
            <span className="text-slate-500 dark:text-slate-400 truncate">
              <b className="font-mono text-slate-700 dark:text-slate-200">{totalProcessingOrders}</b> diproses
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
              <span className="hidden sm:inline">Pesanan</span> <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 2: Antrean Tugas Picking */}
        <div
          onClick={() => handleAction('loading_dock', 'picking_tasks')}
          className="group bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700/60 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
                Antrean Picking
              </p>
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-slate-900 dark:text-white mt-1">
                {pickingSummary.activeTasks.length} <span className="text-[10px] sm:text-xs font-sans font-semibold text-slate-500">SJ</span>
              </h3>
            </div>
            <div className="p-2 rounded-lg sm:rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40 shrink-0">
              <Truck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] sm:text-xs">
            <span className="text-slate-500 dark:text-slate-400 truncate">
              <b className="font-mono text-slate-700 dark:text-slate-200">{pickingSummary.pendingCount}</b> tunggu ·{' '}
              <b className="font-mono text-indigo-600 dark:text-indigo-400">{pickingSummary.pickingCount}</b> jalan
            </span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
              <span className="hidden sm:inline">Picking</span> <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 3: Kapasitas Warehouse Global */}
        <div
          onClick={() => handleAction('inventory', 'capacity')}
          className="group bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
                Kapasitas Gudang
              </p>
              <h3 className="text-xl sm:text-2xl lg:text-3xl font-black font-mono text-slate-900 dark:text-white mt-1">
                {capacitySummary.hasStockLoaded ? `${capacitySummary.warehouse.percent}%` : '—'}
              </h3>
            </div>
            <div className="p-2 rounded-lg sm:rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/40 shrink-0">
              <Warehouse className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] sm:text-xs">
            <span className="text-slate-500 dark:text-slate-400 truncate font-mono">
              {capacitySummary.hasStockLoaded
                ? `${capacitySummary.warehouse.filled.toLocaleString('id-ID')}/${capacitySummary.warehouse.cap.toLocaleString('id-ID')} pcs`
                : `${totalMasterSkus.toLocaleString('id-ID')} SKU · ${totalLocations} rak`}
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
              <span className="hidden sm:inline">Denah</span> <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 4: Anomali Data Scan & Hitung Ulang */}
        <div
          onClick={() => setIsAnomalyModalOpen(true)}
          className={`group bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl sm:rounded-2xl border shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between ${
            anomalySummary.total > 0
              ? 'border-rose-200 dark:border-rose-900/60 hover:border-rose-400'
              : 'border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">
                Anomali Data Scan
              </p>
              <h3
                className={`text-xl sm:text-2xl lg:text-3xl font-black font-mono mt-1 ${
                  anomalySummary.total > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {capacitySummary.hasStockLoaded ? anomalySummary.total : '—'}
              </h3>
            </div>
            <div
              className={`p-2 rounded-lg sm:rounded-xl border shrink-0 ${
                anomalySummary.total > 0
                  ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-200/50 dark:border-rose-800/40'
                  : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800/40'
              }`}
            >
              {anomalySummary.total > 0 ? (
                <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px] sm:text-xs">
            <span className="text-slate-500 dark:text-slate-400 truncate">
              {anomalySummary.total > 0
                ? `${anomalySummary.invalidLocation} lok · ${anomalySummary.negativeStock} minus`
                : 'Stok & lokasi scan bersih'}
            </span>
            <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform shrink-0">
              <span className="hidden sm:inline">Inspeksi</span> <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* 3. Kapasitas Gudang: Warehouse Global + Shopee + TikTok + Studio + IG Live */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Boxes className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                Kapasitas Penyimpanan Gudang &amp; Channel
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Tingkat keterisian area gudang utama (Rak A–E + Koli) dan area channel
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleAction('inventory', 'capacity')}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
          >
            <span>Detail Kapasitas Rak</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {/* Card 1: Warehouse Global (span 2 on mobile so no orphan card) */}
          <div
            onClick={() => handleAction('inventory', 'capacity')}
            className="col-span-2 sm:col-span-1 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer space-y-2"
          >
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <Warehouse className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">Warehouse Global</span>
              </div>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-extrabold border shrink-0 ${getCapacityBadgeClass(capacitySummary.warehouse.percent)}`}>
                {capacitySummary.hasStockLoaded ? `${capacitySummary.warehouse.percent}%` : '—'}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(capacitySummary.warehouse.percent)}`}
                style={{ width: `${Math.min(100, Math.max(0, capacitySummary.warehouse.percent))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
              <span>
                <b className="text-slate-800 dark:text-slate-200">{capacitySummary.warehouse.filled.toLocaleString('id-ID')}</b> / {capacitySummary.warehouse.cap.toLocaleString('id-ID')} pcs
              </span>
              {capacitySummary.warehouse.overload > 0 && (
                <span className="text-rose-600 dark:text-rose-400 font-bold">
                  {capacitySummary.warehouse.overload} penuh
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
              Rak A–E: <b className="font-mono">{capacitySummary.warehouse.rakFilled.toLocaleString('id-ID')}</b> · Koli: <b className="font-mono">{capacitySummary.warehouse.koliFilled.toLocaleString('id-ID')}</b>
            </p>
          </div>

          {/* Card 2..5: Shopee, TikTok, Studio, IG Live */}
          {[
            {
              key: 'shopee',
              label: 'Shopee',
              sub: 'Area Blok F',
              icon: ShoppingBag,
              iconClass: 'text-orange-600 dark:text-orange-400',
              data: capacitySummary.shopee,
            },
            {
              key: 'tiktok',
              label: 'TikTok',
              sub: 'Area Blok F',
              icon: Video,
              iconClass: 'text-purple-600 dark:text-purple-400',
              data: capacitySummary.tiktok,
            },
            {
              key: 'studio',
              label: 'Studio',
              sub: 'Display Studio',
              icon: Boxes,
              iconClass: 'text-cyan-600 dark:text-cyan-400',
              data: capacitySummary.studio,
            },
            {
              key: 'iglive',
              label: 'IG Live',
              sub: 'Instagram Live',
              icon: Radio,
              iconClass: 'text-rose-600 dark:text-rose-400',
              data: capacitySummary.iglive,
            },
          ].map((ch) => (
            <div
              key={ch.key}
              onClick={() => handleAction('inventory', 'capacity')}
              className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer space-y-2"
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <ch.icon className={`w-3.5 h-3.5 shrink-0 ${ch.iconClass}`} />
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">{ch.label}</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-extrabold border shrink-0 ${getCapacityBadgeClass(ch.data.percent)}`}>
                  {capacitySummary.hasStockLoaded ? `${ch.data.percent}%` : '—'}
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(ch.data.percent)}`}
                  style={{ width: `${Math.min(100, Math.max(0, ch.data.percent))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                <span>
                  <b className="text-slate-800 dark:text-slate-200">{ch.data.filled.toLocaleString('id-ID')}</b> / {ch.data.cap.toLocaleString('id-ID')} pcs
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{ch.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Status Pesanan Store (Manual Shipment & Alteration) + Deteksi Anomali Data Scan */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        {/* Left (7 cols): Manual Shipment & Alteration Breakdown (Baru, Diproses, Selesai) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 flex flex-col justify-between space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                <Store className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                  Status Manual Shipment &amp; Alteration
                </h2>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Ringkasan status pemenuhan pesanan cabang dan perbaikan
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleNavigateManualOrderStage('manual_shipment', 'semua')}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
            >
              <span>Buka Rekap Store</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Sub-Card: Manual Shipment */}
            <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Manual Shipment
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                  Total {metrics.manualStats.total}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNavigateManualOrderStage('manual_shipment', 'baru')}
                  className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 hover:border-amber-400 text-left transition-all cursor-pointer"
                >
                  <span className="block text-[9.5px] font-bold uppercase text-amber-800 dark:text-amber-300">Baru</span>
                  <span className="block text-base sm:text-lg font-black font-mono text-amber-700 dark:text-amber-200 mt-0.5">
                    {metrics.manualStats.baru}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateManualOrderStage('manual_shipment', 'diproses')}
                  className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/70 hover:border-blue-400 text-left transition-all cursor-pointer"
                >
                  <span className="block text-[9.5px] font-bold uppercase text-blue-800 dark:text-blue-300">Diproses</span>
                  <span className="block text-base sm:text-lg font-black font-mono text-blue-700 dark:text-blue-200 mt-0.5">
                    {metrics.manualStats.diproses}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateManualOrderStage('manual_shipment', 'selesai')}
                  className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 hover:border-emerald-400 text-left transition-all cursor-pointer"
                >
                  <span className="block text-[9.5px] font-bold uppercase text-emerald-800 dark:text-emerald-300">Selesai</span>
                  <span className="block text-base sm:text-lg font-black font-mono text-emerald-700 dark:text-emerald-200 mt-0.5">
                    {metrics.manualStats.selesai}
                  </span>
                </button>
              </div>
            </div>

            {/* Sub-Card: Alteration & Repair */}
            <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  Alteration &amp; Repair
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                  Total {metrics.alterStats.total}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleNavigateManualOrderStage('alteration_repair', 'baru')}
                  className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 hover:border-amber-400 text-left transition-all cursor-pointer"
                >
                  <span className="block text-[9.5px] font-bold uppercase text-amber-800 dark:text-amber-300">Baru</span>
                  <span className="block text-base sm:text-lg font-black font-mono text-amber-700 dark:text-amber-200 mt-0.5">
                    {metrics.alterStats.baru}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateManualOrderStage('alteration_repair', 'diproses')}
                  className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800/70 hover:border-purple-400 text-left transition-all cursor-pointer"
                >
                  <span className="block text-[9.5px] font-bold uppercase text-purple-800 dark:text-purple-300">Diproses</span>
                  <span className="block text-base sm:text-lg font-black font-mono text-purple-700 dark:text-purple-200 mt-0.5">
                    {metrics.alterStats.diproses}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateManualOrderStage('alteration_repair', 'selesai')}
                  className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 hover:border-emerald-400 text-left transition-all cursor-pointer"
                >
                  <span className="block text-[9.5px] font-bold uppercase text-emerald-800 dark:text-emerald-300">Selesai</span>
                  <span className="block text-base sm:text-lg font-black font-mono text-emerald-700 dark:text-emerald-200 mt-0.5">
                    {metrics.alterStats.selesai}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right (5 cols): Informasi Anomali Data Scan & Stok Rak */}
        <div
          className={`lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border shadow-2xs p-3.5 sm:p-5 flex flex-col justify-between space-y-3 ${
            anomalySummary.total > 0 || anomalySummary.recentLogAnomalies.length > 0
              ? 'border-rose-200 dark:border-rose-900/60'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`p-1.5 rounded-lg ${
                    anomalySummary.total > 0
                      ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
                      : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                      Status Integritas Data Stok
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold border ${
                        anomalySummary.total > 0
                          ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      }`}
                    >
                      {capacitySummary.hasStockLoaded ? `${anomalySummary.total} Temuan` : 'Memindai...'}
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Pemeriksaan lokasi rak, saldo stok fisik, dan kesesuaian data master
                  </p>
                </div>
              </div>
            </div>

            {anomalySummary.total > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <div className="p-2 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-800/50">
                    <span className="block text-[9.5px] font-bold text-rose-700 dark:text-rose-300">Lokasi Anomali</span>
                    <span className="font-mono font-black text-sm text-rose-800 dark:text-rose-200">
                      {anomalySummary.invalidLocation}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50">
                    <span className="block text-[9.5px] font-bold text-amber-800 dark:text-amber-300">Stok Minus</span>
                    <span className="font-mono font-black text-sm text-amber-800 dark:text-amber-200">
                      {anomalySummary.negativeStock}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70">
                    <span className="block text-[9.5px] font-bold text-slate-600 dark:text-slate-300">SKU Anomali</span>
                    <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                      {anomalySummary.skuIssue}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70">
                    <span className="block text-[9.5px] font-bold text-slate-600 dark:text-slate-300">Mismatch</span>
                    <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                      {anomalySummary.mismatchMaster}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-[112px] overflow-y-auto pr-1">
                  {anomalySummary.items.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setIsAnomalyModalOpen(true)}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/70 hover:border-rose-300 cursor-pointer text-[11px]"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-slate-900 dark:text-white truncate block">
                          {item.sku}
                        </span>
                        <span className="text-[10px] text-rose-600 dark:text-rose-400 truncate block">
                          {item.reasons[0]}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-4 px-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    Tidak ada anomali data scan aktif
                  </p>
                  <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                    Semua lokasi rak fisik, stok, dan SKU sesuai Master Produk.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {anomalySummary.recentLogAnomalies.length > 0
                ? `${anomalySummary.recentLogAnomalies.length} mutasi terbaru berlokasi non-rak`
                : 'Pemeriksaan data stok & mutasi'}
            </span>
            <button
              type="button"
              onClick={() => setIsAnomalyModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
            >
              <span>Rincian Data</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Antrean Operasional Live (2 Kolom Seimbang: Antrean Tugas Picking & Antrean Hitung Ulang) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        {/* Left (6 cols): Antrean Tugas Picking Live */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <Truck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                      Antrean Tugas Picking
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold border ${
                        pickingSummary.activeTasks.length > 0
                          ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      }`}
                    >
                      {pickingSummary.activeTasks.length} SJ Aktif
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Daftar Surat Jalan Marketplace / SPS yang menunggu atau sedang dipicking
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleAction('loading_dock', 'picking_tasks')}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
              >
                <span>Buka Tugas Picking</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {pickingSummary.activeTasks.length > 0 ? (
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {pickingSummary.activeTasks.slice(0, 6).map((task) => {
                  const progressPct =
                    task.totalQtyReq > 0 ? Math.min(100, Math.round((task.totalQtyPicked / task.totalQtyReq) * 100)) : 0;
                  const isRunning = task.status === 'SEDANG PICKING';
                  return (
                    <div
                      key={task.no_sj}
                      onClick={() => handleAction('loading_dock', 'picking_tasks')}
                      className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer space-y-1.5 group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                          <span className="font-mono font-black text-xs text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                            {task.no_sj}
                          </span>
                          {task.invoice_picking && (
                            <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-mono font-bold bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {task.invoice_picking}
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border ${
                              isRunning
                                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            {isRunning ? 'SEDANG PICKING' : 'PENDING'}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 shrink-0">
                          {task.totalQtyPicked}/{task.totalQtyReq} pcs
                        </span>
                      </div>

                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            isRunning ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="truncate">{task.tujuan}</span>
                        <span className="font-mono shrink-0">{task.totalItems} SKU</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 px-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-1">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tidak ada antrean Tugas Picking aktif
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Semua Surat Jalan picking telah selesai diproses.
                </p>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              Total item aktif: <b className="font-mono text-slate-700 dark:text-slate-200">{pickingSummary.totalActiveItems}</b> baris SKU
            </span>
            <span className="font-mono text-[10px]">
              {pickingSummary.pendingCount} pending · {pickingSummary.pickingCount} berjalan
            </span>
          </div>
        </div>

        {/* Right (6 cols): Antrean Kode Butuh Hitung Ulang (Tersinkron 100% dengan AuditHitungUlangTab) */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                  <Scale className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                      Antrean Kode Butuh Hitung Ulang
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold border ${
                        belumRecountEntries.length > 0
                          ? 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      }`}
                    >
                      {belumRecountEntries.length} Belum Hitung
                    </span>
                    {selisihRecountEntries.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold border bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800">
                        {selisihRecountEntries.length} Ada Selisih
                      </span>
                    )}
                    {recountDraft.hasActiveWorkspaceDraft && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        Draft: {recountDraft.selectedCode || 'Aktif'} ({recountDraft.filledVariantsCount})
                      </span>
                    )}
                    {offlineRecountCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300">
                        {offlineRecountCount} Outbox
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Daftar kode produksi yang memerlukan verifikasi fisik
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleAction('popup_hitung_ulang')}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Buka Hitung Ulang</span>
              </button>
            </div>

            {actionableRecountEntries.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1">
                {actionableRecountEntries.slice(0, 8).map((item) => {
                  const isBelum = item.status === 'BELUM';
                  const badgeClass = isBelum
                    ? 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    : 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';

                  return (
                    <div
                      key={item.kode_produksi}
                      onClick={() => handleAction('popup_hitung_ulang', item.kode_produksi)}
                      className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 hover:border-amber-400 dark:hover:border-amber-600 transition-all cursor-pointer flex items-center justify-between gap-2 group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-xs text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 truncate">
                            {item.kode_produksi}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border shrink-0 ${badgeClass}`}>
                            {isBelum
                              ? 'BELUM'
                              : `SELISIH ${Number(item.selisih) > 0 ? `+${item.selisih}` : item.selisih}`}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {item.catatan_petunjuk ? item.catatan_petunjuk : 'Menunggu verifikasi jumlah fisik'}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 px-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-1">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Semua antrean Hitung Ulang sudah klop
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tidak ada kode dengan status Belum Hitung atau Ada Selisih.
                </p>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400 truncate">
              Total antrean terdaftar: <b className="font-mono text-slate-700 dark:text-slate-200">{recountQueueEntries.length}</b> kode
            </span>
            <button
              type="button"
              onClick={() => handleAction('popup_hitung_ulang')}
              className="font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>Kelola Semua</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 6. Jadwal Kerja & Proyek Berjalan */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4">
        {/* Jadwal Kerja & Drop Terdekat (6 cols) */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <CalendarDays className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                    Jadwal &amp; Agenda ({metrics.upcomingAgendaCount})
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Event, drop &amp; rilis terdekat
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAction('agenda', 'calendar')}
                className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
              >
                Kalendar <ArrowRight className="w-3 h-3" />
              </button>
            </div>

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
                      className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:border-emerald-300 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center shrink-0">
                          <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 leading-none">
                            {badge.day}
                          </span>
                          <span className="text-[8.5px] font-bold text-slate-400 uppercase leading-none mt-0.5">
                            {badge.month}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {event.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[9.5px] text-slate-400">
                            <span className={`font-extrabold uppercase px-1.5 py-0.2 rounded ${catClass}`}>
                              {event.category || 'Operasional'}
                            </span>
                            {event.pic && <span className="truncate">PIC: {event.pic}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  Tidak ada jadwal terdekat.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Proyek & Milestone Berjalan (6 cols) */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                  <FolderKanban className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                    Proyek Berjalan ({metrics.activeProjectsCount})
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Progress milestone operasional
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleAction('agenda', 'project')}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 shrink-0 cursor-pointer"
              >
                Proyek <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="mt-3 space-y-2">
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
                      className="p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 hover:border-blue-300 transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded shrink-0 ${priorityClass}`}>
                            {project.priority || 'Medium'}
                          </span>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {project.title}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0">
                          {progressVal}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-indigo-600 dark:bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, progressVal))}%` }}
                        />
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
        </div>
      </div>

      {/* 6B. Mutasi Stok Terkini — Tampilan Tabel Seragam Log Produk (Mobile 4-Kolom Compact & Desktop 7-Kolom Penuh) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3.5 py-3 sm:px-5 sm:py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                Mutasi Stok Terkini
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {recentDisplayLogs.length > 0
                  ? `${recentDisplayLogs.length} transaksi scan fisik terakhir`
                  : 'Riwayat transaksi scan fisik terakhir'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleAction('mutasi_log')}
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer shrink-0 min-h-[32px] px-1"
          >
            Semua Log <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentDisplayLogs.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            Belum ada log transaksi yang dimuat.
          </div>
        ) : (
          <>
            {/* MOBILE TABLE (< md): Identik dengan Log Produk (4 Kolom Proporsional, Zero Horizontal Scroll) */}
            <div className="block md:hidden w-full">
              <table className="w-full table-fixed border-collapse text-left">
                <thead className="bg-slate-100/95 dark:bg-[#121824]/95 text-slate-600 dark:text-slate-300 text-[10px] font-extrabold uppercase border-b border-slate-300 dark:border-slate-700">
                  <tr>
                    <th className="py-2 pl-2.5 pr-1.5 w-[48%] border-r border-slate-200/90 dark:border-slate-700/80">
                      Produk
                    </th>
                    <th className="py-2 px-1 w-[13%] text-center border-r border-slate-200/90 dark:border-slate-700/80">
                      Qty
                    </th>
                    <th className="py-2 px-1 w-[13%] text-center bg-slate-200/40 dark:bg-slate-800/60 border-r border-slate-200/90 dark:border-slate-700/80">
                      Stok
                    </th>
                    <th className="py-2 pl-1.5 pr-2.5 w-[26%]">
                      Lokasi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/90 dark:divide-slate-800">
                  {recentDisplayLogs.map((item, idx) => {
                    const style = renderLogTypeStyle(item.type);
                    const skuKey = (item.sku || '').toUpperCase().trim();
                    const locKey = (item.lokasi || 'Warehouse').toUpperCase().trim();
                    const itemCat = dashboardCatalogMap.get(skuKey);
                    const displayName = resolveProductName(item.sku, item.nama_produk, itemCat);
                    const displaySize = resolveProductDisplaySize(item.sku, item.size, itemCat?.s);
                    const resolvedArea = getAreaFromLokasi(item.lokasi || '', item.area);
                    const isLocAnomaly = resolvedArea === 'Anomali';
                    const stokRak = stockBySkuLocMap.get(`${skuKey}__${locKey}`);

                    return (
                      <tr
                        key={`dm_${item.id || `${item.invoice}_${item.sku}_${idx}`}`}
                        onClick={() => handleAction('mutasi_log')}
                        className="bg-white dark:bg-[#0E1420] active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors cursor-pointer"
                      >
                        {/* Col 1: Produk + Size | SKU | Tipe & Waktu | Operator */}
                        <td className="py-2 pl-2.5 pr-1.5 align-top border-r border-slate-200/80 dark:border-slate-800">
                          <div className="min-w-0">
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
                                {formatLogShortTime(item.created_at)}
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
                        </td>

                        {/* Col 2: Qty */}
                        <td
                          className={`py-2 px-1 align-middle text-center font-mono tabular-nums border-r border-slate-200/80 dark:border-slate-800 ${style.cellBg}`}
                        >
                          <span className={`text-[12.5px] font-black ${style.qty}`}>
                            {style.prefix}
                            {item.qty}
                          </span>
                        </td>

                        {/* Col 3: Stok Rak Terkini */}
                        <td className="py-2 px-1 align-middle text-center font-mono tabular-nums bg-slate-50/60 dark:bg-slate-800/30 border-r border-slate-200/80 dark:border-slate-800">
                          {stokRak !== undefined ? (
                            <span
                              className={`text-[12.5px] font-black ${
                                stokRak < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : stokRak === 0
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {stokRak}
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400">-</span>
                          )}
                        </td>

                        {/* Col 4: Area + Rak + Invoice */}
                        <td className="py-2 pl-1.5 pr-2.5 align-middle">
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

            {/* DESKTOP STRUCTURED TABLE (>= md): Identik dengan Tabel Log Produk */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse lg:table-fixed">
                <thead className="bg-slate-100 dark:bg-[#121824] text-slate-600 dark:text-slate-300 text-[10.5px] font-extrabold uppercase tracking-wider border-b-2 border-slate-300 dark:border-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 w-[28%] border-r border-slate-300/80 dark:border-slate-700">
                      Produk &amp; SKU
                    </th>
                    <th className="py-2.5 px-2.5 w-[13%] border-r border-slate-300/80 dark:border-slate-700">
                      Tipe &amp; Waktu
                    </th>
                    <th className="py-2.5 px-2.5 w-[16%] border-r border-slate-300/80 dark:border-slate-700">
                      Invoice
                    </th>
                    <th className="py-2.5 px-2.5 w-[14%] border-r border-slate-300/80 dark:border-slate-700">
                      Area &amp; Lokasi
                    </th>
                    <th className="py-2.5 px-2 w-[7%] text-center border-r border-slate-300/80 dark:border-slate-700">
                      Qty
                    </th>
                    <th className="py-2.5 px-2 w-[7%] text-center bg-slate-200/45 dark:bg-slate-800/50 border-r border-slate-300/80 dark:border-slate-700">
                      Stok
                    </th>
                    <th className="py-2.5 px-2.5 w-[15%]">
                      Operator
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {recentDisplayLogs.map((item, idx) => {
                    const style = renderLogTypeStyle(item.type);
                    const skuKey = (item.sku || '').toUpperCase().trim();
                    const locKey = (item.lokasi || 'Warehouse').toUpperCase().trim();
                    const itemCat = dashboardCatalogMap.get(skuKey);
                    const displayName = resolveProductName(item.sku, item.nama_produk, itemCat);
                    const displaySize = resolveProductDisplaySize(item.sku, item.size, itemCat?.s);
                    const resolvedArea = getAreaFromLokasi(item.lokasi || '', item.area);
                    const isLocAnomaly = resolvedArea === 'Anomali';
                    const src = getLogSource(item as unknown as LogProdukItem);
                    const stokRak = stockBySkuLocMap.get(`${skuKey}__${locKey}`);

                    return (
                      <tr
                        key={`dd_${item.id || `${item.invoice}_${item.sku}_${idx}`}`}
                        onClick={() => handleAction('mutasi_log')}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        {/* Produk + Size | SKU */}
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
                            {formatLogShortTime(item.created_at)}
                          </div>
                        </td>

                        {/* Invoice */}
                        <td className="py-2.5 px-2.5 border-r border-slate-200 dark:border-slate-800">
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              className="font-mono font-semibold text-slate-800 dark:text-slate-100 text-[11px] truncate select-all"
                              title={item.invoice || '-'}
                            >
                              {item.invoice || '-'}
                            </span>
                            {item.invoice && item.invoice !== '-' && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyLogInvoice(item.invoice);
                                }}
                                title="Salin invoice"
                                className="p-0.5 text-slate-400 hover:text-indigo-600 transition-colors rounded cursor-pointer shrink-0"
                              >
                                {copiedLogInvoice === item.invoice ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                            <span>{src === 'WA' ? 'WhatsApp' : src === 'WEB' ? 'Web App' : 'System'}</span>
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

                        {/* Qty */}
                        <td
                          className={`py-2.5 px-2 text-center whitespace-nowrap font-mono tabular-nums border-r border-slate-200 dark:border-slate-800 ${style.cellBg}`}
                        >
                          <span className={`font-black text-[13px] ${style.qty}`}>
                            {style.prefix}
                            {item.qty}
                          </span>
                        </td>

                        {/* Stok Rak Terkini */}
                        <td
                          className="py-2.5 px-2 text-center whitespace-nowrap font-mono tabular-nums bg-slate-50/70 dark:bg-slate-800/35 border-r border-slate-200 dark:border-slate-800"
                          title={
                            stokRak !== undefined
                              ? `Sisa stok saat ini di ${item.lokasi || 'rak'}: ${stokRak} pcs`
                              : 'Data stok rak belum tersedia'
                          }
                        >
                          {stokRak !== undefined ? (
                            <span
                              className={`font-black text-[13px] ${
                                stokRak < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : stokRak === 0
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {stokRak}
                            </span>
                          ) : (
                            <span className="font-bold text-slate-400">-</span>
                          )}
                        </td>

                        {/* Operator & Catatan */}
                        <td className="py-2.5 px-2.5">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 7. Pusat Alat Operasional & Popup Cepat (1x Saja — Tanpa Duplikasi!) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-3.5 sm:p-5 space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Alat Operasional &amp; Popup Cepat
          </h3>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">
            Draft popup tetap tersimpan meski diminimize atau offline
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-2.5">
          {[
            {
              label: 'Input Produksi',
              desc: produksiDraft.hasDraft
                ? `Draft: ${produksiDraft.totalPcs} pcs`
                : offlineProduksiCount > 0
                ? `${offlineProduksiCount} antrean offline`
                : 'Popup SJ Konveksi',
              page: 'popup_produksi_input',
              icon: ClipboardPlus,
              highlight: produksiDraft.hasDraft || offlineProduksiCount > 0,
            },
            {
              label: 'Scanner Gudang',
              desc: 'Popup #IN / #OUT / #SO',
              page: 'scanner',
              icon: Barcode,
              highlight: false,
            },
            {
              label: 'Pusat Resolusi',
              desc: `${metrics.returAktif} Retur aktif`,
              page: 'pusat_resolusi',
              icon: RotateCcw,
              highlight: metrics.returAktif > 0,
            },
            {
              label: 'Cetak Barcode',
              desc: 'Label Rak & Produk',
              page: 'cetak_barcode',
              icon: FileText,
              highlight: false,
            },
            {
              label: 'Kalendar Shift',
              desc: 'Jadwal & Agenda',
              page: 'agenda',
              icon: Calendar,
              highlight: false,
            },
            {
              label: 'Live Chat',
              desc: 'Chat Store & Gudang',
              page: 'live_chat',
              icon: MessageSquare,
              highlight: false,
            },
            {
              label: 'Rekap JNE',
              desc: 'Tagihan Ekspedisi',
              page: 'rekap_tagihan_jne',
              icon: Layers,
              highlight: false,
            },
          ].map((tool) => (
            <button
              key={tool.page}
              type="button"
              onClick={() => handleAction(tool.page)}
              className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all group cursor-pointer ${
                tool.highlight
                  ? 'border-amber-200 dark:border-amber-800/70 bg-amber-50/40 dark:bg-amber-950/20 hover:border-amber-400'
                  : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-800'
              }`}
            >
              <tool.icon className="w-4 h-4 text-slate-600 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors mb-1.5" />
              <p className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                {tool.label}
              </p>
              <p className="text-[9.5px] sm:text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {tool.desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Modal Inspeksi & Perbaikan Anomali Data Scan (Lazy-mounted) */}
      {isAnomalyModalOpen && (
        <InventoryAnomalyModal
          isOpen={isAnomalyModalOpen}
          onClose={() => setIsAnomalyModalOpen(false)}
          productCatalog={productCatalog}
          stockList={stockRows}
          userSession={session}
          onDataFixed={() => {
            fetchSupabaseStokFisikDirect(true)
              .then((fresh) => {
                if (fresh && fresh.length > 0) setStockRows(fresh);
              })
              .catch(() => {});
            fetchLeanMetrics(true);
          }}
        />
      )}
    </div>
  );
};
