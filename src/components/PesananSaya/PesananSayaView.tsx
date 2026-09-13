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

export const PesananSayaView: React.FC<PesananSayaViewProps> = ({
  session,
  productCatalog,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'manual_shipment', label: 'Manual Shipment', icon: Truck },
    { id: 'distribusi', label: 'Distribusi Store', icon: Store },
    { id: 'shopee', label: 'Shopee', icon: ShoppingBag },
    { id: 'tiktok', label: 'Tiktok', icon: ShoppingBag },
    { id: 'website', label: 'Website', icon: Globe },
    { id: 'woocommerce', label: 'WooCommerce', icon: ShoppingCart },
    { id: 'lazada', label: 'Lazada', icon: Tag },
  ] as const;

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
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0b1324]">
      {/* Header & Tabs Inline */}
      <div className="shrink-0 px-2 sm:px-4 pt-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]">
        <div className="flex items-center overflow-x-auto no-scrollbar">
          {/* Inline Title */}
          <div className="hidden sm:flex items-center gap-2 pr-4 mr-2 sm:mr-4 border-r border-slate-200 dark:border-slate-700 shrink-0 sticky left-0 bg-white dark:bg-[#0f172a] z-10 py-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Package className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-sm text-slate-900 dark:text-white">Pesanan Saya</span>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 sm:gap-2">
            {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                  isActive 
                    ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'dashboard' && (
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
                      <span className="text-slate-600 dark:text-slate-300">Distribusi Store</span>
                      <span className="text-emerald-600 dark:text-emerald-400">Loading...</span>
                    </div>
                    <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 w-1/3"></div>
                    </div>
                  </div>
                  <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-xs text-slate-500 text-center">
                      Dashboard utama ini nantinya akan menampilkan progress gabungan dari Manual Shipment dan Distribusi Store secara real-time.
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
