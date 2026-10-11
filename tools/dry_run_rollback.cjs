const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function dryRun() {
  console.log('=== DRY RUN: CEK DATA PEMULIHAN ===');

  // 1. Cek rows ADJ-CLEANUP
  const { data: cleanRows, error: errClean } = await c
    .from('log_produk')
    .select('id, sku, lokasi, area, qty, type, invoice')
    .ilike('invoice', '%ADJ-CLEANUP%');
  
  if (errClean) {
    console.error('Error cek ADJ-CLEANUP:', errClean);
    return;
  }
  console.log(`1. Ditemukan ${cleanRows.length} baris mutasi ADJ-CLEANUP yang akan dihapus.`);

  // 2. Cek baris log_produk berawalan R, Z, V yang bukan Kolian
  const kolianCheck = await c
    .from('log_produk')
    .select('id', { count: 'exact', head: true })
    .or('lokasi.ilike.R%,lokasi.ilike.Z%,lokasi.ilike.V%')
    .neq('area', 'Kolian');
  console.log(`2. Baris Kolian (R, Z, V) yang belum ber-area "Kolian": ${kolianCheck.count}`);

  // 3. Cek baris Perbaikan (DF, CC, PMK) yang belum Perbaikan
  const perbaikanCheck = await c
    .from('log_produk')
    .select('id', { count: 'exact', head: true })
    .or('lokasi.ilike.DF%,lokasi.ilike.CC%,lokasi.ilike.PMK%')
    .neq('area', 'Perbaikan');
  console.log(`3. Baris Perbaikan (DF, CC, PMK) yang belum ber-area "Perbaikan": ${perbaikanCheck.count}`);

  // 4. Cek baris Aksesoris (BELT, BOX, CARD, GIFT)
  const aksesorisCheck = await c
    .from('log_produk')
    .select('id', { count: 'exact', head: true })
    .or('lokasi.ilike.BELT%,lokasi.ilike.BOX%,lokasi.ilike.CARD%,lokasi.ilike.GIFT%')
    .neq('area', 'Aksesoris');
  console.log(`4. Baris Aksesoris yang belum ber-area "Aksesoris": ${aksesorisCheck.count}`);

  // 5. Cek baris Blok F (TIKTOK, SHOPEE, STUDIO)
  const blokFCheck = await c
    .from('log_produk')
    .select('id', { count: 'exact', head: true })
    .in('lokasi', ['TIKTOK', 'SHOPEE', 'STUDIO'])
    .neq('area', 'Blok F');
  console.log(`5. Baris Blok F yang belum ber-area "Blok F": ${blokFCheck.count}`);
}

dryRun().catch(console.error);
