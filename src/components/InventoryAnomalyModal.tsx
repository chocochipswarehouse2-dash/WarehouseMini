import React, { useState, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  Edit3,
  RefreshCw,
  Download,
  Search,
  Zap,
  HelpCircle,
  MapPin,
  Layers,
  Loader2,
  ArrowRightLeft,
  Check,
} from 'lucide-react';
import { ProductItem, StockRealtimeItem, UserSession } from '../types';
import {
  AnomalyItem,
  AnomalyCategory,
  scanAnomalies,
  fixNegativeStock,
  batchFixAllNegativeStocks,
  syncStockWithMaster,
  batchSyncAllWithMaster,
  deleteCorruptedSkuRecord,
  batchDeleteCorruptedSkus,
  updateProductName,
} from '../utils/anomalyUtils';

interface InventoryAnomalyModalProps {
  isOpen: boolean;
  onClose: () => void;
  productCatalog: ProductItem[];
  stockList: StockRealtimeItem[];
  userSession?: UserSession | null;
  onDataFixed?: () => void;
}

export const InventoryAnomalyModal: React.FC<InventoryAnomalyModalProps> = ({
  isOpen,
  onClose,
  productCatalog,
  stockList,
  userSession,
  onDataFixed,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | AnomalyCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGuideOpen, setIsGuideOpen] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isBatchFixing, setIsBatchFixing] = useState(false);
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [isBatchPurging, setIsBatchPurging] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Edit Name Modal State
  const [editingItem, setEditingItem] = useState<AnomalyItem | null>(null);
  const [newNameInput, setNewNameInput] = useState('');

  // Scan anomalies from catalog & physical stock
  const allAnomalies = useMemo(() => {
    return scanAnomalies(productCatalog, stockList);
  }, [productCatalog, stockList]);

  // Statistics counters
  const stats = useMemo(() => {
    let negativeStockCount = 0;
    let mismatchMasterCount = 0;
    let skuNotInMasterCount = 0;
    let corruptedSkuCount = 0;

    allAnomalies.forEach((a) => {
      if (a.categories.includes('NEGATIVE_STOCK')) negativeStockCount++;
      if (a.categories.includes('MISMATCH_MASTER_DATA')) mismatchMasterCount++;
      if (a.categories.includes('SKU_NOT_IN_MASTER')) skuNotInMasterCount++;
      if (a.categories.includes('SKU_CORRUPTED')) corruptedSkuCount++;
    });

    return {
      total: allAnomalies.length,
      negativeStock: negativeStockCount,
      mismatchMaster: mismatchMasterCount,
      skuNotInMaster: skuNotInMasterCount,
      corruptedSku: corruptedSkuCount,
    };
  }, [allAnomalies]);

  // Filtered by tab and search
  const filteredAnomalies = useMemo(() => {
    let list = allAnomalies;

    if (activeTab !== 'ALL') {
      list = list.filter((a) => a.categories.includes(activeTab));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (a) =>
          a.sku.toLowerCase().includes(q) ||
          a.nama_produk.toLowerCase().includes(q) ||
          (a.master_nama_produk && a.master_nama_produk.toLowerCase().includes(q)) ||
          a.locations.some((l) => l.lokasi.toLowerCase().includes(q))
      );
    }

    return list;
  }, [allAnomalies, activeTab, searchQuery]);

  if (!isOpen) return null;

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // 1-Click Fix for Single Negative Location
  const handleFixNegative = async (
    item: AnomalyItem,
    lokasi: string,
    negativeQty: number,
    area?: string
  ) => {
    const actionKey = `${item.sku}_${lokasi}`;
    setActionLoadingId(actionKey);
    try {
      const res = await fixNegativeStock(
        item.sku,
        lokasi,
        negativeQty,
        item.nama_produk,
        item.size,
        userSession,
        area
      );
      if (res.success) {
        showToast(res.message, 'success');
        if (onDataFixed) onDataFixed();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbaiki stok minus', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Batch Fix All Negative Stocks
  const handleBatchFixNegative = async () => {
    if (
      !window.confirm(
        `Apakah Anda yakin ingin melakukan penyesuaian otomatis untuk SEMUA stok rak fisik yang minus (${stats.negativeStock} produk)? Tindakan ini akan mencatat log penyesuaian (ADJ_IN) ke Supabase agar saldo rak kembali netral (0).`
      )
    ) {
      return;
    }

    setIsBatchFixing(true);
    try {
      const res = await batchFixAllNegativeStocks(allAnomalies, userSession);
      if (res.success) {
        showToast(
          `Berhasil menetralkan ${res.fixedCount} lokasi rak yang minus ke saldo 0.`,
          'success'
        );
        if (onDataFixed) onDataFixed();
      } else {
        showToast(
          `Terjadi kesalahan saat batch fix: ${res.errors.join(', ')}`,
          'error'
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal batch fix stok minus', 'error');
    } finally {
      setIsBatchFixing(false);
    }
  };

  // 1-Click Sync Single Item with Master Product
  const handleSyncToMaster = async (item: AnomalyItem) => {
    if (!item.master_nama_produk) {
      showToast('Data master produk tidak ditemukan untuk SKU ini', 'error');
      return;
    }

    const actionKey = `sync_${item.sku}`;
    setActionLoadingId(actionKey);
    try {
      const res = await syncStockWithMaster(
        item.sku,
        item.master_nama_produk,
        item.master_size || '-'
      );
      if (res.success) {
        showToast(res.message, 'success');
        if (onDataFixed) onDataFixed();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menyinkronkan data dengan master', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Batch Sync All Mismatched Items with Master Product
  const handleBatchSyncMaster = async () => {
    if (
      !window.confirm(
        `Sinkronkan SEMUA nama dan size produk (${stats.mismatchMaster} item) agar persis sesuai dengan data Master Produk? Nama/size yang menyimpang akan diluruskan.`
      )
    ) {
      return;
    }

    setIsBatchSyncing(true);
    try {
      const res = await batchSyncAllWithMaster(allAnomalies);
      if (res.success) {
        showToast(
          `Berhasil meluruskan ${res.syncedCount} nama dan size produk ke Master Produk.`,
          'success'
        );
        if (onDataFixed) onDataFixed();
      } else {
        showToast(
          `Selesai dengan beberapa catatan: ${res.errors.slice(0, 3).join(', ')}`,
          'error'
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal batch sync ke master', 'error');
    } finally {
      setIsBatchSyncing(false);
    }
  };

  // Delete / Clean Corrupted SKU
  const handleDeleteCorrupted = async (item: AnomalyItem) => {
    if (
      !window.confirm(
        `Hapus data anomali SKU "${item.sku}" dari sistem WMS? Tindakan ini akan men-nol-kan seluruh stok fisiknya dan membersihkan data dari katalog master serta cache lokal.`
      )
    ) {
      return;
    }

    setActionLoadingId(item.sku);
    try {
      const res = await deleteCorruptedSkuRecord(item, userSession);
      if (res.success) {
        showToast(res.message, 'success');
        if (onDataFixed) onDataFixed();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus data', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Batch Delete/Purge All Corrupted/Orphan SKUs
  const handleBatchPurgeCorrupted = async () => {
    // Collect all SKUs that need purging
    const itemsToPurge = allAnomalies.filter(
      (a) => a.categories.includes('SKU_CORRUPTED') || a.categories.includes('SKU_NOT_IN_MASTER')
    );

    if (itemsToPurge.length === 0) return;

    if (
      !window.confirm(
        `Apakah Anda yakin ingin MENGHAPUS MASSAL ${itemsToPurge.length} data anomali (SKU Rusak / Tanpa Master)? Tindakan ini akan men-nol-kan seluruh stok fisiknya dan membuang datanya secara permanen.`
      )
    ) {
      return;
    }

    setIsBatchPurging(true);
    try {
      const res = await batchDeleteCorruptedSkus(itemsToPurge, userSession);
      if (res.success) {
        showToast(res.message, 'success');
        if (onDataFixed) onDataFixed();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      console.error('Error batch purging:', err);
      showToast(err.message || 'Gagal menghapus data secara massal', 'error');
    } finally {
      setIsBatchPurging(false);
    }
  };

  // Save New Name
  const handleSaveName = async () => {
    if (!editingItem) return;
    if (!newNameInput.trim()) {
      showToast('Nama produk tidak boleh kosong', 'error');
      return;
    }

    setActionLoadingId(`edit_${editingItem.sku}`);
    try {
      const res = await updateProductName(editingItem.sku, newNameInput.trim());
      if (res.success) {
        showToast(res.message, 'success');
        setEditingItem(null);
        setNewNameInput('');
        if (onDataFixed) onDataFixed();
      } else {
        showToast(res.message, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan nama', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredAnomalies.length === 0) {
      showToast('Tidak ada data anomali untuk diekspor', 'info');
      return;
    }

    const headers = [
      'No',
      'SKU',
      'Nama Produk di Stok',
      'Size di Stok',
      'Nama Resmi Master',
      'Size Resmi Master',
      'Kategori Anomali',
      'Detail Masalah',
      'Rekomendasi Solusi',
      'Lokasi Rak & Stok Fisik',
      'Total Stok Fisik Gudang',
    ];

    const rows = filteredAnomalies.map((item, idx) => {
      const catText = item.categories
        .map((c) => {
          if (c === 'NEGATIVE_STOCK') return 'Stok Fisik Minus';
          if (c === 'MISMATCH_MASTER_DATA') return 'Beda Master';
          if (c === 'SKU_NOT_IN_MASTER') return 'Tanpa Master';
          if (c === 'SKU_CORRUPTED') return 'SKU Rusak';
          return c;
        })
        .join('; ');

      const locText = item.locations.map((l) => `${l.lokasi}:${l.qty}`).join(' | ');

      return [
        idx + 1,
        `"${item.sku.replace(/"/g, '""')}"`,
        `"${item.nama_produk.replace(/"/g, '""')}"`,
        `"${(item.size || '-').replace(/"/g, '""')}"`,
        `"${(item.master_nama_produk || '-').replace(/"/g, '""')}"`,
        `"${(item.master_size || '-').replace(/"/g, '""')}"`,
        `"${catText}"`,
        `"${item.reasons.join('; ').replace(/"/g, '""')}"`,
        `"${item.recommendations.join('; ').replace(/"/g, '""')}"`,
        `"${locText}"`,
        item.totalFisikGudang,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `laporan_anomali_inventori_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Laporan anomali CSV berhasil diunduh', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#121927] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-[#161F30]/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 shrink-0 shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white">
                  Pusat Diagnostik &amp; Rekonsiliasi Anomali Data
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white rounded-full">
                  Master Produk Standard
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Penyelarasan nama &amp; size ke Master Produk via lookup SKU, serta penetralan stok fisik minus di rak gudang
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TOAST MESSAGE */}
        {toastMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 shrink-0 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-500 text-white'
                : toastMessage.type === 'error'
                ? 'bg-rose-600 text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="flex-1">{toastMessage.text}</span>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-white/80 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* BODY CONTAINER */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* STATS SUMMARY CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              onClick={() => setActiveTab('NEGATIVE_STOCK')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                activeTab === 'NEGATIVE_STOCK'
                  ? 'bg-rose-500/10 border-rose-500 ring-2 ring-rose-500/30'
                  : 'bg-white dark:bg-[#161F30] border-slate-200 dark:border-slate-800 hover:border-rose-400'
              }`}
            >
              <div className="flex items-center justify-between text-rose-500">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Stok Fisik Minus</span>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black mt-1 text-slate-900 dark:text-white">
                {stats.negativeStock.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Stok fisik rak &lt; 0 (DealPOS diabaikan)
              </p>
            </div>

            <div
              onClick={() => setActiveTab('MISMATCH_MASTER_DATA')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                activeTab === 'MISMATCH_MASTER_DATA'
                  ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/30'
                  : 'bg-white dark:bg-[#161F30] border-slate-200 dark:border-slate-800 hover:border-emerald-400'
              }`}
            >
              <div className="flex items-center justify-between text-emerald-500">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Beda Master Produk</span>
                <ArrowRightLeft className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black mt-1 text-slate-900 dark:text-white">
                {stats.mismatchMaster.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Nama/size menyimpang dari master
              </p>
            </div>

            <div
              onClick={() => setActiveTab('SKU_NOT_IN_MASTER')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                activeTab === 'SKU_NOT_IN_MASTER'
                  ? 'bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/30'
                  : 'bg-white dark:bg-[#161F30] border-slate-200 dark:border-slate-800 hover:border-purple-400'
              }`}
            >
              <div className="flex items-center justify-between text-purple-500">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">SKU Tanpa Master</span>
                <Layers className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black mt-1 text-slate-900 dark:text-white">
                {stats.skuNotInMaster.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Ada di rak tapi belum di master
              </p>
            </div>

            <div
              onClick={() => setActiveTab('SKU_CORRUPTED')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                activeTab === 'SKU_CORRUPTED'
                  ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/30'
                  : 'bg-white dark:bg-[#161F30] border-slate-200 dark:border-slate-800 hover:border-amber-400'
              }`}
            >
              <div className="flex items-center justify-between text-amber-500">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">SKU Rusak</span>
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black mt-1 text-slate-900 dark:text-white">
                {stats.corruptedSku.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Awalan strip (-), catatan PO, spasi
              </p>
            </div>
          </div>

          {/* EDUCATIONAL GUIDE ACCORDION: "STANDAR ACUAN DATA MASTER PRODUK" */}
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setIsGuideOpen(!isGuideOpen)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-emerald-500/10 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span className="text-xs font-black text-emerald-900 dark:text-emerald-200">
                  📘 Standar Acuan &amp; Aturan Baku Integritas Data WMS
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {isGuideOpen ? 'Tutup Panduan' : 'Buka Panduan'}
              </span>
            </button>

            {isGuideOpen && (
              <div className="p-4 sm:p-5 pt-1 space-y-3 text-xs border-t border-emerald-500/15 text-slate-700 dark:text-slate-300">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-white dark:bg-[#161F30] rounded-xl border border-emerald-200 dark:border-emerald-900/50">
                    <div className="font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mb-1.5">
                      <Check className="w-4 h-4" />
                      1. Master Produk = Source of Truth
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      Nama produk &amp; size asli dari master produk <strong>BUKAN anomali</strong>. Seluruh penamaan dan ukuran mengacu pada lookup SKU ke master produk.
                    </p>
                  </div>

                  <div className="p-3 bg-white dark:bg-[#161F30] rounded-xl border border-emerald-200 dark:border-emerald-900/50">
                    <div className="font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 mb-1.5">
                      <ArrowRightLeft className="w-4 h-4" />
                      2. Mismatch Nama &amp; Size = Anomali
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      Nama atau size hasil input / kalkulasi yang berbeda dari data master produk adalah anomali. Gunakan tombol <strong>"Sinkronkan ke Master"</strong> untuk meluruskan secara otomatis.
                    </p>
                  </div>

                  <div className="p-3 bg-white dark:bg-[#161F30] rounded-xl border border-emerald-200 dark:border-emerald-900/50">
                    <div className="font-extrabold text-rose-600 dark:text-rose-400 flex items-center gap-1.5 mb-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      3. Qty Minus DealPOS Bukan Anomali
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      Qty minus pada DealPOS adalah kuota pesanan backlog kasir dan <strong>BUKAN anomali</strong> yang perlu disanitasi. Anomali qty <strong>hanya berlaku jika stok fisik di rak gudang bertanda minus</strong> (&lt; 0).
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* TOOLBAR & TABS */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 ${
                  activeTab === 'ALL'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                Semua ({allAnomalies.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('NEGATIVE_STOCK')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeTab === 'NEGATIVE_STOCK'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Stok Minus ({stats.negativeStock})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('MISMATCH_MASTER_DATA')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeTab === 'MISMATCH_MASTER_DATA'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                }`}
              >
                <ArrowRightLeft className="w-3 h-3" />
                <span>Beda Master ({stats.mismatchMaster})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('SKU_NOT_IN_MASTER')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeTab === 'SKU_NOT_IN_MASTER'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Tanpa Master ({stats.skuNotInMaster})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('SKU_CORRUPTED')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  activeTab === 'SKU_CORRUPTED'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                }`}
              >
                <ShieldAlert className="w-3 h-3" />
                <span>SKU Rusak ({stats.corruptedSku})</span>
              </button>
            </div>

            {/* Search & Actions */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari SKU, nama produk, rak..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8.5 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* BATCH ACTION: SINKRONKAN SEMUA KE MASTER */}
              {stats.mismatchMaster > 0 && (activeTab === 'ALL' || activeTab === 'MISMATCH_MASTER_DATA') && (
                <button
                  type="button"
                  disabled={isBatchSyncing}
                  onClick={handleBatchSyncMaster}
                  className="px-3 py-1.5 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
                  title="Sinkronkan seluruh nama & size yang berbeda ke data Master Produk"
                >
                  {isBatchSyncing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  )}
                  <span>Sinkronkan ke Master ({stats.mismatchMaster})</span>
                </button>
              )}

              {/* BATCH ACTION: RESET SEMUA STOK MINUS */}
              {stats.negativeStock > 0 && (activeTab === 'ALL' || activeTab === 'NEGATIVE_STOCK') && (
                <button
                  type="button"
                  disabled={isBatchFixing}
                  onClick={handleBatchFixNegative}
                  className="px-3 py-1.5 text-xs font-extrabold bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
                  title="Netralkan seluruh stok fisik rak yang bertanda minus ke saldo 0"
                >
                  {isBatchFixing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>Reset Stok Minus ({stats.negativeStock})</span>
                </button>
              )}

              {/* BATCH ACTION: BERSIHKAN SKU RUSAK / TANPA MASTER */}
              {(stats.corruptedSku > 0 || stats.skuNotInMaster > 0) &&
                (activeTab === 'ALL' ||
                  activeTab === 'SKU_CORRUPTED' ||
                  activeTab === 'SKU_NOT_IN_MASTER') && (
                  <button
                    type="button"
                    disabled={isBatchPurging}
                    onClick={handleBatchPurgeCorrupted}
                    className="px-3 py-1.5 text-xs font-extrabold bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
                    title="Hapus massal SKU sampah dan netralkan stok fisiknya"
                  >
                    {isBatchPurging ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>Bersihkan Semua ({stats.corruptedSku + stats.skuNotInMaster})</span>
                  </button>
                )}

              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3 py-1.5 text-xs font-extrabold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Unduh laporan anomali data CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">CSV</span>
              </button>
            </div>
          </div>

          {/* TABLE OF ANOMALIES */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#161F30]">
            {filteredAnomalies.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Tidak Ada Anomali Ditemukan
                </div>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Semua data pada kategori ini sudah bersih, terformat dengan baik, sesuai dengan data Master Produk, dan tidak memiliki saldo rak minus.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[#0E1420] border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-3 text-center w-12">No</th>
                      <th className="py-3 px-3">SKU &amp; Nama Produk</th>
                      <th className="py-3 px-3">Data Master Produk (Lookup)</th>
                      <th className="py-3 px-3">Kategori Anomali</th>
                      <th className="py-3 px-3">Lokasi &amp; Stok Fisik</th>
                      <th className="py-3 px-3">Detail &amp; Penyebab</th>
                      <th className="py-3 px-3 text-right">Aksi Solusi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {filteredAnomalies.map((item, index) => {
                      const hasNegative = item.negativeLocations.length > 0;
                      const isCorrupted = item.categories.includes('SKU_CORRUPTED');
                      const isMismatch = item.categories.includes('MISMATCH_MASTER_DATA');
                      const isNotInMaster = item.categories.includes('SKU_NOT_IN_MASTER');

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {index + 1}
                          </td>

                          {/* SKU & Product (Current in Stock) */}
                          <td className="py-3 px-3 min-w-[200px] max-w-[260px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md ${
                                  isCorrupted
                                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                                }`}
                              >
                                {item.sku}
                              </span>
                              {item.size && item.size !== '-' && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-200 dark:bg-slate-700 rounded text-slate-600 dark:text-slate-300">
                                  {item.size}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-1">
                              {item.nama_produk}
                            </div>
                          </td>

                          {/* Master Product Comparison (Lookup Result) */}
                          <td className="py-3 px-3 min-w-[200px] max-w-[260px]">
                            {item.master_nama_produk ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                    Master
                                  </span>
                                  <span className="text-[10px] font-mono font-bold text-slate-500">
                                    Size: {item.master_size || '-'}
                                  </span>
                                </div>
                                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                                  {item.master_nama_produk}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-rose-500 italic font-semibold">
                                Tidak ada di Master
                              </span>
                            )}
                          </td>

                          {/* Categories Badges */}
                          <td className="py-3 px-3 min-w-[140px]">
                            <div className="flex flex-col gap-1">
                              {item.categories.map((cat) => {
                                if (cat === 'NEGATIVE_STOCK') {
                                  return (
                                    <span
                                      key={cat}
                                      className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 w-fit"
                                    >
                                      <AlertTriangle className="w-3 h-3" />
                                      Stok Rak Minus
                                    </span>
                                  );
                                }
                                if (cat === 'MISMATCH_MASTER_DATA') {
                                  return (
                                    <span
                                      key={cat}
                                      className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 w-fit"
                                    >
                                      <ArrowRightLeft className="w-3 h-3" />
                                      Beda Master
                                    </span>
                                  );
                                }
                                if (cat === 'SKU_NOT_IN_MASTER') {
                                  return (
                                    <span
                                      key={cat}
                                      className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 w-fit"
                                    >
                                      <Layers className="w-3 h-3" />
                                      Tanpa Master
                                    </span>
                                  );
                                }
                                return (
                                  <span
                                    key={cat}
                                    className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 w-fit"
                                  >
                                    <ShieldAlert className="w-3 h-3" />
                                    Format SKU Rusak
                                  </span>
                                );
                              })}
                            </div>
                          </td>

                          {/* Locations & Physical Stock */}
                          <td className="py-3 px-3 min-w-[140px]">
                            {item.locations.length === 0 ? (
                              <span className="text-[11px] text-slate-400 italic">
                                Tidak ada lokasi (0)
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {item.locations.map((loc, i) => (
                                  <span
                                    key={i}
                                    className={`inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                      loc.qty < 0
                                        ? 'bg-rose-600 text-white animate-pulse'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    <MapPin className="w-2.5 h-2.5 opacity-70" />
                                    {loc.lokasi}: {loc.qty}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 mt-1">
                              Total Fisik:{' '}
                              <strong
                                className={
                                  item.totalFisikGudang < 0
                                    ? 'text-rose-500 font-black'
                                    : 'text-slate-700 dark:text-slate-300'
                                }
                              >
                                {item.totalFisikGudang}
                              </strong>
                            </div>
                          </td>

                          {/* Reasons & Recommendations */}
                          <td className="py-3 px-3 min-w-[200px] max-w-[300px]">
                            <ul className="text-[11px] text-slate-600 dark:text-slate-300 list-disc list-inside space-y-0.5">
                              {item.reasons.map((r, ri) => (
                                <li key={ri}>{r}</li>
                              ))}
                            </ul>
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                              💡 {item.recommendations[0]}
                            </div>
                          </td>

                          {/* Action Buttons */}
                          <td className="py-3 px-3 text-right min-w-[160px]">
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {/* 1-Click Sync to Master Button */}
                              {isMismatch && item.master_nama_produk && (
                                <button
                                  type="button"
                                  disabled={actionLoadingId === `sync_${item.sku}`}
                                  onClick={() => handleSyncToMaster(item)}
                                  className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-xs"
                                  title="Sinkronkan nama & size ke Master Produk"
                                >
                                  {actionLoadingId === `sync_${item.sku}` ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <ArrowRightLeft className="w-3 h-3" />
                                  )}
                                  <span>Sinkronkan ke Master</span>
                                </button>
                              )}

                              {/* Fix Negative Stock Button */}
                              {hasNegative &&
                                item.negativeLocations.map((negLoc) => {
                                  const actionKey = `${item.sku}_${negLoc.lokasi}`;
                                  const isLoadingThis = actionLoadingId === actionKey;

                                  return (
                                    <button
                                      key={negLoc.lokasi}
                                      type="button"
                                      disabled={isLoadingThis}
                                      onClick={() =>
                                        handleFixNegative(
                                          item,
                                          negLoc.lokasi,
                                          negLoc.qty,
                                          negLoc.area
                                        )
                                      }
                                      className="px-2.5 py-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-xs"
                                      title={`Reset stok minus di rak ${negLoc.lokasi} ke 0`}
                                    >
                                      {isLoadingThis ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Zap className="w-3 h-3" />
                                      )}
                                      <span>Reset {negLoc.lokasi} ke 0</span>
                                    </button>
                                  );
                                })}

                              {/* Delete / Clean Corrupted SKU or Orphan */}
                              {(isCorrupted || isNotInMaster) && (
                                <button
                                  type="button"
                                  disabled={actionLoadingId === item.sku}
                                  onClick={() => handleDeleteCorrupted(item)}
                                  className="px-2.5 py-1 text-[11px] font-bold bg-slate-200 dark:bg-slate-700 hover:bg-rose-500 hover:text-white text-slate-700 dark:text-slate-200 rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="Bersihkan / hapus SKU sampah ini"
                                >
                                  {actionLoadingId === item.sku ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                  <span>Hapus</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-[#161F30]/70 shrink-0 text-xs">
          <div className="text-slate-500 dark:text-slate-400">
            Menampilkan <strong>{filteredAnomalies.length}</strong> dari{' '}
            <strong>{allAnomalies.length}</strong> anomali data terdeteksi
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
