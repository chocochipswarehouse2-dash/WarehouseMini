const fs = require('fs');

let qc = fs.readFileSync('src/components/QualityControlView.tsx', 'utf8');

// The sync banner string to hide it behind a small badge or remove it completely.
// Wait, looking at the code, let's just make it hidden on mobile (hidden sm:block) or compress it.
const syncOld = `<div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-[#111a2f] dark:to-[#16213e] p-4 sm:p-5 rounded-2xl border border-blue-100/50 dark:border-blue-900/30 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
          <Database className="w-24 h-24 transform rotate-12" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-md">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-slate-800 dark:text-slate-200">Supabase Cloud Sync Aktif</h3>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  Terhubung Cloud
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Laporan inspeksi QC otomatis tersinkronisasi realtime & langsung dapat dilihat oleh seluruh admin / staf di perangkat lain.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => {
                if (window.confirm('Sinkronisasi ulang akan memuat data terbaru dari server. Lanjutkan?')) {
                  loadQcReports();
                }
              }}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Sinkronkan
            </button>
            {isSuperadmin(session) && (
              <button
                onClick={() => setShowSqlModal(true)}
                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors shadow-sm"
              >
                <Database className="w-4 h-4" />
                Script SQL
              </button>
            )}
          </div>
        </div>
      </div>`;

// Replace it with an extremely minimal bar
const syncNew = `      <div className="flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-900/10 p-2 sm:p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Sync Cloud Aktif</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => loadQcReports()} className="p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {isSuperadmin(session) && (
            <button onClick={() => setShowSqlModal(true)} className="p-1.5 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg">
              <Database className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>`;

qc = qc.replace(syncOld, syncNew);

// Since we are looking at a screenshot showing the OLD big header for Quality Control (the one with the blue icon and huge title), 
// it means the previous file modifications haven't been successfully pushed to github or viewed in the screenshot yet (the user is viewing in AI Studio preview).
// Let's ensure the tabs are also smaller!

const tabsOld = `{/* Tab Navigasi Utama */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-100/50 dark:bg-[#09090b] p-1.5 rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
        <button
          onClick={() => setActiveMainTab('QC')}
          className={\`relative flex items-center justify-between px-4 py-3 sm:py-4 rounded-xl transition-all duration-300 \${
            activeMainTab === 'QC'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 ring-1 ring-blue-500/50 scale-[1.02] z-10'
              : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
          }\`}
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck className={\`w-5 h-5 \${activeMainTab === 'QC' ? 'text-blue-100' : ''}\`} />
            <span className="font-bold text-sm sm:text-base">Laporan QC</span>
          </div>
          {activeMainTab === 'QC' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-50 border border-blue-400/30 font-semibold shadow-xs">
              Inspeksi & Foto
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveMainTab('PERBAIKAN')}
          className={\`relative flex items-center justify-between px-4 py-3 sm:py-4 rounded-xl transition-all duration-300 \${
            activeMainTab === 'PERBAIKAN'
              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20 ring-1 ring-amber-400/50 scale-[1.02] z-10'
              : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
          }\`}
        >
          <div className="flex items-center gap-3">
            <Scissors className={\`w-5 h-5 \${activeMainTab === 'PERBAIKAN' ? 'text-amber-100' : ''}\`} />
            <span className="font-bold text-sm sm:text-base">Perbaikan dan Defect</span>
          </div>
          {activeMainTab === 'PERBAIKAN' && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/30 text-amber-50 border border-amber-300/30 font-semibold shadow-xs text-center leading-tight">
              Cuci • Permak • Defect
            </span>
          )}
        </button>
      </div>`;

const tabsNew = `{/* Tab Navigasi Utama */}
      <div className="flex bg-slate-100/50 dark:bg-[#09090b] p-1 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
        <button
          onClick={() => setActiveMainTab('QC')}
          className={\`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-lg transition-all duration-300 \${
            activeMainTab === 'QC'
              ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/50'
              : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
          }\`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span className="font-bold text-[11px] sm:text-sm">QC</span>
        </button>

        <button
          onClick={() => setActiveMainTab('PERBAIKAN')}
          className={\`flex-1 flex items-center justify-center gap-2 px-2 py-2 rounded-lg transition-all duration-300 \${
            activeMainTab === 'PERBAIKAN'
              ? 'bg-amber-500 text-white shadow-sm ring-1 ring-amber-400/50'
              : 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
          }\`}
        >
          <Scissors className="w-4 h-4" />
          <span className="font-bold text-[11px] sm:text-sm">Perbaikan</span>
        </button>
      </div>`;
qc = qc.replace(tabsOld, tabsNew);

fs.writeFileSync('src/components/QualityControlView.tsx', qc, 'utf8');

console.log('Done minimizing QC');
