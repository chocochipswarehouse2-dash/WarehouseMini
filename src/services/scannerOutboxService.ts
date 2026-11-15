import {
  LogProdukItem,
  StockOpnameQueueItem,
  ProductItem
} from '../types';
import {
  supabaseFetch,
  fetchStockForLocations,
  insertStockOpnameQueue,
  getAreaFromLokasi,
  generateUUID,
  isValidUUID,
  invalidateStokFisikCache
} from './supabase';
import { lookupProductBySku } from '../utils/productLookup';
import { cleanProductName, resolveProductDisplaySize } from '../utils/sortUtils';

const OUTBOX_STORAGE_KEY = 'wms_scanner_outbox_queue_v1';
const LEGACY_OFFLINE_LOGS_KEY = 'wms_offline_logs';

export interface ScannerOutboxBatch {
  batchId: string;
  invoice: string;
  createdAtIso: string;
  operator: string;
  keterangan: string;
  totalItemsCount: number;
  logs: LogProdukItem[];
  soFisik: Record<string, Record<string, number>>;
  soQueueItems?: StockOpnameQueueItem[];
  logsSynced: boolean;
  soSynced: boolean;
  attempts: number;
  lastError?: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
}

let isOutboxSyncing = false;

function notifyOutboxUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_scanner_outbox_updated'));
  }
}

/**
 * Migrate any legacy `wms_offline_logs` entries into a deterministic Outbox batch
 * so no historical offline scan data is ever stranded on a device.
 */
function migrateLegacyOfflineLogsIfNeeded(existingBatches: ScannerOutboxBatch[]): ScannerOutboxBatch[] {
  if (typeof window === 'undefined') return existingBatches;
  try {
    const rawLegacy = localStorage.getItem(LEGACY_OFFLINE_LOGS_KEY);
    if (!rawLegacy) return existingBatches;
    const parsedLegacy = JSON.parse(rawLegacy);
    if (!Array.isArray(parsedLegacy) || parsedLegacy.length === 0) {
      localStorage.removeItem(LEGACY_OFFLINE_LOGS_KEY);
      return existingBatches;
    }

    const validLogs: LogProdukItem[] = parsedLegacy
      .filter((l: any) => l && l.sku && l.lokasi && l.type)
      .map((l: any) => {
        const sku = String(l.sku || '').trim().toUpperCase();
        const master = lookupProductBySku(sku);
        const nama_produk =
          master?.found && master.nama_produk
            ? master.nama_produk
            : cleanProductName(String(l.nama_produk || sku));
        const size = resolveProductDisplaySize(sku, master?.size || l.size || '');
        const lokasi = String(l.lokasi || 'Warehouse').trim().toUpperCase();
        return {
          type: l.type,
          invoice: l.invoice || `WEB-LEGACY-${Date.now()}`,
          sku,
          nama_produk,
          size,
          area: getAreaFromLokasi(lokasi),
          lokasi,
          qty: Number(l.qty) || 1,
          operator: l.operator || 'Operator | Offline Recovery',
          keterangan: l.keterangan || 'Recovered Offline Scan',
          created_at: l.created_at || new Date().toISOString()
        };
      });

    localStorage.removeItem(LEGACY_OFFLINE_LOGS_KEY);
    if (validLogs.length === 0) return existingBatches;

    const first = validLogs[0];
    const migratedBatch: ScannerOutboxBatch = {
      batchId: `BATCH-LEGACY-${Date.now()}`,
      invoice: first.invoice || `WEB-LEGACY-${Date.now()}`,
      createdAtIso: first.created_at || new Date().toISOString(),
      operator: first.operator || 'Operator',
      keterangan: first.keterangan || 'Recovered Offline Scan',
      totalItemsCount: validLogs.length,
      logs: validLogs,
      soFisik: {},
      logsSynced: false,
      soSynced: true,
      attempts: 0,
      status: 'PENDING'
    };

    const next = [...existingBatches, migratedBatch];
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return existingBatches;
  }
}

export function getScannerOutboxBatches(): ScannerOutboxBatch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    const parsed: ScannerOutboxBatch[] = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    return migrateLegacyOfflineLogsIfNeeded(list);
  } catch {
    return [];
  }
}

export function getPendingScannerOutboxCount(): number {
  return getScannerOutboxBatches().length;
}

export function getPendingScannerOutboxItemCount(): number {
  return getScannerOutboxBatches().reduce((sum, b) => sum + (Number(b.totalItemsCount) || b.logs.length || 0), 0);
}

function saveScannerOutboxBatches(batches: ScannerOutboxBatch[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (batches.length === 0) {
      localStorage.removeItem(OUTBOX_STORAGE_KEY);
    } else {
      localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(batches));
    }
  } catch (err) {
    console.warn('[ScannerOutbox] Failed saving outbox to localStorage:', err);
  }
  notifyOutboxUpdated();
}

