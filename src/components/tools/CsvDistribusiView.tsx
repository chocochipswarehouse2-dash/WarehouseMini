import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  Upload,
  Download,
  Plus,
  Search,
  Tag,
  Printer,
  X,
  FileSpreadsheet,
  Building2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { ProductItem } from '../../types';
import {
  BatchBarcodePrintItem,
  DistFileItem,
  downloadZipBlob,
  extractBatchNumber,
  findBestDistSheet,
  formatStoreFilename,
  generateStoreCsvText,
  getDistFolderName,
  parseDistSheetData,
} from '../../utils/csvToolsUtils';
import { BatchBarcodePrintModal } from './BatchBarcodePrintModal';
import { ChecklistPrintModal } from './ChecklistPrintModal';

interface CsvDistribusiViewProps {
  products: ProductItem[];
  onNotify: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const CsvDistribusiView: React.FC<CsvDistribusiViewProps> = ({ products, onNotify }) => {
  const [files, setFiles] = useState<DistFileItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [distSearchQuery, setDistSearchQuery] = useState('');
  const [isZipping, setIsZipping] = useState(false);

  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeModalOutlets, setBarcodeModalOutlets] = useState<string[]>([]);
  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [checklistModalOutlets, setChecklistModalOutlets] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  const priceLookupMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      const sku = String(p.sku || p.k || '').trim().toUpperCase();
      if (sku && Number(p.price) > 0) map.set(sku, Number(p.price));
    }
    return map;
  }, [products]);

  const priceLookup = (skuUpper: string) => priceLookupMap.get(skuUpper);

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeFileId) || files[0] || null,
    [files, activeFileId]
  );

  const updateActiveFile = (patch: Partial<DistFileItem>) => {
    if (!activeFile) return;
    setFiles((prev) => prev.map((f) => (f.id === activeFile.id ? { ...f, ...patch } : f)));
  };

  const handleAddFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const added: DistFileItem[] = [];

    for (const file of Array.from(fileList)) {
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const { sheetName, parsed } = findBestDistSheet(wb, priceLookup);
        if (!parsed || parsed.parsedProducts.length === 0) {
          onNotify(`Sheet produk/SKU tidak ditemukan pada file "${file.name}".`, 'warning');
          continue;
        }
        const batchNumber = extractBatchNumber(file.name, sheetName);
        added.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          fileName: file.name,
          batchNumber,
          workbook: wb,
          sheetNames: wb.SheetNames,
          selectedSheet: sheetName,
          storeCols: parsed.storeCols,
          parsedProducts: parsed.parsedProducts,
          selectedStores: parsed.selectedStores,
          prefixPattern: '{store}',
          excludeZero: true,
          spacePadding: false,
          metrics: parsed.metrics,
        });
      } catch (err: any) {
        onNotify(`Gagal membaca "${file.name}": ${err?.message || 'Format tidak valid'}`, 'error');
      }
    }

    if (added.length > 0) {
      setFiles((prev) => [...prev, ...added]);
      setActiveFileId(added[0].id);
      onNotify(`Berhasil memuat ${added.length} file Excel distribusi.`, 'success');
    }
  };

  const handleSheetChange = (sheetName: string) => {
    if (!activeFile) return;
    const parsed = parseDistSheetData(activeFile.workbook, sheetName, priceLookup);
    if (!parsed) {
      onNotify(`Sheet "${sheetName}" tidak memiliki header SKU yang valid.`, 'warning');
      return;
    }
    updateActiveFile({
      selectedSheet: sheetName,
      batchNumber: extractBatchNumber(activeFile.fileName, sheetName),
      storeCols: parsed.storeCols,
      parsedProducts: parsed.parsedProducts,
      selectedStores: parsed.selectedStores,
      metrics: parsed.metrics,
    });
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (activeFileId === id) {
        setActiveFileId(next[0]?.id || null);
      }
      return next;
    });
  };

  const filteredStores = useMemo(() => {
    if (!activeFile) return [];
    const q = distSearchQuery.trim().toLowerCase();
    if (!q) return activeFile.storeCols;
    return activeFile.storeCols.filter((s) => s.name.toLowerCase().includes(q));
  }, [activeFile, distSearchQuery]);

  const globalTotals = useMemo(() => {
    let totalUnits = 0;
    let totalQtyAwal = 0;
    let totalCsvs = 0;
    files.forEach((f) => {
      totalUnits += f.metrics.totalUnits || 0;
      totalQtyAwal += f.metrics.totalQtyAwal || 0;
      totalCsvs += f.selectedStores.size;
    });
    return { totalFiles: files.length, totalUnits, totalQtyAwal, totalCsvs };
  }, [files]);

  const storeSelectionPercent = useMemo(() => {
    if (!activeFile) return 0;
    const totalNonGudang = Math.max(1, activeFile.storeCols.filter((s) => !s.isGudangAwal).length);
    const selectedNonGudang = Array.from(activeFile.selectedStores).filter((s) => s !== 'Gudang Awal').length;
    return Math.round((selectedNonGudang / totalNonGudang) * 100);
  }, [activeFile]);

  const itemsByOutletForPrint = useMemo(() => {
    const map = new Map<string, BatchBarcodePrintItem[]>();
    if (!activeFile) return map;
    activeFile.storeCols.forEach((st) => {
      const list: BatchBarcodePrintItem[] = [];
      activeFile.parsedProducts.forEach((p) => {
        const qty = p.allocations[st.name] || 0;
        if (qty > 0) {
          list.push({
            sku: p.sku,
            name: p.name || p.sku,
            variant: p.variant || '-',
            price: p.price || '0',
            qty,
            outlet: st.name,
          });
        }
      });
      if (list.length > 0) map.set(st.name, list);
    });
    return map;
  }, [activeFile]);

  const handleDownloadMasterZip = async () => {
    if (files.length === 0) {
      onNotify('Belum ada file Excel yang dimuat.', 'warning');
      return;
    }
    setIsZipping(true);
    try {
      const zip = new JSZip();
      let totalCsv = 0;

      files.forEach((fileObj) => {
        const folderName = getDistFolderName(fileObj);
        const folder = zip.folder(folderName);
        fileObj.selectedStores.forEach((storeName) => {
          const filename = `${formatStoreFilename(fileObj.prefixPattern, fileObj.batchNumber, storeName)}.csv`;
          const csvContent = generateStoreCsvText(fileObj, storeName);
          folder?.file(filename, csvContent);
          totalCsv++;
        });
      });

      const zipFilename =
        files.length === 1
          ? `${getDistFolderName(files[0])}.zip`
          : `Pembagian_Stock_All_Batches_${files.length}_Folders.zip`;

      await downloadZipBlob(zip, zipFilename);
      onNotify(`Berhasil download ${zipFilename} (${totalCsv} file CSV DealPOS).`, 'success');
    } catch (err: any) {
      onNotify(err?.message || 'Gagal membuat ZIP.', 'error');
    } finally {
      setIsZipping(false);
    }
  };

  const openPrintBarcode = (singleStore?: string) => {
    if (!activeFile) return;
    if (singleStore) {
      setBarcodeModalOutlets([singleStore]);
      setBarcodeModalOpen(true);
      return;
    }
    const storesWithAlloc = Array.from(activeFile.selectedStores).filter(
      (s) => s !== 'Gudang Awal' && (itemsByOutletForPrint.get(s)?.length || 0) > 0
    );
    if (storesWithAlloc.length === 0) {
      onNotify('Tidak ada store terpilih dengan alokasi > 0 pcs.', 'warning');
      return;
    }
    // Default select first store so modal preview opens instantaneously
    setBarcodeModalOutlets([storesWithAlloc[0]]);
    setBarcodeModalOpen(true);
  };

  const openPrintChecklist = (singleStore?: string) => {
    if (!activeFile) return;
    const targets = singleStore
      ? [singleStore]
      : Array.from(activeFile.selectedStores).filter((s) => (itemsByOutletForPrint.get(s)?.length || 0) > 0);
    if (targets.length === 0) {
      onNotify('Tidak ada store terpilih dengan alokasi > 0 pcs.', 'warning');
      return;
    }
    setChecklistModalOutlets(targets);
    setChecklistModalOpen(true);
  };

  return (
    <div className="w-full max-w-full px-2 sm:px-4 lg:px-6 py-4 space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
            CSV Distribusi (Alokasi Excel Multi-Store)
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Import 1 atau banyak file Excel pembagian stock (Reguler / Back In Stock), pecah otomatis menjadi CSV DealPOS per store dalam 1 ZIP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              void handleAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={addMoreInputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              void handleAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-9 px-3.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Excel</span>
          </button>
          <button
            type="button"
            disabled={isZipping || files.length === 0}
            onClick={handleDownloadMasterZip}
            className="h-9 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isZipping ? 'Membuat ZIP...' : `Download ZIP (${files.length} Folder)`}</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {files.length === 0 ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void handleAddFiles(e.dataTransfer.files);
          }}
          className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 sm:p-14 text-center flex flex-col items-center justify-center gap-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Import File Excel Pembagian Stock
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Tarik &amp; lepas atau pilih satu atau beberapa file Excel alokasi distribusi store sekaligus (mendukung template Reguler &amp; Back In Stock / BIS).
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span>Pilih File Excel dari Komputer</span>
          </button>
        </div>
      ) : (
        <>
          {/* Multi-file Tab Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {files.map((f) => {
              const isActive = f.id === activeFile?.id;
              return (
                <div
                  key={f.id}
                  onClick={() => setActiveFileId(f.id)}
                  className={`cursor-pointer px-3.5 py-2 rounded-xl border text-xs flex items-center gap-2 shrink-0 transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-black/10 text-[10px]">
                    {f.batchNumber}
                  </span>
                  <span className="font-semibold max-w-[180px] truncate">{f.fileName}</span>
                  <span className="text-[10px] opacity-80">({f.metrics.totalUnits.toLocaleString('id-ID')} pcs)</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(f.id);
                    }}
                    className="p-0.5 rounded hover:bg-black/20"
                    title="Hapus file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => addMoreInputRef.current?.click()}
              className="px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah File</span>
            </button>
          </div>

          {/* Active File Workspace */}
          {activeFile && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Stores */}
              <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">File Aktif</span>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                      {activeFile.fileName}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={activeFile.selectedSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="h-8 px-3 rounded-lg text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 outline-none"
                    >
                      {activeFile.sheetNames.map((s) => (
                        <option key={s} value={s}>
                          Sheet: {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Search & Select All */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={distSearchQuery}
                      onChange={(e) => setDistSearchQuery(e.target.value)}
                      placeholder="Cari nama store (CPJ, LMP, DPM)..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => updateActiveFile({ selectedStores: new Set(activeFile.storeCols.map((s) => s.name)) })}
                    className="h-8 px-3 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => updateActiveFile({ selectedStores: new Set() })}
                    className="h-8 px-3 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    Kosongkan
                  </button>
                </div>

                {/* Store Grid (2-Row Cards per Tools Standard) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {filteredStores.map((s) => {
                    const isGudangAwal = s.name === 'Gudang Awal' || s.isGudangAwal;
                    const isChecked = activeFile.selectedStores.has(s.name);
                    let storePcs = 0;
                    activeFile.parsedProducts.forEach((p) => {
                      if (p.allocations[s.name]) storePcs += p.allocations[s.name];
                    });

                    return (
                      <div
                        key={s.name}
                        className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2 ${
                          isGudangAwal
                            ? isChecked
                              ? 'col-span-full bg-amber-50/70 dark:bg-amber-950/20 border-amber-400 dark:border-amber-600'
                              : 'col-span-full bg-slate-50 dark:bg-slate-800/40 border-dashed border-slate-300 dark:border-slate-700 opacity-70'
                            : isChecked
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-300 dark:border-indigo-700'
                            : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-70 hover:opacity-100'
                        }`}
                      >
                        {/* Row 1: Checkbox + Prominent Store Name + Pcs Badge */}
                        <div
                          onClick={() => {
                            const next = new Set(activeFile.selectedStores);
                            if (isChecked) next.delete(s.name);
                            else next.add(s.name);
                            updateActiveFile({ selectedStores: next });
                          }}
                          className="flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <input type="checkbox" checked={isChecked} readOnly className="rounded text-indigo-600 shrink-0" />
                            {isGudangAwal && <Building2 className="w-4 h-4 text-amber-600 shrink-0" />}
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-900 dark:text-white truncate">{s.name}</div>
                              {isGudangAwal && (
                                <div className="text-[10px] text-slate-500 truncate">Stok Masuk Gudang Utama DealPOS</div>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 px-2 py-0.5 rounded-full font-mono font-bold text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
                            {storePcs.toLocaleString('id-ID')} pcs
                          </span>
                        </div>

                        {/* Row 2: Store Action Buttons */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                          <span className="text-[10px] text-slate-400">Aksi:</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPrintBarcode(s.name);
                              }}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center gap-1"
                            >
                              <Tag className="w-3 h-3" />
                              <span>Barcode</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openPrintChecklist(s.name);
                              }}
                              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1"
                            >
                              <Printer className="w-3 h-3" />
                              <span>SJ</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Summary & Export */}
              <div className="lg:col-span-4 space-y-5">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Ringkasan Distribusi</h3>

                  <div className="flex items-center gap-4">
                    <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-slate-100 dark:text-slate-800"
                          strokeWidth="3.8"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="text-indigo-600"
                          strokeDasharray={`${storeSelectionPercent}, 100`}
                          strokeWidth="3.8"
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-base font-extrabold text-slate-900 dark:text-white">{storeSelectionPercent}%</span>
                        <span className="text-[9px] text-slate-400 uppercase font-semibold">Store</span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total File Excel:</span>
                        <b className="text-slate-900 dark:text-white">{globalTotals.totalFiles} File</b>
                      </div>
                      {activeFile.metrics.hasGudangAwal && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Gudang Awal:</span>
                          <b className="text-amber-600 dark:text-amber-400">
                            {activeFile.metrics.totalQtyAwal.toLocaleString('id-ID')} pcs
                          </b>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">Alokasi Store:</span>
                        <b className="text-emerald-600 dark:text-emerald-400">
                          {activeFile.metrics.totalUnits.toLocaleString('id-ID')} pcs
                        </b>
                      </div>
                      {activeFile.metrics.hasGudangAwal && (
                        <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                          <span className="text-slate-400">Status:</span>
                          {activeFile.metrics.totalQtyAwal === activeFile.metrics.totalUnits ? (
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Balance 100%
                            </span>
                          ) : (
                            <span className="text-amber-600 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Sisa: {(activeFile.metrics.totalQtyAwal - activeFile.metrics.totalUnits).toLocaleString('id-ID')} pcs
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-slate-500">File CSV Siap:</span>
                        <b className="text-slate-900 dark:text-white">{globalTotals.totalCsvs} CSV</b>
                      </div>
                    </div>
                  </div>

                  {/* Config */}
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                        Pola Nama File CSV (<code className="font-mono">{'{store}'}</code> / <code className="font-mono">{'{batch}'}</code>):
                      </label>
                      <input
                        type="text"
                        value={activeFile.prefixPattern}
                        onChange={(e) => updateActiveFile({ prefixPattern: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeFile.spacePadding}
                        onChange={(e) => updateActiveFile({ spacePadding: e.target.checked })}
                        className="rounded text-indigo-600"
                      />
                      <span className="text-slate-600 dark:text-slate-300">Format spasi (<code className="font-mono">Code, Qty ,,</code>)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeFile.excludeZero}
                        onChange={(e) => updateActiveFile({ excludeZero: e.target.checked })}
                        className="rounded text-indigo-600"
                      />
                      <span className="text-slate-600 dark:text-slate-300">Abaikan SKU Qty 0</span>
                    </label>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => openPrintBarcode()}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 flex items-center justify-center gap-2"
                    >
                      <Tag className="w-4 h-4 text-indigo-600" />
                      <span>Cetak Barcode / QR Alokasi Toko</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openPrintChecklist()}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-50 flex items-center justify-center gap-2"
                    >
                      <Printer className="w-4 h-4 text-amber-600" />
                      <span>Cetak Lembar Ceklis Store (A4)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => addMoreInputRef.current?.click()}
                      className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah File Excel Lain</span>
                    </button>

                    <button
                      type="button"
                      disabled={isZipping || files.length === 0}
                      onClick={handleDownloadMasterZip}
                      className="w-full py-3 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isZipping ? 'Membuat ZIP...' : `Download ${files.length} Folder dalam 1 ZIP`}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Batch Barcode Modal */}
      <BatchBarcodePrintModal
        isOpen={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        title={`Cetak Barcode / QR — Batch ${activeFile?.batchNumber || ''}`}
        itemsByOutlet={itemsByOutletForPrint}
        initialSelectedOutlets={barcodeModalOutlets}
        onNotify={onNotify}
      />

      {/* Checklist A4 Modal */}
      <ChecklistPrintModal
        isOpen={checklistModalOpen}
        onClose={() => setChecklistModalOpen(false)}
        title="Lembar Ceklis & Surat Jalan Distribusi"
        subtitle={activeFile ? `File: ${activeFile.fileName} (Batch ${activeFile.batchNumber})` : undefined}
        itemsByOutlet={itemsByOutletForPrint}
        selectedOutlets={checklistModalOutlets}
      />
    </div>
  );
};
