const fs = require('fs');
let qc = fs.readFileSync('src/components/QualityControlView.tsx', 'utf8');

const oldHeader = `      {/* 1. Header Quality Control */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/20">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  Quality Control (QC)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  WMS Mutu
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Inspeksi Laporan QC (OKE / REJECT), Dokumentasi Foto Kompresi, dan Alur Perbaikan &amp; Defect
              </p>
            </div>
          </div>
        </div>

        {/* 2. Top-Level Tab Switcher */}
        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('laporan_qc');
              setTargetSearchTicket(undefined);
            }}
            className={\`flex items-center gap-2.5 px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-sm \${
              activeTab === 'laporan_qc'
                ? 'bg-blue-600 text-white shadow-blue-600/25 ring-2 ring-blue-600/30'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
            }\`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Laporan QC</span>
            <span
              className={\`text-[10px] font-semibold px-2 py-0.5 rounded-full \${
                activeTab === 'laporan_qc'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }\`}
            >
              Inspeksi &amp; Foto
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('perbaikan_defect')}
            className={\`flex items-center gap-2.5 px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-sm \${
              activeTab === 'perbaikan_defect'
                ? 'bg-indigo-600 text-white shadow-indigo-600/25 ring-2 ring-indigo-600/30'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
            }\`}
          >
            <Scissors className="w-4 h-4" />
            <span>Perbaikan dan Defect</span>
            <span
              className={\`text-[10px] font-semibold px-2 py-0.5 rounded-full \${
                activeTab === 'perbaikan_defect'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }\`}
            >
              Cuci &bull; Permak &bull; Defect
            </span>
          </button>
        </div>
      </div>`;

const newHeader = `      {/* 1. Header Quality Control & Tabs */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between bg-white dark:bg-[#09090b] p-3 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Quality Control
              </h1>
              <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase">
                WMS Mutu
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              alert('Inspeksi Laporan QC (OKE / REJECT), Dokumentasi Foto Kompresi, dan Alur Perbaikan & Defect');
            }}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Tabs */}
        <div className="flex bg-slate-100/50 dark:bg-[#09090b] p-1 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
          <button
            type="button"
            onClick={() => {
              setActiveTab('laporan_qc');
              setTargetSearchTicket(undefined);
            }}
            className={\`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-lg transition-all duration-300 \${
              activeTab === 'laporan_qc'
                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/50'
                : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }\`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span className="font-bold text-[11px] sm:text-sm">QC</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('perbaikan_defect')}
            className={\`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-lg transition-all duration-300 \${
              activeTab === 'perbaikan_defect'
                ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500/50'
                : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }\`}
          >
            <Scissors className="w-4 h-4" />
            <span className="font-bold text-[11px] sm:text-sm">Perbaikan</span>
          </button>
        </div>
      </div>`;

qc = qc.replace(oldHeader, newHeader);
qc = qc.replace(/className="space-y-6 pb-12"/g, 'className="space-y-3 pb-12"');
fs.writeFileSync('src/components/QualityControlView.tsx', qc, 'utf8');

console.log('Fixed real QC header structure!');
