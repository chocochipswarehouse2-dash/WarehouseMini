import React, { useState, useEffect } from 'react';
import { 
  Package, Store, ShoppingBag, 
  Globe, ShoppingCart, Tag, Radio 
} from 'lucide-react';
import { UserSession, ProductItem } from '../../types';
import { ManualShipmentTab } from './ManualShipmentTab';
import { IGLiveTab } from './IGLiveTab';

interface PesananSayaViewProps {
  session: UserSession | null;
  productCatalog: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshCatalog?: () => Promise<void> | void;
}

type TabType = 'manual_shipment' | 'shopee' | 'iglive' | 'tiktok' | 'website' | 'woocommerce' | 'lazada';

import { hasPermission, isSuperadmin } from '../../services/permissions';
import { ShopeeTab } from './ShopeeTab';
import { WebsiteTab } from './WebsiteTab';

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
  onRefreshCatalog,
}) => {
  const userIsAdmin = isSuperadmin(session);
  
  const allTabs: TabConfig[] = [
    { id: 'manual_shipment', label: 'Store', shortLabel: 'Store', icon: Store, color: 'bg-indigo-600 shadow-indigo-600/25 ring-indigo-500/50', permissionKey: 'tab_ops_pesanan_manual_shipment' },
    { id: 'shopee', label: 'Shopee', shortLabel: 'Shopee', icon: ShoppingBag, color: 'bg-orange-600 shadow-orange-600/25 ring-orange-500/50', permissionKey: 'tab_ops_pesanan_shopee' },
    { id: 'website', label: 'Website', shortLabel: 'Website', icon: Globe, color: 'bg-cyan-600 shadow-cyan-600/25 ring-cyan-500/50', permissionKey: 'tab_ops_pesanan_website' },
    { id: 'iglive', label: 'IG Live', shortLabel: 'IG Live', icon: Radio, color: 'bg-gradient-to-r from-pink-600 to-rose-600 shadow-pink-600/25 ring-pink-500/50', permissionKey: 'tab_ops_pesanan_iglive' },
    { id: 'tiktok', label: 'Tiktok', shortLabel: 'Tiktok', icon: ShoppingBag, color: 'bg-rose-600 shadow-rose-600/25 ring-rose-500/50', isComingSoon: true, permissionKey: 'tab_ops_pesanan_tiktok' },
    { id: 'woocommerce', label: 'WooCommerce', shortLabel: 'Woo', icon: ShoppingCart, color: 'bg-purple-600 shadow-purple-600/25 ring-purple-500/50', isComingSoon: true, permissionKey: 'tab_ops_pesanan_woocommerce' },
    { id: 'lazada', label: 'Lazada', shortLabel: 'Lazada', icon: Tag, color: 'bg-sky-700 shadow-sky-700/25 ring-sky-600/50', isComingSoon: true, permissionKey: 'tab_ops_pesanan_lazada' },
  ];

  const tabs = allTabs.filter(tab => 
    userIsAdmin || !tab.permissionKey || hasPermission(session, tab.permissionKey)
  );

  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (typeof window !== 'undefined') {
      const pending = (window as any).__wms_pending_pesanan_target;
      if (pending?.tab && tabs.some(t => t.id === pending.tab)) {
        return pending.tab as TabType;
      }
    }
    if (tabs.some(t => t.id === 'manual_shipment')) return 'manual_shipment';
    return tabs.length > 0 ? tabs[0].id : 'manual_shipment';
  });

  useEffect(() => {
    const applyTarget = (detail: any) => {
      if (!detail) return;
      const requestedTab = detail.tab || detail.subTab || 'manual_shipment';
      const targetTab = (requestedTab === 'dashboard' ? 'manual_shipment' : requestedTab) as TabType;
      if (tabs.some(t => t.id === targetTab)) {
        setActiveTab(targetTab);
      }
    };

    if (typeof window !== 'undefined' && (window as any).__wms_pending_pesanan_target) {
      applyTarget((window as any).__wms_pending_pesanan_target);
    }

    const handleOpenTarget = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      applyTarget(detail);
    };

    window.addEventListener('wms_open_pesanan_target', handleOpenTarget);
    return () => window.removeEventListener('wms_open_pesanan_target', handleOpenTarget);
  }, [tabs]);

  const renderDummyTab = (name: string) => (
    <div className="flex flex-col items-center justify-center py-20 px-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
      <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-2">
        <Package className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Penanganan Pesanan {name}</h3>
      <p className="text-slate-500 dark:text-slate-400 max-w-md">
        Modul integrasi {name} sedang dalam pengembangan. Nantinya semua pesanan dari platform ini akan masuk dan dikelola di sini.
      </p>
      <div className="mt-3 px-2 py-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-bold rounded-full border border-amber-200 dark:border-amber-800/50">
        Masih Dummy (Coming Soon)
      </div>
    </div>
  );

  return (
    <div className="flex flex-col space-y-2 sm:space-y-3 pb-6 sm:pb-8">
      {/* Header & Tabs Style Quality Control - Hemat Area Kerja & Rapi di HP */}
      <div className="bg-slate-100/90 dark:bg-[#09090b]/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 print:hidden">
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
                className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 sm:py-2 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer select-none ${
                  isActive
                    ? `${tab.color} text-white shadow-sm ring-1`
                    : 'bg-white/80 dark:bg-[#131d31]/70 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-[#131d31] hover:text-slate-900 dark:hover:text-white'
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
      <div className="w-full">
        {tabs.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-sm w-full mx-auto">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                <Globe className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Akses Ditolak</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Anda tidak memiliki akses ke fitur pesanan apapun. Silakan hubungi Superadmin.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'manual_shipment' && (
          <div>
              <ManualShipmentTab 
                key={session?.username || 'anonymous'} 
                session={session} 
                productCatalog={productCatalog} 
                onShowToast={onShowToast} 
                onRefreshCatalog={onRefreshCatalog}
              />
          </div>
        )}

        {activeTab === 'shopee' && (
          <div>
            <ShopeeTab
              session={session}
              productCatalog={productCatalog}
              onShowToast={onShowToast}
            />
          </div>
        )}
        {activeTab === 'iglive' && (
          <div>
            <IGLiveTab session={session} productCatalog={productCatalog} onShowToast={onShowToast} />
          </div>
        )}
        {activeTab === 'website' && (
          <div>
            <WebsiteTab onShowToast={onShowToast} />
          </div>
        )}
        {activeTab === 'tiktok' && <div className="py-2">{renderDummyTab('Tiktok')}</div>}
        {activeTab === 'woocommerce' && <div className="py-2">{renderDummyTab('WooCommerce')}</div>}
        {activeTab === 'lazada' && <div className="py-2">{renderDummyTab('Lazada')}</div>}
      </div>
    </div>
  );
};
