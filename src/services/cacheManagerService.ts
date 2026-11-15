import { getLocalDb, isIndexedDBSupported } from './localDb';
import { clearDeltaSyncCache } from './gasSync';

export type CacheStoreName =
  | 'products'
  | 'inventory_stocks'
  | 'meta'
  | 'shopee_orders'
  | 'website_orders'
  | 'sj_drafts';

export interface CacheModuleDef {
  id: string;
  label: string;
  description: string;
  /** True jika data hanya tersimpan lokal di browser (mis. import Shopee/Website), bukan mirror dari server */
  isLocalOnly?: boolean;
  localStorageKeys?: string[];
  idbStores?: CacheStoreName[];
  deltaSyncSheets?: string[];
  includesPwaCache?: boolean;
}

export interface CacheModuleStats {
  id: string;
  bytes: number;
  idbCount: number;
}

export const CACHE_MODULES: CacheModuleDef[] = [
  {
    id: 'katalog_stok',
    label: 'Katalog Produk & Stok Inventory',
    description: 'Database produk master, stok rak realtime, dan cache pencarian katalog.',
    idbStores: ['products', 'inventory_stocks', 'meta'],
    localStorageKeys: [
      'wms_product_cache',
      'wms_stok_real_fisik_light',
      'wms_stok_real_fisik_cache',
      'wms_katalog_search_cache',
      'wms_cache_inventory_v38',
      'wms_inventory_stock_cache',
      'wms_master_products_last_sync',
    ],
    deltaSyncSheets: ['master_produk', 'stok_real', 'address_book'],
  },
  {
    id: 'picking',
    label: 'Tugas Picking & Antrean',
    description: 'Cache daftar tugas picking dan antrean picking list.',
    localStorageKeys: ['wms_raw_picking_list_cache', 'wms_picking_cache'],
    deltaSyncSheets: ['picking_list'],
  },
  {
    id: 'mutasi',
    label: 'Mutasi Log',
    description: 'Cache riwayat keluar/masuk barang dan delta sync mutasi.',
    localStorageKeys: ['wms_mutasi_cache'],
    deltaSyncSheets: ['mutasi_log'],
  },
  {
    id: 'pesanan_store',
    label: 'Manual Shipment & Distribusi Store',
    description: 'Cache pesanan manual shipment dan tarikan MD distribusi store.',
    localStorageKeys: ['wms_cached_manual_shipments', 'wms_cached_tarikanmd'],
    deltaSyncSheets: ['manual_shipment', 'Manual Shipment', 'tarikan_md', 'Tarikan MD'],
  },
  {
    id: 'opname_sj',
    label: 'Stock Opname & Pengecekan SJ',
    description: 'Cache antrean stock opname, staging scan, dan delta sync pengecekan SJ.',
    localStorageKeys: ['wms_staging_scan_cache'],
    deltaSyncSheets: ['stock_opname_queue', 'pengecekan_sj'],
  },
  {
    id: 'produksi_qc',
    label: 'Produksi, Trello UP & Draft QC',
    description: 'Cache metrik produksi, katalog Trello UP, dan draft form laporan QC.',
    localStorageKeys: [
      'wms_produksi_matrix_metrics_cache',
      'wms_trello_up_catalog_cache',
      'wms_qc_form_draft',
    ],
  },
  {
    id: 'dashboard_peminjaman',
    label: 'Dashboard & Peminjaman',
    description: 'Cache metrik dashboard, antrean recount, dan cache/draft peminjaman.',
    localStorageKeys: [
      'wms_dashboard_lean_metrics_v4',
      'wms_recount_selected_queue',
      'wms_peminjaman_cache',
      'wms_peminjaman_active_draft',
    ],
  },
  {
    id: 'shopee_orders',
    label: 'Pesanan Shopee (Data Lokal)',
    description: 'Data pesanan hasil import file Shopee di browser ini. Perlu import ulang jika dihapus.',
    isLocalOnly: true,
    idbStores: ['shopee_orders'],
  },
  {
    id: 'website_orders',
    label: 'Pesanan Website (Data Lokal)',
    description: 'Data pesanan website yang tersimpan lokal di browser ini.',
    isLocalOnly: true,
    idbStores: ['website_orders'],
  },
  {
    id: 'sj_drafts_local',
    label: 'Draft Pengecekan SJ (Data Lokal)',
    description: 'Draft sementara hasil scan pengecekan Surat Jalan yang belum selesai.',
    isLocalOnly: true,
    idbStores: ['sj_drafts'],
  },
  {
    id: 'pwa_bundle',
    label: 'Cache Aplikasi & Service Worker (PWA)',
    description: 'Cache file statis browser & sessionStorage sementara (tidak menghapus login).',
    includesPwaCache: true,
  },
];

