const fs = require('fs');

// StockOpnameView
let so = fs.readFileSync('src/components/StockOpnameView.tsx', 'utf8');
const soHeaderOld = `      {/* Banner / Header */}
      <div className="bg-white dark:bg-[#09090b] border border-slate-200 dark:border-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm mb-4">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                  Stock Opname (SO)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-400 text-[10px] font-bold">
                  Audit Selisih
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-lg">
                Pantau daftar antrean penyesuaian (adjustment) stok yang dihasilkan dari proses Stock Opname.
                Hanya Superadmin yang dapat melakukan otorisasi (Approve/Reject).
              </p>
            </div>
          </div>
        </div>
      </div>`;
const soHeaderNew = `      {/* Banner / Header */}
      <div className="flex items-center justify-between bg-white dark:bg-[#09090b] p-3 sm:p-4 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-pink-100 dark:bg-pink-900/30 text-pink-600 flex items-center justify-center flex-shrink-0">
            <ClipboardList className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              Stock Opname (SO)
            </h2>
            <div className="text-[10px] font-bold text-pink-600 dark:text-pink-400 uppercase">
              Audit Selisih
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            alert('Pantau daftar antrean penyesuaian (adjustment) stok yang dihasilkan dari proses Stock Opname. Hanya Superadmin yang dapat melakukan otorisasi (Approve/Reject).');
          }}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>`;
so = so.replace(soHeaderOld, soHeaderNew);
if (!so.includes('Info,')) {
  so = so.replace('ClipboardList,', 'ClipboardList, Info,');
}
so = so.replace(/className="max-w-7xl mx-auto space-y-6/g, 'className="max-w-7xl mx-auto space-y-3');
fs.writeFileSync('src/components/StockOpnameView.tsx', so, 'utf8');

// PeminjamanView
let pinjam = fs.readFileSync('src/components/PeminjamanView.tsx', 'utf8');
const pinjamHeaderOld = `      {/* Banner / Header */}
      <div className="bg-white dark:bg-[#09090b] border border-slate-200 dark:border-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm mb-4">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                  Surat Peminjaman Studio (SPS)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 text-[10px] font-bold">
                  Sistem Pinjam Live
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-lg">
                Pencatatan peminjaman barang untuk keperluan sesi Live Streaming dan Photoshoot Studio.
                Barang yang dipinjam akan memotong stok gudang sementara dan dapat dikembalikan.
              </p>
            </div>
          </div>
        </div>
      </div>`;
const pinjamHeaderNew = `      {/* Banner / Header */}
      <div className="flex items-center justify-between bg-white dark:bg-[#09090b] p-3 sm:p-4 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm mb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-600 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              Surat Peminjaman Studio
            </h2>
            <div className="text-[10px] font-bold text-teal-600 dark:text-teal-400 uppercase">
              Sistem Pinjam Live
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            alert('Pencatatan peminjaman barang untuk keperluan sesi Live Streaming dan Photoshoot Studio. Barang yang dipinjam akan memotong stok gudang sementara dan dapat dikembalikan.');
          }}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>`;
pinjam = pinjam.replace(pinjamHeaderOld, pinjamHeaderNew);
if (!pinjam.includes('Info,')) {
  pinjam = pinjam.replace('FileText,', 'FileText, Info,');
}
pinjam = pinjam.replace(/className="max-w-7xl mx-auto space-y-6/g, 'className="max-w-7xl mx-auto space-y-3');
fs.writeFileSync('src/components/PeminjamanView.tsx', pinjam, 'utf8');

console.log('UI Phase 3 complete.');
