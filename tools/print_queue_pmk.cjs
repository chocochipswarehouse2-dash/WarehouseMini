const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data: queueItems } = await c
    .from('stock_opname_queue')
    .select('id, sku, nama_produk, size, lokasi, area, qty_sistem, qty_fisik, selisih, alasan, status')
    .eq('invoice', 'WEB-1792043330680');
  console.log('All 29 items in queue:');
  console.table(queueItems);
}

main().catch(console.error);
