/**
 * WMS CHOCOCHIPS - STANDALONE SUPABASE ACCOUNT MIGRATION CLI TOOL
 * 
 * Kegunaan:
 * Memindahkan dan mengkloning seluruh data dari akun Supabase lama (Source)
 * ke akun Supabase baru (Target) secara otomatis dalam batch.
 * 
 * Cara Menjalankan:
 * node tools/migrate-supabase.cjs --source-url="https://source.supabase.co" --source-key="sb_key_source" --target-url="https://target.supabase.co" --target-key="sb_key_target"
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Parse CLI Arguments
const args = process.argv.slice(2);
function getArg(name, defaultValue = '') {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  if (found) return found.slice(prefix.length).trim();
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1].trim();
  return defaultValue;
}

const DEFAULT_SOURCE_URL = 'https://vxongwtxmhjixhzeoidp.supabase.co';
const DEFAULT_SOURCE_KEY = 'sb_publishable_XFvjJipUzyi0EuM_tDTTsg_ll7TJ7rA';

const sourceUrl = getArg('source-url', process.env.VITE_SUPABASE_URL || DEFAULT_SOURCE_URL);
const sourceKey = getArg('source-key', process.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SOURCE_KEY);
const targetUrl = getArg('target-url', '');
const targetKey = getArg('target-key', '');

console.log('================================================================');
console.log('       WMS CHOCOCHIPS - SUPABASE DATABASE MIGRATION CLI         ');
console.log('================================================================\n');

if (!targetUrl || !targetKey) {
  console.error('❌ ERROR: Target Supabase URL dan Key wajib diisi!');
  console.log('\nContoh penggunaan:');
  console.log('node tools/migrate-supabase.cjs \\');
  console.log('  --source-url="https://source.supabase.co" \\');
  console.log('  --source-key="source_anon_key" \\');
  console.log('  --target-url="https://target.supabase.co" \\');
  console.log('  --target-key="target_anon_key"\n');
  process.exit(1);
}

console.log(`📡 Sumber (Old DB) : ${sourceUrl}`);
console.log(`🎯 Tujuan (New DB) : ${targetUrl}\n`);

const sourceClient = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const targetClient = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

// Urutan tabel yang dimigrasikan (Foreign key dependencies dipertimbangkan)
const TABLES_TO_MIGRATE = [
  'wms_users',
  'master_produk',
  'karyawan',
  'master_shift',
  'roster_shift',
  'presensi',
  'lembur',
  'perijinan_cuti',
  'log_produk',
  'stock_opname_queue',
  'penerimaan_produksi',
  'picking_list',
  'peminjaman',
  'perbaikan_tickets',
  'qc_reports',
  'manual_shipment',
  'pengecekan_sj',
  'address_book',
  'wms_projects',
  'wms_agenda',
];

const BATCH_SIZE = 500;
const INSERT_CHUNK = 200;

async function migrateTable(tableName) {
  process.stdout.write(`⏳ Memeriksa tabel [${tableName}]... `);
  
  // 1. Cek jumlah data di sumber
  const { count, error: countErr } = await sourceClient
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.log(`⚠️ Gagal membaca sumber: ${countErr.message}`);
    return { success: false, table: tableName, error: countErr.message, count: 0 };
  }

  const totalRows = count || 0;
  if (totalRows === 0) {
    console.log(`✅ Kosong (0 baris), dilewati.`);
    return { success: true, table: tableName, count: 0 };
  }

  console.log(`Ditemukan ${totalRows} baris. Memulai transfer...`);

  let fetched = 0;
  let inserted = 0;

  while (fetched < totalRows) {
    const end = Math.min(fetched + BATCH_SIZE - 1, totalRows - 1);
    
    // Fetch batch dari sumber
    const { data: rows, error: fetchErr } = await sourceClient
      .from(tableName)
      .select('*')
      .range(fetched, end);

    if (fetchErr || !rows) {
      console.error(`   ❌ Gagal fetch rentang [${fetched} - ${end}]: ${fetchErr?.message}`);
      break;
    }

    if (rows.length === 0) break;
    fetched += rows.length;

    // Tulis ke target dalam potongan yang aman
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      const { error: insertErr } = await targetClient
        .from(tableName)
        .upsert(chunk, { ignoreDuplicates: true });

      if (insertErr) {
        // Coba insert biasa jika upsert gagal
        const { error: fallbackErr } = await targetClient
          .from(tableName)
          .insert(chunk);

        if (fallbackErr) {
          console.error(`   ⚠️ Gagal insert chunk: ${fallbackErr.message}`);
        } else {
          inserted += chunk.length;
        }
      } else {
        inserted += chunk.length;
      }
    }

    const pct = Math.round((fetched / totalRows) * 100);
    process.stdout.write(`   ↳ Progres: ${inserted}/${totalRows} (${pct}%)\r`);
  }

  console.log(`   ✅ Selesai! Ditransfer: ${inserted} / ${totalRows} baris.\n`);
  return { success: true, table: tableName, count: inserted };
}

async function run() {
  const startTime = Date.now();
  console.log('🚀 Memulai migrasi data...\n');

  const results = [];
  for (const table of TABLES_TO_MIGRATE) {
    try {
      const res = await migrateTable(table);
      results.push(res);
    } catch (e) {
      console.error(`❌ Terjadi kesalahan pada tabel ${table}:`, e.message);
      results.push({ success: false, table, error: e.message, count: 0 });
    }
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log('================================================================');
  console.log(`🎉 MIGRASI SELESAI dalam ${durationSec} detik!`);
  console.log('================================================================');
  
  const totalTransferred = results.reduce((acc, r) => acc + (r.count || 0), 0);
  console.log(`Total data berhasil ditransfer: ${totalTransferred.toLocaleString()} baris.`);
  console.log('\nLangkah selanjutnya:');
  console.log(`1. Buka Vercel Settings > Environment Variables`);
  console.log(`2. Update VITE_SUPABASE_URL = "${targetUrl}"`);
  console.log(`3. Update VITE_SUPABASE_ANON_KEY = "${targetKey}"`);
  console.log(`4. Redeploy di Vercel agar aplikasi beralih 100% ke akun baru.`);
}

run().catch(console.error);
