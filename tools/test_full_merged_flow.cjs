const { createClient } = require('@supabase/supabase-js');
const url = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const key = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const supabase = createClient(url, key);

async function testMergedFlow() {
  const targetChannelLocations = [
    'TIKTOK', 'Tiktok', 'tiktok',
    'SHOPEE', 'Shopee', 'shopee',
    'STUDIO', 'Studio', 'studio',
    'BLOK F', 'Blok F',
    'LIVE SHOPEE', 'LIVE TIKTOK', 'SAMPLE', 'FOTO'
  ];

  console.time('fetch_channel');
  const [resLoc, resArea] = await Promise.all([
    supabase
      .from('stok_real_fisik')
      .select('sku, nama_produk, size, lokasi, area, sisa_stok')
      .in('lokasi', targetChannelLocations)
      .neq('sisa_stok', 0),
    supabase
      .from('stok_real_fisik')
      .select('sku, nama_produk, size, lokasi, area, sisa_stok')
      .eq('area', 'Blok F')
      .neq('sisa_stok', 0)
  ]);
  console.timeEnd('fetch_channel');

  const channelRows = [...(resLoc.data || []), ...(resArea.data || [])];
  console.log('Channel rows fetched:', channelRows.length);

  const channelMap = new Map();
  for (const r of channelRows) {
    const sku = String(r.sku || '').trim().toUpperCase();
    const lok = String(r.lokasi || 'BLOK F').trim().toUpperCase();
    if (!sku) continue;
    const key = `${sku}__${lok}`;
    if (!channelMap.has(key)) {
      channelMap.set(key, r);
    }
  }

  // Suppose warehouse has mock rows
  const warehouseRows = [
    { sku: 'C25CBH240BA', lokasi: 'A012', area: 'Warehouse', sisa_stok: 5, nama_produk: 'Enchanted Skirt Black', size: 'Default' },
    { sku: 'DUMMY123', lokasi: 'B005', area: 'Warehouse', sisa_stok: 10, nama_produk: 'Other Product', size: 'M' }
  ];

  const allRowsMap = new Map();
  for (const w of warehouseRows) {
    const sku = String(w.sku || '').trim().toUpperCase();
    const lok = String(w.lokasi || 'Warehouse').trim().toUpperCase();
    if (!sku) continue;
    allRowsMap.set(`${sku}__${lok}`, w);
  }

  for (const [k, c] of channelMap.entries()) {
    allRowsMap.set(k, c);
  }

  const stockMap = new Map();
  for (const r of allRowsMap.values()) {
    const sku = String(r.sku || '').trim().toUpperCase();
    const nama = String(r.nama_produk || sku).trim();
    const size = String(r.size || '-').trim();
    const lok = String(r.lokasi || 'BLOK F').trim();
    const area = String(r.area || 'Blok F').trim();
    const sisa = Number(r.sisa_stok || 0);

    if (!stockMap.has(sku)) {
      stockMap.set(sku, {
        sku,
        produk: nama,
        size: size || 'ALL',
        locations: new Map(),
      });
    }
    const entry = stockMap.get(sku);
    if (entry.produk === sku && nama !== sku) entry.produk = nama;
    if ((!entry.size || entry.size === 'ALL' || entry.size === '-') && size && size !== '-') entry.size = size;

    const lokKey = `${lok.toUpperCase()}__${area.toUpperCase()}`;
    const prev = entry.locations.get(lokKey)?.qty || 0;
    entry.locations.set(lokKey, { lokasi: lok, area, qty: prev + sisa });
  }

  const channelStockList = [];
  for (const entry of stockMap.values()) {
    let studioQty = 0;
    let shpQty = 0;
    let ttkQty = 0;
    let blokFQty = 0;
    let whQty = 0;
    let totalQty = 0;

    const locParts = [];
    const whLocParts = [];

    for (const locInfo of entry.locations.values()) {
      const q = Math.max(0, locInfo.qty);
      const lokName = locInfo.lokasi.trim();
      const lokUpper = lokName.toUpperCase();
      const areaUpper = locInfo.area.toUpperCase();

      totalQty += q;

      const isShopee = lokUpper.includes('SHOPEE') || lokUpper.includes('SHP') || lokUpper.includes('LIVE SHOPEE') || areaUpper.includes('SHOPEE');
      const isTikTok = lokUpper.includes('TIKTOK') || lokUpper === 'TTK' || lokUpper === 'TT' || lokUpper.includes('LIVE TIKTOK') || areaUpper.includes('TIKTOK');
      const isBlokF = lokUpper.includes('BLOK F') || areaUpper.includes('BLOK F') || lokUpper.startsWith('F-');
      
      let isStudio = lokUpper.includes('STUDIO') || lokUpper === 'SAMPLE' || lokUpper === 'LIVE' || lokUpper.includes('FOTO') || areaUpper.includes('STUDIO');
      if (isBlokF && !isShopee && !isTikTok) {
        isStudio = true;
      }
      const isWh = !isStudio && !isShopee && !isTikTok && !isBlokF;

      if (isStudio) studioQty += q;
      if (isShopee) shpQty += q;
      if (isTikTok) ttkQty += q;
      if (isBlokF) blokFQty += q;
      if (isWh) {
        whQty += q;
        if (q > 0) whLocParts.push(lokName);
      }

      if (q > 0) {
        const areaLabel = isBlokF && !lokUpper.includes('BLOK F') ? `BLOK F - ${lokName}` : lokName;
        locParts.push(`${areaLabel} (${q})`);
      }
    }

    const locStr = locParts.length > 0 ? locParts.join(', ') : 'BLOK F (0)';
    const whLocStr = whLocParts.length > 0 ? whLocParts.join(', ') : '';

    channelStockList.push({
      sku: entry.sku,
      produk: entry.produk,
      size: entry.size || 'ALL',
      locStr,
      whLocStr,
      studioQty,
      shpQty,
      ttkQty,
      blokFQty,
      whQty,
      totalQty,
    });
  }

  const enchanted = channelStockList.find(it => it.sku === 'C25CBH240BA');
  console.log('Enchanted Skirt merged result:', enchanted);
  const tiktokCount = channelStockList.filter(it => it.ttkQty > 0).length;
  console.log('Total SKUs in TikTok:', tiktokCount);
}

testMergedFlow();
