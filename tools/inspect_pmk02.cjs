const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  console.log('--- Querying stok_real_fisik for PMK02 ---');
  const { data: srf, error: srfErr } = await c
    .from('stok_real_fisik')
    .select('*')
    .eq('lokasi', 'PMK02');
  console.log('stok_real_fisik (count):', srf?.length, srfErr || '');
  console.table(srf);

  console.log('--- Querying stok_realtime for PMK02 ---');
  const { data: srt, error: srtErr } = await c
    .from('stok_realtime')
    .select('*')
    .eq('lokasi', 'PMK02');
  console.log('stok_realtime (count):', srt?.length, srtErr || '');
  if (srt && srt.length > 0) console.table(srt);

  console.log('--- Querying log_produk for PMK02 ---');
  const { data: lp, error: lpErr } = await c
    .from('log_produk')
    .select('id, sku, lokasi, area, type, qty, invoice, created_at')
    .eq('lokasi', 'PMK02')
    .order('created_at', { ascending: false })
    .limit(30);
  console.log('log_produk (sample 30):', lp?.length, lpErr || '');
  console.table(lp);
}

main().catch(console.error);
