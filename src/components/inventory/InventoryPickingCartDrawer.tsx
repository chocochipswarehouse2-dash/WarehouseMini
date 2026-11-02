import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  X,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Search,
  ArrowRight,
  Package,
  MapPin,
  AlertTriangle,
  RotateCcw,
  Store,
  Layers,
  FileText,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ClipboardPaste,
  Download,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { ProductItem } from '../../types';

export interface InventoryCartItem {
  sku: string;
  nama_produk: string;
  size: string;
  qty: number;
  available_stock: number;
  locations: Array<{ lokasi: string; qty: number; area?: string }>;
}

export interface InventoryOrderPickingDetails {
  tujuan: string;
  destinasi: string;
  no_dokumen: string;
  catatan: string;
}

export interface InventoryPickingCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: InventoryCartItem[];
  onUpdateQty: (sku: string, newQty: number) => void;
  onRemoveItem: (sku: string) => void;
  onClearCart: () => void;
  onAddToCart: (item: Omit<InventoryCartItem, 'qty'>, qty?: number) => void;
  onBulkAddToCart?: (items: Array<{ item: Omit<InventoryCartItem, 'qty'>; qty: number }>) => void;
  onNotify?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  productCatalog?: ProductItem[];
  availableRows: Array<{
    sku: string;
    produk: string;
    size: string;
    qty: number;
    locations: Array<{ lokasi: string; qty: number; area?: string }>;
  }>;
  onProceedToPicking: (details: InventoryOrderPickingDetails) => void;
}

const TUJUAN_OPTIONS = [
  { id: 'Refill Store', label: 'Refill Store / Toko' },
  { id: 'Peminjaman SPS', label: 'Peminjaman SPS / Foto' },
  { id: 'Marketplace', label: 'Marketplace / Online Order' },
  { id: 'Bazaar & Event', label: 'Bazaar / Event Pameran' },
  { id: 'Internal Warehouse', label: 'Kebutuhan Internal Gudang' },
];

interface ParsedImportRow {
  sku: string;
  qty: number;
  status: 'READY' | 'ZERO_STOCK' | 'NOT_FOUND';
  item?: typeof availableRowsPlaceholder[0];
  note?: string;
}

const availableRowsPlaceholder: Array<{
  sku: string;
  produk: string;
  size: string;
  qty: number;
  locations: Array<{ lokasi: string; qty: number; area?: string }>;
}> = [];

