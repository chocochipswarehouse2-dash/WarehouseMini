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
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    // Keep focus for physical barcode reader
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = value.trim();
      if (code) {
        onScan(code);
        setValue('');
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
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
      <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl z-50 max-h-60 overflow-y-auto">
        {suggestions.map((s) => (
          <div
            key={s.k}
            onMouseDown={(e) => {
              e.preventDefault();
              onScan(s.k);
              setValue('');
              inputRef.current?.focus();
            }}
            className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-100 dark:border-slate-800/60 last:border-0 flex justify-between items-center transition-colors"
          >
            <div className="min-w-0 pr-2">
              <div className="font-bold text-slate-800 dark:text-slate-200 text-sm whitespace-normal break-words leading-tight">{s.p} {s.s && s.s !== 'ALL' ? `(Size: ${s.s})` : ''}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">SKU: {s.k}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      id="containerPhysical"
      className="bg-white dark:bg-[#09090B] px-3 py-2.5 border-b border-slate-200 dark:border-slate-800/80 transition-colors"
    >
      <div className="max-w-lg mx-auto flex flex-col gap-1.5">
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
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder || "Tembak Barcode / Tulis SKU..."}
            className="w-full bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono font-bold text-base rounded-xl focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 block pl-11 pr-12 py-2.5 outline-none uppercase transition-all placeholder-slate-400 dark:placeholder-slate-600"
            autoComplete="off"
            autoFocus
          />

          <button
            type="button"
            onClick={() => {
              if (value.trim()) {
                onScan(value.trim());
                setValue('');
                inputRef.current?.focus();
              }
            }}
            title="Scan Enter"
            className="absolute inset-y-1 right-1 px-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black font-bold rounded-lg flex items-center justify-center transition-colors shadow-[0_0_8px_rgba(16,185,129,0.3)]"
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

