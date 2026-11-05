const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const cleanLocs = ['PMK02'];
  const locParam = cleanLocs.map(l => `"${encodeURIComponent(l)}"`).join(',');
  const { data: rows, error } = await c
    .from('stok_real_fisik')
    .select('sku,nama_produk,size,lokasi,area,sisa_stok,updated_at')
    .in('lokasi', cleanLocs)
    .neq('sisa_stok', 0);

  console.log('PostgREST query for PMK02 count:', rows?.length, error);
  console.table(rows);
}

main().catch(console.error);
