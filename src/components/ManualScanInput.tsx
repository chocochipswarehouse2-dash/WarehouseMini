import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  X,
  Package,
  ChevronDown,
  RefreshCw,
  MapPin,
  Tag,
  Database,
  Check,
  Sparkles,
} from 'lucide-react';
import { ProductItem } from '../types';
import { searchProductsInSupabase, isDummyProduct } from '../services/supabase';

interface ManualScanInputProps {
  onScan: (sku: string) => void;
  products: ProductItem[];
  onRefreshProducts?: () => Promise<void>;
  onAddDiscoveredProducts?: (newItems: ProductItem[]) => void;
}

export const ManualScanInput: React.FC<ManualScanInputProps> = ({
  onScan,
  products,
  onRefreshProducts,
  onAddDiscoveredProducts,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchingSupabase, setIsSearchingSupabase] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [supabaseMatches, setSupabaseMatches] = useState<ProductItem[]>([]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute merged list of local matches and Supabase live matches
  const displayList = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    const map = new Map<string, ProductItem>();

    const validProducts = products.filter((p) => p && p.k && !isDummyProduct(p));

    if (!q) {
      // If query is empty, show top 20 items from products database
      validProducts.slice(0, 20).forEach((p) => {
        if (p && p.k) map.set(p.k.toUpperCase(), p);
      });
      return Array.from(map.values());
    }

    const tokens = q.split(/\s+/).filter(Boolean);

    // 1. Add local matching items
    validProducts.forEach((p) => {
      const sku = (p.k || '').toLowerCase();
      const name = (p.p || '').toLowerCase();
      const size = (p.s || '').toLowerCase();
      const lokasi = (p.lokasi || '').toLowerCase();
      const cat = (p.category || '').toLowerCase();
      const fullText = `${sku} ${name} ${size} ${lokasi} ${cat}`;

      if (tokens.every((tok) => fullText.includes(tok))) {
        map.set(p.k.toUpperCase(), p);
      }
    });

    // 2. Add remote Supabase live matches
    supabaseMatches.forEach((p) => {
      if (p && p.k && !isDummyProduct(p) && !map.has(p.k.toUpperCase())) {
        map.set(p.k.toUpperCase(), p);
      }
    });

    return Array.from(map.values()).slice(0, 25);
  }, [inputValue, products, supabaseMatches]);

  // Live remote search debouncer when user types
  const triggerRemoteSearch = (query: string) => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const clean = query.trim();
    if (!clean) {
      setSupabaseMatches([]);
      setIsSearchingSupabase(false);
      return;
    }

    setIsSearchingSupabase(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchProductsInSupabase(clean);
        setSupabaseMatches(results);
        if (results.length > 0 && onAddDiscoveredProducts) {
          onAddDiscoveredProducts(results);
        }
      } catch (err) {
        console.warn('Live search Supabase error:', err);
      } finally {
        setIsSearchingSupabase(false);
      }
    }, 180);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setSelectedIndex(-1);
    setIsDropdownOpen(true);
    triggerRemoteSearch(val);
  };

  const handleSubmit = (skuToSubmit?: string) => {
    let targetSku = (skuToSubmit || inputValue).trim().toUpperCase();

    // If user clicked enter and an item in dropdown is highlighted by arrow keys
    if (!skuToSubmit && selectedIndex >= 0 && displayList[selectedIndex]) {
      targetSku = displayList[selectedIndex].k.toUpperCase();
    } else if (!skuToSubmit && inputValue.trim()) {
      // If user typed product name instead of SKU and there is an exact or best match
      const q = inputValue.trim().toLowerCase();
      const exactMatch = displayList.find(
        (p) => p.k.toLowerCase() === q || p.p.toLowerCase() === q
      );
      if (exactMatch) {
        targetSku = exactMatch.k.toUpperCase();
      } else if (displayList.length === 1) {
        targetSku = displayList[0].k.toUpperCase();
      }
    }

    if (targetSku) {
      onScan(targetSku);
      setInputValue('');
      setIsDropdownOpen(false);
      setSelectedIndex(-1);
      setSupabaseMatches([]);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || displayList.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsDropdownOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < displayList.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : displayList.length - 1));
    } else if (e.key === 'Enter') {
      if (selectedIndex >= 0 && displayList[selectedIndex]) {
        e.preventDefault();
        handleSubmit(displayList[selectedIndex].k);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const handleManualRefresh = async () => {
    if (onRefreshProducts && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefreshProducts();
      } catch (err) {
        console.warn('Manual refresh failed:', err);
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  // Helper to highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim() || !text) return text;
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    const regex = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="text-emerald-600 dark:text-emerald-400 font-bold underline decoration-emerald-500/40">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div
      id="containerManualInput"
      className="bg-white dark:bg-[#09090B] px-4 py-4 border-b border-slate-200 dark:border-slate-800/80 transition-colors relative"
    >
      <div className="max-w-lg mx-auto flex flex-col gap-2 relative">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
              <Search className="h-4 w-4" />
            </div>

            <input
              ref={inputRef}
              id="inputManualSku"
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setIsDropdownOpen(true);
              }}
              placeholder="Cari SKU, Nama Barang, atau Ukuran di Supabase..."
              className="w-full bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-medium text-sm rounded-xl focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 block pl-10 pr-16 py-3 outline-none uppercase transition-all placeholder-slate-400 dark:placeholder-slate-600 font-sans"
              autoComplete="off"
            />

            <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
              {inputValue && (
                <button
                  type="button"
                  onClick={() => {
                    setInputValue('');
                    setSupabaseMatches([]);
                    setSelectedIndex(-1);
                    inputRef.current?.focus();
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                  title="Bersihkan input"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen((prev) => !prev);
                  inputRef.current?.focus();
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Buka / Tutup Daftar Database Produk"
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-emerald-500' : ''}`} />
              </button>
            </div>
          </div>

          <button
            id="btnSubmitManual"
            type="submit"
            disabled={!inputValue.trim()}
            className="bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-40 text-black px-4 py-3 rounded-xl font-bold text-xs tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-[0_0_10px_rgba(16,185,129,0.25)] flex-shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>TAMBAH</span>
          </button>
        </form>

        {/* Database Quick Info & Refresh Trigger */}
        <div className="flex items-center justify-between px-1 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-emerald-500" />
            <span>
              <strong className="text-slate-700 dark:text-slate-300 font-semibold">
                {products.filter((p) => p && p.k && !isDummyProduct(p)).length}
              </strong>{' '}
              produk di Supabase
            </span>
            {isSearchingSupabase && (
              <span className="flex items-center gap-1 text-emerald-500 font-medium ml-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Mencari...</span>
              </span>
            )}
          </div>

          {onRefreshProducts && (
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer disabled:opacity-50"
              title="Sinkronkan ulang database produk dari Supabase"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
              <span>{isRefreshing ? 'Memuat...' : 'Sinkronkan'}</span>
            </button>
          )}
        </div>

        {/* Autocomplete Dropdown suggestions */}
        {isDropdownOpen && (
          <div
            ref={dropdownRef}
            id="manualProductDropdown"
            className="absolute top-[88px] left-0 right-0 z-50 bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80 max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150"
          >
            {/* Header in Dropdown */}
            <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                {inputValue.trim()
                  ? `Hasil Pencarian Supabase (${displayList.length})`
                  : `Daftar Produk Supabase (${displayList.length})`}
              </span>
              <span className="text-[10px] text-slate-400">Gunakan ↑ ↓ Enter</span>
            </div>

            {displayList.length > 0 ? (
              displayList.map((item, idx) => {
                const isSelected = selectedIndex === idx;
                return (
                  <button
                    key={`${item.k}-${idx}`}
                    type="button"
                    onClick={() => handleSubmit(item.k)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between transition-colors group cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-emerald-500 pl-2.5'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-emerald-500 text-black'
                            : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-black'
                        }`}
                      >
                        <Package className="w-4 h-4" />
                      </div>

                      <div className="overflow-hidden flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs sm:text-sm text-slate-900 dark:text-slate-100 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 truncate">
                            {highlightMatch(item.k, inputValue)}
                          </span>
                          {item.category && (
                            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded">
                              <Tag className="w-2.5 h-2.5" />
                              {item.category}
                            </span>
                          )}
                        </div>

                        <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 truncate font-bold mt-0.5">
                          {highlightMatch(item.p || item.k, inputValue)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {item.lokasi && (
                        <span className="inline-flex items-center gap-1 text-xs font-mono font-bold px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 rounded-lg">
                          <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          {item.lokasi}
                        </span>
                      )}

                      {item.s && (
                        <span className="text-xs font-black px-2.5 py-1 bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30 rounded-lg uppercase">
                          {item.s}
                        </span>
                      )}

                      <div className={`p-1 rounded-lg transition-opacity ${isSelected ? 'opacity-100 text-emerald-500' : 'opacity-0 group-hover:opacity-100 text-slate-400'}`}>
                        <Check className="w-4 h-4" />
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {inputValue.trim() ? (
                    <>
                      Tidak ditemukan produk dengan kata kunci "<strong>{inputValue}</strong>" di database Supabase.
                    </>
                  ) : (
                    <>Belum ada katalog produk di database Supabase.</>
                  )}
                </p>
                {inputValue.trim() && (
                  <button
                    type="button"
                    onClick={() => handleSubmit(inputValue)}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500 hover:text-black dark:hover:bg-emerald-500 dark:hover:text-black rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tetap Gunakan "{inputValue.toUpperCase()}"</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
