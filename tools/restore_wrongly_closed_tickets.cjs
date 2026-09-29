const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://atdedxyiielpmzjlnriv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZoVorqMTbLr9Fj3jif5M3Q_lnuzi0bb';

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('1. Membaca SELURUH data stok real fisik (dengan pagination)...');
  const allStock = new Map();
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from('stok_real_fisik')
      .select('sku, lokasi, sisa_stok')
      .gt('sisa_stok', 0)
      .range(offset, offset + 999);
    if (error || !data || data.length === 0) break;
    data.forEach(s => {
      const key = (s.sku || '').toUpperCase() + '||' + (s.lokasi || '').toUpperCase();
      allStock.set(key, (allStock.get(key) || 0) + (s.sisa_stok || 0));
    });
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`Total data stok fisik tersimpan: ${allStock.size} kombinasi SKU+Lokasi.`);

  console.log('2. Mencari tiket yang salah ditutup padahal fisiknya masih ada...');
  let tOffset = 0;
  const dfIds = [];
  const ccIds = [];
  const pmkIds = [];

  while (true) {
    const { data, error } = await client
      .from('perbaikan_tickets')
      .select('id, ticket_no, sku, lokasi_sekarang, tahap, status_pengerjaan')
      .ilike('reparasi_catatan', '%Ditutup otomatis (Aman): Barang sudah tidak ada di seluruh gudang.%')
      .range(tOffset, tOffset + 999);
    if (error || !data || data.length === 0) break;
    data.forEach(t => {
      const key = (t.sku || '').toUpperCase() + '||' + (t.lokasi_sekarang || '').toUpperCase();
      if (allStock.has(key)) {
        const loc = (t.lokasi_sekarang || '').toUpperCase();
        if (loc.startsWith('DF') || loc.includes('DEFECT')) {
          dfIds.push(t.id);
        } else if (loc.startsWith('CC') || loc.includes('CUCI')) {
          ccIds.push(t.id);
        } else if (loc.startsWith('PMK') || loc.includes('PERMAK')) {
          pmkIds.push(t.id);
        }
      }
    });
    if (data.length < 1000) break;
    tOffset += 1000;
  }

  console.log(`Ditemukan tiket yang harus dipulihkan: DF=${dfIds.length}, CC=${ccIds.length}, PMK=${pmkIds.length}`);

  // Helper batch update
  async function batchUpdate(ids, payload, label) {
    console.log(`Memulihkan ${ids.length} tiket untuk ${label}...`);
    const chunkSize = 100;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error } = await client
        .from('perbaikan_tickets')
        .update(payload)
        .in('id', chunk);
      if (error) {
        console.error(`Error updating chunk ${i}-${i + chunkSize} for ${label}:`, error);
      } else {
        process.stdout.write(`.`);
      }
    }
    console.log(` Selesai ${label}!`);
  }

  if (dfIds.length > 0) {
    await batchUpdate(dfIds, { tahap: 'DEFECT', status_pengerjaan: 'GAGAL', reparasi_catatan: '' }, 'DEFECT (DF)');
  }
  if (ccIds.length > 0) {
    await batchUpdate(ccIds, { tahap: 'CUCI', status_pengerjaan: 'SEDANG_PROSES', reparasi_catatan: '' }, 'CUCI (CC)');
  }
  if (pmkIds.length > 0) {
    await batchUpdate(pmkIds, { tahap: 'PERMAK', status_pengerjaan: 'SEDANG_PROSES', reparasi_catatan: '' }, 'PERMAK (PMK)');
  }

  console.log('\n=== PEMULIHAN TIKET BERHASIL SELESAI ===');
}

main().catch(console.error);
