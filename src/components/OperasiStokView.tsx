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
  const [activeTab, setActiveTab] = useState<'scanner_mutasi' | 'opname'>('scanner_mutasi');

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0f1c]">
      {/* HEADER & TABS */}
      <div className="bg-white dark:bg-[#131d31] border-b border-slate-200 dark:border-slate-800 shrink-0 pt-4">
        <div className="flex items-center gap-6 px-4 sm:px-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('scanner_mutasi')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'scanner_mutasi'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <ScanBarcode className="w-4 h-4" />
            Scanner & Mutasi
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
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'scanner_mutasi' ? 'block' : 'hidden'}`}>
          <div className="p-4 sm:p-6 pb-24 mx-auto w-full max-w-[1600px]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Scanner Card */}
              <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-[#0a0f1c]/50">
                  <ScanBarcode className="w-5 h-5 text-primary-500" />
                  <h2 className="font-bold text-slate-800 dark:text-white">Scanner In/Out</h2>
                </div>
                <div className="p-4 sm:p-6 overflow-y-auto">
                  {scannerComponent}
                </div>
              </div>
              
              {/* Mutasi Log Card */}
              <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 bg-slate-50/50 dark:bg-[#0a0f1c]/50">
                  <ArrowRightLeft className="w-5 h-5 text-primary-500" />
                  <h2 className="font-bold text-slate-800 dark:text-white">Riwayat Mutasi Log</h2>
                </div>
                <div className="p-4 sm:p-6 overflow-y-auto bg-slate-50 dark:bg-[#0a0f1c]">
                  {mutasiLogComponent}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className={`absolute inset-0 overflow-y-auto ${activeTab === 'opname' ? 'block' : 'hidden'}`}>
          <div className="p-4 sm:p-6 pb-24 mx-auto">
            {stockOpnameComponent}
          </div>
        </div>
      </div>
    </div>
  );
}