export function enqueueScannerOutboxBatch(params: {
  invoice: string;
  createdAtIso: string;
  operator: string;
  keterangan: string;
  logs: LogProdukItem[];
  soFisik: Record<string, Record<string, number>>;
}): ScannerOutboxBatch {
  const hasSoLocations = Object.keys(params.soFisik || {}).length > 0;
  const normalizedLogs: LogProdukItem[] = (params.logs || []).map((l) => {
    const sku = String(l.sku || '').trim().toUpperCase();
    const master = lookupProductBySku(sku);
    const officialName =
      master?.found && master.nama_produk
        ? master.nama_produk
        : cleanProductName(String(l.nama_produk || sku));
    const officialSize = resolveProductDisplaySize(sku, master?.size || l.size || '');
    const lokasi = String(l.lokasi || '').trim().toUpperCase();
    return {
      ...l,
      sku,
      nama_produk: officialName,
      size: officialSize,
      lokasi,
      area: getAreaFromLokasi(lokasi),
      invoice: params.invoice,
      created_at: params.createdAtIso
    };
  });

  const newBatch: ScannerOutboxBatch = {
    batchId: `SCAN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    invoice: params.invoice,
    createdAtIso: params.createdAtIso,
    operator: params.operator,
    keterangan: params.keterangan,
    totalItemsCount: normalizedLogs.length,
    logs: normalizedLogs,
    soFisik: params.soFisik || {},
    logsSynced: normalizedLogs.length === 0,
    soSynced: !hasSoLocations,
    attempts: 0,
    status: 'PENDING'
  };

  const current = getScannerOutboxBatches();
  const updated = [...current, newBatch];
  saveScannerOutboxBatches(updated);
  return newBatch;
}

/**
 * Step 1: Reconcile and insert `log_produk` rows for a batch without ever duplicating rows
 * or colliding with PostgreSQL's `id BIGINT GENERATED BY DEFAULT AS IDENTITY` sequence (used by WA Webhook).
 */
async function syncBatchLogsIdempotent(batch: ScannerOutboxBatch): Promise<void> {
  if (batch.logsSynced || batch.logs.length === 0) {
    batch.logsSynced = true;
    return;
  }

  let existingRows: LogProdukItem[] = [];
  if (batch.attempts > 0) {
    // Pre-flight check on retry: inspect what rows from this exact (invoice + created_at) already landed in Supabase
    try {
      const query = `select=type,invoice,sku,lokasi,qty,created_at&invoice=eq.${encodeURIComponent(
        batch.invoice
      )}&created_at=eq.${encodeURIComponent(batch.createdAtIso)}`;
      const res = await supabaseFetch<LogProdukItem[]>('log_produk', 'GET', null, query);
      if (Array.isArray(res)) {
        existingRows = res;
      }
    } catch {
      // If pre-flight GET fails due to network drop, throw immediately so we don't blindly POST
      throw new Error('Koneksi ke server belum stabil saat memeriksa status pengiriman log.');
    }
  }

  // Build multiset count of already-inserted rows by (type|sku|lokasi|qty)
  const existingCounts = new Map<string, number>();
  for (const row of existingRows) {
    const key = `${String(row.type || '').toUpperCase()}|${String(row.sku || '').toUpperCase()}|${String(
      row.lokasi || ''
    ).toUpperCase()}|${Number(row.qty) || 0}`;
    existingCounts.set(key, (existingCounts.get(key) || 0) + 1);
  }

  const remainingLogs: LogProdukItem[] = [];
  for (const item of batch.logs) {
    const key = `${String(item.type || '').toUpperCase()}|${String(item.sku || '').toUpperCase()}|${String(
      item.lokasi || ''
    ).toUpperCase()}|${Number(item.qty) || 0}`;
    const alreadyCount = existingCounts.get(key) || 0;
    if (alreadyCount > 0) {
      existingCounts.set(key, alreadyCount - 1);
    } else {
      // Never send numeric `id` so PostgreSQL's sequence never collides with WA Webhook
      const { id: _omitId, ...cleanPayload } = item as any;
      remainingLogs.push({
        ...cleanPayload,
        area: getAreaFromLokasi(item.lokasi || '')
      });
    }
  }

  if (remainingLogs.length > 0) {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < remainingLogs.length; i += CHUNK_SIZE) {
      const chunk = remainingLogs.slice(i, i + CHUNK_SIZE);
      await supabaseFetch('log_produk', 'POST', chunk);
    }
  }

  batch.logsSynced = true;
}

/**
 * Step 2: Reconcile and insert `stock_opname_queue` rows for `#SO` locations with deterministic UUIDs (`on_conflict=id`).
 */
async function syncBatchStockOpnameIdempotent(
  batch: ScannerOutboxBatch,
  productCatalog: ProductItem[] = []
): Promise<void> {
  if (batch.soSynced) return;
  const lokasis = Object.keys(batch.soFisik || {});
  if (lokasis.length === 0) {
    batch.soSynced = true;
    return;
  }

  if (!batch.soQueueItems) {
    const currentStock = await fetchStockForLocations(lokasis);
    const soQueueToInsert: StockOpnameQueueItem[] = [];

    lokasis.forEach((lokasi) => {
      const physicalCounts = batch.soFisik[lokasi] || {};
      const systemStockForLokasi = currentStock.filter(
        (s) => String(s.lokasi || '').toUpperCase() === lokasi.toUpperCase()
      );

      const allSkus = new Set([
        ...Object.keys(physicalCounts),
        ...systemStockForLokasi.map((s) => String(s.sku || '').toUpperCase())
      ]);

      allSkus.forEach((rawSku) => {
        const sku = String(rawSku || '').trim().toUpperCase();
        if (!sku) return;
        const qty_fisik = physicalCounts[sku] || 0;
        const sysRow = systemStockForLokasi.find(
          (s) => String(s.sku || '').toUpperCase() === sku
        );
        const qty_sistem = sysRow ? Number(sysRow.sisa_stok) : 0;
        const selisih = qty_fisik - qty_sistem;

        if (selisih === 0) return;

        const master = lookupProductBySku(sku);
        const pData = productCatalog.find((p) => String(p.k || '').toUpperCase() === sku);
        const officialName =
          master?.found && master.nama_produk
            ? master.nama_produk
            : cleanProductName(String(pData?.p || sysRow?.nama_produk || sku));
        const officialSize = resolveProductDisplaySize(
          sku,
          master?.size || sysRow?.size || pData?.s || ''
        );

        soQueueToInsert.push({
          id: generateUUID(),
          sesi_id: batch.invoice,
          tanggal: batch.createdAtIso,
          sku,
          nama_produk: officialName,
          size: officialSize,
          lokasi,
          alasan: batch.keterangan
            ? `Pending Adjustment - ${batch.keterangan}`
            : `Selisih Opname (${selisih > 0 ? `+${selisih}` : selisih})`,
          area: sysRow?.area || getAreaFromLokasi(lokasi),
          qty_sistem,
          qty_fisik,
          selisih,
          status: 'PENDING',
          jenis: 'Opname',
          operator: batch.operator,
          invoice: batch.invoice
        });
      });
    });

    batch.soQueueItems = soQueueToInsert;
  } else {
    batch.soQueueItems = batch.soQueueItems.map((it) => ({
      ...it,
      id: isValidUUID(it.id) ? it.id : generateUUID()
    }));
  }

  if (batch.soQueueItems.length > 0) {
    await insertStockOpnameQueue(batch.soQueueItems);
  }

  batch.soSynced = true;
}

/**
 * Process all pending Scanner Outbox batches sequentially with mutex protection.
 */
export async function syncAllScannerOutboxBatches(
  productCatalog: ProductItem[] = []
): Promise<{
  syncedBatches: number;
  syncedItems: number;
  remainingBatches: number;
  errors: string[];
}> {
  const current = getScannerOutboxBatches();
  if (current.length === 0) {
    return { syncedBatches: 0, syncedItems: 0, remainingBatches: 0, errors: [] };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      syncedBatches: 0,
      syncedItems: 0,
      remainingBatches: current.length,
      errors: ['Perangkat sedang offline']
    };
  }

  if (isOutboxSyncing) {
    return {
      syncedBatches: 0,
      syncedItems: 0,
      remainingBatches: current.length,
      errors: []
    };
  }

  isOutboxSyncing = true;
  let syncedBatches = 0;
  let syncedItems = 0;
  const errors: string[] = [];
  const workingList = [...current];

  try {
    for (let i = 0; i < workingList.length; i++) {
      const batch = workingList[i];
      batch.status = 'SYNCING';
      saveScannerOutboxBatches(workingList.filter((b) => !(b.logsSynced && b.soSynced)));

      try {
        // Step 1: Sync log_produk with pre-flight delta check
        await syncBatchLogsIdempotent(batch);
        // Immediately persist Step 1 progress so if Step 2 fails, Step 1 is never repeated
        saveScannerOutboxBatches(workingList.filter((b) => !(b.logsSynced && b.soSynced)));

        // Step 2: Sync stock_opname_queue with UUID on_conflict=id
        await syncBatchStockOpnameIdempotent(batch, productCatalog);

        batch.status = 'PENDING';
        batch.lastError = undefined;
        syncedBatches++;
        syncedItems += batch.totalItemsCount || batch.logs.length;
      } catch (err: any) {
        batch.attempts = (batch.attempts || 0) + 1;
        batch.status = 'FAILED';
        batch.lastError = err?.message || 'Gangguan jaringan saat sinkronisasi';
        errors.push(batch.lastError!);
      }

      // Persist updated state after each batch
      const stillPending = workingList.filter((b) => !(b.logsSynced && b.soSynced));
      saveScannerOutboxBatches(stillPending);
    }

    if (syncedBatches > 0) {
      invalidateStokFisikCache();
    }
  } finally {
    isOutboxSyncing = false;
  }

  const remaining = getScannerOutboxBatches();
  return {
    syncedBatches,
    syncedItems,
    remainingBatches: remaining.length,
    errors
  };
}
