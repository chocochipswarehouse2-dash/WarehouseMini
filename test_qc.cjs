const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://atdedxyiielpmzjlnriv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZoVorqMTbLr9Fj3jif5M3Q_lnuzi0bb';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("Checking laporan_qc...");
  const { data: qc, error: qErr } = await supabase
    .from('laporan_qc')
    .select('id, foto_urls');
  
  if (qErr) {
     console.log("Error:", qErr);
     return;
  }
  console.log("Found", qc ? qc.length : 0, "rows.");
}
run();
