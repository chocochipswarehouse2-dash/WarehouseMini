/**
 * =============================================================================
 * WMS CHOCOCHIPS — DATA TRANSFORMATION HELPER
 * =============================================================================
 * Script ini adalah helper untuk MIGRASI DATA INTERNAL (bukan migrasi akun).
 * Fungsinya memindahkan data dari tabel log_produk (type=PENGECEKAN_SJ) ke
 * tabel pengecekan_sj yang baru, dan dari log_produk (MANUAL_SHIPMENT) ke
 * tabel manual_shipment.
 *
 * ⚠️  PENTING: Script ini MEMBACA dari Supabase yang sedang aktif (url & key
 *     wajib diisi via argumen CLI atau env variable). Tidak ada hardcode URL.
 *
 * Cara Menjalankan:
 *   node migrate.js --url="https://xxx.supabase.co" --key="sb_publishable_..."
 *
 * Untuk migrasi AKUN SUPABASE (pindah ke project baru), gunakan:
 *   node tools/migrate-supabase.cjs --source-url=... --source-key=... --target-url=... --target-key=...
 * =============================================================================
 */

const args = process.argv.slice(2);
function getArg(name) {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  if (found) return found.slice(prefix.length).trim();
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1].trim();
  return '';
}

const url = getArg('url') || process.env.VITE_SUPABASE_URL || '';
const key = getArg('key') || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('❌ ERROR: URL dan Key Supabase wajib diisi!');
  console.log('\nCara penggunaan:');
  console.log('  node migrate.js --url="https://xxx.supabase.co" --key="sb_publishable_..."');
  console.log('\nAtau via environment variable:');
  console.log('  $env:VITE_SUPABASE_URL="https://xxx.supabase.co"');
  console.log('  $env:VITE_SUPABASE_ANON_KEY="sb_publishable_..."');
  console.log('  node migrate.js');
  process.exit(1);
}

console.log('================================================================');
console.log('  WMS CHOCOCHIPS — TRANSFORMASI DATA INTERNAL');
console.log('================================================================');
console.log(`📡 Target DB: ${url}`);
console.log('');
console.log('Fungsi: Memindahkan data legacy dari log_produk ke tabel baru');
console.log('  → log_produk (PENGECEKAN_SJ) → pengecekan_sj');
console.log('  → log_produk (MANUAL_SHIPMENT) → manual_shipment');
console.log('================================================================\n');

