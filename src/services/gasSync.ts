import { getStoredGasEndpoint } from './settings';
import { getLocalDbMeta, setLocalDbMeta } from './localDb';

export interface GasSyncResponse<T> {
  status: 'success' | 'error';
  data: T[];
  active_ids?: (string | number)[];
  timestamp?: number;
  message?: string;
}

export interface GasCacheData<T> {
  data: T[];
  timestamp: number;
}

/**
 * Fetches data from a specific Google Sheet via Google Apps Script API.
 * Supports Delta Sync if `since` timestamp is provided.
 *
 * @param sheetName Name of the sheet (e.g. "Mutasi Log", "Stok Real", "Stok Opname Queue")
 * @param since Optional ISO string or timestamp number to fetch only changes since then.
 */
export async function fetchDataFromGAS<T>(sheetName: string, since?: string | number): Promise<GasSyncResponse<T>> {
  const endpoint = getStoredGasEndpoint();
  if (!endpoint) {
    throw new Error('Endpoint GAS belum dikonfigurasi. Silakan periksa halaman Pengaturan.');
  }

  let url = `${endpoint}?table=${encodeURIComponent(sheetName)}`;
  if (since) {
    url += `&since=${encodeURIComponent(String(since))}`;
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.status === 'error') {
      throw new Error(result.message || 'Gagal mengambil data dari GAS');
    }

    return result as GasSyncResponse<T>;
  } catch (err: any) {
    console.error(`Error fetching data from GAS for sheet ${sheetName}:`, err);
    throw err;
  }
}

/**
 * Fetches data from GAS with local caching and delta sync capabilities.
 * It uses IndexedDB (via localDb meta) to store the full dataset and the last sync timestamp.
 * When called, it passes `since` to GAS. GAS will return only modified/new rows and a list of `active_ids`.
 * It merges the delta into the cache, removes deleted rows, saves it back, and returns the full updated list.
 */
export async function fetchWithDeltaSync<T>(
  sheetName: string,
  getPrimaryKey: (item: any) => string | number = (item) => item.id || item.sku || item.no_pesanan || item.no_sj,
  getParentId: (item: any) => string | number = (item) => item.id || item.sku || item.no_pesanan || item.no_sj
): Promise<T[]> {
  const cacheKey = `gas_delta_sync_${sheetName}`;
  const cached = await getLocalDbMeta<GasCacheData<T>>(cacheKey);
  
  const since = cached?.timestamp || 0;
  
  // Call GAS API with `since`
  const res = await fetchDataFromGAS<T>(sheetName, since);
  
  let currentData = cached?.data || [];
  
  if (res.data && res.data.length > 0) {
    // There are new or modified rows
    const modifiedMap = new Map<string | number, T>();
    for (const item of res.data) {
      const pk = getPrimaryKey(item);
      if (pk != null) {
        modifiedMap.set(pk, item);
      }
    }
    
    // Merge updates and add new items
    const nextData: T[] = [];
    const seenIds = new Set<string | number>();
    
    for (const oldItem of currentData) {
      const pk = getPrimaryKey(oldItem);
      if (pk != null) {
        if (modifiedMap.has(pk)) {
          nextData.push(modifiedMap.get(pk)!);
          seenIds.add(pk);
        } else {
          nextData.push(oldItem);
        }
      }
    }
    
    // Add totally new items
    for (const newItem of res.data) {
      const pk = getPrimaryKey(newItem);
      if (pk != null && !seenIds.has(pk)) {
        nextData.push(newItem);
      }
    }
    
    currentData = nextData;
  }
  
  // Handle deletions if active_ids is provided (Delta Sync standard)
  if (res.active_ids && Array.isArray(res.active_ids)) {
    const activeSet = new Set(res.active_ids.map(String));
    currentData = currentData.filter(item => {
      const parentId = getParentId(item);
      if (parentId == null) return true;
      return activeSet.has(String(parentId));
    });
  }
  
  // Ensure descending sort if there's a created_at
  currentData.sort((a: any, b: any) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tB - tA; // descending
  });

  // Save new state back to local cache
  if (res.timestamp) {
    await setLocalDbMeta<GasCacheData<T>>(cacheKey, {
      data: currentData,
      timestamp: res.timestamp
    });
  }
  
  return currentData;
}
