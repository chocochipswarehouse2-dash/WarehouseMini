import React from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckSquare, MapPin, Tag, X } from 'lucide-react';
import { CategoryType } from '../types';

interface QuickTagToolbarProps {
  isVisible?: boolean;
  currentCategory: CategoryType;
  currentLocation: string;
  onSelectCategory: (cat: CategoryType) => void;
  onSelectLocation: (loc: string) => void;
}

const COMMON_LOCATIONS = ['SHOPEE', 'TIKTOK', 'STUDIO'];

export const QuickTagToolbar: React.FC<QuickTagToolbarProps> = ({
  isVisible = true,
  currentCategory,
  currentLocation,
  onSelectCategory,
  onSelectLocation,
}) => {
  return (
    <div
      id="quickTagToolbar"
      style={{ display: isVisible ? 'block' : 'none' }}
      className="bg-white dark:bg-[#0F0F12] rounded-b-2xl px-3 py-2 transition-colors"
    >
      <div className="w-full flex flex-col gap-2">
        {/* Category Mode Quick Toggle & Active Indicator */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1 flex-shrink-0">
            <Tag className="w-3 h-3 text-emerald-500" /> Mode:
          </span>
          <div className="flex gap-1.5 overflow-x-auto flex-1 min-w-0 pb-0.5 no-scrollbar">
          </div>
        </div>

        {/* Quick Location Chips & Active Indicator */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1 flex-shrink-0">
            <MapPin className="w-3 h-3 text-slate-400" /> Lokasi:
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 pb-0.5 no-scrollbar">
            {/* Active custom location indicator if set */}
            {currentLocation && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 flex-shrink-0 shadow-sm">
                <span>📍 #{currentLocation}</span>
                <button
                  type="button"
                  onClick={() => onSelectLocation('')}
                  className="text-slate-400 hover:text-primary-500 ml-1 p-0.5 rounded cursor-pointer"
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

