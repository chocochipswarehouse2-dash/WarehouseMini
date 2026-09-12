import React, { useState } from 'react';
import { Truck, Search, Camera, Save, X, Plus, PackageOpen } from 'lucide-react';

export const PenerimaanBarangView: React.FC = () => {
  const [items, setItems] = useState([{ id: 1, name: '', qty: '', condition: 'Baik' }]);

  const handleAddItem = () => {
    setItems([...items, { id: Date.now(), name: '', qty: '', condition: 'Baik' }]);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto pb-24">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Truck className="w-5 h-5 text-primary-500" />
          Penerimaan Barang (Loading Dock)
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Form pendataan barang masuk Non-Produksi dari supplier / ekspedisi.
        </p>
      </div>

      <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Nomor Surat Jalan / Resi</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input type="text" placeholder="Scan atau ketik nomor resi..." className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Nama Supplier / Ekspedisi</label>
            <input type="text" placeholder="Contoh: PT. Sumber Makmur" className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex justify-between items-center mb-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Daftar Item Diterima</label>
            <button onClick={handleAddItem} className="text-[10px] font-bold text-primary-500 flex items-center gap-1 hover:bg-primary-50 dark:hover:bg-primary-900/30 px-2 py-1 rounded-lg">
              <Plus className="w-3 h-3" /> Tambah Baris
            </button>
          </div>
          
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.id} className="flex gap-2 items-start">
                <div className="flex-1 space-y-2">
                  <input type="text" placeholder="Nama Barang / SKU" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 outline-none" />
                  <div className="flex gap-2">
                    <input type="number" placeholder="Qty" className="w-20 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 outline-none" />
                    <select className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-primary-500 outline-none text-slate-600 dark:text-slate-300">
                      <option>Kondisi: Baik</option>
                      <option>Kondisi: Rusak/Penyok</option>
                      <option>Kondisi: Kurang</option>
                    </select>
                  </div>
                </div>
                {items.length > 1 && (
                  <button onClick={() => setItems(items.filter(i => i.id !== item.id))} className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 mt-1">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Dokumentasi (Foto Bukti Terima)</label>
          <div className="flex gap-3">
            <button className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 hover:text-primary-500 hover:border-primary-500 transition-colors bg-slate-50 dark:bg-slate-800/50">
              <Camera className="w-5 h-5 mb-1" />
              <span className="text-[9px] font-bold">Ambil Foto</span>
            </button>
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <button className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            Reset
          </button>
          <button className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 transition-colors shadow-md shadow-primary-500/20 flex items-center gap-2">
            <Save className="w-4 h-4" />
            Simpan Penerimaan
          </button>
        </div>
      </div>
    </div>
  );
};
