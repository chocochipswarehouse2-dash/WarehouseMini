/**
 * Anomaly Detection & Alignment Utilities for WMS Inventory
 *
 * Rules:
 * 1. SKU Lookup uses the Master Product catalog (master_produk) as the single source of truth.
 * 2. Nama produk & size asli dari master produk BUKAN anomali.
 * 3. Nama produk & size hasil kalkulasi / input data yang tidak sesuai dengan master produk = ANOMALI (MISMATCH_MASTER_DATA).
 * 4. SKU tidak sesuai master produk, atau tidak ada di master produk = ANOMALI (SKU_NOT_IN_MASTER).
 * 5. Qty anomali = qty minus di STOK FISIK rak gudang (< 0).
 * 6. Qty minus pada DealPOS (master produk) BUKAN anomali yang perlu kita sanitasi.
 */
import { ProductItem, StockRealtimeItem, LogProdukItem, UserSession } from '../types';
import { insertLogProduk, getStoredSupabaseConfig, invalidateStokFisikCache } from '../services/supabase';
import { buildProductLookupMap, lookupProductBySku } from './productLookup';

export type AnomalyCategory =
  | 'NEGATIVE_STOCK'        // Qty minus di stok fisik rak gudang
  | 'MISMATCH_MASTER_DATA'  // Nama produk / size tidak sesuai master produk
  | 'SKU_NOT_IN_MASTER'     // SKU tidak ada di master produk
  | 'SKU_CORRUPTED';        // SKU berformat rusak / diawali strip / catatan PO

export interface AnomalyLocationItem {
  lokasi: string;
  qty: number;
  area?: string;
}

export interface AnomalyItem {
  id: string;
  sku: string;
  nama_produk: string;
  size?: string;
  master_nama_produk?: string;
  master_size?: string;
  hasNameMismatch?: boolean;
  hasSizeMismatch?: boolean;
  categories: AnomalyCategory[];
  reasons: string[];
  recommendations: string[];
  locations: AnomalyLocationItem[];
  negativeLocations: AnomalyLocationItem[];
  totalFisikGudang: number;
  totalDealpos: number;
  rawCatalogItem?: any;
}

/**
 * Checks if a SKU is corrupted, poorly formatted, or accidental product title/notes
 */
export function isCorruptedSku(rawSku: string | null | undefined): boolean {
  if (!rawSku) return true;
  const sku = String(rawSku).trim().toUpperCase();

  // 1. Starts with dash, hyphen, underscore, tilde, dot, hashtag, asterisk, bullet, emoji
  if (
    sku.startsWith('-') ||
    sku.startsWith('–') ||
    sku.startsWith('—') ||
    sku.startsWith('_') ||
    sku.startsWith('~') ||
    sku.startsWith('.') ||
    sku.startsWith('#') ||
    sku.startsWith('*') ||
    sku.startsWith('•') ||
    sku.startsWith('📋') ||
    sku.startsWith('📦') ||
    sku.startsWith('>') ||
    sku.startsWith('🔢') ||
    sku.includes('#')
  ) {
    return true;
  }

  // 2. Pre-order, order notes, or broadcast headers mistakenly used as SKU
  if (
    sku.includes('PRE ORDER') ||
    sku.includes('PRE-ORDER') ||
    sku.startsWith('PO ') ||
    sku.includes('PEMBELIAN PRODUK') ||
    sku.includes('ORDER 14 HARI') ||
    sku.includes('TUGAS PICKING') ||
    sku.includes('SENT VIA') ||
    sku.includes('DAFTAR BARANG') ||
    sku.includes('NO SJ:') ||
    sku.includes('ASAL:') ||
    sku.includes('TUJUAN:') ||
    sku === 'KOLI' ||
    sku === 'BOX' ||
    sku === 'UNDEFINED' ||
    sku === 'NULL' ||
    sku.startsWith('LOK ') ||
    sku.startsWith('RAK ')
  ) {
    return true;
  }

  // 3. Length > 35 with multiple words (indicates full title or description stored in SKU field)
  const spaceCount = (sku.match(/\s/g) || []).length;
  if (sku.length > 35 && spaceCount >= 2) {
    return true;
  }

  return false;
}

/**
 * Checks if product name is missing or placeholder
 */
export function isMissingProductName(name?: string | null, sku?: string | null): boolean {
  if (!name) return true;
  const cleanName = String(name).trim().toLowerCase();
  const cleanSku = String(sku || '').trim().toLowerCase();
  if (
    cleanName === '' ||
    cleanName === cleanSku ||
    cleanName === 'undefined' ||
    cleanName === 'null' ||
    cleanName === 'sku tidak ditemukan'
  ) {
    return true;
  }
  return false;
}

