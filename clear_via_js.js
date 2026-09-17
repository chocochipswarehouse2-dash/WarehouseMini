const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://atdedxyiielpmzjlnriv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZoVorqMTbLr9Fj3jif5M3Q_lnuzi0bb';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("Checking perbaikan_tickets...");
  const { data: tickets, error: tErr } = await supabase
    .from('perbaikan_tickets')
    .select('id, foto_urls');
  
  if (tErr) {
    console.error("Error fetching tickets:", tErr.message);
    return;
  }
  
  let clearedTickets = 0;
  for (const t of tickets) {
    if (t.foto_urls && Array.isArray(t.foto_urls) && t.foto_urls.some(url => url.startsWith('data:image'))) {
      const { error: uErr } = await supabase
        .from('perbaikan_tickets')
        .update({ foto_urls: [] })
        .eq('id', t.id);
      if (!uErr) clearedTickets++;
      else console.error(`Error updating ticket ${t.id}:`, uErr.message);
    }
  }
  console.log(`Cleared base64 from ${clearedTickets} tickets.`);
  
  console.log("Checking laporan_qc...");
  const { data: qc, error: qErr } = await supabase
    .from('laporan_qc')
    .select('id, foto_urls');
  
  if (!qErr && qc) {
    let clearedQc = 0;
    for (const q of qc) {
      if (q.foto_urls && Array.isArray(q.foto_urls) && q.foto_urls.some(url => url.startsWith('data:image'))) {
        const { error: uErr } = await supabase
          .from('laporan_qc')
          .update({ foto_urls: [] })
          .eq('id', q.id);
        if (!uErr) clearedQc++;
      }
    }
    console.log(`Cleared base64 from ${clearedQc} QC reports.`);
  }
}
run();
