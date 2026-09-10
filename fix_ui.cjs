const fs = require('fs');

// 1. Fix InventoryView.tsx
let inv = fs.readFileSync('src/components/InventoryView.tsx', 'utf8');

// Replace the big header banner in InventoryView with a compact one
const invHeaderOld = `      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 mb-2 relative overflow-hidden shadow-xl shadow-slate-900/10 border border-slate-800">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Boxes className="w-32 h-32 transform rotate-12" />
        </div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold tracking-widest uppercase mb-3 border border-emerald-500/30">
            <Sparkles className="w-3 h-3" />
            Sistem Terpadu WMS • Manajemen Inventori
          </div>
          <h2 className="text-xl sm:text-2xl font-black mb-2 tracking-tight">Katalog & Stok Gudang</h2>
          <p className="text-sm text-slate-400 mb-0 leading-relaxed max-w-2xl">
            Pantau real-time pergerakan stok, rincian alokasi MAP, stok sampel Live Blok F, serta antrean produk perbaikan & defect di seluruh titik penyimpanan.
          </p>
        </div>
      </div>`;

const invHeaderNew = `      {/* Header Banner */}
      <div className="flex items-center justify-between bg-slate-900 text-white rounded-xl p-3 sm:p-4 mb-1 relative overflow-hidden shadow-md border border-slate-800">
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center border border-emerald-500/30">
            <Boxes className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black tracking-tight leading-tight">Katalog & Stok Gudang</h2>
            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> WMS Inventori
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            const msg = 'Pantau real-time pergerakan stok, rincian alokasi MAP, stok sampel Live Blok F, serta antrean produk perbaikan & defect di seluruh titik penyimpanan.';
            alert(msg); // Or standard modal, but standard alert is quick for mobile info
          }}
          className="relative z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>`;

inv = inv.replace(invHeaderOld, invHeaderNew);
// Add Info import if not exist
if (!inv.includes('Info,')) {
  inv = inv.replace('ArrowDown,', 'ArrowDown, Info,');
}
fs.writeFileSync('src/components/InventoryView.tsx', inv, 'utf8');

// 2. Fix QualityControlView.tsx
let qc = fs.readFileSync('src/components/QualityControlView.tsx', 'utf8');
const qcHeaderOld = `      {/* Header Page */}
      <div className="bg-white dark:bg-[#0f172a] p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between gap-4 relative z-10">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                  Quality Control (QC)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px] font-bold">
                  WMS Mutu
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-lg">
                Inspeksi Laporan QC (OKE / REJECT), Dokumentasi Foto Kompresi, dan Alur Perbaikan & Defect
              </p>
            </div>
          </div>
        </div>`;
const qcHeaderNew = `      {/* Header Page */}
      <div className="flex items-center justify-between bg-white dark:bg-[#0f172a] p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden mb-1">
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/20">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              Quality Control (QC)
            </h2>
            <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              WMS Mutu
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            alert('Inspeksi Laporan QC (OKE / REJECT), Dokumentasi Foto Kompresi, dan Alur Perbaikan & Defect');
          }}
          className="relative z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
      <div>`;
qc = qc.replace(qcHeaderOld, qcHeaderNew);
// Fix missing div closing if needed
qc = qc.replace(`      </div>
      
      {/* Tab Navigasi Utama */}`, `      
      {/* Tab Navigasi Utama */}`);

if (!qc.includes('Info,')) {
  qc = qc.replace('ShieldCheck,', 'ShieldCheck, Info,');
}
fs.writeFileSync('src/components/QualityControlView.tsx', qc, 'utf8');

// 3. Fix App.tsx - Navbar Size
let nav = fs.readFileSync('src/components/Navbar.tsx', 'utf8');
nav = nav.replace('px-3 sm:px-5 py-1.5 flex', 'px-2 sm:px-4 py-1 flex');
nav = nav.replace('text-xs sm:text-sm font-black', 'text-[11px] sm:text-xs font-black');
nav = nav.replace('text-[10px] text-slate-400 dark:text-slate-500 font-medium hidden xs:block', 'hidden'); // hide subtitle completely on mobile
fs.writeFileSync('src/components/Navbar.tsx', nav, 'utf8');

// Reduce global gaps in App.tsx main container
let app = fs.readFileSync('src/App.tsx', 'utf8');
app = app.replace('className="flex-1 overflow-y-auto p-4 sm:p-6"', 'className="flex-1 overflow-y-auto p-2 sm:p-4"');
app = app.replace('className="flex-1 overflow-y-auto p-3 sm:p-6"', 'className="flex-1 overflow-y-auto p-2 sm:p-4"');
fs.writeFileSync('src/App.tsx', app, 'utf8');

console.log('UI optimizations complete.');