export const InventoryPickingCartDrawer: React.FC<InventoryPickingCartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onAddToCart,
  onBulkAddToCart,
  onNotify,
  productCatalog = [],
  availableRows,
  onProceedToPicking,
}) => {
  // Quick Search & Autocomplete
  const [quickSearch, setQuickSearch] = useState('');
  const [quickQty, setQuickQty] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Document Details
  const defaultDocNo = useMemo(() => {
    const today = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PICK-${today}-${rand}`;
  }, []);

  const [tujuan, setTujuan] = useState('Refill Store');
  const [destinasi, setDestinasi] = useState('');
  const [noDokumen, setNoDokumen] = useState(defaultDocNo);
  const [catatan, setCatatan] = useState('');

  // CSV / Excel Import State
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importTab, setImportTab] = useState<'file' | 'paste'>('file');
  const [pasteText, setPasteText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [parsedImportRows, setParsedImportRows] = useState<ParsedImportRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lookup map for fast SKU matching (case-insensitive)
  const availableMap = useMemo(() => {
    const map = new Map<string, typeof availableRows[0]>();
    for (const r of availableRows) {
      if (r && r.sku) {
        map.set(r.sku.trim().toUpperCase(), r);
      }
    }
    return map;
  }, [availableRows]);

  // Catalog map fallback for product names
  const catalogMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    for (const p of productCatalog) {
      const code = (p.k || (p as any).sku || '').trim().toUpperCase();
      if (code) map.set(code, p);
    }
    return map;
  }, [productCatalog]);

  // Autocomplete Suggestions
  const searchSuggestions = useMemo(() => {
    const q = quickSearch.trim().toUpperCase();
    if (!q || q.length < 2) return [];

    const results: typeof availableRows = [];
    const seen = new Set<string>();

    for (const r of availableRows) {
      const skuUpper = (r.sku || '').toUpperCase();
      const prodUpper = (r.produk || '').toUpperCase();
      if (skuUpper.includes(q) || prodUpper.includes(q)) {
        if (!seen.has(skuUpper)) {
          seen.add(skuUpper);
          results.push(r);
          if (results.length >= 10) break;
        }
      }
    }
    return results;
  }, [quickSearch, availableRows]);

  // Handle immediate click on suggestion -> instantly add to cart!
  const handleSelectSuggestion = (item: typeof availableRows[0]) => {
    const avail = Number(item.qty) || 0;
    if (avail <= 0) {
      if (onNotify) {
        onNotify(`Stok fisik ${item.produk} kosong (0 pcs) di gudang!`, 'warning');
      }
      return;
    }

    onAddToCart(
      {
        sku: item.sku,
        nama_produk: item.produk,
        size: item.size,
        available_stock: avail,
        locations: (item.locations || []).filter(l => l && l.lokasi && l.lokasi !== '-'),
      },
      Math.max(1, quickQty)
    );

    setQuickSearch('');
    setQuickQty(1);
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleQuickAdd = () => {
    const q = quickSearch.trim().toUpperCase();
    if (!q) return;

    // 1. Try exact match by SKU
    let found = availableMap.get(q);

    // 2. If not found, try first suggestion
    if (!found && searchSuggestions.length > 0) {
      found = searchSuggestions[0];
    }

    if (found) {
      handleSelectSuggestion(found);
    } else {
      if (onNotify) {
        onNotify(`SKU atau produk "${quickSearch}" tidak ditemukan di inventori aktif gudang.`, 'warning');
      }
    }
  };

  // ==========================================
  // CSV / EXCEL PARSING LOGIC
  // ==========================================
  const parseRowsFromRawData = useCallback((dataRows: any[][]): ParsedImportRow[] => {
    if (!dataRows || dataRows.length === 0) return [];

    // Find header indices
    let headerRowIdx = -1;
    let skuColIdx = 0;
    let qtyColIdx = 1;

    for (let r = 0; r < Math.min(5, dataRows.length); r++) {
      const row = dataRows[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim().toUpperCase();
        if (['SKU', 'KODE', 'KODE_BARANG', 'BARCODE', 'ITEM', 'ITEM_CODE', 'PRODUK'].includes(val)) {
          headerRowIdx = r;
          skuColIdx = c;
        }
        if (['QTY', 'JUMLAH', 'KUANTITAS', 'PCS', 'TOTAL'].includes(val)) {
          qtyColIdx = c;
        }
      }
      if (headerRowIdx >= 0) break;
    }

    const startIdx = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
    const parsed: ParsedImportRow[] = [];

    for (let r = startIdx; r < dataRows.length; r++) {
      const row = dataRows[r];
      if (!row || row.length === 0) continue;

      const rawSku = String(row[skuColIdx] ?? '').trim().toUpperCase();
      if (!rawSku || rawSku === 'SKU' || rawSku === 'KODE') continue;

      let rawQty = 1;
      if (qtyColIdx < row.length && row[qtyColIdx] !== undefined && row[qtyColIdx] !== '') {
        const num = parseInt(String(row[qtyColIdx]).replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num > 0) {
          rawQty = num;
        }
      }

      const match = availableMap.get(rawSku);
      if (!match) {
        const catMatch = catalogMap.get(rawSku);
        parsed.push({
          sku: rawSku,
          qty: rawQty,
          status: 'NOT_FOUND',
          note: catMatch ? `${catMatch.p || rawSku} (Tidak ada stok fisik)` : 'SKU tidak terdaftar di sistem',
        });
      } else {
        const avail = Number(match.qty) || 0;
        if (avail <= 0) {
          parsed.push({
            sku: rawSku,
            qty: rawQty,
            status: 'ZERO_STOCK',
            item: match,
            note: `${match.produk} (Stok fisik gudang 0 pcs)`,
          });
        } else {
          parsed.push({
            sku: rawSku,
            qty: rawQty,
            status: 'READY',
            item: match,
          });
        }
      }
    }

    return parsed;
  }, [availableMap, catalogMap]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const results = parseRowsFromRawData(data);
        setParsedImportRows(results);
        if (results.length === 0 && onNotify) {
          onNotify('File tidak memiliki baris data SKU yang dapat diproses.', 'warning');
        }
      } catch (err: any) {
        if (onNotify) onNotify(err?.message || 'Gagal membaca file spreadsheet.', 'error');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleParsePasteText = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const matrix: string[][] = lines.map(line => {
      if (line.includes('\t')) return line.split('\t');
      if (line.includes(';')) return line.split(';');
      if (line.includes(',')) return line.split(',');
      return line.split(/\s+/);
    });

    const results = parseRowsFromRawData(matrix);
    setParsedImportRows(results);
    if (results.length === 0 && onNotify) {
      onNotify('Teks tidak memiliki format SKU yang valid.', 'warning');
    }
  };

  const handleApplyImport = () => {
    const readyItems = parsedImportRows.filter(r => r.status === 'READY' && r.item);
    if (readyItems.length === 0) {
      if (onNotify) onNotify('Tidak ada item yang memiliki stok fisik untuk ditambahkan.', 'warning');
      return;
    }

    const payload = readyItems.map(r => ({
      item: {
        sku: r.item!.sku,
        nama_produk: r.item!.produk,
        size: r.item!.size,
        available_stock: r.item!.qty,
        locations: (r.item!.locations || []).filter(l => l && l.lokasi && l.lokasi !== '-'),
      },
      qty: r.qty,
    }));

    if (onBulkAddToCart) {
      onBulkAddToCart(payload);
    } else {
      payload.forEach(p => onAddToCart(p.item, p.qty));
    }

    // Reset import view
    setIsImportOpen(false);
    setParsedImportRows([]);
    setPasteText('');
    setImportFileName('');
  };

  const importStats = useMemo(() => {
    const ready = parsedImportRows.filter(r => r.status === 'READY');
    const zero = parsedImportRows.filter(r => r.status === 'ZERO_STOCK');
    const notFound = parsedImportRows.filter(r => r.status === 'NOT_FOUND');
    const totalPcsReady = ready.reduce((s, r) => s + r.qty, 0);
    return {
      total: parsedImportRows.length,
      readyCount: ready.length,
      readyPcs: totalPcsReady,
      zeroCount: zero.length,
      notFoundCount: notFound.length,
    };
  }, [parsedImportRows]);

  const totalItemsCount = cartItems.length;
  const totalPcsCount = useMemo(
    () => cartItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0),
    [cartItems]
  );

  const handleProceed = () => {
    if (cartItems.length === 0) return;
    onProceedToPicking({
      tujuan,
      destinasi: destinasi.trim() || tujuan,
      no_dokumen: noDokumen.trim() || defaultDocNo,
      catatan: catatan.trim(),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-xl bg-white dark:bg-[#161F30] h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200 border-l border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shadow-2xs">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                Keranjang Order Picking
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {totalItemsCount} SKU · {totalPcsCount} pcs
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pilih barang dari inventory, tentukan Qty, lalu proses ke Tugas Picking / WA / A4
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Quick Input Bar & Import CSV Trigger */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-extrabold text-indigo-950 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Pencarian Cepat Produk</span>
              </label>

              <button
                type="button"
                onClick={() => setIsImportOpen(!isImportOpen)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 cursor-pointer ${
                  isImportOpen
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-slate-700'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{isImportOpen ? 'Tutup Impor' : '📂 Impor CSV / Excel'}</span>
              </button>
            </div>

            {/* AUTO-ADD SEARCH BAR */}
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={quickSearch}
                    onChange={(e) => setQuickSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQuickAdd();
                      }
                    }}
                    placeholder="Ketik nama baju atau SKU (klik langsung menambah)..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  {quickSearch && (
                    <button
                      type="button"
                      onClick={() => setQuickSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="w-16 shrink-0">
                  <input
                    type="number"
                    min={1}
                    value={quickQty}
                    onChange={(e) => setQuickQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-2 text-xs font-mono font-bold text-center text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    title="Qty Pesanan"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleQuickAdd}
                  disabled={!quickSearch.trim()}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </div>

              {/* Instant Suggestions Dropdown (Click immediately adds!) */}
              {searchSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in duration-100">
                  <div className="px-3 py-1 bg-slate-50 dark:bg-slate-800/60 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>💡 Klik produk untuk langsung menambahkan (+{quickQty} pcs)</span>
                    <span>{searchSuggestions.length} hasil</span>
                  </div>
                  {searchSuggestions.map((sug) => {
                    const avail = Number(sug.qty) || 0;
                    const isZero = avail <= 0;
                    return (
                      <div
                        key={sug.sku}
                        onClick={() => handleSelectSuggestion(sug)}
                        className={`p-2.5 cursor-pointer flex items-center justify-between text-left transition-colors ${
                          isZero
                            ? 'hover:bg-rose-50/50 dark:hover:bg-rose-950/20 opacity-60'
                            : 'hover:bg-indigo-50/70 dark:hover:bg-slate-800/90'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {sug.produk}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">{sug.sku}</span>
                            <span>· Size {sug.size}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {isZero ? (
                            <span className="text-[10.5px] font-mono font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900">
                              Stok: 0 pcs
                            </span>
                          ) : (
                            <span className="text-[10.5px] font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                              Stok: {avail} pcs
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ==========================================
              CSV / EXCEL BULK IMPORT SECTION
              ========================================== */}
          {isImportOpen && (
            <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-indigo-100 dark:border-indigo-900 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-black text-indigo-950 dark:text-indigo-200">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Impor Massal SKU via CSV / Excel / Paste</span>
                </div>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold">
                  <button
                    type="button"
                    onClick={() => setImportTab('file')}
                    className={`px-2 py-0.5 rounded-md transition-colors ${
                      importTab === 'file'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'
                    }`}
                  >
                    Upload File
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportTab('paste')}
                    className={`px-2 py-0.5 rounded-md transition-colors ${
                      importTab === 'paste'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'
                    }`}
                  >
                    Paste Teks
                  </button>
                </div>
              </div>

              {importTab === 'file' ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-4 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700/60 hover:border-indigo-500 bg-white dark:bg-slate-900/60 text-center cursor-pointer transition-all"
                  >
                    <Upload className="w-7 h-7 mx-auto text-indigo-500 mb-1" />
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {importFileName ? `File terpilih: ${importFileName}` : 'Klik untuk upload CSV / Excel (.xlsx, .csv)'}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Format kolom otomatis: <strong className="font-mono">SKU</strong> dan <strong className="font-mono">Qty</strong>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="Paste daftar SKU & Qty di sini (dari Excel / WA)...&#10;Contoh:&#10;F26BTN676CR	2&#10;F26BTN676NV	5"
                    rows={4}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleParsePasteText}
                    disabled={!pasteText.trim()}
                    className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>Proses Data Tempel</span>
                  </button>
                </div>
              )}

              {/* Parsed Preview & Metrics */}
              {parsedImportRows.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-indigo-100 dark:border-indigo-900">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                      <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Siap Tambah</div>
                      <div className="text-sm font-black font-mono text-emerald-700 dark:text-emerald-300">
                        {importStats.readyCount} SKU · {importStats.readyPcs} pcs
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                      <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">Stok Kosong</div>
                      <div className="text-sm font-black font-mono text-amber-700 dark:text-amber-300">
                        {importStats.zeroCount} SKU
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Tak Ditemukan</div>
                      <div className="text-sm font-black font-mono text-slate-700 dark:text-slate-300">
                        {importStats.notFoundCount} SKU
                      </div>
                    </div>
                  </div>

                  {/* Preview Items List */}
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                    {parsedImportRows.map((row, idx) => (
                      <div key={`${row.sku}_${idx}`} className="p-2 flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <div className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                            {row.sku}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {row.item ? `${row.item.produk} (${row.item.size})` : row.note || '-'}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                            {row.qty} pcs
                          </span>
                          {row.status === 'READY' && (
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Ready
                            </span>
                          )}
                          {row.status === 'ZERO_STOCK' && (
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              Stok 0
                            </span>
                          )}
                          {row.status === 'NOT_FOUND' && (
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Tidak Ada
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Confirm Import Button */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setParsedImportRows([]);
                        setPasteText('');
                        setImportFileName('');
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      Bersihkan
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyImport}
                      disabled={importStats.readyCount === 0}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-black transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambahkan ke Keranjang (+{importStats.readyCount} SKU · {importStats.readyPcs} pcs)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cart Items List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                Daftar Barang ({cartItems.length} SKU)
              </span>
              {cartItems.length > 0 && (
                <button
                  type="button"
                  onClick={onClearCart}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-500 dark:text-rose-400 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Kosongkan</span>
                </button>
              )}
            </div>

            {cartItems.length === 0 ? (
              <div className="py-12 px-4 text-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                <ShoppingCart className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  Keranjang Picking Masih Kosong
                </h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-xs mx-auto mt-1">
                  Ketik nama barang di atas, klik impor CSV / Excel, atau klik tombol keranjang pada baris produk di tabel Inventory.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cartItems.map((item) => {
                  const availStock = Number(item.available_stock) || 0;
                  const itemQty = Number(item.qty) || 1;
                  const isStockWarning = availStock > 0 && itemQty > availStock;
                  const isZeroStock = availStock <= 0;
                  const safeLocations = Array.isArray(item.locations)
                    ? item.locations.filter((l) => l && l.lokasi && l.lokasi !== '-')
                    : [];

                  return (
                    <div
                      key={item.sku}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {item.nama_produk || item.sku}
                          </span>
                          <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-extrabold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                            {item.size || '-'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {item.sku}
                        </div>

                        {/* Location Pills (All rack locations shown) */}
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          {safeLocations.length > 0 ? (
                            safeLocations.map((loc, lIdx) => (
                              <span
                                key={`${item.sku}_${loc.lokasi || lIdx}_${lIdx}`}
                                className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs"
                              >
                                {loc.lokasi} <span className="text-indigo-600 dark:text-indigo-400">({loc.qty})</span>
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] italic text-slate-400">Belum ada rak</span>
                          )}
                          <span className="text-[10px] text-slate-400 ml-1">
                            · Total Fisik: <strong className="font-mono text-slate-700 dark:text-slate-300">{availStock}</strong> pcs
                          </span>
                        </div>

                        {isZeroStock && (
                          <div className="flex items-center gap-1 text-[10.5px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>Stok fisik gudang kosong (0 pcs)!</span>
                          </div>
                        )}

                        {isStockWarning && (
                          <div className="flex items-center gap-1 text-[10.5px] font-bold text-amber-600 dark:text-amber-400 mt-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>Qty order ({itemQty}) melebihi stok fisik rak ({availStock} pcs)!</span>
                          </div>
                        )}
                      </div>

                      {/* Stepper & Delete */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-800">
                        <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 overflow-hidden shadow-2xs">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.sku, Math.max(1, itemQty - 1))}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={itemQty}
                            onChange={(e) => onUpdateQty(item.sku, Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-12 text-center text-xs font-mono font-bold text-slate-900 dark:text-white bg-transparent focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.sku, itemQty + 1)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.sku)}
                          title="Hapus dari keranjang"
                          className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Document & Destination Info Form */}
          {cartItems.length > 0 && (
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 space-y-3">
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Rincian Dokumen & Tujuan Picking</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                    Tujuan / Keperluan
                  </label>
                  <select
                    value={tujuan}
                    onChange={(e) => setTujuan(e.target.value)}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    {TUJUAN_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                    Destinasi / Nama Store
                  </label>
                  <input
                    type="text"
                    value={destinasi}
                    onChange={(e) => setDestinasi(e.target.value)}
                    placeholder="Contoh: Store MKG / Living World..."
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Nomor Referensi / No SJ
                </label>
                <input
                  type="text"
                  value={noDokumen}
                  onChange={(e) => setNoDokumen(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide block mb-1">
                  Catatan untuk Picker
                </label>
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Catatan tambahan (opsional)..."
                  rows={2}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Sticky Action Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161F30] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
          <div className="w-full sm:w-auto text-left">
            <div className="text-[11px] text-slate-400">Total Permintaan:</div>
            <div className="text-sm font-black font-mono text-slate-900 dark:text-white">
              {totalItemsCount} SKU · {totalPcsCount} pcs
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer w-full sm:w-auto text-center"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={cartItems.length === 0}
              onClick={handleProceed}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-black transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
            >
              <span>Proses Order Picking</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
