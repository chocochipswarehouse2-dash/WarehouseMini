const { createClient } = require('@supabase/supabase-js');
const url = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const key = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const supabase = createClient(url, key);

async function testFast() {
  console.time('fetch_exact_area');
  const { data: areaRows, error: errArea } = await supabase
    .from('stok_real_fisik')
    .select('sku, nama_produk, size, lokasi, area, sisa_stok')
    .eq('area', 'Blok F')
    .neq('sisa_stok', 0);
  console.timeEnd('fetch_exact_area');
  console.log('areaRows Blok F:', areaRows ? areaRows.length : 0, 'error:', errArea);

  console.time('fetch_exact_locs');
  const locList = ['TIKTOK', 'Tiktok', 'tiktok', 'SHOPEE', 'Shopee', 'shopee', 'STUDIO', 'Studio', 'studio', 'BLOK F', 'Blok F'];
  const { data: locRows, error: errLocs } = await supabase
    .from('stok_real_fisik')
    .select('sku, nama_produk, size, lokasi, area, sisa_stok')
    .in('lokasi', locList)
    .neq('sisa_stok', 0);
  console.timeEnd('fetch_exact_locs');
  console.log('locRows in locList:', locRows ? locRows.length : 0, 'error:', errLocs);
}

testFast();
