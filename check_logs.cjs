const { fetchFromSupabase } = require('./tools/supabase_deploy.cjs');

async function main() {
  const query = 'select=type,qty,lokasi,invoice,created_at&sku=eq.C25CBH240BA&lokasi=eq.STUDIO';
  const data = await fetchFromSupabase('log_produk', 'GET', null, query);
  console.log(JSON.stringify(data, null, 2));
}

main();
