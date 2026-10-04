const { createClient } = require('@supabase/supabase-js');

const c = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

function getStandardArea(lokasi) {
  const l = (lokasi || '').trim().toUpperCase();
  if (/^[ABCD]\d{3}$/.test(l)) return 'Warehouse';
  if (/^(CC|PMK|DF)\d{3}$/.test(l)) return 'Perbaikan';
  if (/^(TIKTOK|SHOPEE|STUDIO)$/.test(l)) return 'Blok F';
  if (/^(BELT|CARD|GIFT|BOX)\d{3}$/.test(l)) return 'Aksesoris';
  if (/^[RVZ]\d{3}$/.test(l)) return 'Kolian';
  if (/^X\d{3}$/.test(l)) return 'Transit';
  return 'Anomali';
}

async function run() {
  let from = 0;
  let stokData = [];
  while (true) {
    const { data, error } = await c.from('stok_real_fisik').select('*').range(from, from + 999);
    if (error) throw error;
    stokData = stokData.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  console.log('Total stok_real_fisik rows:', stokData.length);
  const nowIso = new Date().toISOString();
  const invoice = 'ADJ-CLEANUP-' + Date.now();

  const toAdjOut = [];
  
  for (const s of stokData) {
    const qty = Number(s.stok || s.sisa_stok || s.qty || 0);
    if (qty === 0) continue;

    const stdArea = getStandardArea(s.lokasi);
    // Jika area di sistem tidak sama dengan standar, ATAU jika areanya 'Anomali' (lokasi salah format)
    if (stdArea === 'Anomali' || s.area !== stdArea) {
      console.log(`Anomaly found: SKU=${s.sku}, Lokasi="${s.lokasi}", Area="${s.area}", Qty=${qty}. Standard Area should be: ${stdArea}`);
      
      // Jika qty positif, kita ADJ_OUT. Jika qty negatif, kita ADJ_IN supaya jadi 0.
      toAdjOut.push({
        type: qty > 0 ? 'ADJ_OUT' : 'ADJ_IN',
        invoice: invoice,
        sku: s.sku,
        nama_produk: s.nama_produk,
        size: s.size,
        area: s.area, // Pakai area lama supaya bisa menihilkan stok di area lama tersebut
        lokasi: s.lokasi,
        qty: Math.abs(qty),
        operator: 'System Clean Up',
        keterangan: 'Pembersihan anomali lokasi dan area sesuai instruksi',
        created_at: nowIso
      });
    }
  }

  console.log(`Total anomalies to clear: ${toAdjOut.length}`);
  
  if (toAdjOut.length > 0) {
    // Insert in batches of 500
    for (let i = 0; i < toAdjOut.length; i += 500) {
      const batch = toAdjOut.slice(i, i + 500);
      const { error } = await c.from('log_produk').insert(batch);
      if (error) {
        console.error('Failed to insert batch', error);
      } else {
        console.log(`Inserted batch ${i} to ${i + batch.length}`);
      }
    }
    console.log('Clean up finished.');
  } else {
    console.log('No anomalies to clean up.');
  }
}

run().catch(console.error);
