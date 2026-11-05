const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data: lpBas } = await c
    .from('log_produk')
    .select('id, sku, lokasi, area, type, qty, invoice, created_at')
    .eq('sku', 'F26DBH348BAS')
    .eq('lokasi', 'PMK02');
  console.log('log_produk for F26DBH348BAS in PMK02:');
  console.table(lpBas);

  const { data: lpBnm } = await c
    .from('log_produk')
    .select('id, sku, lokasi, area, type, qty, invoice, created_at')
    .eq('sku', 'F26DBH348BNM')
    .eq('lokasi', 'PMK02');
  console.log('log_produk for F26DBH348BNM in PMK02:');
  console.table(lpBnm);

  const { data: allPmk02Queue } = await c
    .from('stock_opname_queue')
    .select('sku, lokasi, area, qty_sistem, qty_fisik, selisih, status, created_at')
    .eq('lokasi', 'PMK02')
    .order('created_at', { ascending: false });
  console.log('all PMK02 stock_opname_queue:');
  console.table(allPmk02Queue);
}

main().catch(console.error);
