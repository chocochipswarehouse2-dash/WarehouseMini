import React from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckSquare, MapPin, Tag, X } from 'lucide-react';
import { CategoryType } from '../types';

interface QuickTagToolbarProps {
  currentCategory: CategoryType;
  currentLocation: string;
  onSelectCategory: (cat: CategoryType) => void;
  onSelectLocation: (loc: string) => void;
}

const COMMON_LOCATIONS = ['SHOPEE', 'TIKTOK', 'STUDIO'];

export const QuickTagToolbar: React.FC<QuickTagToolbarProps> = ({
  currentCategory,
  currentLocation,
  onSelectCategory,
  onSelectLocation,
}) => {
  return (
    <div
      id="quickTagToolbar"
      className="bg-white dark:bg-[#0F0F12] border-b border-slate-200 dark:border-slate-800/80 px-2 py-1.5 transition-colors"
    >
      <div className="max-w-lg mx-auto flex flex-col gap-1.5">
        {/* Category Mode Quick Toggle & Active Indicator */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1 flex-shrink-0">
            <Tag className="w-3 h-3 text-emerald-500" /> Mode:
          </span>
          <div className="flex gap-1.5 overflow-x-auto flex-1 pb-0.5 no-scrollbar">
            <button
              type="button"
              onClick={() => onSelectCategory('SO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
                currentCategory === 'SO'
                  ? 'bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.4)] ring-2 ring-emerald-500/30'
                  : 'bg-slate-100 dark:bg-[#09090B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>#SO (Opname)</span>
              {currentCategory === 'SO' && (
                <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectCategory('IN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
                currentCategory === 'IN'
                  ? 'bg-indigo-600 text-white shadow-[0_0_10px_rgba(79,70,229,0.4)] ring-2 ring-indigo-500/30'
                  : 'bg-slate-100 dark:bg-[#09090B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>#IN (Masuk)</span>
              {currentCategory === 'IN' && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onSelectCategory('OUT')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 flex-shrink-0 cursor-pointer ${
                currentCategory === 'OUT'
                  ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(147,51,234,0.4)] ring-2 ring-purple-500/30'
                  : 'bg-slate-100 dark:bg-[#09090B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>#OUT (Keluar)</span>
              {currentCategory === 'OUT' && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
            </button>
          </div>
        </div>

        {/* Quick Location Chips & Active Indicator */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1 flex-shrink-0">
            <MapPin className="w-3 h-3 text-slate-400" /> Lokasi:
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1 pb-0.5 no-scrollbar">
            {/* Active custom location indicator if set */}
            {currentLocation && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 flex-shrink-0 shadow-sm">
                <span>📍 #{currentLocation}</span>
                <button
                  type="button"
                  onClick={() => onSelectLocation('')}
                  className="text-slate-400 hover:text-rose-500 ml-1 p-0.5 rounded cursor-pointer"
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
                className="px-2 py-1 rounded-md text-[11px] font-bold transition-colors flex-shrink-0 font-mono bg-slate-100 dark:bg-[#09090B] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
              >
                #{loc}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

