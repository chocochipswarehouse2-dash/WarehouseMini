/**
 * Inventory data model (pure logic, no React, no localStorage, no network).
 *
 * Two data sources are joined per SKU:
 *  1. DealPOS / Master Produk  -> `productCatalog` (ProductItem: d, b, q, dealpos_channels)
 *  2. Stok Fisik Rak            -> `stok_real_fisik` rows (StockRealtimeItem, derived from log_produk)
 *
 * Performance rules (the reason this file exists):
 *  - Catalog parsing is cached per ProductItem object (WeakMap) -> an unchanged item is never re-parsed.
 *  - Stock aggregation is cached per SKU row-array (WeakMap)    -> a realtime delta only recomputes the touched SKU.
 *  - Composed rows are cached per (catalog base + stock aggregate) -> unchanged rows keep object identity,
 *    so memoised React rows do not re-render and the sorted order stays stable.
 *  - Search text is precomputed once per row; sorting happens once per (rows, sortOption), not per keystroke.
 */
import type { ProductItem, StockRealtimeItem } from '../../types';
import { isCorruptedSku } from '../../utils/anomalyUtils';
import { isDummyProduct, getAreaFromLokasi } from '../../services/supabase';
import { cleanProductName, extractCleanSizeToken, extractSizeFromSku } from '../../utils/sortUtils';

// ========================================================
// CONSTANTS (kolom area sesuai spesifikasi WMS / DealPOS)
// ========================================================
export const KOMPARASI_5 = ['MAP', 'LIVE', 'STUDIO', 'PERMAK', 'DEFECT'] as const;
export type KomparasiKey = (typeof KOMPARASI_5)[number];

export const OFFLINE_COLS = ['WH', 'QC', 'GA', 'LOG'] as const;
export const STORE_COLS = [
  'LMP', 'MKG', 'BTS', 'CPJ', 'CWS', 'LWS', 'DPM', 'PHB', 'PMS', 'NSJ', 'PIM', 'SPM', 'GAIA', 'GST', 'LVL',
] as const;
export const ONLINE_COLS = ['WEB', 'SHP', 'TPD', 'TTK', 'LZD', 'WOO'] as const;
export const ALL_AREA_COLS = [...OFFLINE_COLS, ...STORE_COLS, ...ONLINE_COLS] as const;

export const KOMPARASI_LABEL: Record<KomparasiKey, string> = {
  MAP: 'MAP (Gudang Utama)',
  LIVE: 'LIVE (Shopee / TikTok)',
  STUDIO: 'STUDIO (Sample)',
  PERMAK: 'PERMAK / CUCI',
  DEFECT: 'DEFECT',
};

export type AreaFilterType = 'ALL' | 'GUDANG' | 'STORE' | 'ONLINE' | 'OFFLINE';
export const ALL_AREAS: AreaFilterType[] = ['ALL', 'GUDANG', 'STORE', 'ONLINE', 'OFFLINE'];

export type InventorySortOption =
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'KATEGORI_ASC'
  | 'KATEGORI_DESC'
  | 'SIZE_ASC'
  | 'SIZE_DESC'
  | 'SKU_ASC'
  | 'SKU_DESC'
  | 'AREA_ASC'
  | 'AREA_DESC'
  | 'QTY_DESC'
  | 'QTY_ASC'
  | 'LOC_ASC'
  | 'LOC_DESC'
  | 'FISIK_DESC'
  | 'FISIK_ASC'
  | 'DP_DESC'
  | 'DP_ASC'
  | 'SELISIH_DESC'
  | 'SELISIH_ASC';

const SIZE_ORDER_MAP: Record<string, number> = {
  ALL: 0, DEFAULT: 1, FREE: 2, XS: 3, S: 4, M: 5, L: 6, XL: 7, XXL: 8, '3XL': 9, '4XL': 10,
};
const getSizeOrder = (size: string): number => {
  const v = SIZE_ORDER_MAP[String(size || '').toUpperCase()];
  return v !== undefined ? v : 99;
};

// ========================================================
// TYPES
// ========================================================
export interface LocEntry {
  name: string;
  qty: number;
  neg: boolean;
}

/** Catalog (DealPOS / master produk) side of a row. Independent from physical stock. */
export interface CatalogBase {
  sku: string;
  produk: string;
  kategori: string;
  size: string;
  sizeOrder: number;
  pLower: string;
  skuLower: string;
  headSearch: string;
  dp: Record<KomparasiKey, number>;
  dpTotal: number;
  channels: Record<string, number>;
  channelActive: boolean;
}

/** Physical stock side of a row, aggregated from stok_real_fisik rows of ONE sku. */
export interface SkuStock {
  fisik: Record<KomparasiKey, number>;
  total: number;
  locs: LocEntry[];
  locStr: string;
}

export interface InventoryRow {
  sku: string;
  produk: string;
  size: string;
  sizeOrder: number;
  pLower: string;
  skuLower: string;
  fisik: Record<KomparasiKey, number>;
  totalFisik: number;
  dp: Record<KomparasiKey, number>;
  totalDp: number;
  /** Fisik gudang (semua area) dikurangi DealPOS (semua area). Lihat computeSelisih. */
  selisih: number;
  channels: Record<string, number>;
  locs: LocEntry[];
  locStr: string;
  search: string;
  /** true bila ada angka non-nol di fisik, DealPOS komparasi, atau channel DealPOS */
  active: boolean;
}

