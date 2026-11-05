const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data: allPmk02 } = await c
    .from('log_produk')
    .select('id, type, invoice, sku, nama_produk, size, lokasi, area, qty, created_at')
    .ilike('lokasi', 'PMK02%')
    .lt('created_at', '2026-10-15T05:48:55Z');
  console.log('all PMK02 logs before SO count:', allPmk02?.length);
  console.table(allPmk02);
}

main().catch(console.error);
