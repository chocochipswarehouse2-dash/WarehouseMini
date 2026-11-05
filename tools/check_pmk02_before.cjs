const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function main() {
  const { data: lpLike } = await c
    .from('log_produk')
    .select('id, type, invoice, sku, lokasi, area, qty, created_at')
    .eq('sku', 'F26BTN680BAS')
    .ilike('lokasi', '%PMK%');
  console.log('F26BTN680BAS PMK-like:', lpLike);

  // Also check if there were any other PMK02 rows with deleted or other types
  const { data: allPmk02 } = await c
    .from('log_produk')
    .select('id, type, invoice, sku, lokasi, area, qty, created_at')
    .ilike('lokasi', 'PMK02%')
    .lt('created_at', '2026-10-15T05:48:55Z');
  console.log('all PMK02 logs before SO count:', allPmk02?.length);
  const skusBefore = new Set(allPmk02?.map(x => x.sku));
  console.log('Does skusBefore have F26BTN680BAS?:', skusBefore.has('F26BTN680BAS'));
  console.log('Unique skus in PMK02 before SO:', Array.from(skusBefore));
}

main().catch(console.error);