// ========================================================
// HELPERS
// ========================================================
const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** First non-nullish numeric value, scanning sources in order then keys in order. */
const pickNum = (sources: Array<Record<string, any> | undefined | null>, keys: readonly string[]): number | undefined => {
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (!s) continue;
    for (let j = 0; j < keys.length; j++) {
      const v = s[keys[j]];
      if (v !== undefined && v !== null) return toNum(v);
    }
  }
  return undefined;
};

/**
 * Definisi selisih. Ubah di SATU tempat ini bila aturan bisnis berubah.
 * Sekarang: like-for-like, total fisik gudang (MAP+LIVE+STUDIO+PERMAK+DEFECT) - total DealPOS (5 area yang sama).
 */
export const computeSelisih = (totalFisik: number, totalDp: number): number => totalFisik - totalDp;

const emptyKomparasi = (): Record<KomparasiKey, number> => ({ MAP: 0, LIVE: 0, STUDIO: 0, PERMAK: 0, DEFECT: 0 });

// ========================================================
// CATALOG (DEALPOS) SIDE
// ========================================================
const baseCache = new WeakMap<object, CatalogBase | null>();

function isListableSku(sku: string): boolean {
  if (!sku) return false;
  if (isCorruptedSku(sku)) return false;
  if (sku.startsWith('#') || sku.includes('#') || sku === 'KOLI' || sku === 'BOX') return false;
  return true;
}

function parseCatalogItem(item: ProductItem): CatalogBase | null {
  if (!item || isDummyProduct(item)) return null;
  const sku = String(item.k || (item as any).sku || '').trim().toUpperCase();
  if (!isListableSku(sku)) return null;

  // Master Produk murni DealPOS: abaikan placeholder tanpa nama produk resmi
  const rawName = String(item.p || (item as any).nama_produk || '').trim();
  if (!rawName) return null;
  const produk = cleanProductName(rawName) || rawName;

  // Kategori: dari master produk DealPOS
  const rawCat = String(item.kategori || item.category || (item as any).c || (item as any).jenis || '').trim();
  const kategori = rawCat && rawCat !== '-' && rawCat !== 'Apparel' ? rawCat : (rawCat || 'CLOTHING');

  // Size: ukuran master -> akhiran SKU -> '-'
  let size = extractCleanSizeToken(String(item.s || (item as any).size || ''));
  if (!size || size === '-') size = extractSizeFromSku(sku);
  if (!size || size === '-' || size.toUpperCase() === 'DEFAULT') size = 'ALL';

  const dpRaw = isObj(item.dealpos_channels) ? (item.dealpos_channels as Record<string, any>) : {};
  const dpD = isObj(dpRaw.d) ? dpRaw.d : undefined;
  const dpCabang = isObj(dpRaw.cabang) ? dpRaw.cabang : undefined;
  const dpB = isObj(dpRaw.b) ? dpRaw.b : undefined;

  const d: Record<string, any> = { ...dpRaw, ...(dpD || {}), ...(isObj(item.d) ? item.d : {}) };
  const b: Record<string, any> = { ...dpRaw, ...(dpCabang || {}), ...(dpB || {}), ...(isObj(item.b) ? item.b : {}) };

  const src = [d, dpRaw, dpD];
  const dp = emptyKomparasi();
  dp.MAP = pickNum(src, ['MAP', 'Gudang Utama', 'Marketplace']) ?? toNum(item.q);
  dp.LIVE = pickNum(src, ['LIVE', 'Barang Live', 'Sample Live']) ?? 0;
  dp.STUDIO = pickNum(src, ['STUDIO', 'Sample Studio']) ?? 0;
  dp.PERMAK = pickNum(src, ['PERMAK', 'Permak / Cuci', 'Permak']) ?? 0;
  dp.DEFECT = pickNum(src, ['DEFECT', 'Barang Cacat', 'Diskon Defect', 'Cacat']) ?? 0;
  const dpTotal = dp.MAP + dp.LIVE + dp.STUDIO + dp.PERMAK + dp.DEFECT;

  const channels: Record<string, number> = {};
  let channelActive = false;
  const chanSrc = [b, d, dpRaw, dpCabang, dpB];
  for (let i = 0; i < ALL_AREA_COLS.length; i++) {
    const code = ALL_AREA_COLS[i];
    const v = pickNum(chanSrc, [code]) ?? 0;
    channels[code] = v;
    if (v !== 0) channelActive = true;
  }

  const pLower = produk.toLowerCase();
  const skuLower = sku.toLowerCase();
  return {
    sku,
    produk,
    kategori,
    size,
    sizeOrder: getSizeOrder(size),
    pLower,
    skuLower,
    headSearch: `${pLower} ${skuLower} ${kategori.toLowerCase()} ${size.toLowerCase()}`,
    dp,
    dpTotal,
    channels,
    channelActive,
  };
}

