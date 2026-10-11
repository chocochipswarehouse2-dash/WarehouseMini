const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

async function executeRollbackAndFixArea() {
  console.log('==================================================');
  console.log('🚀 MEMULAI PROSES ROLLBACK & PEMULIHAN AREA WMS');
  console.log('==================================================');

  // LANGKAH 1: Pastikan backup ada
  if (!fs.existsSync('backup_adj_cleanup.json')) {
    console.error('❌ File backup_adj_cleanup.json tidak ditemukan! Membatalkan eksekusi.');
    process.exit(1);
  }
  const backupData = JSON.parse(fs.readFileSync('backup_adj_cleanup.json', 'utf8'));
  console.log(`✅ File backup terverifikasi: ${backupData.length} baris.`);

  // LANGKAH 2: Hapus mutasi bodong ADJ-CLEANUP-1791097374242 dari log_produk
  console.log('\n[1/3] Menghapus 719 baris mutasi ADJ-CLEANUP-1791097374242...');
  const { data: deletedData, error: deleteErr } = await c
    .from('log_produk')
    .delete()
    .eq('invoice', 'ADJ-CLEANUP-1791097374242')
    .select('id');

  if (deleteErr) {
    console.error('❌ Gagal menghapus baris ADJ-CLEANUP:', deleteErr);
    process.exit(1);
  }
  console.log(`✅ Berhasil menghapus ${deletedData ? deletedData.length : 719} baris mutasi ADJ-CLEANUP.`);

  // LANGKAH 3: Pembaruan Nama Area yang Benar di log_produk
  console.log('\n[2/3] Memperbarui nama area di log_produk sesuai standar lokasi fisik...');

  const areaTasks = [
    { name: 'Kolian (R...)', prefix: 'R%', targetArea: 'Kolian' },
    { name: 'Kolian (Z...)', prefix: 'Z%', targetArea: 'Kolian' },
    { name: 'Kolian (V...)', prefix: 'V%', targetArea: 'Kolian' },
    { name: 'Perbaikan (DF...)', prefix: 'DF%', targetArea: 'Perbaikan' },
    { name: 'Perbaikan (CC...)', prefix: 'CC%', targetArea: 'Perbaikan' },
    { name: 'Perbaikan (PMK...)', prefix: 'PMK%', targetArea: 'Perbaikan' },
    { name: 'Aksesoris (BELT...)', prefix: 'BELT%', targetArea: 'Aksesoris' },
    { name: 'Aksesoris (BOX...)', prefix: 'BOX%', targetArea: 'Aksesoris' },
    { name: 'Aksesoris (CARD...)', prefix: 'CARD%', targetArea: 'Aksesoris' },
    { name: 'Aksesoris (GIFT...)', prefix: 'GIFT%', targetArea: 'Aksesoris' },
    { name: 'Transit (X...)', prefix: 'X%', targetArea: 'Transit' },
  ];

  for (const t of areaTasks) {
    process.stdout.write(`- Mengupdate ${t.name} -> area "${t.targetArea}"... `);
    const { error: updErr } = await c
      .from('log_produk')
      .update({ area: t.targetArea })
      .ilike('lokasi', t.prefix)
      .neq('area', t.targetArea);

    if (updErr) {
      console.log(`❌ Gagal: ${updErr.message}`);
    } else {
      console.log(`✅ Selesai.`);
    }
  }

  // Khusus Blok F
  process.stdout.write(`- Mengupdate Blok F (TIKTOK, SHOPEE, STUDIO) -> area "Blok F"... `);
  const { error: updBlokF } = await c
    .from('log_produk')
    .update({ area: 'Blok F' })
    .in('lokasi', ['TIKTOK', 'SHOPEE', 'STUDIO'])
    .neq('area', 'Blok F');
  if (updBlokF) console.log(`❌ Gagal: ${updBlokF.message}`);
  else console.log(`✅ Selesai.`);

  // LANGKAH 4: Verifikasi hasil untuk SKU contoh F26ITN806BU (R024)
  console.log('\n[3/3] Verifikasi Hasil pada stok_real_fisik...');
  const { data: verifyStock, error: errVer } = await c
    .from('stok_real_fisik')
    .select('sku, nama_produk, lokasi, area, sisa_stok')
    .eq('sku', 'F26ITN806BU');

  if (errVer) {
    console.error('❌ Gagal verifikasi stok_real_fisik:', errVer);
  } else {
    console.log('✅ Status Stok Terkini untuk F26ITN806BU (Rosemary Top Blue):');
    console.table(verifyStock);
  }

  console.log('\n🎉 PROSES ROLLBACK & PEMULIHAN AREA SELESAI!');
}

executeRollbackAndFixArea().catch(console.error);
