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
  ChevronDown,
  ChevronUp,
  MapPin,
  ExternalLink,
  Layers,
  ArrowRight,
  Loader2,
  Info,
} from 'lucide-react';
import { ProductItem, StockRealtimeItem, UserSession } from '../types';
import {
  AnomalyItem,
  AnomalyCategory,
  scanAnomalies,
  fixNegativeStock,
  batchFixAllNegativeStocks,
  deleteCorruptedSkuRecord,
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
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Edit Name Modal State
  const [editingItem, setEditingItem] = useState<AnomalyItem | null>(null);
  const [newNameInput, setNewNameInput] = useState('');

  // Scan anomalies from catalog & stock
  const allAnomalies = useMemo(() => {
    return scanAnomalies(productCatalog, stockList);
  }, [productCatalog, stockList]);

  // Statistics counters
  const stats = useMemo(() => {
    let negativeStockCount = 0;
    let corruptedSkuCount = 0;
    let missingNameCount = 0;
    let orphanStockCount = 0;

    allAnomalies.forEach((a) => {
      if (a.categories.includes('NEGATIVE_STOCK')) negativeStockCount++;
      if (a.categories.includes('SKU_CORRUPTED')) corruptedSkuCount++;
      if (a.categories.includes('MISSING_NAME')) missingNameCount++;
      if (a.categories.includes('ORPHAN_STOCK')) orphanStockCount++;
    });

    return {
      total: allAnomalies.length,
      negativeStock: negativeStockCount,
      corruptedSku: corruptedSkuCount,
      missingName: missingNameCount,
      orphanStock: orphanStockCount,
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
    negativeQty: number
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
        userSession
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
        `Apakah Anda yakin ingin melakukan penyesuaian otomatis untuk SEMUA stok rak yang minus (${stats.negativeStock} produk)? Tindakan ini akan mencatat log penyesuaian (ADJ_IN) ke Supabase.`
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
      showToast(err.message || 'Gagal batch fix', 'error');
    } finally {
      setIsBatchFixing(false);
    }
  };

  // Delete / Clean Corrupted SKU
  const handleDeleteCorrupted = async (sku: string) => {
    if (
      !window.confirm(
        `Hapus data anomali SKU "${sku}" dari sistem WMS? Tindakan ini akan membersihkan data dari katalog master dan cache lokal.`
      )
    ) {
      return;
    }

    setActionLoadingId(sku);
    try {
      const res = await deleteCorruptedSkuRecord(sku);
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
      'Nama Produk',
      'Size',
      'Kategori Anomali',
      'Detail Masalah',
      'Rekomendasi Solusi',
      'Lokasi Rak & Stok Fisik',
      'Total Stok Gudang',
    ];

    const rows = filteredAnomalies.map((item, idx) => {
      const catText = item.categories
        .map((c) => {
          if (c === 'NEGATIVE_STOCK') return 'Stok Minus';
          if (c === 'SKU_CORRUPTED') return 'SKU Rusak';
          if (c === 'MISSING_NAME') return 'Nama Kosong';
          if (c === 'ORPHAN_STOCK') return 'Orphan (Tanpa Master)';
          return c;
        })
        .join('; ');

      const locText = item.locations.map((l) => `${l.lokasi}:${l.qty}`).join(' | ');

      return [
        idx + 1,
        `"${item.sku.replace(/"/g, '""')}"`,
        `"${item.nama_produk.replace(/"/g, '""')}"`,
        `"${(item.size || '-').replace(/"/g, '""')}"`,
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
                  Pusat Diagnostik & Pembersihan Anomali Data
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-rose-500 text-white rounded-full">
                  WMS Data Integrity
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Solusi otomatis untuk menangani SKU tidak beraturan, saldo rak minus (&lt; 0), dan sinkronisasi katalog fisik
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
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Stok Minus (&lt; 0)</span>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black mt-1 text-slate-900 dark:text-white">
                {stats.negativeStock.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Rak dengan saldo fisik negatif
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
                <span className="text-[11px] font-extrabold uppercase tracking-wider">SKU Rusak / Teks</span>
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black mt-1 text-slate-900 dark:text-white">
                {stats.corruptedSku.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Awalan strip (-), catatan PO, spasi
              </p>
            </div>

            <div
              onClick={() => setActiveTab('MISSING_NAME')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                activeTab === 'MISSING_NAME'
                  ? 'bg-blue-500/10 border-blue-500 ring-2 ring-blue-500/30'
                  : 'bg-white dark:bg-[#161F30] border-slate-200 dark:border-slate-800 hover:border-blue-400'
              }`}
            >
              <div className="flex items-center justify-between text-blue-500">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Nama Kosong</span>
                <Edit3 className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black mt-1 text-slate-900 dark:text-white">
                {stats.missingName.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Belum memiliki nama deskriptif
              </p>
            </div>

            <div
              onClick={() => setActiveTab('ORPHAN_STOCK')}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                activeTab === 'ORPHAN_STOCK'
                  ? 'bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/30'
                  : 'bg-white dark:bg-[#161F30] border-slate-200 dark:border-slate-800 hover:border-purple-400'
              }`}
            >
              <div className="flex items-center justify-between text-purple-500">
                <span className="text-[11px] font-extrabold uppercase tracking-wider">Stok Orphan</span>
                <Layers className="w-4 h-4" />
              </div>
              <div className="text-2xl font-black mt-1 text-slate-900 dark:text-white">
                {stats.orphanStock.toLocaleString('id-ID')}
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Ada di rak tapi belum di master
              </p>
            </div>
          </div>

          {/* EDUCATIONAL GUIDE ACCORDION: "SOLUSI & CARA PERBAIKAN DATA" */}
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setIsGuideOpen(!isGuideOpen)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-amber-500/10 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs font-black text-amber-900 dark:text-amber-200">
                  📘 Solusi & Cara Perbaikan Data Anomali (Panduan Lengkap)
                </span>
              </div>
              {isGuideOpen ? (
                <ChevronUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              )}
            </button>

            {isGuideOpen && (
              <div className="px-4 pb-4 pt-1 text-xs text-slate-600 dark:text-slate-300 space-y-3 border-t border-amber-500/10">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 bg-white dark:bg-[#161F30] rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="font-extrabold text-rose-500 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      1. Stok Rak Minus (&lt; 0)
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      <strong>Penyebab:</strong> Mutasi keluar (scan OUT / picking) tercatat lebih banyak dari riwayat stok masuk (IN) di rak tersebut, misal di rak <code>B037:-1</code>.
                    </p>
                    <p className="text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-400 font-medium">
                      <strong>Solusi:</strong> Klik tombol <strong>&ldquo;⚡ Reset ke 0&rdquo;</strong> untuk mencatat penyesuaian (Adjustment IN) ke Supabase sehingga saldo rak kembali 0 dan tidak minus.
                    </p>
                  </div>

                  <div className="p-3 bg-white dark:bg-[#161F30] rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="font-extrabold text-amber-500 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      2. SKU Rusak / Judul PO (- NAMA)
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      <strong>Penyebab:</strong> Saat input di POS/katalog, nama barang tidak sengaja dimasukkan ke kolom SKU dengan awalan strip (<code>- PRE ORDER...</code>).
                    </p>
                    <p className="text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-400 font-medium">
                      <strong>Solusi:</strong> Sistem otomatis menyembunyikan data ini dari tabel inventori. Anda juga bisa klik <strong>&ldquo;🗑️ Bersihkan SKU&rdquo;</strong> untuk menghapus catatan sampah ini.
                    </p>
                  </div>

                  <div className="p-3 bg-white dark:bg-[#161F30] rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="font-extrabold text-blue-500 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      3. Nama Produk Kosong
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      <strong>Penyebab:</strong> Data produk diinput hanya dengan SKU tanpa deskripsi nama baju/model, sehingga nama tampil sama dengan SKU.
                    </p>
                    <p className="text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-400 font-medium">
                      <strong>Solusi:</strong> Klik tombol <strong>&ldquo;✏️ Perbaiki Nama&rdquo;</strong> untuk mengisi nama deskripsi resmi agar tercatat rapi di Supabase.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ACTION BAR: SEARCH, TABS, BATCH ACTIONS */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-1">
            {/* TABS */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-[#0E1420] p-1 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('ALL')}
                className={`px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer ${
                  activeTab === 'ALL'
                    ? 'bg-white dark:bg-[#1A2333] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Semua ({allAnomalies.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('NEGATIVE_STOCK')}
                className={`px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer ${
                  activeTab === 'NEGATIVE_STOCK'
                    ? 'bg-rose-500 text-white shadow-xs'
                    : 'text-rose-500 hover:bg-rose-500/10'
                }`}
              >
                Stok Minus ({stats.negativeStock})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('SKU_CORRUPTED')}
                className={`px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer ${
                  activeTab === 'SKU_CORRUPTED'
                    ? 'bg-amber-500 text-black shadow-xs'
                    : 'text-amber-500 hover:bg-amber-500/10'
                }`}
              >
                SKU Rusak ({stats.corruptedSku})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('MISSING_NAME')}
                className={`px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer ${
                  activeTab === 'MISSING_NAME'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-blue-500 hover:bg-blue-500/10'
                }`}
              >
                Nama Kosong ({stats.missingName})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ORPHAN_STOCK')}
                className={`px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer ${
                  activeTab === 'ORPHAN_STOCK'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-purple-500 hover:bg-purple-500/10'
                }`}
              >
                Orphan ({stats.orphanStock})
              </button>
            </div>

            {/* SEARCH & ACTIONS */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari SKU, nama, lokasi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              {/* BATCH FIX NEGATIVE STOCKS */}
              {stats.negativeStock > 0 && (
                <button
                  type="button"
                  disabled={isBatchFixing}
                  onClick={handleBatchFixNegative}
                  className="px-3 py-1.5 text-xs font-black bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 shrink-0"
                  title="Otomatis sesuaikan semua stok rak minus menjadi 0"
                >
                  {isBatchFixing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>Reset Semua Minus ({stats.negativeStock})</span>
                </button>
              )}

              {/* EXPORT CSV */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3 py-1.5 text-xs font-extrabold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                title="Unduh laporan anomali data"
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
                  Semua data pada kategori ini sudah bersih, terformat dengan baik, dan tidak memiliki saldo minus.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[#0E1420] border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-3 px-3 text-center w-12">No</th>
                      <th className="py-3 px-3">SKU & Produk</th>
                      <th className="py-3 px-3">Kategori Masalah</th>
                      <th className="py-3 px-3">Lokasi & Stok Fisik</th>
                      <th className="py-3 px-3">Detail & Penyebab</th>
                      <th className="py-3 px-3 text-right">Aksi Solusi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {filteredAnomalies.map((item, index) => {
                      const hasNegative = item.negativeLocations.length > 0;
                      const isCorrupted = item.categories.includes('SKU_CORRUPTED');
                      const isMissingName = item.categories.includes('MISSING_NAME');

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {index + 1}
                          </td>

                          {/* SKU & Product */}
                          <td className="py-3 px-3 min-w-[200px] max-w-[280px]">
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
                                if (cat === 'SKU_CORRUPTED') {
                                  return (
                                    <span
                                      key={cat}
                                      className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 w-fit"
                                    >
                                      <ShieldAlert className="w-3 h-3" />
                                      Format SKU Rusak
                                    </span>
                                  );
                                }
                                if (cat === 'MISSING_NAME') {
                                  return (
                                    <span
                                      key={cat}
                                      className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 w-fit"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      Nama Kosong
                                    </span>
                                  );
                                }
                                return (
                                  <span
                                    key={cat}
                                    className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 w-fit"
                                  >
                                    <Layers className="w-3 h-3" />
                                    Orphan Stock
                                  </span>
                                );
                              })}
                            </div>
                          </td>

                          {/* Locations & Stock */}
                          <td className="py-3 px-3 min-w-[150px]">
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
                          <td className="py-3 px-3 min-w-[220px] max-w-[320px]">
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
                                          negLoc.qty
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

                              {/* Edit Name Button */}
                              {isMissingName && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItem(item);
                                    setNewNameInput(
                                      item.nama_produk !== item.sku
                                        ? item.nama_produk
                                        : ''
                                    );
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                                  title="Lengkapi nama produk resmi"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Isi Nama</span>
                                </button>
                              )}

                              {/* Delete / Clean Corrupted SKU */}
                              {isCorrupted && (
                                <button
                                  type="button"
                                  disabled={actionLoadingId === item.sku}
                                  onClick={() => handleDeleteCorrupted(item.sku)}
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
            className="px-4 py-2 font-bold bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 rounded-xl transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* EDIT NAME MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-700 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-500" />
                Perbarui Nama Produk
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">
                Kode SKU
              </label>
              <div className="font-mono font-bold text-sm text-amber-500 mt-0.5">
                {editingItem.sku}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase">
                Nama Produk Lengkap
              </label>
              <input
                type="text"
                autoFocus
                placeholder="Contoh: Evelyn Blouse Brown"
                value={newNameInput}
                onChange={(e) => setNewNameInput(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 dark:bg-[#0E1420] border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={actionLoadingId === `edit_${editingItem.sku}`}
                onClick={handleSaveName}
                className="px-4 py-1.5 text-xs font-black bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {actionLoadingId === `edit_${editingItem.sku}` && (
                  <Loader2 className="w-3 h-3 animate-spin" />
                )}
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