/** Build catalog bases. Unchanged ProductItem objects are served from cache. */
export function buildCatalogBases(catalog: ProductItem[]): CatalogBase[] {
  const seen = new Set<string>();
  const out: CatalogBase[] = [];
  for (let i = 0; i < catalog.length; i++) {
    const item = catalog[i];
    if (!item || typeof item !== 'object') continue;
    let base = baseCache.get(item);
    if (base === undefined) {
      base = parseCatalogItem(item);
      baseCache.set(item, base);
    }
    if (!base || seen.has(base.sku)) continue;
    seen.add(base.sku);
    out.push(base);
  }
  return out;
}

// ========================================================
// PHYSICAL STOCK SIDE
// ========================================================
type Bucket = 'MAP' | 'LIVE' | 'STUDIO' | 'OTHER';

/**
 * Klasifikasi baris stok fisik ke bucket. Urutan aturan identik dengan inventori lama,
 * supaya angka MAP / LIVE tidak bergeser.
 */
function bucketOf(l: string, a: string): Bucket {
  const isStudio = l.includes('STUDIO') || l.includes('SAMPLE') || a.includes('STUDIO');
  if (
    l.includes('SHOPEE') || l.includes('TIKTOK') || l === 'TT' || l.includes('SHP') || l.includes('TTK') ||
    l.includes('LIVE') || a.includes('LIVE') || a === 'BLOK F' || a.includes('BLOK')
  ) {
    return isStudio ? 'STUDIO' : 'LIVE';
  }
  if (isStudio) return 'STUDIO';
  if (l.startsWith('CC') || l.includes('CUCI') || a.includes('CUCI')) return 'OTHER';
  if (l.startsWith('PMK') || l.includes('PERMAK') || a.includes('PERMAK')) return 'OTHER';
  if (
    (a === 'PERBAIKAN' || a.includes('DEFECT') || a.includes('CACAT')) &&
    (l.startsWith('DF') || l.includes('DEFECT') || l.includes('CACAT'))
  ) {
    return 'OTHER';
  }
  if (a.includes('PERBAIKAN') || a.includes('DEFECT') || a.includes('PERMAK')) return 'OTHER';
  if (a === 'DEALPOS OFFLINE' && (l === 'WH' || l === 'QC' || l === 'DD' || l === 'DEFECT' || l === 'GA')) return 'OTHER';
  return 'MAP';
}

const stockCache = new WeakMap<StockRealtimeItem[], SkuStock | null>();

