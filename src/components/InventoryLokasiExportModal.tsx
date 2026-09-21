import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Printer,
  Download,
  Search,
  MapPin,
  FileSpreadsheet,
  Check,
  Copy,
  Boxes,
  Layers,
  ChevronDown,
  Calendar,
  User,
  Eye,
  RotateCcw,
  CheckSquare,
  FileText
} from 'lucide-react';
import { StockRealtimeItem, ProductItem, UserSession } from '../types';

export interface LocationStockItem {
  sku: string;
  nama_produk: string;
  size: string;
  lokasi: string;
  area: string;
  qty: number;
  totalStokFisikGlobal?: number;
  lastUpdated?: string;
}

export interface InventoryLokasiExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLocation?: string;
  stockList: StockRealtimeItem[];
  productCatalog?: ProductItem[];
  currentLocations?: string[];
  session?: UserSession | null;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const InventoryLokasiExportModal: React.FC<InventoryLokasiExportModalProps> = ({
  isOpen,
  onClose,
  initialLocation = '',
  stockList = [],
  productCatalog = [],
  currentLocations = [],
  session,
  onNotify,
}) => {
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [searchLocationQuery, setSearchLocationQuery] = useState<string>('');
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'TABLE' | 'PRINT_PREVIEW'>('TABLE');
  const [hasCopiedSku, setHasCopiedSku] = useState<boolean>(false);

  // Set initial location on open
  useEffect(() => {
    if (isOpen) {
      const loc = (initialLocation || '').trim();
      if (loc) {
        setSelectedLocation(loc);
        setSearchLocationQuery(loc);
      } else {
        // Default to first available location with stock if any
        if (allAvailableLocations.length > 0) {
          setSelectedLocation(allAvailableLocations[0].lokasi);
          setSearchLocationQuery(allAvailableLocations[0].lokasi);
        }
      }
      setItemSearchQuery('');
      setViewMode('TABLE');
      setIsDropdownOpen(false);
    }
  }, [isOpen, initialLocation]);

  // Extract all unique locations with stock counts
  const allAvailableLocations = useMemo(() => {
    const locMap = new Map<string, { skuCount: number; totalQty: number; area: string }>();

    // 1. From stockList
    stockList.forEach((s) => {
      const l = String(s.lokasi || '').trim();
      if (!l || l.startsWith('#') || l === 'KOLI' || l === 'BOX') return;
      const cleanLoc = l.split(':')[0].trim();
      if (!cleanLoc) return;

      const qty = Number(s.sisa_stok || s.qty || 0);
      const cur = locMap.get(cleanLoc) || { skuCount: 0, totalQty: 0, area: s.area || '' };
      cur.skuCount += 1;
      cur.totalQty += qty;
      if (!cur.area && s.area) cur.area = s.area;
      locMap.set(cleanLoc, cur);
    });

    // 2. From productCatalog locList if not already in map
    if (Array.isArray(productCatalog)) {
      productCatalog.forEach((p) => {
        if (Array.isArray(p.locList)) {
          p.locList.forEach((item) => {
            const locName =
              typeof item === 'object' && item !== null
                ? String(item.lokasi || '').trim()
                : String(item || '').split(':')[0].trim();
            const locQty =
              typeof item === 'object' && item !== null
                ? Number(item.qty || 0)
                : parseInt(String(item || '').split(':')[1], 10) || 0;
            if (!locName || locName.startsWith('#') || locName === 'KOLI' || locName === 'BOX') return;
            if (!locMap.has(locName)) {
              locMap.set(locName, { skuCount: 1, totalQty: locQty, area: '' });
            }
          });
        }
      });
    }

    // 3. From currentLocations prop if provided
    if (Array.isArray(currentLocations)) {
      currentLocations.forEach((loc) => {
        const l = String(loc || '').trim();
        if (l && !locMap.has(l)) {
          locMap.set(l, { skuCount: 0, totalQty: 0, area: '' });
        }
      });
    }

    return Array.from(locMap.entries())
      .map(([lokasi, meta]) => ({
        lokasi,
        skuCount: meta.skuCount,
        totalQty: meta.totalQty,
        area: meta.area || 'Gudang',
      }))
      .sort((a, b) => a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true, sensitivity: 'base' }));
  }, [stockList, productCatalog, currentLocations]);

  // Filtered dropdown location list based on search input
  const filteredLocationOptions = useMemo(() => {
    const q = searchLocationQuery.trim().toLowerCase();
    if (!q) return allAvailableLocations;
    return allAvailableLocations.filter(
      (loc) => loc.lokasi.toLowerCase().includes(q) || loc.area.toLowerCase().includes(q)
    );
  }, [allAvailableLocations, searchLocationQuery]);

  // Aggregate items in the selected location
  const locationItems = useMemo(() => {
    if (!selectedLocation.trim()) return [];
    const targetLoc = selectedLocation.trim().toUpperCase();

    const itemMap = new Map<string, LocationStockItem>();

    // Precalculate total global physical stock for each SKU across all locations
    const globalStockBySku = new Map<string, number>();
    stockList.forEach((s) => {
      const sku = String(s.sku || '').trim().toUpperCase();
      if (!sku) return;
      const qty = Number(s.sisa_stok || s.qty || 0);
      globalStockBySku.set(sku, (globalStockBySku.get(sku) || 0) + qty);
    });

    // 1. Scan stockList
    stockList.forEach((s) => {
      const rawLoc = String(s.lokasi || '').trim();
      const cleanLoc = rawLoc.split(':')[0].trim().toUpperCase();
      if (cleanLoc !== targetLoc) return;

      const sku = String(s.sku || '').trim().toUpperCase();
      if (!sku) return;

      const qty = Number(s.sisa_stok || s.qty || 0);
      const existing = itemMap.get(sku);
      if (existing) {
        existing.qty += qty;
        if (!existing.area && s.area) existing.area = s.area;
      } else {
        itemMap.set(sku, {
          sku,
          nama_produk: s.nama_produk || s.nama || '',
          size: s.size || s.ukuran || '-',
          lokasi: rawLoc.split(':')[0].trim(),
          area: s.area || '',
          qty,
          totalStokFisikGlobal: globalStockBySku.get(sku) || qty,
          lastUpdated: s.updated_at,
        });
      }
    });

    // 2. Cross-reference with productCatalog for missing details or locList entries
    if (Array.isArray(productCatalog)) {
      productCatalog.forEach((p) => {
        const sku = String(p.k || '').trim().toUpperCase();
        if (!sku) return;

        const inMap = itemMap.get(sku);
        if (inMap) {
          if (!inMap.nama_produk) inMap.nama_produk = p.n || p.p || '';
          if (!inMap.size || inMap.size === '-') inMap.size = p.s || '-';
          return;
        }

        if (Array.isArray(p.locList)) {
          p.locList.forEach((locEntry) => {
            const locName =
              typeof locEntry === 'object' && locEntry !== null
                ? String(locEntry.lokasi || '').trim().toUpperCase()
                : String(locEntry || '').split(':')[0].trim().toUpperCase();
            if (locName === targetLoc) {
              const qty =
                typeof locEntry === 'object' && locEntry !== null
                  ? Number(locEntry.qty || 0)
                  : parseInt(String(locEntry || '').split(':')[1], 10) || 0;
              itemMap.set(sku, {
                sku,
                nama_produk: p.n || p.p || '',
                size: p.s || '-',
                lokasi: selectedLocation.trim(),
                area: '',
                qty,
                totalStokFisikGlobal: globalStockBySku.get(sku) || qty,
              });
            }
          });
        }
      });
    }

    return Array.from(itemMap.values()).sort((a, b) =>
      a.sku.localeCompare(b.sku, undefined, { numeric: true })
    );
  }, [selectedLocation, stockList, productCatalog]);

  // Filter items in location by search query (SKU or Name)
  const filteredLocationItems = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    if (!q) return locationItems;
    return locationItems.filter(
      (item) =>
        item.sku.toLowerCase().includes(q) ||
        item.nama_produk.toLowerCase().includes(q) ||
        item.size.toLowerCase().includes(q)
    );
  }, [locationItems, itemSearchQuery]);

  // Summary statistics for selected location
  const summary = useMemo(() => {
    const totalPcs = locationItems.reduce((acc, it) => acc + it.qty, 0);
    const uniqueSkus = locationItems.length;
    const areas = Array.from(new Set(locationItems.map((i) => i.area).filter(Boolean)));
    return {
      totalPcs,
      uniqueSkus,
      areaStr: areas.length > 0 ? areas.join(', ') : 'Gudang Utama',
    };
  }, [locationItems]);

  // Export to CSV
  const handleExportCSV = () => {
    if (locationItems.length === 0) {
      onNotify?.('Tidak ada data produk di lokasi ini untuk diekspor.', 'warning');
      return;
    }

    const headers = [
      'NO',
      'LOKASI',
      'AREA',
      'SKU',
      'NAMA_PRODUK',
      'SIZE',
      'QTY_DI_LOKASI',
      'TOTAL_FISIK_GLOBAL',
    ];

    const rows = locationItems.map((item, idx) => {
      const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
      return [
        idx + 1,
        escape(item.lokasi || selectedLocation),
        escape(item.area || summary.areaStr),
        escape(item.sku),
        escape(item.nama_produk),
        escape(item.size),
        item.qty,
        item.totalStokFisikGlobal ?? item.qty,
      ].join(',');
    });

    const csvContent = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const cleanLoc = selectedLocation.replace(/[^a-zA-Z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `WMS_INVENTORY_LOKASI_${cleanLoc}_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onNotify?.(
      `Berhasil mengunduh CSV lokasi ${selectedLocation} (${locationItems.length} SKU, ${summary.totalPcs} pcs)!`,
      'success'
    );
  };

  // Trigger Print / PDF
  const handlePrint = () => {
    if (locationItems.length === 0) {
      onNotify?.('Tidak ada data produk di lokasi ini untuk dicetak.', 'warning');
      return;
    }
    window.print();
  };

  // Copy SKU list to clipboard
  const handleCopySkus = () => {
    if (locationItems.length === 0) return;
    const skuText = locationItems.map((it) => it.sku).join('\n');
    navigator.clipboard.writeText(skuText).then(() => {
      setHasCopiedSku(true);
      setTimeout(() => setHasCopiedSku(false), 2500);
      onNotify?.(`Daftar ${locationItems.length} SKU berhasil disalin ke clipboard!`, 'info');
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Print Specific CSS */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-lokasi-inventory, #printable-lokasi-inventory * {
            visibility: visible !important;
          }
          #printable-lokasi-inventory {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 10mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: Arial, Helvetica, sans-serif !important;
          }
          @page {
            size: A4 portrait;
            margin: 6mm 8mm;
          }
        }
      `}</style>

      {/* Main Dialog Box */}
      <div className="bg-white dark:bg-[#161F30] w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        
        {/* ========================================================
            MODAL HEADER & LOCATION SELECTOR
            ======================================================== */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#111827]/80 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Ekspor & Cetak Lokasi Rak</span>
                  {selectedLocation && (
                    <span className="px-2.5 py-0.5 text-xs font-mono font-black bg-amber-500 text-black rounded-lg shadow-xs">
                      {selectedLocation}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Unduh CSV atau cetak lembar audit fisik / stok opname per lokasi rak
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Location Selector Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Searchable Dropdown */}
            <div className="relative flex-1">
              <div className="flex items-center gap-2 bg-white dark:bg-[#1E293B] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 shadow-xs focus-within:ring-2 focus-within:ring-amber-500">
                <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
                <input
                  type="text"
                  value={searchLocationQuery}
                  onChange={(e) => {
                    setSearchLocationQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="Ketik nama lokasi (misal: CC001, PMK01, A01)..."
                  className="bg-transparent border-none outline-none text-xs font-bold text-slate-900 dark:text-slate-100 w-full placeholder:text-slate-400 uppercase"
                />
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Dropdown Options */}
              {isDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute top-full left-0 right-0 mt-1.5 z-30 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredLocationOptions.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        Tidak ada lokasi yang cocok. Anda tetap bisa menekan Enter untuk mencari &quot;{searchLocationQuery}&quot;.
                      </div>
                    ) : (
                      filteredLocationOptions.map((opt) => (
                        <button
                          key={opt.lokasi}
                          type="button"
                          onClick={() => {
                            setSelectedLocation(opt.lokasi);
                            setSearchLocationQuery(opt.lokasi);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-xs hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer ${
                            selectedLocation === opt.lokasi
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold">{opt.lokasi}</span>
                            <span className="text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                              {opt.area}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {opt.skuCount} SKU • {opt.totalQty} pcs
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Quick Prefix Filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <span className="text-[11px] font-bold text-slate-400 shrink-0">Cepat:</span>
              {['CC001', 'PMK01', 'DF01', 'A01', 'B01', 'R01'].map((quickLoc) => (
                <button
                  key={quickLoc}
                  type="button"
                  onClick={() => {
                    setSelectedLocation(quickLoc);
                    setSearchLocationQuery(quickLoc);
                    setIsDropdownOpen(false);
                  }}
                  className={`text-[11px] px-2.5 py-1.5 rounded-lg font-mono font-bold transition-all shrink-0 cursor-pointer border ${
                    selectedLocation === quickLoc
                      ? 'bg-amber-500 text-black border-amber-600 shadow-xs'
                      : 'bg-white dark:bg-[#1E293B] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-500'
                  }`}
                >
                  {quickLoc}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ========================================================
            LOCATION STATS & ACTION TOOLBAR
            ======================================================== */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161F30] flex flex-wrap items-center justify-between gap-3">
          {/* Summary Metrics */}
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-amber-500" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-black">Total SKU</div>
                <div className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 font-mono">
                  {summary.uniqueSkus.toLocaleString('id-ID')}
                </div>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-500" />
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-black">Total Fisik</div>
                <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  {summary.totalPcs.toLocaleString('id-ID')} <span className="text-xs font-normal">pcs</span>
                </div>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

            <div className="hidden sm:flex items-center gap-2">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-black">Area</div>
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {summary.areaStr}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons: Mode, Copy, CSV, Print */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* View Mode Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  viewMode === 'TABLE'
                    ? 'bg-white dark:bg-[#161F30] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Tabel</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('PRINT_PREVIEW')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                  viewMode === 'PRINT_PREVIEW'
                    ? 'bg-white dark:bg-[#161F30] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview A4</span>
              </button>
            </div>

            {/* Copy SKUs */}
            <button
              type="button"
              onClick={handleCopySkus}
              disabled={locationItems.length === 0}
              className="p-2 sm:px-2.5 sm:py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Salin semua SKU di lokasi ini"
            >
              {hasCopiedSku ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{hasCopiedSku ? 'Tersalin' : 'Salin SKU'}</span>
            </button>

            {/* Export CSV */}
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={locationItems.length === 0}
              className="px-3 py-1.5 text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title={`Unduh file CSV untuk lokasi ${selectedLocation}`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>

            {/* Print / Save as PDF */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={locationItems.length === 0}
              className="px-3.5 py-1.5 text-xs font-black bg-amber-500 hover:bg-amber-400 text-black rounded-xl shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title={`Cetak / Simpan PDF Lembar Opname Lokasi ${selectedLocation}`}
            >
              <Printer className="w-4 h-4" />
              <span>Print PDF</span>
            </button>
          </div>
        </div>

        {/* ========================================================
            CONTENT AREA: TABLE VIEW OR PRINT PREVIEW
            ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50 dark:bg-[#0E1420]">
          {locationItems.length === 0 ? (
            <div className="py-16 text-center space-y-3 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl p-6">
              <MapPin className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Tidak Ada Produk di Lokasi &quot;{selectedLocation}&quot;
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Lokasi ini belum memiliki stok fisik tercatat, atau silakan pilih lokasi lain dari daftar di atas.
              </p>
            </div>
          ) : viewMode === 'TABLE' ? (
            /* ========================================================
               INTERACTIVE TABLE VIEW
               ======================================================== */
            <div className="space-y-3">
              {/* Table search filter */}
              <div className="flex items-center gap-2 bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  placeholder={`Cari SKU atau nama produk di lokasi ${selectedLocation}...`}
                  className="bg-transparent border-none outline-none text-xs text-slate-900 dark:text-slate-100 w-full placeholder:text-slate-400"
                />
                {itemSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setItemSearchQuery('')}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Data Table */}
              <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 dark:bg-[#111827] border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-black text-[10px] tracking-wider">
                        <th className="p-3 text-center w-12">No</th>
                        <th className="p-3">SKU / Barcode</th>
                        <th className="p-3">Nama Produk</th>
                        <th className="p-3 text-center">Size</th>
                        <th className="p-3 text-center">Qty di Rak</th>
                        <th className="p-3 text-center">Total Fisik</th>
                        <th className="p-3">Area</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {filteredLocationItems.map((item, idx) => (
                        <tr
                          key={item.sku}
                          className="hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors"
                        >
                          <td className="p-3 text-center text-slate-400 font-mono">
                            {idx + 1}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {item.sku}
                          </td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                            {item.nama_produk || '-'}
                          </td>
                          <td className="p-3 text-center font-bold text-slate-600 dark:text-slate-400">
                            <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              {item.size || 'ALL'}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
                            {item.qty}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-500 dark:text-slate-400">
                            {item.totalStokFisikGlobal ?? item.qty}
                          </td>
                          <td className="p-3 text-slate-500 dark:text-slate-400 text-[11px]">
                            {item.area || summary.areaStr}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 dark:bg-[#111827] border-t-2 border-slate-200 dark:border-slate-700 font-black text-xs">
                        <td colSpan={4} className="p-3 text-right uppercase tracking-wider">
                          TOTAL ({filteredLocationItems.length} SKU)
                        </td>
                        <td className="p-3 text-center font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
                          {filteredLocationItems.reduce((acc, it) => acc + it.qty, 0)}
                        </td>
                        <td className="p-3 text-center font-mono text-slate-500">
                          {filteredLocationItems.reduce(
                            (acc, it) => acc + (it.totalStokFisikGlobal ?? it.qty),
                            0
                          )}
                        </td>
                        <td className="p-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================
               PRINT PREVIEW (A4 PAPER LOOK)
               ======================================================== */
            <div className="max-w-3xl mx-auto bg-white text-black p-8 rounded-xl shadow-xl border border-slate-300 font-sans text-xs space-y-5">
              <div className="border-b-2 border-black pb-4 flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-black tracking-tight uppercase">
                    WMS CHOCOCHIPS WAREHOUSE
                  </h1>
                  <h2 className="text-sm font-bold text-slate-700 uppercase">
                    LEMBAR STOK OPNAME / AUDIT LOKASI RAK
                  </h2>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Dokumen Fisik Verifikasi Persediaan Rak
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">LOKASI RAK</div>
                  <div className="text-2xl font-black font-mono border-2 border-black px-3 py-1 bg-amber-100 rounded">
                    {selectedLocation}
                  </div>
                </div>
              </div>

              {/* Metadata Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px]">
                <div>
                  <span className="text-slate-500 block">Area Gudang:</span>
                  <span className="font-bold">{summary.areaStr}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Waktu Cetak:</span>
                  <span className="font-bold">
                    {new Date().toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Total SKU:</span>
                  <span className="font-bold">{locationItems.length} SKU</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Total Qty Fisik:</span>
                  <span className="font-bold text-amber-700">{summary.totalPcs} Pcs</span>
                </div>
              </div>

              {/* Printable Table */}
              <table className="w-full text-left border-collapse border border-black text-[11px]">
                <thead>
                  <tr className="bg-slate-200 border-b border-black font-black uppercase text-[10px]">
                    <th className="p-1.5 border-r border-black text-center w-8">No</th>
                    <th className="p-1.5 border-r border-black w-36">SKU / Barcode</th>
                    <th className="p-1.5 border-r border-black">Nama Produk</th>
                    <th className="p-1.5 border-r border-black text-center w-12">Size</th>
                    <th className="p-1.5 border-r border-black text-center w-14">Sistem</th>
                    <th className="p-1.5 border-r border-black text-center w-16">Cek Fisik</th>
                    <th className="p-1.5 border-r border-black text-center w-12">+/-</th>
                    <th className="p-1.5 text-center w-24">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black font-normal">
                  {locationItems.map((item, idx) => (
                    <tr key={item.sku} className="border-b border-black/30">
                      <td className="p-1.5 text-center border-r border-black">{idx + 1}</td>
                      <td className="p-1.5 font-mono font-bold border-r border-black">{item.sku}</td>
                      <td className="p-1.5 font-semibold border-r border-black">{item.nama_produk || '-'}</td>
                      <td className="p-1.5 text-center font-bold border-r border-black">{item.size || 'ALL'}</td>
                      <td className="p-1.5 text-center font-mono font-bold border-r border-black bg-slate-50">
                        {item.qty}
                      </td>
                      <td className="p-1.5 text-center border-r border-black" />
                      <td className="p-1.5 text-center border-r border-black" />
                      <td className="p-1.5" />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black font-black bg-slate-100">
                    <td colSpan={4} className="p-1.5 text-right border-r border-black">
                      TOTAL ({locationItems.length} SKU):
                    </td>
                    <td className="p-1.5 text-center border-r border-black font-mono">
                      {summary.totalPcs}
                    </td>
                    <td colSpan={3} className="p-1.5" />
                  </tr>
                </tfoot>
              </table>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-10 pt-4 text-center text-[11px]">
                <div className="space-y-12">
                  <div>Petugas Cek / Opname Fisik:</div>
                  <div className="border-b border-black w-48 mx-auto" />
                  <div className="text-slate-500 text-[10px]">( Nama Jelas & Paraf )</div>
                </div>
                <div className="space-y-12">
                  <div>Supervisor Gudang / Validator:</div>
                  <div className="border-b border-black w-48 mx-auto" />
                  <div className="text-slate-500 text-[10px]">( Nama Jelas & Tanda Tangan )</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161F30] flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {locationItems.length > 0 ? (
              <span>
                Menampilkan <b>{filteredLocationItems.length}</b> dari <b>{locationItems.length}</b> SKU di lokasi <b>{selectedLocation}</b>
              </span>
            ) : (
              <span>Pilih lokasi rak untuk mengekspor atau mencetak data.</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* ========================================================
          ISOLATED PRINTABLE CONTAINER (Only visible in window.print)
          ======================================================== */}
      <div id="printable-lokasi-inventory" className="hidden print:block">
        <div style={{ borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>
              WMS CHOCOCHIPS WAREHOUSE
            </h1>
            <h2 style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', margin: '4px 0 0 0', color: '#333' }}>
              LEMBAR STOK OPNAME / AUDIT LOKASI RAK
            </h2>
            <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
              Dokumen Verifikasi Fisik Gudang & Inventori
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: '700', color: '#666' }}>LOKASI RAK</div>
            <div style={{ fontSize: '20px', fontWeight: '900', fontFamily: 'monospace', border: '2px solid #000', padding: '2px 10px', background: '#fef3c7', borderRadius: '4px' }}>
              {selectedLocation}
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px', marginBottom: '16px', fontSize: '10px' }}>
          <div>
            <span style={{ color: '#64748b', display: 'block' }}>Area Gudang:</span>
            <strong style={{ fontSize: '11px' }}>{summary.areaStr}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block' }}>Waktu Cetak:</span>
            <strong style={{ fontSize: '11px' }}>
              {new Date().toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block' }}>Total SKU:</span>
            <strong style={{ fontSize: '11px' }}>{locationItems.length} SKU</strong>
          </div>
          <div>
            <span style={{ color: '#64748b', display: 'block' }}>Total Qty Fisik:</span>
            <strong style={{ fontSize: '11px', color: '#b45309' }}>{summary.totalPcs} Pcs</strong>
          </div>
        </div>

        {/* Item Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', fontSize: '10px' }}>
          <thead>
            <tr style={{ background: '#e2e8f0', borderBottom: '1px solid #000', textTransform: 'uppercase', fontSize: '9px', fontWeight: 'bold' }}>
              <th style={{ padding: '6px 4px', borderRight: '1px solid #000', textAlign: 'center', width: '28px' }}>No</th>
              <th style={{ padding: '6px 4px', borderRight: '1px solid #000', textAlign: 'left', width: '120px' }}>SKU / Barcode</th>
              <th style={{ padding: '6px 4px', borderRight: '1px solid #000', textAlign: 'left' }}>Nama Produk</th>
              <th style={{ padding: '6px 4px', borderRight: '1px solid #000', textAlign: 'center', width: '40px' }}>Size</th>
              <th style={{ padding: '6px 4px', borderRight: '1px solid #000', textAlign: 'center', width: '50px' }}>Sistem</th>
              <th style={{ padding: '6px 4px', borderRight: '1px solid #000', textAlign: 'center', width: '55px' }}>Fisik</th>
              <th style={{ padding: '6px 4px', borderRight: '1px solid #000', textAlign: 'center', width: '40px' }}>+/-</th>
              <th style={{ padding: '6px 4px', textAlign: 'center', width: '80px' }}>Catatan</th>
            </tr>
          </thead>
          <tbody>
            {locationItems.map((item, idx) => (
              <tr key={item.sku} style={{ borderBottom: '1px solid #cbd5e1' }}>
                <td style={{ padding: '5px 4px', textAlign: 'center', borderRight: '1px solid #000' }}>{idx + 1}</td>
                <td style={{ padding: '5px 4px', fontFamily: 'monospace', fontWeight: 'bold', borderRight: '1px solid #000' }}>{item.sku}</td>
                <td style={{ padding: '5px 4px', borderRight: '1px solid #000' }}>{item.nama_produk || '-'}</td>
                <td style={{ padding: '5px 4px', textAlign: 'center', fontWeight: 'bold', borderRight: '1px solid #000' }}>{item.size || 'ALL'}</td>
                <td style={{ padding: '5px 4px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 'bold', borderRight: '1px solid #000', background: '#f8fafc' }}>
                  {item.qty}
                </td>
                <td style={{ padding: '5px 4px', textAlign: 'center', borderRight: '1px solid #000' }}></td>
                <td style={{ padding: '5px 4px', textAlign: 'center', borderRight: '1px solid #000' }}></td>
                <td style={{ padding: '5px 4px' }}></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #000', fontWeight: 'bold', background: '#f1f5f9' }}>
              <td colSpan={4} style={{ padding: '6px 8px', textAlign: 'right', borderRight: '1px solid #000' }}>
                TOTAL ({locationItems.length} SKU):
              </td>
              <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #000', fontFamily: 'monospace' }}>
                {summary.totalPcs}
              </td>
              <td colSpan={3} style={{ padding: '6px 4px' }}></td>
            </tr>
          </tfoot>
        </table>

        {/* Signature & Validation Footer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '28px', textAlign: 'center', fontSize: '10px' }}>
          <div>
            <div style={{ marginBottom: '50px' }}>Petugas Cek / Opname Fisik:</div>
            <div style={{ borderBottom: '1px solid #000', width: '200px', margin: '0 auto' }}></div>
            <div style={{ color: '#666', fontSize: '9px', marginTop: '4px' }}>( Nama Jelas & Paraf )</div>
          </div>
          <div>
            <div style={{ marginBottom: '50px' }}>Supervisor Gudang / Validator:</div>
            <div style={{ borderBottom: '1px solid #000', width: '200px', margin: '0 auto' }}></div>
            <div style={{ color: '#666', fontSize: '9px', marginTop: '4px' }}>( Nama Jelas & Tanda Tangan )</div>
          </div>
        </div>
      </div>
    </div>
  );
};
