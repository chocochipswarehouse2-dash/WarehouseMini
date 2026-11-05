const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data: allPmkQueue } = await c
    .from('stock_opname_queue')
    .select('invoice, sesi_id, sku, lokasi, area, qty_sistem, qty_fisik, selisih, status, created_at')
    .ilike('lokasi', '%PMK%')
    .order('created_at', { ascending: false });
  console.log('all PMK queue count:', allPmkQueue?.length);
  console.table(allPmkQueue?.slice(0, 40));

  const { data: pmk002Queue } = await c
    .from('stock_opname_queue')
    .select('*')
    .eq('lokasi', 'PMK002');
  console.log('PMK002 queue count:', pmk002Queue?.length);
}

main().catch(console.error);
