import React, { useState } from 'react';
import { Store, Package } from 'lucide-react';
import { UserSession } from '../types';
import { MutasiStoreTab } from './PenerimaanBarang/MutasiStoreTab';
import { PenerimaanPaketTab } from './PenerimaanBarang/PenerimaanPaketTab';

interface PenerimaanBarangViewProps {
  session?: UserSession | null;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const PenerimaanBarangView: React.FC<PenerimaanBarangViewProps> = ({
  session = null,
  onShowToast = () => {},
}) => {
  const [instrumentTab, setInstrumentTab] = useState<'store' | 'paket'>('store');

  return (
    <div className="p-2 sm:p-4 space-y-4 max-w-5xl mx-auto pb-24">
      {/* Instrument Switcher Tabs: Store & Paket */}
      <div className="bg-slate-100/90 dark:bg-[#09090b]/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs w-full sm:w-auto inline-block">
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            id="tab-instrument-store"
            onClick={() => setInstrumentTab('store')}
            className={`py-2 sm:py-2.5 px-3 sm:px-4 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer select-none ${
              instrumentTab === 'store'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-1 ring-emerald-500/50'
                : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Store className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Store</span>
          </button>

          <button
            type="button"
            id="tab-instrument-paket"
            onClick={() => setInstrumentTab('paket')}
            className={`py-2 sm:py-2.5 px-3 sm:px-4 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer select-none ${
              instrumentTab === 'paket'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-500/50'
                : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Paket</span>
          </button>
        </div>
      </div>

      {/* Content for Active Instrument */}
      {instrumentTab === 'store' && (
        <MutasiStoreTab session={session} onShowToast={onShowToast} />
      )}

      {instrumentTab === 'paket' && (
        <PenerimaanPaketTab session={session} onShowToast={onShowToast} />
      )}
    </div>
  );
};
