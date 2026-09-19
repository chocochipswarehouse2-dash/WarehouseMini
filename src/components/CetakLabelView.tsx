import React, { useState } from 'react';
import { Package, QrCode, Printer, Layers, Info } from 'lucide-react';
import { LabelPaketTab, LabelItem, generatePackageId, createQrDataUrl, QrCodeImage } from './CetakLabel/LabelPaketTab';
import { LabelCustomTab } from './CetakLabel/LabelCustomTab';

// Re-export shared types & helpers for backward compatibility
export type { LabelItem };
export { generatePackageId, createQrDataUrl, QrCodeImage };

export const CetakLabelView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'paket' | 'custom'>(() => {
    try {
      const saved = localStorage.getItem('wms_cetak_label_active_tab');
      if (saved === 'paket' || saved === 'custom') return saved;
    } catch {}
    return 'paket';
  });

  const handleSelectTab = (tab: 'paket' | 'custom') => {
    setActiveTab(tab);
    try {
      localStorage.setItem('wms_cetak_label_active_tab', tab);
    } catch {}
  };

  return (
    <div className="p-2 sm:p-4 space-y-4 max-w-7xl mx-auto pb-24">
      {/* 
        ========================================================
        HEADER & TAB SWITCHER BAR
        ========================================================
      */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                Cetak Label
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cetak label pengiriman paket & label QR code custom penomoran rak/bin A6
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="bg-slate-100 dark:bg-slate-800/80 p-1 sm:p-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-1 w-full sm:w-auto">
          <button
            type="button"
            id="tab-label-paket"
            onClick={() => handleSelectTab('paket')}
            className={`flex-1 sm:flex-none py-2 px-3.5 sm:px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer select-none ${
              activeTab === 'paket'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-white/60 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-900'
            }`}
          >
            <Package className="w-4 h-4 shrink-0" />
            <span>Label Paket</span>
          </button>

          <button
            type="button"
            id="tab-label-custom"
            onClick={() => handleSelectTab('custom')}
            className={`flex-1 sm:flex-none py-2 px-3.5 sm:px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer select-none ${
              activeTab === 'custom'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'bg-white/60 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-900'
            }`}
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span>Label Custom (Rak & QR)</span>
          </button>
        </div>
      </div>

      {/* 
        ========================================================
        TAB CONTENT
        ========================================================
      */}
      {activeTab === 'paket' && <LabelPaketTab />}
      {activeTab === 'custom' && <LabelCustomTab />}
    </div>
  );
};
export default CetakLabelView;
