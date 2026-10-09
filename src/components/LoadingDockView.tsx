import React, { useState } from 'react';
import { Package, Send, Truck } from 'lucide-react';
import { PenerimaanBarangView } from './PenerimaanBarangView';
import { PengirimanView } from './PengirimanView';
import { DistribusiStoreTab } from './PesananSaya/DistribusiStoreTab';
import { hasPermission, isSuperadmin } from '../services/permissions';
import { UserSession, ProductItem } from '../types';

interface LoadingDockViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

type LoadingDockTab = 'penerimaan' | 'pengiriman' | 'transfer_order';

interface TabItem {
  id: LoadingDockTab;
  permissionKey: string;
  legacyKey?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export function LoadingDockView({ session, productCatalog = [], onShowToast }: LoadingDockViewProps) {
  const userIsAdmin = isSuperadmin(session);
  
  const allTabs: TabItem[] = [
    {
      id: 'penerimaan',
      permissionKey: 'tab_ops_loading_penerimaan',
      label: 'Penerimaan',
      icon: Package,
      color: 'bg-blue-600 text-white shadow-md shadow-blue-600/25 ring-1 ring-blue-500/50',
    },
    {
      id: 'pengiriman',
      permissionKey: 'tab_ops_loading_pengiriman',
      label: 'Pengiriman',
      icon: Send,
      color: 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-indigo-500/50',
    },
    {
      id: 'transfer_order',
      permissionKey: 'tab_ops_loading_transfer_order',
      legacyKey: 'tab_ops_pesanan_transfer_order',
      label: 'Transfer Order',
      icon: Truck,
      color: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-1 ring-emerald-500/50',
    },
  ];

  const tabs = allTabs.filter(
    (t) => userIsAdmin || hasPermission(session, t.permissionKey) || (t.legacyKey && hasPermission(session, t.legacyKey))
  );

  const [activeTab, setActiveTab] = useState<LoadingDockTab>(
    tabs.length > 0 ? tabs[0].id : 'penerimaan'
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0a0f1c]">
      {/* HEADER & TABS */}
      <div className="p-2 sm:p-4 pb-0 shrink-0">
        <div className="bg-slate-100/90 dark:bg-[#09090b]/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs max-w-xl">
          <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  id={`tab-loading-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 sm:py-2.5 px-2 sm:px-4 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl transition-all duration-200 cursor-pointer select-none ${
                    isActive
                      ? tab.color
                      : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
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
        
        {activeTab === 'penerimaan' && (
           <div className="absolute inset-0 overflow-y-auto">
             <PenerimaanBarangView session={session} onShowToast={onShowToast} />
           </div>
        )}
        {activeTab === 'pengiriman' && (
           <div className="absolute inset-0 overflow-y-auto">
             <PengirimanView session={session} onShowToast={onShowToast} />
           </div>
        )}
        {activeTab === 'transfer_order' && (
           <div className="absolute inset-0 overflow-y-auto">
             <DistribusiStoreTab session={session} productCatalog={productCatalog} onShowToast={onShowToast} />
           </div>
        )}
      </div>
    </div>
  );
}