export function aggregateSku(rows: StockRealtimeItem[]): SkuStock | null {
  const cached = stockCache.get(rows);
  if (cached !== undefined) return cached;

  let map = 0;
  let live = 0;
  let studio = 0;
  let cuci = 0;
  let permak = 0;
  let defect = 0;
  let shp = 0;
  let ttk = 0;
  const locMap = new Map<string, number>();
  let any = false;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const qty = Number(r.sisa_stok) || 0;
    if (qty === 0) continue;
    any = true;
    const lokasi = String(r.lokasi || '').trim();
    const l = lokasi.toUpperCase();
    const a = String(r.area || '').trim().toUpperCase();

    if (l.includes('STUDIO') || l.includes('SAMPLE') || a.includes('STUDIO')) studio += qty;
    if (l.includes('SHOPEE') || l.includes('SHP') || a.includes('SHOPEE')) shp += qty;
    if (l.includes('TIKTOK') || l.includes('TTK') || l === 'TT' || a.includes('TIKTOK')) ttk += qty;

    if (l.startsWith('CC') || l.includes('CUCI') || a.includes('CUCI')) cuci += qty;
    else if (l.startsWith('PMK') || l.includes('PERMAK') || a.includes('PERMAK')) permak += qty;
    else if (l.startsWith('DF') || l.includes('DEFECT') || l.includes('CACAT') || a.includes('DEFECT') || a.includes('CACAT')) defect += qty;

    const bucket = bucketOf(l, a);
    if (bucket === 'MAP') map += qty;
    else if (bucket === 'LIVE') live += qty;

    if (lokasi && lokasi !== '-') locMap.set(lokasi, (locMap.get(lokasi) || 0) + qty);
  }

  if (!any) {
    stockCache.set(rows, null);
    return null;
  }

  // LIVE harus mencakup sub-channel Shopee + TikTok
  if (shp + ttk > live) live = shp + ttk;

  const fisik = emptyKomparasi();
  fisik.MAP = map;
  fisik.LIVE = live;
  fisik.STUDIO = studio;
  fisik.PERMAK = permak + cuci;
  fisik.DEFECT = defect;
  const total = map + live + studio + permak + cuci + defect;

  const locs: LocEntry[] = [];
  locMap.forEach((qty, name) => locs.push({ name, qty, neg: qty < 0 }));
  if (locs.length > 1) {
    locs.sort((x, y) => (y.qty !== x.qty ? y.qty - x.qty : x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  }
  const locStr = locs.map((e) => (e.qty ? `${e.name} (${e.qty})` : e.name)).join(', ');

  const result: SkuStock = { fisik, total, locs, locStr };
  stockCache.set(rows, result);
  return result;
}

// ========================================================
// COMPOSE (JOIN CATALOG + STOCK)
// ========================================================
const EMPTY_FISIK = emptyKomparasi();
const rowCache = new WeakMap<CatalogBase, { agg: SkuStock | null; row: InventoryRow }>();

export function composeRows(bases: CatalogBase[], stockBySku: Map<string, StockRealtimeItem[]>): InventoryRow[] {
  const out: InventoryRow[] = [];
  const seenSkus = new Set<string>();

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    seenSkus.add(base.sku);
    const stockRows = stockBySku.get(base.sku);
    const agg = stockRows ? aggregateSku(stockRows) : null;

    const hit = rowCache.get(base);
    if (hit && hit.agg === agg) {
      out.push(hit.row);
      continue;
    }

    const fisik = agg ? agg.fisik : EMPTY_FISIK;
    const totalFisik = agg ? agg.total : 0;
    const locStr = agg ? agg.locStr : '';
    const row: InventoryRow = {
      sku: base.sku,
      produk: base.produk,
      size: base.size,
      sizeOrder: base.sizeOrder,
      pLower: base.pLower,
      skuLower: base.skuLower,
      fisik,
      totalFisik,
      dp: base.dp,
      totalDp: base.dpTotal,
      selisih: computeSelisih(totalFisik, base.dpTotal),
      channels: base.channels,
      locs: agg ? agg.locs : [],
      locStr,
      search: locStr ? `${base.headSearch} ${locStr.toLowerCase()}` : base.headSearch,
      active: totalFisik !== 0 || base.dpTotal !== 0 || base.channelActive,
    };
    rowCache.set(base, { agg, row });
    out.push(row);
  }

  // Juga sertakan produk fisik yang ada di rak tetapi belum terdaftar di katalog DealPOS
  stockBySku.forEach((stockRows, sku) => {
    if (seenSkus.has(sku)) return;
    if (!isListableSku(sku)) return;
    const agg = aggregateSku(stockRows);
    if (!agg || agg.total === 0) return;
    const first = stockRows[0];
    const rawProduk = first?.nama_produk || sku;
    const produk = cleanProductName(rawProduk) || rawProduk;
    let size = extractCleanSizeToken(first?.size || '');
    if (!size || size === '-') size = extractSizeFromSku(sku);
    if (!size || size === '-' || size.toUpperCase() === 'DEFAULT') size = 'ALL';

    const pLower = produk.toLowerCase();
    const skuLower = sku.toLowerCase();
    out.push({
      sku,
      produk,
      size,
      sizeOrder: getSizeOrder(size),
      pLower,
      skuLower,
      fisik: agg.fisik,
      totalFisik: agg.total,
      dp: emptyKomparasi(),
      totalDp: 0,
      selisih: agg.total,
      channels: {},
      locs: agg.locs,
      locStr: agg.locStr,
      search: `${pLower} ${skuLower} ${size.toLowerCase()} ${agg.locStr.toLowerCase()}`,
      active: true,
    });
  });

  return out;
}

// ========================================================
// SORT / FILTER / STATS
// ========================================================
const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function sortRows(rows: InventoryRow[], option: InventorySortOption): InventoryRow[] {
  const sorted = rows.slice();
  const byName = (a: InventoryRow, b: InventoryRow): number =>
    cmpStr(a.pLower, b.pLower) || a.sizeOrder - b.sizeOrder || cmpStr(a.skuLower, b.skuLower);
  switch (option) {
    case 'NAME_ASC':
      return sorted.sort(byName);
    case 'NAME_DESC':
      return sorted.sort((a, b) => cmpStr(b.pLower, a.pLower) || cmpStr(b.skuLower, a.skuLower));
    case 'SIZE_ASC':
      return sorted.sort((a, b) => a.sizeOrder - b.sizeOrder || byName(a, b));
    case 'SIZE_DESC':
      return sorted.sort((a, b) => b.sizeOrder - a.sizeOrder || byName(a, b));
    case 'SKU_ASC':
      return sorted.sort((a, b) => cmpStr(a.skuLower, b.skuLower) || byName(a, b));
    case 'SKU_DESC':
      return sorted.sort((a, b) => cmpStr(b.skuLower, a.skuLower) || byName(a, b));
    case 'LOC_ASC':
      return sorted.sort((a, b) => cmpStr(a.locs[0]?.name || 'ZZZ', b.locs[0]?.name || 'ZZZ') || byName(a, b));
    case 'LOC_DESC':
      return sorted.sort((a, b) => cmpStr(b.locs[0]?.name || '', a.locs[0]?.name || '') || byName(a, b));
    case 'FISIK_DESC':
      return sorted.sort((a, b) => b.totalFisik - a.totalFisik || byName(a, b));
    case 'FISIK_ASC':
      return sorted.sort((a, b) => a.totalFisik - b.totalFisik || byName(a, b));
    case 'DP_DESC':
      return sorted.sort((a, b) => b.totalDp - a.totalDp || byName(a, b));
    case 'DP_ASC':
      return sorted.sort((a, b) => a.totalDp - b.totalDp || byName(a, b));
    case 'SELISIH_DESC':
      return sorted.sort((a, b) => b.selisih - a.selisih || byName(a, b));
    case 'SELISIH_ASC':
      return sorted.sort((a, b) => a.selisih - b.selisih || byName(a, b));
    default:
      return sorted.sort(byName);
  }
}

