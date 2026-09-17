const { createClient } = require('@supabase/supabase-js');

const OLD_URL = 'https://vxongwtxmhjixhzeoidp.supabase.co';
const OLD_KEY = 'sb_publishable_XFvjJipUzyi0EuM_tDTTsg_ll7TJ7rA';

const NEW_URL = 'https://atdedxyiielpmzjlnriv.supabase.co';
const NEW_KEY = 'sb_publishable_ZoVorqMTbLr9Fj3jif5M3Q_lnuzi0bb';

const oldClient = createClient(OLD_URL, OLD_KEY);
const newClient = createClient(NEW_URL, NEW_KEY);

async function syncTodayScans() {
  console.log('1. Mengambil data scan hari ini dari Supabase lama...');
  const { data: oldScans, error: errOld } = await oldClient
    .from('log_produk')
    .select('*')
    .gte('created_at', '2026-09-17T00:00:00+07:00')
    .order('created_at', { ascending: true });

  if (errOld) {
    console.error('Error fetch old scans:', errOld);
    return;
  }

  console.log(`Ditemukan ${oldScans.length} baris scan hari ini (17 Sep 2026):`);
  const invoices = [...new Set(oldScans.map(s => s.invoice))];
  console.log('Invoices:', invoices);

  // Pastikan master_produk untuk SKU-SKU ini ada di Supabase baru
  const skus = [...new Set(oldScans.map(s => s.sku))];
  console.log(`\n2. Memeriksa ${skus.length} SKU di master_produk Supabase baru...`);
  const { data: existingMaster } = await newClient
    .from('master_produk')
    .select('sku')
    .in('sku', skus);

  const existingSet = new Set((existingMaster || []).map(m => m.sku));
  const missingSkus = skus.filter(s => !existingSet.has(s));

  if (missingSkus.length > 0) {
    console.log(`Menyalin ${missingSkus.length} SKU yang belum ada di master_produk...`);
    const { data: oldMasterRows } = await oldClient
      .from('master_produk')
      .select('*')
      .in('sku', missingSkus);

    if (oldMasterRows && oldMasterRows.length > 0) {
      const { error: insMasterErr } = await newClient
        .from('master_produk')
        .upsert(oldMasterRows, { onConflict: 'sku' });

      if (insMasterErr) {
        console.error('Error upsert master_produk:', insMasterErr);
      } else {
        console.log(`✅ Berhasil menyalin ${oldMasterRows.length} produk ke master_produk baru!`);
      }
    }
  }

  // 3. Masukkan record scan ke log_produk baru tanpa memaksa id (biarkan auto serial)
  console.log('\n3. Memasukkan riwayat scan ke log_produk Supabase baru...');
  const payloadToInsert = oldScans.map(row => {
    return {
      type: row.type,
      invoice: row.invoice,
      sku: row.sku,
      nama_produk: row.nama_produk || row.sku,
      size: row.size || '-',
      area: row.area || 'Warehouse',
      lokasi: row.lokasi || '-',
      qty: row.qty || 1,
      operator: row.operator || 'WhatsApp',
      keterangan: row.keterangan || row.type,
      raw_payload: row.raw_payload || {},
      created_at: row.created_at
    };
  });

  const { data: inserted, error: insErr } = await newClient
    .from('log_produk')
    .insert(payloadToInsert)
    .select('id, type, sku, invoice, created_at');

  if (insErr) {
    console.error('❌ Gagal insert ke log_produk baru:', insErr);
  } else {
    console.log(`✅ BERHASIL! ${inserted.length} baris riwayat scan WA berhasil dimasukkan ke Supabase baru:`);
    inserted.forEach(i => {
      console.log(`  - [ID: ${i.id}] [${i.type}] ${i.invoice} | ${i.sku}`);
    });
  }
}

syncTodayScans();
