const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://atdedxyiielpmzjlnriv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZoVorqMTbLr9Fj3jif5M3Q_lnuzi0bb';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("Checking qc_reports...");
  const { data: qc, error: qErr } = await supabase
    .from('qc_reports')
    .select('id, foto_urls');
  
  if (qErr) {
    console.error("Error fetching qc_reports:", qErr.message);
    return;
  }
  
  let clearedQc = 0;
  for (const q of qc) {
    if (q.foto_urls && Array.isArray(q.foto_urls) && q.foto_urls.some(url => url.startsWith('data:image'))) {
      const { error: uErr } = await supabase
        .from('qc_reports')
        .update({ foto_urls: [] })
        .eq('id', q.id);
      if (!uErr) clearedQc++;
    }
  }
  console.log(`Cleared base64 from ${clearedQc} qc_reports.`);
}
run();