export interface InventoryFilter {
  query: string;
  onlyActive: boolean;
  onlySelisih: boolean;
}

export function filterRows(rows: InventoryRow[], f: InventoryFilter): InventoryRow[] {
  const keywords = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords.length === 0 && !f.onlyActive && !f.onlySelisih) return rows;
  const out: InventoryRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (f.onlyActive && !r.active) continue;
    if (f.onlySelisih && r.selisih === 0) continue;
    let ok = true;
    for (let k = 0; k < keywords.length; k++) {
      if (!r.search.includes(keywords[k])) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(r);
  }
  return out;
}

export interface InventoryStats {
  skuCount: number;
  totalFisik: number;
  totalDp: number;
  totalSelisih: number;
  skuSelisih: number;
}

export function computeStats(rows: InventoryRow[]): InventoryStats {
  let totalFisik = 0;
  let totalDp = 0;
  let skuSelisih = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    totalFisik += r.totalFisik;
    totalDp += r.totalDp;
    if (r.selisih !== 0) skuSelisih++;
  }
  return { skuCount: rows.length, totalFisik, totalDp, totalSelisih: computeSelisih(totalFisik, totalDp), skuSelisih };
}

// ========================================================
// AREA FILTER HELPERS
// ========================================================
export const isAreaOn = (filters: AreaFilterType[], code: AreaFilterType): boolean =>
  filters.includes('ALL') || filters.includes(code);

/** Same toggle semantics as the legacy inventory page. */
export function toggleArea(current: AreaFilterType[], code: AreaFilterType): AreaFilterType[] {
  if (code === 'ALL') {
    return current.includes('ALL') ? ['GUDANG'] : [...ALL_AREAS];
  }
  let next = current.filter((x) => x !== 'ALL');
  next = next.includes(code) ? next.filter((x) => x !== code) : [...next, code];
  if (next.length === 0) return [...ALL_AREAS];
  if (next.includes('GUDANG') && next.includes('STORE') && next.includes('ONLINE') && next.includes('OFFLINE')) {
    return [...ALL_AREAS];
  }
  return next;
}

export function areaLabel(filters: AreaFilterType[]): string {
  if (filters.includes('ALL') || (['GUDANG', 'STORE', 'ONLINE', 'OFFLINE'] as AreaFilterType[]).every((c) => filters.includes(c))) {
    return 'SEMUA AREA';
  }
  const names = (['GUDANG', 'STORE', 'ONLINE', 'OFFLINE'] as AreaFilterType[]).filter((c) => filters.includes(c));
  return names.length === 1 ? names[0] : `${names.join(', ')} (${names.length})`;
}

// ========================================================
// CSV EXPORT
// ========================================================
const csvText = (v: string): string => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function buildInventoryCsv(rows: InventoryRow[], areas: AreaFilterType[]): string {
  const showGudang = isAreaOn(areas, 'GUDANG');
  const showOffline = isAreaOn(areas, 'OFFLINE');
  const showStore = isAreaOn(areas, 'STORE');
  const showOnline = isAreaOn(areas, 'ONLINE');

  const headers: string[] = ['PRODUK', 'SIZE', 'CODE', 'STOK_REAL_FISIK', 'TOTAL_DEALPOS', 'SELISIH', 'LOKASI_RAK'];
  if (showGudang) KOMPARASI_5.forEach((k) => headers.push(`${k}_FISIK`, `${k}_DP`));
  if (showOffline) OFFLINE_COLS.forEach((c) => headers.push(c));
  if (showStore) STORE_COLS.forEach((c) => headers.push(c));
  if (showOnline) ONLINE_COLS.forEach((c) => headers.push(c));

  const lines: string[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cells: Array<string | number> = [
      csvText(r.produk),
      csvText(r.size || '-'),
      csvText(r.sku),
      r.totalFisik,
      r.totalDp,
      r.selisih,
      csvText(r.locStr || '-'),
    ];
    if (showGudang) KOMPARASI_5.forEach((k) => cells.push(r.fisik[k] || 0, r.dp[k] || 0));
    if (showOffline) OFFLINE_COLS.forEach((c) => cells.push(r.channels[c] || 0));
    if (showStore) STORE_COLS.forEach((c) => cells.push(r.channels[c] || 0));
    if (showOnline) ONLINE_COLS.forEach((c) => cells.push(r.channels[c] || 0));
    lines[i] = cells.join(',');
  }
  return '\uFEFF' + headers.join(',') + '\n' + lines.join('\n');
}

// ========================================================
// LOCATION-LEVEL (PER RAK FISIK) MODEL - MIRIP SUPABASE
// ========================================================
export interface InventoryLocationRow {
  id: string; // `${sku}__${lokasi}`
  sku: string;
  produk: string;
  size: string;
  sizeOrder: number;
  pLower: string;
  skuLower: string;
  lokasi: string;
  lokasiLower: string;
  area: string;
  qtyFisik: number;
  totalDp: number;
  selisih: number;
  search: string;
  active: boolean;
  isNeg: boolean;
}

