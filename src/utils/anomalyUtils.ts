/**
 * Anomaly Detection & Repair Utilities for WMS Inventory
 * Handles detection of corrupted SKUs, negative rack stocks, missing names, and orphaned items.
 */
import { ProductItem, StockRealtimeItem, LogProdukItem, UserSession } from '../types';
import { insertLogProduk, getStoredSupabaseConfig } from '../services/supabase';

export type AnomalyCategory =
  | 'SKU_CORRUPTED'
  | 'NEGATIVE_STOCK'
  | 'MISSING_NAME'
  | 'ORPHAN_STOCK';

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
 * Checks if product name is missing or identical to SKU
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
 * Scan all catalogs and real-time stocks to identify all data anomalies
 */
export function scanAnomalies(
  productCatalog: ProductItem[],
  stockList: StockRealtimeItem[]
): AnomalyItem[] {
  const anomaliesMap = new Map<string, AnomalyItem>();
  const catalogSkus = new Set<string>();

  // Map stock by SKU
  const stockBySku = new Map<string, StockRealtimeItem[]>();
  stockList.forEach((s) => {
    const rawSku = String(s.sku || '').trim();
    if (!rawSku) return;
    const skuUp = rawSku.toUpperCase();
    if (!stockBySku.has(skuUp)) stockBySku.set(skuUp, []);
    stockBySku.get(skuUp)!.push(s);
  });

  // 1. Check Product Catalog entries
  productCatalog.forEach((item) => {
    const rawSku = String(item.k || (item as any).sku || '').trim();
    if (!rawSku) return;
    const skuUp = rawSku.toUpperCase();
    catalogSkus.add(skuUp);

    const nama = String(item.p || item.n || (item as any).nama_produk || '').trim();
    const size = String(item.s || (item as any).size || '-').trim();

    const stocks = stockBySku.get(skuUp) || [];
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

    // Check SKU format
    if (isCorruptedSku(rawSku)) {
      categories.push('SKU_CORRUPTED');
      reasons.push(
        rawSku.startsWith('-')
          ? 'SKU diawali tanda strip (-) yang merusak integritas barcode'
          : rawSku.length > 35
          ? 'SKU terisi teks judul/deskripsi panjang alih-alih kode SKU standar'
          : 'SKU mengandung karakter simbol / tag non-produk'
      );
      recommendations.push(
        totalFisik === 0
          ? 'Hapus data sampah ini dari WMS agar tidak mengotori tabel inventori'
          : 'Periksa fisik barang di rak dan ganti kode SKU ke format resmi'
      );
    }

    // Check Negative Stock
    if (negativeLocs.length > 0) {
      categories.push('NEGATIVE_STOCK');
      const locStr = negativeLocs.map((l) => `${l.lokasi} (${l.qty})`).join(', ');
      reasons.push(`Stok rak fisik bertanda minus di: ${locStr}`);
      recommendations.push(
        'Lakukan penyesuaian (1-Click Reset ke 0) untuk menetralkan mutasi keluar berlebih'
      );
    }

    // Check Missing/Unresolved Name
    if (isMissingProductName(nama, rawSku) && !categories.includes('SKU_CORRUPTED')) {
      categories.push('MISSING_NAME');
      reasons.push('Nama produk belum terdaftar atau sama persis dengan kode SKU');
      recommendations.push('Perbarui nama produk resmi melalui katalog master');
    }

    if (categories.length > 0) {
      anomaliesMap.set(skuUp, {
        id: `anomaly_${skuUp}`,
        sku: rawSku,
        nama_produk: nama || rawSku,
        size,
        categories,
        reasons,
        recommendations,
        locations,
        negativeLocations: negativeLocs,
        totalFisikGudang: totalFisik,
        totalDealpos: Number((item as any).q || 0),
        rawCatalogItem: item,
      });
    }
  });

  // 2. Check Stock entries that are not in Product Catalog (Orphans) or have negative stock
  stockList.forEach((s) => {
    const rawSku = String(s.sku || '').trim();
    if (!rawSku) return;
    const skuUp = rawSku.toUpperCase();

    if (anomaliesMap.has(skuUp)) return; // Already processed

    const isOrphan = !catalogSkus.has(skuUp);
    const qty = Number(s.sisa_stok) || 0;
    const isCorrupted = isCorruptedSku(rawSku);

    if (isOrphan || qty < 0 || isCorrupted) {
      const stocks = stockBySku.get(skuUp) || [s];
      const locations: AnomalyLocationItem[] = stocks.map((stk) => ({
        lokasi: stk.lokasi || '-',
        qty: Number(stk.sisa_stok) || 0,
        area: stk.area,
      }));
      const negativeLocs = locations.filter((l) => l.qty < 0);
      const totalFisik = locations.reduce((sum, l) => sum + l.qty, 0);

      const categories: AnomalyCategory[] = [];
      const reasons: string[] = [];
      const recommendations: string[] = [];

      if (isCorrupted) {
        categories.push('SKU_CORRUPTED');
        reasons.push('SKU pada data rak tidak valid atau diawali tanda strip/simbol');
        recommendations.push('Bersihkan atau koreksi kode SKU');
      }

      if (negativeLocs.length > 0) {
        categories.push('NEGATIVE_STOCK');
        const locStr = negativeLocs.map((l) => `${l.lokasi} (${l.qty})`).join(', ');
        reasons.push(`Stok rak fisik bertanda minus di: ${locStr}`);
        recommendations.push('Lakukan 1-Click Reset ke 0 untuk mengembalikan saldo rak ke nol');
      }

      if (isOrphan && totalFisik > 0) {
        categories.push('ORPHAN_STOCK');
        reasons.push('Terdapat stok fisik di rak namun SKU belum terdaftar pada master katalog');
        recommendations.push('Daftarkan SKU ini ke Master Produk WMS');
      }

      const nama = s.nama_produk || rawSku;
      if (isMissingProductName(nama, rawSku) && !categories.includes('SKU_CORRUPTED')) {
        categories.push('MISSING_NAME');
        reasons.push('Nama produk belum terdaftar');
        recommendations.push('Isi nama produk');
      }

      if (categories.length > 0) {
        anomaliesMap.set(skuUp, {
          id: `anomaly_${skuUp}`,
          sku: rawSku,
          nama_produk: nama,
          size: s.size || '-',
          categories,
          reasons,
          recommendations,
          locations,
          negativeLocations: negativeLocs,
          totalFisikGudang: totalFisik,
          totalDealpos: 0,
          rawCatalogItem: null,
        });
      }
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
  userSession?: UserSession | null
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
      area: 'Gudang Utama',
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
  }> = [];

  anomalies.forEach((a) => {
    a.negativeLocations.forEach((loc) => {
      itemsWithNegative.push({
        sku: a.sku,
        lokasi: loc.lokasi,
        qty: loc.qty,
        nama_produk: a.nama_produk,
        size: a.size,
      });
    });
  });

  if (itemsWithNegative.length === 0) {
    return { success: true, fixedCount: 0, errors: [] };
  }

  const logs: LogProdukItem[] = [];
  const operatorName = userSession?.name || userSession?.username || 'Admin WMS';
  const now = new Date().toISOString();

  itemsWithNegative.forEach((item, idx) => {
    const fixQty = Math.abs(item.qty);
    logs.push({
      type: 'ADJ_IN',
      invoice: `ADJ-BATCH-${Date.now().toString().slice(-6)}-${idx + 1}`,
      sku: item.sku.trim().toUpperCase(),
      nama_produk: item.nama_produk,
      size: item.size || '-',
      area: 'Gudang Utama',
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
 * Delete / deactivate corrupted SKU from master catalog & local storage
 */
export async function deleteCorruptedSkuRecord(
  sku: string
): Promise<{ success: boolean; message: string }> {
  const cleanSku = sku.trim();
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

    return {
      success: true,
      message: `Data sampah SKU "${cleanSku}" berhasil dibersihkan dari sistem`,
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
