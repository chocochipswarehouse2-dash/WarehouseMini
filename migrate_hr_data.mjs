import { createClient } from '@supabase/supabase-js';

const SOURCE_URL = 'https://rmrbfecagwcojtoqeovk.supabase.co';
const SOURCE_KEY = 'sb_publishable_zOn1y93MF0x3CIy8MJ7I8Q_fQMkJ8x9';

const TARGET_URL = 'https://vxongwtxmhjixhzeoidp.supabase.co';
const TARGET_KEY = 'sb_publishable_XFvjJipUzyi0EuM_tDTTsg_ll7TJ7rA';

const source = createClient(SOURCE_URL, SOURCE_KEY);
const target = createClient(TARGET_URL, TARGET_KEY);

async function migrateTable(tableName, batchSize = 100) {
  console.log(`\n--- Memulai migrasi ${tableName} ---`);
  
  // 1. Fetch total count from source
  const { count, error: countErr } = await source
    .from(tableName)
    .select('*', { count: 'exact', head: true });
    
  if (countErr) {
    console.error(`Error counting ${tableName}:`, countErr.message);
    return;
  }
  
  console.log(`Total baris di source (${tableName}): ${count}`);
  if (count === 0) {
    console.log(`Tabel ${tableName} kosong di source. Lanjut.`);
    return;
  }

  let offset = 0;
  let successCount = 0;

  while (offset < count) {
    const to = Math.min(offset + batchSize - 1, count - 1);
    const { data, error: fetchErr } = await source
      .from(tableName)
      .select('*')
      .range(offset, to);

    if (fetchErr) {
      console.error(`Error fetching ${tableName} range [${offset}-${to}]:`, fetchErr.message);
      break;
    }

    if (!data || data.length === 0) break;

    // Upsert into target
    const { error: insertErr } = await target
      .from(tableName)
      .upsert(data);

    if (insertErr) {
      console.error(`Error inserting into target ${tableName} [${offset}-${to}]:`, insertErr.message);
      // Try one-by-one to isolate error
      for (const row of data) {
        const { error: singleErr } = await target.from(tableName).upsert(row);
        if (singleErr) {
          console.error(`  Failed row:`, row, singleErr.message);
        } else {
          successCount++;
        }
      }
    } else {
      successCount += data.length;
    }

    offset += batchSize;
    console.log(`[${tableName}] Migrated ${successCount}/${count} rows...`);
  }

  console.log(`✓ Selesai migrasi ${tableName}: ${successCount}/${count} baris berhasil.`);
}

async function linkUsersAndKaryawan() {
  console.log('\n--- Menghubungkan wms_users dengan NIK karyawan ---');
  
  const mappings = [
    { username: 'admin', nik: 'WH0001' },
    { username: 'chocoadmin', nik: 'WH0001' },
    { username: 'picker1', nik: 'WH0006' }, // Vina Kharisma
    { username: 'PickerVina', nik: 'WH0006' },
    { username: 'picker2', nik: 'WH0004' }, // Yesinta Agistisari
    { username: 'qc1', nik: 'WH0005' },     // Nur Halimah
  ];

  for (const m of mappings) {
    const { error } = await target
      .from('wms_users')
      .update({ nik: m.nik })
      .eq('username', m.username);

    if (error) {
      console.warn(`Gagal link ${m.username} -> ${m.nik}:`, error.message);
    } else {
      console.log(`✓ Linked wms_user '${m.username}' -> NIK '${m.nik}'`);
    }
  }

  // Also add any karyawan as wms_users if they don't exist yet
  const { data: karyawanList } = await target.from('karyawan').select('*');
  if (karyawanList) {
    for (const k of karyawanList) {
      const { data: existing } = await target
        .from('wms_users')
        .select('username')
        .or(`username.eq.${k.username},nik.eq.${k.nik}`)
        .limit(1);

      if (!existing || existing.length === 0) {
        const newUser = {
          username: k.username || k.nik.toLowerCase(),
          password: k.password || '123456',
          name: k.nama,
          role: k.role === 'admin' ? 'Superadmin' : 'Operator',
          nik: k.nik,
          permissions: {}
        };
        const { error: insErr } = await target.from('wms_users').insert(newUser);
        if (insErr) {
          console.warn(`Gagal tambah wms_user baru untuk ${k.nama}:`, insErr.message);
        } else {
          console.log(`✓ Menambahkan user login baru ke wms_users: ${newUser.username} (${k.nama} - ${k.nik})`);
        }
      }
    }
  }
}

async function runMigration() {
  console.log('=== MEMULAI MIGRASI DATA HR DARI WarehouseEmpl KE SUPABASE BARU ===');
  console.log(`Source: ${SOURCE_URL}`);
  console.log(`Target: ${TARGET_URL}\n`);

  // Migrasi tabel berurutan sesuai relasi foreign key
  await migrateTable('karyawan');
  await migrateTable('master_shift');
  await migrateTable('roster_shift', 200);
  await migrateTable('presensi');
  await migrateTable('lembur');
  await migrateTable('perijinan_cuti');

  await linkUsersAndKaryawan();

  console.log('\n=== MIGRASI HR SELESAI 100% ===');
}

runMigration().catch(console.error);
