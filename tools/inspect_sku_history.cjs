const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data, error } = await c
    .from('log_produk')
    .select('*')
    .eq('sku', 'F26BTN680BAS');
  console.log('log_produk for F26BTN680BAS:');
  console.table(data);

  const { data: qData } = await c
    .from('stock_opname_queue')
    .select('*')
    .eq('invoice', 'WEB-1792043330680');
  console.log('stock_opname_queue for WEB-1792043330680:');
  console.table(qData?.slice(0, 15));
}

main().catch(console.error);
