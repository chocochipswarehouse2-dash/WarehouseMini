import React, { useRef, useEffect, useState } from 'react';
import { Barcode, Zap, CornerDownLeft } from 'lucide-react';
import { ProductItem } from '../types';
import { partialSearchMatch } from '../utils/sortUtils';

interface PhysicalScanInputProps {
  onScan: (sku: string) => void;
  products: ProductItem[];
  placeholder?: string;
  footerContent?: React.ReactNode;
}

export const PhysicalScanInput: React.FC<PhysicalScanInputProps> = ({ onScan, products, placeholder, footerContent }) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(true);

  // Track touch position to distinguish between tap (select) and swipe (scroll)
  const touchStartYRef = useRef<number>(0);
  const touchStartXRef = useRef<number>(0);
  const isTouchScrollingRef = useRef<boolean>(false);

  useEffect(() => {
    // Keep focus for physical barcode reader on desktop without causing mobile screen jumps
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      inputRef.current?.focus();
    }
  }, []);

  // Close suggestions when clicking or tapping outside container
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = value.trim();
      if (code) {
        onScan(code);
        setValue('');
        setIsFocused(false);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    if (!isFocused) setIsFocused(true);
  };

  const selectSuggestion = (sku: string) => {
    onScan(sku);
    setValue('');
    setIsFocused(false);
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      inputRef.current?.focus();
    }
  };

  const renderSuggestions = () => {
    if (!isFocused || !value.trim()) return null;
    
    // Check if exact match to prevent redundant popup
    if (products.some(p => p.k.toUpperCase() === value.trim().toUpperCase())) return null;

    const suggestions = products
      .filter((p) => partialSearchMatch(value, p.k, p.p, p.s, p.category, p.lokasi))
      .slice(0, 25);

    if (suggestions.length === 0) return null;

    return (
      <div 
        className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl z-[60] max-h-72 sm:max-h-80 overflow-y-auto overscroll-contain touch-pan-y"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
      >
        <div className="sticky top-0 bg-slate-100/95 dark:bg-[#111827]/95 backdrop-blur-xs px-3.5 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center border-b border-slate-200 dark:border-slate-800 z-10 select-none">
          <span>Hasil Pencarian ({suggestions.length})</span>
          <span className="text-[9px] lowercase font-medium text-slate-400">Swipe untuk scroll • Ketuk untuk pilih</span>
        </div>
        {suggestions.map((s, sIdx) => (
          <div
            key={`${s.k}_${s.s || ''}_${sIdx}`}
            onMouseDown={(e) => {
              // Prevent input blur before click registers on desktop
              e.preventDefault();
            }}
            onClick={() => {
              selectSuggestion(s.k);
            }}
            onTouchStart={(e) => {
              touchStartYRef.current = e.touches[0].clientY;
              touchStartXRef.current = e.touches[0].clientX;
              isTouchScrollingRef.current = false;
            }}
            onTouchMove={(e) => {
              const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current);
              const dx = Math.abs(e.touches[0].clientX - touchStartXRef.current);
              if (dy > 8 || dx > 8) {
                isTouchScrollingRef.current = true;
              }
            }}
            onTouchEnd={(e) => {
              if (!isTouchScrollingRef.current) {
                e.preventDefault();
                selectSuggestion(s.k);
              }
            }}
            className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 active:bg-emerald-50 dark:active:bg-emerald-950/40 cursor-pointer border-b border-slate-100 dark:border-slate-800/60 last:border-0 flex justify-between items-center transition-colors select-none"
          >
            <div className="min-w-0 pr-2 pointer-events-none">
              <div className="font-bold text-slate-800 dark:text-slate-200 text-sm whitespace-normal break-words leading-tight">
                {s.p} {s.s && s.s !== 'ALL' ? `(Size: ${s.s})` : ''}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                <span>SKU: <strong className="text-slate-700 dark:text-slate-300">{s.k}</strong></span>
                {s.lokasi && (
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                    📍 {s.lokasi}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      id="containerPhysical"
      className="bg-transparent px-3 py-2.5 border-b border-slate-200 dark:border-slate-800/80 transition-colors"
    >
      <div className="w-full flex flex-col gap-1.5">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
            <Barcode className="h-5 w-5 text-emerald-500" />
          </div>
          <input
            ref={inputRef}
            id="inputPhysicalSku"
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            placeholder={placeholder || "Scan Barcode / Ketik..."}
            className="w-full bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono font-bold text-sm sm:text-base rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 block pl-11 pr-12 py-2.5 outline-none uppercase transition-all placeholder-slate-400 dark:placeholder-slate-600"
            autoComplete="off"
          />

          <button
            type="button"
            onClick={() => {
              if (value.trim()) {
                onScan(value.trim());
                setValue('');
                setIsFocused(false);
                if (typeof window !== 'undefined' && window.innerWidth >= 768) {
                  inputRef.current?.focus();
                }
              }
            }}
            title="Scan Enter"
            className="absolute inset-y-1 right-1 px-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black font-bold rounded-lg flex items-center justify-center transition-colors shadow-[0_0_8px_rgba(16,185,129,0.3)] cursor-pointer"
          >
            <CornerDownLeft className="w-4 h-4" />
          </button>
          {renderSuggestions()}
        </div>

        {footerContent && (
          <div className="flex items-center justify-end px-1">
            {footerContent}
          </div>
        )}
      </div>
    </div>
  );
};