/**
 * Scan real-time stocks against Master Product to identify all true data anomalies:
 * - Negative physical stock on warehouse racks (DealPOS quota minus is normal & excluded)
 * - Mismatched product name or size against Master Product (via SKU lookup)
 * - SKU not found in Master Product
 * - Corrupted SKU formats
 */
export function scanAnomalies(
  productCatalog: ProductItem[],
  stockList: StockRealtimeItem[]
): AnomalyItem[] {
  const anomaliesMap = new Map<string, AnomalyItem>();
  const catalogMap = buildProductLookupMap(productCatalog);

  // Group physical stock by SKU
  const stockBySku = new Map<string, StockRealtimeItem[]>();
  stockList.forEach((s) => {
    const rawSku = String(s.sku || '').trim();
    if (!rawSku) return;
    const skuUp = rawSku.toUpperCase();
    if (!stockBySku.has(skuUp)) stockBySku.set(skuUp, []);
    stockBySku.get(skuUp)!.push(s);
  });

  // Evaluate every SKU present in physical warehouse stock
  stockBySku.forEach((stocks, skuUp) => {
    const rawSku = stocks[0]?.sku || skuUp;
    const lookup = lookupProductBySku(rawSku, catalogMap);
    const master = lookup.masterItem;

    const locations: AnomalyLocationItem[] = stocks.map((s) => ({
      lokasi: s.lokasi || '-',
      qty: Number(s.sisa_stok) || 0,
      area: s.area,
    }));
    const negativeLocs = locations.filter((l) => l.qty < 0);
    const totalFisik = locations.reduce((sum, l) => sum + l.qty, 0);

    const categories: AnomalyCategory[] = [];
    const reasons: string[] = [];
    const recommendations: string[] = [];

    let hasNameMismatch = false;
    let hasSizeMismatch = false;

    // 1. QTY ANOMALY: Only negative physical stock on racks (DealPOS quota is normal & ignored)
    if (negativeLocs.length > 0) {
      categories.push('NEGATIVE_STOCK');
      const locStr = negativeLocs.map((l) => `${l.lokasi} (${l.qty})`).join(', ');
      reasons.push(`Stok rak fisik gudang bertanda minus di: ${locStr}`);
      recommendations.push(
        'Lakukan penyesuaian (1-Click Reset ke 0) untuk menetralkan mutasi keluar berlebih pada rak fisik'
      );
    }

    // 2. CORRUPTED SKU CHECK
    const isCorrupted = isCorruptedSku(rawSku);
    if (isCorrupted) {
      categories.push('SKU_CORRUPTED');
      reasons.push(
        rawSku.startsWith('-')
          ? 'SKU diawali tanda strip (-) yang merusak barcode'
          : rawSku.length > 35
          ? 'SKU terisi teks judul/deskripsi panjang alih-alih kode SKU standar'
          : 'SKU mengandung karakter simbol / tag non-standar'
      );
      recommendations.push('Periksa fisik barang di rak dan ganti kode SKU ke format resmi master');
    }

    // 3. SKU NOT IN MASTER PRODUCT
    if (!lookup.found) {
      if (!categories.includes('SKU_CORRUPTED')) {
        categories.push('SKU_NOT_IN_MASTER');
      }
      reasons.push(
        `SKU "${rawSku}" tidak terdaftar di Master Produk WMS (DealPOS/Database Pusat)`
      );
      recommendations.push(
        'Daftarkan SKU ini ke Master Produk WMS atau ubah kode SKU ke referensi master resmi'
      );
    } else {
      // 4. MISMATCH WITH MASTER PRODUCT (Nama & Size)
      // "Nama produk dan size hasil kalkulasi/input data yang tidak sesuai dengan master produk = anomali"
      const masterName = lookup.nama_produk;
      const masterSize = lookup.size;

      // Check if any physical stock item has a divergent name
      const stockNames = Array.from(
        new Set(stocks.map((s) => (s.nama_produk || '').trim()).filter(Boolean))
      );
      for (const curName of stockNames) {
        if (
          curName.toLowerCase() !== masterName.toLowerCase() ||
          curName.toUpperCase() === rawSku.toUpperCase()
        ) {
          hasNameMismatch = true;
          reasons.push(
            curName.toUpperCase() === rawSku.toUpperCase()
              ? `Nama produk pada data fisik masih berupa kode SKU, belum disinkronkan ke Master Produk ("${masterName}")`
              : `Nama produk pada data fisik ("${curName}") tidak sesuai dengan Master Produk ("${masterName}")`
          );
          break;
        }
      }

      // Check if any physical stock item has a divergent size
      const stockSizes = Array.from(
        new Set(stocks.map((s) => (s.size || '-').trim()).filter((sz) => sz !== '-'))
      );
      for (const curSize of stockSizes) {
        if (
          masterSize !== '-' &&
          (curSize === '-' || curSize.toUpperCase() !== masterSize.toUpperCase())
        ) {
          hasSizeMismatch = true;
          reasons.push(
            curSize === '-'
              ? `Size pada data fisik belum terisi, sedangkan di Master Produk adalah "${masterSize}"`
              : `Size pada data fisik ("${curSize}") tidak sesuai dengan Master Produk ("${masterSize}")`
          );
          break;
        }
      }

      if (hasNameMismatch || hasSizeMismatch) {
        categories.push('MISMATCH_MASTER_DATA');
        recommendations.push(
          'Gunakan tombol "1-Click Sinkronkan ke Master" untuk meluruskan nama & size via lookup SKU master produk'
        );
      }
    }

    if (categories.length > 0) {
      const activeName = master
        ? lookup.nama_produk
        : stocks[0]?.nama_produk || rawSku;
      const activeSize = master ? lookup.size : stocks[0]?.size || '-';

      anomaliesMap.set(skuUp, {
        id: `anomaly_${skuUp}`,
        sku: rawSku,
        nama_produk: activeName,
        size: activeSize,
        master_nama_produk: master ? lookup.nama_produk : undefined,
        master_size: master ? lookup.size : undefined,
        hasNameMismatch,
        hasSizeMismatch,
        categories,
        reasons,
        recommendations,
        locations,
        negativeLocations: negativeLocs,
        totalFisikGudang: totalFisik,
        totalDealpos: lookup.dealposQty, // Informational only; NOT counted as anomaly
        rawCatalogItem: master || null,
      });
    }
  });

  return Array.from(anomaliesMap.values());
}

