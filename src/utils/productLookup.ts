/**
 * Standard SKU Lookup & Alignment Utilities for WMS
 * 
 * Rules:
 * 1. SKU lookup uses the master product catalog (master_produk) as the single source of truth.
 * 2. Official Nama Produk and Size must ALWAYS align with the master product.
 * 3. Original nama produk & size from the master product are NEVER anomalies.
 * 4. Calculated or inputted names/sizes that deviate from the master product are anomalies.
 * 5. DealPOS negative quota is normal business flow and NOT an anomaly to sanitize.
 * 6. Only negative physical rack stock (sisa_stok < 0) is a quantity anomaly.
 */
import { ProductItem } from '../types';
import { cleanProductName, extractCleanSizeToken, extractSizeFromSku, isRealSize, setSortUtilsMasterCatalog, inferCategoryFromProductName, lookupCategoryByName, isCorruptedColorCodeSize } from './sortUtils';

export interface ProductLookupResult {
  found: boolean;
  sku: string;
  nama_produk: string;
  size: string;
  dealposQty: number;
  category?: string;
  masterItem?: ProductItem;
  hasNameMismatch?: boolean;
  hasSizeMismatch?: boolean;
}

const catalogMapCache = new WeakMap<ProductItem[], Map<string, ProductItem>>();
let fallbackLocalStorageMap: Map<string, ProductItem> | null = null;
let fallbackLocalStorageTimestamp = 0;
let globalCatalogMap: Map<string, ProductItem> | null = null;

/**
 * Register loaded catalog globally in memory so every component/util has instant O(1) VLOOKUP access
 */
export function setGlobalProductCatalog(catalog: ProductItem[]): void {
  if (!Array.isArray(catalog) || catalog.length === 0) return;
  globalCatalogMap = buildProductLookupMap(catalog);
  if (typeof window !== 'undefined') {
    (window as any).__wms_global_catalog_map = globalCatalogMap;
  }
  setSortUtilsMasterCatalog(catalog, globalCatalogMap);
}

/**
 * Retrieve global in-memory product catalog Map
 */
export function getGlobalProductCatalogMap(): Map<string, ProductItem> | null {
  if (globalCatalogMap && globalCatalogMap.size > 0) {
    return globalCatalogMap;
  }
  if (typeof window !== 'undefined' && (window as any).__wms_global_catalog_map) {
    globalCatalogMap = (window as any).__wms_global_catalog_map;
    return globalCatalogMap;
  }
  return null;
}

/**
 * Creates a fast O(1) indexed Map from product catalog (cached by array reference via WeakMap)
 * Strictly maps exact SKU and product code without corrupting variant prefixes
 */
export function buildProductLookupMap(
  catalog: ProductItem[] = []
): Map<string, ProductItem> {
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return new Map<string, ProductItem>();
  }
  const cached = catalogMapCache.get(catalog);
  if (cached) {
    return cached;
  }

  const map = new Map<string, ProductItem>();
  for (let i = 0; i < catalog.length; i++) {
    const item = catalog[i];
    if (!item) continue;
    const rawSku = item.k || (item as any).sku || '';
    if (rawSku) {
      const cleanSku = String(rawSku).trim().toUpperCase();
      if (cleanSku) {
        map.set(cleanSku, item);
      }
    }
    const rawCode = (item as any).kode_produksi;
    if (rawCode) {
      const cleanCode = String(rawCode).trim().toUpperCase();
      if (cleanCode && !map.has(cleanCode)) {
        map.set(cleanCode, item);
      }
    }
  }
  catalogMapCache.set(catalog, map);
  return map;
}

function getFallbackLocalStorageMap(): Map<string, ProductItem> {
  const now = Date.now();
  if (fallbackLocalStorageMap && now - fallbackLocalStorageTimestamp < 60_000) {
    return fallbackLocalStorageMap;
  }
  const map = new Map<string, ProductItem>();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const cacheKeys = ['wms_master_produk', 'wms_product_cache', 'wms_catalog_cache'];
      for (const key of cacheKeys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          for (let i = 0; i < list.length; i++) {
            const it = list[i];
            if (!it) continue;
            const k = String(it.k || it.sku || '').trim().toUpperCase();
            if (k) map.set(k, it);
          }
          if (map.size > 0) break;
        }
      }
    } catch {}
  }
  fallbackLocalStorageMap = map;
  fallbackLocalStorageTimestamp = now;
  return map;
}

/**
 * Normalize SKU for lookup (uppercase, trimmed, strips accidental quotes)
 */
