import React, { useState } from 'react';
import { Truck, Package, Send, ArrowRightLeft } from 'lucide-react';
import { PenerimaanProduksiView } from './PenerimaanProduksiView';
import { PenerimaanBarangView } from './PenerimaanBarangView';
import { PengirimanView } from './PengirimanView';

export function LoadingDockView({ session, productCatalog, onShowToast }: any) {
  const [activeTab, setActiveTab] = useState<'produksi' | 'penerimaan' | 'pengiriman'>('produksi');

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0f1c]">
      {/* HEADER */}
      <div className="bg-white dark:bg-[#131d31] border-b border-slate-200 dark:border-slate-800 shrink-0 pt-4">
        {/* TABS */}
        <div className="flex items-center gap-6 px-4 sm:px-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('produksi')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'produksi'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <Truck className="w-4 h-4" />
            Produksi
          </button>
          <button
            onClick={() => setActiveTab('penerimaan')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'penerimaan'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <Package className="w-4 h-4" />
            Penerimaan
          </button>
          <button
            onClick={() => setActiveTab('pengiriman')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'pengiriman'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <Send className="w-4 h-4" />
            Pengiriman
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'produksi' && (
          <div className="absolute inset-0 overflow-y-auto">
             <PenerimaanProduksiView session={session} productCatalog={productCatalog} onShowToast={onShowToast} />
          </div>
        )}
        {activeTab === 'penerimaan' && (
           <div className="absolute inset-0 overflow-y-auto">
             <PenerimaanBarangView />
           </div>
        )}
        {activeTab === 'pengiriman' && (
           <div className="absolute inset-0 overflow-y-auto">
             <PengirimanView />
           </div>
        )}
      </div>
    </div>
  );
}
