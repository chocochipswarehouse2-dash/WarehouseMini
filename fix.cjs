const fs = require('fs');
let code = fs.readFileSync('src/services/supabase.ts', 'utf8');

const startIdx = code.indexOf('// 4. Deteksi data lokal yang belum tersinkronisasi');
const endIdx = code.indexOf('export async function saveQcReportsBatchToSupabase');

if (startIdx > -1 && endIdx > -1) {
    const newStr = `// 4. Deteksi data lokal yang belum tersinkronisasi
  try {
    if (localData.length > 0) {
      const unsynced = localData.filter(
        (c) => c && c.report_no && !c.report_no.startsWith('QC-20260906-10')
      );
    }
  } catch {}

  const finalResults = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.created_at || b.tanggal || 0).getTime() - new Date(a.created_at || a.tanggal || 0).getTime()
  );

  try {
    localStorage.setItem('wms_local_qc_reports', JSON.stringify(finalResults));
  } catch {}

  return finalResults;
}

`;
    code = code.substring(0, startIdx) + newStr + code.substring(endIdx);
    fs.writeFileSync('src/services/supabase.ts', code);
    console.log('Fixed syntax');
} else {
    console.log('Not found');
}
