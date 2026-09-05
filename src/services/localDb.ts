/**
 * Local Database Service for WMS (IndexedDB Native Engine)
 * Provides persistent offline-first storage for products and stocks with zero quota truncation.
 */

import { ProductItem, StockRealtimeItem } from '../types';
import { isDummyProduct } from './supabase';

const DB_NAME = 'WMS_LOCAL_DB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Check if IndexedDB is supported in the current environment
 */
export function isIndexedDBSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
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
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

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
      dbPromise = null;
      const error = (event.target as IDBOpenDBRequest).error;
      console.error('Failed to open IndexedDB:', error);
      reject(error || new Error('Unknown IndexedDB open error'));
    };

    request.onblocked = () => {
      console.warn('IndexedDB open blocked: please close other tabs running the app');
    };
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
    console.error('Error saving products to local database:', err);
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
 */
export async function saveInventoryStocksToLocalDb(stocks: StockRealtimeItem[]): Promise<void> {
  if (!Array.isArray(stocks) || stocks.length === 0) return;

  try {
    const db = await getLocalDb();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('inventory_stocks', 'readwrite');
      const store = transaction.objectStore('inventory_stocks');
      store.clear();

      for (let i = 0; i < stocks.length; i++) {
        const item = stocks[i];
        const recordId = item.id || `${item.sku}_${item.lokasi}_${i}`;
        store.put({ ...item, id: recordId });
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
 */
export async function getAllInventoryStocksFromLocalDb(): Promise<StockRealtimeItem[]> {
  try {
    const db = await getLocalDb();
    return new Promise<StockRealtimeItem[]>((resolve, reject) => {
      const transaction = db.transaction('inventory_stocks', 'readonly');
      const store = transaction.objectStore('inventory_stocks');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
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
        resolve(result ? result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
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
