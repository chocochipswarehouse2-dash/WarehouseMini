const { createClient } = require('@supabase/supabase-js');
const client = createClient('https://ilhqerecxbywqrhfpbbc.supabase.co', 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn');

function getAreaFromLokasi(lokasi) {
  if (!lokasi) return 'Warehouse';
  const l = lokasi.toUpperCase().trim();
  if (l.startsWith('PMK') || l.startsWith('P-') || l.includes('PERBAIKAN')) return 'Perbaikan';
  if (l.includes('STUDIO')) return 'Studio';
  if (l.includes('LIVE')) return 'Barang Live';
  if (l.startsWith('A')) return 'Blok A';
  if (l.startsWith('B')) return 'Blok B';
  if (l.startsWith('C')) return 'Blok C';
  if (l.startsWith('D')) return 'Blok D';
  if (l.startsWith('E')) return 'Blok E';
  if (l.startsWith('F') || l.includes('SHOPEE') || l.includes('TIKTOK')) return 'Blok F';
  if (l.startsWith('G')) return 'Blok G';
  return 'Warehouse';
}

async function runSync() {
  console.log('--- SYNCING SO LOGS TO QUEUE ---');
  // 1. Fetch recent SO scan logs (past 24h)
  const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: soLogs, error: logErr } = await client
    .from('log_produk')
    .select('*')
    .eq('type', 'SO')
    .gte('created_at', sinceDate)
    .order('created_at', { ascending: false });

  if (logErr) {
    console.error('Error fetching SO logs:', logErr);
    return;
  }

  console.log(`Found ${soLogs ? soLogs.length : 0} SO logs in past 24h.`);
  if (!soLogs || !soLogs.length) return;

  // Group by (invoice, sku, lokasi)
  const aggregatedMap = new Map();
  for (const log of soLogs) {
    if (!log.invoice || !log.sku) continue;
    const inv = log.invoice.trim();
    const sku = log.sku.trim().toUpperCase();
    const lok = (log.lokasi || 'Warehouse').trim().toUpperCase();
    const key = `${inv}__${sku}__${lok}`;

    if (!aggregatedMap.has(key)) {
      aggregatedMap.set(key, {
        invoice: inv,
        sku: sku,
        lokasi: log.lokasi || 'Warehouse',
        area: log.area || getAreaFromLokasi(log.lokasi),
        nama_produk: log.nama_produk || sku,
        size: log.size || '-',
        qty_fisik: 0,
        operator: log.operator || 'Operator WA',
        tanggal: log.created_at,
      });
    }
    aggregatedMap.get(key).qty_fisik += Number(log.qty) || 0;
  }

  const invoices = Array.from(new Set(Array.from(aggregatedMap.values()).map(v => v.invoice)));
  console.log(`Checking ${invoices.length} invoices:`, invoices);

  // Check existing in stock_opname_queue
  const existingKeys = new Set();
  for (let i = 0; i < invoices.length; i += 20) {
    const chunk = invoices.slice(i, i + 20);
    const { data: existingRows } = await client
      .from('stock_opname_queue')
      .select('invoice, sku, lokasi')
      .in('invoice', chunk);

    if (existingRows) {
      existingRows.forEach(r => {
        const k = `${(r.invoice || '').trim()}__${(r.sku || '').trim().toUpperCase()}__${(r.lokasi || '').trim().toUpperCase()}`;
        existingKeys.add(k);
      });
    }
  }

  const unqueued = Array.from(aggregatedMap.entries())
    .filter(([k]) => !existingKeys.has(k))
    .map(([, entry]) => entry);

  console.log(`Unqueued distinct entries: ${unqueued.length}`);
  if (!unqueued.length) {
    console.log('All items already queued!');
    return;
  }

  // Batch fetch live stock from stok_real_fisik
  const skus = Array.from(new Set(unqueued.map(e => e.sku)));
  const stockMap = new Map();
  for (let i = 0; i < skus.length; i += 100) {
    const chunk = skus.slice(i, i + 100);
    const { data: stockRows } = await client
      .from('stok_real_fisik')
      .select('sku, lokasi, sisa_stok')
      .in('sku', chunk);

    if (stockRows) {
      stockRows.forEach(s => {
        const k = `${(s.sku || '').trim().toUpperCase()}__${(s.lokasi || '').trim().toUpperCase()}`;
        stockMap.set(k, Number(s.sisa_stok) || 0);
      });
    }
  }

  // Batch fetch master_produk
  const masterMap = new Map();
  for (let i = 0; i < skus.length; i += 100) {
    const chunk = skus.slice(i, i + 100);
    const { data: mRows } = await client
      .from('master_produk')
      .select('sku, nama_produk, size')
      .in('sku', chunk);

    if (mRows) {
      mRows.forEach(m => {
        masterMap.set((m.sku || '').trim().toUpperCase(), m);
      });
    }
  }

  // Assemble queue items (only discrepant items selisih !== 0)
  const queueToInsert = [];
  let matchingCount = 0;
  for (const entry of unqueued) {
    const stockKey = `${entry.sku}__${entry.lokasi.toUpperCase()}`;
    const qty_sistem = stockMap.get(stockKey) || 0;
    const selisih = entry.qty_fisik - qty_sistem;

    if (selisih === 0) {
      matchingCount++;
      continue;
    }

    const master = masterMap.get(entry.sku);
    const nama = master ? master.nama_produk : entry.nama_produk;
    const sz = master ? (master.size || '-') : entry.size;

    queueToInsert.push({
      sesi_id: entry.invoice,
      tanggal: entry.tanggal,
      sku: entry.sku,
      nama_produk: nama,
      size: sz,
      lokasi: entry.lokasi,
      area: entry.area || getAreaFromLokasi(entry.lokasi),
      qty_sistem,
      qty_fisik: entry.qty_fisik,
      selisih,
      status: 'PENDING',
      jenis: 'Opname WA',
      alasan: `Selisih Opname (${selisih > 0 ? `+${selisih}` : selisih})`,
      operator: entry.operator,
      invoice: entry.invoice
    });
  }

  console.log(`Ready to insert: ${queueToInsert.length} items (${matchingCount} items matching/selisih 0).`);

  if (queueToInsert.length > 0) {
    for (let i = 0; i < queueToInsert.length; i += 100) {
      const chunk = queueToInsert.slice(i, i + 100);
      const { data: insData, error: insErr } = await client
        .from('stock_opname_queue')
        .insert(chunk);
      if (insErr) {
        console.error('Error inserting to queue:', insErr);
      } else {
        console.log(`Inserted chunk of ${chunk.length} items successfully.`);
      }
    }
  }

  console.log('✅ SYNC COMPLETE!');
}

runSync();
