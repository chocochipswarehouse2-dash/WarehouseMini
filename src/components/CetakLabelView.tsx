import React, { useState, useEffect } from 'react';
import { Package, QrCode, Printer, Barcode } from 'lucide-react';
import { ProductItem, UserSession } from '../types';
import { LabelPaketTab, LabelItem, generatePackageId, createQrDataUrl, QrCodeImage } from './CetakLabel/LabelPaketTab';
import { CetakLokasiRakTab } from './CetakLabel/CetakLokasiRakTab';
import { CetakBarcodeProdukView } from './CetakBarcodeProdukView';

// Re-export shared types & helpers for backward compatibility
export type { LabelItem };
export { generatePackageId, createQrDataUrl, QrCodeImage };

export type CetakLabelTabType = 'qr_prefix' | 'paket' | 'barcode';

interface CetakLabelViewProps {
  session?: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  initialTab?: CetakLabelTabType;
}

export const CetakLabelView: React.FC<CetakLabelViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<CetakLabelTabType>(() => {
    if (initialTab) return initialTab;
    try {
      const saved = localStorage.getItem('wms_cetak_label_active_tab_v3');
      if (saved === 'qr_prefix' || saved === 'paket' || saved === 'barcode') return saved;
    } catch {}
    return 'qr_prefix';
  });

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
      try {
        localStorage.setItem('wms_cetak_label_active_tab_v3', initialTab);
      } catch {}
    }
  }, [initialTab]);

  const handleSelectTab = (tab: CetakLabelTabType) => {
    setActiveTab(tab);
    try {
      localStorage.setItem('wms_cetak_label_active_tab_v3', tab);
    } catch {}
  };

  return (
    <div className="p-2 sm:p-4 space-y-4 w-full max-w-full pb-24">
      {/* 
        ========================================================
        HEADER & 3-TAB SWITCHER BAR (QR Prefix | Label Paket | Cetak Barcode)
        ========================================================
      */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-900/60 shrink-0">
            <Printer className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
              Cetak Label &amp; Barcode WMS
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              Stiker QR Prefix Rak (#LOK, #IN, #OUT, #SO), Label Pengiriman Paket, &amp; Cetak Barcode Produk (50×20 mm)
            </p>
          </div>
        </div>

        {/* 3-Tab Switcher (Swipe Horizontal on Mobile) */}
        <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center gap-1 overflow-x-auto no-scrollbar whitespace-nowrap w-full lg:w-auto">
          <button
            type="button"
            id="tab-label-qr-prefix"
            onClick={() => handleSelectTab('qr_prefix')}
            className={`flex-1 lg:flex-none py-2 px-3.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
              activeTab === 'qr_prefix'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-900/60'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 shrink-0" />
            <span>QR Prefix</span>
          </button>

          <button
            type="button"
            id="tab-label-paket"
            onClick={() => handleSelectTab('paket')}
            className={`flex-1 lg:flex-none py-2 px-3.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
              activeTab === 'paket'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-900/60'
            }`}
          >
            <Package className="w-3.5 h-3.5 shrink-0" />
            <span>Label Paket</span>
          </button>

          <button
            type="button"
            id="tab-label-barcode"
            onClick={() => handleSelectTab('barcode')}
            className={`flex-1 lg:flex-none py-2 px-3.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none ${
              activeTab === 'barcode'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/70 dark:hover:bg-slate-900/60'
            }`}
          >
            <Barcode className="w-3.5 h-3.5 shrink-0" />
            <span>Cetak Barcode</span>
          </button>
        </div>
      </div>

      {/* 
        ========================================================
        TAB CONTENT
        ========================================================
      */}
      {activeTab === 'qr_prefix' && <CetakLokasiRakTab onShowToast={onShowToast} />}
      {activeTab === 'paket' && <LabelPaketTab />}
      {activeTab === 'barcode' && (
        <CetakBarcodeProdukView
          session={session}
          productCatalog={productCatalog}
          onShowToast={onShowToast}
          embedded={true}
        />
      )}
    </div>
  );
};
export default CetakLabelView;