async function main() {
  console.log('🚀 Memulai transformasi data...');

  // ─── 1. Migrate Pengecekan SJ ───────────────────────────────────────────
  console.log('\n[1/2] Mengambil data PENGECEKAN_SJ dari log_produk...');
  const sjRes = await fetch(`${url}/rest/v1/log_produk?type=eq.PENGECEKAN_SJ&select=*`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });

  if (!sjRes.ok) {
    console.error(`❌ Gagal fetch PENGECEKAN_SJ: HTTP ${sjRes.status} — ${await sjRes.text()}`);
  } else {
    const sjLogs = await sjRes.json();
    console.log(`   Ditemukan ${sjLogs.length} record Pengecekan SJ.`);

    if (sjLogs.length > 0) {
      const sjToInsert = [];
      for (const row of sjLogs) {
        let parsed = {};
        if (row.raw_payload) {
          try { parsed = JSON.parse(row.raw_payload); } catch(e) {}
        }
        sjToInsert.push({
          no_sj:             parsed.no_sj || row.invoice || `SJ-${row.id}`,
          tanggal_sj:        parsed.tanggal_sj || (row.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
          source:            parsed.source || row.area || 'Gudang Pusat',
          destination:       parsed.destination || row.lokasi || 'Outlet',
          status:            parsed.status || 'selesai',
          status_komparasi:  parsed.status_komparasi || row.keterangan || 'COCOK',
          total_qty_sj:      Number(parsed.total_qty_sj || row.qty || 0),
          total_qty_terima:  Number(parsed.total_qty_terima || row.qty || 0),
          total_sku:         Number(parsed.total_sku || 1),
          submitted_by:      parsed.submitted_by || row.operator || 'Petugas',
          catatan:           parsed.catatan || row.keterangan || '',
          items:             parsed.items || [],
          items_json:        JSON.stringify(parsed.items || []),
          sync_status:       'synced',
          created_at:        parsed.created_at || row.created_at || new Date().toISOString(),
        });
      }

      console.log(`   Memasukkan ${sjToInsert.length} record ke tabel pengecekan_sj...`);
      const insertSjRes = await fetch(`${url}/rest/v1/pengecekan_sj`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(sjToInsert)
      });
      if (insertSjRes.ok || insertSjRes.status === 204) {
        console.log(`   ✅ Pengecekan SJ berhasil dimasukkan.`);
      } else {
        console.error(`   ❌ Gagal insert Pengecekan SJ (${insertSjRes.status}): ${await insertSjRes.text()}`);
      }
    }
  }

  // ─── 2. Migrate Manual Shipment ─────────────────────────────────────────
  console.log('\n[2/2] Mengambil data MANUAL_SHIPMENT dari log_produk...');
  const shRes = await fetch(`${url}/rest/v1/log_produk?type=eq.MANUAL_SHIPMENT&select=*`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });

  if (!shRes.ok) {
    console.error(`❌ Gagal fetch MANUAL_SHIPMENT: HTTP ${shRes.status} — ${await shRes.text()}`);
  } else {
    const shLogs = await shRes.json();
    console.log(`   Ditemukan ${shLogs.length} record Manual Shipment.`);

    if (shLogs.length > 0) {
      const shToInsert = [];
      for (const row of shLogs) {
        let parsed = {};
        if (row.raw_payload) {
          try { parsed = JSON.parse(row.raw_payload); } catch(e) {}
        }
        shToInsert.push({
          no_pesanan:           parsed.no_pesanan || parsed.order_id || row.invoice || `MS-${row.id}`,
          nama_pengirim:        parsed.nama_pengirim || 'CHOCOCHIPS',
          pic_store:            parsed.pic_store || '',
          no_telp_store:        parsed.no_telp_store || '',
          no_transaksi_pengirim: Array.isArray(parsed.no_transaksi_pengirim) ? parsed.no_transaksi_pengirim : [],
          nama_tujuan:          parsed.nama_tujuan || parsed.destination || parsed.nama_penerima || row.lokasi || 'Customer',
          no_telp_tujuan:       parsed.no_telp_tujuan || parsed.no_telp || '',
          alamat_tujuan:        parsed.alamat_tujuan || parsed.alamat || '',
          notes_paket:          parsed.notes_paket || parsed.catatan || row.keterangan || '',
          no_transaksi_customer: parsed.no_transaksi_customer || '',
          jasa_kirim:           parsed.jasa_kirim || parsed.courier || '-',
          no_resi:              parsed.no_resi || parsed.resi || '',
          status:               parsed.status || 'diterima',
          submitted_by:         parsed.submitted_by || row.operator || '',
          items:                parsed.items || [],
          created_at:           parsed.created_at || row.created_at || new Date().toISOString(),
          updated_at:           parsed.updated_at || row.created_at || new Date().toISOString()
        });
      }

      console.log(`   Memasukkan ${shToInsert.length} record ke tabel manual_shipment...`);
      const insertShRes = await fetch(`${url}/rest/v1/manual_shipment`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify(shToInsert)
      });
      if (insertShRes.ok || insertShRes.status === 204) {
        console.log(`   ✅ Manual Shipment berhasil dimasukkan.`);
      } else {
        console.error(`   ❌ Gagal insert Manual Shipment (${insertShRes.status}): ${await insertShRes.text()}`);
      }
    }
  }

  console.log('\n================================================================');
  console.log('✅ TRANSFORMASI DATA SELESAI!');
  console.log('================================================================');
  console.log('\nLangkah selanjutnya:');
  console.log('  → Buka halaman Pengecekan SJ di app untuk memverifikasi data.');
  console.log('  → Buka halaman Pesanan Saya untuk memverifikasi Manual Shipment.');
}

main().catch(err => {
  console.error('\n❌ Fatal Error:', err.message);
  process.exit(1);
});