/**
 * 1-Click Fix for Negative Rack Stock:
 * Inserts an adjustment log into Supabase log_produk to bring the rack balance to exactly 0.
 */
export async function fixNegativeStock(
  sku: string,
  lokasi: string,
  negativeQty: number,
  nama_produk?: string,
  size?: string,
  userSession?: UserSession | null,
  area?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const fixQty = Math.abs(negativeQty);
    if (fixQty === 0) return { success: true, message: 'Stok sudah 0' };

    const operatorName = userSession?.name || userSession?.username || 'Admin WMS';
    const cleanLokasi = (lokasi || 'WH').trim();

    const log: LogProdukItem = {
      type: 'ADJ_IN',
      invoice: `ADJ-FIX-${Date.now().toString().slice(-6)}`,
      sku: sku.trim().toUpperCase(),
      nama_produk: nama_produk || sku,
      size: size || '-',
      area: area || 'Gudang Utama',
      lokasi: cleanLokasi,
      qty: fixQty,
      operator: operatorName,
      keterangan: `Penyesuaian Anomali Stok Minus (${negativeQty}) menjadi 0 via Anomaly Hub`,
      created_at: new Date().toISOString(),
    };

    await insertLogProduk([log]);

    return {
      success: true,
      message: `Berhasil menetralkan stok minus di rak ${cleanLokasi} (+${fixQty})`,
    };
  } catch (err: any) {
    console.error('Error fixing negative stock:', err);
    return {
      success: false,
      message: err.message || 'Gagal memperbaiki stok minus di database',
    };
  }
}

/**
 * Batch Fix all negative stocks in the provided anomaly list
 */
