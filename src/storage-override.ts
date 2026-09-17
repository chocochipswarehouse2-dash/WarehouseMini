// GLOBAL OVERRIDE: Prevent QuotaExceededError from crashing the app
const originalLocalSetItem = localStorage.setItem.bind(localStorage);

function clearKnownLargeCaches(): void {
  const keysToEvict = [
    'wms_product_cache',
    'wms_picking_cache',
    'wms_raw_picking_list_cache',
    'wms_cached_pengecekan_sj_records',
    'wms_cached_tarikan_md',
    'wms_cached_pengecekan_sj_drafts',
    'wms_offline_queue_pengecekan_sj',
    'wms_local_perbaikan_tickets',
    'wms_local_qc_reports',
    'wms_local_penerimaan_produksi',
    'gas_delta_sync_Stok Real',
    'gas_delta_sync_Mutasi Log',
  ];
  for (const k of keysToEvict) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
}

localStorage.setItem = function(key: string, value: string) {
  try {
    originalLocalSetItem(key, value);
  } catch (e: any) {
    console.warn(`[QuotaExceeded] localStorage is full when setting "${key}".`);
    const msg = String(e?.message || e?.name || e).toLowerCase();
    const isQuota =
      (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) ||
      msg.includes('quota') ||
      msg.includes('exceeded') ||
      e?.code === 22 ||
      e?.code === 1014;

    if (isQuota) {
      // Clear large caches to free up space
      clearKnownLargeCaches();
      try {
        // Retry once
        originalLocalSetItem(key, value);
      } catch (retryErr) {
        console.warn(`[QuotaExceeded] Still failed to set "${key}" after clearing caches. Suppressing error to prevent app crash.`);
        // NEVER re-throw QuotaExceededError — crashing React component tree is fatal for user experience
      }
    } else {
      // For non-quota errors, log warning and swallow if storage access is restricted, or throw
      try {
        originalLocalSetItem(key, value);
      } catch (fallbackErr) {
        console.warn(`[StorageError] Could not save key "${key}":`, fallbackErr);
      }
    }
  }
};

const originalSessionSetItem = sessionStorage.setItem.bind(sessionStorage);
sessionStorage.setItem = function(key: string, value: string) {
  try {
    originalSessionSetItem(key, value);
  } catch (e: any) {
    const msg = String(e?.message || e?.name || e).toLowerCase();
    const isQuota =
      (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) ||
      msg.includes('quota') ||
      msg.includes('exceeded');

    if (isQuota) {
      console.warn(`[QuotaExceeded] sessionStorage is full when setting "${key}". Clearing...`);
      try {
        sessionStorage.clear();
        originalSessionSetItem(key, value);
      } catch (retryErr) {
        console.warn(`[QuotaExceeded] Still failed sessionStorage after clearing:`, retryErr);
      }
    } else {
      try {
        originalSessionSetItem(key, value);
      } catch {}
    }
  }
};

