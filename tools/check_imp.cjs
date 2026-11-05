const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data: imp } = await c
    .from('log_produk')
    .select('id, type, invoice, sku, lokasi, area, qty, created_at')
    .eq('invoice', 'IMP-1792042895218');
  console.log('IMP-1792042895218 count:', imp?.length);
  console.table(imp?.slice(0, 20));

  const { data: pmk002Stock } = await c
    .from('stok_real_fisik')
    .select('*')
    .eq('lokasi', 'PMK002');
  console.log('stok_real_fisik for PMK002:', pmk002Stock?.length);
  console.table(pmk002Stock?.slice(0, 15));

  // Check how WEB-1792043330680 was created - what locations were scanned or targeted
  const { data: soQueue } = await c
    .from('stock_opname_queue')
    .select('id, invoice, sku, lokasi, area, qty_sistem, qty_fisik, selisih')
    .eq('invoice', 'WEB-1792043330680');
  console.log('Unique locations in SO queue WEB-1792043330680:', Array.from(new Set(soQueue?.map(x => x.lokasi))));
}

main().catch(console.error);
