import React, { useState, useEffect } from 'react';
import { Package, Send, Truck, ClipboardList, RotateCcw, X, Loader2, CheckCircle2 } from 'lucide-react';
import { PenerimaanBarangView } from './PenerimaanBarangView';
import { PengirimanView } from './PengirimanView';
import { DistribusiStoreTab } from './PesananSaya/DistribusiStoreTab';
import { PickingTasksView } from './PickingTasksView';
import { hasPermission, isSuperadmin } from '../services/permissions';
import { getUserPersonName } from '../utils/userResolver';
import { setActivePickingSessionMinimized } from '../services/scannerOutboxService';
import { resetAllPenerimaanLoadingDock } from '../services/penerimaanBarang';
import { resetAllPengirimanStore } from '../services/pengirimanStore';
import { resetAllPengirimanPaket } from '../services/pengirimanPaket';
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
    const handleOpenTab = (e: Event) => {
      const targetTab = (e as CustomEvent)?.detail?.tab as LoadingDockTab | undefined;
      if (targetTab && tabs.some((t) => t.id === targetTab)) {
        setActiveTab(targetTab);
      }
    };
    window.addEventListener('wms_open_loading_dock_tab', handleOpenTab);
    return () => window.removeEventListener('wms_open_loading_dock_tab', handleOpenTab);
  }, [tabs]);

  useEffect(() => {
    if (activeTab === 'picking_tasks' && onClearPickingAlert) {
      onClearPickingAlert();
    } else if (activeTab !== 'picking_tasks') {
      setActivePickingSessionMinimized(true);
    }
  }, [activeTab, onClearPickingAlert]);

  // Reset State (Superadmin only)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetScope, setResetScope] = useState<'all' | 'penerimaan' | 'pengiriman'>('all');
  const [confirmInput, setConfirmInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleExecuteReset = async () => {
    if (confirmInput.trim().toUpperCase() !== 'KOSONGKAN') {
      onShowToast('Ketik KOSONGKAN untuk mengonfirmasi.', 'warning');
      return;
    }
    setIsResetting(true);
    try {
      if (resetScope === 'all' || resetScope === 'penerimaan') {
        await resetAllPenerimaanLoadingDock();
      }
      if (resetScope === 'all' || resetScope === 'pengiriman') {
        await resetAllPengirimanStore();
        await resetAllPengirimanPaket();
      }
      onShowToast(
        resetScope === 'all'
          ? 'Seluruh data pengiriman & penerimaan Loading Dock berhasil dikosongkan!'
          : resetScope === 'penerimaan'
          ? 'Data penerimaan Loading Dock berhasil dikosongkan!'
          : 'Data pengiriman Loading Dock berhasil dikosongkan!',
        'success'
      );
      setIsResetModalOpen(false);
      setConfirmInput('');
    } catch (err: any) {
      onShowToast(err?.message || 'Gagal mereset data loading dock.', 'error');
    } finally {
      setIsResetting(false);
    }
  };

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

        {userIsAdmin && (activeTab === 'penerimaan' || activeTab === 'pengiriman') && (
          <div className="flex items-center gap-2 px-1 self-end sm:self-auto shrink-0">
            <button
              type="button"
              id="btn-reset-loading-dock"
              onClick={() => {
                setResetScope(
                  activeTab === 'penerimaan'
                    ? 'penerimaan'
                    : activeTab === 'pengiriman'
                    ? 'pengiriman'
                    : 'all'
                );
                setConfirmInput('');
                setIsResetModalOpen(true);
              }}
              className="py-1.5 px-3 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-900/60 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs"
              title="Reset data pengiriman / penerimaan loading dock"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Data</span>
            </button>
          </div>
        )}
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

      {/* MODAL RESET DATA LOADING DOCK */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-rose-50/50 dark:bg-rose-950/20">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Reset Data Loading Dock
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Kosongkan riwayat transaksi untuk mulai dari awal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isResetting && setIsResetModalOpen(false)}
                disabled={isResetting}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3.5 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Pilih Lingkup Reset:
                </label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                    resetScope === 'all'
                      ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}>
                    <input
                      type="radio"
                      name="resetScope"
                      checked={resetScope === 'all'}
                      onChange={() => setResetScope('all')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        Semua Data (Penerimaan & Pengiriman)
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Kosongkan mutasi store, penerimaan paket, surat jalan barang (SJB), trip (SJP), & serah terima kurir.
                      </p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                    resetScope === 'penerimaan'
                      ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}>
                    <input
                      type="radio"
                      name="resetScope"
                      checked={resetScope === 'penerimaan'}
                      onChange={() => setResetScope('penerimaan')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        Hanya Penerimaan
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Kosongkan riwayat mutasi masuk dari store dan penerimaan paket ekspedisi.
                      </p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                    resetScope === 'pengiriman'
                      ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}>
                    <input
                      type="radio"
                      name="resetScope"
                      checked={resetScope === 'pengiriman'}
                      onChange={() => setResetScope('pengiriman')}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        Hanya Pengiriman
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Kosongkan antrean surat jalan barang, trip armada mobil/motor, dan manifest serah terima kurir.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Note keamanan inventori */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-start gap-2.5 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Aman untuk Inventori:</strong> Stok fisik rak gudang dan catatan mutasi barcode (log_produk) 100% aman dan tidak terpengaruh oleh tindakan reset ini.
                </div>
              </div>

              {/* Konfirmasi ketik */}
              <div className="space-y-1.5 pt-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Konfirmasi Tindakan:
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Ketik kata <span className="font-mono font-black text-rose-600 dark:text-rose-400">KOSONGKAN</span> di bawah ini untuk mengaktifkan tombol:
                </p>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Ketik KOSONGKAN"
                  disabled={isResetting}
                  className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-rose-500 uppercase"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-3 bg-slate-50 dark:bg-slate-900/70 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                disabled={isResetting}
                className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                disabled={isResetting || confirmInput.trim().toUpperCase() !== 'KOSONGKAN'}
                className="px-4 py-2 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mereset Data...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Kosongkan Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

