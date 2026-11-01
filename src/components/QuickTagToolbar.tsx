import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckSquare, MapPin, Tag, X, Plus } from 'lucide-react';
import { CategoryType } from '../types';

interface QuickTagToolbarProps {
  isVisible?: boolean;
  currentCategory: CategoryType;
  currentLocation: string;
  onSelectCategory: (cat: CategoryType) => void;
  onSelectLocation: (loc: string) => void;
}

const COMMON_LOCATIONS = ['SHOPEE', 'TIKTOK', 'STUDIO', 'TRANSIT'];

export const QuickTagToolbar: React.FC<QuickTagToolbarProps> = ({
  isVisible = true,
  currentCategory,
  currentLocation,
  onSelectCategory,
  onSelectLocation,
}) => {
  const [customLocInput, setCustomLocInput] = useState('');
  const [isEditingCustomLoc, setIsEditingCustomLoc] = useState(false);

  const handleApplyCustomLoc = () => {
    const clean = customLocInput.replace(/^#+/, '').trim().toUpperCase();
    if (clean) {
      onSelectLocation(clean);
      setCustomLocInput('');
      setIsEditingCustomLoc(false);
    }
  };

  return (
    <div
      id="quickTagToolbar"
      style={{ display: isVisible ? 'block' : 'none' }}
      className="bg-slate-50/70 dark:bg-slate-900/60 rounded-b-xl px-3.5 py-2.5 transition-colors"
    >
      <div className="w-full flex flex-col gap-2.5">
        {/* Category Mode Quick Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1 shrink-0 w-16">
            <Tag className="w-3 h-3 text-indigo-500" /> Mode:
          </span>
          <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => onSelectCategory('IN')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                currentCategory === 'IN'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/70'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">#IN Masuk</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectCategory('OUT')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                currentCategory === 'OUT'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/70'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">#OUT Keluar</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectCategory('SO')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                currentCategory === 'SO'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/70'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">#SO Opname</span>
            </button>
          </div>
        </div>

        {/* Quick Location Chips & Custom Rack Input */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1 shrink-0 w-16">
            <MapPin className="w-3 h-3 text-emerald-500" /> Lokasi:
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 no-scrollbar flex-wrap">
            {currentLocation && (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 shrink-0">
                <MapPin className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span>#{currentLocation}</span>
                <button
                  type="button"
                  onClick={() => onSelectLocation('')}
                  className="text-emerald-600/70 hover:text-rose-600 ml-0.5 p-0.5 rounded cursor-pointer"
                  title="Kosongkan Lokasi"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {COMMON_LOCATIONS.filter((l) => l !== currentLocation).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => onSelectLocation(loc)}
                className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors shrink-0 font-mono bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                #{loc}
              </button>
            ))}

            {isEditingCustomLoc ? (
              <div className="inline-flex items-center gap-1">
                <input
                  type="text"
                  value={customLocInput}
                  onChange={(e) => setCustomLocInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyCustomLoc();
                    } else if (e.key === 'Escape') {
                      setIsEditingCustomLoc(false);
                    }
                  }}
                  placeholder="Mis: A001"
                  autoFocus
                  className="w-20 px-2 py-0.5 text-xs font-mono font-bold uppercase bg-white dark:bg-slate-800 border border-indigo-400 rounded-md outline-none text-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomLoc}
                  className="px-2 py-0.5 text-[11px] font-bold bg-indigo-600 text-white rounded-md cursor-pointer"
                >
                  Set
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditingCustomLoc(true)}
                className="px-2 py-1 rounded-md text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/70 hover:bg-indigo-100/70 flex items-center gap-1 shrink-0 cursor-pointer"
                title="Ketik kode rak manual (contoh: A001, B012, R005)"
              >
                <Plus className="w-3 h-3" />
                <span>Pilih Rak</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
