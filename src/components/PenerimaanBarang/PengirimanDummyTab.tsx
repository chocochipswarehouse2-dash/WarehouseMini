import React from 'react';
import { Send, Construction, Box, MapPin, Truck, ArrowRight, Clock } from 'lucide-react';

export const PengirimanDummyTab: React.FC = () => {
  return (
    <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 sm:p-10 text-center space-y-6">
      <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto ring-8 ring-indigo-500/5">
        <Send className="w-8 h-8" />
      </div>

      <div className="max-w-md mx-auto space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-bold border border-amber-200/80 dark:border-amber-800/60">
          <Construction className="w-3.5 h-3.5 text-amber-500" />
          <span>Dalam Tahap Pengembangan (Dummy Page)</span>
        </div>
        <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
          Modul Pengiriman Barang
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Instrumen pencatatan & validasi pengiriman barang keluar dari Gudang ke Store (Refill) maupun ekspedisi eksternal akan segera hadir di sini.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto pt-2">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 text-left space-y-1">
          <Box className="w-5 h-5 text-indigo-500 mb-2" />
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Refill Toko</h4>
          <p className="text-[11px] text-slate-500">Kirim pasokan barang stok baru ke seluruh cabang store.</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 text-left space-y-1">
          <Truck className="w-5 h-5 text-blue-500 mb-2" />
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Ekspedisi Eksternal</h4>
          <p className="text-[11px] text-slate-500">Integrasi scan resi & surat jalan kurir pengiriman.</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 text-left space-y-1">
          <Clock className="w-5 h-5 text-emerald-500 mb-2" />
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Surat Jalan Keluar</h4>
          <p className="text-[11px] text-slate-500">Tracking otomatis no surat jalan & status serah terima.</p>
        </div>
      </div>
    </div>
  );
};
