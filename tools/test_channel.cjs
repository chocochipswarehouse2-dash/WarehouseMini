const { createClient } = require('@supabase/supabase-js');
const url = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const key = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const supabase = createClient(url, key);

async function test() {
  // Let's see what stok_real_fisik has for TIKTOK vs BLOK F
  const { data: srfTiktok, error: err1 } = await supabase
    .from('stok_real_fisik')
    .select('sku, nama_produk, size, lokasi, area, sisa_stok')
    .eq('lokasi', 'TIKTOK')
    .neq('sisa_stok', 0);

  console.log('stok_real_fisik lokasi=TIKTOK:', srfTiktok ? srfTiktok.length : 0);

  const { data: srfBlokF, error: err2 } = await supabase
    .from('stok_real_fisik')
    .select('sku, nama_produk, size, lokasi, area, sisa_stok')
    .eq('area', 'Blok F')
    .neq('sisa_stok', 0);

  console.log('stok_real_fisik area=Blok F:', srfBlokF ? srfBlokF.length : 0);
  if (srfBlokF) {
    const locs = {};
    srfBlokF.forEach(r => { locs[r.lokasi] = (locs[r.lokasi] || 0) + 1; });
    console.log('Locations in Blok F:', locs);
  }
}
test();
