import React from 'react';
import { ScanLine, Keyboard, Camera } from 'lucide-react';
import { ScanMode } from '../types';

interface ScanMethodSelectorProps {
  currentMode: ScanMode;
  onSelectMode: (mode: ScanMode) => void;
}

export const ScanMethodSelector: React.FC<ScanMethodSelectorProps> = ({
  currentMode,
  onSelectMode,
}) => {
  return (
    <div
      id="scanMethodContainer"
      className="bg-white dark:bg-[#0F0F12] px-4 py-3 border-b border-slate-200 dark:border-slate-800/80 transition-colors"
    >
      <div className="max-w-lg mx-auto">
        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 text-center">
          Metode Pemindaian
        </label>
        <div className="flex bg-slate-100 dark:bg-[#09090B] p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            id="btnModeFisik"
            type="button"
            onClick={() => onSelectMode('fisik')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              currentMode === 'fisik'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700/80 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ScanLine className="w-3.5 h-3.5" />
            <span>Fisik Gun</span>
          </button>

          <button
            id="btnModeManual"
            type="button"
            onClick={() => onSelectMode('manual')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              currentMode === 'manual'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700/80 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Manual</span>
          </button>

          <button
            id="btnModeKamera"
            type="button"
            onClick={() => onSelectMode('kamera')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              currentMode === 'kamera'
                ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700/80 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Kamera HP</span>
          </button>
        </div>
      </div>
    </div>
  );
};

