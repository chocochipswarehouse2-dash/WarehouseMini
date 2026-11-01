import React, { useState, useEffect } from 'react';
import { ScanBarcode, ArrowRightLeft, FileSpreadsheet, Columns2, Table2, LayoutList } from 'lucide-react';

import { hasPermission, isSuperadmin } from '../services/permissions';

export type ScannerLayoutMode = 'split' | 'table' | 'compact';

interface OperasiStokViewProps {
  scannerComponent: React.ReactNode | ((layoutMode: ScannerLayoutMode) => React.ReactNode);
  mutasiLogComponent: React.ReactNode;
  stockOpnameComponent?: React.ReactNode;
  session?: any;
  onOpenImportModal?: () => void;
  onOpenLocationPurge?: () => void;
  scannedCount?: number;
}

export function OperasiStokView({
  scannerComponent,
  mutasiLogComponent,
  session,
  onOpenImportModal,
  scannedCount = 0,
}: OperasiStokViewProps) {
  const userIsAdmin = isSuperadmin(session);

  const tabs = [
    { id: 'scanner', permissionKey: 'tab_ops_mutasi_scanner' },
    { id: 'mutasi', permissionKey: 'tab_ops_mutasi_log' },
  ].filter((t) => userIsAdmin || hasPermission(session, t.permissionKey));

  const [activeTab, setActiveTab] = useState<'scanner' | 'mutasi'>(
    (tabs.length > 0 ? tabs[0].id : 'scanner') as 'scanner' | 'mutasi'
  );

  const [scannerLayoutMode, setScannerLayoutMode] = useState<ScannerLayoutMode>(() => {
    try {
      const saved = localStorage.getItem('wms_scanner_layout_mode') as ScannerLayoutMode | null;
      if (saved === 'split' || saved === 'table' || saved === 'compact') return saved;
    } catch {}
    return 'split';
  });

  useEffect(() => {
    try {
      localStorage.setItem('wms_scanner_layout_mode', scannerLayoutMode);
    } catch {}
  }, [scannerLayoutMode]);

  return (
    <div className="w-full min-h-full space-y-3">
      {/* COMPACT UNIFIED HEADER & TOOLBAR */}
      <div className="bg-white dark:bg-slate-900 px-3 sm:px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Module Navigation Segmented Tabs (Compact, Proportional) */}
        <div className="flex items-center gap-2.5 min-w-0 overflow-x-auto no-scrollbar">
          <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800/90 p-1 rounded-lg border border-slate-200/80 dark:border-slate-700/70 shrink-0">
            {tabs.some((t) => t.id === 'scanner') && (
              <button
                type="button"
                id="tab-operasi-scanner"
                onClick={() => setActiveTab('scanner')}
                className={`py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 rounded-md transition-all cursor-pointer select-none whitespace-nowrap ${
                  activeTab === 'scanner'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ScanBarcode className="w-3.5 h-3.5 shrink-0" />
                <span>Scanner Barcode</span>
                {scannedCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold font-mono ${
                      activeTab === 'scanner'
                        ? 'bg-white/20 text-white'
                        : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                    }`}
                  >
                    {scannedCount}
                  </span>
                )}
              </button>
            )}

            {tabs.some((t) => t.id === 'mutasi') && (
              <button
                type="button"
                id="tab-operasi-mutasi"
                onClick={() => setActiveTab('mutasi')}
                className={`py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 rounded-md transition-all cursor-pointer select-none whitespace-nowrap ${
                  activeTab === 'mutasi'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
                <span>Log Produk</span>
              </button>
            )}
          </div>

          <span className="hidden xl:inline-block text-[11px] text-slate-400 dark:text-slate-500 truncate">
            {activeTab === 'scanner'
              ? 'Pemindaian cepat #IN, #OUT, #SO & penempatan rak real-time'
              : 'Riwayat pergerakan stok & audit log produk'}
          </span>
        </div>

        {/* Right: Layout Mode Switcher + Secondary Actions */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {activeTab === 'scanner' && (
            <div
              className="inline-flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700/80"
              title="Pilih tampilan halaman Scanner"
            >
              <button
                type="button"
                onClick={() => setScannerLayoutMode('split')}
                className={`py-1 px-2.5 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  scannerLayoutMode === 'split'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilan Panel Rapi 2 Kolom (Input di Kiri, Antrean di Kanan)"
              >
                <Columns2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Panel Rapi</span>
              </button>

              <button
                type="button"
                onClick={() => setScannerLayoutMode('table')}
                className={`py-1 px-2.5 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  scannerLayoutMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilan Spreadsheet Tabel Lebar Penuh"
              >
                <Table2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Tabel</span>
              </button>

              <button
                type="button"
                onClick={() => setScannerLayoutMode('compact')}
                className={`py-1 px-2.5 text-[11px] font-bold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
                  scannerLayoutMode === 'compact'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs border border-slate-200/80 dark:border-slate-700'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="Tampilan Fokus 1 Kolom Ringkas"
              >
                <LayoutList className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Ringkas</span>
              </button>
            </div>
          )}

          {onOpenImportModal && (
            <button
              type="button"
              onClick={onOpenImportModal}
              className="py-1.5 px-3 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 rounded-lg transition-all cursor-pointer shadow-2xs shrink-0"
              title="Impor Data Excel / CSV (IN / OUT / SO)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">Impor Excel</span>
              <span className="sm:hidden">Impor</span>
            </button>
          )}
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="w-full">
        {tabs.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-sm w-full mx-auto">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <ScanBarcode className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Akses Ditolak</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Anda tidak memiliki akses ke fitur Operasi Stok. Silakan hubungi Superadmin.
              </p>
            </div>
          </div>
        )}

        <div className={`${tabs.length > 0 && activeTab === 'scanner' ? 'block' : 'hidden'}`}>
          <div className="pb-20">
            {typeof scannerComponent === 'function'
              ? scannerComponent(scannerLayoutMode)
              : scannerComponent}
          </div>
        </div>

        <div className={`${tabs.length > 0 && activeTab === 'mutasi' ? 'block' : 'hidden'}`}>
          <div className="pb-20">{mutasiLogComponent}</div>
        </div>
      </div>
    </div>
  );
}

