import { getLocalDbMeta, setLocalDbMeta } from './localDb';
import { supabaseFetch } from './supabase';

/** Cache key for a given sheet */
export function getDeltaSyncCacheKey(sheetName: string) {
  return `gas_delta_sync_${sheetName}`;
}

export async function clearDeltaSyncCache(sheetName: string): Promise<void> {
  await setLocalDbMeta(getDeltaSyncCacheKey(sheetName), null);
}

export async function clearAllDeltaSyncCaches(): Promise<void> {
  const sheets = [
    'mutasi_log', 'stock_opname_queue', 'stok_real',
    'manual_shipment', 'tarikan_md', 'address_book',
    'master_produk', 'picking_list', 'pengecekan_sj'
  ];
  for (const s of sheets) {
    await setLocalDbMeta(getDeltaSyncCacheKey(s), null);
  }
}

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

export async function fetchDataFromGAS<T>(sheetName: string, since?: string | number): Promise<GasSyncResponse<T>> {
  try {
    let tableName = sheetName;
    if (sheetName === 'Mutasi Log') tableName = 'log_produk';
    if (sheetName === 'Stok Opname Queue') tableName = 'stock_opname_queue';
    if (sheetName === 'Stok Real') tableName = 'stok_real';
    if (sheetName === 'Manual Shipment') tableName = 'manual_shipment';
    if (sheetName === 'Tarikan MD') tableName = 'tarikan_md';
    if (sheetName === 'Data Alamat') tableName = 'address_book';
    
    const rows = await supabaseFetch<T[]>(tableName, 'GET', null, 'select=*&limit=2000');
    
    return {
      status: 'success',
      data: Array.isArray(rows) ? rows : [],
      timestamp: Date.now()
    };
  } catch (err: any) {
    console.error(`Error fetching data from Supabase for table ${sheetName}:`, err);
    throw err;
  }
}

export async function fetchWithDeltaSync<T>(
  sheetName: string,
  getPrimaryKey: (item: any) => string | number = (item) => item.id || item.sku || item.no_pesanan || item.no_sj,
  getParentId: (item: any) => string | number = (item) => item.id || item.sku || item.no_pesanan || item.no_sj
): Promise<T[]> {
  try {
    const res = await fetchDataFromGAS<T>(sheetName);
    return res.data || [];
  } catch (e) {
    console.error('fetchWithDeltaSync error:', e);
    return [];
  }
}