export async function batchFixAllNegativeStocks(
  anomalies: AnomalyItem[],
  userSession?: UserSession | null,
  onProgress?: (done: number, total: number) => void
): Promise<{ success: boolean; fixedCount: number; errors: string[] }> {
  const itemsWithNegative: Array<{
    sku: string;
    lokasi: string;
    qty: number;
    nama_produk: string;
    size?: string;
    area?: string;
  }> = [];

  anomalies.forEach((a) => {
    a.negativeLocations.forEach((loc) => {
      itemsWithNegative.push({
        sku: a.sku,
        lokasi: loc.lokasi,
        qty: loc.qty,
        nama_produk: a.nama_produk,
        size: a.size,
        area: loc.area,
      });
    });
  });

  if (itemsWithNegative.length === 0) {
    return { success: true, fixedCount: 0, errors: [] };
  }

  const logs: LogProdukItem[] = [];
  const operatorName = userSession?.name || userSession?.username || 'Admin WMS';
  const now = new Date().toISOString();
  const batchInvoice = `ADJ-BATCH-${Date.now().toString().slice(-6)}`;

  itemsWithNegative.forEach((item) => {
    const fixQty = Math.abs(item.qty);
    logs.push({
      type: 'ADJ_IN',
      invoice: batchInvoice,
      sku: item.sku.trim().toUpperCase(),
      nama_produk: item.nama_produk,
      size: item.size || '-',
      area: item.area || 'Gudang Utama',
      lokasi: item.lokasi,
      qty: fixQty,
      operator: operatorName,
      keterangan: `Penyesuaian Otomatis Batch Anomali Stok Minus (${item.qty}) menjadi 0`,
      created_at: now,
    });
  });

  try {
    await insertLogProduk(logs);
    if (onProgress) onProgress(logs.length, logs.length);
    return { success: true, fixedCount: logs.length, errors: [] };
  } catch (err: any) {
    console.error('Failed to batch fix negative stocks:', err);
    return {
      success: false,
      fixedCount: 0,
      errors: [err.message || 'Gagal menyimpan penyesuaian batch ke Supabase'],
    };
  }
}

/**
 * 1-Click Fix: Synchronize stock name and size with official Master Product data
 */
export async function syncStockWithMaster(
  sku: string,
  masterName: string,
  masterSize: string
): Promise<{ success: boolean; message: string }> {
  try {
    const cleanSku = sku.trim().toUpperCase();
    const config = getStoredSupabaseConfig();

    // 1. Update localStorage caches
    const cacheKeys = ['wms_local_stok', 'wms_realtime_stocks', 'wms_local_products'];
    cacheKeys.forEach((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            let changed = false;
            arr.forEach((it: any) => {
              if (String(it.sku || it.k || '').trim().toUpperCase() === cleanSku) {
                it.nama_produk = masterName;
                it.size = masterSize;
                it.p = masterName;
                it.s = masterSize;
                changed = true;
              }
            });
            if (changed) {
              localStorage.setItem(key, JSON.stringify(arr));
            }
          }
        }
      } catch {}
    });

    // 2. Patch Supabase log_produk for this SKU so stok_real_fisik view is updated
    if (config?.url && config?.key) {
      const url = config.url.replace(/\/$/, '');
      const key = config.key;
      try {
        await fetch(`${url}/rest/v1/log_produk?sku=eq.${encodeURIComponent(cleanSku)}`, {
          method: 'PATCH',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            nama_produk: masterName,
            size: masterSize,
          }),
        });

        // Also patch perbaikan_tickets if present
        await fetch(`${url}/rest/v1/perbaikan_tickets?sku=eq.${encodeURIComponent(cleanSku)}`, {
          method: 'PATCH',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            nama_produk: masterName,
          }),
        }).catch(() => null);
      } catch (e) {
        console.warn('Could not patch Supabase log_produk:', e);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wms_inventory_updated'));
      window.dispatchEvent(new CustomEvent('wms_stock_updated'));
    }

    return {
      success: true,
      message: `Berhasil menyelaraskan "${cleanSku}" ke data Master Produk: ${masterName} (${masterSize})`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Gagal menyelaraskan data dengan master produk',
    };
  }
}

/**
 * Batch synchronize all items with MISMATCH_MASTER_DATA
 */
