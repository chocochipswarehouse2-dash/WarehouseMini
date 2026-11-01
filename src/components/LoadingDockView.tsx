import React, { useState, useEffect } from 'react';
import { Package, Send, Truck, ClipboardList } from 'lucide-react';
import { PenerimaanBarangView } from './PenerimaanBarangView';
import { PengirimanView } from './PengirimanView';
import { DistribusiStoreTab } from './PesananSaya/DistribusiStoreTab';
import { PickingTasksView } from './PickingTasksView';
import { hasPermission, isSuperadmin } from '../services/permissions';
import { getUserPersonName } from '../utils/userResolver';
import { UserSession, ProductItem } from '../types';

export type LoadingDockTab = 'penerimaan' | 'pengiriman' | 'transfer_order' | 'picking_tasks';

interface LoadingDockViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  initialTab?: LoadingDockTab;
  hasNewPickingAlert?: boolean;
  onClearPickingAlert?: () => void;
}

interface TabItem {
  id: LoadingDockTab;
  permissionKey: string;
  legacyKey?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export function LoadingDockView({
  session,
  productCatalog = [],
  onShowToast,
  initialTab,
  hasNewPickingAlert = false,
  onClearPickingAlert,
}: LoadingDockViewProps) {
  const userIsAdmin = isSuperadmin(session);

  const allTabs: TabItem[] = [
    {
      id: 'penerimaan',
      permissionKey: 'tab_ops_loading_penerimaan',
      label: 'Penerimaan',
      icon: Package,
      color: 'bg-blue-600 text-white shadow-xs',
    },
    {
      id: 'pengiriman',
      permissionKey: 'tab_ops_loading_pengiriman',
      label: 'Pengiriman',
      icon: Send,
      color: 'bg-indigo-600 text-white shadow-xs',
    },
    {
      id: 'transfer_order',
      permissionKey: 'tab_ops_loading_transfer_order',
      legacyKey: 'tab_ops_pesanan_transfer_order',
      label: 'Transfer Order',
      icon: Truck,
      color: 'bg-emerald-600 text-white shadow-xs',
    },
    {
      id: 'picking_tasks',
      permissionKey: 'menu_ops_picking',
      legacyKey: 'menu_ops_loading_dock',
      label: 'Tugas Picking',
      icon: ClipboardList,
      color: 'bg-amber-500 text-black shadow-xs',
    },
  ];

  const tabs = allTabs.filter(
    (t) =>
      userIsAdmin ||
      hasPermission(session, t.permissionKey) ||
      (t.legacyKey && hasPermission(session, t.legacyKey))
  );

  const [activeTab, setActiveTab] = useState<LoadingDockTab>(() => {
    if (initialTab && tabs.some((t) => t.id === initialTab)) return initialTab;
    return tabs.length > 0 ? tabs[0].id : 'penerimaan';
  });

  useEffect(() => {
    if (initialTab && tabs.some((t) => t.id === initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (activeTab === 'picking_tasks' && onClearPickingAlert) {
      onClearPickingAlert();
    }
  }, [activeTab, onClearPickingAlert]);

  return (
    <div className="w-full max-w-full space-y-3">
      {/* HEADER & 4 TABS: PENERIMAAN | PENGIRIMAN | TRANSFER ORDER | TUGAS PICKING */}
      <div className="bg-white dark:bg-[#161F30] border border-slate-200 dark:border-slate-800 rounded-2xl p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap py-0.5 px-0.5 w-full sm:w-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isPickingTab = tab.id === 'picking_tasks';
            return (
              <button
                key={tab.id}
                type="button"
                id={`tab-loading-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-3.5 text-xs font-extrabold flex items-center justify-center gap-2 rounded-xl transition-all cursor-pointer select-none whitespace-nowrap shrink-0 relative ${
                  isActive
                    ? tab.color
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
                {isPickingTab && hasNewPickingAlert && (
                  <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-500 text-white animate-pulse">
                    BARU
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="w-full">
        {tabs.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-sm w-full mx-auto">
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
          <PenerimaanBarangView session={session} onShowToast={onShowToast} />
        )}
        {activeTab === 'pengiriman' && (
          <PengirimanView session={session} onShowToast={onShowToast} />
        )}
        {activeTab === 'transfer_order' && (
          <DistribusiStoreTab
            session={session}
            productCatalog={productCatalog}
            onShowToast={onShowToast}
          />
        )}
        {activeTab === 'picking_tasks' && (
          <PickingTasksView
            onNotify={onShowToast}
            currentUser={session?.name || getUserPersonName(session?.username) || 'Operator'}
            productCatalog={productCatalog}
          />
        )}
      </div>
    </div>
  );
}

