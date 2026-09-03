import { localDb } from './localDb';
import { supabaseFetch, getSupabaseClient } from './supabase';

/**
 * Helper to fetch all pages of a table up to a maximum limit, handling PostgREST default limit (1000)
 */
async function fetchAllWithPagination(tableName: string, baseQuery: string): Promise<any[]> {
  const allData: any[] = [];
  const limit = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await supabaseFetch<any[]>(
      tableName,
      'GET',
      null,
      `${baseQuery}&limit=${limit}&offset=${offset}`
    );

    if (data && Array.isArray(data) && data.length > 0) {
      allData.push(...data);
      if (data.length < limit) {
        hasMore = false; // Last page
      } else {
        offset += limit;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}

/**
 * Perform a Full Sync (downloading all data) for a specific table.
 * Used for initial login or manual forceful sync.
 */
async function fullSyncTable(
  tableName: string, 
  dexieTable: any, 
  transformFn?: (items: any[]) => any[]
) {
  try {
    console.log(`Starting Full Sync for ${tableName}...`);
    // Fetch all data handling pagination explicitly since server caps at 1000
    const data = await fetchAllWithPagination(tableName, 'select=*');

    if (data && Array.isArray(data)) {
      const itemsToStore = transformFn ? transformFn(data) : data;
      
      // Clear and bulk add
      await dexieTable.clear();
      await dexieTable.bulkPut(itemsToStore);
      
      // Update sync meta
      await localDb.syncMeta.put({
        tableName,
        lastSyncTime: new Date().toISOString()
      });
      console.log(`Full Sync completed for ${tableName}: ${itemsToStore.length} rows.`);
    }
  } catch (error) {
    console.error(`Full Sync failed for ${tableName}:`, error);
  }
}

/**
 * Perform a Delta Sync (fetching only rows updated after lastSyncTime).
 * Used when opening the app after a while.
 */
async function deltaSyncTable(
  tableName: string, 
  dexieTable: any, 
  lastSyncTime: string,
  transformFn?: (items: any[]) => any[],
  timestampCol: string = 'created_at'
) {
  try {
    console.log(`Starting Delta Sync for ${tableName} since ${lastSyncTime}...`);
    const data = await fetchAllWithPagination(
      tableName, 
      `select=*&${timestampCol}=gt.${lastSyncTime}&order=${timestampCol}.asc`
    );

    if (data && Array.isArray(data) && data.length > 0) {
      const itemsToStore = transformFn ? transformFn(data) : data;
      
      // Update local db
      await dexieTable.bulkPut(itemsToStore);
      
      // Update sync meta to the latest timestamp in the payload
      const latestItem = data[data.length - 1];
      const newSyncTime = latestItem[timestampCol] || latestItem.updated_at || latestItem.created_at || new Date().toISOString();
      
      await localDb.syncMeta.put({
        tableName,
        lastSyncTime: newSyncTime
      });
      console.log(`Delta Sync completed for ${tableName}: ${itemsToStore.length} rows updated.`);
    } else {
      console.log(`Delta Sync for ${tableName}: No new data.`);
    }
  } catch (error) {
    console.error(`Delta Sync failed for ${tableName}:`, error);
  }
}

/**
 * Main function to synchronize a table based on its last sync state.
 */
export async function syncTable(
  tableName: string, 
  dexieTable: any,
  transformFn?: (items: any[]) => any[],
  timestampCol: string = 'created_at',
  forceFull: boolean = false
) {
  if (forceFull) {
    await fullSyncTable(tableName, dexieTable, transformFn);
    return;
  }

  const meta = await localDb.syncMeta.get(tableName);
  
  if (!meta) {
    // Never synced before, do full sync
    await fullSyncTable(tableName, dexieTable, transformFn);
  } else {
    // Check if it's been more than 24 hours
    const lastSync = new Date(meta.lastSyncTime).getTime();
    const now = Date.now();
    const hoursSinceLastSync = (now - lastSync) / (1000 * 60 * 60);

    if (hoursSinceLastSync > 24) {
      await fullSyncTable(tableName, dexieTable, transformFn);
    } else {
      await deltaSyncTable(tableName, dexieTable, meta.lastSyncTime, transformFn, timestampCol);
    }
  }
}

/**
 * Force a manual full sync for all priority tables.
 */
export async function runManualFullSync(onProgress?: (progress: number, message: string) => void) {
  if (onProgress) onProgress(10, 'Syncing Master Produk...');
  await fullSyncTable('master_produk', localDb.products);
  
  if (onProgress) onProgress(30, 'Syncing Stok Realtime...');
  await fullSyncTable('view_stok_realtime', localDb.stokRealtime, (items) => {
    // Ensure composite key for stokRealtime
    return items.map(item => ({
      ...item,
      sisa_stok: Number(item.sisa_stok) || 0
    }));
  });

  if (onProgress) onProgress(50, 'Syncing Log Produk...');
  await fullSyncTable('log_produk', localDb.logProduk);

  if (onProgress) onProgress(70, 'Syncing Peminjaman...');
  await fullSyncTable('peminjaman', localDb.peminjaman);

  if (onProgress) onProgress(90, 'Syncing Picking List...');
  await fullSyncTable('picking_list', localDb.pickingList);

  if (onProgress) onProgress(95, 'Syncing Stock Opname...');
  await fullSyncTable('stock_opname_queue', localDb.soQueue);

  if (onProgress) onProgress(100, 'Sync Selesai');
}

/**
 * Smart Sync: Decides between Delta or Full based on timestamps.
 * Run this on App load or Reconnect.
 */
export async function runSmartSync() {
  console.log('Running Smart Sync...');
  
  // master_produk uses fallback since it might not have created_at/updated_at, but we'll try created_at or forceFull if needed.
  // Let's forceFull it for safety if we delete products, but assuming it's large, we use delta with whatever column works.
  // Actually, stock_opname_queue is the one breaking.
  await syncTable('master_produk', localDb.products);
  
  await syncTable('view_stok_realtime', localDb.stokRealtime, (items) => {
    return items.map(item => ({
      ...item,
      sisa_stok: Number(item.sisa_stok) || 0
    }));
  }, 'updated_at');
  
  await syncTable('log_produk', localDb.logProduk, undefined, 'created_at');
  await syncTable('peminjaman', localDb.peminjaman, undefined, 'created_at');
  await syncTable('picking_list', localDb.pickingList, undefined, 'created_at');
  
  // Queue tables often delete rows, delta sync doesn't delete them locally.
  // Force full sync for stock_opname_queue.
  await syncTable('stock_opname_queue', localDb.soQueue, undefined, 'created_at', true);
  
  console.log('Smart Sync Complete.');
}

/**
 * Handle incoming realtime events from Supabase to keep Dexie updated instantly.
 */
export async function handleRealtimeEvent(table: string, payload: any) {
  try {
    const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
    const newRow = payload.new;
    const oldRow = payload.old;

    switch(table) {
      case 'master_produk':
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          await localDb.products.put(newRow);
        } else if (eventType === 'DELETE' && oldRow?.k) {
          await localDb.products.delete(oldRow.k);
        }
        break;

      case 'log_produk':
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          await localDb.logProduk.put(newRow);
          // Also heuristically update local stok if it's an insert to save full view refresh
          if (eventType === 'INSERT' && newRow.sku && newRow.lokasi) {
            const key = `${newRow.sku.toUpperCase()}__${newRow.lokasi.toUpperCase()}`;
            const existingStok = await localDb.stokRealtime.get(key);
            const delta = (newRow.type === 'IN' || newRow.type === 'ADJ_IN') ? Number(newRow.qty) : -Number(newRow.qty);
            
            if (existingStok) {
              await localDb.stokRealtime.update(key, { sisa_stok: existingStok.sisa_stok + delta });
            } else {
              await localDb.stokRealtime.put({
                sku: newRow.sku,
                lokasi: newRow.lokasi,
                area: newRow.area || '',
                sisa_stok: delta,
                nama_produk: newRow.nama_produk || newRow.sku
              });
            }
          }
        } else if (eventType === 'DELETE' && oldRow?.id) {
          await localDb.logProduk.delete(oldRow.id);
        }
        break;

      case 'view_stok_realtime':
        // Note: Views in Supabase Realtime require manual trigger setup or polling, 
        // but if it emits, we update it. (Typically views don't emit CDC natively).
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
           const key = `${newRow.sku.toUpperCase()}__${newRow.lokasi.toUpperCase()}`;
           await localDb.stokRealtime.put({ ...newRow, sisa_stok: Number(newRow.sisa_stok) || 0 });
        }
        break;

      case 'peminjaman':
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          await localDb.peminjaman.put(newRow);
        } else if (eventType === 'DELETE' && oldRow?.id) {
          await localDb.peminjaman.delete(oldRow.id);
        }
        break;
      case 'stock_opname_queue':
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          await localDb.soQueue.put(newRow);
        } else if (eventType === 'DELETE' && oldRow?.id) {
          await localDb.soQueue.delete(oldRow.id);
        }
        break;

      case 'picking_list':
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          await localDb.pickingList.put(newRow);
        } else if (eventType === 'DELETE' && oldRow?.id) {
          await localDb.pickingList.delete(oldRow.id);
        }
        break;
    }
  } catch (error) {
    console.error('Error handling realtime event in localDb:', error);
  }
}

/**
 * Flush offline mutations back to Supabase when network is restored.
 */
export async function flushOfflineLogs() {
  const pendingLogs = await localDb.offlineLogs.where('status').equals('pending').toArray();
  if (!pendingLogs.length) return;

  console.log(`Flushing ${pendingLogs.length} offline logs to Supabase...`);
  const supabase = getSupabaseClient();

  for (const log of pendingLogs) {
    try {
      await localDb.offlineLogs.update(log.id!, { status: 'syncing' });
      
      let error = null;
      if (log.action === 'INSERT') {
        const { error: err } = await supabase.from(log.tableName).insert(log.payload);
        error = err;
      } else if (log.action === 'UPDATE') {
         // Requires PK logic in payload, assuming id
        const { error: err } = await supabase.from(log.tableName).update(log.payload).eq('id', log.payload.id);
        error = err;
      }
      
      if (error) throw error;
      
      // Success, remove from offline queue
      await localDb.offlineLogs.delete(log.id!);
    } catch (err: any) {
      console.error(`Failed to flush offline log ID ${log.id}:`, err);
      await localDb.offlineLogs.update(log.id!, { status: 'failed', errorMsg: err.message });
    }
  }
}
