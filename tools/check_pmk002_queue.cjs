const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data: pmk002Queue } = await c
    .from('stock_opname_queue')
    .select('invoice, sesi_id, sku, lokasi, area, qty_sistem, qty_fisik, selisih, status, created_at')
    .eq('lokasi', 'PMK002')
    .order('created_at', { ascending: false });
  console.log('PMK002 queue:');
  console.table(pmk002Queue?.slice(0, 15));
}

main().catch(console.error);
