import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import {
  RefreshCw,
  Search,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  SlidersHorizontal,
  Loader2,
  Trash2,
  Edit3,
  Calendar,
  Layers,
  MapPin,
  Tag,
  AlertTriangle,
  CheckCircle2,
  X,
  Plus,
  Save,
  Download,
  FileSpreadsheet,
  Package,
} from 'lucide-react';
import { LogProdukItem, ProductItem, UserSession } from '../types';
import {
  fetchAllLogs,
  fetchLogsByInvoice,
  updateLogProdukInvoiceBatch,
  deleteLogProdukItem,
  deleteLogProdukInvoice,
  getAreaFromLokasi,
} from '../services/supabase';
import { hasPermission, isSuperadmin } from '../services/permissions';
import { partialSearchMatch } from '../utils/sortUtils';

interface MutasiLogViewProps {
  session?: UserSession | null;
  productCatalog?: ProductItem[];
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshCatalog?: () => Promise<void> | void;
}

interface EditableLogItem {
  id: string | number;
  type: string;
  sku: string;
  nama_produk: string;
  size: string;
  lokasi: string;
  area: string;
  qty: number;
  keterangan: string;
}

export const MutasiLogView: React.FC<MutasiLogViewProps> = ({
  session,
  productCatalog = [],
  onNotify,
  onRefreshCatalog,
}) => {
  const [logs, setLogs] = useState<LogProdukItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT' | 'ADJ_IN' | 'ADJ_OUT'>('ALL');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');
  const [displayLimit, setDisplayLimit] = useState(150);

  // Edit Invoice Modal State
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);
  const [editInvoiceItems, setEditInvoiceItems] = useState<EditableLogItem[]>([]);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    isDanger?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const canExportData = hasPermission(session, 'can_export_data');
  const userIsAdmin = isSuperadmin(session);

  // Map product catalog for fast SKU lookups
  const catalogMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    for (const p of productCatalog) {
      if (p && p.k) {
        map.set(p.k.toUpperCase().trim(), p);
      }
    }
    return map;
  }, [productCatalog]);

  // Load all logs from Supabase
  const loadLogs = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await fetchAllLogs(15000);
      // Deduplicate by ID
      const unique = Array.from(
        new Map(data.map((item) => [item.id || `${item.invoice}_${item.sku}_${item.created_at}`, item])).values()
      );
      setLogs(unique);
    } catch (e: any) {
      console.error('Error loading logs:', e);
      setFetchError(e.message || 'Gagal memuat log mutasi dari Supabase');
      if (onNotify) onNotify('Gagal memuat mutasi log.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Type Filter
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'IN' && log.type !== 'IN') return false;
        if (typeFilter === 'OUT' && log.type !== 'OUT') return false;
        if (typeFilter === 'ADJ_IN' && log.type !== 'ADJ_IN') return false;
        if (typeFilter === 'ADJ_OUT' && log.type !== 'ADJ_OUT') return false;
      }

      // Area Filter
      if (areaFilter !== 'ALL') {
        const itemArea = (log.area || getAreaFromLokasi(log.lokasi || '')).toUpperCase();
        if (!itemArea.includes(areaFilter.toUpperCase())) return false;
      }

      // Search Query (Multi-keyword partial matching across all fields)
      if (deferredSearch.trim()) {
        return partialSearchMatch(
          deferredSearch,
          log.sku,
          log.nama_produk,
          log.size,
          log.invoice,
          log.lokasi,
          log.operator,
          log.keterangan,
          log.area,
          log.type
        );
      }

      return true;
    });
  }, [logs, typeFilter, areaFilter, deferredSearch]);

  // Unique areas for dropdown
  const uniqueAreas = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((it) => {
      const a = it.area || getAreaFromLokasi(it.lokasi || '');
      if (a) set.add(a);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Open Edit Modal for an Invoice
  const handleOpenEditInvoice = async (invoice: string) => {
    setEditingInvoice(invoice);
    setIsEditLoading(true);

    try {
      // Fetch fresh items for this invoice or filter from current state
      let invoiceItems = logs.filter((l) => l.invoice === invoice);
      if (!invoiceItems.length) {
        invoiceItems = await fetchLogsByInvoice(invoice);
      }

      setEditInvoiceItems(
        invoiceItems.map((item) => ({
          id: item.id || '',
          type: item.type || 'IN',
          sku: item.sku || '',
          nama_produk: item.nama_produk || '',
          size: item.size || '-',
          lokasi: item.lokasi || 'Warehouse',
          area: item.area || getAreaFromLokasi(item.lokasi || 'Warehouse'),
          qty: Number(item.qty) || 1,
          keterangan: item.keterangan || '',
        }))
      );
    } catch (err: any) {
      console.error('Error fetching invoice for edit:', err);
      if (onNotify) onNotify('Gagal memuat detail invoice.', 'error');
    } finally {
      setIsEditLoading(false);
    }
  };

  // Handle field change in edit modal
  const handleItemFieldChange = (
    index: number,
    field: keyof EditableLogItem,
    value: string | number
  ) => {
    setEditInvoiceItems((prev) => {
      const copy = [...prev];
      const current = { ...copy[index], [field]: value };

      // Auto update product info if SKU changed
      if (field === 'sku') {
        const skuStr = String(value).toUpperCase().trim();
        const matched = catalogMap.get(skuStr);
        if (matched) {
          current.nama_produk = matched.n || current.nama_produk;
          current.size = matched.s || current.size;
        }
      }

      // Auto update area if location changed
      if (field === 'lokasi') {
        current.area = getAreaFromLokasi(String(value).trim());
      }

      copy[index] = current;
      return copy;
    });
  };

  // Save changes to invoice
  const handleSaveInvoiceEdit = async () => {
    if (!editInvoiceItems.length || !editingInvoice) return;

    setIsSavingEdit(true);
    try {
      const res = await updateLogProdukInvoiceBatch(editInvoiceItems);
      if (res.success) {
        if (onNotify) onNotify(`Invoice ${editingInvoice} berhasil diperbarui (${res.count} item)!`, 'success');
        setEditingInvoice(null);
        await loadLogs();
      } else {
        if (onNotify) onNotify(`Gagal menyimpan perubahan: ${res.error}`, 'error');
      }
    } catch (err: any) {
      console.error('Error saving invoice edit:', err);
      if (onNotify) onNotify(`Terjadi kesalahan: ${err.message}`, 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete single item from modal or table
  const handleDeleteSingleItem = (id: string | number, skuName?: string, fromModal = false) => {
    setConfirmModal({
      title: 'Hapus Item Mutasi Log',
      message: `Hapus baris mutasi ${skuName ? `"${skuName}"` : ''} secara permanen dari database Supabase? Tindakan ini akan mempengaruhi perhitungan sisa stok.`,
      confirmLabel: 'Hapus Item',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsActionLoading(true);

        // Optimistic UI updates
        setLogs((prev) => prev.filter((it) => it.id !== id));
        if (fromModal) {
          setEditInvoiceItems((prev) => prev.filter((it) => it.id !== id));
        }

        try {
          const res = await deleteLogProdukItem(id);
          if (res.success) {
            if (onNotify) onNotify('Item mutasi log berhasil dihapus.', 'info');
            await loadLogs();
          } else {
            if (onNotify) onNotify(`Gagal menghapus item: ${res.error}`, 'error');
            await loadLogs();
          }
        } catch (err: any) {
          if (onNotify) onNotify(`Error: ${err.message}`, 'error');
          await loadLogs();
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  // Delete whole invoice
  const handleDeleteFullInvoice = (invoice: string) => {
    setConfirmModal({
      title: 'Hapus Seluruh Invoice',
      message: `PERINGATAN: Hapus SELURUH item mutasi dalam invoice "${invoice}" secara permanen? Semua baris log dengan nomor invoice ini akan dihapus dari Supabase.`,
      confirmLabel: 'Hapus 1 Invoice Full',
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setEditingInvoice(null);
        setIsActionLoading(true);

        // Optimistic update
        setLogs((prev) => prev.filter((it) => it.invoice !== invoice));

        try {
          const res = await deleteLogProdukInvoice(invoice);
          if (res.success) {
            if (onNotify) onNotify(`Seluruh mutasi pada invoice ${invoice} berhasil dihapus.`, 'info');
            await loadLogs();
          } else {
            if (onNotify) onNotify(`Gagal menghapus invoice: ${res.error}`, 'error');
            await loadLogs();
          }
        } catch (err: any) {
          if (onNotify) onNotify(`Error: ${err.message}`, 'error');
          await loadLogs();
        } finally {
          setIsActionLoading(false);
        }
      },
    });
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredLogs.length) {
      if (onNotify) onNotify('Tidak ada data mutasi untuk diekspor.', 'warning');
      return;
    }

    const headers = ['ID', 'Waktu', 'Tipe', 'Invoice', 'SKU', 'Nama Produk', 'Size', 'Lokasi', 'Area', 'Qty', 'Operator', 'Keterangan'];
    const rows = filteredLogs.map((l) => [
      l.id || '',
      l.created_at || '',
      l.type || '',
      `"${(l.invoice || '').replace(/"/g, '""')}"`,
      `"${(l.sku || '').replace(/"/g, '""')}"`,
      `"${(l.nama_produk || '').replace(/"/g, '""')}"`,
      `"${(l.size || '').replace(/"/g, '""')}"`,
      `"${(l.lokasi || '').replace(/"/g, '""')}"`,
      `"${(l.area || '').replace(/"/g, '""')}"`,
      l.qty || 1,
      `"${(l.operator || '').replace(/"/g, '""')}"`,
      `"${(l.keterangan || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Mutasi_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (onNotify) onNotify(`Berhasil mengekspor ${filteredLogs.length} baris log mutasi.`, 'success');
  };

  return (
    <div id="mutasiLogViewContainer" className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#ff7a00]/10 text-[#ff7a00] border border-[#ff7a00]/20 flex items-center justify-center shrink-0 shadow-xs">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Mutasi Log Produk
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  {logs.length.toLocaleString('id-ID')} Total Baris
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Riwayat pergerakan stok IN, OUT, & penyesuaian SO. Dilengkapi fitur Edit Invoice & Hapus Baris.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              id="btnRefreshMutasiLogs"
              type="button"
              disabled={isLoading}
              onClick={loadLogs}
              className="px-3.5 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Data</span>
            </button>

            {canExportData && (
              <button
                id="btnExportMutasiCsv"
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

        {/* Filter Toolbar */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          {/* Search Bar */}
          <div className="lg:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="inputSearchMutasiLog"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Invoice, SKU, Lokasi, Nama, Operator..."
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ff7a00]"
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

          {/* Type Filter */}
          <div className="lg:col-span-3">
            <select
              id="selectTypeFilterMutasi"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#ff7a00] font-semibold"
            >
              <option value="ALL">Semua Jenis Mutasi</option>
              <option value="IN">Hanya Masuk (IN)</option>
              <option value="OUT">Hanya Keluar (OUT)</option>
              <option value="ADJ_IN">Penyesuaian Masuk (ADJ_IN)</option>
              <option value="ADJ_OUT">Penyesuaian Keluar (ADJ_OUT)</option>
            </select>
          </div>

          {/* Area Filter */}
          <div className="lg:col-span-3">
            <select
              id="selectAreaFilterMutasi"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#ff7a00] font-semibold"
            >
              <option value="ALL">Semua Area Gudang</option>
              {uniqueAreas.map((area) => (
                <option key={area} value={area}>
                  Area: {area}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content: Table / List of Logs */}
      <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-[#ff7a00] animate-spin" />
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Memuat data log mutasi dari Supabase...
            </span>
          </div>
        ) : fetchError ? (
          <div className="py-16 px-6 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Gagal Mengambil Data</div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{fetchError}</p>
            <button
              onClick={loadLogs}
              className="px-4 py-2 text-xs font-bold bg-[#ff7a00] text-white rounded-xl shadow-md cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <Package className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Tidak Ada Mutasi Log Ditemukan
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || typeFilter !== 'ALL' || areaFilter !== 'ALL'
                ? 'Tidak ada data yang sesuai dengan filter pencarian Anda.'
                : 'Belum ada riwayat mutasi produk di database.'}
            </p>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Tipe & Waktu</th>
                    <th className="py-3 px-4">Invoice</th>
                    <th className="py-3 px-4">SKU & Produk</th>
                    <th className="py-3 px-4">Lokasi & Area</th>
                    <th className="py-3 px-4 text-center">Qty</th>
                    <th className="py-3 px-4">Operator & Catatan</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredLogs.slice(0, displayLimit).map((item) => {
                    const isTypeIn = item.type === 'IN' || item.type === 'ADJ_IN';
                    const isAdj = item.type.startsWith('ADJ_');

                    return (
                      <tr
                        key={item.id || `${item.invoice}_${item.sku}_${Math.random()}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group"
                      >
                        {/* Type & Time */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                                item.type === 'IN'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                  : item.type === 'OUT'
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              }`}
                            >
                              {isTypeIn ? (
                                <ArrowDownLeft className="w-3 h-3" />
                              ) : (
                                <ArrowUpRight className="w-3 h-3" />
                              )}
                              {item.type}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono">
                            {item.created_at
                              ? new Date(item.created_at).toLocaleString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '-'}
                          </div>
                        </td>

                        {/* Invoice */}
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md text-[11px] select-all">
                            {item.invoice || '-'}
                          </span>
                        </td>

                        {/* SKU & Product */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-bold text-slate-900 dark:text-slate-100 font-mono flex items-center gap-1.5">
                            {item.sku}
                            {item.size && item.size !== '-' && item.size !== 'Default' && (
                              <span className="text-[10px] px-1.5 py-0.2 bg-slate-200/70 dark:bg-slate-700 rounded text-slate-700 dark:text-slate-300 font-sans">
                                {item.size}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.nama_produk || '-'}
                          </div>
                        </td>

                        {/* Location & Area */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 font-mono">
                            <MapPin className="w-3 h-3" />
                            {item.lokasi}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            {item.area || getAreaFromLokasi(item.lokasi)}
                          </div>
                        </td>

                        {/* Qty */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-lg font-black text-xs font-mono ${
                              isTypeIn
                                ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                : 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {item.qty}
                          </span>
                        </td>

                        {/* Operator & Note */}
                        <td className="py-3 px-4 max-w-[200px]">
                          <div className="font-medium text-slate-700 dark:text-slate-300 truncate text-[11px]">
                            {item.operator || '-'}
                          </div>
                          {item.keterangan && (
                            <div className="text-[10px] text-slate-400 truncate italic">
                              "{item.keterangan}"
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Invoice Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditInvoice(item.invoice)}
                              title="Edit Invoice ini (semua item dalam invoice)"
                              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-[#ff7a00] dark:hover:text-[#ff7a00] hover:bg-[#ff7a00]/10 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Single Item */}
                            <button
                              type="button"
                              onClick={() => handleDeleteSingleItem(item.id!, item.sku)}
                              title="Hapus baris ini saja"
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
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

            {/* Pagination / Show More */}
            {filteredLogs.length > displayLimit && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => setDisplayLimit((prev) => prev + 150)}
                  className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  Tampilkan Lebih Banyak ({filteredLogs.length - displayLimit} baris lagi)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: EDIT INVOICE (MENAMPILKAN SELURUH LIST PRODUK DALAM INVOICE YANG SAMA) */}
      {/* ========================================================================= */}
      {editingInvoice && (
        <div
          id="editInvoiceModalOverlay"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
        >
          <div
            id="editInvoiceModalBox"
            className="w-full max-w-4xl bg-white dark:bg-[#121216] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#ff7a00]/10 text-[#ff7a00] flex items-center justify-center shrink-0">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    Edit Mutasi Invoice:
                    <span className="font-mono bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[#ff7a00]">
                      {editingInvoice}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Memuat seluruh {editInvoiceItems.length} produk dalam nomor invoice yang sama. Edit kategori, SKU, dan lokasi rak.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteFullInvoice(editingInvoice)}
                  className="px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer border border-rose-500/20"
                  title="Hapus seluruh baris log dengan nomor invoice ini"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Hapus 1 Invoice Full</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingInvoice(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Product List in Invoice */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {isEditLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 text-[#ff7a00] animate-spin" />
                  <span className="text-xs text-slate-400">Memuat list item invoice...</span>
                </div>
              ) : editInvoiceItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Tidak ada item ditemukan dalam invoice ini.
                </div>
              ) : (
                <div className="space-y-3">
                  {editInvoiceItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-400">
                          Item #{idx + 1}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleDeleteSingleItem(item.id, item.sku, true)}
                          className="text-xs text-rose-500 hover:text-rose-600 font-bold flex items-center gap-1 cursor-pointer hover:underline"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Hapus Item Ini</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        {/* Type / Kategori */}
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Kategori Mutasi
                          </label>
                          <select
                            value={item.type}
                            onChange={(e) => handleItemFieldChange(idx, 'type', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 font-bold focus:ring-2 focus:ring-[#ff7a00]"
                          >
                            <option value="IN">IN (Barang Masuk)</option>
                            <option value="OUT">OUT (Barang Keluar)</option>
                            <option value="ADJ_IN">ADJ_IN (Penyesuaian Masuk)</option>
                            <option value="ADJ_OUT">ADJ_OUT (Penyesuaian Keluar)</option>
                          </select>
                        </div>

                        {/* SKU */}
                        <div className="sm:col-span-4">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Barcode SKU
                          </label>
                          <input
                            type="text"
                            value={item.sku}
                            onChange={(e) => handleItemFieldChange(idx, 'sku', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#ff7a00]"
                            placeholder="Contoh: F26DBH348CRL"
                          />
                        </div>

                        {/* Lokasi Rak */}
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Lokasi Rak (Area: {item.area || 'Warehouse'})
                          </label>
                          <input
                            type="text"
                            value={item.lokasi}
                            onChange={(e) => handleItemFieldChange(idx, 'lokasi', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs font-mono font-bold uppercase bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-indigo-600 dark:text-indigo-400 focus:ring-2 focus:ring-[#ff7a00]"
                            placeholder="Contoh: B038"
                          />
                        </div>

                        {/* Qty */}
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Qty
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => handleItemFieldChange(idx, 'qty', parseInt(e.target.value) || 1)}
                            className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#ff7a00]"
                          />
                        </div>

                        {/* Nama Produk (Auto-updated or manually edited) */}
                        <div className="sm:col-span-7">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Nama Produk
                          </label>
                          <input
                            type="text"
                            value={item.nama_produk}
                            onChange={(e) => handleItemFieldChange(idx, 'nama_produk', e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#ff7a00]"
                          />
                        </div>

                        {/* Keterangan */}
                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                            Catatan / Keterangan
                          </label>
                          <input
                            type="text"
                            value={item.keterangan}
                            onChange={(e) => handleItemFieldChange(idx, 'keterangan', e.target.value)}
                            placeholder="Alasan edit / keterangan"
                            className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#ff7a00]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Total item dalam invoice: <strong className="text-slate-900 dark:text-slate-100">{editInvoiceItems.length}</strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingInvoice(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="button"
                  disabled={isSavingEdit || editInvoiceItems.length === 0}
                  onClick={handleSaveInvoiceEdit}
                  className="px-5 py-2 text-xs font-bold bg-[#ff7a00] hover:bg-[#e66e00] text-white rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div
          id="confirmModalOverlay"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            id="confirmModalBox"
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
