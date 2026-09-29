import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  CheckSquare,
  Square,
  Building2,
  SlidersHorizontal,
  Layers,
  ArrowDownCircle,
  Plus,
  RefreshCw,
  Store,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ProductItem } from '../../types';
import {
  ProductBarcodeItem,
  getProductMasterPrice,
  formatProductPriceWithTag,
  getOutletStockForProduct,
  isRealSize,
} from './types';

interface TabKatalogMultiSelectProps {
  productCatalog: ProductItem[];
  onAddMultipleToQueue: (items: Omit<ProductBarcodeItem, 'id' | 'selected'>[]) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const DEFAULT_MAIN_OUTLETS = [
  { key: 'MAP', label: 'Gudang Utama (MAP / Web)' },
  { key: 'LIVE', label: 'Studio & Live Sample' },
  { key: 'SHOPEE', label: 'Shopee Live / Ready' },
  { key: 'TIKTOK', label: 'TikTok Shop' },
];

export const TabKatalogMultiSelect: React.FC<TabKatalogMultiSelectProps> = ({
  productCatalog,
  onAddMultipleToQueue,
  onShowToast,
}) => {
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'instock' | 'outstock'>('all');

  // Multi-choice selections: SKU -> { selected: boolean, customQty: number }
  const [itemSelections, setItemSelections] = useState<Record<string, { selected: boolean; customQty: number }>>({});

  // Mode Qty: 'manual' vs 'outlet'
  const [qtyMode, setQtyMode] = useState<'manual' | 'outlet'>('manual');
  const [manualBatchQty, setManualBatchQty] = useState<number>(1);

  // Multi-choice Outlets
  const [selectedOutlets, setSelectedOutlets] = useState<string[]>(['MAP']);
  const [outletDropdownOpen, setOutletDropdownOpen] = useState(false);
  const [outletSearch, setOutletSearch] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Fast Catalog Map for O(1) Lookups
  const catalogMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    for (let i = 0; i < productCatalog.length; i++) {
      const p = productCatalog[i];
      const sku = String(p.k || (p as any).sku || '').toUpperCase().trim();
      if (sku) map.set(sku, p);
    }
    return map;
  }, [productCatalog]);

  // Discover all possible outlets/channels dynamically across the catalog (fast scan)
  const { availableOutlets, availableCategories } = useMemo(() => {
    const outletsSet = new Set<string>();
    DEFAULT_MAIN_OUTLETS.forEach((o) => outletsSet.add(o.key));
    const catSet = new Set<string>();

    const scanLimit = Math.min(productCatalog.length, 5000);
    for (let i = 0; i < scanLimit; i++) {
      const p = productCatalog[i];
      const cat = p.category || (p as any).kategori;
      if (cat && String(cat).trim()) {
        catSet.add(String(cat).trim());
      }
      const dpRaw = (p as any)?.dealpos_channels;
      if (dpRaw && typeof dpRaw === 'object') {
        const keys = Object.keys(dpRaw);
        for (let j = 0; j < keys.length; j++) {
          const k = keys[j];
          if (
            typeof dpRaw[k] === 'number' &&
            !['TP', 'tag_price', 'TagPrice', 'price', 'harga', 'd', 'b', 'cabang'].includes(k)
          ) {
            outletsSet.add(k);
          }
        }
      }
    }

    return {
      availableOutlets: Array.from(outletsSet),
      availableCategories: Array.from(catSet).sort(),
    };
  }, [productCatalog]);

  // Toggle outlet selection
  const handleToggleOutlet = (key: string) => {
    setSelectedOutlets((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleSelectAllOutlets = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedOutlets(availableOutlets);
    } else {
      setSelectedOutlets([]);
    }
  };

  // Filtered Products List
  const filteredProducts = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return productCatalog.filter((p) => {
      // 1. Search Query
      if (query) {
        const sku = String(p.k || (p as any).sku || '').toLowerCase();
        const nama = String(p.n || p.p || p.nama_produk || '').toLowerCase();
        const size = String(p.s || p.size || '').toLowerCase();
        const lokasi = String(p.lokasi || '').toLowerCase();
        const cat = String(p.category || (p as any).kategori || '').toLowerCase();

        const match =
          sku.includes(query) ||
          nama.includes(query) ||
          size.includes(query) ||
          lokasi.includes(query) ||
          cat.includes(query);
        if (!match) return false;
      }

      // 2. Category Filter
      if (selectedCategory !== 'all') {
        const cat = String(p.category || (p as any).kategori || '').trim();
        if (cat !== selectedCategory) return false;
      }

      // 3. Stock Filter
      if (stockFilter !== 'all') {
        const currentStock =
          qtyMode === 'outlet'
            ? getOutletStockForProduct(p, selectedOutlets)
            : Number(p.q || p.stokFisik || 0);

        if (stockFilter === 'instock' && currentStock <= 0) return false;
        if (stockFilter === 'outstock' && currentStock > 0) return false;
      }

      return true;
    });
  }, [productCatalog, searchQuery, selectedCategory, stockFilter, qtyMode, selectedOutlets]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, stockFilter, qtyMode, selectedOutlets]);

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedProducts = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, safeCurrentPage, pageSize]);

  // Get effective qty for a product
  const getProductQty = (p: ProductItem): number => {
    const sku = String(p.k || (p as any).sku || '');
    const sel = itemSelections[sku];
    if (sel && sel.customQty !== undefined) return sel.customQty;

    if (qtyMode === 'outlet') {
      const stock = getOutletStockForProduct(p, selectedOutlets);
      return Math.max(1, stock > 0 ? stock : 1);
    }
    return Math.max(1, manualBatchQty);
  };

  // Toggle single item selection
  const handleToggleItem = (p: ProductItem) => {
    const sku = String(p.k || (p as any).sku || '');
    if (!sku) return;
    setItemSelections((prev) => {
      const current = prev[sku];
      const isSel = current?.selected ?? false;
      return {
        ...prev,
        [sku]: {
          selected: !isSel,
          customQty: current?.customQty ?? getProductQty(p),
        },
      };
    });
  };

  // Change individual item qty
  const handleItemQtyChange = (p: ProductItem, newQty: number) => {
    const sku = String(p.k || (p as any).sku || '');
    if (!sku) return;
    const q = Math.max(1, newQty);
    setItemSelections((prev) => ({
      ...prev,
      [sku]: {
        selected: prev[sku]?.selected ?? true,
        customQty: q,
      },
    }));
  };

  // Bulk Select/Deselect visible on CURRENT page
  const handleSelectAllCurrentPage = (selectAll: boolean) => {
    setItemSelections((prev) => {
      const next = { ...prev };
      paginatedProducts.forEach((p) => {
        const sku = String(p.k || (p as any).sku || '');
        if (!sku) return;
        next[sku] = {
          selected: selectAll,
          customQty: prev[sku]?.customQty ?? getProductQty(p),
        };
      });
      return next;
    });
  };

  // Bulk Select ALL filtered products (capped safely)
  const handleSelectAllFiltered = (selectAll: boolean) => {
    setItemSelections((prev) => {
      const next = { ...prev };
      filteredProducts.forEach((p) => {
        const sku = String(p.k || (p as any).sku || '');
        if (!sku) return;
        next[sku] = {
          selected: selectAll,
          customQty: prev[sku]?.customQty ?? getProductQty(p),
        };
      });
      return next;
    });
    if (selectAll) {
      onShowToast?.(`${filteredProducts.length} produk hasil filter terpilih`, 'info');
    } else {
      onShowToast?.('Pilihan produk dikosongkan', 'info');
    }
  };

  // Clear all selections
  const handleClearAllSelections = () => {
    setItemSelections({});
    onShowToast?.('Semua pilihan produk dibatalkan', 'info');
  };

  // Apply Batch Qty to all selected items
  const handleApplyBatchQtyToSelected = () => {
    setItemSelections((prev) => {
      const next = { ...prev };
      let count = 0;
      Object.keys(next).forEach((sku) => {
        if (next[sku]?.selected) {
          next[sku] = {
            selected: true,
            customQty: Math.max(1, manualBatchQty),
          };
          count++;
        }
      });
      return next;
    });
    onShowToast?.(`Qty diubah ke ${manualBatchQty} pcs untuk produk terpilih`, 'info');
  };

  // Apply Outlet Stock to all selected items
  const handleApplyOutletStockToSelected = () => {
    if (selectedOutlets.length === 0) {
      onShowToast?.('Pilih minimal 1 outlet terlebih dahulu', 'warning');
      return;
    }
    setItemSelections((prev) => {
      const next = { ...prev };
      filteredProducts.forEach((p) => {
        const sku = String(p.k || (p as any).sku || '');
        if (!sku) return;
        const st = getOutletStockForProduct(p, selectedOutlets);
        const autoQty = Math.max(1, st > 0 ? st : 1);
        next[sku] = {
          selected: prev[sku]?.selected ?? (st > 0),
          customQty: autoQty,
        };
      });
      return next;
    });
    onShowToast?.(`Qty disesuaikan dengan stok ${selectedOutlets.length} outlet terpilih`, 'info');
  };

  // Calculate selected items using fast Map lookup (O(selected) instead of O(catalog))
  const selectedProductsList = useMemo(() => {
    const list: ProductItem[] = [];
    const entries = Object.entries(itemSelections);
    for (let i = 0; i < entries.length; i++) {
      const [sku, sel] = entries[i];
      if (sel && sel.selected) {
        const prod = catalogMap.get(sku.toUpperCase());
        if (prod) list.push(prod);
      }
    }
    return list;
  }, [catalogMap, itemSelections]);

  const totalSelectedStickers = useMemo(() => {
    return selectedProductsList.reduce((acc, p) => {
      return acc + getProductQty(p);
    }, 0);
  }, [selectedProductsList, itemSelections, qtyMode, manualBatchQty, selectedOutlets]);

  // Commit to Print Queue
  const handleCommitToQueue = () => {
    if (selectedProductsList.length === 0) {
      onShowToast?.('Pilih minimal 1 produk dari daftar di bawah.', 'warning');
      return;
    }

    const itemsToAdd: Omit<ProductBarcodeItem, 'id' | 'selected'>[] = selectedProductsList.map((p) => {
      const sku = p.k || '';
      const resolvedQty = getProductQty(p);
      const masterPrice = getProductMasterPrice(p);
      const resolvedNama = String(p.n || p.p || p.nama_produk || sku);
      const resolvedSize = isRealSize(p.s || p.size) ? String(p.s || p.size).trim() : '';
      const resolvedLokasi = String(p.lokasi || '');

      return {
        sku,
        nama: resolvedNama,
        size: resolvedSize,
        price: masterPrice > 0 ? masterPrice : undefined,
        lokasi: resolvedLokasi,
        copies: resolvedQty,
      };
    });

    onAddMultipleToQueue(itemsToAdd);
    onShowToast?.(`Berhasil memasukkan ${itemsToAdd.length} produk (${totalSelectedStickers} stiker) ke antrean`, 'success');

    // Deselect after adding
    setItemSelections({});
  };

  return (
    <div className="space-y-4">
      {/* 1. TOP CONTROL BAR: SEARCH, CATEGORIES & MODE SELECTION */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3.5">
        {/* Search & Category Filter */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-7 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari SKU, Nama Baju, Size, Kategori, Lokasi Rak..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full py-2.5 px-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">Semua Kategori Produk</option>
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
              className="w-full py-2.5 px-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">Semua Stok</option>
              <option value="instock">Ada Stok (&gt; 0)</option>
              <option value="outstock">Stok Habis (0)</option>
            </select>
          </div>
        </div>

        {/* 2. MODE QTY CETAK: MANUAL vs OUTLET STOCK */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700/80 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-700 dark:text-slate-300">
              Penentuan Qty Cetak:
            </span>
            <div className="inline-flex rounded-xl border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-900 p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setQtyMode('manual')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  qtyMode === 'manual'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Isi Qty Manual
              </button>
              <button
                type="button"
                onClick={() => setQtyMode('outlet')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  qtyMode === 'outlet'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Berdasarkan Stok Outlet / Store</span>
              </button>
            </div>
          </div>

          {/* Controls for Manual Mode */}
          {qtyMode === 'manual' && (
            <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
              <span className="text-xs font-bold text-slate-500">Set Qty Seragam:</span>
              <input
                type="number"
                min="1"
                value={manualBatchQty}
                onChange={(e) => setManualBatchQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-center text-xs font-black text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleApplyBatchQtyToSelected}
                className="px-3 py-1 bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                Terapkan ke Terpilih
              </button>
            </div>
          )}

          {/* Controls for Outlet Stock Mode */}
          {qtyMode === 'outlet' && (
            <div className="relative flex items-center gap-2 w-full lg:w-auto justify-end">
              <button
                type="button"
                onClick={() => setOutletDropdownOpen(!outletDropdownOpen)}
                className="px-3 py-1.5 bg-purple-50 dark:bg-purple-950/50 hover:bg-purple-100 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-2xs"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>
                  Outlet Terpilih ({selectedOutlets.length} Toko)
                </span>
                {outletDropdownOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={handleApplyOutletStockToSelected}
                className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1 shadow-xs"
                title="Gunakan stok outlet terpilih sebagai jumlah stiker cetak"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sinkron Qty Cetak = Stok</span>
              </button>

              {/* Outlet Multi-Select Popover */}
              {outletDropdownOpen && (
                <div className="absolute top-full right-0 mt-2 z-40 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                    <span className="text-xs font-black text-slate-800 dark:text-white flex items-center gap-1.5">
                      <Store className="w-4 h-4 text-purple-600" />
                      Pilih Store / Outlet:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectAllOutlets(true)}
                        className="text-[10px] font-bold text-purple-600 hover:underline cursor-pointer"
                      >
                        Pilih Semua
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() => handleSelectAllOutlets(false)}
                        className="text-[10px] font-bold text-slate-400 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={outletSearch}
                    onChange={(e) => setOutletSearch(e.target.value)}
                    placeholder="Filter nama toko/outlet..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  />

                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {availableOutlets
                      .filter((k) => k.toLowerCase().includes(outletSearch.toLowerCase()))
                      .map((outletKey) => {
                        const isChecked = selectedOutlets.includes(outletKey);
                        return (
                          <label
                            key={outletKey}
                            onClick={() => handleToggleOutlet(outletKey)}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                              isChecked
                                ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-bold'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="truncate">{outletKey}</span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              readOnly
                              className="rounded text-purple-600 focus:ring-purple-500"
                            />
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. SELECTION ACTIONS & SUMMARY BANNER */}
      <div className="p-3 bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => handleSelectAllCurrentPage(true)}
            className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 hover:bg-purple-50 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold cursor-pointer transition-colors"
          >
            Pilih Halaman Ini ({paginatedProducts.length})
          </button>
          <button
            type="button"
            onClick={() => handleSelectAllFiltered(true)}
            className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold cursor-pointer transition-colors"
          >
            Pilih Semua Filter ({filteredProducts.length})
          </button>
          {selectedProductsList.length > 0 && (
            <button
              type="button"
              onClick={handleClearAllSelections}
              className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-bold cursor-pointer transition-colors"
            >
              Reset Pilihan
            </button>
          )}

          <div className="text-xs font-black text-purple-950 dark:text-purple-200 ml-1">
            {selectedProductsList.length} Produk Terpilih ({totalSelectedStickers} Stiker)
          </div>
        </div>

        <button
          type="button"
          onClick={handleCommitToQueue}
          disabled={selectedProductsList.length === 0}
          className="w-full sm:w-auto px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          <span>Masukkan ({selectedProductsList.length} Item / {totalSelectedStickers} Stiker) ke Antrean</span>
        </button>
      </div>

      {/* 4. PAGINATION CONTROLS & TABLE */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
        {/* Pagination Top Bar */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-600 dark:text-slate-300 font-semibold">
              Menampilkan {filteredProducts.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1} - {Math.min(safeCurrentPage * pageSize, filteredProducts.length)} dari <span className="font-bold text-purple-600 dark:text-purple-400">{filteredProducts.length}</span> produk
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[11px]">Per halaman:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage <= 1}
                className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
              >
                &laquo;
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
              >
                &lsaquo; Prev
              </button>
              <span className="px-2 font-bold text-slate-700 dark:text-slate-200">
                {safeCurrentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
              >
                Next &rsaquo;
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage >= totalPages}
                className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed font-bold"
              >
                &raquo;
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3.5 w-10">
                  <input
                    type="checkbox"
                    checked={
                      paginatedProducts.length > 0 &&
                      paginatedProducts.every((p) => itemSelections[String(p.k || (p as any).sku || '')]?.selected)
                    }
                    onChange={(e) => handleSelectAllCurrentPage(e.target.checked)}
                    className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                    title="Pilih/Batal semua item pada halaman ini"
                  />
                </th>
                <th className="py-2.5 px-3">SKU &amp; Kategori</th>
                <th className="py-2.5 px-3">Nama Produk &amp; Varian</th>
                <th className="py-2.5 px-2.5 text-center">Size</th>
                <th className="py-2.5 px-3">Harga Master</th>
                <th className="py-2.5 px-3 text-center">
                  {qtyMode === 'outlet' ? `Stok Outlet (${selectedOutlets.length})` : 'Stok Fisik'}
                </th>
                <th className="py-2.5 px-3 text-center w-36">Qty Cetak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Tidak ada produk yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((prod) => {
                  const sku = String(prod.k || (prod as any).sku || '');
                  const isChecked = itemSelections[sku]?.selected ?? false;
                  const currentStock =
                    qtyMode === 'outlet'
                      ? getOutletStockForProduct(prod, selectedOutlets)
                      : Number(prod.q || prod.stokFisik || 0);
                  const effectiveQty = getProductQty(prod);
                  const masterPrice = getProductMasterPrice(prod);

                  return (
                    <tr
                      key={sku}
                      className={`hover:bg-purple-50/40 dark:hover:bg-purple-950/20 transition-colors ${
                        isChecked ? 'bg-purple-50/20 font-bold' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleItem(prod)}
                          className="rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        <div>{sku}</div>
                        {prod.category && (
                          <span className="text-[10px] font-sans font-semibold text-slate-400">
                            {prod.category}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate" title={prod.n || prod.p}>
                        {prod.n || prod.p || '-'}
                      </td>
                      <td className="py-2.5 px-2.5 text-center">
                        {isRealSize(prod.s || prod.size) ? (
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-bold">
                            {String(prod.s || prod.size || '')}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-purple-700 dark:text-purple-300">
                        {masterPrice > 0 ? `Rp ${new Intl.NumberFormat('id-ID').format(masterPrice)}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                            currentStock > 0
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {currentStock} pcs
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleItemQtyChange(prod, effectiveQty - 1)}
                            className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={effectiveQty}
                            onChange={(e) =>
                              handleItemQtyChange(prod, parseInt(e.target.value, 10) || 1)
                            }
                            className="w-12 text-center py-0.5 font-black bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleItemQtyChange(prod, effectiveQty + 1)}
                            className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