export async function batchSyncAllWithMaster(
  anomalies: AnomalyItem[],
  onProgress?: (done: number, total: number) => void
): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
  const mismatchItems = anomalies.filter(
    (a) => a.categories.includes('MISMATCH_MASTER_DATA') && a.master_nama_produk
  );

  let syncedCount = 0;
  const errors: string[] = [];

  // 1. Bulk Update LocalStorage ONCE
  const cacheKeys = [
    'wms_master_produk',
    'wms_local_products',
    'wms_dealpos_products_cache',
    'wms_catalog_cache',
  ];

  const updateMap = new Map<string, {name: string, size: string}>();
  for (const item of mismatchItems) {
    updateMap.set(item.sku.trim().toUpperCase(), {
      name: item.master_nama_produk || item.nama_produk,
      size: item.master_size || item.size || '-'
    });
  }

  cacheKeys.forEach((key) => {
    try {
      const str = localStorage.getItem(key);
      if (str) {
        const arr = JSON.parse(str);
        if (Array.isArray(arr)) {
          let changed = false;
          arr.forEach((it: any) => {
            const clean = String(it.k || it.sku || '').trim().toUpperCase();
            const master = updateMap.get(clean);
            if (master) {
              it.nama_produk = master.name;
              it.size = master.size;
              it.p = master.name;
              it.s = master.size;
              changed = true;
            }
          });
          if (changed) {
            localStorage.setItem(key, JSON.stringify(arr));
          }
        }
      }
    } catch {}
  });

  // 2. Bulk Update Supabase (using concurrent requests)
  const config = getStoredSupabaseConfig();
  if (config?.url && config?.key) {
    const url = config.url.replace(/\/$/, '');
    const key = config.key;

    // Process in batches of 3 concurrent requests to prevent UI hanging and browser throttling
    const concurrencyLimit = 3;
    for (let i = 0; i < mismatchItems.length; i += concurrencyLimit) {
      const chunk = mismatchItems.slice(i, i + concurrencyLimit);
      
      await Promise.all(chunk.map(async (item) => {
        const cleanSku = item.sku.trim();
        const masterName = item.master_nama_produk || item.nama_produk;
        const masterSize = item.master_size || item.size || '-';
        try {
           await fetch(`${url}/rest/v1/log_produk?sku=eq.${encodeURIComponent(cleanSku)}`, {
            method: 'PATCH',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              nama_produk: masterName,
              size: masterSize,
            }),
          });
          // Note: we can skip perbaikan_tickets or do it concurrently to be safe
          await fetch(`${url}/rest/v1/perbaikan_tickets?sku=eq.${encodeURIComponent(cleanSku)}`, {
            method: 'PATCH',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              nama_produk: masterName,
            }),
          }).catch(() => null);

          syncedCount++;
        } catch (e: any) {
          errors.push(`${cleanSku}: ${e.message}`);
        }
      }));
      if (onProgress) onProgress(Math.min(i + concurrencyLimit, mismatchItems.length), mismatchItems.length);
    }
  } else {
    errors.push('Database configuration missing');
  }

  // 3. Dispatch global events only ONCE after bulk operation finishes
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_inventory_updated'));
    window.dispatchEvent(new CustomEvent('wms_stock_updated'));
  }

  return {
    success: errors.length === 0,
    syncedCount,
    errors,
  };
}

/**
 * Delete / deactivate corrupted SKU from master catalog & local storage
 */