export function composeLocationRows(rows: InventoryRow[]): InventoryLocationRow[] {
  const out: InventoryLocationRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.locs || r.locs.length === 0) {
      out.push({
        id: `${r.sku}__none`,
        sku: r.sku,
        produk: r.produk,
        size: r.size,
        sizeOrder: r.sizeOrder,
        pLower: r.pLower,
        skuLower: r.skuLower,
        lokasi: '-',
        lokasiLower: 'zzz',
        area: '-',
        qtyFisik: 0,
        totalDp: r.totalDp,
        selisih: computeSelisih(0, r.totalDp),
        search: r.search,
        active: r.active,
        isNeg: false,
      });
    } else {
      for (let j = 0; j < r.locs.length; j++) {
        const l = r.locs[j];
        out.push({
          id: `${r.sku}__${l.name}`,
          sku: r.sku,
          produk: r.produk,
          size: r.size,
          sizeOrder: r.sizeOrder,
          pLower: r.pLower,
          skuLower: r.skuLower,
          lokasi: l.name,
          lokasiLower: l.name.toLowerCase(),
          area: getAreaFromLokasi(l.name),
          qtyFisik: l.qty,
          totalDp: r.totalDp,
          selisih: computeSelisih(l.qty, r.totalDp),
          search: `${r.search} ${l.name.toLowerCase()}`,
          active: l.qty !== 0 || r.totalDp !== 0,
          isNeg: l.neg,
        });
      }
    }
  }
  return out;
}

export function sortLocationRows(rows: InventoryLocationRow[], option: InventorySortOption): InventoryLocationRow[] {
  const sorted = rows.slice();
  const byName = (a: InventoryLocationRow, b: InventoryLocationRow): number =>
    cmpStr(a.pLower, b.pLower) || a.sizeOrder - b.sizeOrder || cmpStr(a.lokasiLower, b.lokasiLower) || cmpStr(a.skuLower, b.skuLower);

  switch (option) {
    case 'NAME_ASC':
      return sorted.sort(byName);
    case 'NAME_DESC':
      return sorted.sort((a, b) => cmpStr(b.pLower, a.pLower) || cmpStr(b.skuLower, a.skuLower));
    case 'SIZE_ASC':
      return sorted.sort((a, b) => a.sizeOrder - b.sizeOrder || byName(a, b));
    case 'SIZE_DESC':
      return sorted.sort((a, b) => b.sizeOrder - a.sizeOrder || byName(a, b));
    case 'SKU_ASC':
      return sorted.sort((a, b) => cmpStr(a.skuLower, b.skuLower) || cmpStr(a.lokasiLower, b.lokasiLower));
    case 'SKU_DESC':
      return sorted.sort((a, b) => cmpStr(b.skuLower, a.skuLower) || cmpStr(a.lokasiLower, b.lokasiLower));
    case 'LOC_ASC':
      return sorted.sort((a, b) => cmpStr(a.lokasiLower, b.lokasiLower) || byName(a, b));
    case 'LOC_DESC':
      return sorted.sort((a, b) => cmpStr(b.lokasiLower, a.lokasiLower) || byName(a, b));
    case 'FISIK_DESC':
      return sorted.sort((a, b) => b.qtyFisik - a.qtyFisik || cmpStr(a.lokasiLower, b.lokasiLower));
    case 'FISIK_ASC':
      return sorted.sort((a, b) => a.qtyFisik - b.qtyFisik || cmpStr(a.lokasiLower, b.lokasiLower));
    case 'DP_DESC':
      return sorted.sort((a, b) => b.totalDp - a.totalDp || byName(a, b));
    case 'DP_ASC':
      return sorted.sort((a, b) => a.totalDp - b.totalDp || byName(a, b));
    case 'SELISIH_DESC':
      return sorted.sort((a, b) => b.selisih - a.selisih || byName(a, b));
    case 'SELISIH_ASC':
      return sorted.sort((a, b) => a.selisih - b.selisih || byName(a, b));
    default:
      return sorted.sort(byName);
  }
}

export function filterLocationRows(rows: InventoryLocationRow[], f: InventoryFilter): InventoryLocationRow[] {
  const keywords = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (keywords.length === 0 && !f.onlyActive && !f.onlySelisih) return rows;
  const out: InventoryLocationRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (f.onlyActive && !r.active) continue;
    if (f.onlySelisih && r.selisih === 0) continue;
    let ok = true;
    for (let k = 0; k < keywords.length; k++) {
      if (!r.search.includes(keywords[k])) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(r);
  }
  return out;
}

export function buildInventoryLocationCsv(rows: InventoryLocationRow[]): string {
  const headers = ['NAMA_PRODUK', 'SIZE', 'SKU', 'LOKASI_RAK', 'AREA', 'QTY_FISIK', 'TOTAL_DEALPOS', 'SELISIH'];
  const lines: string[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cells: Array<string | number> = [
      csvText(r.produk),
      csvText(r.size || '-'),
      csvText(r.sku),
      csvText(r.lokasi),
      csvText(r.area),
      r.qtyFisik,
      r.totalDp,
      r.selisih,
    ];
    lines[i] = cells.join(',');
  }
  return '\uFEFF' + headers.join(',') + '\n' + lines.join('\n');
}

