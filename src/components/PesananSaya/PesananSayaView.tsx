import React, { useState } from 'react';
import { 
  Package, LayoutDashboard, Truck, Store, ShoppingBag, 
  Globe, ShoppingCart, Tag, Search 
} from 'lucide-react';
import { UserSession, ProductItem } from '../../types';
import { ManualShipmentTab } from './ManualShipmentTab';
import { DistribusiStoreTab } from './DistribusiStoreTab';

interface PesananSayaViewProps {
  session: UserSession | null;
  productCatalog: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

type TabType = 'dashboard' | 'manual_shipment' | 'distribusi' | 'shopee' | 'tiktok' | 'website' | 'woocommerce' | 'lazada';

import { hasPermission, isSuperadmin } from '../../services/permissions';

// Add to TabConfig
interface TabConfig {
  id: TabType;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  isComingSoon?: boolean;
  permissionKey?: string;
}

export const PesananSayaView: React.FC<PesananSayaViewProps> = ({
  session,
  productCatalog,
  onShowToast,
}) => {
  const userIsAdmin = isSuperadmin(session);
  
  const allTabs: TabConfig[] = [
    { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dashboard', icon: LayoutDashboard, color: 'bg-blue-600 shadow-blue-600/25 ring-blue-500/50', permissionKey: 'tab_ops_pesanan_dashboard' },
    { id: 'manual_shipment', label: 'Manual Shipment', shortLabel: 'Manual', icon: Truck, color: 'bg-indigo-600 shadow-indigo-600/25 ring-indigo-500/50', permissionKey: 'tab_ops_pesanan_manual_shipment' },
    { id: 'distribusi', label: 'Transfer Order', shortLabel: 'Transfer', icon: Store, color: 'bg-emerald-600 shadow-emerald-600/25 ring-emerald-500/50', permissionKey: 'tab_ops_pesanan_transfer_order' },
    { id: 'shopee', label: 'Shopee', shortLabel: 'Shopee', icon: ShoppingBag, color: 'bg-orange-600 shadow-orange-600/25 ring-orange-500/50', isComingSoon: true, permissionKey: 'tab_ops_pesanan_shopee' },
    { id: 'tiktok', label: 'Tiktok', shortLabel: 'Tiktok', icon: ShoppingBag, color: 'bg-rose-600 shadow-rose-600/25 ring-rose-500/50', isComingSoon: true, permissionKey: 'tab_ops_pesanan_tiktok' },
    { id: 'website', label: 'Website', shortLabel: 'Website', icon: Globe, color: 'bg-cyan-600 shadow-cyan-600/25 ring-cyan-500/50', isComingSoon: true, permissionKey: 'tab_ops_pesanan_website' },
    { id: 'woocommerce', label: 'WooCommerce', shortLabel: 'Woo', icon: ShoppingCart, color: 'bg-purple-600 shadow-purple-600/25 ring-purple-500/50', isComingSoon: true, permissionKey: 'tab_ops_pesanan_woocommerce' },
    { id: 'lazada', label: 'Lazada', shortLabel: 'Lazada', icon: Tag, color: 'bg-sky-700 shadow-sky-700/25 ring-sky-600/50', isComingSoon: true, permissionKey: 'tab_ops_pesanan_lazada' },
  ];

  const tabs = allTabs.filter(tab => 
    userIsAdmin || !tab.permissionKey || hasPermission(session, tab.permissionKey)
  );

  const [activeTab, setActiveTab] = useState<TabType>(tabs.length > 0 ? tabs[0].id : 'dashboard');

  const renderDummyTab = (name: string) => (
    <div className="flex flex-col items-center justify-center py-20 px-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
        <Package className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Penanganan Pesanan {name}</h3>
      <p className="text-slate-500 dark:text-slate-400 max-w-md">
        Modul integrasi {name} sedang dalam pengembangan. Nantinya semua pesanan dari platform ini akan masuk dan dikelola di sini.
      </p>
      <div className="mt-6 px-4 py-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-bold rounded-full border border-amber-200 dark:border-amber-800/50">
        Masih Dummy (Coming Soon)
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0b1324] space-y-2 sm:space-y-3 p-2 sm:p-4">
      {/* Header & Tabs Style Quality Control - Hemat Area Kerja & Rapi di HP */}
      <div className="bg-slate-100/90 dark:bg-[#09090b]/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 px-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                id={`tab-pesanan-${tab.id}`}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer select-none ${
                  isActive
                    ? `${tab.color} text-white shadow-md ring-1`
                    : 'bg-white/70 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </span>
                {tab.isComingSoon && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300'
                    }`}
                  >
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-hidden">
        {tabs.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-sm w-full mx-auto">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Globe className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Akses Ditolak</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Anda tidak memiliki akses ke fitur pesanan apapun. Silakan hubungi Superadmin.
              </p>
            </div>
          </div>
        )}
        
        {tabs.length > 0 && activeTab === 'dashboard' && (
          <div className="h-full overflow-y-auto p-4 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Dummy Dashboard Content as requested */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-4 border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-primary-500" />
                  Progress Semua Penanganan
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-600 dark:text-slate-300">Manual Shipment</span>
                      <span className="text-indigo-600 dark:text-indigo-400">Loading...</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 w-1/2"></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1.5">
                      <span className="text-slate-600 dark:text-slate-300">Transfer Order</span>
                      <span className="text-emerald-600 dark:text-emerald-400">Loading...</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-1/3"></div>
                    </div>
                  </div>
                  <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-500 text-center">
                      Dashboard utama ini nantinya akan menampilkan progress gabungan dari Manual Shipment dan Transfer Order secara real-time.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'manual_shipment' && (
          <div className="h-full overflow-y-auto">
             <ManualShipmentTab session={session} productCatalog={productCatalog} onShowToast={onShowToast} />
          </div>
        )}

        {activeTab === 'distribusi' && (
          <div className="h-full overflow-hidden flex flex-col">
             <DistribusiStoreTab session={session} productCatalog={productCatalog} onShowToast={onShowToast} />
          </div>
        )}

        {activeTab === 'shopee' && <div className="h-full overflow-y-auto p-4 sm:p-6">{renderDummyTab('Shopee')}</div>}
        {activeTab === 'tiktok' && <div className="h-full overflow-y-auto p-4 sm:p-6">{renderDummyTab('Tiktok')}</div>}
        {activeTab === 'website' && <div className="h-full overflow-y-auto p-4 sm:p-6">{renderDummyTab('Website')}</div>}
        {activeTab === 'woocommerce' && <div className="h-full overflow-y-auto p-4 sm:p-6">{renderDummyTab('WooCommerce')}</div>}
        {activeTab === 'lazada' && <div className="h-full overflow-y-auto p-4 sm:p-6">{renderDummyTab('Lazada')}</div>}
      </div>
    </div>
  );
};
