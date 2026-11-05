const { createClient } = require('@supabase/supabase-js');
const url = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const key = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const supabase = createClient(url, key);

async function testFull() {
  console.log('--- 1. Querying log_produk with targetLocations ---');
  const targetLocations = [
    'STUDIO', 'Studio', 'SHOPEE', 'Shopee', 'TIKTOK', 'TikTok', 'BLOK F', 'Blok F',
    'LIVE SHOPEE', 'LIVE TIKTOK', 'SAMPLE', 'FOTO'
  ];
  const { data: channelLogs, error: logErr } = await supabase
    .from('log_produk')
    .select('sku, nama_produk, size, lokasi, type, qty')
    .in('lokasi', targetLocations);

  console.log('channelLogs count:', channelLogs ? channelLogs.length : 0, 'error:', logErr);

  console.log('\n--- 2. Querying stok_real_fisik directly for Blok F & channels ---');
  const { data: srf, error: srfErr } = await supabase
    .from('stok_real_fisik')
    .select('sku, nama_produk, size, lokasi, area, sisa_stok')
    .or('area.eq.Blok F,lokasi.ilike.%tiktok%,lokasi.ilike.%shopee%,lokasi.ilike.%studio%')
    .neq('sisa_stok', 0);

  console.log('stok_real_fisik count:', srf ? srf.length : 0, 'error:', srfErr);
  if (srf) {
    const byLok = {};
    srf.forEach(r => { byLok[r.lokasi] = (byLok[r.lokasi] || 0) + 1; });
    console.log('byLok in stok_real_fisik:', byLok);
  }
}
testFull();
