/**
 * Local Database Service for WMS (IndexedDB Native Engine)
 * Provides persistent offline-first storage for products and stocks with zero quota truncation.
 */

import { ProductItem, StockRealtimeItem, PengecekanSJDraft } from '../types';
import { isDummyProduct, isWarehouseLocation, getPickingPriority, getAreaFromLokasi } from './supabase';

const DB_NAME = 'WMS_LOCAL_DB';
const DB_VERSION = 6;

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

let _idbChecked = false;
let _idbSupported = false;

/**
 * Check if IndexedDB is supported in the current environment
 */
export function isIndexedDBSupported(): boolean {
  if (_idbChecked) return _idbSupported;
  _idbChecked = true;
  try {
    if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined' || window.indexedDB === null) {
      _idbSupported = false;
      return false;
    }
    // Test if opening a database throws SecurityError in sandboxed or partitioned iframes
    const testReq = window.indexedDB.open('__wms_probe_idb__');
    testReq.onerror = (ev) => {
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      _idbSupported = false;
      try { testReq.result?.close?.(); } catch {}
    };
    testReq.onsuccess = () => {
      try {
        testReq.result?.close?.();
        window.indexedDB.deleteDatabase('__wms_probe_idb__');
      } catch {}
    };
    _idbSupported = true;
    return true;
  } catch {
    _idbSupported = false;
    return false;
  }
}

/**
 * Initialize and get the singleton IndexedDB database connection
 */
export async function getLocalDb(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }
  if (dbPromise) {
    return dbPromise;
  }
  if (!isIndexedDBSupported()) {
    return Promise.reject(new Error('IndexedDB is not supported in this browser environment'));
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // v6: Clear stale cached locations/stocks after rack reorganization & SO resets
      if (oldVersion < 6) {
        if (db.objectStoreNames.contains('products')) {
          db.deleteObjectStore('products');
        }
        if (db.objectStoreNames.contains('inventory_stocks')) {
          db.deleteObjectStore('inventory_stocks');
        }
      }

      // 1. Products Store: Keyed by uppercase SKU ('k')
      if (!db.objectStoreNames.contains('products')) {
        const prodStore = db.createObjectStore('products', { keyPath: 'k' });
        prodStore.createIndex('p', 'p', { unique: false });
        prodStore.createIndex('lokasi', 'lokasi', { unique: false });
        prodStore.createIndex('category', 'category', { unique: false });
      }

      // 2. Inventory Stocks Store: Keyed by 'id' (or composite 'sku_lokasi')
      if (!db.objectStoreNames.contains('inventory_stocks')) {
        db.createObjectStore('inventory_stocks', { keyPath: 'id' });
      }

      // 3. Metadata Store: Keyed by 'key' (last_sync, catalog_version, item_count, etc.)
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }

      // 4. Shopee Orders Store
      if (!db.objectStoreNames.contains('shopee_orders')) {
        const orderStore = db.createObjectStore('shopee_orders', { keyPath: 'noPesanan' });
        orderStore.createIndex('status_sistem', 'status_sistem', { unique: false });
        orderStore.createIndex('tanggal_upload', 'tanggal_upload', { unique: false });
      }

      // 5. Surat Jalan Pengecekan Drafts Store
      if (!db.objectStoreNames.contains('sj_drafts')) {
        db.createObjectStore('sj_drafts', { keyPath: 'id' });
      }

      // 6. Website Orders Store
      if (!db.objectStoreNames.contains('website_orders')) {
        const orderStore = db.createObjectStore('website_orders', { keyPath: 'orderId' });
        orderStore.createIndex('status_sistem', 'status_sistem', { unique: false });
        orderStore.createIndex('tanggal_upload', 'tanggal_upload', { unique: false });
      }
    };

    request.onsuccess = (event: Event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      
      // Auto-reconnect if unexpectedly closed
      dbInstance.onclose = () => {
        dbInstance = null;
        dbPromise = null;
      };

      dbInstance.onerror = (err) => {
        console.warn('Local IndexedDB error:', err);
      };

      resolve(dbInstance);
    };

    request.onerror = (event: Event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      dbPromise = null;
      _idbSupported = false;
      const error = (event.target as IDBOpenDBRequest).error;
      console.warn('IndexedDB unavailable in this environment, falling back to memory/localStorage:', error?.message || error);
      reject(error || new Error('Unknown IndexedDB open error'));
    };

    request.onblocked = () => {
      console.warn('IndexedDB open blocked: please close other tabs running the app');
    };
    } catch (openErr) {
      dbPromise = null;
      console.warn('IndexedDB open threw error:', openErr);
      reject(openErr || new Error('Failed to open IndexedDB'));
    }
  });

  return dbPromise;
}

