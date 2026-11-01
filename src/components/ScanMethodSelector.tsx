import React from 'react';
import { Keyboard, Camera } from 'lucide-react';
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
    <div id="scanMethodContainer" className="inline-flex w-full sm:w-auto">
      <div className="inline-flex w-full sm:w-auto bg-slate-100 dark:bg-slate-800/90 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700/80">
        <button
          id="btnModeFisik"
          type="button"
          onClick={() => onSelectMode('fisik')}
          className={`flex-1 sm:flex-initial py-1 px-2.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            currentMode === 'fisik' || currentMode === 'manual'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Keyboard className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Ketik / Scan</span>
        </button>

        <button
          id="btnModeKamera"
          type="button"
          onClick={() => onSelectMode('kamera')}
          className={`flex-1 sm:flex-initial py-1 px-2.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            currentMode === 'kamera'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Camera className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Kamera HP</span>
        </button>
      </div>
    </div>
  );
};

