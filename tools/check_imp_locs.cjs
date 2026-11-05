const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data: impAll } = await c
    .from('log_produk')
    .select('lokasi')
    .eq('invoice', 'IMP-1792042895218');
  const locCounts = {};
  impAll?.forEach(x => {
    locCounts[x.lokasi] = (locCounts[x.lokasi] || 0) + 1;
  });
  console.log('Locations in IMP-1792042895218:', locCounts);
}

main().catch(console.error);
