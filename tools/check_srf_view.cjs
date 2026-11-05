const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data, error } = await c.rpc('get_view_definition', { view_name: 'stok_real_fisik' });
  console.log('rpc get_view_definition:', data, error);
}

main().catch(console.error);
