const fs = require('fs');
let code = fs.readFileSync('src/services/supabase.ts', 'utf8');

const regex = /\/\/ 4\. Deteksi data lokal yang belum tersinkronisasi ke Supabase lalu unggah otomatis([\s\S]*?)function saveQcReportsBatchToSupabase/g;

code = code.replace(regex, `// 4. Deteksi data lokal yang belum tersinkronisasi
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

export async function saveQcReportsBatchToSupabase`);

fs.writeFileSync('src/services/supabase.ts', code);
