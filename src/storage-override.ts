// GLOBAL OVERRIDE: Prevent QuotaExceededError from crashing the app
const originalLocalSetItem = localStorage.setItem;
localStorage.setItem = function(key: string, value: string) {
  try {
    originalLocalSetItem.apply(this, [key, value]);
  } catch (e: any) {
    console.warn(`[QuotaExceeded] localStorage is full when setting ${key}.`);
    const msg = String(e?.message || e?.name || e).toLowerCase();
    if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || msg.includes('quota'))) {
      // Clear large caches to free up space
      try {
        localStorage.removeItem('wms_product_cache');
        localStorage.removeItem('wms_picking_cache');
        localStorage.removeItem('wms_raw_picking_list_cache');
        localStorage.removeItem('wms_local_perbaikan_tickets');
        localStorage.removeItem('wms_local_qc_reports');
        localStorage.removeItem('wms_local_penerimaan_produksi');
        localStorage.removeItem('gas_delta_sync_Stok Real');
        localStorage.removeItem('gas_delta_sync_Mutasi Log');
        // Retry once
        originalLocalSetItem.apply(this, [key, value]);
      } catch (retryErr) {
        console.error('Still failed after clearing caches.', retryErr);
        // Do not throw to avoid crashing the app, just accept it won't cache.
      }
    } else {
      throw e; // Re-throw if it's a different error
    }
  }
};

const originalSessionSetItem = sessionStorage.setItem;
sessionStorage.setItem = function(key: string, value: string) {
  try {
    originalSessionSetItem.apply(this, [key, value]);
  } catch (e: any) {
    const msg = String(e?.message || e?.name || e).toLowerCase();
    if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || msg.includes('quota'))) {
      console.warn(`[QuotaExceeded] sessionStorage is full when setting ${key}. Clearing...`);
      sessionStorage.clear();
      try {
        originalSessionSetItem.apply(this, [key, value]);
      } catch (retryErr) {
        console.error('Still failed sessionStorage after clearing.', retryErr);
      }
    } else {
      throw e;
    }
  }
};
