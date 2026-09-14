import React, { useState } from 'react';
import { ScanBarcode, ArrowRightLeft, ClipboardList } from 'lucide-react';

interface OperasiStokViewProps {
  scannerComponent: React.ReactNode;
  mutasiLogComponent: React.ReactNode;
  stockOpnameComponent: React.ReactNode;
}

export function OperasiStokView({
  scannerComponent,
  mutasiLogComponent,
  stockOpnameComponent
}: OperasiStokViewProps) {
  const [activeTab, setActiveTab] = useState<'scanner' | 'mutasi' | 'opname'>('scanner');

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0f1c]">
      {/* HEADER & TABS */}
      <div className="bg-white dark:bg-[#131d31] border-b border-slate-200 dark:border-slate-800 shrink-0 pt-4">
        <div className="flex items-center gap-6 px-4 sm:px-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('scanner')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'scanner'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <ScanBarcode className="w-4 h-4" />
            Scanner
          </button>
          
          <button
            onClick={() => setActiveTab('mutasi')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'mutasi'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Mutasi Log
          </button>
          
          <button
            onClick={() => setActiveTab('opname')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'opname'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Stock Opname
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'scanner' ? 'block' : 'hidden'}`}>
          <div className="p-3 sm:p-5 pb-28">
            {scannerComponent}
          </div>
        </div>
        
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'mutasi' ? 'block' : 'hidden'}`}>
          {/* Let MutasiLogView handle its own padding and layout */}
          {mutasiLogComponent}
        </div>
        
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'opname' ? 'block' : 'hidden'}`}>
          {/* Let StockOpnameView handle its own padding and layout */}
          <div className="p-4 sm:p-6 pb-24 mx-auto">
            {stockOpnameComponent}
          </div>
        </div>
      </div>
    </div>
  );
}
