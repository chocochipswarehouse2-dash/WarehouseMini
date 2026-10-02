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

  // Group locations per invoice
  const invLocationsMap = new Map();
  for (const entry of aggregatedMap.values()) {
    if (!invLocationsMap.has(entry.invoice)) {
      invLocationsMap.set(entry.invoice, new Set());
    }
    invLocationsMap.get(entry.invoice).add(entry.lokasi);
  }

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

  // Fetch all database stock for all locations involved
  const allLocations = Array.from(new Set(
    Array.from(invLocationsMap.values()).flatMap(set => Array.from(set))
  ));

  const locationStockMap = new Map(); // lokasiUpper -> Map(skuUpper -> sisa_stok)
  for (const loc of allLocations) {
    locationStockMap.set(loc.toUpperCase(), new Map());
  }

  for (let i = 0; i < allLocations.length; i += 20) {
    const chunk = allLocations.slice(i, i + 20);
    const { data: stockRows } = await client
      .from('stok_real_fisik')
      .select('sku, nama_produk, size, lokasi, area, sisa_stok')
      .in('lokasi', chunk);

    if (stockRows) {
      stockRows.forEach(s => {
        const lKey = (s.lokasi || '').trim().toUpperCase();
        const skuKey = (s.sku || '').trim().toUpperCase();
        if (!locationStockMap.has(lKey)) locationStockMap.set(lKey, new Map());
        locationStockMap.get(lKey).set(skuKey, s);
      });
    }
  }

  // Full Location Reconciliation: Union of scanned SKUs and DB SKUs
  const unqueued = [];
  for (const inv of invoices) {
    const locations = invLocationsMap.get(inv) || new Set();
    for (const lokasi of locations) {
      const sysMap = locationStockMap.get(lokasi.toUpperCase()) || new Map();

      // Scanned items for this (inv, lokasi)
      const scannedForLoc = new Map();
      for (const entry of aggregatedMap.values()) {
        if (entry.invoice === inv && entry.lokasi.toUpperCase() === lokasi.toUpperCase()) {
          scannedForLoc.set(entry.sku.toUpperCase(), entry);
        }
      }

      const allSkus = new Set([...scannedForLoc.keys(), ...sysMap.keys()]);
      for (const sku of allSkus) {
        const dedupKey = `${inv.trim()}__${sku.trim().toUpperCase()}__${lokasi.trim().toUpperCase()}`;
        if (existingKeys.has(dedupKey)) continue;

        const scanEntry = scannedForLoc.get(sku);
        const sysEntry = sysMap.get(sku);

        const qty_fisik = scanEntry ? scanEntry.qty_fisik : 0;
        const qty_sistem = sysEntry ? Number(sysEntry.sisa_stok) || 0 : 0;
        const selisih = qty_fisik - qty_sistem;
        if (selisih === 0) continue; // equilibrium

        unqueued.push({
          invoice: inv,
          sku: sku,
          lokasi: lokasi,
          area: (sysEntry && sysEntry.area) || (scanEntry && scanEntry.area) || getAreaFromLokasi(lokasi),
          nama_produk: (sysEntry && sysEntry.nama_produk) || (scanEntry && scanEntry.nama_produk) || sku,
          size: (sysEntry && sysEntry.size) || (scanEntry && scanEntry.size) || '-',
          qty_sistem,
          qty_fisik,
          operator: (scanEntry && scanEntry.operator) || 'Operator WA',
          tanggal: (scanEntry && scanEntry.tanggal) || new Date().toISOString()
        });
      }
    }
  }

  console.log(`Unqueued distinct reconciled entries: ${unqueued.length}`);
  if (!unqueued.length) {
    console.log('All items already reconciled and queued!');
    return;
  }

  // Batch fetch master_produk for authorative metadata
  const skus = Array.from(new Set(unqueued.map(e => e.sku)));
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

  // Assemble queue items
  const queueToInsert = [];
  for (const entry of unqueued) {
    const selisih = entry.qty_fisik - entry.qty_sistem;
    if (selisih === 0) continue;

    const master = masterMap.get(entry.sku);
    const nama = master ? master.nama_produk : entry.nama_produk;
    const sz = master ? (master.size || '-') : entry.size;

    let alasan = `Selisih Opname (${selisih > 0 ? `+${selisih}` : selisih})`;
    if (entry.qty_fisik === 0 && entry.qty_sistem !== 0) {
      alasan = `Tidak Ditemukan Saat SO (Scan: 0, Sis: ${entry.qty_sistem})`;
    } else if (entry.qty_sistem === 0 && entry.qty_fisik !== 0) {
      alasan = `Barang Baru di Rak (Scan: ${entry.qty_fisik})`;
    } else if (entry.qty_sistem < 0) {
      alasan = `Koreksi Stok Minus (${selisih > 0 ? `+${selisih}` : selisih})`;
    }

    queueToInsert.push({
      sesi_id: entry.invoice,
      tanggal: entry.tanggal,
      sku: entry.sku,
      nama_produk: nama,
      size: sz,
      lokasi: entry.lokasi,
      area: entry.area,
      qty_sistem: entry.qty_sistem,
      qty_fisik: entry.qty_fisik,
      selisih,
      status: 'PENDING',
      jenis: 'Opname WA',
      alasan,
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