// ========================================================
// PRODUCT PER AREA MODEL (PRODUK & AREA - DRILL DOWN RAK)
// ========================================================
export interface AreaLocationEntry {
  lokasi: string;
  qty: number;
  neg: boolean;
}

export interface InventoryAreaRow {
  id: string; // `${sku}__${area}`
  sku: string;
  produk: string;
  size: string;
  sizeOrder: number;
  kategori: string;
  area: string;
  qty: number;
  locations: AreaLocationEntry[];
  locStr: string;
  pLower: string;
  skuLower: string;
  kategoriLower: string;
  areaLower: string;
  search: string;
  active: boolean;
  isNeg: boolean;
}

export function composeAreaRows(
  bases: CatalogBase[],
  stockBySku: Map<string, StockRealtimeItem[]>
): InventoryAreaRow[] {
  const out: InventoryAreaRow[] = [];
  const catalogMap = new Map<string, CatalogBase>();
  for (let i = 0; i < bases.length; i++) {
    catalogMap.set(bases[i].sku, bases[i]);
  }

  const seenSkus = new Set<string>();

  // 1. Process all SKUs that have physical stock records
  stockBySku.forEach((stockRows, sku) => {
    if (!sku || !isListableSku(sku)) return;
    seenSkus.add(sku);

    const base = catalogMap.get(sku);
    const rawProduk = base?.produk || stockRows[0]?.nama_produk || sku;
    const produk = cleanProductName(rawProduk) || rawProduk;
    let size = base?.size || extractCleanSizeToken(stockRows[0]?.size || '');
    if (!size || size === '-') size = extractSizeFromSku(sku);
    if (!size || size === '-' || size.toUpperCase() === 'DEFAULT') size = 'ALL';

    const kategori = base?.kategori || stockRows[0]?.kategori || (stockRows[0] as any)?.category || 'CLOTHING';
    const sizeOrder = getSizeOrder(size);
    const pLower = produk.toLowerCase();
    const skuLower = sku.toLowerCase();
    const kategoriLower = kategori.toLowerCase();

    // Group locations by Area
    const areaMap = new Map<string, { totalQty: number; locs: AreaLocationEntry[] }>();

    for (let i = 0; i < stockRows.length; i++) {
      const r = stockRows[i];
      const q = Number(r.sisa_stok) || 0;
      if (q === 0) continue;
      const lokasi = String(r.lokasi || '').trim();
      if (!lokasi || lokasi === '-') continue;

      let area = getAreaFromLokasi(lokasi, r.area);
      if (area === 'Kolian') area = 'Koli';

      let entry = areaMap.get(area);
      if (!entry) {
        entry = { totalQty: 0, locs: [] };
        areaMap.set(area, entry);
      }
      entry.totalQty += q;
      entry.locs.push({ lokasi, qty: q, neg: q < 0 });
    }

    // Sort areas by business priority: Blok F, Warehouse, Perbaikan, Koli, Aksesoris, Transit, Anomali
    const areaPriority: Record<string, number> = {
      'Blok F': 1,
      'Warehouse': 2,
      'Perbaikan': 3,
      'Koli': 4,
      'Aksesoris': 5,
      'Transit': 6,
      'Anomali': 7,
    };

    const sortedAreas = Array.from(areaMap.entries()).sort((a, b) => {
      const pA = areaPriority[a[0]] ?? 99;
      const pB = areaPriority[b[0]] ?? 99;
      return pA - pB;
    });

    for (let i = 0; i < sortedAreas.length; i++) {
      const [area, data] = sortedAreas[i];
      data.locs.sort((a, b) => b.qty - a.qty || a.lokasi.localeCompare(b.lokasi));
      const locStr = data.locs.map((l) => `${l.lokasi} (${l.qty})`).join(', ');
      const areaLower = area.toLowerCase();

      out.push({
        id: `${sku}__${area}`,
        sku,
        produk,
        size,
        sizeOrder,
        kategori,
        area,
        qty: data.totalQty,
        locations: data.locs,
        locStr,
        pLower,
        skuLower,
        kategoriLower,
        areaLower,
        search: `${pLower} ${skuLower} ${kategoriLower} ${size.toLowerCase()} ${areaLower} ${locStr.toLowerCase()}`,
        active: data.totalQty !== 0,
        isNeg: data.totalQty < 0,
      });
    }
  });

  // 2. Also include catalog products that currently have 0 physical stock
  for (let i = 0; i < bases.length; i++) {
    const base = bases[i];
    if (seenSkus.has(base.sku)) continue;
    seenSkus.add(base.sku);

    const area = 'Warehouse';
    const areaLower = area.toLowerCase();
    out.push({
      id: `${base.sku}__${area}`,
      sku: base.sku,
      produk: base.produk,
      size: base.size,
      sizeOrder: base.sizeOrder,
      kategori: base.kategori,
      area,
      qty: 0,
      locations: [],
      locStr: '-',
      pLower: base.pLower,
      skuLower: base.skuLower,
      kategoriLower: base.kategori.toLowerCase(),
      areaLower,
      search: `${base.pLower} ${base.skuLower} ${base.kategori.toLowerCase()} ${base.size.toLowerCase()} ${areaLower}`,
      active: false,
      isNeg: false,
    });
  }

  return out;
}