async function clearIdbObjectStore(storeName: CacheStoreName): Promise<void> {
  if (!isIndexedDBSupported()) return;
  try {
    const db = await getLocalDb();
    if (!db.objectStoreNames.contains(storeName)) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`[CacheManager] Gagal membersihkan store ${storeName}:`, err);
  }
}

async function countIdbObjectStore(storeName: CacheStoreName): Promise<number> {
  if (!isIndexedDBSupported()) return 0;
  try {
    const db = await getLocalDb();
    if (!db.objectStoreNames.contains(storeName)) return 0;
    return await new Promise<number>((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).count();
      req.onsuccess = () => resolve(typeof req.result === 'number' ? req.result : 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

export async function getCacheModulesStats(): Promise<Record<string, CacheModuleStats>> {
  const result: Record<string, CacheModuleStats> = {};

  await Promise.all(
    CACHE_MODULES.map(async (mod) => {
      let bytes = 0;
      if (typeof window !== 'undefined' && window.localStorage && mod.localStorageKeys) {
        for (const key of mod.localStorageKeys) {
          try {
            const val = localStorage.getItem(key);
            if (val) bytes += val.length * 2;
          } catch {}
        }
      }

      let idbCount = 0;
      if (mod.idbStores) {
        const counts = await Promise.all(mod.idbStores.map((s) => countIdbObjectStore(s)));
        idbCount = counts.reduce((sum, c) => sum + c, 0);
      }

      result[mod.id] = { id: mod.id, bytes, idbCount };
    })
  );

  return result;
}

export function formatCacheBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export async function clearCacheModules(moduleIds: string[]): Promise<{
  clearedLabels: string[];
  clearedPwa: boolean;
}> {
  const targetSet = new Set(moduleIds);
  const targets = CACHE_MODULES.filter((m) => targetSet.has(m.id));
  const clearedLabels: string[] = [];
  let clearedPwa = false;

  for (const mod of targets) {
    if (mod.idbStores) {
      for (const store of mod.idbStores) {
        await clearIdbObjectStore(store);
      }
    }

    if (typeof window !== 'undefined' && window.localStorage && mod.localStorageKeys) {
      for (const key of mod.localStorageKeys) {
        try {
          localStorage.removeItem(key);
        } catch {}
      }
    }

    if (mod.deltaSyncSheets) {
      for (const sheet of mod.deltaSyncSheets) {
        await clearDeltaSyncCache(sheet).catch(() => {});
      }
    }

    if (mod.includesPwaCache && typeof window !== 'undefined') {
      clearedPwa = true;
      try {
        sessionStorage.clear();
      } catch {}
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
        } catch {}
      }
    }

    clearedLabels.push(mod.label);
  }

  return { clearedLabels, clearedPwa };
}

export async function clearAllSafeModuleCaches(): Promise<{
  clearedLabels: string[];
  clearedPwa: boolean;
}> {
  const safeIds = CACHE_MODULES.filter((m) => !m.isLocalOnly).map((m) => m.id);
  return clearCacheModules(safeIds);
}
