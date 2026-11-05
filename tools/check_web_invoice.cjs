const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data: lp } = await c
    .from('log_produk')
    .select('*')
    .eq('invoice', 'WEB-1792043330680');
  console.log('log_produk with invoice WEB-1792043330680 (count):', lp?.length);
  const soRows = lp?.filter(x => x.type === 'SO') || [];
  console.log('SO rows in WEB-1792043330680:', soRows);
  const nonSoRows = lp?.filter(x => x.type !== 'SO') || [];
  console.log('Non-SO rows count in WEB-1792043330680:', nonSoRows.length);
  console.table(nonSoRows.slice(0, 10));

  // Check if there is another table or session log
  const { data: audit } = await c
    .from('stock_opname_queue')
    .select('*')
    .eq('invoice', 'WEB-1792043330680');
  console.log('Total queue items in WEB-1792043330680:', audit?.length);
}

main().catch(console.error);
