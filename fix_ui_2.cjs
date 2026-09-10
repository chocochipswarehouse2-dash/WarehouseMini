const fs = require('fs');

// Fix MutasiLogView.tsx
let mutasi = fs.readFileSync('src/components/MutasiLogView.tsx', 'utf8');

const mutasiHeaderOld = `      {/* Header Info */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
            <ArrowRightLeft className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Mutasi Log Produk
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-lg">
              Riwayat pergerakan stok IN, OUT, & penyesuaian SO. Dilengkapi fitur Edit Invoice & Hapus Baris.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end">
          <div className="bg-slate-100 dark:bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700/50 text-right">
            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {logs.length.toLocaleString('id-ID')} Total Baris
            </div>
          </div>
        </div>
      </div>`;

const mutasiHeaderNew = `      {/* Header Info */}
      <div className="flex items-center justify-between bg-white dark:bg-[#0f172a] p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative mb-1">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
            <ArrowRightLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              Mutasi Log Produk
            </h1>
            <div className="text-[10px] font-bold text-slate-500">
               {logs.length.toLocaleString('id-ID')} Baris Data
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            alert('Riwayat pergerakan stok IN, OUT, & penyesuaian SO. Dilengkapi fitur Edit Invoice & Hapus Baris.');
          }}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>`;
mutasi = mutasi.replace(mutasiHeaderOld, mutasiHeaderNew);
if (!mutasi.includes('Info,')) {
  mutasi = mutasi.replace('ArrowRightLeft,', 'ArrowRightLeft, Info,');
}

// Decrease space-y-6 to space-y-3 globally in MutasiLogView
mutasi = mutasi.replace(/className="space-y-6 max-w-7xl/g, 'className="space-y-3 max-w-7xl');
fs.writeFileSync('src/components/MutasiLogView.tsx', mutasi, 'utf8');

// Also InventoryView space-y-4 to space-y-2
let inv = fs.readFileSync('src/components/InventoryView.tsx', 'utf8');
inv = inv.replace(/className="space-y-4 max-w-7xl/g, 'className="space-y-2 max-w-7xl');
fs.writeFileSync('src/components/InventoryView.tsx', inv, 'utf8');

// Also QualityControlView space-y-6 to space-y-3
let qc = fs.readFileSync('src/components/QualityControlView.tsx', 'utf8');
qc = qc.replace(/className="space-y-6 max-w-7xl/g, 'className="space-y-3 max-w-7xl');
fs.writeFileSync('src/components/QualityControlView.tsx', qc, 'utf8');

// PenerimaanProduksiView
let pp = fs.readFileSync('src/components/PenerimaanProduksiView.tsx', 'utf8');
const ppHeaderOld = `      {/* Banner / Header */}
      <div className="bg-white dark:bg-[#09090b] border border-slate-200 dark:border-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm mb-4">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center flex-shrink-0">
              <Truck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                  Kedatangan Lokal CMT & Kargo
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 text-[10px] font-bold">
                  Sistem PO
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-lg">
                Pencatatan kedatangan barang dari penjahit lokal (CMT) dan ekspedisi kargo. Pastikan DO/Surat Jalan sesuai dengan fisik.
              </p>
            </div>
          </div>
        </div>
      </div>`;
const ppHeaderNew = `      {/* Banner / Header */}
      <div className="flex items-center justify-between bg-white dark:bg-[#09090b] p-3 sm:p-4 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center flex-shrink-0">
            <Truck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              Kedatangan Lokal CMT
            </h2>
            <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase">
              Sistem PO
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            alert('Pencatatan kedatangan barang dari penjahit lokal (CMT) dan ekspedisi kargo. Pastikan DO/Surat Jalan sesuai dengan fisik.');
          }}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>`;
pp = pp.replace(ppHeaderOld, ppHeaderNew);
if (!pp.includes('Info,')) {
  pp = pp.replace('Truck,', 'Truck, Info,');
}
pp = pp.replace(/className="max-w-7xl mx-auto space-y-6/g, 'className="max-w-7xl mx-auto space-y-3');
fs.writeFileSync('src/components/PenerimaanProduksiView.tsx', pp, 'utf8');

console.log('UI Phase 2 complete.');
