import React, { useState, useMemo, useCallback } from 'react';
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
  FileText
} from 'lucide-react';
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

interface InventoryPickingCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: InventoryCartItem[];
  onUpdateQty: (sku: string, newQty: number) => void;
  onRemoveItem: (sku: string) => void;
  onClearCart: () => void;
  onAddToCart: (item: Omit<InventoryCartItem, 'qty'>, qty?: number) => void;
  productCatalog: ProductItem[];
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

export const InventoryPickingCartDrawer: React.FC<InventoryPickingCartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onAddToCart,
  availableRows,
  onProceedToPicking,
}) => {
  // Quick Search & Autocomplete
  const [quickSearch, setQuickSearch] = useState('');
  const [quickQty, setQuickQty] = useState(1);
  const [selectedSearchItem, setSelectedSearchItem] = useState<{
    sku: string;
    produk: string;
    size: string;
    qty: number;
    locations: Array<{ lokasi: string; qty: number; area?: string }>;
  } | null>(null);

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

  // Autocomplete Suggestions
  const searchSuggestions = useMemo(() => {
    const q = quickSearch.trim().toUpperCase();
    if (!q || q.length < 2) return [];

    const map = new Map<string, typeof availableRows[0]>();
    for (const r of availableRows) {
      if (
        r.sku.toUpperCase().includes(q) ||
        r.produk.toUpperCase().includes(q)
      ) {
        if (!map.has(r.sku)) {
          map.set(r.sku, r);
          if (map.size >= 8) break;
        }
      }
    }
    return Array.from(map.values());
  }, [quickSearch, availableRows]);

  const handleSelectSuggestion = (item: typeof availableRows[0]) => {
    setSelectedSearchItem(item);
    setQuickSearch(`${item.produk} (${item.size}) - ${item.sku}`);
  };

  const handleQuickAdd = () => {
    if (!selectedSearchItem && quickSearch.trim()) {
      // Find exact match by SKU
      const found = availableRows.find(
        (r) => r.sku.toUpperCase() === quickSearch.trim().toUpperCase()
      );
      if (found) {
        onAddToCart(
          {
            sku: found.sku,
            nama_produk: found.produk,
            size: found.size,
            available_stock: found.qty,
            locations: found.locations,
          },
          Math.max(1, quickQty)
        );
        setQuickSearch('');
        setSelectedSearchItem(null);
        setQuickQty(1);
        return;
      }
    }

    if (selectedSearchItem) {
      onAddToCart(
        {
          sku: selectedSearchItem.sku,
          nama_produk: selectedSearchItem.produk,
          size: selectedSearchItem.size,
          available_stock: selectedSearchItem.qty,
          locations: selectedSearchItem.locations,
        },
        Math.max(1, quickQty)
      );
      setQuickSearch('');
      setSelectedSearchItem(null);
      setQuickQty(1);
    }
  };

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
          {/* Quick Input Bar (Ketik produk apa, Qty berapa) */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 space-y-2">
            <label className="text-[11px] font-extrabold text-indigo-950 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Input Cepat Produk & Qty</span>
            </label>
            <div className="relative">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={quickSearch}
                    onChange={(e) => {
                      setQuickSearch(e.target.value);
                      setSelectedSearchItem(null);
                    }}
                    placeholder="Ketik SKU atau nama baju..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  {quickSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickSearch('');
                        setSelectedSearchItem(null);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="w-20 shrink-0">
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

              {/* Suggestions Dropdown */}
              {searchSuggestions.length > 0 && !selectedSearchItem && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {searchSuggestions.map((sug) => (
                    <div
                      key={sug.sku}
                      onClick={() => handleSelectSuggestion(sug)}
                      className="p-2.5 hover:bg-indigo-50/50 dark:hover:bg-slate-800/80 cursor-pointer flex items-center justify-between text-left transition-colors"
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
                        <span className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          Stok: {sug.qty} pcs
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

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
                  Ketik nama barang di atas atau klik tombol keranjang pada baris produk di tabel Inventory.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cartItems.map((item) => {
                  const isStockWarning = item.available_stock > 0 && item.qty > item.available_stock;
                  return (
                    <div
                      key={item.sku}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {item.nama_produk}
                          </span>
                          <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-extrabold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                            {item.size || '-'}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {item.sku}
                        </div>

                        {/* Location Pills */}
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          {item.locations && item.locations.length > 0 ? (
                            item.locations.map((loc) => (
                              <span
                                key={loc.lokasi}
                                className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                              >
                                {loc.lokasi} <span className="text-indigo-600 dark:text-indigo-400">({loc.qty})</span>
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] italic text-slate-400">Belum ada rak</span>
                          )}
                          <span className="text-[10px] text-slate-400 ml-1">
                            · Total Fisik: {item.available_stock} pcs
                          </span>
                        </div>

                        {isStockWarning && (
                          <div className="flex items-center gap-1 text-[10.5px] font-bold text-amber-600 dark:text-amber-400 mt-1">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>Qty order ({item.qty}) melebihi stok fisik rak ({item.available_stock} pcs)!</span>
                          </div>
                        )}
                      </div>

                      {/* Stepper & Delete */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-800">
                        <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 overflow-hidden">
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.sku, Math.max(1, item.qty - 1))}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={item.qty}
                            onChange={(e) => onUpdateQty(item.sku, Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-12 text-center text-xs font-mono font-bold text-slate-900 dark:text-white bg-transparent focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => onUpdateQty(item.sku, item.qty + 1)}
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
