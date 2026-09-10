const fs = require('fs');
let lqc = fs.readFileSync('src/components/LaporanQcView.tsx', 'utf8');

// I accidentally deleted the <div> opening tags previously, let's fix the return block completely
const lqcTarget = `  return (
            onClick={() => setIsSqlModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors shadow-xs"
            title="Lihat & Salin Script SQL Tabel qc_reports Supabase"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Script SQL</span>
          </button>
        </div>
      </div>`;

const lqcReplace = `  return (
    <div className="space-y-4">
      {/* 0. (Banner removed) */}
`;

lqc = lqc.replace(lqcTarget, lqcReplace);

fs.writeFileSync('src/components/LaporanQcView.tsx', lqc, 'utf8');
console.log('Fixed LQC view error');
