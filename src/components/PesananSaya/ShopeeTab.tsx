import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Upload,
  RefreshCw,
  Search,
  SlidersHorizontal,
  MoreHorizontal,
  Table2,
  LayoutGrid,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  Printer,
  History,
  Settings,
  X,
  Check,
  ArrowRight,
  RotateCcw,
  Tag,
  Truck,
  User,
  MapPin,
  Copy,
} from 'lucide-react';
import { UserSession, ProductItem } from '../../types';
import { isSuperadmin } from '../../services/permissions';
import { playSuccessBeep, playErrorBeep } from '../../services/audio';
import {
  OnlineOrder,
  OnlineImportJob,
  OnlineFulfilmentSetup,
  OnlineImportPreview,
  CourierGroup,
  COURIER_GROUP_LABELS,
  DEFAULT_ONLINE_FULFILMENT_SETUP,
  parseShopeeArrayBuffer,
  buildOnlineImportPreview,
  commitOnlineImportPreview,
  fetchOnlineOrders,
  fetchOnlineImportJobs,
  fetchOnlineFulfilmentSetup,
  saveOnlineFulfilmentSetup,
  releasePreorderToNew,
  resolveCheckOrder,
  confirmHoldPackagePulled,
  updateOnlineOrdersBatchFields,
} from '../../services/onlineFulfilmentService';
import { OnlineImportPreviewModal } from './OnlineFulfilment/OnlineImportPreviewModal';
import { OnlineFulfilmentSetupModal } from './OnlineFulfilment/OnlineFulfilmentSetupModal';
import { OnlineImportHistoryModal } from './OnlineFulfilment/OnlineImportHistoryModal';

interface ShopeeTabProps {
  session?: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

type StatusTabKey =
  | 'siap_diproses'
  | 'preorder'
  | 'sedang_diproses'
  | 'tahan'
  | 'perlu_dicek'
  | 'batal_selesai';

type ViewMode = 'table' | 'card';
type ResiFilter = 'ALL' | 'WITH_RESI' | 'NO_RESI';

const STATUS_BADGE_MAP: Record<string, { label: string; cls: string }> = {
  new: {
    label: 'Siap Diproses',
    cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
  },
  preorder: {
    label: 'Pre-order',
    cls: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
  },
  processing: {
    label: 'Sedang Diproses',
    cls: 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  },
  packed: {
    label: 'Sudah Packing',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700',
  },
  ready_pickup: {
    label: 'Siap Request Pickup',
    cls: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700',
  },
  handed_over: {
    label: 'Diserahkan',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700',
  },
  hold: {
    label: 'TAHAN',
    cls: 'bg-rose-600 text-white border-rose-600',
  },
  check: {
    label: 'Perlu Dicek',
    cls: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700',
  },
  cancelled: {
    label: 'Batal',
    cls: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
  returned: {
    label: 'Retur',
    cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
  },
};

export const ShopeeTab: React.FC<ShopeeTabProps> = ({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  const actorName = session?.name || session?.username || 'Admin';
  const userIsAdmin = isSuperadmin(session);

  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [importJobs, setImportJobs] = useState<OnlineImportJob[]>([]);
  const [setup, setSetup] = useState<OnlineFulfilmentSetup>(DEFAULT_ONLINE_FULFILMENT_SETUP);
  const [storageMode, setStorageMode] = useState<'table' | 'system_docs'>('table');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'card' : 'table'
  );
  const [activeTab, setActiveTab] = useState<StatusTabKey>('siap_diproses');
  const [searchTerm, setSearchTerm] = useState('');
  const [courierGroupFilter, setCourierGroupFilter] = useState<'ALL' | CourierGroup>('ALL');
  const [resiFilter, setResiFilter] = useState<ResiFilter>('ALL');
  const [onlyUnmappedSku, setOnlyUnmappedSku] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingPreview, setPendingPreview] = useState<OnlineImportPreview | null>(null);
  const [savingImport, setSavingImport] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [detailOrder, setDetailOrder] = useState<OnlineOrder | null>(null);
  const [actionOrder, setActionOrder] = useState<OnlineOrder | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadAll = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const [ordersRes, jobsRes, setupRes] = await Promise.all([
        fetchOnlineOrders(force),
        fetchOnlineImportJobs(force),
        fetchOnlineFulfilmentSetup(force),
      ]);
      setOrders(ordersRes.orders.filter((o) => o.marketplace === 'shopee'));
      setStorageMode(ordersRes.storageMode);
      setImportJobs(jobsRes);
      setSetup(setupRes);
    } catch (err: any) {
      console.error('[ShopeeTab] Gagal memuat data:', err);
      onShowToast(err?.message || 'Gagal memuat data pesanan Shopee', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll(false);
  }, []);

