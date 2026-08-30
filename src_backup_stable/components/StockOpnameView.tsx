import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import {
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  Check,
  CheckSquare,
  Square,
  ClipboardList,
  ShieldCheck,
  XCircle,
  Download,
  Boxes,
  Lock,
  X,
  Layers,
} from 'lucide-react';
import { StockOpnameQueueItem, ProductItem, UserSession } from '../types';
import {
  fetchStockOpnameQueue,
  approveStockOpnameQueueItems,
  rejectStockOpnameQueueItems,
  deleteStockOpnameQueueItems,
  getAreaFromLokasi,
} from '../services/supabase';
import { hasPermission, isSuperadmin } from '../services/permissions';

interface StockOpnameViewProps {
  session?: UserSession | null;
  productCatalog?: ProductItem[];
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshCatalog?: () => Promise<void> | void;
}

export const StockOpnameView: React.FC<StockOpnameViewProps> = ({
  session,
  productCatalog = [],
  onNotify,
  onRefreshCatalog,
}) => {
  const [soQueue, setSoQueue] = useState<StockOpnameQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [diffFilter, setDiffFilter] = useState<'ALL' | 'DIFF' | 'PLUS' | 'MINUS' | 'ZERO'>('ALL');
  const [selectedSoIds, setSelectedSoIds] = useState<string[]>([]);
  const [displayLimit, setDisplayLimit] = useState(150);

  // In-app confirmation modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const canApproveSo = hasPermission(session, 'can_approve_so');
  const canExportData = hasPermission(session, 'can_export_data');
  const currentOperator = session?.username || 'Operator';

  const loadSoData = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await fetchStockOpnameQueue('ALL', 15000);
      const unique = Array.from(new Map(data.map((item) => [item.id || `${item.invoice}_${item.sku}_${Math.random()}`, item])).values());
      setSoQueue(unique);
      setSelectedSoIds([]);
    } catch (e: any) {
      console.error('Error loading SO data:', e);
      setFetchError(e.message || 'Gagal memuat antrean Stock Opname');
      if (onNotify) onNotify('Gagal memuat data Stock Opname.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSoData();
  }, []);

  // Filtered SO queue
  const filteredQueue = useMemo(() => {
    return soQueue.filter((item) => {
      // Status Filter
      if (statusFilter !== 'ALL') {
        const itemStatus = (item.status || 'PENDING').toUpperCase();
        if (itemStatus !== statusFilter) return false;
      }

      // Diff Filter
      const selisih = Number(item.selisih) || 0;
      if (diffFilter === 'DIFF' && selisih === 0) return false;
      if (diffFilter === 'PLUS' && selisih <= 0) return false;
      if (diffFilter === 'MINUS' && selisih >= 0) return false;
      if (diffFilter === 'ZERO' && selisih !== 0) return false;

      // Search
      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase().trim();
        const matchSku = (item.sku || '').toLowerCase().includes(q);
        const matchName = (item.nama_produk || '').toLowerCase().includes(q);
        const matchLoc = (item.lokasi || '').toLowerCase().includes(q);
        const matchInv = (item.invoice || '').toLowerCase().includes(q);
        const matchOp = (item.operator || '').toLowerCase().includes(q);
        const matchSesi = (item.sesi_id || '').toLowerCase().includes(q);
        return matchSku || matchName || matchLoc || matchInv || matchOp || matchSesi;
      }

      return true;
    });
  }, [soQueue, statusFilter, diffFilter, deferredSearch]);

  // Multi-selection handlers
  const handleToggleSelectAll = () => {
    const visibleIds = filteredQueue.map((item) => item.id).filter(Boolean) as string[];
    if (selectedSoIds.length === visibleIds.length && visibleIds.length > 0) {
      setSelectedSoIds([]);
    } else {
      setSelectedSoIds(visibleIds);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedSoIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Batch Approve
  const handleApproveSelected = () => {
    if (selectedSoIds.length === 0) return;
    const itemsToApprove = soQueue.filter((it) => it.id && selectedSoIds.includes(it.id));
    if (!itemsToApprove.length) return;

    setConfirmModal({
      title: 'Konfirmasi Approve Stock Opname',
      message: `Approve penyesuaian untuk ${itemsToApprove.length} item SO terpilih? Penyesuaian stok akan otomatis dicatat ke Log Produk.`,
      confirmLabel: `Approve (${itemsToApprove.length})`,
      isDanger: false,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsActionLoading(true);
        try {
          const res = await approveStockOpnameQueueItems(itemsToApprove, currentOperator);
          if (res.success) {
            if (onNotify) onNotify(`Berhasil Approve ${res.count} item SO & mencatat log adjustment!`, 'success');
            await loadSoData();
          } else {
            if (onNotify) onNotify(`Gagal approve: ${res.error}`, 'error');
            await loadSoData();
          }
        } catch (e: any) {
          if (onNotify) onNotify(`Terjadi kesalahan: ${e.message}`, 'error');
          await loadSoData();
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  // Batch Reject
  const handleRejectSelected = () => {
    if (selectedSoIds.length === 0) return;
    const itemsToReject = soQueue.filter((it) => it.id && selectedSoIds.includes(it.id));
    if (!itemsToReject.length) return;

    setConfirmModal({
      title: 'Konfirmasi Reject Stock Opname',
      message: `Tolak (Reject) ${itemsToReject.length} item SO terpilih? Status antrean akan diubah menjadi REJECTED tanpa memotong stok.`,
      confirmLabel: `Reject (${itemsToReject.length})`,
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsActionLoading(true);
        try {
          const res = await rejectStockOpnameQueueItems(itemsToReject, currentOperator);
          if (res.success) {
            if (onNotify) onNotify(`Berhasil me-Reject ${res.count} item SO.`, 'info');
            await loadSoData();
          } else {
            if (onNotify) onNotify(`Gagal reject: ${res.error}`, 'error');
            await loadSoData();
          }
        } catch (e: any) {
          if (onNotify) onNotify(`Terjadi kesalahan: ${e.message}`, 'error');
          await loadSoData();
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  // Batch Delete
  const handleDeleteSelected = () => {
    if (selectedSoIds.length === 0) return;
    const count = selectedSoIds.length;
    const targetIds = [...selectedSoIds];

    setConfirmModal({
      title: 'Hapus Antrean Stock Opname',
      message: `Hapus permanen ${count} baris riwayat SO terpilih dari database Supabase?`,
      confirmLabel: `Hapus (${count})`,
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsActionLoading(true);

        // Optimistic UI update
        setSoQueue((prev) => prev.filter((it) => !it.id || !targetIds.includes(it.id)));
        setSelectedSoIds([]);

        try {
          const res = await deleteStockOpnameQueueItems(targetIds);
          if (res.success) {
            if (onNotify) onNotify(`Berhasil menghapus ${res.count} item dari antrean SO.`, 'info');
            await loadSoData();
          } else {
            if (onNotify) onNotify(`Gagal menghapus: ${res.error}`, 'error');
            await loadSoData();
          }
        } catch (e: any) {
          if (onNotify) onNotify(`Terjadi kesalahan: ${e.message}`, 'error');
          await loadSoData();
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  // Single Item Actions
  const handleSingleApprove = async (item: StockOpnameQueueItem) => {
    if (!canApproveSo) return;
    setIsActionLoading(true);
    try {
      const res = await approveStockOpnameQueueItems([item], currentOperator);
      if (res.success) {
        if (onNotify) onNotify(`Approve SO ${item.sku} sukses.`, 'success');
        await loadSoData();
      } else {
        if (onNotify) onNotify(`Gagal: ${res.error}`, 'error');
      }
    } catch (e: any) {
      if (onNotify) onNotify(e.message, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSingleReject = async (item: StockOpnameQueueItem) => {
    if (!canApproveSo) return;
    setIsActionLoading(true);
    try {
      const res = await rejectStockOpnameQueueItems([item], currentOperator);
      if (res.success) {
        if (onNotify) onNotify(`Item SO ${item.sku} ditolak.`, 'info');
        await loadSoData();
      } else {
        if (onNotify) onNotify(`Gagal: ${res.error}`, 'error');
      }
    } catch (e: any) {
      if (onNotify) onNotify(e.message, 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSingleDelete = (id: string, skuName?: string) => {
    setConfirmModal({
      title: 'Hapus Baris Stock Opname',
      message: `Hapus baris SO ${skuName ? `"${skuName}"` : ''} secara permanen dari database Supabase?`,
      confirmLabel: 'Hapus',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsActionLoading(true);

        // Optimistic UI update
        setSoQueue((prev) => prev.filter((it) => it.id !== id));
        setSelectedSoIds((prev) => prev.filter((item) => item !== id));

        try {
          const res = await deleteStockOpnameQueueItems([id]);
          if (res.success) {
            if (onNotify) onNotify('Item SO berhasil dihapus.', 'info');
            await loadSoData();
          } else {
            if (onNotify) onNotify(`Gagal menghapus: ${res.error}`, 'error');
            await loadSoData();
          }
        } catch (e: any) {
          if (onNotify) onNotify(e.message, 'error');
          await loadSoData();
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredQueue.length) {
      if (onNotify) onNotify('Tidak ada data SO untuk diekspor.', 'warning');
      return;
    }

    const headers = [
      'ID',
      'Tanggal',
      'Invoice',
      'Sesi ID',
      'SKU',
      'Nama Produk',
      'Size',
      'Lokasi',
      'Area',
      'Qty Sistem',
      'Qty Fisik',
      'Selisih',
      'Status',
      'Operator',
      'Approved By',
      'Alasan',
    ];

    const rows = filteredQueue.map((it) => [
      it.id || '',
      it.tanggal || '',
      `"${(it.invoice || '').replace(/"/g, '""')}"`,
      `"${(it.sesi_id || '').replace(/"/g, '""')}"`,
      `"${(it.sku || '').replace(/"/g, '""')}"`,
      `"${(it.nama_produk || '').replace(/"/g, '""')}"`,
      `"${(it.size || '').replace(/"/g, '""')}"`,
      `"${(it.lokasi || '').replace(/"/g, '""')}"`,
      `"${(it.area || '').replace(/"/g, '""')}"`,
      it.qty_sistem || 0,
      it.qty_fisik || 0,
      it.selisih || 0,
      it.status || 'PENDING',
      `"${(it.operator || '').replace(/"/g, '""')}"`,
      `"${(it.approved_by || '').replace(/"/g, '""')}"`,
      `"${(it.alasan || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Opname_Queue_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onNotify) onNotify(`Berhasil mengekspor ${filteredQueue.length} baris Stock Opname.`, 'success');
  };

  const pendingCount = useMemo(() => {
    return soQueue.filter((it) => (it.status || 'PENDING') === 'PENDING').length;
  }, [soQueue]);

  return (
    <div id="stockOpnameViewContainer" className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-xs">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Stock Opname (SO)
                {pendingCount > 0 && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
                    {pendingCount} Menunggu Approval
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Audit fisik vs sistem WMS, otorisasi persetujuan penyesuaian stok, dan log riwayat SO.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              id="btnRefreshSoQueue"
              type="button"
              disabled={isLoading}
              onClick={loadSoData}
              className="px-3.5 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Antrean</span>
            </button>

            {canExportData && (
              <button
                id="btnExportSoCsv"
                type="button"
                onClick={handleExportCSV}
                className="px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Ekspor CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter & Batch Actions Toolbar */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
            {/* Search Bar */}
            <div className="lg:col-span-6 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="inputSearchSoQueue"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari SKU, Lokasi, Invoice, Sesi SO..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="lg:col-span-3">
              <select
                id="selectStatusFilterSo"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
              >
                <option value="PENDING">Status: Menunggu (PENDING)</option>
                <option value="APPROVED">Status: Disetujui (APPROVED)</option>
                <option value="REJECTED">Status: Ditolak (REJECTED)</option>
                <option value="ALL">Status: Semua Status</option>
              </select>
            </div>

            {/* Diff Filter */}
            <div className="lg:col-span-3">
              <select
                id="selectDiffFilterSo"
                value={diffFilter}
                onChange={(e) => setDiffFilter(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
              >
                <option value="ALL">Semua Selisih</option>
                <option value="DIFF">Hanya Ada Selisih (≠ 0)</option>
                <option value="PLUS">Fisik Lebih Banyak (+)</option>
                <option value="MINUS">Fisik Kurang (-)</option>
                <option value="ZERO">Fisik Sesuai Sistem (0)</option>
              </select>
            </div>
          </div>

          {/* Batch Actions Bar when items selected */}
          {selectedSoIds.length > 0 && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between flex-wrap gap-2 animate-in fade-in duration-150">
              <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-emerald-600" />
                <span>{selectedSoIds.length} baris terpilih</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="btnBatchApproveSo"
                  type="button"
                  onClick={handleApproveSelected}
                  disabled={isActionLoading}
                  className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approve Terpilih</span>
                </button>

                <button
                  id="btnBatchRejectSo"
                  type="button"
                  onClick={handleRejectSelected}
                  disabled={isActionLoading}
                  className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject Terpilih</span>
                </button>

                <button
                  id="btnBatchDeleteSo"
                  type="button"
                  onClick={handleDeleteSelected}
                  disabled={isActionLoading}
                  className="px-3 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Terpilih</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Memuat antrean Stock Opname...
            </span>
          </div>
        ) : fetchError ? (
          <div className="py-16 px-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Gagal Mengambil Data</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{fetchError}</p>
            <button
              onClick={loadSoData}
              className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl shadow-md cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredQueue.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <ClipboardList className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Tidak Ada Item Stock Opname
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || statusFilter !== 'ALL' || diffFilter !== 'ALL'
                ? 'Tidak ada antrean SO yang sesuai dengan filter pencarian.'
                : 'Belum ada antrean Stock Opname tercatat.'}
            </p>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 w-10 text-center">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                        title="Pilih Semua"
                      >
                        {selectedSoIds.length > 0 && selectedSoIds.length === filteredQueue.length ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-4">Tanggal & Sesi</th>
                    <th className="py-3 px-4">SKU & Produk</th>
                    <th className="py-3 px-4">Lokasi Rak</th>
                    <th className="py-3 px-4 text-center">Sistem</th>
                    <th className="py-3 px-4 text-center">Fisik</th>
                    <th className="py-3 px-4 text-center">Selisih</th>
                    <th className="py-3 px-4">Status & Otorisasi</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredQueue.slice(0, displayLimit).map((item) => {
                    const isSelected = item.id ? selectedSoIds.includes(item.id) : false;
                    const selisih = Number(item.selisih) || 0;
                    const isPending = (item.status || 'PENDING') === 'PENDING';
                    const isApproved = item.status === 'APPROVED';
                    const isRejected = item.status === 'REJECTED';

                    return (
                      <tr
                        key={item.id || `${item.invoice}_${item.sku}_${Math.random()}`}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                          isSelected ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => item.id && handleToggleSelectOne(item.id)}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        {/* Date & Sesi */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono text-[11px] font-bold text-slate-900 dark:text-slate-100">
                            {item.tanggal
                              ? new Date(item.tanggal).toLocaleString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '-'}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                            {item.sesi_id || item.invoice || '-'}
                          </div>
                        </td>

                        {/* SKU & Product */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-bold text-slate-900 dark:text-slate-100 font-mono flex items-center gap-1.5">
                            {item.sku}
                            {item.size && item.size !== '-' && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-slate-200/70 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300 font-sans">
                                {item.size}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.nama_produk || '-'}
                          </div>
                        </td>

                        {/* Location */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {item.lokasi}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            {item.area || getAreaFromLokasi(item.lokasi)}
                          </div>
                        </td>

                        {/* Qty Sistem */}
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                          {item.qty_sistem || 0}
                        </td>

                        {/* Qty Fisik */}
                        <td className="py-3 px-4 text-center font-mono font-black text-slate-900 dark:text-slate-100">
                          {item.qty_fisik || 0}
                        </td>

                        {/* Selisih */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md font-mono font-black text-xs ${
                              selisih > 0
                                ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                : selisih < 0
                                ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {selisih > 0 ? `+${selisih}` : selisih}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isApproved ? (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Approved
                            </span>
                          ) : isRejected ? (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 inline-flex items-center gap-1">
                              <XCircle className="w-3 h-3" />
                              Rejected
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 inline-flex items-center gap-1">
                              Pending
                            </span>
                          )}
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate max-w-[130px]">
                            {item.operator}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {isApproved ? (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                  Approved
                                </span>
                                <button
                                  type="button"
                                  disabled={isActionLoading}
                                  onClick={() => handleSingleReject(item)}
                                  title="Ubah status ke Tolak (Reject)"
                                  className="px-2 py-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Reject</span>
                                </button>
                              </div>
                            ) : isRejected ? (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                                  Rejected
                                </span>
                                <button
                                  type="button"
                                  disabled={isActionLoading}
                                  onClick={() => handleSingleApprove(item)}
                                  title="Approve penyesuaian ini"
                                  className="px-2 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Approve</span>
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={isActionLoading}
                                  onClick={() => handleSingleApprove(item)}
                                  title="Approve penyesuaian SO ini (catat mutasi penyesuaian)"
                                  className="px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 active:scale-95"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve</span>
                                </button>

                                <button
                                  type="button"
                                  disabled={isActionLoading}
                                  onClick={() => handleSingleReject(item)}
                                  title="Tolak (Reject) penyesuaian SO ini"
                                  className="px-2.5 py-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1 active:scale-95"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}

                            {/* Delete single */}
                            <button
                              type="button"
                              disabled={isActionLoading}
                              onClick={() => item.id && handleSingleDelete(item.id, item.sku)}
                              title="Hapus baris SO ini secara permanen"
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ml-0.5"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination / Show more */}
            {filteredQueue.length > displayLimit && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => setDisplayLimit((prev) => prev + 150)}
                  className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Tampilkan Lebih Banyak ({filteredQueue.length - displayLimit} baris lagi)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div
          id="confirmModalSoOverlay"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            id="confirmModalSoBox"
            className="w-full max-w-sm bg-white dark:bg-[#121216] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  confirmModal.isDanger
                    ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                }`}
              >
                {confirmModal.isDanger ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>

              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {confirmModal.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={isActionLoading}
                onClick={confirmModal.onConfirm}
                className={`px-4 py-1.5 text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  confirmModal.isDanger
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {isActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{confirmModal.confirmLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
