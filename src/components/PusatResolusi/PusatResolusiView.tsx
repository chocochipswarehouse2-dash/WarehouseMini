import React, { useState } from 'react';
import {
  RefreshCcw,
  Banknote,
  PackageX,
  MessageSquareWarning,
  Star,
} from 'lucide-react';
import { UserSession, ProductItem } from '../../types';
import ReturBarangTab from './ReturBarangTab';

interface TabItem {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const tabs: TabItem[] = [
  { id: 'retur', label: 'Retur Barang', shortLabel: 'Retur', icon: RefreshCcw, color: 'bg-rose-600 shadow-rose-600/25 ring-rose-500/50' },
  { id: 'refund', label: 'Pengembalian Dana', shortLabel: 'Refund', icon: Banknote, color: 'bg-amber-600 shadow-amber-600/25 ring-amber-500/50' },
  { id: 'gagal_kirim', label: 'Pengiriman Gagal', shortLabel: 'Gagal Kirim', icon: PackageX, color: 'bg-red-600 shadow-red-600/25 ring-red-500/50' },
  { id: 'komplain', label: 'Komplain Customer', shortLabel: 'Komplain', icon: MessageSquareWarning, color: 'bg-indigo-600 shadow-indigo-600/25 ring-indigo-500/50' },
  { id: 'rating', label: 'Report Rating', shortLabel: 'Rating', icon: Star, color: 'bg-amber-500 shadow-amber-500/25 ring-amber-400/50' },
];

interface PusatResolusiViewProps {
  session?: UserSession | null;
  productCatalog?: ProductItem[];
  onNotify?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export default function PusatResolusiView({
  session = null,
  productCatalog = [],
  onNotify = () => {},
}: PusatResolusiViewProps) {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0b1324] space-y-2 sm:space-y-3 p-2 sm:p-4 print:p-0 print:m-0 print:bg-white print:space-y-0">
      {/* Header & Tabs Style Quality Control */}
      <div className="bg-slate-100/90 dark:bg-[#09090b]/90 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs shrink-0 print:hidden">
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 px-0.5">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                id={`tab-resolusi-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 transition-all duration-200 cursor-pointer select-none ${
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
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-1 sm:p-2 print:overflow-visible print:p-0">
        {activeTab === 'retur' ? (
          <ReturBarangTab
            session={session}
            productCatalog={productCatalog}
            onNotify={onNotify}
          />
        ) : (
          <div className="max-w-4xl mx-auto mt-10">
            <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-12 text-center shadow-sm">
              <div className="w-20 h-20 bg-rose-50 dark:bg-rose-900/20 text-rose-500 mx-auto rounded-full flex items-center justify-center mb-3">
                {activeTab === 'refund' && <Banknote className="w-10 h-10" />}
                {activeTab === 'gagal_kirim' && <PackageX className="w-10 h-10" />}
                {activeTab === 'komplain' && <MessageSquareWarning className="w-10 h-10" />}
                {activeTab === 'rating' && <Star className="w-10 h-10" />}
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-3">
                Modul {tabs.find(t => t.id === activeTab)?.label}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm max-w-lg mx-auto leading-relaxed">
                Modul <strong>Retur Barang</strong> sudah aktif penuh. Silakan pilih tab <strong>Retur Barang</strong> untuk mengelola pengajuan retur, atau sampaikan spesifikasi alur untuk tab ini.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
