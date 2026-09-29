/**
 * =============================================================================
 * WMS CHOCOCHIPS — TEST WEBHOOK END-TO-END
 * =============================================================================
 * Script ini menguji alur lengkap: INSERT ke Supabase → Webhook GAS → GAS API.
 *
 * PERSIAPAN:
 *   1. Buat file .env di root proyek dengan isi:
 *      SUPABASE_URL=https://xxx.supabase.co
 *      SUPABASE_SERVICE_KEY=eyJhbGci...service_role_key...
 *      GAS_API_URL=https://script.google.com/macros/s/XXXXXXX/exec
 *
 *   2. JANGAN commit file .env ke GitHub!
 *      File .env sudah ada di .gitignore.
 *
 * CARA MENJALANKAN:
 *   npx ts-node test-webhook.ts
 *   -- atau --
 *   node -r dotenv/config -r ts-node/register test-webhook.ts
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ─── Load .env secara manual (tanpa dotenv dependency) ───────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

// ─── Konfigurasi dari env ─────────────────────────────────────────────────────
const SUPABASE_URL     = process.env.SUPABASE_URL     || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const GAS_API_URL      = process.env.GAS_API_URL      || '';

// Validasi
if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL tidak ditemukan. Buat file .env dengan SUPABASE_URL=...');
  process.exit(1);
}
if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY tidak ditemukan. Buat file .env dengan SUPABASE_SERVICE_KEY=...');
  console.log('   Service Role Key ada di: Supabase Dashboard > Project Settings > API > service_role');
  process.exit(1);
}

console.log(`📡 Supabase: ${SUPABASE_URL}`);
console.log(`🔗 GAS API : ${GAS_API_URL || '(tidak dikonfigurasi — skip test GAS)'}`);

// ─── Supabase Client (Service Role untuk bypass RLS) ─────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Helper ───────────────────────────────────────────────────────────────────
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Test 1: Koneksi Dasar ────────────────────────────────────────────────────
async function testConnection(): Promise<boolean> {
  console.log('\n[KONEKSI] Menguji koneksi ke Supabase...');
  const { data, error } = await supabase.from('wms_users').select('username').limit(1);
  if (error) {
    console.error('❌ Koneksi GAGAL:', error.message);
    return false;
  }
  console.log('✅ Koneksi berhasil! Data wms_users ditemukan.');
  return true;
}

// ─── Test 2: CRUD Manual Shipment ────────────────────────────────────────────
async function testManualShipmentCRUD() {
  const testId = crypto.randomUUID();
  const testOrderNo = `TEST-${Date.now()}`;

  console.log('\n[MANUAL SHIPMENT] Test INSERT...');
  const { error: insertError } = await supabase
    .from('manual_shipment')
    .insert({
      id: testId,
      no_pesanan: testOrderNo,
      nama_pengirim: 'CHOCOCHIPS TEST',
      pic_store: 'Test Store',
      no_telp_store: '08111111111',
      no_transaksi_pengirim: ['TX-TEST-001'],
      nama_tujuan: 'Test Customer',
      no_telp_tujuan: '08123456789',
      alamat_tujuan: 'Jl. Test No. 1, Jakarta',
      notes_paket: 'Data test — bisa dihapus',
      jasa_kirim: 'JNE',
      status: 'diterima',
      submitted_by: 'test-webhook-script',
      items: [],
    });

  if (insertError) {
    console.error('❌ INSERT gagal:', insertError.message);
    return;
  }
  console.log(`✅ INSERT sukses (ID: ${testId})`);

  if (GAS_API_URL) {
    console.log('   Menunggu 4 detik agar webhook GAS diproses...');
    await wait(4000);

    try {
      const res = await fetch(`${GAS_API_URL}?action=sync&table=manual_shipment`);
      const result = await res.json() as any;
      const found = result?.data?.find((item: any) => item.id === testId);
      if (found) {
        console.log('✅ Data terdeteksi di GAS Spreadsheet!');
      } else {
        console.warn('⚠️  Data belum terdeteksi di GAS (mungkin webhook belum aktif atau perlu waktu)');
      }
    } catch (e) {
      console.warn('⚠️  Tidak bisa cek GAS API:', (e as any).message);
    }
  }

  // Cleanup
  await supabase.from('manual_shipment').delete().eq('id', testId);
  console.log('🧹 Data test dihapus.');
}

// ─── Test 3: Tabel Perbaikan Tickets ─────────────────────────────────────────
async function testPerbaikanTickets() {
  console.log('\n[PERBAIKAN] Test count tabel perbaikan_tickets...');
  const { count, error } = await supabase
    .from('perbaikan_tickets')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('❌ Gagal baca perbaikan_tickets:', error.message);
    return;
  }
  console.log(`✅ perbaikan_tickets: ${count} baris ditemukan.`);
}

// ─── Test 4: Tabel QC Reports ────────────────────────────────────────────────
async function testQcReports() {
  console.log('\n[QC REPORTS] Test count tabel qc_reports...');
  const { count, error } = await supabase
    .from('qc_reports')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('❌ Gagal baca qc_reports:', error.message);
    return;
  }
  console.log(`✅ qc_reports: ${count} baris ditemukan.`);
}

// ─── Test 5: Tabel Pengecekan SJ ─────────────────────────────────────────────
async function testPengecekanSJ() {
  console.log('\n[PENGECEKAN SJ] Test count tabel pengecekan_sj...');
  const { count, error } = await supabase
    .from('pengecekan_sj')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('❌ Gagal baca pengecekan_sj:', error.message);
    return;
  }
  console.log(`✅ pengecekan_sj: ${count} baris ditemukan.`);
}

// ─── Test 6: Stok View ───────────────────────────────────────────────────────
async function testStokView() {
  console.log('\n[STOK VIEW] Test view stok_real_fisik...');
  const { data, error } = await supabase
    .from('stok_real_fisik')
    .select('sku, sisa_stok')
    .neq('sisa_stok', 0)
    .limit(3);

  if (error) {
    console.error('❌ Gagal baca stok_real_fisik:', error.message);
    return;
  }
  console.log(`✅ stok_real_fisik berfungsi. Sample: ${JSON.stringify(data?.slice(0, 2))}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('================================================================');
  console.log('      WMS CHOCOCHIPS — TEST WEBHOOK END-TO-END');
  console.log('================================================================\n');

  const connected = await testConnection();
  if (!connected) {
    console.error('\n❌ Koneksi gagal — hentikan test.');
    process.exit(1);
  }

  await testManualShipmentCRUD();
  await testPerbaikanTickets();
  await testQcReports();
  await testPengecekanSJ();
  await testStokView();

  console.log('\n================================================================');
  console.log('🎉 SEMUA TEST SELESAI!');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('\n❌ Fatal Error:', err.message);
  process.exit(1);
});
