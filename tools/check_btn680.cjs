const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data } = await c
    .from('log_produk')
    .select('*')
    .eq('sku', 'F26BTN680BAS')
    .eq('lokasi', 'PMK02');
  console.log('F26BTN680BAS at PMK02:', data);

  const { data: qItem } = await c
    .from('stock_opname_queue')
    .select('*')
    .eq('sku', 'F26BTN680BAS')
    .eq('lokasi', 'PMK02');
  console.log('SO queue item for F26BTN680BAS:', qItem);
}

main().catch(console.error);
