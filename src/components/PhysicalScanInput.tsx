import React, { useRef, useEffect, useState } from 'react';
import { Barcode, Zap, CornerDownLeft } from 'lucide-react';
import { ProductItem } from '../types';

interface PhysicalScanInputProps {
  onScan: (sku: string) => void;
  products: ProductItem[];
}

export const PhysicalScanInput: React.FC<PhysicalScanInputProps> = ({ onScan, products }) => {
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

  return (
    <div
      id="containerPhysical"
      className="bg-white dark:bg-[#09090B] px-4 py-4 border-b border-slate-200 dark:border-slate-800/80 transition-colors"
    >
      <div className="max-w-lg mx-auto flex flex-col gap-2">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
            <Barcode className="h-5 w-5 text-emerald-500" />
          </div>
          <input
            ref={inputRef}
            id="inputPhysicalSku"
            type="text"
            list="productDatalistPhysical"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Tembak Barcode / Tulis SKU..."
            className="w-full bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono font-bold text-base rounded-xl focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 block pl-11 pr-12 py-3 outline-none uppercase transition-all placeholder-slate-400 dark:placeholder-slate-600"
            autoComplete="off"
            autoFocus
          />
          <datalist id="productDatalistPhysical">
            {products.map((p) => (
              <option key={p.k} value={p.k}>
                {p.p} {p.s ? `(Size: ${p.s})` : ''}
              </option>
            ))}
          </datalist>

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
            className="absolute inset-y-1.5 right-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-black font-bold rounded-lg flex items-center justify-center transition-colors shadow-[0_0_8px_rgba(16,185,129,0.3)]"
          >
            <CornerDownLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between px-1">
          <div
            id="helperTextManual"
            className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5"
          >
            <Zap className={`w-3.5 h-3.5 ${isFocused ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
            <span>
              {isFocused
                ? 'Scanner Aktif — Siap ketik / scan barcode'
                : 'Klik kolom input untuk mengetik atau scan'}
            </span>
          </div>

          <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
            Auto-Enter
          </span>
        </div>
      </div>
    </div>
  );
};

