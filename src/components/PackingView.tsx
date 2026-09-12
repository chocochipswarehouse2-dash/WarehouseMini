import React, { useState } from 'react';
import { Package, ScanLine, CheckCircle2, Video, Printer, AlertTriangle } from 'lucide-react';

export const PackingView: React.FC = () => {
  const [scanSj, setScanSj] = useState('');
  const [scanItem, setScanItem] = useState('');
  const [isScanningActive, setIsScanningActive] = useState(false);

  // Dummy state
  const activeSj = 'SJ-20260912-001';
  const scannedItems = [
    { sku: 'BLS-WHT-M', name: 'Blouse White M', req: 2, scanned: 2, status: 'ok' },
    { sku: 'DRS-BLK-L', name: 'Dress Black L', req: 1, scanned: 0, status: 'pending' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto pb-24">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Package className="w-5 h-5 text-primary-500" />
          Area Packing & Validasi
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Validasi item Surat Jalan sebelum dikemas. Pastikan berada di bawah jangkauan CCTV.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Scanning & Info */}
        <div className="space-y-6 lg:col-span-1">
          {/* SJ Scan Box */}
          <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">1. Scan Surat Jalan / Order</h2>
            <div className="relative">
              <ScanLine className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Scan Barcode SJ..." 
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-2 border-primary-500/30 focus:border-primary-500 rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary-500/10 outline-none" 
              />
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
              <Video className="w-4 h-4 text-rose-500" />
              CCTV Recording Active (Meja 4)
            </div>
          </div>

          {/* Active SJ Info */}
          <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-3">
             <div className="flex justify-between items-start mb-2">
               <div>
                  <p className="text-[10px] font-bold text-slate-500">Order Aktif</p>
                  <h3 className="text-lg font-black text-primary-500">{activeSj}</h3>
               </div>
               <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[9px] px-2 py-1 rounded font-black tracking-wider uppercase">In Progress</span>
             </div>
             <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div>
                  <p className="text-[10px] text-slate-500">Ekspedisi</p>
                  <p className="text-xs font-bold dark:text-slate-200">JNT Express</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Total Item</p>
                  <p className="text-xs font-bold dark:text-slate-200">3 pcs</p>
                </div>
             </div>
          </div>
        </div>

        {/* Right Column: Item Validation & Status */}
        <div className="space-y-6 lg:col-span-2">
           <div className="bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex justify-between items-center">
                 <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">2. Validasi Item Produk</h2>
                 <div className="text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-md font-bold text-slate-500">
                   Progress: 2/3
                 </div>
              </div>
              
              <div className="p-4 bg-slate-100 dark:bg-slate-800/40">
                <div className="relative">
                  <ScanLine className="absolute left-3 top-3.5 w-5 h-5 text-emerald-500" />
                  <input 
                    type="text" 
                    placeholder="Scan Barcode Produk..." 
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-[#1a2332] border-2 border-emerald-500/50 focus:border-emerald-500 rounded-xl text-base font-bold focus:ring-4 focus:ring-emerald-500/20 outline-none shadow-sm" 
                  />
                </div>
              </div>

              <div className="flex-1 p-4 space-y-3">
                {scannedItems.map((item, idx) => (
                  <div key={idx} className={`flex items-center justify-between p-3 rounded-xl border ${item.status === 'ok' ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800/50' : 'bg-white border-slate-200 dark:bg-[#1a2332] dark:border-slate-700'}`}>
                    <div className="flex items-center gap-3">
                       {item.status === 'ok' ? (
                         <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                       ) : (
                         <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 border-dashed flex items-center justify-center shrink-0">
                            <span className="text-[8px] font-bold text-slate-400">?</span>
                         </div>
                       )}
                       <div>
                         <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.name}</p>
                         <p className="text-[10px] text-slate-500 font-mono">{item.sku}</p>
                       </div>
                    </div>
                    <div className="text-right">
                       <span className={`text-sm font-black ${item.scanned === item.req ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                         {item.scanned} <span className="text-xs font-normal text-slate-400">/ {item.req}</span>
                       </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 flex justify-end gap-3">
                 <button className="px-4 py-2 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors flex items-center gap-2 border border-rose-200 dark:border-rose-800/50">
                    <AlertTriangle className="w-4 h-4" />
                    Laporkan Kendala
                 </button>
                 <button className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-slate-400 cursor-not-allowed flex items-center gap-2">
                    <Printer className="w-4 h-4" />
                    Cetak Laporan & Resi
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};
