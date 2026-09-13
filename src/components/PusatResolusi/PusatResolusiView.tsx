import React, { useState } from 'react';
import { 
  RefreshCcw, 
  Banknote, 
  PackageX, 
  MessageSquareWarning, 
  Star,
  LifeBuoy
} from 'lucide-react';

const tabs = [
  { id: 'retur', label: 'Retur Barang', icon: RefreshCcw },
  { id: 'refund', label: 'Pengembalian Dana', icon: Banknote },
  { id: 'gagal_kirim', label: 'Pengiriman Gagal', icon: PackageX },
  { id: 'komplain', label: 'Komplain Customer', icon: MessageSquareWarning },
  { id: 'rating', label: 'Report Rating', icon: Star },
];

export default function PusatResolusiView() {
  const [activeTab, setActiveTab] = useState(tabs[0].id);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0b1324]">
      {/* Header & Tabs Inline */}
      <div className="shrink-0 px-2 sm:px-4 pt-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a]">
        <div className="flex items-center overflow-x-auto no-scrollbar">
          {/* Inline Title */}
          <div className="hidden sm:flex items-center gap-2 pr-4 mr-2 sm:mr-4 border-r border-slate-200 dark:border-slate-700 shrink-0 sticky left-0 bg-white dark:bg-[#0f172a] z-10 py-2">
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <LifeBuoy className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-sm text-slate-900 dark:text-white">Pusat Resolusi</span>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-1 sm:gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-rose-500 text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-500/10'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'fill-rose-500/20' : ''}`} />
                  <span className="text-sm font-bold">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto mt-10">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-12 text-center shadow-sm">
            <div className="w-20 h-20 bg-rose-50 dark:bg-rose-900/20 text-rose-500 mx-auto rounded-full flex items-center justify-center mb-6">
              {activeTab === 'retur' && <RefreshCcw className="w-10 h-10" />}
              {activeTab === 'refund' && <Banknote className="w-10 h-10" />}
              {activeTab === 'gagal_kirim' && <PackageX className="w-10 h-10" />}
              {activeTab === 'komplain' && <MessageSquareWarning className="w-10 h-10" />}
              {activeTab === 'rating' && <Star className="w-10 h-10" />}
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-3">
              Modul {tabs.find(t => t.id === activeTab)?.label}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-lg mx-auto leading-relaxed">
              Halaman ini sedang dalam tahap perancangan (Draft Dummy). Silakan berikan arahan atau detail instrumen lebih lanjut mengenai alur kerja dan data apa saja yang ingin ditampilkan di bagian ini.
            </p>
            
            <div className="mt-8 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 inline-block text-left max-w-md w-full">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                Catatan Pengembangan:
              </div>
              <ul className="text-sm text-slate-700 dark:text-slate-300 space-y-2 list-disc list-inside">
                <li>Integrasi data tabel diperlukan</li>
                <li>Form/Aksi untuk memproses tiket</li>
                <li>Filter rentang waktu dan status</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
