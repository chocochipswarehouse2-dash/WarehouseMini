const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data: rows } = await c
    .from('stok_real_fisik')
    .select('lokasi, area')
    .or('lokasi.ilike.R%,lokasi.ilike.V%,lokasi.ilike.Z%,lokasi.ilike.X%')
    .limit(1000);

  const locMap = new Map();
  rows?.forEach(r => {
    const l = r.lokasi;
    if (!locMap.has(l)) locMap.set(l, { area: r.area, count: 0 });
    locMap.get(l).count++;
  });

  console.log('Unique locations starting with R, V, Z, X:');
  console.table(Array.from(locMap.entries()).map(([loc, info]) => ({
    lokasi: loc,
    area_in_db: info.area,
    count: info.count
  })));
}

main().catch(console.error);
