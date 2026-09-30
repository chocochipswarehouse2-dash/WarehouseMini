import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Calendar,
  X,
  Send,
  ExternalLink,
  Layers,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CalendarDays,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { PenerimaanProduksiItem, ProductItem } from '../../types';
import {
  pushProduksiPerTanggalToGoogleSheet,
  formatDateTabName,
  formatDateIndo,
} from '../../services/gasProduksiSync';
import { MatrixProductBlock } from './ProduksiSpreadsheetView';
import { alignItemWithMasterProduct, buildProductLookupMap } from '../../utils/productLookup';

interface PushDateSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataList: PenerimaanProduksiItem[];
  blocks?: MatrixProductBlock[];
  activeTab: 'CMT' | 'Kargo';
  initialDateFilter?: string | null; // e.g. '2026-09-26' or 'all'
  productCatalog?: ProductItem[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const PushDateSheetsModal: React.FC<PushDateSheetsModalProps> = ({
  isOpen,
  onClose,
  dataList,
  blocks,
  activeTab: initialActiveTab,
  initialDateFilter,
  productCatalog = [],
  onShowToast,
}) => {
  // Category state inside modal (allows switching between CMT and Kargo on the fly)
  const [currentTab, setCurrentTab] = useState<'CMT' | 'Kargo'>(initialActiveTab || 'CMT');

  // Pre-build product lookup map to ensure names & sizes match master catalog
  const catalogMap = useMemo(() => buildProductLookupMap(productCatalog), [productCatalog]);

  // Align items with master catalog
  const sanitizedItems = useMemo(() => {
    return dataList.map((it) => {
      const aligned = alignItemWithMasterProduct(
        {
          sku: it.kode_produksi,
          nama_produk: it.nama_produk,
          size: it.size,
        },
        catalogMap
      );
      return {
        ...it,
        nama_produk: aligned.nama_produk || it.nama_produk,
        size: aligned.size || it.size,
      };
    });
  }, [dataList, catalogMap]);

  // Filter items by category matching currentTab
  const categoryItems = useMemo(() => {
    return sanitizedItems.filter((it) => {
      if (currentTab === 'CMT') {
        return !it.kategori || it.kategori === 'Lokal CMT';
      }
      return it.kategori === 'Kargo';
    });
  }, [sanitizedItems, currentTab]);

  // Count distinct dates per category
  const cmtDatesCount = useMemo(() => {
    const s = new Set<string>();
    sanitizedItems.forEach((it) => {
      if ((!it.kategori || it.kategori === 'Lokal CMT') && it.tanggal_penerimaan) s.add(it.tanggal_penerimaan.trim());
    });
    return s.size;
  }, [sanitizedItems]);

  const kargoDatesCount = useMemo(() => {
    const s = new Set<string>();
    sanitizedItems.forEach((it) => {
      if (it.kategori === 'Kargo' && it.tanggal_penerimaan) s.add(it.tanggal_penerimaan.trim());
    });
    return s.size;
  }, [sanitizedItems]);

  // Extract all distinct dates in category items
  const availableDates = useMemo(() => {
    const datesSet = new Set<string>();
    categoryItems.forEach((it) => {
      if (it.tanggal_penerimaan) datesSet.add(it.tanggal_penerimaan.trim());
    });
    if (blocks && currentTab === initialActiveTab) {
      blocks.forEach((b) => {
        b.dateSlots.forEach((d) => {
          if (d) datesSet.add(d.trim());
        });
      });
    }
    return Array.from(datesSet).sort().reverse();
  }, [categoryItems, blocks, currentTab, initialActiveTab]);

  // Determine initial mode & selected date
  const hasInitialDate = !!(initialDateFilter && initialDateFilter !== 'all' && availableDates.includes(initialDateFilter));

  const [mode, setMode] = useState<'single' | 'all'>(() => (hasInitialDate ? 'single' : 'all'));
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (hasInitialDate && initialDateFilter) return initialDateFilter;
    return availableDates[0] || '';
  });

  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [lastSheetUrl, setLastSheetUrl] = useState<string | null>(null);

  // Sync state if modal reopens or tab switches
  React.useEffect(() => {
    if (isOpen) {
      if (initialDateFilter && initialDateFilter !== 'all' && availableDates.includes(initialDateFilter)) {
        setMode('single');
        setSelectedDate(initialDateFilter);
      } else {
        if (availableDates.length > 0 && !availableDates.includes(selectedDate)) {
          setSelectedDate(availableDates[0]);
        }
      }
      setLastSheetUrl(null);
    }
  }, [isOpen, initialDateFilter, availableDates, currentTab]);

  // Summary per Date for Preview
  const dateSummaries = useMemo(() => {
    return availableDates.map((dStr) => {
      const dateItems = categoryItems.filter((it) => it.tanggal_penerimaan === dStr);
      const totalQty = dateItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
      const uniqueCodes = Array.from(new Set(dateItems.map((it) => it.kode_produksi).filter(Boolean)));
      const tabName = formatDateTabName(dStr, currentTab);

      return {
        dateStr: dStr,
        displayDate: formatDateIndo(dStr),
        tabName,
        totalQty,
        variantsCount: dateItems.length,
        uniqueCodesCount: uniqueCodes.length,
      };
    });
  }, [availableDates, categoryItems, currentTab]);

  const activeSummary = useMemo(() => {
    if (mode === 'single') {
      const found = dateSummaries.find((ds) => ds.dateStr === selectedDate);
      return {
        targetCount: 1,
        totalQty: found?.totalQty || 0,
        totalVariants: found?.variantsCount || 0,
        tabNames: found ? [found.tabName] : [],
      };
    } else {
      const totalQty = dateSummaries.reduce((acc, ds) => acc + ds.totalQty, 0);
      const totalVariants = dateSummaries.reduce((acc, ds) => acc + ds.variantsCount, 0);
      return {
        targetCount: dateSummaries.length,
        totalQty,
        totalVariants,
        tabNames: dateSummaries.map((ds) => ds.tabName),
      };
    }
  }, [mode, selectedDate, dateSummaries]);

  if (!isOpen) return null;

  const handleExecutePush = async () => {
    try {
      setIsPushing(true);
      setProgressMsg('Menyiapkan data penerimaan...');

      const target = mode === 'single' ? selectedDate : null;

      const res = await pushProduksiPerTanggalToGoogleSheet({
        items: categoryItems,
        blocks,
        activeTab: currentTab,
        targetDate: target,
        onProgress: (cur, tot, sheetName) => {
          setProgressMsg(`Mengirim tab ${cur}/${tot}: ${sheetName}...`);
        },
      });

      if (res.success) {
        onShowToast(res.message, 'success');
        if (res.sheetUrl) {
          setLastSheetUrl(res.sheetUrl);
        }
      } else {
        onShowToast(res.message || 'Gagal push ke Google Sheets', 'error');
      }
    } catch (err: any) {
      console.error('Error in handleExecutePush:', err);
      onShowToast('Terjadi kesalahan saat push: ' + (err?.message || err), 'error');
    } finally {
      setIsPushing(false);
      setProgressMsg('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* MODAL HEADER */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight flex items-center gap-2">
                <span>Push Sheet Penerimaan Produksi</span>
                <span className="px-2 py-0.5 bg-emerald-600 text-white text-[10px] font-extrabold rounded-md uppercase tracking-wider">
                  1 Sheet Per Tanggal
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Setiap tanggal kedatangan dibuatkan tab sheet tersendiri di Google Spreadsheet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPushing}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* CATEGORY SWITCHER INSIDE MODAL */}
          <div className="bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-xl flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentTab('CMT')}
              className={`flex-1 py-2 rounded-lg text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                currentTab === 'CMT'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>🧵 Lokal CMT</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${currentTab === 'CMT' ? 'bg-rose-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {cmtDatesCount} Tanggal
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('Kargo')}
              className={`flex-1 py-2 rounded-lg text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer ${
                currentTab === 'Kargo'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>📦 Kargo</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${currentTab === 'Kargo' ? 'bg-blue-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {kargoDatesCount} Tanggal
              </span>
            </button>
          </div>

          {/* NOTICE PILIHAN TANGGAL */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              Pilih Lingkup Push Tanggal ({currentTab === 'CMT' ? 'Lokal CMT' : 'Kargo'}):
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* OPSI 1: HANYA TANGGAL TERTENTU */}
              <div
                onClick={() => setMode('single')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  mode === 'single'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-850/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="pushMode"
                    checked={mode === 'single'}
                    onChange={() => setMode('single')}
                    className="mt-0.5 w-4 h-4 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                  />
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="text-xs font-black text-slate-900 dark:text-white flex items-center justify-between">
                      <span>Hanya Tanggal Tertentu</span>
                      {mode === 'single' && (
                        <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-1.5 py-0.2 rounded">
                          Aktif
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Hanya membuat / mengupdate <strong>1 tab sheet</strong> khusus untuk tanggal yang dipilih.
                    </p>

                    {mode === 'single' && (
                      <div className="pt-2">
                        {availableDates.length === 0 ? (
                          <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 rounded text-xs font-bold">
                            Belum ada tanggal kedatangan untuk kategori {currentTab}
                          </div>
                        ) : (
                          <select
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-emerald-400 dark:border-emerald-600 rounded-lg text-xs font-bold text-slate-900 dark:text-white outline-none"
                          >
                            {availableDates.map((dStr) => (
                              <option key={dStr} value={dStr}>
                                {formatDateIndo(dStr)} ({formatDateTabName(dStr, currentTab)})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* OPSI 2: SEMUA TANGGAL */}
              <div
                onClick={() => setMode('all')}
                className={`p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                  mode === 'all'
                    ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-850/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="pushMode"
                    checked={mode === 'all'}
                    onChange={() => setMode('all')}
                    className="mt-0.5 w-4 h-4 text-emerald-600 focus:ring-emerald-500 accent-emerald-600"
                  />
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="text-xs font-black text-slate-900 dark:text-white flex items-center justify-between">
                      <span>Semua Tanggal Sekaligus</span>
                      {mode === 'all' && (
                        <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-1.5 py-0.2 rounded">
                          Aktif
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Sistem akan membuat <strong>{availableDates.length} tab sheet</strong> berbeda untuk setiap tanggal penerimaan {currentTab}.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PREVIEW DAFTAR TAB SHEET YANG AKAN DITULIS */}
          <div className="bg-slate-50 dark:bg-slate-850 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>Rincian Tab Sheet yang Akan Ditulis:</span>
              </span>
              <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                {activeSummary.targetCount} Tab Sheet &bull; {activeSummary.totalQty.toLocaleString('id-ID')} pcs
              </span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {(mode === 'single'
                ? dateSummaries.filter((d) => d.dateStr === selectedDate)
                : dateSummaries
              ).map((ds) => (
                <div
                  key={ds.dateStr}
                  className="p-2.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <div>
                      <div className="font-mono font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{ds.tabName}</span>
                        <span className="text-[10px] font-sans font-semibold text-slate-400">
                          ({ds.displayDate})
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {ds.uniqueCodesCount} Kode Produk &bull; {ds.variantsCount} Varian Baris
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                      {ds.totalQty.toLocaleString('id-ID')} pcs
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LINK GOOGLE SPREADSHEET JIKA SUDAH SUKSES */}
          {lastSheetUrl && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-200 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Berhasil dikirim ke Google Spreadsheet!</span>
              </div>
              <a
                href={lastSheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
              >
                <span>Buka Google Sheets</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {progressMsg ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{progressMsg}</span>
              </span>
            ) : (
              <span>Foto produk di-embed otomatis dengan formula <code>=IMAGE(...)</code>.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPushing}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleExecutePush}
              disabled={isPushing || activeSummary.targetCount === 0}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer shadow-md disabled:cursor-not-allowed"
            >
              {isPushing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sedang Mengirim ke Sheets...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {mode === 'single'
                      ? `Push Sheet Tanggal ${formatDateIndo(selectedDate)}`
                      : `Push Semua (${activeSummary.targetCount} Sheet Tanggal)`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
