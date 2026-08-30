import React from 'react';
import { CloudUpload, Loader2, FileText } from 'lucide-react';
import { ScannedItem } from '../types';

interface BottomSaveBarProps {
  items: ScannedItem[];
  keterangan: string;
  onChangeKeterangan: (val: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

export const BottomSaveBar: React.FC<BottomSaveBarProps> = ({
  items,
  keterangan,
  onChangeKeterangan,
  onSave,
  isSaving,
}) => {
  const skuItemsCount = items.filter((i) => !i.isCategory && !i.isLocation).length;
  const isEnabled = items.length > 0 && !isSaving;

  return (
    <div
      id="bottomSaveContainer"
      className="p-4 bg-white dark:bg-[#09090B] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md mt-4 transition-colors"
    >
      <div className="flex flex-col gap-2">
        {/* Keterangan Note input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
            <FileText className="h-4 w-4" />
          </div>
          <input
            id="inputKeterangan"
            type="text"
            value={keterangan}
            onChange={(e) => onChangeKeterangan(e.target.value)}
            placeholder="Catatan / Keterangan (Contoh: IN Supplier X, SO Rak A)..."
            className="w-full bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-xs rounded-xl block pl-9 pr-3 py-2.5 outline-none focus:ring-1 focus:ring-emerald-500 transition-all placeholder-slate-400 dark:placeholder-slate-600 font-medium"
          />
        </div>

        {/* Save Button */}
        <button
          id="btnSave"
          type="button"
          onClick={onSave}
          disabled={!isEnabled}
          className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-slate-100 dark:disabled:bg-[#0F0F12] disabled:text-slate-400 dark:disabled:text-slate-600 disabled:border-transparent dark:disabled:border-slate-800 disabled:cursor-not-allowed text-black font-extrabold py-3.5 px-4 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.35)] disabled:shadow-none transition-all flex justify-center items-center gap-2 tracking-wider uppercase text-xs sm:text-sm active:scale-[0.99]"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-black" />
              <span>MENYIMPAN DATA...</span>
            </>
          ) : (
            <>
              <CloudUpload className="w-4 h-4" />
              <span>
                SIMPAN {skuItemsCount > 0 ? `(${skuItemsCount} ITEM)` : 'DATA SCAN'}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