  const lastJob = importJobs[0] || null;
  const minutesSinceLastImport = useMemo(() => {
    if (!lastJob?.created_at) return null;
    const ms = Date.now() - new Date(lastJob.created_at).getTime();
    return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 60000)) : null;
  }, [lastJob]);

  const tabCounts = useMemo(() => {
    const counts: Record<StatusTabKey, number> = {
      siap_diproses: 0,
      preorder: 0,
      sedang_diproses: 0,
      tahan: 0,
      perlu_dicek: 0,
      batal_selesai: 0,
    };
    let unmappedOrderCount = 0;

    for (const o of orders) {
      if (o.wms_status === 'new') counts.siap_diproses++;
      else if (o.wms_status === 'preorder') counts.preorder++;
      else if (o.wms_status === 'processing' || o.wms_status === 'packed' || o.wms_status === 'ready_pickup') {
        counts.sedang_diproses++;
      } else if (o.wms_status === 'hold') counts.tahan++;
      else if (o.wms_status === 'check') counts.perlu_dicek++;
      else counts.batal_selesai++;

      if (
        (o.wms_status === 'new' || o.wms_status === 'preorder') &&
        o.items.some((it) => it.item_type === 'sale' && !it.is_master_mapped)
      ) {
        unmappedOrderCount++;
      }
    }
    return { counts, unmappedOrderCount };
  }, [orders]);

  const groupPriorityMap = useMemo(() => {
    const map = new Map<CourierGroup, number>();
    (setup.courierGroupOrder || DEFAULT_ONLINE_FULFILMENT_SETUP.courierGroupOrder).forEach((g, idx) => {
      map.set(g, idx);
    });
    return map;
  }, [setup.courierGroupOrder]);

  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return orders
      .filter((o) => {
        if (activeTab === 'siap_diproses' && o.wms_status !== 'new') return false;
        if (activeTab === 'preorder' && o.wms_status !== 'preorder') return false;
        if (
          activeTab === 'sedang_diproses' &&
          o.wms_status !== 'processing' &&
          o.wms_status !== 'packed' &&
          o.wms_status !== 'ready_pickup'
        ) {
          return false;
        }
        if (activeTab === 'tahan' && o.wms_status !== 'hold') return false;
        if (activeTab === 'perlu_dicek' && o.wms_status !== 'check') return false;
        if (
          activeTab === 'batal_selesai' &&
          o.wms_status !== 'cancelled' &&
          o.wms_status !== 'handed_over' &&
          o.wms_status !== 'returned'
        ) {
          return false;
        }

        if (courierGroupFilter !== 'ALL' && o.courier_group !== courierGroupFilter) return false;
        if (resiFilter === 'WITH_RESI' && !o.tracking_no) return false;
        if (resiFilter === 'NO_RESI' && Boolean(o.tracking_no)) return false;
        if (
          onlyUnmappedSku &&
          !o.items.some((it) => it.item_type === 'sale' && !it.is_master_mapped)
        ) {
          return false;
        }

        if (q) {
          const hit =
            o.order_no.toLowerCase().includes(q) ||
            (o.tracking_no || '').toLowerCase().includes(q) ||
            (o.recipient_name || '').toLowerCase().includes(q) ||
            (o.courier_name || '').toLowerCase().includes(q) ||
            o.items.some(
              (it) =>
                it.sku.toLowerCase().includes(q) ||
                it.nama_produk.toLowerCase().includes(q)
            );
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const pa = groupPriorityMap.get(a.courier_group) ?? 99;
        const pb = groupPriorityMap.get(b.courier_group) ?? 99;
        if (pa !== pb) return pa - pb;
        return String(a.ship_by_deadline || a.order_created_at || '').localeCompare(
          String(b.ship_by_deadline || b.order_created_at || '')
        );
      });
  }, [orders, activeTab, courierGroupFilter, resiFilter, onlyUnmappedSku, searchTerm, groupPriorityMap]);

  const activeFilterCount =
    (courierGroupFilter !== 'ALL' ? 1 : 0) +
    (resiFilter !== 'ALL' ? 1 : 0) +
    (onlyUnmappedSku ? 1 : 0);

  const selectedBreakdown = useMemo(() => {
    const map = new Map<CourierGroup, number>();
    for (const o of filteredOrders) {
      if (selectedIds.has(o.id)) {
        map.set(o.courier_group, (map.get(o.courier_group) || 0) + 1);
      }
    }
    return Array.from(map.entries());
  }, [filteredOrders, selectedIds]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const parsed = parseShopeeArrayBuffer(buf, setup, productCatalog);
      const preview = buildOnlineImportPreview(parsed, orders, {
        fileName: file.name,
        actor: actorName,
      });
      setPendingPreview(preview);
    } catch (err: any) {
      playErrorBeep();
      onShowToast(err?.message || 'Gagal membaca file ekspor Shopee', 'error');
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingPreview) return;
    setSavingImport(true);
    try {
      const res = await commitOnlineImportPreview(pendingPreview, orders, actorName);
      setOrders(res.orders.filter((o) => o.marketplace === 'shopee'));
      setImportJobs((prev) => [res.job, ...prev].slice(0, 40));
      setStorageMode(res.storageMode);
      setPendingPreview(null);
      playSuccessBeep();

      const { summary } = res.job;
      if (summary.holdFromCancel > 0) {
        setActiveTab('tahan');
        onShowToast(
          `Impor selesai · ${summary.holdFromCancel} pesanan dibatalkan masuk TAHAN!`,
          'warning'
        );
      } else {
        onShowToast(
          `Impor selesai: ${summary.newOrders} baru, ${summary.resiUpdated} resi dilengkapi, ${summary.flaggedCheck} perlu dicek`,
          'success'
        );
      }
    } catch (err: any) {
      playErrorBeep();
      onShowToast(err?.message || 'Gagal menyimpan hasil impor ke WMS', 'error');
    } finally {
      setSavingImport(false);
    }
  };

  const handleSaveSetup = async (next: OnlineFulfilmentSetup) => {
    try {
      const saved = await saveOnlineFulfilmentSetup(next, actorName);
      setSetup(saved);
      onShowToast('Pengaturan fulfilment berhasil disimpan', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal menyimpan pengaturan', 'error');
      throw err;
    }
  };

  const handleMoveSelectedToProcessing = async () => {
    const targetIds = Array.from(selectedIds);
    if (targetIds.length === 0) return;
    setProcessingAction(true);
    try {
      const next = await updateOnlineOrdersBatchFields(
        targetIds,
        () => ({ wms_status: 'processing' }),
        orders,
        actorName
      );
      setOrders(next);
      setSelectedIds(new Set());
      playSuccessBeep();
      onShowToast(`${targetIds.length} pesanan dipindahkan ke Sedang Diproses`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal memperbarui status pesanan', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleReleasePreorder = async (order: OnlineOrder) => {
    setProcessingAction(true);
    try {
      const next = await releasePreorderToNew(order.id, orders, actorName);
      setOrders(next);
      setActionOrder(null);
      setDetailOrder(null);
      playSuccessBeep();
      onShowToast(`Pre-order ${order.order_no} dilepas ke Siap Diproses`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal melepas pre-order', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleResolveCheck = async (
    order: OnlineOrder,
    resolution: 'return_active' | 'mark_handed_over' | 'mark_hold' | 'mark_cancelled'
  ) => {
    setProcessingAction(true);
    try {
      const next = await resolveCheckOrder(order.id, resolution, orders, actorName);
      setOrders(next);
      setActionOrder(null);
      setDetailOrder(null);
      playSuccessBeep();
      onShowToast(`Pesanan ${order.order_no} berhasil diperbarui`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal memperbarui pesanan', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleConfirmHoldPulled = async (order: OnlineOrder) => {
    setProcessingAction(true);
    try {
      const next = await confirmHoldPackagePulled(order.id, orders, actorName);
      setOrders(next);
      setActionOrder(null);
      setDetailOrder(null);
      playSuccessBeep();
      onShowToast(`Paket ${order.order_no} dikonfirmasi sudah ditarik`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal mengonfirmasi penarikan paket', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    if (selectedIds.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  const handleSelectCourierBlock = (group: CourierGroup) => {
    const ids = filteredOrders.filter((o) => o.courier_group === group).map((o) => o.id);
    setSelectedIds(new Set(ids));
  };

  const copyText = (txt: string, label: string) => {
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    onShowToast(`${label} disalin`, 'info');
  };

  const renderPrimaryCta = (order: OnlineOrder, compact = false) => {
    const cls = compact
      ? 'py-1.5 px-2.5 rounded-lg text-xs font-semibold'
      : 'flex-1 h-10 sm:h-9 px-3 rounded-xl text-xs font-bold';

    if (order.wms_status === 'hold') {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleConfirmHoldPulled(order);
          }}
          disabled={processingAction}
          className={`${cls} bg-rose-600 hover:bg-rose-700 text-white`}
        >
          Konfirmasi Ditarik
        </button>
      );
    }
    if (order.wms_status === 'preorder') {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleReleasePreorder(order);
          }}
          disabled={processingAction}
          className={`${cls} bg-indigo-600 hover:bg-indigo-700 text-white`}
        >
          Lepas ke Siap Proses
        </button>
      );
    }
    if (order.wms_status === 'check') {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleResolveCheck(order, 'mark_handed_over');
          }}
          disabled={processingAction}
          className={`${cls} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50`}
        >
          Tandai Terkirim
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDetailOrder(order);
        }}
        className={`${cls} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60`}
      >
        Lihat Detail
      </button>
    );
  };

  const statusTabs: Array<{ key: StatusTabKey; label: string; count: number; urgent?: boolean }> = [
    { key: 'siap_diproses', label: 'Siap Diproses', count: tabCounts.counts.siap_diproses },
    { key: 'preorder', label: 'Pre-order', count: tabCounts.counts.preorder },
    { key: 'sedang_diproses', label: 'Sedang Diproses', count: tabCounts.counts.sedang_diproses },
    { key: 'tahan', label: 'TAHAN', count: tabCounts.counts.tahan, urgent: tabCounts.counts.tahan > 0 },
    { key: 'perlu_dicek', label: 'Perlu Dicek', count: tabCounts.counts.perlu_dicek },
    { key: 'batal_selesai', label: 'Batal & Selesai', count: tabCounts.counts.batal_selesai },
  ];

  return (
    <div className="w-full max-w-[1600px] mx-auto px-0 sm:px-1 space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* Header Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                Fulfilment Shopee
              </h2>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                {orders.length.toLocaleString('id-ID')} pesanan
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {lastJob ? (
                <>
                  <span>
                    Impor terakhir:{' '}
                    <b>
                      {new Date(lastJob.created_at).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </b>
                  </span>
                  <span>·</span>
                  <span>
                    {lastJob.import_mode === 'semua_audit' ? 'Tab Semua (Audit)' : 'Tab Perlu Dikirim'}
                  </span>
                  {minutesSinceLastImport !== null &&
                    minutesSinceLastImport > setup.importStaleness.regulerWarnMin && (
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border ${
                          minutesSinceLastImport > setup.importStaleness.regulerBlockMin
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                            : 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700'
                        }`}
                      >
                        Jeda {minutesSinceLastImport} mnt
                      </span>
                    )}
                </>
              ) : (
                <span>Impor file Tab Perlu Dikirim untuk proses cepat, atau Tab Semua untuk audit batal.</span>
              )}
            </div>
          </div>

          {/* Max 4 kontrol terstruktur di kanan */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="py-1.5 px-3 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs flex items-center gap-1.5 h-9"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>Impor Excel/CSV</span>
            </button>

            <button
              type="button"
              onClick={() => loadAll(true)}
              disabled={refreshing}
              title="Sinkronkan data cloud"
              className="p-2 h-9 w-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center justify-center"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUtilityMenuOpen((v) => !v)}
                className="p-2 h-9 w-9 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center justify-center"
                aria-label="Menu utilitas"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {isUtilityMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsUtilityMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-1.5 w-52 z-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUtilityMenuOpen(false);
                        setShowHistoryModal(true);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                    >
                      <History className="w-3.5 h-3.5" /> Riwayat Impor ({importJobs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUtilityMenuOpen(false);
                        setShowSetupModal(true);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                    >
                      <Settings className="w-3.5 h-3.5" /> Pengaturan Fulfilment
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUtilityMenuOpen(false);
                        if (filteredOrders.length === 0) {
                          onShowToast('Tidak ada pesanan tampil untuk dicetak', 'warning');
                          return;
                        }
                        setTimeout(() => window.print(), 200);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
                    >
                      <Printer className="w-3.5 h-3.5" /> Cetak Ringkasan A4
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 h-9">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`px-2.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors ${
                  viewMode === 'card'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kartu</span>
              </button>
            </div>
          </div>
        </div>

        {/* Alert Banners */}
        {tabCounts.counts.tahan > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('tahan')}
            className="w-full text-left flex items-center justify-between gap-2 p-2.5 rounded-xl border border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 text-xs"
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                <b>{tabCounts.counts.tahan} pesanan berstatus TAHAN</b> (dibatalkan pembeli setelah diproses). Segera tarik paketnya!
              </span>
            </div>
            <span className="font-bold underline shrink-0">Lihat</span>
          </button>
        )}

        {(tabCounts.counts.perlu_dicek > 0 || tabCounts.unmappedOrderCount > 0) && (
          <div className="flex flex-wrap gap-2">
            {tabCounts.counts.perlu_dicek > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('perlu_dicek')}
                className="flex-1 min-w-[240px] text-left flex items-center justify-between gap-2 p-2.5 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 text-xs"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    <b>{tabCounts.counts.perlu_dicek} pesanan Perlu Dicek</b> (hilang dari Tab Perlu Dikirim / resi berubah)
                  </span>
                </div>
                <span className="font-bold underline shrink-0">Cek</span>
              </button>
            )}
            {tabCounts.unmappedOrderCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('siap_diproses');
                  setOnlyUnmappedSku(true);
                }}
                className="flex-1 min-w-[240px] text-left flex items-center justify-between gap-2 p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <b>{tabCounts.unmappedOrderCount} pesanan</b> memiliki SKU belum terdaftar di Master Produk
                  </span>
                </div>
                <span className="font-bold underline shrink-0">Filter</span>
              </button>
            )}
          </div>
        )}

        {/* Horizontal Swipe Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {statusTabs.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setActiveTab(t.key);
                  setSelectedIds(new Set());
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 border transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? t.urgent
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                    : t.urgent
                      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{t.label}</span>
                <span className="tabular-nums opacity-80">({t.count})</span>
              </button>
            );
          })}
        </div>

        {/* Search & Collapsible Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari No. Pesanan, Resi, SKU, atau Penerima..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/70 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsFilterOpen((v) => !v)}
            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border flex items-center gap-1.5 shrink-0 ${
              activeFilterCount > 0 || isFilterOpen
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 rounded-full bg-indigo-600 text-white text-[10px] tabular-nums">
                {activeFilterCount}
              </span>
            )}
          </button>

          {(activeFilterCount > 0 || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCourierGroupFilter('ALL');
                setResiFilter('ALL');
                setOnlyUnmappedSku(false);
              }}
              className="py-1.5 px-2.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 flex items-center gap-1 shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
        </div>

        {/* Collapsible Filter Panel */}
        {isFilterOpen && (
          <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Blok Ekspedisi:</span>
              {(['ALL', ...setup.courierGroupOrder] as Array<'ALL' | CourierGroup>).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setCourierGroupFilter(g)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                    courierGroupFilter === g
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {g === 'ALL' ? 'Semua' : COURIER_GROUP_LABELS[g]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Resi:</span>
              <select
                value={resiFilter}
                onChange={(e) => setResiFilter(e.target.value as ResiFilter)}
                className="py-1 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="ALL">Semua</option>
                <option value="WITH_RESI">Ada Resi</option>
                <option value="NO_RESI">Belum Ada Resi</option>
              </select>
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyUnmappedSku}
                onChange={(e) => setOnlyUnmappedSku(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                Hanya SKU Belum Terdaftar
              </span>
            </label>
          </div>
        )}

        {/* Quick selection bar di tab Siap Diproses */}
        {activeTab === 'siap_diproses' && filteredOrders.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200"
              >
                {selectedIds.size === filteredOrders.length ? 'Batal Pilih Semua' : 'Pilih Semua Tampil'}
              </button>
              <button
                type="button"
                onClick={() => handleSelectCourierBlock('INSTAN')}
                className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200"
              >
                Pilih Blok Instan
              </button>
            </div>
            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  <b>{selectedIds.size}</b> dipilih (
                  {selectedBreakdown.map(([g, c]) => `${COURIER_GROUP_LABELS[g]}: ${c}`).join(' · ')})
                </span>
                <button
                  type="button"
                  onClick={handleMoveSelectedToProcessing}
                  disabled={processingAction}
                  className="py-1.5 px-3 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1"
                >
                  Proses Dipilih <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="print:hidden">
        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-xs text-slate-500 dark:text-slate-400">
            Memuat data pesanan Shopee...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
            <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Belum ada pesanan di tab ini
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Klik tombol <b>Impor Excel/CSV</b> di kanan atas untuk mengunggah ekspor Shopee (Tab Perlu Dikirim atau Tab Semua).
            </p>
          </div>
        ) : viewMode === 'table' ? (
          <>
            {/* Desktop Fixed-Proportion Table */}
            <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
              <div className="w-full overflow-x-auto">
                <table className="lg:table-fixed w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3 w-[20%]">No. Pesanan</th>
                      <th className="py-2.5 px-3 w-[16%]">Ekspedisi & Tenggat</th>
                      <th className="py-2.5 px-3 w-[16%]">Penerima</th>
                      <th className="py-2.5 px-3 w-[24%]">Daftar Barang</th>
                      <th className="py-2.5 px-3 w-[14%]">Resi & Status</th>
                      <th className="py-2.5 px-3 w-[10%] text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {filteredOrders.map((order) => {
                      const badge = STATUS_BADGE_MAP[order.wms_status] || STATUS_BADGE_MAP.new;
                      const firstItem = order.items[0];
                      const extraItems = order.items.length - 1;
                      const hasUnmapped = order.items.some(
                        (it) => it.item_type === 'sale' && !it.is_master_mapped
                      );

                      return (
                        <tr
                          key={order.id}
                          onClick={() => setDetailOrder(order)}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 px-3 align-top">
                            <div className="flex items-start gap-2">
                              {activeTab === 'siap_diproses' && (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(order.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={() => toggleSelectOrder(order.id)}
                                  className="mt-0.5 rounded border-slate-300 text-indigo-600"
                                />
                              )}
                              <div className="min-w-0">
                                <div className="font-mono font-bold text-slate-900 dark:text-white truncate" title={order.order_no}>
                                  {order.order_no}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                                  {order.order_created_at || '-'}
                                </div>
                                {order.urgent_resi_alert && (
                                  <span className="inline-block mt-1 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                    Resi Sudah Ada · Mendesak
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 align-top">
                            <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                              {COURIER_GROUP_LABELS[order.courier_group]} · {order.courier_name}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {order.ship_by_deadline ? `Tenggat: ${order.ship_by_deadline}` : '-'}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 align-top">
                            <div className="font-semibold text-slate-800 dark:text-slate-100 truncate" title={order.recipient_name}>
                              {order.recipient_name || '-'}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {[order.city, order.province].filter(Boolean).join(', ') || '-'}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 align-top">
                            {firstItem && (
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 dark:text-slate-100 truncate" title={firstItem.nama_produk}>
                                  {firstItem.nama_produk} {firstItem.size && firstItem.size !== '-' ? `(${firstItem.size})` : ''} ×{firstItem.qty}
                                </div>
                                <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                  <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                    {firstItem.sku}
                                  </span>
                                  {extraItems > 0 && (
                                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                                      +{extraItems} item
                                    </span>
                                  )}
                                  {hasUnmapped && (
                                    <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                      SKU Baru
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-3 align-top">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
                              {badge.label}
                            </span>
                            <div className="font-mono text-[10px] text-slate-600 dark:text-slate-300 truncate mt-1" title={order.tracking_no}>
                              {order.tracking_no || 'Belum ada resi'}
                            </div>
                            {(order.hold_reason || order.check_reason) && (
                              <div className="text-[10px] text-rose-600 dark:text-rose-400 line-clamp-1 mt-0.5" title={order.hold_reason || order.check_reason}>
                                {order.hold_reason || order.check_reason}
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-3 align-top text-right">
                            <div className="inline-flex items-center justify-end gap-1">
                              {renderPrimaryCta(order, true)}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionOrder(order);
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                                aria-label="Menu aksi"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
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

            {/* Mobile Native Compact List-Table (Zero Horizontal Scroll) */}
            <div className="md:hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {filteredOrders.map((order) => {
                const badge = STATUS_BADGE_MAP[order.wms_status] || STATUS_BADGE_MAP.new;
                const firstItem = order.items[0];
                const totalQty = order.items.reduce((s, it) => s + it.qty, 0);
                return (
                  <div
                    key={order.id}
                    onClick={() => setDetailOrder(order)}
                    className="p-3 flex items-center justify-between gap-2.5 active:bg-slate-50 dark:active:bg-slate-800/50"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {order.recipient_name || order.buyer_username || order.order_no}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold border shrink-0 ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        <span className="font-mono">{order.order_no}</span> · {COURIER_GROUP_LABELS[order.courier_group]} · {totalQty} pcs
                      </div>
                      {firstItem && (
                        <div className="text-[11px] text-slate-700 dark:text-slate-300 truncate">
                          {firstItem.nama_produk}
                          {order.items.length > 1 ? ` (+${order.items.length - 1} item)` : ''}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionOrder(order);
                      }}
                      className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300"
                      aria-label="Menu aksi"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Single-Elevation App Cards */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 sm:gap-4">
            {filteredOrders.map((order) => {
              const badge = STATUS_BADGE_MAP[order.wms_status] || STATUS_BADGE_MAP.new;
              return (
                <div
                  key={order.id}
                  onClick={() => setDetailOrder(order)}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs flex flex-col divide-y divide-slate-100 dark:divide-slate-800 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                >
                  {/* 1. Header */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {activeTab === 'siap_diproses' && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(order.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSelectOrder(order.id)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-bold text-slate-900 dark:text-white truncate">
                          {order.order_no}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {order.order_created_at || '-'}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* 2. Subjek & Rute */}
                  <div className="px-3.5 py-2.5 space-y-1 text-xs">
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {order.recipient_name || order.buyer_username || '-'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {[COURIER_GROUP_LABELS[order.courier_group], order.courier_name, order.city]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {(order.hold_reason || order.check_reason || order.urgent_resi_alert) && (
                      <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                        {order.hold_reason ||
                          order.check_reason ||
                          'Mendesak: Resi sudah terbit saat impor pertama'}
                      </div>
                    )}
                  </div>

                  {/* 3. Daftar Item */}
                  <div className="px-3.5 py-2 divide-y divide-slate-100 dark:divide-slate-800/80 flex-1">
                    {order.items.slice(0, 3).map((it, idx) => (
                      <div key={`${it.sku}-${idx}`} className="py-1.5 flex items-start justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 dark:text-slate-100 line-clamp-1">
                            {it.nama_produk}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                              {it.sku}
                            </span>
                            {it.size && it.size !== '-' && (
                              <span className="text-[10px] text-slate-500">· {it.size}</span>
                            )}
                            {it.item_type === 'gift' && (
                              <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800">
                                Hadiah
                              </span>
                            )}
                            {it.item_type === 'packaging' && (
                              <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                Kemasan
                              </span>
                            )}
                            {it.item_type === 'sale' && !it.is_master_mapped && (
                              <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700">
                                SKU Baru
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-extrabold text-slate-900 dark:text-white shrink-0 tabular-nums">
                          ×{it.qty}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <div className="py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                        +{order.items.length - 3} item lainnya
                      </div>
                    )}
                  </div>

                  {/* 4. Strip Dokumen 2 Kolom */}
                  <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-800 text-[11px]">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        if (order.tracking_no) copyText(order.tracking_no, 'No. Resi');
                      }}
                      className="px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <div className="text-[10px] text-slate-400">No. Resi</div>
                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {order.tracking_no || 'Belum ada'}
                      </div>
                    </div>
                    <div className="px-3.5 py-2">
                      <div className="text-[10px] text-slate-400">Tenggat Kirim</div>
                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {order.ship_by_deadline || '-'}
                      </div>
                    </div>
                  </div>

                  {/* 5. Footer 2 Kontrol */}
                  <div className="px-3.5 py-2.5 flex items-center gap-2">
                    {renderPrimaryCta(order, false)}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActionOrder(order);
                      }}
                      className="h-10 sm:h-9 w-10 sm:w-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0"
                      aria-label="Menu aksi"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Pratinjau Impor */}
      {pendingPreview && (
        <OnlineImportPreviewModal
          preview={pendingPreview}
          saving={savingImport}
          onClose={() => !savingImport && setPendingPreview(null)}
          onConfirm={handleConfirmImport}
        />
      )}

      {/* Modal Pengaturan */}
      {showSetupModal && (
        <OnlineFulfilmentSetupModal
          setup={setup}
          storageMode={storageMode}
          isAdmin={userIsAdmin}
          onClose={() => setShowSetupModal(false)}
          onSave={handleSaveSetup}
          onShowToast={onShowToast}
        />
      )}

      {/* Modal Riwayat Impor */}
      {showHistoryModal && (
        <OnlineImportHistoryModal
          jobs={importJobs}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {/* Modal Detail Pesanan */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-3xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh]">
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    {detailOrder.order_no}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      (STATUS_BADGE_MAP[detailOrder.wms_status] || STATUS_BADGE_MAP.new).cls
                    }`}
                  >
                    {(STATUS_BADGE_MAP[detailOrder.wms_status] || STATUS_BADGE_MAP.new).label}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Dibuat: {detailOrder.order_created_at || '-'} · Tenggat: {detailOrder.ship_by_deadline || '-'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" /> Penerima & Pengiriman
                  </div>
                  <div className="font-semibold text-slate-800 dark:text-slate-100">
                    {detailOrder.recipient_name || '-'} ({detailOrder.buyer_username || '-'})
                  </div>
                  {detailOrder.recipient_phone && (
                    <div className="font-mono text-slate-600 dark:text-slate-300">
                      {detailOrder.recipient_phone}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>{detailOrder.shipping_address || '-'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-slate-400" /> Kurir & Resi
                  </div>
                  <div>
                    Blok: <b>{COURIER_GROUP_LABELS[detailOrder.courier_group]}</b> · {detailOrder.courier_name}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold">
                      {detailOrder.tracking_no || 'Belum ada resi'}
                    </span>
                    {detailOrder.tracking_no && (
                      <button
                        type="button"
                        onClick={() => copyText(detailOrder.tracking_no, 'No. Resi')}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        <Copy className="w-3 h-3" /> Salin
                      </button>
                    )}
                  </div>
                  {detailOrder.buyer_note && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300">
                      Catatan Pembeli: {detailOrder.buyer_note}
                    </div>
                  )}
                </div>

                {(detailOrder.hold_reason || detailOrder.check_reason || detailOrder.cancel_reason) && (
                  <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 space-y-1">
                    <div className="font-bold">Catatan Status Khusus</div>
                    <div>{detailOrder.hold_reason || detailOrder.check_reason || detailOrder.cancel_reason}</div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="font-bold text-slate-900 dark:text-white">
                  Rincian Barang ({detailOrder.items.length} item)
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  {detailOrder.items.map((it, idx) => (
                    <div key={`${it.sku}-${idx}`} className="p-2.5 bg-white dark:bg-slate-900 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {it.nama_produk}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                          <span className="font-mono font-bold">{it.sku}</span>
                          {it.size && it.size !== '-' && <span>· Size {it.size}</span>}
                          {it.lokasi && <span>· Rak {it.lokasi}</span>}
                          <span>· {it.check_mode === 'manual_check' ? 'Centang Manual' : 'Scan Barcode'}</span>
                        </div>
                      </div>
                      <span className="font-extrabold text-sm tabular-nums shrink-0">×{it.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
              {renderPrimaryCta(detailOrder, false)}
              <button
                type="button"
                onClick={() => copyText(detailOrder.order_no, 'No. Pesanan')}
                className="h-10 sm:h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold whitespace-nowrap shrink-0 flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" /> Salin No.
              </button>
              <button
                type="button"
                onClick={() => setActionOrder(detailOrder)}
                className="h-10 sm:h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold shrink-0 flex items-center gap-1"
              >
                Aksi <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Action Sheet (Mobile Bottom Sheet / Desktop Modal) */}
      {actionOrder && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="sm:hidden flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                  {actionOrder.order_no}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {actionOrder.recipient_name || '-'} · {actionOrder.courier_name}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActionOrder(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 space-y-2 text-xs max-h-[70vh] overflow-y-auto pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {actionOrder.wms_status === 'preorder' && (
                <button
                  type="button"
                  onClick={() => handleReleasePreorder(actionOrder)}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[48px]"
                >
                  <div className="font-bold text-slate-900 dark:text-white">Lepas Pre-order ke Siap Diproses</div>
                  <div className="text-[11px] text-slate-500">Barang sudah ready dan siap ikut giliran proses gudang.</div>
                </button>
              )}

              {actionOrder.wms_status === 'hold' && (
                <button
                  type="button"
                  onClick={() => handleConfirmHoldPulled(actionOrder)}
                  className="w-full text-left p-3 rounded-xl border border-rose-200 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/40 min-h-[48px]"
                >
                  <div className="font-bold text-rose-700 dark:text-rose-300">Konfirmasi Paket Sudah Ditarik</div>
                  <div className="text-[11px] text-rose-600/90 dark:text-rose-300/80">Tandai paket batal sudah diamankan agar tidak ikut handover.</div>
                </button>
              )}

              {actionOrder.wms_status === 'check' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleResolveCheck(actionOrder, 'mark_handed_over')}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[48px]"
                  >
                    <div className="font-bold text-emerald-700 dark:text-emerald-400">Tandai Sudah Dikirim ke Kurir</div>
                    <div className="text-[11px] text-slate-500">Pesanan hilang dari tab Perlu Dikirim karena memang sudah dikirim.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveCheck(actionOrder, 'mark_hold')}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[48px]"
                  >
                    <div className="font-bold text-rose-700 dark:text-rose-400">Tandai TAHAN (Paket Dibatalkan)</div>
                    <div className="text-[11px] text-slate-500">Kunci pesanan di daftar TAHAN supaya paket ditarik dari meja/keranjang.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResolveCheck(actionOrder, 'return_active')}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[48px]"
                  >
                    <div className="font-bold text-slate-900 dark:text-white">Kembalikan ke Antrean Aktif</div>
                    <div className="text-[11px] text-slate-500">Hapus tanda Perlu Dicek dan lanjutkan proses normal.</div>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  copyText(actionOrder.order_no, 'No. Pesanan');
                  setActionOrder(null);
                }}
                className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[48px]"
              >
                <div className="font-bold text-slate-900 dark:text-white">Salin No. Pesanan</div>
                <div className="text-[11px] text-slate-500 font-mono">{actionOrder.order_no}</div>
              </button>

              {actionOrder.tracking_no && (
                <button
                  type="button"
                  onClick={() => {
                    copyText(actionOrder.tracking_no, 'No. Resi');
                    setActionOrder(null);
                  }}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[48px]"
                >
                  <div className="font-bold text-slate-900 dark:text-white">Salin No. Resi</div>
                  <div className="text-[11px] text-slate-500 font-mono">{actionOrder.tracking_no}</div>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const target = actionOrder;
                  setActionOrder(null);
                  setDetailOrder(target);
                }}
                className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[48px]"
              >
                <div className="font-bold text-slate-900 dark:text-white">Lihat Rincian Lengkap</div>
                <div className="text-[11px] text-slate-500">Buka alamat penerima dan semua item pesanan.</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable A4 Summary */}
      <div className="hidden print:block p-4 bg-white text-black">
        <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-3">
          <div>
            <h1 className="text-base font-black uppercase">RINGKASAN PESANAN SHOPEE (JALUR C)</h1>
            <div className="text-[10px]">
              Dicetak: {new Date().toLocaleString('id-ID')} · Total: {filteredOrders.length} pesanan
            </div>
          </div>
          <div className="text-right text-[10px] font-mono">
            Blok: {courierGroupFilter === 'ALL' ? 'Semua' : COURIER_GROUP_LABELS[courierGroupFilter]}
          </div>
        </div>
        <table className="w-full border-collapse text-[9.5px]">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-black p-1 w-[5%]">No</th>
              <th className="border border-black p-1 w-[18%]">No. Pesanan & Resi</th>
              <th className="border border-black p-1 w-[14%]">Ekspedisi</th>
              <th className="border border-black p-1 w-[16%]">Penerima</th>
              <th className="border border-black p-1 w-[37%]">SKU & Nama Produk</th>
              <th className="border border-black p-1 w-[10%]">Qty</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order, idx) =>
              order.items.map((it, itemIdx) => (
                <tr key={`${order.id}-${itemIdx}`}>
                  {itemIdx === 0 && (
                    <>
                      <td rowSpan={order.items.length} className="border border-black p-1 text-center font-bold">
                        {idx + 1}
                      </td>
                      <td rowSpan={order.items.length} className="border border-black p-1 font-mono">
                        <div className="font-bold">{order.order_no}</div>
                        {order.tracking_no && <div className="text-[8.5px]">{order.tracking_no}</div>}
                      </td>
                      <td rowSpan={order.items.length} className="border border-black p-1">
                        {COURIER_GROUP_LABELS[order.courier_group]} · {order.courier_name}
                      </td>
                      <td rowSpan={order.items.length} className="border border-black p-1">
                        {order.recipient_name}
                      </td>
                    </>
                  )}
                  <td className="border border-black p-1">
                    <span className="font-mono font-bold">{it.sku}</span> — {it.nama_produk}
                    {it.size && it.size !== '-' ? ` (${it.size})` : ''}
                  </td>
                  <td className="border border-black p-1 text-center font-bold">{it.qty}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
