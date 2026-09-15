import React, { useState } from 'react';
import { ScanBarcode, ArrowRightLeft, ClipboardList } from 'lucide-react';

import { hasPermission, isSuperadmin } from '../services/permissions';

interface OperasiStokViewProps {
  scannerComponent: React.ReactNode;
  mutasiLogComponent: React.ReactNode;
  stockOpnameComponent: React.ReactNode;
  session?: any;
}

export function OperasiStokView({
  scannerComponent,
  mutasiLogComponent,
  stockOpnameComponent,
  session
}: OperasiStokViewProps) {
  const userIsAdmin = isSuperadmin(session);
  
  const tabs = [
    { id: 'scanner', permissionKey: 'tab_ops_stok_scanner' },
    { id: 'mutasi', permissionKey: 'tab_ops_stok_mutasi_log' },
    { id: 'opname', permissionKey: 'tab_ops_stok_stock_opname' }
  ].filter(t => userIsAdmin || hasPermission(session, t.permissionKey));

  const [activeTab, setActiveTab] = useState<'scanner' | 'mutasi' | 'opname'>(
    (tabs.length > 0 ? tabs[0].id : 'scanner') as 'scanner' | 'mutasi' | 'opname'
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0f1c]">
      {/* HEADER & TABS - Style Quality Control */}
      <div className="p-2 sm:p-4 pb-0 shrink-0">
        <div className="bg-slate-100/90 dark:bg-[#09090b]/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
          <div className="grid grid-cols-3 sm:flex sm:items-center gap-1 sm:gap-1.5">
            {tabs.some(t => t.id === 'scanner') && (
            <button
              type="button"
              id="tab-operasi-scanner"
              onClick={() => setActiveTab('scanner')}
              className={`py-2 sm:py-2.5 px-2.5 sm:px-4 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer select-none ${
                activeTab === 'scanner'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-500/50'
                  : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ScanBarcode className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Scanner</span>
            </button>
            )}
            
            {tabs.some(t => t.id === 'mutasi') && (
            <button
              type="button"
              id="tab-operasi-mutasi"
              onClick={() => setActiveTab('mutasi')}
              className={`py-2 sm:py-2.5 px-2.5 sm:px-4 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer select-none ${
                activeTab === 'mutasi'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-indigo-500/50'
                  : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span><span className="sm:hidden">Mutasi</span><span className="hidden sm:inline">Mutasi Log</span></span>
            </button>
            )}
            
            {tabs.some(t => t.id === 'opname') && (
            <button
              type="button"
              id="tab-operasi-opname"
              onClick={() => setActiveTab('opname')}
              className={`py-2 sm:py-2.5 px-2.5 sm:px-4 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer select-none ${
                activeTab === 'opname'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-1 ring-emerald-500/50'
                  : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span><span className="sm:hidden">Opname</span><span className="hidden sm:inline">Stock Opname</span></span>
            </button>
            )}
          </div>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative">
        {tabs.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-sm w-full mx-auto mt-6">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <ScanBarcode className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Akses Ditolak</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Anda tidak memiliki akses ke fitur Operasi Stok. Silakan hubungi Superadmin.
              </p>
            </div>
          </div>
        )}

        <div className={`absolute inset-0 overflow-y-auto ${tabs.length > 0 && activeTab === 'scanner' ? 'block' : 'hidden'}`}>
          <div className="p-3 sm:p-5 pb-28">
            {scannerComponent}
          </div>
        </div>
        
        <div className={`absolute inset-0 overflow-y-auto ${tabs.length > 0 && activeTab === 'mutasi' ? 'block' : 'hidden'}`}>
          {/* Let MutasiLogView handle its own padding and layout */}
          {mutasiLogComponent}
        </div>
        
        <div className={`absolute inset-0 overflow-y-auto ${tabs.length > 0 && activeTab === 'opname' ? 'block' : 'hidden'}`}>
          {/* Let StockOpnameView handle its own padding and layout */}
          <div className="p-4 sm:p-6 pb-24 mx-auto">
            {stockOpnameComponent}
          </div>
        </div>
      </div>
    </div>
  );
}
