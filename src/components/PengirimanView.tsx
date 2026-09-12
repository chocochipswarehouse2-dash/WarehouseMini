import React, { useState } from 'react';
import { Send, MapPin, ScanLine, Search, Plus, Save, X, History, Box, CheckCircle2 } from 'lucide-react';
import { ConstructionBanner } from './ConstructionBanner';

export const PengirimanView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'input' | 'history'>('input');
  const [destination, setDestination] = useState('');
  const [packages, setPackages] = useState([{ id: 1, resi: 'PKG-001', checked: true }]);

  const handleAddPackage = () => {
    setPackages([...packages, { id: Date.now(), resi: '', checked: false }]);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto pb-24">
      <ConstructionBanner />
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Send className="w-5 h-5 text-primary-500" />
          Pengiriman Barang
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Form pendataan barang yang dikirim (contoh: Refill Toko, Paket Ekspedisi).
        </p>
      </div>

      <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-xl w-fit">
        <button 
          onClick={() => setActiveTab('input')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'input' ? 'bg-white dark:bg-[#1a2332] text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          <Box className="w-4 h-4" />
          Input Pengiriman
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'history' ? 'bg-white dark:bg-[#1a2332] text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          <History className="w-4 h-4" />
          Riwayat Detail
        </button>
      </div>

      {activeTab === 'input' ? (
        <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Tujuan Pengiriman</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <select 
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none text-slate-700 dark:text-slate-300"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              >
                <option value="">-- Pilih Tujuan --</option>
                <option value="toko_a">Cabang Toko A (Refill)</option>
                <option value="toko_b">Cabang Toko B (Refill)</option>
                <option value="jnt">Ekspedisi JNT</option>
                <option value="jne">Ekspedisi JNE</option>
                <option value="lainnya">Lainnya...</option>
              </select>
            </div>
          </div>

          <div className="pt-2">
            <div className="flex justify-between items-center mb-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Daftar Paket / Surat Jalan</label>
              <button onClick={handleAddPackage} className="text-[10px] font-bold text-primary-500 flex items-center gap-1 hover:bg-primary-50 dark:hover:bg-primary-900/30 px-2 py-1 rounded-lg">
                <Plus className="w-3 h-3" /> Tambah Manual
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-200 dark:border-slate-700 mb-4">
               <div className="relative">
                 <ScanLine className="absolute left-3 top-2.5 w-5 h-5 text-primary-500" />
                 <input type="text" placeholder="Scan Barcode Paket di sini..." className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-bold focus:ring-2 focus:ring-primary-500 outline-none" />
               </div>
               <p className="text-[10px] text-slate-500 mt-2 ml-1">Gunakan scanner barcode untuk memasukkan paket secara cepat.</p>
            </div>
            
            <div className="space-y-3">
              {packages.map((pkg) => (
                <div key={pkg.id} className="flex gap-2 items-center p-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-[#1a2332]">
                  <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                     <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <input type="text" placeholder="No Resi / SJ" defaultValue={pkg.resi} className="flex-1 px-3 py-1.5 bg-transparent text-sm font-mono focus:outline-none dark:text-slate-200" />
                  {packages.length > 1 && (
                    <button onClick={() => setPackages(packages.filter(i => i.id !== pkg.id))} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800/80">
            <button className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 transition-colors shadow-md shadow-primary-500/20 flex items-center gap-2">
              <Send className="w-4 h-4" />
              Proses Pengiriman
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">Riwayat Pengiriman (Hari Ini)</h2>
            <div className="relative">
               <Search className="w-4 h-4 absolute left-2.5 top-1.5 text-slate-400" />
               <input type="text" placeholder="Cari Resi/Tujuan..." className="pl-8 pr-3 py-1 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg outline-none focus:border-primary-500" />
            </div>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-bold">Waktu</th>
                  <th className="px-4 py-3 font-bold">Tujuan</th>
                  <th className="px-4 py-3 font-bold">Total Paket</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[1, 2, 3].map((item) => (
                  <tr key={item} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">14:{item * 12} WIB</td>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100 font-bold">
                      {item === 1 ? 'Cabang Toko A' : item === 2 ? 'Ekspedisi JNT' : 'Cabang Toko C'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item * 3} Paket</td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider">
                        Terkirim
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                       <button className="text-[10px] font-bold text-primary-500 hover:underline">Detail</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