export async function deleteCorruptedSkuRecord(
  item: AnomalyItem,
  userSession?: UserSession | null
): Promise<{ success: boolean; message: string }> {
  const cleanSku = item.sku.trim();
  try {
    // 1. Clean from localStorage caches
    const cacheKeys = [
      'wms_master_produk',
      'wms_local_products',
      'wms_dealpos_products_cache',
      'wms_catalog_cache',
    ];
    cacheKeys.forEach((key) => {
      try {
        const str = localStorage.getItem(key);
        if (str) {
          const list = JSON.parse(str);
          if (Array.isArray(list)) {
            const filtered = list.filter((it: any) => {
              const k = String(it.k || it.sku || '').trim().toUpperCase();
              return k !== cleanSku.toUpperCase();
            });
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        }
      } catch {}
    });

    // 2. Call Supabase master_produk DELETE
    const { url, key } = getStoredSupabaseConfig();
    if (url && key) {
      await fetch(
        `${url}/rest/v1/master_produk?sku=eq.${encodeURIComponent(cleanSku)}`,
        {
          method: 'DELETE',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // 3. Inject ADJ_OUT/ADJ_IN to neutralize physical stock
    const invoice = `ADJ-PRG-${Date.now().toString().slice(-6)}`;
    const logsToInsert: LogProdukItem[] = [];
    const nowIso = new Date().toISOString();
    const operator = userSession?.name || userSession?.username || 'Sistem WMS';

    if (item.locations && item.locations.length > 0) {
      for (const loc of item.locations) {
        if (loc.qty > 0) {
          logsToInsert.push({
            sku: cleanSku,
            nama_produk: item.nama_produk || cleanSku,
            size: item.size || '-',
            qty: loc.qty,
            lokasi: loc.lokasi || 'Warehouse',
            area: loc.area || 'Warehouse',
            type: 'ADJ_OUT',
            operator,
            keterangan: 'Purge corrupted/orphan SKU (Auto)',
            invoice,
            created_at: nowIso,
          });
        } else if (loc.qty < 0) {
          logsToInsert.push({
            sku: cleanSku,
            nama_produk: item.nama_produk || cleanSku,
            size: item.size || '-',
            qty: Math.abs(loc.qty),
            lokasi: loc.lokasi || 'Warehouse',
            area: loc.area || 'Warehouse',
            type: 'ADJ_IN',
            operator,
            keterangan: 'Purge corrupted/orphan SKU (Auto)',
            invoice,
            created_at: nowIso,
          });
        }
      }
    }

    if (logsToInsert.length > 0) {
      await insertLogProduk(logsToInsert);
    }

    invalidateStokFisikCache();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wms_inventory_updated'));
      window.dispatchEvent(new CustomEvent('wms_stock_updated'));
    }

    return {
      success: true,
      message: `Data SKU "${cleanSku}" beserta seluruh riwayat stoknya berhasil dibersihkan`,
    };
  } catch (err: any) {
    console.error('Error deleting corrupted SKU:', err);
    return {
      success: false,
      message: err.message || 'Gagal menghapus SKU dari database',
    };
  }
}

/**
 * Update product name in master catalog
 */
export async function updateProductName(
  sku: string,
  newProductName: string
): Promise<{ success: boolean; message: string }> {
  const cleanSku = sku.trim();
  const cleanName = newProductName.trim();
  if (!cleanName) return { success: false, message: 'Nama produk tidak boleh kosong' };

  try {
    // 1. Update localStorage
    const cacheKeys = ['wms_master_produk', 'wms_local_products'];
    cacheKeys.forEach((key) => {
      try {
        const str = localStorage.getItem(key);
        if (str) {
          const list = JSON.parse(str);
          if (Array.isArray(list)) {
            const updated = list.map((it: any) => {
              const k = String(it.k || it.sku || '').trim().toUpperCase();
              if (k === cleanSku.toUpperCase()) {
                return { ...it, p: cleanName, n: cleanName, nama_produk: cleanName };
              }
              return it;
            });
            localStorage.setItem(key, JSON.stringify(updated));
          }
        }
      } catch {}
    });

    // 2. Upsert into Supabase master_produk
    const { url, key } = getStoredSupabaseConfig();
    if (url && key) {
      await fetch(`${url}/rest/v1/master_produk?on_conflict=sku`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify([
          {
            sku: cleanSku,
            nama_produk: cleanName,
          },
        ]),
      });
    }

    return {
      success: true,
      message: `Nama produk untuk SKU "${cleanSku}" berhasil diperbarui`,
    };
  } catch (err: any) {
    console.error('Error updating product name:', err);
    return {
      success: false,
      message: err.message || 'Gagal memperbarui nama produk di database',
    };
  }
}

/**
 * Batch delete/purge corrupted & orphan SKUs
 */
export async function batchDeleteCorruptedSkus(
  items: AnomalyItem[],
  userSession?: UserSession | null,
  onProgress?: (done: number, total: number) => void
): Promise<{ success: boolean; message: string; errors: string[] }> {
  let purgedCount = 0;
  const errors: string[] = [];
  const concurrencyLimit = 5; // Use smaller concurrency because it involves multiple inserts

  for (let i = 0; i < items.length; i += concurrencyLimit) {
    const chunk = items.slice(i, i + concurrencyLimit);
    
    await Promise.all(
      chunk.map(async (item) => {
        try {
          const res = await deleteCorruptedSkuRecord(item, userSession);
          if (res.success) {
            purgedCount++;
          } else {
            errors.push(`${item.sku}: ${res.message}`);
          }
        } catch (e: any) {
          errors.push(`${item.sku}: ${e.message}`);
        }
      })
    );

    if (onProgress) {
      onProgress(Math.min(i + concurrencyLimit, items.length), items.length);
    }
  }

  // Trigger global updates only once at the end
  if (typeof window !== 'undefined' && purgedCount > 0) {
    window.dispatchEvent(new CustomEvent('wms_inventory_updated'));
    window.dispatchEvent(new CustomEvent('wms_stock_updated'));
  }

  if (errors.length > 0) {
    return {
      success: false,
      message: `Berhasil membersihkan ${purgedCount} item, tetapi gagal pada ${errors.length} item.`,
      errors,
    };
  }

  return {
    success: true,
    message: `Berhasil membersihkan secara massal ${purgedCount} SKU anomali beserta riwayat fisiknya.`,
    errors: [],
  };
}
