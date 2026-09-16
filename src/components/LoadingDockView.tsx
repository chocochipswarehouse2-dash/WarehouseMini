import React, { useState } from 'react';
import { Truck, Package, Send, ArrowRightLeft } from 'lucide-react';
import { PenerimaanProduksiView } from './PenerimaanProduksiView';
import { PenerimaanBarangView } from './PenerimaanBarangView';
import { PengirimanView } from './PengirimanView';
import { hasPermission, isSuperadmin } from '../services/permissions';

export function LoadingDockView({ session, productCatalog, onShowToast }: any) {
  const userIsAdmin = isSuperadmin(session);
  
  const tabs = [
    { id: 'produksi', permissionKey: 'tab_ops_loading_produksi' },
    { id: 'penerimaan', permissionKey: 'tab_ops_loading_penerimaan' },
    { id: 'pengiriman', permissionKey: 'tab_ops_loading_pengiriman' }
  ].filter(t => userIsAdmin || hasPermission(session, t.permissionKey));

  const [activeTab, setActiveTab] = useState<'produksi' | 'penerimaan' | 'pengiriman'>(
    (tabs.length > 0 ? tabs[0].id : 'produksi') as 'produksi' | 'penerimaan' | 'pengiriman'
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0f1c]">
      {/* HEADER & TABS - Style Quality Control */}
      <div className="p-2 sm:p-4 pb-0 shrink-0">
        <div className="bg-slate-100/90 dark:bg-[#09090b]/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs">
          <div className="grid grid-cols-3 sm:flex sm:items-center gap-1 sm:gap-1.5">
            {tabs.some(t => t.id === 'produksi') && (
            <button
              type="button"
              id="tab-loading-produksi"
              onClick={() => setActiveTab('produksi')}
              className={`py-2 sm:py-2.5 px-2.5 sm:px-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer select-none ${
                activeTab === 'produksi'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-1 ring-emerald-500/50'
                  : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>
                <span className="sm:hidden">Produksi</span>
                <span className="hidden sm:inline">Penerimaan Produksi</span>
              </span>
            </button>
            )}

            {tabs.some(t => t.id === 'penerimaan') && (
            <button
              type="button"
              id="tab-loading-penerimaan"
              onClick={() => setActiveTab('penerimaan')}
              className={`py-2 sm:py-2.5 px-2.5 sm:px-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer select-none ${
                activeTab === 'penerimaan'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-500/50'
                  : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>
                <span className="sm:hidden">Penerimaan</span>
                <span className="hidden sm:inline">Penerimaan Barang</span>
              </span>
            </button>
            )}

            {tabs.some(t => t.id === 'pengiriman') && (
            <button
              type="button"
              id="tab-loading-pengiriman"
              onClick={() => setActiveTab('pengiriman')}
              className={`py-2 sm:py-2.5 px-2.5 sm:px-2 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer select-none ${
                activeTab === 'pengiriman'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-indigo-500/50'
                  : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>
                <span className="sm:hidden">Pengiriman</span>
                <span className="hidden sm:inline">Pengiriman Barang</span>
              </span>
            </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {tabs.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-sm w-full mx-auto mt-3">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <Truck className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Akses Ditolak</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Anda tidak memiliki akses ke fitur Loading Dock. Silakan hubungi Superadmin.
              </p>
            </div>
          </div>
        )}
        
        {tabs.length > 0 && activeTab === 'produksi' && (
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
