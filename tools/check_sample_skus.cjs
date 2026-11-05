const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const skus = ['F25BSS356PIXL', 'F26FTN753BU', 'C26FTN760YL', 'F26ETN741BA'];
  const { data } = await c
    .from('log_produk')
    .select('id, type, invoice, sku, lokasi, area, qty, created_at')
    .in('sku', skus)
    .order('created_at', { ascending: false })
    .limit(30);
  console.table(data);
}

main().catch(console.error);
