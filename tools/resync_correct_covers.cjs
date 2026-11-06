/**
 * =============================================================================
 * RESYNC CORRECT TRELLO COVERS TO SUPABASE & GDRIVE (CONCURRENT POOL)
 * =============================================================================
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const TRELLO_KEY = 'd4d21774e001c525d41aabbbb9b9940a';
const TRELLO_TOKEN = 'ATTA24c8656d86fe6a0499a0e81d8c8f2f0f200ec6e7d52a9259646c1e84e03943ac56487FCC';
const BOARD_ID = 'zCN7H9VD';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyFxfqoqJhrPJOioPxnmbGJTjTTAwli6b87lgOQCPFDOoCVt5EJg3NHZT56zI52rM63/exec';
const ROOT_FOLDER_ID = '1oFx9WFm8Ch_DlOxw66WRy4nH-kIAXwcw';

function isImageAttachment(att) {
  if (!att) return false;
  return (
    att.mimeType?.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|gif)$/i.test(att.name || att.url || '')
  );
}

function getBestPreview(att) {
  if (!att) return null;
  if (att.previews && att.previews.length > 0) {
    const good = att.previews.find(p => p.width >= 600) || att.previews[att.previews.length - 1];
    return good ? good.url : att.url;
  }
  return att.url;
}

function chooseBestAttachment(card) {
  if (!card.attachments || card.attachments.length === 0) return null;

  const coverId = card.idAttachmentCover || card.cover?.idAttachment;
  let chosen = null;

  // 1. Cek cover resmi Trello jika berupa gambar
  if (coverId) {
    const matched = card.attachments.find(a => a.id === coverId);
    if (matched && isImageAttachment(matched)) {
      chosen = matched;
    }
  }

  // 2. Jika tidak ada cover resmi, cari attachment gambar yang BUKAN "BELUM ADA SAMPLE"
  if (!chosen) {
    const realAtts = card.attachments.filter(a =>
      isImageAttachment(a) && !/BELUM.*SAMPLE/i.test(a.name || '')
    );
    if (realAtts.length > 0) {
      chosen = realAtts[realAtts.length - 1];
    }
  }

  // 3. Fallback ke gambar apapun
  if (!chosen) {
    chosen = card.attachments.find(isImageAttachment) || card.attachments[card.attachments.length - 1];
  }

  return chosen;
}

function downloadTrelloImage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'Authorization': `OAuth oauth_consumer_key="${TRELLO_KEY}", oauth_token="${TRELLO_TOKEN}"`,
        'User-Agent': 'WMS-TrelloSync/2.0'
      }
    };

    const req = https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadTrelloImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
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
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
}

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
  console.log('Fetching cards from Trello...');
  const trelloUrl = `https://api.trello.com/1/boards/${BOARD_ID}/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}&attachments=true&fields=name,idList,pos,desc,badges,cover,idAttachmentCover`;
  
  const trelloRes = await fetch(trelloUrl);
  if (!trelloRes.ok) throw new Error('Failed to fetch cards: ' + trelloRes.status);
  const cards = await trelloRes.json();
  console.log('Total Trello cards:', cards.length);

  // Ambil semua data katalog dari Supabase
  console.log('Fetching supabase trello_up_catalog...');
  const { data: dbItems, error: dbErr } = await sb.from('trello_up_catalog').select('id, card_name, item_code, up_code, list_name, trello_image_url, gdrive_image_url');
  if (dbErr) throw dbErr;
  console.log('Total Supabase records:', dbItems.length);

  const dbMap = new Map();
  dbItems.forEach(item => dbMap.set(item.id, item));

  const itemsToUpdate = [];

  for (const card of cards) {
    const bestAtt = chooseBestAttachment(card);
    if (!bestAtt) continue;

    const bestUrl = getBestPreview(bestAtt);
    const dbItem = dbMap.get(card.id);

    if (!dbItem) continue;

    const currentIsBelumSample = /BELUM.*SAMPLE/i.test(dbItem.trello_image_url || '') || /BELUM.*SAMPLE/i.test(dbItem.gdrive_image_url || '');
    const newIsNotBelumSample = !/BELUM.*SAMPLE/i.test(bestAtt.name || '');

    const urlChanged = dbItem.trello_image_url !== bestUrl;
    
    if (urlChanged || (currentIsBelumSample && newIsNotBelumSample)) {
      itemsToUpdate.push({
        cardId: card.id,
        cardName: card.name,
        upCode: dbItem.up_code,
        listName: dbItem.list_name,
        itemCode: dbItem.item_code,
        oldUrl: dbItem.trello_image_url,
        newUrl: bestUrl,
        attName: bestAtt.name,
        isPriority: currentIsBelumSample && newIsNotBelumSample
      });
    }
  }

  // Prioritaskan: 
  // 1. UP 331 paling atas (karena user sedang memeriksa UP 331)
  // 2. Yang sebelumnya "BELUM ADA SAMPLE" tapi sekarang ada foto
  itemsToUpdate.sort((a, b) => {
    const aIsUp331 = a.upCode?.includes('331') || a.listName?.includes('331');
    const bIsUp331 = b.upCode?.includes('331') || b.listName?.includes('331');
    if (aIsUp331 && !bIsUp331) return -1;
    if (!aIsUp331 && bIsUp331) return 1;
    if (a.isPriority && !b.isPriority) return -1;
    if (!a.isPriority && b.isPriority) return 1;
    return 0;
  });

  console.log(`\n🔍 Ditemukan ${itemsToUpdate.length} kartu yang perlu disinkronkan ke cover asli!`);
  
  itemsToUpdate.slice(0, 10).forEach(item => {
    console.log(`-> [${item.upCode}] ${item.cardName}: ganti ke "${item.attName}" (Priority: ${item.isPriority ? 'HIGH' : 'NORMAL'})`);
  });

  if (itemsToUpdate.length === 0) {
    console.log('Semua cover sudah sinkron!');
    return;
  }

  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  const total = itemsToUpdate.length;

  const processItem = async (item) => {
    const cleanItemCode = (item.itemCode || 'ITEM').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanUpCode = (item.upCode || 'UP').replace(/[^a-zA-Z0-9 _-]/g, '_');
    const fileName = `${cleanUpCode}_${cleanItemCode}_${item.cardId}.webp`;

    try {
      const { buffer, contentType } = await downloadTrelloImageWithRetry(item.newUrl);
      const base64 = `data:${contentType};base64,${buffer.toString('base64')}`;

      await new Promise(r => setTimeout(r, 100));

      const gdriveRes = await uploadToGdrive(base64, fileName, item.upCode);
      if (gdriveRes.success && (gdriveRes.fileId || gdriveRes.id)) {
        const fileId = gdriveRes.fileId || gdriveRes.id;
        const cdnUrl = `https://lh3.googleusercontent.com/d/${fileId}`;

        await sb
          .from('trello_up_catalog')
          .update({
            trello_image_url: item.newUrl,
            gdrive_image_url: cdnUrl,
            gdrive_file_id: fileId,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.cardId);

        succeeded++;
      } else {
        failed++;
        console.error(`❌ GDrive fail ${item.cardName}:`, gdriveRes.error);
      }
    } catch (err) {
      failed++;
      console.error(`❌ Error ${item.cardName}:`, err.message);
    } finally {
      completed++;
      if (completed % 10 === 0 || completed === total || completed <= 10) {
        console.log(`[${completed}/${total}] (${Math.round((completed/total)*100)}%) Berhasil: ${succeeded}, Gagal: ${failed}`);
      }
    }
  };

  console.log(`\nMenjalankan concurrent pool (4 worker)...`);
  await asyncPool(4, itemsToUpdate, processItem);
  console.log(`\n🎉 Selesai! Total: ${total}, Berhasil: ${succeeded}, Gagal: ${failed}`);
}

main().catch(console.error);
