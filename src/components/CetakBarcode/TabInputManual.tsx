import React, { useState, useRef, useEffect } from 'react';
import { Plus, Search, Check, Tag } from 'lucide-react';
import { ProductItem } from '../../types';
import {
  ProductBarcodeItem,
  formatProductPriceWithTag,
  getProductMasterPrice,
  parseRawPrice,
  isRealSize,
} from './types';

interface TabInputManualProps {
  productCatalog: ProductItem[];
  catalogMap: Map<string, ProductItem>;
  onAddToQueue: (item: Omit<ProductBarcodeItem, 'id' | 'selected'>) => void;
  formSku: string;
  setFormSku: (sku: string) => void;
  formNama: string;
  setFormNama: (nama: string) => void;
  formSize: string;
  setFormSize: (size: string) => void;
  formPrice: string;
  setFormPrice: (price: string) => void;
  formLokasi: string;
  setFormLokasi: (lokasi: string) => void;
  formCopies: number;
  setFormCopies: React.Dispatch<React.SetStateAction<number>>;
}

export const TabInputManual: React.FC<TabInputManualProps> = ({
  productCatalog,
  catalogMap,
  onAddToQueue,
  formSku,
  setFormSku,
  formNama,
  setFormNama,
  formSize,
  setFormSize,
  formPrice,
  setFormPrice,
  formLokasi,
  setFormLokasi,
  formCopies,
  setFormCopies,
}) => {
  const [catalogSearch, setCatalogSearch] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredCatalog = React.useMemo(() => {
    if (!catalogSearch.trim() || !productCatalog.length) return [];
    const query = catalogSearch.toLowerCase().trim();
    return productCatalog
      .filter((p) => {
        const sku = String(p.k || '').toLowerCase();
        const nama = String(p.n || p.p || '').toLowerCase();
        const size = String(p.s || '').toLowerCase();
        const lokasi = String(p.lokasi || '').toLowerCase();
        return (
          sku.includes(query) ||
          nama.includes(query) ||
          size.includes(query) ||
          lokasi.includes(query)
        );
      })
      .slice(0, 20);
  }, [catalogSearch, productCatalog]);

  const handleSelectFromCatalog = (product: ProductItem) => {
    setFormSku(product.k || '');
    setFormNama(String(product.n || product.p || product.nama_produk || ''));
    const cleanSz = String(product.s || product.size || '').trim();
    setFormSize(isRealSize(cleanSz) ? cleanSz : '');
    const rawPrice = getProductMasterPrice(product);
    setFormPrice(rawPrice > 0 ? String(rawPrice) : '');
    setFormLokasi(String(product.lokasi || ''));
    setIsSearchDropdownOpen(false);
    setCatalogSearch('');
  };

  const handleSkuInputChange = (val: string) => {
    setFormSku(val);
    const clean = val.trim().toLowerCase();
    const match = catalogMap.get(clean);
    if (match) {
      if (!formNama) setFormNama(String(match.n || match.p || match.nama_produk || ''));
      const cleanSz = String(match.s || match.size || '').trim();
      if (!formSize && isRealSize(cleanSz)) setFormSize(cleanSz);
      const mp = getProductMasterPrice(match);
      if (mp > 0 && !formPrice) setFormPrice(String(mp));
      if (match.lokasi && !formLokasi) setFormLokasi(String(match.lokasi));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSku = formSku.trim();
    if (!cleanSku) return;

    const catalogHit = catalogMap.get(cleanSku.toLowerCase());
    const masterPrice = getProductMasterPrice(catalogHit);
    const inputPrice = parseRawPrice(formPrice);
    const finalPrice = inputPrice > 0 ? inputPrice : masterPrice > 0 ? masterPrice : undefined;

    const resolvedNama =
      formNama.trim() || (catalogHit ? String(catalogHit.n || catalogHit.p || catalogHit.nama_produk || '') : cleanSku);
    const resolvedSize = isRealSize(formSize)
      ? formSize.trim()
      : catalogHit && isRealSize(catalogHit.s || catalogHit.size)
      ? String(catalogHit.s || catalogHit.size).trim()
      : '';
    const resolvedLokasi = formLokasi.trim() || (catalogHit ? String(catalogHit.lokasi || '') : '');

    onAddToQueue({
      sku: cleanSku,
      nama: resolvedNama,
      size: resolvedSize,
      price: finalPrice,
      lokasi: resolvedLokasi,
      copies: Math.max(1, formCopies || 1),
    });

    // Reset Form
    setFormSku('');
    setFormNama('');
    setFormSize('');
    setFormPrice('');
    setFormLokasi('');
    setFormCopies(1);
  };

  return (
    <div className="space-y-4">
      {/* Quick Search & Lookup Bar */}
      <div className="relative" ref={searchContainerRef}>
        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
          Cari Cepat Produk dari Master Katalog:
        </label>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={catalogSearch}
            onChange={(e) => {
              setCatalogSearch(e.target.value);
              setIsSearchDropdownOpen(true);
            }}
            onFocus={() => setIsSearchDropdownOpen(true)}
            placeholder="Ketik SKU (cth: TSH-BLK) atau nama baju untuk autofill..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
          />
        </div>

        {/* Dropdown Suggestion */}
        {isSearchDropdownOpen && filteredCatalog.length > 0 && (
          <div className="absolute z-30 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl divide-y divide-slate-100 dark:divide-slate-800">
            {filteredCatalog.map((prod, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectFromCatalog(prod)}
                className="p-3 hover:bg-purple-50 dark:hover:bg-purple-950/40 cursor-pointer transition-colors flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-slate-900 dark:text-white font-mono truncate">
                    {prod.k}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 truncate">
                    {prod.n || prod.p || 'Tanpa nama'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {prod.s && (
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded font-bold">
                      {prod.s}
                    </span>
                  )}
                  {prod.lokasi && (
                    <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded font-bold">
                      {prod.lokasi}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Input Form */}
      <form onSubmit={handleSubmit} className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-purple-600" />
            Detail Stiker Barcode Satuan:
          </span>
          <button
            type="button"
            onClick={() => {
              setFormSku('');
              setFormNama('');
              setFormSize('');
              setFormPrice('');
              setFormLokasi('');
              setFormCopies(1);
            }}
            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            Bersihkan Form
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* SKU */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase mb-1">
              Kode SKU Barcode <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formSku}
              onChange={(e) => handleSkuInputChange(e.target.value)}
              placeholder="Contoh: F25JBF310DBM"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>

          {/* Nama Produk */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase mb-1">
              Nama Produk & Warna
            </label>
            <input
              type="text"
              value={formNama}
              onChange={(e) => setFormNama(e.target.value)}
              placeholder="Contoh: Taylor Pants Dark Denim"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Size */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase mb-1">
              Size / Ukuran
            </label>
            <input
              type="text"
              value={formSize}
              onChange={(e) => setFormSize(e.target.value)}
              placeholder="Contoh: S, M, L, XL, All Size"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Harga */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase">
                Harga Produk
              </label>
              {(() => {
                const match = catalogMap.get(formSku.trim().toLowerCase());
                const mp = getProductMasterPrice(match);
                return mp > 0 ? (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                    ✓ Master Price (Rp {new Intl.NumberFormat('id-ID').format(mp)})
                  </span>
                ) : null;
              })()}
            </div>
            <input
              type="text"
              value={formPrice}
              onChange={(e) => setFormPrice(e.target.value)}
              placeholder="Contoh: 189000 (Otomatis dari master jika kosong)"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-purple-700 dark:text-purple-300 focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Lokasi Rak */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase mb-1">
              Lokasi Rak Gudang (Opsional)
            </label>
            <input
              type="text"
              value={formLokasi}
              onChange={(e) => setFormLokasi(e.target.value)}
              placeholder="Contoh: RAK-A01 / ETALASE-02"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Qty & Add to Queue Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-black text-slate-700 dark:text-slate-300">Qty Cetak:</span>
            <div className="flex items-center border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
              <button
                type="button"
                onClick={() => setFormCopies((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-black cursor-pointer select-none"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                value={formCopies}
                onChange={(e) => setFormCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-14 text-center text-xs font-black bg-transparent text-slate-900 dark:text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setFormCopies((p) => p + 1)}
                className="px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-black cursor-pointer select-none"
              >
                +
              </button>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1">
              {[5, 10, 25, 50].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setFormCopies(amt)}
                  className="px-2 py-1 text-[10px] font-bold bg-slate-200 dark:bg-slate-700 hover:bg-purple-100 dark:hover:bg-purple-950/60 text-slate-700 dark:text-slate-300 rounded-lg cursor-pointer"
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!formSku.trim()}
            className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>Masukkan ke Antrean ({formCopies} Lembar)</span>
          </button>
        </div>
      </form>
    </div>
  );
};
