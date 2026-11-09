/**
 * =============================================================================
 * SAFE STORAGE UTILITY — ANTI QUOTA EXCEEDED & STORAGE AUTO-HEALING
 * =============================================================================
 * Menangani seluruh operasi localStorage & sessionStorage secara aman tanpa
 * pernah melempar DOMException "The quota has been exceeded".
 * Otomatis melakukan LRU cache-eviction terhadap key data sekunder jika storage penuh.
 */

const DISPOSABLE_CACHE_KEYS = [
  'wms_raw_picking_list_cache',
  'wms_picking_cache',
  'wms_product_cache',
  'wms_trello_up_catalog_cache',
  'wms_stok_real_fisik_light',
  'wms_stok_real_fisik_cache',
  'wms_mutasi_cache',
  'wms_produksi_matrix_metrics_cache',
  'wms_katalog_search_cache',
  'wms_staging_scan_cache',
];

/**
 * Cek apakah error merupakan QuotaExceededError
 */
export function isQuotaExceededError(err: any): boolean {
  if (!err) return false;
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014 ||
    (typeof err.message === 'string' && err.message.toLowerCase().includes('quota'))
  );
}

/**
 * Hapus cache data berukuran besar yang aman di-fetch ulang dari Supabase
 */
export function clearHeavyCaches(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    DISPOSABLE_CACHE_KEYS.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
    console.info('[SafeStorage] Cache sekunder berukuran besar berhasil dibersihkan.');
  } catch (err) {
    console.warn('[SafeStorage] Gagal membersihkan cache sekunder:', err);
  }
}

/**
 * Simpan data ke localStorage dengan proteksi kuota & auto-eviction
 */
export function safeLocalStorageSet(key: string, value: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    if (isQuotaExceededError(err)) {
      console.warn(`[SafeStorage] Kuota terlampaui saat menyimpan "${key}". Membersihkan cache sekunder...`);
      
      // 1. Bersihkan disposable cache selain key yang sedang ingin disimpan
      DISPOSABLE_CACHE_KEYS.forEach((dKey) => {
        if (dKey !== key) {
          try {
            localStorage.removeItem(dKey);
          } catch {}
        }
      });

      // 2. Coba simpan kembali setelah dibersihkan
      try {
        localStorage.setItem(key, value);
        console.info(`[SafeStorage] Berhasil menyimpan "${key}" setelah cache dibersihkan.`);
        return true;
      } catch (retryErr) {
        console.warn(`[SafeStorage] Nilai "${key}" terlalu besar untuk disimpan di localStorage:`, retryErr);
        return false;
      }
    }

    console.warn(`[SafeStorage] Gagal menulis ke localStorage untuk key "${key}":`, err);
    return false;
  }
}

/**
 * Baca data dari localStorage dengan fallback aman
 */
export function safeLocalStorageGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Hapus key dari localStorage dengan aman
 */
export function safeLocalStorageRemove(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.removeItem(key);
  } catch {}
}

