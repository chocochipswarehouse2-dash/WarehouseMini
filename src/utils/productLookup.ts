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

/**
 * Creates a fast O(1) indexed Map from product catalog (cached by array reference via WeakMap)
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
        const dash = cleanSku.indexOf('-');
        if (dash > 0) {
          const pfx = cleanSku.slice(0, dash).trim();
          if (pfx && !map.has(pfx)) map.set(pfx, item);
        }
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
 */
export function lookupProductBySku(
  rawSku: string | null | undefined,
  catalogOrMap: ProductItem[] | Map<string, ProductItem>,
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
  let hasProvidedCatalog = false;

  if (catalogOrMap instanceof Map) {
    hasProvidedCatalog = catalogOrMap.size > 0;
    master = catalogOrMap.get(cleanSku);
  } else if (Array.isArray(catalogOrMap)) {
    hasProvidedCatalog = catalogOrMap.length > 0;
    if (hasProvidedCatalog) {
      const map = buildProductLookupMap(catalogOrMap);
      master = map.get(cleanSku);
    }
  }

  // Fallback to cached localStorage map ONLY when no in-memory catalog was provided
  if (!master && !hasProvidedCatalog) {
    master = getFallbackLocalStorageMap().get(cleanSku);
  }

  if (!master) {
    return {
      found: false,
      sku: cleanSku,
      nama_produk: currentName ? String(currentName).trim() : cleanSku,
      size: currentSize ? String(currentSize).trim() : '-',
      dealposQty: 0,
    };
  }

  const officialName = String(
    master.p || master.n || (master as any).nama_produk || ''
  ).trim();

  const officialSize = String(
    master.s || (master as any).size || '-'
  ).trim();

  const dealposQty = Number(master.q) || 0;
  const category = (master.c || master.category || '') as string;

  // Check mismatches against current data:
  // "Nama produk dan size hasil kalkulasi/input data yang tidak sesuai dengan master produk = anomali"
  let hasNameMismatch = false;
  if (currentName !== undefined && currentName !== null) {
    const cleanCurName = String(currentName).trim();
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

  let hasSizeMismatch = false;
  if (currentSize !== undefined && currentSize !== null) {
    const cleanCurSize = String(currentSize).trim();
    if (officialSize && officialSize !== '-') {
      if (
        !cleanCurSize ||
        cleanCurSize === '-' ||
        cleanCurSize.toUpperCase() !== officialSize.toUpperCase()
      ) {
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
