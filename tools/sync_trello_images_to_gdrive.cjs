/**
 * =============================================================================
 * SYNC TRELLO IMAGES TO GOOGLE DRIVE & UPDATE SUPABASE
 * =============================================================================
 * Mengunduh attachment foto dari Trello (dengan OAuth Authorization),
 * mengunggahnya ke Google Drive via Google Apps Script (GAS) Web App,
 * dan mencatat File ID serta CDN URL (lh3.googleusercontent.com/d/...)
 * ke tabel `public.trello_up_catalog` di Supabase.
 *
 * Penggunaan:
 *   node tools/sync_trello_images_to_gdrive.cjs                 (Semua artikel yang belum ada gdrive_image_url)
 *   node tools/sync_trello_images_to_gdrive.cjs --up "UP 306"  (Hanya untuk koleksi UP tertentu)
 *   node tools/sync_trello_images_to_gdrive.cjs --limit 20     (Batasi jumlah)
 *   node tools/sync_trello_images_to_gdrive.cjs --concurrency 3
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const TRELLO_KEY = 'd4d21774e001c525d41aabbbb9b9940a';
const TRELLO_TOKEN = 'ATTA24c8656d86fe6a0499a0e81d8c8f2f0f200ec6e7d52a9259646c1e84e03943ac56487FCC';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyFxfqoqJhrPJOioPxnmbGJTjTTAwli6b87lgOQCPFDOoCVt5EJg3NHZT56zI52rM63/exec';
const ROOT_FOLDER_ID = '1oFx9WFm8Ch_DlOxw66WRy4nH-kIAXwcw';

// Parse arguments
const args = process.argv.slice(2);
let upFilter = null;
let limitCount = null;
let concurrency = 3;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--up' && args[i + 1]) {
    upFilter = args[i + 1];
    i++;
  } else if (args[i] === '--limit' && args[i + 1]) {
    limitCount = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--concurrency' && args[i + 1]) {
    concurrency = parseInt(args[i + 1], 10);
    i++;
  }
}

/**
 * Unduh gambar dari Trello menggunakan OAuth Authorization header dengan retry
 */
async function downloadTrelloImage(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'Authorization': `OAuth oauth_consumer_key="${TRELLO_KEY}", oauth_token="${TRELLO_TOKEN}"`,
        'User-Agent': 'WMS-Image-Sync/1.0'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Trello HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          buffer,
          contentType: res.headers['content-type'] || 'image/webp'
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function downloadTrelloImageWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await downloadTrelloImage(url);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }
}

/**
 * Upload gambar base64 ke Google Drive via GAS
 */
async function uploadToGdrive(base64Data, fileName, subFolderName) {
  let fetchUrl = GAS_URL;
  if (!fetchUrl.includes('secret=')) {
    fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'secret=wms-webhook-secret-2026';
  }

  const payload = {
    base64File: base64Data,
    fileName: fileName,
    folderId: ROOT_FOLDER_ID,
    subFolderName: subFolderName || undefined,
    mimeType: 'image/webp'
  };

  const res = await fetch(fetchUrl, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
  });

  return await res.json();
}

/**
 * Simple concurrency pool
 */
async function asyncPool(limit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    if (limit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

async function main() {
  console.log('===============================================================');
  console.log('🚀 SINKRONISASI FOTO TRELLO KE GOOGLE DRIVE & SUPABASE');
  console.log('===============================================================');
  console.log(`Konfigurasi: concurrency=${concurrency}, upFilter=${upFilter || 'SEMUA'}, limit=${limitCount || 'SEMUA'}`);

  // Query Supabase untuk item yang belum punya gdrive_image_url
  let query = sb
    .from('trello_up_catalog')
    .select('id, card_name, item_code, item_name, up_code, list_name, trello_image_url')
    .not('trello_image_url', 'is', null)
    .or('gdrive_image_url.is.null,gdrive_image_url.eq.""');

  if (upFilter) {
    query = query.or(`up_code.ilike.%${upFilter}%,list_name.ilike.%${upFilter}%`);
  }

  // Prioritaskan koleksi paling baru
  query = query.order('created_at', { ascending: false });

  if (limitCount && limitCount > 0) {
    query = query.limit(limitCount);
  } else {
    query = query.limit(1000);
  }

  const { data: items, error } = await query;
  if (error) {
    console.error('❌ Gagal membaca Supabase:', error);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.log('✨ Tidak ada foto yang perlu disinkronkan. Semua sudah tersimpan di Google Drive!');
    return;
  }

  console.log(`📦 Ditemukan ${items.length} artikel yang perlu diupload ke Google Drive.\n`);

  let completed = 0;
  let succeeded = 0;
  let failed = 0;

  const processItem = async (item) => {
    const cleanItemCode = (item.item_code || 'ITEM').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanUpCode = (item.up_code || 'UP').replace(/[^a-zA-Z0-9 _-]/g, '_');
    const cleanCardId = item.id;
    const fileName = `${cleanUpCode}_${cleanItemCode}_${cleanCardId}.webp`;

    try {
      // 1. Unduh dari Trello (dengan auto-retry)
      const { buffer, contentType } = await downloadTrelloImageWithRetry(item.trello_image_url);
      const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;

      // Pacing ringan agar koneksi stabil
      await new Promise(r => setTimeout(r, 150));

      // 2. Upload ke Google Drive via GAS
      const gdriveRes = await uploadToGdrive(base64, fileName, item.up_code);

      if (gdriveRes.success && (gdriveRes.fileId || gdriveRes.id)) {
        const fileId = gdriveRes.fileId || gdriveRes.id;
        const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;

        // 3. Simpan ke Supabase
        const { error: sbError } = await sb
          .from('trello_up_catalog')
          .update({
            gdrive_file_id: fileId,
            gdrive_image_url: directUrl,
            gdrive_folder_name: item.up_code,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (sbError) {
          console.warn(`⚠️ [${completed + 1}/${items.length}] GDrive OK, tapi gagal update Supabase: ${item.item_code}`, sbError);
        } else {
          succeeded++;
          completed++;
          const kb = Math.round(buffer.length / 1024);
          console.log(`✅ [${completed}/${items.length}] (${item.up_code}) ${item.item_code} // ${item.item_name} -> GDrive ID: ${fileId} (${kb} KB)`);
          return;
        }
      } else {
        throw new Error(gdriveRes.error || 'Respon GAS tidak mengembalikan fileId');
      }
    } catch (err) {
      failed++;
      completed++;
      console.error(`❌ [${completed}/${items.length}] Gagal proses ${item.item_code || item.id} (${item.up_code}): ${err.message}`);
    }
  };

  await asyncPool(concurrency, items, processItem);

  console.log('\n===============================================================');
  console.log('🎉 SINKRONISASI SELESAI!');
  console.log(`Total Diproses: ${completed}`);
  console.log(`Berhasil: ${succeeded}`);
  console.log(`Gagal: ${failed}`);
  console.log('===============================================================');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

