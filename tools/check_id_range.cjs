const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data } = await c
    .from('log_produk')
    .select('id, type, invoice, sku, lokasi, area, qty, created_at')
    .gte('id', 397350)
    .lte('id', 397445)
    .order('id', { ascending: true });
  console.table(data);
}

main().catch(console.error);
