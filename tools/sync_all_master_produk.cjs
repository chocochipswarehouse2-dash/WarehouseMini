const { createClient } = require('@supabase/supabase-js');

const OLD_URL = 'https://vxongwtxmhjixhzeoidp.supabase.co';
const OLD_KEY = 'sb_publishable_XFvjJipUzyi0EuM_tDTTsg_ll7TJ7rA';

const NEW_URL = 'https://atdedxyiielpmzjlnriv.supabase.co';
const NEW_KEY = 'sb_publishable_ZoVorqMTbLr9Fj3jif5M3Q_lnuzi0bb';

const oldClient = createClient(OLD_URL, OLD_KEY);
const newClient = createClient(NEW_URL, NEW_KEY);

async function syncAllMasterProduk() {
  console.log('Memeriksa total data master_produk di kedua database...');

  const { count: oldCount, error: errOldCount } = await oldClient
    .from('master_produk')
    .select('*', { count: 'exact', head: true });

  const { count: newCount, error: errNewCount } = await newClient
    .from('master_produk')
    .select('*', { count: 'exact', head: true });

  console.log(`Database Lama: ${oldCount} produk | Database Baru: ${newCount} produk`);

  const BATCH_SIZE = 1000;
  let offset = 0;
  let totalCopied = 0;

  while (offset < oldCount) {
    const { data: chunk, error: chunkErr } = await oldClient
      .from('master_produk')
      .select('*')
      .range(offset, offset + BATCH_SIZE - 1)
      .order('sku', { ascending: true });

    if (chunkErr || !chunk || chunk.length === 0) {
      console.error('Error or empty chunk at offset', offset, chunkErr);
      break;
    }

    const { error: upsertErr } = await newClient
      .from('master_produk')
      .upsert(chunk, { onConflict: 'sku', ignoreDuplicates: true });

    if (upsertErr) {
      console.error(`Gagal upsert batch ${offset}-${offset + chunk.length}:`, upsertErr);
    } else {
      totalCopied += chunk.length;
      process.stdout.write(`Disalin: ${totalCopied} / ${oldCount} produk (${Math.round((totalCopied / oldCount) * 100)}%)\r`);
    }

    offset += BATCH_SIZE;
  }

  const { count: finalCount } = await newClient
    .from('master_produk')
    .select('*', { count: 'exact', head: true });

  console.log(`\n✅ Selesai! Total master_produk di database baru sekarang: ${finalCount} produk.`);
}

syncAllMasterProduk();