export function normalizeSkuForLookup(rawSku: string | null | undefined): string {
  if (!rawSku) return '';
  return String(rawSku).trim().toUpperCase().replace(/^["']+|["']+$/g, '');
}

/**
 * Look up official product name and size from Master Product using SKU
 * Employs exact O(1) dictionary lookup (VLOOKUP / XLOOKUP equivalent)
 */
export function lookupProductBySku(
  rawSku: string | null | undefined,
  catalogOrMap?: ProductItem[] | Map<string, ProductItem> | null,
  currentName?: string | null,
  currentSize?: string | null
): ProductLookupResult {
  const cleanSku = normalizeSkuForLookup(rawSku);

  if (!cleanSku) {
    return {
      found: false,
      sku: '',
      nama_produk: '',
      size: '-',
      dealposQty: 0,
    };
  }

  let master: ProductItem | undefined;

  // 1. Direct match from passed-in catalog or map
  if (catalogOrMap instanceof Map && catalogOrMap.size > 0) {
    master = catalogOrMap.get(cleanSku);
  } else if (Array.isArray(catalogOrMap) && catalogOrMap.length > 0) {
    const map = buildProductLookupMap(catalogOrMap);
    master = map.get(cleanSku);
  }

  // 2. Exact match from global in-memory catalog (28,000+ items)
  if (!master) {
    const gMap = getGlobalProductCatalogMap();
    if (gMap) {
      master = gMap.get(cleanSku);
    }
  }

  // 3. Fallback to cached localStorage map ONLY when in-memory catalog was not yet available
  if (!master) {
    master = getFallbackLocalStorageMap().get(cleanSku);
  }

  if (!master) {
    const fallbackName = currentName ? cleanProductName(String(currentName).trim()) : '';
    const rawCurSize = extractCleanSizeToken(currentSize ? String(currentSize).trim() : '');
    const validCurSize = (!isCorruptedColorCodeSize(cleanSku, rawCurSize) && rawCurSize && rawCurSize !== '-' && rawCurSize.toUpperCase() !== 'DEFAULT' && isRealSize(rawCurSize)) ? rawCurSize : '';
    const skuSize = extractSizeFromSku(cleanSku);
    const validSkuSize = (!isCorruptedColorCodeSize(cleanSku, skuSize) && skuSize && skuSize !== '-' && skuSize.toUpperCase() !== 'DEFAULT' && isRealSize(skuSize)) ? skuSize : '';
    const fallbackSize = validCurSize || validSkuSize || '-';
    const fallbackCat = lookupCategoryByName(fallbackName, catalogOrMap) || inferCategoryFromProductName(fallbackName);
    return {
      found: false,
      sku: cleanSku,
      nama_produk: fallbackName && fallbackName.toUpperCase() !== cleanSku ? fallbackName : cleanSku,
      size: fallbackSize,
      category: fallbackCat,
      dealposQty: 0,
    };
  }

  // Exact Master Product record found! Read authoritative fields directly
  const rawMasterName = String(
    master.p || master.n || (master as any).nama_produk || (master as any).product_name || (master as any).nama || ''
  ).trim();
  const officialName = cleanProductName(rawMasterName) || rawMasterName;

  let officialSize = extractCleanSizeToken(
    String(master.s || (master as any).size || (master as any).variant || (master as any).varian || (master as any).ukuran || '')
  );

  if (isCorruptedColorCodeSize(cleanSku, officialSize)) {
    officialSize = '-';
  }

  // If master data recorded "Default" or empty, try extracting size
  if (!officialSize || officialSize === '-' || officialSize.toUpperCase() === 'DEFAULT') {
    const fromSku = extractSizeFromSku(cleanSku);
    if (fromSku && fromSku !== '-' && fromSku.toUpperCase() !== 'DEFAULT' && isRealSize(fromSku) && !isCorruptedColorCodeSize(cleanSku, fromSku)) {
      officialSize = fromSku;
    } else {
      const rawMasterVariant = String(master.s || (master as any).size || (master as any).variant || '').trim().toUpperCase();
      if (rawMasterVariant === 'ALL' || rawMasterVariant === 'ALL SIZE' || rawMasterVariant === 'ALLSIZE' || rawMasterVariant === 'FS' || rawMasterVariant === 'FREE SIZE') {
        officialSize = 'ALL';
      } else {
        officialSize = '-';
      }
    }
  }

  const dealposQty = Number(master.q) || 0;
  let category = (master.c || master.category || (master as any).kategori || '') as string;
  if (!category || category.toUpperCase() === 'PHYSICAL STOCK') {
    category = lookupCategoryByName(officialName, catalogOrMap) || inferCategoryFromProductName(officialName);
  }

  // Check mismatches against current data:
  // "Nama produk dan size hasil kalkulasi/input data yang tidak sesuai dengan master produk = anomali"
  let hasNameMismatch = false;
  if (currentName !== undefined && currentName !== null) {
    const cleanCurName = cleanProductName(String(currentName).trim()) || String(currentName).trim();
    if (cleanCurName) {
      if (
        cleanCurName.toLowerCase() !== officialName.toLowerCase() ||
        cleanCurName.toUpperCase() === cleanSku
      ) {
        hasNameMismatch = true;
      }
    } else if (officialName) {
      hasNameMismatch = true;
    }
  }

  const normalizeComparableSize = (val: string): string => {
    const token = extractCleanSizeToken(val).toUpperCase();
    if (!token || token === '-' || token === 'DEFAULT' || token === 'ALL SIZE' || token === 'ALLSIZE') {
      return 'ALL';
    }
    return token;
  };

  let hasSizeMismatch = false;
  if (currentSize !== undefined && currentSize !== null) {
    const cleanCurSize = String(currentSize).trim();
    if (officialSize && officialSize !== '-') {
      const normCur = normalizeComparableSize(cleanCurSize);
      const normOff = normalizeComparableSize(officialSize);
      if (!cleanCurSize || cleanCurSize === '-' || normCur !== normOff) {
        hasSizeMismatch = true;
      }
    }
  }

  return {
    found: true,
    sku: cleanSku,
    nama_produk: officialName || cleanSku,
    size: officialSize || '-',
    dealposQty,
    category,
    masterItem: master,
    hasNameMismatch,
    hasSizeMismatch,
  };
}

/**
 * Standardize an item's nama_produk and size by looking up against Master Product.
 * If SKU exists in Master Product, overrides nama_produk and size with official values.
 */
export function alignItemWithMasterProduct<
  T extends { sku?: string; nama_produk?: string; size?: string }
>(item: T, catalogOrMap: ProductItem[] | Map<string, ProductItem>): T {
  if (!item || !item.sku) return item;

  const lookup = lookupProductBySku(item.sku, catalogOrMap, item.nama_produk, item.size);
  if (lookup.found) {
    return {
      ...item,
      nama_produk: lookup.nama_produk,
      size: lookup.size,
    };
  }
  return item;
}