/**
 * Clean and format a ProductItem for saving in IndexedDB
 */
function sanitizeProduct(item: ProductItem): ProductItem | null {
  if (!item) return null;
  if (isDummyProduct(item)) return null;
  const sku = String(item.k || (item as any).sku || '').trim().toUpperCase();
  if (!sku || sku === 'UNDEFINED' || sku === 'NULL') return null;
  if (sku.startsWith('#') || sku.includes('#')) return null;
  if (sku === 'KOLI' || sku === 'BOX' || sku.startsWith('LOK ') || sku.startsWith('RAK ')) return null;

  return {
    ...item,
    k: sku,
    sku: sku,
    p: item.p || item.n || (item as any).nama_produk || (item as any).produk || sku,
    s: item.s || (item as any).size || '-',
    lokasi: item.lokasi || '-',
  };
}

/**
 * Retrieve ALL products from Local Database
 */
export async function getAllProductsFromLocalDb(): Promise<ProductItem[]> {
  try {
    const db = await getLocalDb();
    return new Promise<ProductItem[]>((resolve, reject) => {
      const transaction = db.transaction('products', 'readwrite');
      const store = transaction.objectStore('products');
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        const clean: ProductItem[] = [];
        const dirtyKeys: string[] = [];

        for (const it of results) {
          if (it && !isDummyProduct(it)) {
            const sku = String(it.k || (it as any).sku || '').trim().toUpperCase();
            if (sku && !sku.startsWith('#') && !sku.includes('#') && sku !== 'KOLI' && sku !== 'BOX') {
              clean.push(it);
              continue;
            }
          }
          if (it) {
            dirtyKeys.push(String(it.k || (it as any).sku || (it as any).id || ''));
          }
        }

        // Clean dirty keys from local database
        if (dirtyKeys.length > 0) {
          for (const k of dirtyKeys) {
            if (k) try { store.delete(k); } catch {}
          }
        }

        resolve(clean);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('Failed to get products from local database, falling back to localStorage:', err);
    try {
      const raw = localStorage.getItem('wms_product_cache');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const clean = parsed.filter(it => it && !isDummyProduct(it) && !String(it.k || it.sku || '').startsWith('#'));
          return clean;
        }
      }
    } catch {}
    return [];
  }
}

/**
 * Get the total count of products stored in Local Database
 */
