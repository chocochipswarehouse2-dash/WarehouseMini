/**
 * =============================================================================
 * WMS CHOCOCHIPS — SUPABASE ACCOUNT MIGRATION CLI TOOL v2
 * =============================================================================
 * Memindahkan SELURUH DATA dari akun Supabase lama (Source) ke akun baru (Target).
 * Cocok dijalankan saat pindah akun Supabase (misal: limit egress habis).
 *
 * CARA MENJALANKAN:
 *   node tools/migrate-supabase.cjs \
 *     --source-url="https://SOURCE.supabase.co" \
 *     --source-key="sb_publishable_SOURCE_KEY" \
 *     --target-url="https://TARGET.supabase.co" \
 *     --target-key="sb_publishable_TARGET_KEY"
 *
 * FLAG OPSIONAL:
 *   --dry-run              Simulasi tanpa insert data (hanya hitung baris)
 *   --tables=t1,t2,t3      Migrasi tabel tertentu saja (default: semua tabel)
 *   --skip=t1,t2           Lewati tabel tertentu
 *   --batch=500            Ukuran batch per fetch (default: 500)
 *   --chunk=200            Ukuran chunk per insert (default: 200)
 *
 * SYARAT:
 *   - Schema/tabel di target DB sudah dibuat (jalankan semua file SQL schema dulu).
 *   - Source dan Target URL tidak boleh sama.
 * =============================================================================
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ─── Parse CLI Arguments ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultValue = '') {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  if (found) return found.slice(prefix.length).trim();
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1].trim();
  return defaultValue;
}
const hasFlag = (name) => args.includes(`--${name}`);

const sourceUrl  = getArg('source-url',  process.env.VITE_SUPABASE_URL      || '');
const sourceKey  = getArg('source-key',  process.env.VITE_SUPABASE_ANON_KEY || '');
const targetUrl  = getArg('target-url',  '');
const targetKey  = getArg('target-key',  '');
const isDryRun   = hasFlag('dry-run');
const tablesArg  = getArg('tables', '');
const skipArg    = getArg('skip', '');
const BATCH_SIZE  = parseInt(getArg('batch', '500'), 10);
const INSERT_CHUNK = parseInt(getArg('chunk', '200'), 10);

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log('================================================================');
console.log('      WMS CHOCOCHIPS — SUPABASE ACCOUNT MIGRATION v2');
console.log('================================================================');
if (isDryRun) console.log('🟡 MODE: DRY RUN — Tidak ada data yang akan dimasukkan\n');

// ─── Validasi Argumen ────────────────────────────────────────────────────────
if (!sourceUrl || !sourceKey) {
  console.error('❌ ERROR: Source URL dan Key wajib diisi!');
  console.log('\nCara penggunaan:');
  console.log('  node tools/migrate-supabase.cjs \\');
  console.log('    --source-url="https://SOURCE.supabase.co" \\');
  console.log('    --source-key="sb_publishable_SOURCE_KEY" \\');
  console.log('    --target-url="https://TARGET.supabase.co" \\');
  console.log('    --target-key="sb_publishable_TARGET_KEY"');
  process.exit(1);
}

if (!targetUrl || !targetKey) {
  console.error('❌ ERROR: Target URL dan Key wajib diisi!');
  process.exit(1);
}

if (sourceUrl.replace(/\/$/, '') === targetUrl.replace(/\/$/, '')) {
  console.error('❌ ERROR: Source URL dan Target URL tidak boleh sama!');
  console.error('   Pastikan Anda memasukkan project Supabase yang BERBEDA.');
  process.exit(1);
}

console.log(`📡 Sumber (DB Lama): ${sourceUrl}`);
console.log(`🎯 Tujuan (DB Baru): ${targetUrl}`);
console.log(`⚙️  Batch: ${BATCH_SIZE} baris/fetch | Chunk: ${INSERT_CHUNK} baris/insert\n`);

// ─── Supabase Clients ─────────────────────────────────────────────────────────
const sourceClient = createClient(sourceUrl, sourceKey, { auth: { persistSession: false } });
const targetClient = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

// ─── Daftar Tabel (urutan FK-aware) ──────────────────────────────────────────
// PENTING: Urutan ini memperhitungkan foreign key dependencies:
//   - karyawan harus ada sebelum roster_shift, presensi, lembur, perijinan_cuti
//   - wms_projects harus ada sebelum wms_agenda
const ALL_TABLES = [
  // Core WMS
  'wms_users',
  'master_produk',
  'outlet_config',
  'address_book',
  // Inventory & Stock
  'log_produk',
  'stock_opname_queue',
  'penerimaan_produksi',
  'picking_list',
  'peminjaman',
  // QC & Perbaikan
  'perbaikan_tickets',
  'qc_reports',
  // Pengiriman
  'manual_shipment',
  'pengecekan_sj',
  // HR — karyawan HARUS sebelum tabel yang ber-FK ke nik
  'karyawan',
  'master_shift',
  'roster_shift',
  'presensi',
  'lembur',
  'perijinan_cuti',
  // Project & Agenda — wms_projects HARUS sebelum wms_agenda
  'wms_projects',
  'wms_agenda',
  // Misc
  'wms_roadmap',
  'wms_system_docs',
  'wms_settings',
];

// Filter tabel berdasarkan flag --tables dan --skip
let TABLES_TO_MIGRATE = ALL_TABLES;
if (tablesArg) {
  const requested = tablesArg.split(',').map(t => t.trim()).filter(Boolean);
  // Pertahankan urutan FK dari ALL_TABLES
  TABLES_TO_MIGRATE = ALL_TABLES.filter(t => requested.includes(t));
  const notFound = requested.filter(t => !ALL_TABLES.includes(t));
  if (notFound.length > 0) {
    console.warn(`⚠️  Tabel berikut tidak dikenal dan dilewati: ${notFound.join(', ')}`);
  }
}
if (skipArg) {
  const toSkip = new Set(skipArg.split(',').map(t => t.trim()).filter(Boolean));
  TABLES_TO_MIGRATE = TABLES_TO_MIGRATE.filter(t => !toSkip.has(t));
  console.log(`⏭️  Tabel yang dilewati: ${[...toSkip].join(', ')}\n`);
}

console.log(`📋 Tabel yang akan dimigrasi (${TABLES_TO_MIGRATE.length}): ${TABLES_TO_MIGRATE.join(', ')}\n`);

// ─── Helper: Delay ───────────────────────────────────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Helper: Insert dengan Retry Eksponensial ─────────────────────────────────
async function insertWithRetry(tableName, chunk, attempt = 0) {
  const MAX_RETRIES = 3;

  // Coba upsert dulu (merge duplicates)
  const { error: upsertErr } = await targetClient
    .from(tableName)
    .upsert(chunk, { ignoreDuplicates: true });

  if (!upsertErr) return { success: true, count: chunk.length };

  // Fallback ke insert biasa
  const { error: insertErr } = await targetClient
    .from(tableName)
    .insert(chunk);

  if (!insertErr) return { success: true, count: chunk.length };

  // Jika masih error dan masih ada retry
  if (attempt < MAX_RETRIES) {
    const waitMs = Math.pow(2, attempt) * 500; // 500ms, 1000ms, 2000ms
    console.warn(`   ⚠️  Chunk gagal (attempt ${attempt + 1}/${MAX_RETRIES}), retry dalam ${waitMs}ms... Error: ${insertErr.message}`);
    await delay(waitMs);
    return insertWithRetry(tableName, chunk, attempt + 1);
  }

  return { success: false, error: insertErr.message, count: 0 };
}

// ─── Fungsi Migrasi Per Tabel ─────────────────────────────────────────────────
async function migrateTable(tableName) {
  process.stdout.write(`⏳ [${tableName}] Memeriksa... `);

  // Hitung baris di sumber
  const { count: sourceCount, error: countErr } = await sourceClient
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.log(`⚠️  Gagal baca sumber: ${countErr.message}`);
    return { success: false, table: tableName, error: countErr.message, sourceCount: 0, insertedCount: 0 };
  }

  const totalRows = sourceCount || 0;

  if (totalRows === 0) {
    console.log(`✅ Kosong (0 baris), dilewati.`);
    return { success: true, table: tableName, sourceCount: 0, insertedCount: 0 };
  }

  if (isDryRun) {
    console.log(`🟡 [DRY RUN] ${totalRows} baris ditemukan, tidak ada insert.`);
    return { success: true, table: tableName, sourceCount: totalRows, insertedCount: 0, dryRun: true };
  }

  console.log(`${totalRows} baris ditemukan. Mentransfer...`);

  let fetched = 0;
  let inserted = 0;
  let errors = 0;

  while (fetched < totalRows) {
    const end = Math.min(fetched + BATCH_SIZE - 1, totalRows - 1);

    const { data: rows, error: fetchErr } = await sourceClient
      .from(tableName)
      .select('*')
      .range(fetched, end);

    if (fetchErr || !rows) {
      console.error(`\n   ❌ Gagal fetch [${fetched}–${end}]: ${fetchErr?.message}`);
      errors++;
      break;
    }

    if (rows.length === 0) break;
    fetched += rows.length;

    // Insert dalam chunk kecil dengan retry
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const chunk = rows.slice(i, i + INSERT_CHUNK);
      const result = await insertWithRetry(tableName, chunk);
      if (result.success) {
        inserted += result.count;
      } else {
        console.error(`\n   ❌ Gagal insert chunk setelah 3x retry: ${result.error}`);
        errors++;
      }
    }

    const pct = Math.round((fetched / totalRows) * 100);
    process.stdout.write(`\r   ↳ Progres: ${inserted}/${totalRows} (${pct}%) — Errors: ${errors}    `);
  }

  // Verifikasi count di target
  const { count: targetCount } = await targetClient
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  const verified = targetCount !== null;
  const match = targetCount >= totalRows;

  process.stdout.write('\n');
  if (match) {
    console.log(`   ✅ Selesai! Source: ${totalRows} | Target: ${targetCount} | ✓ Verified\n`);
  } else {
    console.log(`   ⚠️  Selesai dengan perbedaan! Source: ${totalRows} | Target: ${targetCount || '?'} | Errors: ${errors}\n`);
  }

  return {
    success: errors === 0,
    table: tableName,
    sourceCount: totalRows,
    insertedCount: inserted,
    targetCount: targetCount || 0,
    errors,
  };
}

// ─── Main Runner ──────────────────────────────────────────────────────────────
async function run() {
  const startTime = Date.now();
  console.log('🚀 Memulai migrasi data...\n');

  const results = [];
  for (const table of TABLES_TO_MIGRATE) {
    try {
      const res = await migrateTable(table);
      results.push(res);
    } catch (e) {
      console.error(`❌ Error tidak terduga pada tabel [${table}]: ${e.message}`);
      results.push({ success: false, table, error: e.message, sourceCount: 0, insertedCount: 0, targetCount: 0 });
    }
  }

  const durationSec = Math.round((Date.now() - startTime) / 1000);

  // ─── Laporan Ringkasan ──────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`🎉 MIGRASI SELESAI dalam ${durationSec} detik!`);
  console.log('================================================================');

  const totalSource   = results.reduce((s, r) => s + (r.sourceCount || 0), 0);
  const totalInserted = results.reduce((s, r) => s + (r.insertedCount || 0), 0);
  const failed        = results.filter(r => !r.success);

  console.log(`\n📊 RINGKASAN:`);
  console.log(`   Total baris sumber  : ${totalSource.toLocaleString()}`);
  console.log(`   Total berhasil      : ${totalInserted.toLocaleString()}`);
  console.log(`   Tabel bermasalah    : ${failed.length}`);

  if (failed.length > 0) {
    console.log('\n⚠️  TABEL YANG BERMASALAH:');
    failed.forEach(r => console.log(`   - ${r.table}: ${r.error || `Source ${r.sourceCount} vs Target ${r.targetCount}`}`));
  }

  // Tabel detail
  console.log('\n📋 DETAIL PER TABEL:');
  console.log('─────────────────────────────────────────────────────────────────');
  const headerFmt = (s, n) => s.padEnd(n);
  console.log(`${headerFmt('TABEL', 28)} ${headerFmt('SUMBER', 10)} ${headerFmt('TARGET', 10)} ${headerFmt('STATUS', 8)}`);
  console.log('─────────────────────────────────────────────────────────────────');
  results.forEach(r => {
    const status = r.dryRun ? '🟡 DRY ' : r.success ? '✅ OK  ' : '❌ GAGAL';
    console.log(`${headerFmt(r.table, 28)} ${String(r.sourceCount || 0).padEnd(10)} ${String(r.targetCount || 0).padEnd(10)} ${status}`);
  });
  console.log('─────────────────────────────────────────────────────────────────');

  // Simpan laporan JSON
  if (!isDryRun) {
    const reportName = `migration-report-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
    const reportPath = path.join(__dirname, '..', reportName);
    const report = {
      timestamp: new Date().toISOString(),
      sourceUrl,
      targetUrl,
      durationSeconds: durationSec,
      totalSource,
      totalInserted,
      results,
    };
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
      console.log(`\n💾 Laporan tersimpan: ${reportPath}`);
    } catch (e) {
      console.warn(`⚠️  Gagal menyimpan laporan: ${e.message}`);
    }
  }

  // ─── Langkah Selanjutnya ────────────────────────────────────────────────────
  if (!isDryRun) {
    console.log('\n================================================================');
    console.log('📋 LANGKAH SELANJUTNYA (wajib diselesaikan agar sistem aktif):');
    console.log('================================================================');
    console.log('\n[A] UPDATE KODE SUMBER (src/services/supabase.ts):');
    console.log(`    DEFAULT_SUPABASE_URL  = "${targetUrl}"`);
    console.log(`    DEFAULT_SUPABASE_ANON_KEY = "${targetKey}"`);
    console.log('\n[B] UPDATE GAS (SupabaseBridge_cloud.js):');
    console.log(`    const SUPABASE_URL = "${targetUrl}";`);
    console.log(`    const SUPABASE_ANON_KEY = "${targetKey}";`);
    console.log('    → Jalankan: node tools/gas_deploy.cjs');
    console.log('\n[C] UPDATE SCRIPT PROPERTIES DI GAS:');
    console.log('    → Buka GAS Editor > Project Settings > Script Properties');
    console.log('    → Update SUPABASE_SERVICE_KEY dengan Service Role Key baru');
    console.log('\n[D] UPDATE VERCEL ENVIRONMENT VARIABLES:');
    console.log(`    VITE_SUPABASE_URL      = "${targetUrl}"`);
    console.log(`    VITE_SUPABASE_ANON_KEY = "${targetKey}"`);
    console.log('    → Redeploy di Vercel setelah update env.');
    console.log('\n[E] UPDATE GITHUB SECRETS (untuk GitHub Actions build):');
    console.log('    → Settings > Secrets > Actions');
    console.log(`    VITE_SUPABASE_URL      = "${targetUrl}"`);
    console.log(`    VITE_SUPABASE_ANON_KEY = "${targetKey}"`);
    console.log('\n[F] INSTRUKSIKAN SEMUA PENGGUNA:');
    console.log('    → Clear Cache & Local Storage di browser mereka');
    console.log('    → Atau tunggu auto-migration dari localStorage saat app reload');
    console.log('\n[G] VERIFIKASI FONNTE:');
    console.log('    → Pastikan webhook Fonnte masih mengarah ke GAS Web App URL yang aktif');
    console.log('    → Cek di dashboard Fonnte: Device > Webhook URL');
    console.log('\n[H] JALANKAN SEQUENCE FIX (penting untuk tabel BIGINT):');
    console.log('    → Di SQL Editor Supabase baru, jalankan:');
    console.log('       SELECT setval(pg_get_serial_sequence(\'picking_list\', \'id\'), COALESCE(MAX(id), 1)) FROM picking_list;');
    console.log('       SELECT setval(pg_get_serial_sequence(\'peminjaman\', \'id\'), COALESCE(MAX(id), 1)) FROM peminjaman;');
    console.log('       SELECT setval(pg_get_serial_sequence(\'perbaikan_tickets\', \'id\'), COALESCE(MAX(id), 1)) FROM perbaikan_tickets;');
    console.log('       SELECT setval(pg_get_serial_sequence(\'qc_reports\', \'id\'), COALESCE(MAX(id), 1)) FROM qc_reports;');
    console.log('\n[I] VERIFIKASI END-TO-END:');
    console.log('    → Login ke app, cek data tampil normal');
    console.log('    → Kirim scan WA via Fonnte, cek masuk ke DB baru');
    console.log('    → Cek Supabase Dashboard: tabel log_produk ada baris baru');
  }

  console.log('\n================================================================');
  console.log('Baca panduan lengkap: docs/PANDUAN_MIGRASI_SUPABASE.md');
  console.log('================================================================\n');
}

run().catch(err => {
  console.error('\n❌ Fatal Error:', err.message);
  process.exit(1);
});
