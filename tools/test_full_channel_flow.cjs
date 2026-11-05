const { createClient } = require('@supabase/supabase-js');
const url = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const key = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const supabase = createClient(url, key);

async function testFlow() {
  const channelLocations = [
    'TIKTOK', 'Tiktok', 'tiktok',
    'SHOPEE', 'Shopee', 'shopee',
    'STUDIO', 'Studio', 'studio',
    'BLOK F', 'Blok F',
    'LIVE SHOPEE', 'LIVE TIKTOK', 'SAMPLE', 'FOTO'
  ];

  console.time('fetch_all_channel_data');
  // 1. Fetch by location list
  const p1 = supabase
    .from('stok_real_fisik')
    .select('sku, nama_produk, size, lokasi, area, sisa_stok')
    .in('lokasi', channelLocations)
    .neq('sisa_stok', 0);

  // 2. Fetch by area Blok F
  const p2 = supabase
    .from('stok_real_fisik')
    .select('sku, nama_produk, size, lokasi, area, sisa_stok')
    .eq('area', 'Blok F')
    .neq('sisa_stok', 0);

  const [resLoc, resArea] = await Promise.all([p1, p2]);
  console.timeEnd('fetch_all_channel_data');

  const combinedRows = [...(resLoc.data || []), ...(resArea.data || [])];
  const dedupMap = new Map();
  for (const r of combinedRows) {
    const sku = String(r.sku || '').trim().toUpperCase();
    const lok = String(r.lokasi || '').trim().toUpperCase();
    if (!sku) continue;
    const key = `${sku}__${lok}`;
    if (!dedupMap.has(key)) {
      dedupMap.set(key, r);
    }
  }

  console.log('Unique channel stock rows:', dedupMap.size);

  const stockMap = new Map();
  for (const r of dedupMap.values()) {
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

  console.log('ChannelStockList total SKUs:', channelStockList.length);
  const tiktokOnly = channelStockList.filter(it => it.ttkQty > 0);
  console.log('Total SKUs with TikTok stock > 0:', tiktokOnly.length);
  const totalTtkPcs = tiktokOnly.reduce((acc, c) => acc + c.ttkQty, 0);
  console.log('Total TikTok Pcs:', totalTtkPcs);
  console.log('Sample TikTok item:', tiktokOnly[0]);
}

testFlow();