export function sortAreaRows(rows: InventoryAreaRow[], option: InventorySortOption): InventoryAreaRow[] {
  const sorted = rows.slice();
  const byName = (a: InventoryAreaRow, b: InventoryAreaRow): number =>
    cmpStr(a.pLower, b.pLower) || a.sizeOrder - b.sizeOrder || cmpStr(a.areaLower, b.areaLower) || cmpStr(a.skuLower, b.skuLower);

  switch (option) {
    case 'NAME_ASC':
      return sorted.sort(byName);
    case 'NAME_DESC':
      return sorted.sort((a, b) => cmpStr(b.pLower, a.pLower) || cmpStr(b.skuLower, a.skuLower));
    case 'KATEGORI_ASC':
      return sorted.sort((a, b) => cmpStr(a.kategoriLower, b.kategoriLower) || byName(a, b));
    case 'KATEGORI_DESC':
      return sorted.sort((a, b) => cmpStr(b.kategoriLower, a.kategoriLower) || byName(a, b));
    case 'SIZE_ASC':
      return sorted.sort((a, b) => a.sizeOrder - b.sizeOrder || byName(a, b));
    case 'SIZE_DESC':
      return sorted.sort((a, b) => b.sizeOrder - a.sizeOrder || byName(a, b));
    case 'SKU_ASC':
      return sorted.sort((a, b) => cmpStr(a.skuLower, b.skuLower) || cmpStr(a.areaLower, b.areaLower));
    case 'SKU_DESC':
      return sorted.sort((a, b) => cmpStr(b.skuLower, a.skuLower) || cmpStr(a.areaLower, b.areaLower));
    case 'AREA_ASC':
      return sorted.sort((a, b) => cmpStr(a.areaLower, b.areaLower) || byName(a, b));
    case 'AREA_DESC':
      return sorted.sort((a, b) => cmpStr(b.areaLower, a.areaLower) || byName(a, b));
    case 'QTY_DESC':
    case 'FISIK_DESC':
      return sorted.sort((a, b) => b.qty - a.qty || byName(a, b));
    case 'QTY_ASC':
    case 'FISIK_ASC':
      return sorted.sort((a, b) => a.qty - b.qty || byName(a, b));
    case 'LOC_ASC':
      return sorted.sort((a, b) => cmpStr(a.locStr, b.locStr) || byName(a, b));
    case 'LOC_DESC':
      return sorted.sort((a, b) => cmpStr(b.locStr, a.locStr) || byName(a, b));
    default:
      return sorted.sort(byName);
  }
}

export interface InventoryAreaFilter {
  query: string;
  selectedArea?: string; // 'ALL' or 'Warehouse', 'Blok F', 'Perbaikan', 'Koli', etc.
  onlyActive?: boolean;
}

export function filterAreaRows(rows: InventoryAreaRow[], f: InventoryAreaFilter): InventoryAreaRow[] {
  const keywords = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const selArea = f.selectedArea && f.selectedArea !== 'ALL' ? f.selectedArea.toLowerCase() : null;

  const out: InventoryAreaRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (f.onlyActive && !r.active) continue;
    if (selArea && r.areaLower !== selArea && !r.areaLower.includes(selArea)) continue;

    let ok = true;
    for (let k = 0; k < keywords.length; k++) {
      if (!r.search.includes(keywords[k])) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(r);
  }
  return out;
}

export interface InventoryAreaStats {
  skuCount: number;
  totalFisik: number;
  areaRowCount: number;
  activeLocationsCount: number;
}

export function computeAreaStats(rows: InventoryAreaRow[]): InventoryAreaStats {
  const skus = new Set<string>();
  const locs = new Set<string>();
  let totalFisik = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    skus.add(r.sku);
    totalFisik += r.qty;
    for (let j = 0; j < r.locations.length; j++) {
      if (r.locations[j].qty > 0) {
        locs.add(r.locations[j].lokasi);
      }
    }
  }

  return {
    skuCount: skus.size,
    totalFisik,
    areaRowCount: rows.length,
    activeLocationsCount: locs.size,
  };
}

export function buildAreaInventoryCsv(rows: InventoryAreaRow[]): string {
  const headers = ['KATEGORI', 'NAMA_PRODUK', 'SIZE', 'SKU', 'AREA', 'QTY_FISIK', 'RINCIAN_LOKASI'];
  const lines: string[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cells: Array<string | number> = [
      csvText(r.kategori),
      csvText(r.produk),
      csvText(r.size || '-'),
      csvText(r.sku),
      csvText(r.area),
      r.qty,
      csvText(r.locStr || '-'),
    ];
    lines[i] = cells.join(',');
  }
  return '\uFEFF' + headers.join(',') + '\n' + lines.join('\n');
}


