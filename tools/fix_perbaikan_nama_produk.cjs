/**
 * FIX: Repair nama_produk di perbaikan_tickets
 * 
 * Masalah: Tiket-tiket yang ada menyimpan nama_produk = SKU (bukan nama produk asli)
 * Solusi: Lookup dari master_produk berdasarkan SKU, lalu update tiket yang salah.
 * 
 * Cara jalankan:
 *   node tools/fix_perbaikan_nama_produk.cjs
 */

const { createClient } = require('@supabase/supabase-js');

const NEW_URL = 'https://atdedxyiielpmzjlnriv.supabase.co';
const NEW_KEY = 'sb_publishable_ZoVorqMTbLr9Fj3jif5M3Q_lnuzi0bb';
const client = createClient(NEW_URL, NEW_KEY, { auth: { persistSession: false } });

const PAGE_SIZE = 1000;

async function fetchAll(table, query = '') {
  const rows = [];
  let offset = 0;
  while (true) {
    const url = `order=id.asc&limit=${PAGE_SIZE}&offset=${offset}` + (query ? `&${query}` : '');
    const { data, error } = await client.from(table).select('*').order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error(`Error fetching ${table}:`, error.message); break; }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  console.log('=== FIX: nama_produk di perbaikan_tickets ===\n');

  // 1. Ambil semua tiket yang nama_produk = sku (artinya belum diisi)
  console.log('1. Mengambil semua perbaikan_tickets...');
  const allTickets = await fetchAll('perbaikan_tickets');
  const badTickets = allTickets.filter(t => {
    const sku = String(t.sku || '').trim().toUpperCase();
    const nama = String(t.nama_produk || '').trim().toUpperCase();
    // Nama produk = SKU berarti belum diisi
    return sku && nama === sku;
  });

  console.log(`   Total tiket: ${allTickets.length}`);
  console.log(`   Tiket yang perlu diperbaiki (nama = SKU): ${badTickets.length}`);

  if (badTickets.length === 0) {
    console.log('\n✅ Semua tiket sudah punya nama produk yang benar!');
    return;
  }

  // 2. Kumpulkan SKU yang perlu di-lookup
  const skuSet = new Set(badTickets.map(t => String(t.sku || '').trim().toUpperCase()));
  const skuList = Array.from(skuSet);
  console.log(`\n2. Mencari nama produk untuk ${skuList.length} SKU unik di master_produk...`);

  // Fetch master_produk dalam batch
  const skuToNama = {};
  const batchSize = 100;
  for (let i = 0; i < skuList.length; i += batchSize) {
    const batch = skuList.slice(i, i + batchSize);
    const { data, error } = await client
      .from('master_produk')
      .select('sku, nama_produk')
      .in('sku', batch);
    
    if (error) {
      console.warn(`   Batch ${i}-${i+batchSize} error:`, error.message);
      continue;
    }
    if (data) {
      data.forEach(row => {
        if (row.sku && row.nama_produk) {
          skuToNama[row.sku.toUpperCase()] = row.nama_produk;
        }
      });
    }
    process.stdout.write(`   Progress: ${Math.min(i + batchSize, skuList.length)}/${skuList.length} SKU diperiksa\r`);
  }
  console.log(`\n   Ditemukan nama untuk ${Object.keys(skuToNama).length} SKU di master_produk`);

  // 3. Update tiket satu per satu (atau batch berdasarkan id)
  console.log('\n3. Memperbarui nama_produk di perbaikan_tickets...');
  let updated = 0;
  let notFound = 0;

  for (const ticket of badTickets) {
    const skuKey = String(ticket.sku || '').trim().toUpperCase();
    const realNama = skuToNama[skuKey];

    if (!realNama) {
      notFound++;
      continue;
    }

    const { error } = await client
      .from('perbaikan_tickets')
      .update({ nama_produk: realNama })
      .eq('id', ticket.id);

    if (error) {
      console.warn(`   Gagal update id=${ticket.id} (${skuKey}):`, error.message);
    } else {
      updated++;
      if (updated % 100 === 0) {
        process.stdout.write(`   Updated: ${updated} / ${badTickets.length}\r`);
      }
    }
  }

  console.log(`\n\n✅ Selesai!`);
  console.log(`   Berhasil diperbaiki : ${updated} tiket`);
  console.log(`   SKU tidak ada di master: ${notFound} tiket`);
  console.log(`\nRefresh halaman Perbaikan/ACC Defect di aplikasi untuk melihat hasilnya.`);
}

main().catch(console.error);