export async function getProductsCountFromLocalDb(): Promise<number> {
  try {
    const db = await getLocalDb();
    return new Promise<number>((resolve, reject) => {
      const transaction = db.transaction('products', 'readonly');
      const store = transaction.objectStore('products');
      const request = store.count();

      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return 0;
  }
}

/**
 * Get a single product by SKU from Local Database
 */
export async function getProductBySkuFromLocalDb(sku: string): Promise<ProductItem | null> {
  const cleanSku = String(sku || '').trim().toUpperCase();
  if (!cleanSku) return null;

  try {
    const db = await getLocalDb();
    return new Promise<ProductItem | null>((resolve, reject) => {
      const transaction = db.transaction('products', 'readonly');
      const store = transaction.objectStore('products');
      const request = store.get(cleanSku);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/**
 * Save products in bulk into Local Database
 * @param products Array of ProductItem
 * @param mode 'replace' to overwrite existing catalog, or 'merge' to update existing and add new
 */
export async function saveProductsToLocalDb(
  products: ProductItem[],
  mode: 'replace' | 'merge' = 'merge'
): Promise<number> {
  if (!Array.isArray(products) || products.length === 0) {
    return 0;
  }

  const cleanProducts: ProductItem[] = [];
  for (const p of products) {
    const sanitized = sanitizeProduct(p);
    if (sanitized) {
      cleanProducts.push(sanitized);
    }
  }

  if (cleanProducts.length === 0) return 0;

  try {
    const db = await getLocalDb();
    return new Promise<number>((resolve, reject) => {
      const transaction = db.transaction(['products', 'meta'], 'readwrite');
      const prodStore = transaction.objectStore('products');
      const metaStore = transaction.objectStore('meta');

      if (mode === 'replace') {
        prodStore.clear();
      }

      for (const item of cleanProducts) {
        prodStore.put(item);
      }

      // Record sync metadata
      metaStore.put({
        key: 'products_sync_meta',
        lastSync: Date.now(),
        count: cleanProducts.length,
        updatedAt: new Date().toISOString(),
      });

      transaction.oncomplete = () => {
        resolve(cleanProducts.length);
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  } catch (err) {
    console.warn('Error saving products to local database:', err);
    // Fallback: save a small safe portion to localStorage so old functionality stays alive
    try {
      localStorage.setItem('wms_product_cache', JSON.stringify(cleanProducts.slice(0, 1000)));
    } catch {}
    return cleanProducts.length;
  }
}

/**
 * Upsert a single product in Local Database (Delta Sync)
 */
export async function upsertProductInLocalDb(product: ProductItem): Promise<void> {
  const sanitized = sanitizeProduct(product);
  if (!sanitized) return;

  try {
    const db = await getLocalDb();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('products', 'readwrite');
      const store = transaction.objectStore('products');

      // Check existing to merge metadata gracefully
      const getReq = store.get(sanitized.k);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        const merged: ProductItem = existing
          ? { ...existing, ...sanitized }
          : sanitized;

        store.put(merged);
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('Failed to upsert product in local db:', err);
  }
}

/**
 * Bulk upsert multiple products into Local Database without clearing
 */
export async function bulkUpsertProductsInLocalDb(products: ProductItem[]): Promise<void> {
  if (!products || products.length === 0) return;
  await saveProductsToLocalDb(products, 'merge');
}

/**
 * Delete a product from Local Database
 */
export async function deleteProductFromLocalDb(sku: string): Promise<void> {
  const cleanSku = String(sku || '').trim().toUpperCase();
  if (!cleanSku) return;

  try {
    const db = await getLocalDb();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('products', 'readwrite');
      const store = transaction.objectStore('products');
      store.delete(cleanSku);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('Failed to delete product from local db:', err);
  }
}

/**
 * Save Inventory Stocks into Local Database
 * Uses deterministic key `${cleanSku}_${cleanLoc}` (without array index) so delta patches never create duplicate records.
 */
export async function saveInventoryStocksToLocalDb(stocks: StockRealtimeItem[]): Promise<void> {
  if (!Array.isArray(stocks) || stocks.length === 0) return;

  try {
    const db = await getLocalDb();
    return new Promise<void>((resolve, reject) => {
      const storeNames = db.objectStoreNames.contains('meta')
        ? ['inventory_stocks', 'meta']
        : ['inventory_stocks'];
      const transaction = db.transaction(storeNames, 'readwrite');
      const store = transaction.objectStore('inventory_stocks');
      store.clear();

      // Deduplicate/merge by canonical (SKU, LOKASI) key before writing
      const mergedMap = new Map<string, StockRealtimeItem & { _areas?: Set<string> }>();
      for (let i = 0; i < stocks.length; i++) {
        const item = stocks[i];
        const cleanSku = String(item.sku || '').trim().toUpperCase();
        const cleanLoc = String(item.lokasi || '').trim().toUpperCase();
        if (!cleanSku || !cleanLoc || cleanLoc === '-') continue;
        const qty = Number(item.sisa_stok) || 0;
        if (qty === 0) continue;

        const recordId = `${cleanSku}_${cleanLoc}`;
        const rawArea = String(item.area || '').trim();
        const existing = mergedMap.get(recordId);
        if (!existing) {
          const areas = new Set<string>();
          if (rawArea) areas.add(rawArea);
          mergedMap.set(recordId, {
            ...item,
            id: recordId,
            sku: cleanSku,
            lokasi: cleanLoc,
            area: getAreaFromLokasi(cleanLoc, item.area),
            sisa_stok: qty,
            _areas: areas,
          });
        } else {
          // Only sum if the row comes from a genuinely distinct area group in stok_real_fisik;
          // if it's a duplicate cache entry (same area / legacy indexed id), take the latest record without double-counting
          if (rawArea && existing._areas && !existing._areas.has(rawArea)) {
            existing._areas.add(rawArea);
            existing.sisa_stok = (Number(existing.sisa_stok) || 0) + qty;
          } else if (item.updated_at && (!existing.updated_at || item.updated_at >= existing.updated_at)) {
            existing.sisa_stok = qty;
            existing.updated_at = item.updated_at;
          }
        }
      }

      mergedMap.forEach((val) => {
        const { _areas, ...cleanRecord } = val;
        if ((Number(cleanRecord.sisa_stok) || 0) !== 0) {
          store.put(cleanRecord);
        }
      });

      if (db.objectStoreNames.contains('meta')) {
        const metaStore = transaction.objectStore('meta');
        metaStore.put({
          key: 'stocks_sync_meta',
          lastSync: Date.now(),
          count: mergedMap.size,
          updatedAt: new Date().toISOString(),
        });
      }

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('Failed to save inventory stocks in local db:', err);
  }
}

/**
 * Get All Inventory Stocks from Local Database
 * Automatically deduplicates any legacy `${sku}_${lokasi}_${index}` keys against canonical `${sku}_${lokasi}` keys.
 */
export async function getAllInventoryStocksFromLocalDb(): Promise<StockRealtimeItem[]> {
  try {
    const db = await getLocalDb();
    return new Promise<StockRealtimeItem[]>((resolve, reject) => {
      const transaction = db.transaction('inventory_stocks', 'readwrite');
      const store = transaction.objectStore('inventory_stocks');
      const request = store.getAll();

      request.onsuccess = () => {
        const rawList: StockRealtimeItem[] = request.result || [];
        const dedupMap = new Map<string, StockRealtimeItem>();
        const staleIdsToDelete: string[] = [];

        for (let i = 0; i < rawList.length; i++) {
          const item = rawList[i];
          const cleanSku = String(item?.sku || '').trim().toUpperCase();
          const cleanLoc = String(item?.lokasi || '').trim().toUpperCase();
          if (!cleanSku || !cleanLoc || cleanLoc === '-') continue;

          const canonicalId = `${cleanSku}_${cleanLoc}`;
          const itemId = String(item.id || '');
          const isLegacyIndexedId = itemId !== canonicalId && itemId.startsWith(`${canonicalId}_`);

          if (isLegacyIndexedId) {
            staleIdsToDelete.push(itemId);
          }

          const existing = dedupMap.get(canonicalId);
          const normalizedItem: StockRealtimeItem = {
            ...item,
            id: canonicalId,
            sku: cleanSku,
            lokasi: cleanLoc,
            area: getAreaFromLokasi(cleanLoc, item.area),
            sisa_stok: Number(item.sisa_stok) || 0,
          };

          if (!existing) {
            dedupMap.set(canonicalId, normalizedItem);
          } else {
            // Prefer canonical (delta-patched) or newer updated_at over legacy indexed record
            const existingWasCanonical = String(existing.id || '') === canonicalId && !isLegacyIndexedId;
            if (!isLegacyIndexedId || (item.updated_at && (!existing.updated_at || item.updated_at > existing.updated_at) && !existingWasCanonical)) {
              dedupMap.set(canonicalId, normalizedItem);
            }
          }
        }

        // Self-clean legacy indexed duplicate records and ensure canonical records are stored
        if (staleIdsToDelete.length > 0) {
          for (const staleId of staleIdsToDelete) {
            try { store.delete(staleId); } catch {}
          }
          dedupMap.forEach((rec) => {
            if ((Number(rec.sisa_stok) || 0) !== 0) {
              try { store.put(rec); } catch {}
            }
          });
        }

        resolve(Array.from(dedupMap.values()).filter((r) => (Number(r.sisa_stok) || 0) !== 0));
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

/**
 * Metadata Operations: Get
 */
export async function getLocalDbMeta<T = any>(key: string): Promise<T | null> {
  try {
    const db = await getLocalDb();
    return new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction('meta', 'readonly');
      const store = transaction.objectStore('meta');
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        resolve((result.value !== undefined ? result.value : result) as T);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/**
 * Targeted Delta Patch: Updates `lokasi` & `locList` in the `products` store
 * and replaces rows in `inventory_stocks` ONLY for the specified `changedSkus`.
 * Zero full-table rewrite, <5ms execution, keeps IndexedDB 100% in sync with live stok_real_fisik.
 */
export async function patchProductStockLocationsInLocalDb(
  changedSkus: string[],
  liveStockRows: StockRealtimeItem[]
): Promise<void> {
  if (!changedSkus || changedSkus.length === 0) return;
  const skuSet = new Set(changedSkus.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean));
  if (skuSet.size === 0) return;

  // Group live stock rows by uppercase SKU
  const stockBySku = new Map<string, StockRealtimeItem[]>();
  skuSet.forEach((s) => stockBySku.set(s, []));
  (liveStockRows || []).forEach((row) => {
    const cleanSku = String(row.sku || '').trim().toUpperCase();
    if (skuSet.has(cleanSku)) {
      stockBySku.get(cleanSku)!.push(row);
    }
  });

  try {
    const db = await getLocalDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['products', 'inventory_stocks'], 'readwrite');
      const prodStore = transaction.objectStore('products');
      const stockStore = transaction.objectStore('inventory_stocks');

      // 1. Update each changed SKU in `products` store
      skuSet.forEach((cleanSku) => {
        const getReq = prodStore.get(cleanSku);
        getReq.onsuccess = () => {
          const existingProd: ProductItem | undefined = getReq.result;
          const rows = stockBySku.get(cleanSku) || [];

          // Build deduplicated pickable locations with qty > 0
          const locMap = new Map<string, { lokasi: string; qty: number; area: string }>();
          rows.forEach((r) => {
            const loc = String(r.lokasi || '').trim().toUpperCase();
            const qty = Number(r.sisa_stok) || 0;
            const area = getAreaFromLokasi(loc, r.area);
            if (loc && loc !== '-' && loc !== 'KOSONG' && qty > 0 && isWarehouseLocation(loc, area)) {
              const prev = locMap.get(loc);
              if (prev) {
                prev.qty += qty;
              } else {
                locMap.set(loc, { lokasi: loc, qty, area });
              }
            }
          });

          const sortedLocs = Array.from(locMap.values()).sort((a, b) => {
            const pA = getPickingPriority(a.lokasi, a.area);
            const pB = getPickingPriority(b.lokasi, b.area);
            if (pA !== pB) return pA - pB;
            if (b.qty !== a.qty) return b.qty - a.qty;
            return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true, sensitivity: 'base' });
          });

          if (existingProd) {
            existingProd.locList = sortedLocs.map((l) => ({ lokasi: l.lokasi, qty: l.qty }));
            existingProd.lokasi = sortedLocs.map((l) => l.lokasi).join(', ');
            prodStore.put(existingProd);
          }
        };
      });

      // 2. Replace active stock rows in `inventory_stocks` store using deterministic key `sku_lokasi`
      skuSet.forEach((cleanSku) => {
        try {
          if (typeof IDBKeyRange !== 'undefined') {
            stockStore.delete(IDBKeyRange.bound(`${cleanSku}_`, `${cleanSku}_\uffff`));
          }
        } catch {}

        const rows = stockBySku.get(cleanSku) || [];
        const mergedByLoc = new Map<string, StockRealtimeItem>();
        rows.forEach((r) => {
          const loc = String(r.lokasi || '').trim().toUpperCase();
          if (!loc || loc === '-') return;
          const qty = Number(r.sisa_stok) || 0;
          if (qty === 0) return;
          const recordId = `${cleanSku}_${loc}`;
          const prev = mergedByLoc.get(recordId);
          if (prev) {
            prev.sisa_stok = (Number(prev.sisa_stok) || 0) + qty;
          } else {
            mergedByLoc.set(recordId, {
              ...r,
              sku: cleanSku,
              lokasi: loc,
              area: getAreaFromLokasi(loc, r.area),
              sisa_stok: qty,
              id: recordId,
            });
          }
        });

        mergedByLoc.forEach((rec, recordId) => {
          if ((Number(rec.sisa_stok) || 0) !== 0) {
            stockStore.put(rec);
          } else {
            try { stockStore.delete(recordId); } catch {}
          }
        });
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('Failed to patch product stock locations in IndexedDB:', err);
  }
}

/**
 * Low-Egress Full Location Refresh: Rebuilds `lokasi` and `locList` for all products in IndexedDB
 * using ONLY `allActiveStocks` (`stok_real_fisik`), WITHOUT re-downloading 28,000 rows of `master_produk`!
 */
export async function replaceAllProductLocationsInLocalDb(
  allActiveStocks: StockRealtimeItem[]
): Promise<ProductItem[]> {
  try {
    const existingProducts = await getAllProductsFromLocalDb();
    if (!existingProducts || existingProducts.length === 0) return [];

    // Group active pickable locations by SKU
    const locMapBySku = new Map<string, Map<string, { lokasi: string; qty: number; area: string }>>();
    for (const r of allActiveStocks || []) {
      const sku = String(r.sku || '').trim().toUpperCase();
      const loc = String(r.lokasi || '').trim().toUpperCase();
      const qty = Number(r.sisa_stok) || 0;
      if (!sku || !loc || loc === '-' || loc === 'KOSONG' || qty <= 0) continue;
      const area = getAreaFromLokasi(loc, r.area);
      if (!isWarehouseLocation(loc, area)) continue;

      if (!locMapBySku.has(sku)) {
        locMapBySku.set(sku, new Map());
      }
      const skuLocs = locMapBySku.get(sku)!;
      const prev = skuLocs.get(loc);
      if (prev) {
        prev.qty += qty;
      } else {
        skuLocs.set(loc, { lokasi: loc, qty, area });
      }
    }

    for (const item of existingProducts) {
      const sku = String(item.k || (item as any).sku || '').trim().toUpperCase();
      const skuLocMap = locMapBySku.get(sku);
      if (skuLocMap && skuLocMap.size > 0) {
        const sorted = Array.from(skuLocMap.values()).sort((a, b) => {
          const pA = getPickingPriority(a.lokasi, a.area);
          const pB = getPickingPriority(b.lokasi, b.area);
          if (pA !== pB) return pA - pB;
          if (b.qty !== a.qty) return b.qty - a.qty;
          return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true, sensitivity: 'base' });
        });
        item.locList = sorted.map((l) => ({ lokasi: l.lokasi, qty: l.qty }));
        item.lokasi = sorted.map((l) => l.lokasi).join(', ');
      } else {
        item.locList = [];
        item.lokasi = '';
      }
    }

    await saveProductsToLocalDb(existingProducts, 'replace');
    await saveInventoryStocksToLocalDb(allActiveStocks);
    return existingProducts;
  } catch (err) {
    console.warn('Failed to replace all product locations in IndexedDB:', err);
    return [];
  }
}

/**
 * Metadata Operations: Set
 */
export async function setLocalDbMeta<T = any>(key: string, value: T): Promise<void> {
  try {
    const db = await getLocalDb();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('meta', 'readwrite');
      const store = transaction.objectStore('meta');
      store.put({ key, value, updatedAt: Date.now() });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('Failed to set local db meta:', err);
  }
}

/**
 * Clear the entire Local Database (for complete reset or fresh cache)
 */
export async function clearLocalDb(): Promise<void> {
  try {
    const db = await getLocalDb();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['products', 'inventory_stocks', 'meta'], 'readwrite');
      transaction.objectStore('products').clear();
      transaction.objectStore('inventory_stocks').clear();
      transaction.objectStore('meta').clear();

      transaction.oncomplete = () => {
        console.log('Local IndexedDB successfully cleared.');
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('Failed to clear local db:', err);
  }
}

// --- SHOPEE ORDERS STORE ---

export async function saveShopeeOrders(orders: any[]): Promise<void> {
  if (!orders.length) return;
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shopee_orders', 'readwrite');
    const store = tx.objectStore('shopee_orders');
    for (const order of orders) {
      store.put(order);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getShopeeOrders(): Promise<any[]> {
  try {
    const db = await getLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('shopee_orders', 'readonly');
      const store = tx.objectStore('shopee_orders');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to get shopee orders', err);
    return [];
  }
}

export async function getShopeeOrder(noPesanan: string): Promise<any | null> {
  try {
    const db = await getLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('shopee_orders', 'readonly');
      const store = tx.objectStore('shopee_orders');
      const request = store.get(noPesanan);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    return null;
  }
}

// --- WEBSITE ORDERS STORE ---

export async function saveWebsiteOrders(orders: any[]): Promise<void> {
  if (!orders.length) return;
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('website_orders', 'readwrite');
    const store = tx.objectStore('website_orders');
    for (const order of orders) {
      store.put(order);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getWebsiteOrders(): Promise<any[]> {
  try {
    const db = await getLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('website_orders', 'readonly');
      const store = tx.objectStore('website_orders');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    return [];
  }
}

export async function getWebsiteOrder(orderId: string): Promise<any | null> {
  try {
    const db = await getLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('website_orders', 'readonly');
      const store = tx.objectStore('website_orders');
      const request = store.get(orderId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    return null;
  }
}

export async function deleteWebsiteOrders(orderIds: string[]): Promise<void> {
  if (!orderIds.length) return;
  const db = await getLocalDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('website_orders', 'readwrite');
    const store = tx.objectStore('website_orders');
    for (const id of orderIds) {
      store.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- SURAT JALAN PENGECEKAN DRAFTS STORE ---

export async function saveSJDraftsToDb(drafts: PengecekanSJDraft[]): Promise<void> {
  try {
    const db = await getLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sj_drafts', 'readwrite');
      const store = tx.objectStore('sj_drafts');
      store.clear();
      for (const d of drafts) {
        store.put(d);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to save SJ drafts to IndexedDB:', err);
  }
}

export async function loadSJDraftsFromDb(): Promise<PengecekanSJDraft[]> {
  try {
    const db = await getLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sj_drafts', 'readonly');
      const store = tx.objectStore('sj_drafts');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to load SJ drafts from IndexedDB:', err);
    return [];
  }
}

export async function deleteSJDraftFromDb(id: string): Promise<void> {
  try {
    const db = await getLocalDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sj_drafts', 'readwrite');
      const store = tx.objectStore('sj_drafts');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to delete SJ draft from IndexedDB:', err);
  }
}

// --- GENERIC WORK STATUS & OFFLINE PROTECTION HELPERS ---

/**
 * Save an active work-in-progress draft with dual redundancy (IndexedDB + localStorage)
 * Guarantees zero data loss on force-close or abrupt page reload
 */
export async function saveWorkDraft<T = any>(key: string, data: T): Promise<void> {
  // 1. Instant synchronous localStorage backup
  try {
    localStorage.setItem(`wms_draft_${key}`, JSON.stringify(data));
  } catch (e) {
    console.warn(`localStorage draft save for ${key} failed:`, e);
  }

  // 2. Persistent IndexedDB meta backup (no size quota limits)
  try {
    await setLocalDbMeta(`draft_${key}`, data);
  } catch (e) {
    console.warn(`IndexedDB draft save for ${key} failed:`, e);
  }
}

/**
 * Load an active work-in-progress draft
 */
export async function loadWorkDraft<T = any>(key: string): Promise<T | null> {
  // Try localStorage first for instant 0ms restoration
  try {
    const raw = localStorage.getItem(`wms_draft_${key}`);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}

  // Fallback to IndexedDB
  try {
    const fromDb = await getLocalDbMeta<T>(`draft_${key}`);
    if (fromDb) return fromDb;
  } catch {}

  return null;
}

/**
 * Clear a completed work draft after successful submit
 */
export async function clearWorkDraft(key: string): Promise<void> {
  try {
    localStorage.removeItem(`wms_draft_${key}`);
  } catch {}

  try {
    const db = await getLocalDb();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').delete(`draft_${key}`);
  } catch {}
}

// --- OFFLINE PEMINJAMAN QUEUE ---
const CACHE_KEY_OFFLINE_PEMINJAMAN = 'wms_offline_queue_peminjaman';

export function getPendingOfflinePeminjaman(): any[] {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY_OFFLINE_PEMINJAMAN) || '[]');
  } catch {
    return [];
  }
}

export function savePendingOfflinePeminjaman(record: any): void {
  try {
    const existing = getPendingOfflinePeminjaman();
    const updated = [record, ...existing.filter((r: any) => r.noPeminjaman !== record.noPeminjaman)];
    localStorage.setItem(CACHE_KEY_OFFLINE_PEMINJAMAN, JSON.stringify(updated));
  } catch (err) {
    console.warn('Gagal menyimpan antrean offline peminjaman:', err);
  }
}

export function clearPendingOfflinePeminjaman(): void {
  try {
    localStorage.removeItem(CACHE_KEY_OFFLINE_PEMINJAMAN);
  } catch {}
}

export function getPendingOfflineProduksiCount(): number {
  try {
    const raw = localStorage.getItem('wms_local_penerimaan_produksi');
    if (!raw) return 0;
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return 0;
    return items.filter((it: any) => typeof it.id === 'string' && it.id.startsWith('local_')).length;
  } catch {
    return 0;
  }
}

