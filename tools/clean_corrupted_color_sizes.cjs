const { createClient } = require('@supabase/supabase-js');

const url = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const key = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const supabase = createClient(url, key);

const KNOWN_2LETTER_COLOR_CODES = new Set([
  'YL', 'OL', 'VL', 'PL', 'SL', 'CL', 'TL', 'GL', 'BL', 'NL', 'RL', 'EL', 'KL', 'ML',
  'EM', 'CM', 'DM', 'LM', 'BM', 'PM', 'SM', 'TM', 'GM', 'KM',
  'BS', 'WS', 'NS', 'HS', 'RS', 'CS', 'GS', 'MS', 'SS', 'TS', 'KS'
]);

function isCorruptedColorCodeSize(sku, size) {
  if (!sku || !size) return false;
  const cleanSku = String(sku).trim().toUpperCase();
  const cleanSize = String(size).trim().toUpperCase();

  if (cleanSize !== 'S' && cleanSize !== 'M' && cleanSize !== 'L') return false;
  if (/[-_/\s.](S|M|L)$/i.test(cleanSku)) return false;
  if (cleanSku.length < 4) return false;

  const suf2 = cleanSku.slice(-2);
  if (KNOWN_2LETTER_COLOR_CODES.has(suf2) && suf2.endsWith(cleanSize)) {
    return true;
  }
  return false;
}

(async () => {
  console.log('1. Membaca seluruh data master_produk dari Supabase...');
  let all = [], offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('master_produk')
      .select('sku, nama_produk, size')
      .range(offset, offset + 999);

    if (error) {
      console.error('Error fetching batch at offset', offset, error);
      break;
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    offset += 1000;
    if (data.length < 1000) break;
  }

  console.log(`Total produk di database: ${all.length} produk.`);

  const toClean = all.filter(r => isCorruptedColorCodeSize(r.sku, r.size));
  console.log(`Ditemukan ${toClean.length} produk dengan size tercemar kode warna (YL, OL, CM, dll.).`);

  if (toClean.length === 0) {
    console.log('Database sudah bersih, tidak ada yang perlu diupdate.');
    return;
  }

  console.log('\nContoh 10 produk yang akan dikoreksi ke "Default":');
  toClean.slice(0, 10).forEach(c => console.log(`- ${c.sku} | ${c.nama_produk} (Size saat ini: ${c.size} -> Default)`));

  console.log(`\n2. Memulai update batch ${toClean.length} produk ke size 'Default'...`);
  const BATCH_SIZE = 50;
  let updatedCount = 0;

  for (let i = 0; i < toClean.length; i += BATCH_SIZE) {
    const chunk = toClean.slice(i, i + BATCH_SIZE);
    const promises = chunk.map(item =>
      supabase
        .from('master_produk')
        .update({ size: 'Default', updated_at: new Date().toISOString() })
        .eq('sku', item.sku)
    );

    const results = await Promise.all(promises);
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.warn(`Ada ${errors.length} error pada chunk ${i}:`, errors[0].error);
    }
    updatedCount += (chunk.length - errors.length);
    process.stdout.write(`\rProgres update: ${updatedCount} / ${toClean.length} produk...`);
  }

  console.log(`\n\n✅ SELESAI! Berhasil mengoreksi ${updatedCount} produk di master_produk Supabase menjadi 'Default'.`);
})();

