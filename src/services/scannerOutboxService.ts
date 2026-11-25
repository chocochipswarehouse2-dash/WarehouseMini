import {
  LogProdukItem,
  StockOpnameQueueItem,
  ProductItem,
  PenerimaanProduksiItem,
  PenerimaanRecountLogItem,
  PickingListItem,
  PickingSplitAllocation,
  PutawayTask,
  SystemDoc
} from '../types';
import {
  supabaseFetch,
  fetchStockForLocations,
  fetchStockForSkus,
  bumpCloudCacheEpoch,
  insertStockOpnameQueue,
  getAreaFromLokasi,
  generateUUID,
  isValidUUID,
  invalidateStokFisikCache,
  saveRecountAuditRecord,
  savePenerimaanRecountLog,
  invalidatePenerimaanProduksiCache,
  insertPickingListRowsToSupabase,
  syncSinglePickingItemRealtimeSupabase,
  resolvePrimarySingleLocation,
  buildOutLogEntriesForPickingItem,
  resolvePickingItemActualPicker,
  summarizePickSplitsLocations
} from './supabase';
import {
  pushMasterRecountDeltaToGoogleSheet,
  MasterRecountDeltaItem
} from './gasProduksiSync';
import { lookupProductBySku } from '../utils/productLookup';
import { cleanProductName, resolveProductDisplaySize } from '../utils/sortUtils';

const OUTBOX_STORAGE_KEY = 'wms_scanner_outbox_queue_v1';
const LEGACY_OFFLINE_LOGS_KEY = 'wms_offline_logs';
const RECOUNT_OUTBOX_STORAGE_KEY = 'wms_recount_offline_outbox_v1';
const RECOUNT_WORKSPACE_DRAFT_KEY = 'wms_recount_workspace_draft_v1';
const PICKING_OUTBOX_STORAGE_KEY = 'wms_picking_offline_outbox_v1';
const PICKING_ITEM_SYNC_QUEUE_KEY = 'wms_picking_item_sync_queue_v1';
const PICKING_SJ_DRAFTS_KEY = 'wms_picking_sj_drafts_v1';
const ACTIVE_PICKING_SESSION_KEY = 'wms_active_picking_session';
const PUTAWAY_OUTBOX_STORAGE_KEY = 'wms_putaway_offline_outbox_v1';
const ACTIVE_PUTAWAY_SESSION_KEY = 'wms_active_putaway_session_v1';
const PUTAWAY_DOCS_SECTION_OUTBOX = 'wms_putaway_tasks_v1';
const PUTAWAY_LOCAL_CACHE_KEY_OUTBOX = 'wms_putaway_tasks_cache_v1';

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

export interface RecountOutboxBatch {
  batchId: string;
  kode_produksi: string;
  tanggal_audit: string;
  auditor: string;
  round: number;
  updatedItems: PenerimaanProduksiItem[];
  auditRecord: any;
  logRecord: Omit<PenerimaanRecountLogItem, 'id' | 'created_at'> & { id?: string; created_at?: string };
  sheetDelta?: {
    activeTab: 'Kargo' | 'CMT';
    kode_produksi: string;
    tanggal_hitung: string;
    items: MasterRecountDeltaItem[];
  };
  itemsSynced: boolean;
  auditRecordSynced: boolean;
  logSynced: boolean;
  sheetSynced: boolean;
  attempts: number;
  lastError?: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  createdAtIso: string;
}

export interface RecountCodeDraftEntry {
  variantInputs: Record<string, { recountQty: number | null; note: string }>;
  generalNotes: string;
  auditorName: string;
  auditDate: string;
  updatedAt: number;
}

export interface RecountWorkspaceDraftState {
  activeMode: 'queue' | 'workspace';
  selectedCode: string;
  draftsByCode: Record<string, RecountCodeDraftEntry>;
}

let isOutboxSyncing = false;
let isRecountOutboxSyncing = false;

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

// ============================================================================
// RECOUNT (HITUNG ULANG PRODUKSI) OFFLINE OUTBOX & DRAFT PERSISTENCE
// ============================================================================

export function getRecountOutboxBatches(): RecountOutboxBatch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECOUNT_OUTBOX_STORAGE_KEY);
    const parsed: RecountOutboxBatch[] = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getPendingRecountOutboxCount(): number {
  return getRecountOutboxBatches().length;
}

function saveRecountOutboxBatches(batches: RecountOutboxBatch[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (batches.length === 0) {
      localStorage.removeItem(RECOUNT_OUTBOX_STORAGE_KEY);
    } else {
      localStorage.setItem(RECOUNT_OUTBOX_STORAGE_KEY, JSON.stringify(batches));
    }
  } catch (err) {
    console.warn('[RecountOutbox] Failed saving recount outbox:', err);
  }
  notifyOutboxUpdated();
}

export function enqueueRecountOutboxBatch(params: {
  kode_produksi: string;
  tanggal_audit: string;
  auditor: string;
  round: number;
  updatedItems: PenerimaanProduksiItem[];
  auditRecord: any;
  logRecord: Omit<PenerimaanRecountLogItem, 'id' | 'created_at'> & { id?: string; created_at?: string };
  sheetDelta?: {
    activeTab: 'Kargo' | 'CMT';
    kode_produksi: string;
    tanggal_hitung: string;
    items: MasterRecountDeltaItem[];
  };
  itemsSynced?: boolean;
  auditRecordSynced?: boolean;
  logSynced?: boolean;
  sheetSynced?: boolean;
}): RecountOutboxBatch {
  const cleanCode = String(params.kode_produksi || '').trim().toUpperCase();
  const newBatch: RecountOutboxBatch = {
    batchId: `RECOUNT-${cleanCode}-R${params.round}-${Date.now()}`,
    kode_produksi: cleanCode,
    tanggal_audit: params.tanggal_audit,
    auditor: params.auditor,
    round: params.round,
    updatedItems: params.updatedItems || [],
    auditRecord: params.auditRecord,
    logRecord: params.logRecord,
    sheetDelta: params.sheetDelta,
    itemsSynced: Boolean(params.itemsSynced),
    auditRecordSynced: Boolean(params.auditRecordSynced),
    logSynced: Boolean(params.logSynced),
    sheetSynced: Boolean(params.sheetSynced || !params.sheetDelta),
    attempts: 0,
    status: 'PENDING',
    createdAtIso: new Date().toISOString()
  };

  // Replace any older unsynced batch for the same kode_produksi so we only sync the latest recount state
  const current = getRecountOutboxBatches().filter(
    (b) => String(b.kode_produksi || '').toUpperCase() !== cleanCode
  );
  const updated = [...current, newBatch];
  saveRecountOutboxBatches(updated);
  return newBatch;
}

export async function syncAllRecountOutboxBatches(): Promise<{
  syncedBatches: number;
  remainingBatches: number;
  errors: string[];
}> {
  const current = getRecountOutboxBatches();
  if (current.length === 0) {
    return { syncedBatches: 0, remainingBatches: 0, errors: [] };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      syncedBatches: 0,
      remainingBatches: current.length,
      errors: ['Perangkat sedang offline']
    };
  }

  if (isRecountOutboxSyncing) {
    return { syncedBatches: 0, remainingBatches: current.length, errors: [] };
  }

  isRecountOutboxSyncing = true;
  let syncedBatches = 0;
  const errors: string[] = [];
  const workingList = [...current];

  try {
    for (let i = 0; i < workingList.length; i++) {
      const batch = workingList[i];
      batch.status = 'SYNCING';
      saveRecountOutboxBatches(
        workingList.filter((b) => !(b.itemsSynced && b.auditRecordSynced && b.logSynced))
      );

      try {
        // Step 1: Idempotent PATCH on penerimaan_produksi rows
        if (!batch.itemsSynced && batch.updatedItems.length > 0) {
          for (const item of batch.updatedItems) {
            const patchPayload: Record<string, any> = {
              qty: Number(item.qty) || 0,
              recount_qty: item.recount_qty,
              recount_selisih: item.recount_selisih,
              recount_status: item.recount_status,
              recount_round: item.recount_round,
              recount_notes: item.recount_notes,
              recount_auditor: item.recount_auditor,
              recount_updated_at: item.recount_updated_at
            };
            try {
              if (item.id && typeof item.id === 'number' && item.id < 1000000000) {
                await supabaseFetch(
                  'penerimaan_produksi',
                  'PATCH',
                  patchPayload,
                  `id=eq.${encodeURIComponent(String(item.id))}`
                );
              } else if (item.kode_produksi && item.warna && item.size && item.tanggal_penerimaan) {
                const q = `kode_produksi=eq.${encodeURIComponent(item.kode_produksi)}&warna=eq.${encodeURIComponent(
                  item.warna
                )}&size=eq.${encodeURIComponent(item.size)}&tanggal_penerimaan=eq.${encodeURIComponent(
                  item.tanggal_penerimaan
                )}`;
                await supabaseFetch('penerimaan_produksi', 'PATCH', patchPayload, q);
              }
            } catch (patchErr: any) {
              const msg = String(patchErr?.message || patchErr || '').toLowerCase();
              const isMissingCol =
                (msg.includes('42703') ||
                  msg.includes('pgrst204') ||
                  msg.includes('does not exist') ||
                  msg.includes('could not find the')) &&
                (msg.includes('recount_') || msg.includes('qty_retur'));
              if (isMissingCol) {
                // Kolom recount_* tidak ada di tabel penerimaan_produksi; data disimpan via recount_audit_map di Step 2
                break;
              }
              throw patchErr;
            }
          }
          batch.itemsSynced = true;
        } else {
          batch.itemsSynced = true;
        }

        // Step 2: Sync recount_audit_results to Cloud Settings / wms_system_docs
        if (!batch.auditRecordSynced && batch.auditRecord) {
          await saveRecountAuditRecord(batch.auditRecord);
          batch.auditRecordSynced = true;
        } else {
          batch.auditRecordSynced = true;
        }

        // Step 3: Sync recount_history_logs_v1
        if (!batch.logSynced && batch.logRecord) {
          await savePenerimaanRecountLog(batch.logRecord);
          batch.logSynced = true;
        } else {
          batch.logSynced = true;
        }

        // Step 4: Best-effort Google Sheet Delta push
        if (!batch.sheetSynced && batch.sheetDelta) {
          try {
            await pushMasterRecountDeltaToGoogleSheet(batch.sheetDelta);
            batch.sheetSynced = true;
          } catch {
            // Sheet sync is non-blocking once Supabase database is synced
            batch.sheetSynced = true;
          }
        }

        batch.status = 'PENDING';
        batch.lastError = undefined;
        syncedBatches++;
      } catch (err: any) {
        batch.attempts = (batch.attempts || 0) + 1;
        batch.status = 'FAILED';
        batch.lastError = err?.message || 'Gangguan jaringan saat sinkronisasi hitung ulang';
        errors.push(batch.lastError!);
      }

      const stillPending = workingList.filter(
        (b) => !(b.itemsSynced && b.auditRecordSynced && b.logSynced)
      );
      saveRecountOutboxBatches(stillPending);
    }

    if (syncedBatches > 0) {
      invalidatePenerimaanProduksiCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wms_penerimaan_produksi_updated'));
        window.dispatchEvent(new CustomEvent('wms_recount_audit_updated'));
      }
    }
  } finally {
    isRecountOutboxSyncing = false;
  }

  const remaining = getRecountOutboxBatches();
  return {
    syncedBatches,
    remainingBatches: remaining.length,
    errors
  };
}

// ============================================================================
// WORKSPACE DRAFT HELPERS (ZERO-DOM MINIMIZE & CLOSE PROTECTION)
// ============================================================================

export function loadRecountWorkspaceDraft(): RecountWorkspaceDraftState {
  if (typeof window === 'undefined') {
    return { activeMode: 'queue', selectedCode: '', draftsByCode: {} };
  }
  try {
    const raw = localStorage.getItem(RECOUNT_WORKSPACE_DRAFT_KEY);
    if (!raw) return { activeMode: 'queue', selectedCode: '', draftsByCode: {} };
    const parsed = JSON.parse(raw);
    return {
      activeMode: parsed?.activeMode === 'workspace' ? 'workspace' : 'queue',
      selectedCode: typeof parsed?.selectedCode === 'string' ? parsed.selectedCode : '',
      draftsByCode:
        parsed?.draftsByCode && typeof parsed.draftsByCode === 'object'
          ? parsed.draftsByCode
          : {}
    };
  } catch {
    return { activeMode: 'queue', selectedCode: '', draftsByCode: {} };
  }
}

export function saveRecountWorkspaceDraft(state: Partial<RecountWorkspaceDraftState>): void {
  if (typeof window === 'undefined') return;
  try {
    const prev = loadRecountWorkspaceDraft();
    const merged: RecountWorkspaceDraftState = {
      activeMode: state.activeMode ?? prev.activeMode,
      selectedCode: state.selectedCode ?? prev.selectedCode,
      draftsByCode: state.draftsByCode
        ? { ...prev.draftsByCode, ...state.draftsByCode }
        : prev.draftsByCode
    };
    localStorage.setItem(RECOUNT_WORKSPACE_DRAFT_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('wms_recount_draft_updated'));
  } catch {}
}

export function clearRecountCodeDraft(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    const norm = String(code || '').trim().toUpperCase();
    const prev = loadRecountWorkspaceDraft();
    const nextDrafts = { ...prev.draftsByCode };
    delete nextDrafts[norm];
    const nextState: RecountWorkspaceDraftState = {
      activeMode: prev.selectedCode === norm ? 'queue' : prev.activeMode,
      selectedCode: prev.selectedCode === norm ? '' : prev.selectedCode,
      draftsByCode: nextDrafts
    };
    localStorage.setItem(RECOUNT_WORKSPACE_DRAFT_KEY, JSON.stringify(nextState));
    window.dispatchEvent(new CustomEvent('wms_recount_draft_updated'));
  } catch {}
}

const RECOUNT_DOCK_DISMISSED_KEY = 'wms_recount_dock_dismissed';

export function isRecountDockDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(RECOUNT_DOCK_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRecountDockDismissed(dismissed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (dismissed) {
      localStorage.setItem(RECOUNT_DOCK_DISMISSED_KEY, '1');
    } else {
      localStorage.removeItem(RECOUNT_DOCK_DISMISSED_KEY);
    }
    window.dispatchEvent(new CustomEvent('wms_recount_draft_updated'));
  } catch {}
}

export function clearAllRecountWorkspaceDrafts(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(RECOUNT_WORKSPACE_DRAFT_KEY);
    window.dispatchEvent(new CustomEvent('wms_recount_draft_updated'));
  } catch {}
}

export function getActiveRecountDraftSummary(): {
  hasActiveWorkspaceDraft: boolean;
  selectedCode: string;
  filledVariantsCount: number;
  queuedCodesCount: number;
  uncountedCodesCount: number;
} {
  if (typeof window === 'undefined') {
    return {
      hasActiveWorkspaceDraft: false,
      selectedCode: '',
      filledVariantsCount: 0,
      queuedCodesCount: 0,
      uncountedCodesCount: 0
    };
  }
  try {
    const draft = loadRecountWorkspaceDraft();
    const rawAudit = localStorage.getItem('wms_recount_audit_map');
    const auditMap = rawAudit ? JSON.parse(rawAudit) : {};

    let activeCode =
      draft.activeMode === 'workspace' && draft.selectedCode
        ? String(draft.selectedCode).trim().toUpperCase()
        : '';
    let filledVariantsCount = 0;

    if (activeCode && draft.draftsByCode[activeCode]?.variantInputs) {
      const draftEntry = draft.draftsByCode[activeCode];
      const auditRec =
        auditMap?.[activeCode] ||
        Object.values(auditMap || {}).find(
          (v: any) => String(v?.kode_produksi || '').trim().toUpperCase() === activeCode
        );

      let isAlreadySavedResidue = false;
      if (auditRec) {
        const auditUpdatedMs = auditRec.updated_at ? new Date(auditRec.updated_at).getTime() : 0;
        const draftUpdatedMs = Number(draftEntry.updatedAt || 0);
        if (auditUpdatedMs && draftUpdatedMs && draftUpdatedMs <= auditUpdatedMs) {
          isAlreadySavedResidue = true;
        } else if (Array.isArray(auditRec.variants)) {
          const savedByVar = new Map<string, number>();
          auditRec.variants.forEach((v: any) => {
            savedByVar.set(`${v.warna || '-'}_${v.size || '-'}`, Number(v.qty_fisik));
          });
          const filledEntries = Object.entries(draftEntry.variantInputs).filter(
            ([, v]) => v && v.recountQty !== null && v.recountQty !== undefined && !isNaN(Number(v.recountQty))
          );
          if (
            filledEntries.length > 0 &&
            filledEntries.every(([k, v]) => savedByVar.get(k) === Number(v.recountQty))
          ) {
            isAlreadySavedResidue = true;
          }
        }
      }

      if (isAlreadySavedResidue) {
        const nextDrafts = { ...draft.draftsByCode };
        delete nextDrafts[activeCode];
        try {
          localStorage.setItem(
            RECOUNT_WORKSPACE_DRAFT_KEY,
            JSON.stringify({
              activeMode: 'queue',
              selectedCode: '',
              draftsByCode: nextDrafts
            })
          );
        } catch {}
        activeCode = '';
        filledVariantsCount = 0;
      } else {
        Object.values(draftEntry.variantInputs).forEach((v) => {
          if (v && v.recountQty !== null && v.recountQty !== undefined && !isNaN(Number(v.recountQty))) {
            filledVariantsCount++;
          }
        });
      }
    }

    const rawQueue = localStorage.getItem('wms_recount_selected_queue');
    const queueMap = rawQueue ? JSON.parse(rawQueue) : {};
    const queueKeys =
      queueMap && typeof queueMap === 'object' && !Array.isArray(queueMap)
        ? Object.keys(queueMap)
        : [];

    let uncountedCodesCount = 0;
    queueKeys.forEach((k) => {
      const code = k.trim().toUpperCase();
      if (!auditMap || !auditMap[code]) {
        uncountedCodesCount++;
      }
    });

    return {
      hasActiveWorkspaceDraft: Boolean(draft.activeMode === 'workspace' && activeCode && filledVariantsCount > 0),
      selectedCode: activeCode,
      filledVariantsCount,
      queuedCodesCount: queueKeys.length,
      uncountedCodesCount
    };
  } catch {
    return {
      hasActiveWorkspaceDraft: false,
      selectedCode: '',
      filledVariantsCount: 0,
      queuedCodesCount: 0,
      uncountedCodesCount: 0
    };
  }
}

export function getActiveProduksiInputDraftSummary(): {
  hasDraft: boolean;
  noSuratJalan: string;
  kategori: string;
  modelCount: number;
  totalPcs: number;
} {
  if (typeof window === 'undefined') {
    return { hasDraft: false, noSuratJalan: '', kategori: 'Lokal CMT', modelCount: 0, totalPcs: 0 };
  }
  try {
    const raw = localStorage.getItem('wms_penerimaan_produksi_form_draft');
    if (!raw) {
      return { hasDraft: false, noSuratJalan: '', kategori: 'Lokal CMT', modelCount: 0, totalPcs: 0 };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { hasDraft: false, noSuratJalan: '', kategori: 'Lokal CMT', modelCount: 0, totalPcs: 0 };
    }
    const blocks = Array.isArray(parsed.productBlocks) ? parsed.productBlocks : [];
    let modelCount = 0;
    let totalPcs = 0;

    blocks.forEach((b: any) => {
      const hasKode = Boolean(String(b?.kode_produksi || '').trim());
      let blockPcs = 0;
      if (Array.isArray(b?.warnas)) {
        b.warnas.forEach((w: any) => {
          if (Array.isArray(w?.sizes)) {
            w.sizes.forEach((s: any) => {
              blockPcs += Number(s?.qty) || 0;
            });
          }
        });
      }
      if (hasKode || blockPcs > 0) {
        modelCount++;
      }
      totalPcs += blockPcs;
    });

    const noSuratJalan = String(parsed.formNoSuratJalan || '').trim().toUpperCase();
    const hasDraft = Boolean(noSuratJalan || modelCount > 0 || totalPcs > 0 || String(parsed.formKeteranganGlobal || '').trim());

    return {
      hasDraft,
      noSuratJalan,
      kategori: parsed.formKategori || 'Lokal CMT',
      modelCount,
      totalPcs
    };
  } catch {
    return { hasDraft: false, noSuratJalan: '', kategori: 'Lokal CMT', modelCount: 0, totalPcs: 0 };
  }
}

// ============================================================================
// TUGAS PICKING OFFLINE OUTBOX & MINIMIZE / PER-SJ DRAFT PERSISTENCE
// ============================================================================

export interface PickingOutboxBatch {
  batchId: string;
  no_sj: string;
  tujuan: string;
  items: PickingListItem[];
  unexpectedItems: PickingListItem[];
  pickerName: string;
  catatan: string;
  syncOutToLog: boolean;
  logsSynced: boolean;
  itemsSynced: boolean;
  unexpectedSynced: boolean;
  peminjamanSynced: boolean;
  attempts: number;
  lastError?: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  createdAtIso: string;
}

export interface PickingSjDraftEntry {
  no_sj: string;
  tujuan: string;
  tanggal?: string;
  activeItems: PickingListItem[];
  unexpectedItems: PickingListItem[];
  activeLocation: string;
  rekapCatatan: string;
  updatedAt: number;
}

let isPickingOutboxSyncing = false;

function notifyPickingOutboxUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_picking_outbox_updated'));
    window.dispatchEvent(new CustomEvent('wms_scanner_outbox_updated'));
  }
}

export function notifyPickingSessionUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_picking_session_updated'));
  }
}

export function getPickingOutboxBatches(): PickingOutboxBatch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PICKING_OUTBOX_STORAGE_KEY);
    const parsed: PickingOutboxBatch[] = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getPendingPickingOutboxCount(): number {
  return getPickingOutboxBatches().length;
}

function savePickingOutboxBatches(batches: PickingOutboxBatch[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (batches.length === 0) {
      localStorage.removeItem(PICKING_OUTBOX_STORAGE_KEY);
    } else {
      localStorage.setItem(PICKING_OUTBOX_STORAGE_KEY, JSON.stringify(batches));
    }
  } catch (err) {
    console.warn('[PickingOutbox] Failed saving picking outbox:', err);
  }
  notifyPickingOutboxUpdated();
}

export function enqueuePickingOutboxBatch(params: {
  no_sj: string;
  tujuan?: string;
  items: PickingListItem[];
  unexpectedItems: PickingListItem[];
  pickerName: string;
  catatan: string;
  syncOutToLog: boolean;
  logsSynced?: boolean;
  itemsSynced?: boolean;
  unexpectedSynced?: boolean;
  peminjamanSynced?: boolean;
}): PickingOutboxBatch {
  const cleanNoSj = String(params.no_sj || '').trim().toUpperCase();
  const isPeminjamanSj = cleanNoSj.startsWith('SPS') || cleanNoSj.startsWith('PJM');
  const newBatch: PickingOutboxBatch = {
    batchId: `PICKING-${cleanNoSj}-${Date.now()}`,
    no_sj: cleanNoSj,
    tujuan: params.tujuan || params.items[0]?.tujuan || 'Marketplace',
    items: params.items || [],
    unexpectedItems: params.unexpectedItems || [],
    pickerName: params.pickerName || 'Operator',
    catatan: params.catatan || '',
    syncOutToLog: Boolean(params.syncOutToLog),
    logsSynced: Boolean(params.logsSynced || !params.syncOutToLog),
    itemsSynced: Boolean(params.itemsSynced),
    unexpectedSynced: Boolean(params.unexpectedSynced || (params.unexpectedItems || []).length === 0),
    peminjamanSynced: Boolean(params.peminjamanSynced || !isPeminjamanSj),
    attempts: 0,
    status: 'PENDING',
    createdAtIso: new Date().toISOString()
  };

  // Replace any older unsynced batch for the same no_sj so only latest completion state is synced
  const current = getPickingOutboxBatches().filter(
    (b) => String(b.no_sj || '').trim().toUpperCase() !== cleanNoSj
  );
  const updated = [...current, newBatch];
  savePickingOutboxBatches(updated);
  return newBatch;
}

export async function syncAllPickingOutboxBatches(): Promise<{
  syncedBatches: number;
  remainingBatches: number;
  errors: string[];
}> {
  const current = getPickingOutboxBatches();
  if (current.length === 0) {
    return { syncedBatches: 0, remainingBatches: 0, errors: [] };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      syncedBatches: 0,
      remainingBatches: current.length,
      errors: ['Perangkat sedang offline']
    };
  }

  if (isPickingOutboxSyncing) {
    return { syncedBatches: 0, remainingBatches: current.length, errors: [] };
  }

  isPickingOutboxSyncing = true;
  let syncedBatches = 0;
  const errors: string[] = [];
  const workingList = [...current];

  const isComplete = (b: PickingOutboxBatch) =>
    b.logsSynced && b.itemsSynced && b.unexpectedSynced && b.peminjamanSynced;

  try {
    for (let i = 0; i < workingList.length; i++) {
      const batch = workingList[i];
      const cleanNoSj = String(batch.no_sj || '').trim().toUpperCase();
      batch.status = 'SYNCING';
      savePickingOutboxBatches(workingList.filter((b) => !isComplete(b)));

      try {
        // Step 1: Idempotent sync to log_produk (#OUT) with pre-flight delta check
        if (!batch.logsSynced && batch.syncOutToLog) {
          const allPicked = [...(batch.items || []), ...(batch.unexpectedItems || [])].filter(
            (x) => (Number(x.qty_picked) || 0) > 0
          );
          if (allPicked.length > 0) {
            const existingRows = await supabaseFetch<Array<{ sku: string; lokasi: string; qty: number }>>(
              'log_produk',
              'GET',
              undefined,
              `select=sku,lokasi,qty&invoice=eq.${encodeURIComponent(cleanNoSj)}&type=eq.OUT`
            );

            const existingOutBySku = new Map<string, number>();
            (existingRows || []).forEach((row) => {
              const skuKey = String(row.sku || '').toUpperCase().trim();
              if (!skuKey) return;
              existingOutBySku.set(skuKey, (existingOutBySku.get(skuKey) || 0) + (Number(row.qty) || 0));
            });

            const logsOut: LogProdukItem[] = [];
            for (const it of allPicked) {
              const skuKey = String(it.sku || '').toUpperCase().trim();
              const pickedQty = Math.max(0, Number(it.qty_picked) || 0);
              if (!skuKey || pickedQty <= 0) continue;

              const alreadyOut = existingOutBySku.get(skuKey) || 0;
              const deltaQty = Math.max(0, pickedQty - alreadyOut);
              existingOutBySku.set(skuKey, Math.max(0, alreadyOut - pickedQty));
              if (deltaQty <= 0) continue;

              const itemLogs = buildOutLogEntriesForPickingItem({
                cleanNoSj,
                item: it,
                deltaQty,
                alreadyOut,
                fallbackPicker: batch.pickerName || 'Picker',
                catatan: batch.catatan || '',
                createdAtIso: batch.createdAtIso || new Date().toISOString()
              });
              logsOut.push(...itemLogs);
            }

            if (logsOut.length > 0) {
              const CHUNK_SIZE = 100;
              for (let c = 0; c < logsOut.length; c += CHUNK_SIZE) {
                await supabaseFetch('log_produk', 'POST', logsOut.slice(c, c + CHUNK_SIZE));
              }
            }
          }
          batch.logsSynced = true;
          savePickingOutboxBatches(workingList.filter((b) => !isComplete(b)));
        } else {
          batch.logsSynced = true;
        }

        // Step 2: Patch picking_list rows as SELESAI (bounded parallel chunks + SJ-wide orphan sweep)
        if (!batch.itemsSynced) {
          const batchItems = batch.items || [];
          const PATCH_CONCURRENCY = 8;
          for (let c = 0; c < batchItems.length; c += PATCH_CONCURRENCY) {
            const chunk = batchItems.slice(c, c + PATCH_CONCURRENCY);
            await Promise.all(
              chunk.map(async (item) => {
                const condition =
                  item.id && (typeof item.id === 'number' || (typeof item.id === 'string' && !item.id.startsWith('pick_')))
                    ? `id=eq.${item.id}`
                    : `no_sj=eq.${encodeURIComponent(cleanNoSj)}&sku=eq.${encodeURIComponent(item.sku)}`;

                const itemPicker = resolvePickingItemActualPicker(item, batch.pickerName || 'Operator');
                const splitLocSummary = summarizePickSplitsLocations(item.pick_splits);
                const pickedLocToSave =
                  (Number(item.qty_picked) || 0) > 0
                    ? splitLocSummary || resolvePrimarySingleLocation(item.lokasi_picked || '') || ''
                    : '';

                try {
                  const payload: Record<string, any> = {
                    qty_picked: item.qty_picked,
                    status: 'SELESAI',
                    picker_name: itemPicker
                  };
                  if (pickedLocToSave) {
                    payload.lokasi = pickedLocToSave;
                  }
                  if (batch.catatan) {
                    payload.catatan = batch.catatan;
                  }
                  await supabaseFetch('picking_list', 'PATCH', payload, condition);
                } catch (patchErr: any) {
                  const errMsg = String(patchErr?.message || patchErr || '').toLowerCase();
                  if (errMsg.includes('column') || errMsg.includes('catatan') || errMsg.includes('400')) {
                    const minimalPayload: Record<string, any> = {
                      qty_picked: item.qty_picked,
                      status: 'SELESAI',
                      picker_name: itemPicker
                    };
                    if (pickedLocToSave) {
                      minimalPayload.lokasi = pickedLocToSave;
                    }
                    await supabaseFetch('picking_list', 'PATCH', minimalPayload, condition);
                  } else {
                    throw patchErr;
                  }
                }
              })
            );
          }

          // SJ-wide orphan sweep to ensure zero rows remain stuck in PENDING / SEDANG PICKING
          const sweepCond = `no_sj=ilike.${encodeURIComponent(cleanNoSj)}&status=neq.SELESAI`;
          try {
            await supabaseFetch(
              'picking_list',
              'PATCH',
              { status: 'SELESAI', picker_name: batch.pickerName },
              sweepCond
            );
          } catch {
            await supabaseFetch('picking_list', 'PATCH', { status: 'SELESAI' }, sweepCond);
          }

          batch.itemsSynced = true;
          savePickingOutboxBatches(workingList.filter((b) => !isComplete(b)));
        }

        // Step 3: Insert unexpected items if any
        if (!batch.unexpectedSynced && (batch.unexpectedItems || []).length > 0) {
          const nowIso = batch.createdAtIso || new Date().toISOString();
          const unexpPayloads = batch.unexpectedItems.map((unexp) => ({
            no_sj: cleanNoSj,
            tanggal: nowIso.slice(0, 10),
            tujuan: batch.tujuan || batch.items[0]?.tujuan || 'Marketplace',
            sku: unexp.sku,
            nama_produk: unexp.nama_produk || unexp.sku,
            qty_req: 0,
            qty_picked: unexp.qty_picked,
            lokasi:
              summarizePickSplitsLocations(unexp.pick_splits) ||
              resolvePrimarySingleLocation(unexp.lokasi_picked || unexp.lokasi || '') ||
              '-',
            status: 'SELESAI',
            picker_name: resolvePickingItemActualPicker(unexp, batch.pickerName || 'Operator'),
            created_at: nowIso
          }));
          const ok = await insertPickingListRowsToSupabase(unexpPayloads);
          if (!ok) {
            throw new Error('Gagal menyimpan item tambahan picking ke Supabase');
          }
          batch.unexpectedSynced = true;
          savePickingOutboxBatches(workingList.filter((b) => !isComplete(b)));
        } else {
          batch.unexpectedSynced = true;
        }

        // Step 4: Patch peminjaman if SPS / PJM
        if (!batch.peminjamanSynced && (cleanNoSj.startsWith('SPS') || cleanNoSj.startsWith('PJM'))) {
          await supabaseFetch(
            'peminjaman',
            'PATCH',
            { status: 'SELESAI' },
            `no_peminjaman=ilike.${encodeURIComponent(cleanNoSj)}`
          ).catch(() => {});
          batch.peminjamanSynced = true;
        } else {
          batch.peminjamanSynced = true;
        }

        batch.status = 'PENDING';
        batch.lastError = undefined;
        syncedBatches++;
      } catch (err: any) {
        batch.attempts = (batch.attempts || 0) + 1;
        batch.status = 'FAILED';
        batch.lastError = err?.message || 'Gangguan jaringan saat sinkronisasi tugas picking';
        errors.push(batch.lastError!);
      }

      savePickingOutboxBatches(workingList.filter((b) => !isComplete(b)));
    }

    if (syncedBatches > 0) {
      invalidateStokFisikCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wms_picking_list_updated'));
      }
    }
  } finally {
    isPickingOutboxSyncing = false;
  }

  const remaining = getPickingOutboxBatches();
  return {
    syncedBatches,
    remainingBatches: remaining.length,
    errors
  };
}

// ============================================================================
// PER-ITEM OFFLINE SYNC QUEUE (PROTECT IN-PROGRESS PICKS ACROSS OFFLINE/ONLINE)
// ============================================================================

export interface PickingItemSyncMutation {
  key: string; // `${cleanNoSj}__${cleanSku}`
  id?: string | number;
  no_sj: string;
  sku: string;
  mode: 'delta' | 'absolute';
  delta?: number;
  absoluteQty?: number;
  markKosong?: boolean;
  lokasi_picked: string;
  pick_splits?: PickingSplitAllocation[];
  username: string;
  currentItem?: PickingListItem;
  updatedAt: number;
}

export interface FlushedPickingItemResult {
  key: string;
  no_sj: string;
  sku: string;
  item: PickingListItem | null;
  isOverPick: boolean;
  previousPicker: string;
  serverQtyBefore: number;
  newQty: number;
}

let inFlightPickingItemFlushPromise: Promise<{
  syncedItems: FlushedPickingItemResult[];
  remainingCount: number;
}> | null = null;

function notifyPickingItemSyncQueueUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_picking_item_sync_queue_updated'));
  }
}

function makePickingItemSyncKey(noSj: string, sku: string): string {
  return `${String(noSj || '').trim().toUpperCase()}__${String(sku || '').trim().toUpperCase()}`;
}

export function getPendingPickingItemSyncQueue(): PickingItemSyncMutation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PICKING_ITEM_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePendingPickingItemSyncQueue(queue: PickingItemSyncMutation[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (queue.length === 0) {
      localStorage.removeItem(PICKING_ITEM_SYNC_QUEUE_KEY);
    } else {
      localStorage.setItem(PICKING_ITEM_SYNC_QUEUE_KEY, JSON.stringify(queue));
    }
  } catch (err) {
    console.warn('[PickingItemQueue] Gagal menyimpan antrean item offline:', err);
  }
  notifyPickingItemSyncQueueUpdated();
}

export function getPendingPickingItemSyncCount(noSj?: string): number {
  const queue = getPendingPickingItemSyncQueue();
  if (!noSj) return queue.length;
  const cleanSj = String(noSj || '').trim().toUpperCase();
  return queue.filter((q) => String(q.no_sj || '').trim().toUpperCase() === cleanSj).length;
}

export function hasPendingPickingItemSyncForSku(noSj: string, sku: string): boolean {
  const key = makePickingItemSyncKey(noSj, sku);
  return getPendingPickingItemSyncQueue().some((q) => q.key === key);
}

export function clearPendingPickingItemSyncForSj(noSj: string): void {
  if (typeof window === 'undefined') return;
  const cleanSj = String(noSj || '').trim().toUpperCase();
  if (!cleanSj) return;
  const current = getPendingPickingItemSyncQueue();
  const next = current.filter((q) => String(q.no_sj || '').trim().toUpperCase() !== cleanSj);
  if (next.length !== current.length) {
    savePendingPickingItemSyncQueue(next);
  }
}

export function enqueuePickingItemSyncMutation(params: {
  id?: string | number;
  no_sj: string;
  sku: string;
  delta?: number;
  absoluteQty?: number;
  markKosong?: boolean;
  lokasi_picked: string;
  pick_splits?: PickingSplitAllocation[];
  username: string;
  currentItem?: PickingListItem;
}): PickingItemSyncMutation[] {
  const cleanNoSj = String(params.no_sj || '').trim().toUpperCase();
  const cleanSku = String(params.sku || '').trim().toUpperCase();
  if (!cleanNoSj || !cleanSku) return getPendingPickingItemSyncQueue();

  const key = makePickingItemSyncKey(cleanNoSj, cleanSku);
  const current = getPendingPickingItemSyncQueue();
  const existingIdx = current.findIndex((q) => q.key === key);
  const existing = existingIdx >= 0 ? current[existingIdx] : null;
  const nowTs = Date.now();

  let nextEntry: PickingItemSyncMutation | null = null;

  if (typeof params.delta === 'number') {
    if (existing?.mode === 'absolute') {
      nextEntry = {
        ...existing,
        id: params.id ?? existing.id,
        mode: 'absolute',
        absoluteQty: Math.max(0, (Number(existing.absoluteQty) || 0) + params.delta),
        markKosong: false,
        lokasi_picked: params.lokasi_picked || existing.lokasi_picked,
        pick_splits: params.pick_splits ?? existing.pick_splits,
        username: params.username || existing.username,
        currentItem: params.currentItem || existing.currentItem,
        updatedAt: nowTs,
      };
    } else if (existing?.mode === 'delta') {
      const combinedDelta = (Number(existing.delta) || 0) + params.delta;
      if (combinedDelta === 0 && !existing.markKosong) {
        nextEntry = null;
      } else {
        nextEntry = {
          ...existing,
          id: params.id ?? existing.id,
          mode: 'delta',
          delta: combinedDelta,
          markKosong: false,
          lokasi_picked: params.lokasi_picked || existing.lokasi_picked,
          pick_splits: params.pick_splits ?? existing.pick_splits,
          username: params.username || existing.username,
          currentItem: params.currentItem || existing.currentItem,
          updatedAt: nowTs,
        };
      }
    } else if (params.delta !== 0 || params.markKosong) {
      nextEntry = {
        key,
        id: params.id,
        no_sj: cleanNoSj,
        sku: cleanSku,
        mode: 'delta',
        delta: params.delta,
        markKosong: Boolean(params.markKosong),
        lokasi_picked: params.lokasi_picked || '',
        pick_splits: params.pick_splits,
        username: params.username || 'Operator',
        currentItem: params.currentItem,
        updatedAt: nowTs,
      };
    }
  } else {
    nextEntry = {
      key,
      id: params.id ?? existing?.id,
      no_sj: cleanNoSj,
      sku: cleanSku,
      mode: 'absolute',
      absoluteQty: Math.max(0, Number(params.absoluteQty ?? 0) || 0),
      markKosong: Boolean(params.markKosong),
      lokasi_picked: params.lokasi_picked || existing?.lokasi_picked || '',
      pick_splits: params.pick_splits ?? existing?.pick_splits,
      username: params.username || existing?.username || 'Operator',
      currentItem: params.currentItem || existing?.currentItem,
      updatedAt: nowTs,
    };
  }

  const nextQueue = current.filter((q) => q.key !== key);
  if (nextEntry) {
    nextQueue.push(nextEntry);
  }
  savePendingPickingItemSyncQueue(nextQueue);
  return nextQueue;
}

export async function flushPendingPickingItemSyncQueue(): Promise<{
  syncedItems: FlushedPickingItemResult[];
  remainingCount: number;
}> {
  if (typeof window === 'undefined') {
    return { syncedItems: [], remainingCount: 0 };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { syncedItems: [], remainingCount: getPendingPickingItemSyncQueue().length };
  }

  if (inFlightPickingItemFlushPromise) {
    return inFlightPickingItemFlushPromise;
  }

  inFlightPickingItemFlushPromise = (async () => {
    const syncedByKey = new Map<string, FlushedPickingItemResult>();
    const maxIterations = Math.max(40, getPendingPickingItemSyncQueue().length * 5);
    let iterations = 0;

    while (iterations < maxIterations) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
      const queue = getPendingPickingItemSyncQueue();
      if (queue.length === 0) break;

      iterations++;
      const snapshot = queue[0];
      const res = await syncSinglePickingItemRealtimeSupabase({
        id: snapshot.id,
        no_sj: snapshot.no_sj,
        sku: snapshot.sku,
        delta: snapshot.mode === 'delta' ? snapshot.delta : undefined,
        absoluteQty: snapshot.mode === 'absolute' ? snapshot.absoluteQty : undefined,
        markKosong: snapshot.markKosong,
        lokasi_picked: snapshot.lokasi_picked,
        pickSplits: snapshot.pick_splits,
        username: snapshot.username,
        currentItem: snapshot.currentItem,
      });

      if (!res.remoteSaved) {
        // Jaringan masih bermasalah / PATCH ditolak -> pertahankan antrean agar tidak hilang saat refresh
        break;
      }

      syncedByKey.set(snapshot.key, {
        key: snapshot.key,
        no_sj: snapshot.no_sj,
        sku: snapshot.sku,
        item: res.item,
        isOverPick: res.isOverPick,
        previousPicker: res.previousPicker,
        serverQtyBefore: res.serverQtyBefore,
        newQty: res.newQty,
      });

      // Reconcile against any mid-flight mutations that landed for this same SKU during PATCH
      const latestQueue = getPendingPickingItemSyncQueue();
      const latestIdx = latestQueue.findIndex((q) => q.key === snapshot.key);
      if (latestIdx >= 0) {
        const latest = latestQueue[latestIdx];
        if (latest.updatedAt === snapshot.updatedAt) {
          latestQueue.splice(latestIdx, 1);
        } else if (latest.mode === 'delta' && snapshot.mode === 'delta') {
          const remainder = (Number(latest.delta) || 0) - (Number(snapshot.delta) || 0);
          if (remainder === 0 && !latest.markKosong) {
            latestQueue.splice(latestIdx, 1);
          } else {
            latestQueue[latestIdx] = {
              ...latest,
              delta: remainder,
            };
          }
        }
        savePendingPickingItemSyncQueue(latestQueue);
      }
    }

    return {
      syncedItems: Array.from(syncedByKey.values()),
      remainingCount: getPendingPickingItemSyncQueue().length,
    };
  })();

  try {
    return await inFlightPickingItemFlushPromise;
  } finally {
    inFlightPickingItemFlushPromise = null;
  }
}

// ============================================================================
// PER-SJ DRAFT MAP & ACTIVE PICKING SESSION HELPERS
// ============================================================================

export function getPickingSjDraftsMap(): Record<string, PickingSjDraftEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PICKING_SJ_DRAFTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function savePickingSjDraft(entry: PickingSjDraftEntry): void {
  if (typeof window === 'undefined') return;
  const cleanNoSj = String(entry.no_sj || '').trim().toUpperCase();
  if (!cleanNoSj) return;
  try {
    const map = getPickingSjDraftsMap();
    map[cleanNoSj] = {
      ...entry,
      no_sj: cleanNoSj,
      updatedAt: Date.now()
    };
    // Keep up to 30 most recent SJ drafts to avoid localStorage bloat
    const keys = Object.keys(map);
    if (keys.length > 30) {
      const sorted = keys.sort((a, b) => (map[b]?.updatedAt || 0) - (map[a]?.updatedAt || 0));
      sorted.slice(30).forEach((k) => delete map[k]);
    }
    localStorage.setItem(PICKING_SJ_DRAFTS_KEY, JSON.stringify(map));
    notifyPickingSessionUpdated();
  } catch (err) {
    console.warn('[PickingDraft] Failed saving per-SJ draft:', err);
  }
}

export function removePickingSjDraft(no_sj: string): void {
  if (typeof window === 'undefined') return;
  const cleanNoSj = String(no_sj || '').trim().toUpperCase();
  if (!cleanNoSj) return;
  try {
    const map = getPickingSjDraftsMap();
    if (map[cleanNoSj]) {
      delete map[cleanNoSj];
      if (Object.keys(map).length === 0) {
        localStorage.removeItem(PICKING_SJ_DRAFTS_KEY);
      } else {
        localStorage.setItem(PICKING_SJ_DRAFTS_KEY, JSON.stringify(map));
      }
      notifyPickingSessionUpdated();
    }
  } catch {}
}

export function getActivePickingDraftSummary(): {
  hasSession: boolean;
  isMinimized: boolean;
  noSj: string;
  tujuan: string;
  totalSku: number;
  completedSku: number;
  totalReq: number;
  totalPicked: number;
  progressPct: number;
  activeLocation: string;
  unexpectedCount: number;
  savedDraftsCount: number;
} {
  const empty = {
    hasSession: false,
    isMinimized: false,
    noSj: '',
    tujuan: '',
    totalSku: 0,
    completedSku: 0,
    totalReq: 0,
    totalPicked: 0,
    progressPct: 0,
    activeLocation: '',
    unexpectedCount: 0,
    savedDraftsCount: 0
  };
  if (typeof window === 'undefined') return empty;
  try {
    const draftsMap = getPickingSjDraftsMap();
    const savedDraftsCount = Object.keys(draftsMap).length;
    const raw = localStorage.getItem(ACTIVE_PICKING_SESSION_KEY);
    if (!raw) {
      return { ...empty, savedDraftsCount };
    }
    const parsed = JSON.parse(raw);
    const activeSJ = parsed?.activeSJ;
    if (!activeSJ || !activeSJ.no_sj) {
      return { ...empty, savedDraftsCount };
    }
    const items: PickingListItem[] = Array.isArray(parsed.activeItems)
      ? parsed.activeItems
      : Array.isArray(activeSJ.items)
      ? activeSJ.items
      : [];
    const unexpected: PickingListItem[] = Array.isArray(parsed.unexpectedItems)
      ? parsed.unexpectedItems
      : [];

    const totalSku = items.length;
    const completedSku = items.filter((it) => (Number(it.qty_picked) || 0) >= (Number(it.qty_req) || 1)).length;
    const totalReq = items.reduce((s, it) => s + (Number(it.qty_req) || 0), 0);
    const totalPicked = items.reduce((s, it) => s + (Number(it.qty_picked) || 0), 0);
    const progressPct = totalReq > 0 ? Math.min(100, Math.round((totalPicked / totalReq) * 100)) : 0;

    return {
      hasSession: true,
      isMinimized: Boolean(parsed.isMinimized),
      noSj: String(activeSJ.no_sj || '').trim(),
      tujuan: String(activeSJ.tujuan || 'Marketplace').trim(),
      totalSku,
      completedSku,
      totalReq,
      totalPicked,
      progressPct,
      activeLocation: String(parsed.activeLocation || '').trim(),
      unexpectedCount: unexpected.reduce((s, it) => s + (Number(it.qty_picked) || 0), 0),
      savedDraftsCount
    };
  } catch {
    return empty;
  }
}

export function setActivePickingSessionMinimized(minimized: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(ACTIVE_PICKING_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.activeSJ) return;
    parsed.isMinimized = Boolean(minimized);
    parsed.timestamp = Date.now();
    localStorage.setItem(ACTIVE_PICKING_SESSION_KEY, JSON.stringify(parsed));
    notifyPickingSessionUpdated();
    if (!minimized) {
      window.dispatchEvent(new CustomEvent('wms_maximize_picking_session'));
    } else {
      window.dispatchEvent(new CustomEvent('wms_minimize_picking_session'));
    }
  } catch {}
}

export function clearActivePickingSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_PICKING_SESSION_KEY);
    notifyPickingSessionUpdated();
    window.dispatchEvent(new CustomEvent('wms_close_picking_session'));
  } catch {}
}

// ============================================================================
// TUGAS PUTAWAY OFFLINE OUTBOX & ACTIVE SESSION HELPERS
// ============================================================================

export interface PutawayOutboxBatch {
  batchId: string;
  taskId: string;
  invoicePutaway: string;
  sourceLocations: string[];
  completedBy: string;
  catatan: string;
  taskSnapshot: PutawayTask;
  logs: LogProdukItem[];
  movedSkus: string[];
  logsSynced: boolean;
  taskSynced: boolean;
  attempts: number;
  lastError?: string;
  status: 'PENDING' | 'SYNCING' | 'FAILED';
  createdAtIso: string;
}

export interface ActivePutawaySessionData {
  taskId: string;
  task: PutawayTask;
  activeTargetLoc: string;
  rekapCatatan: string;
  isMinimized: boolean;
  timestamp: number;
}

let isPutawayOutboxSyncing = false;

function notifyPutawayOutboxUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_putaway_outbox_updated'));
    window.dispatchEvent(new CustomEvent('wms_scanner_outbox_updated'));
  }
}

export function notifyPutawaySessionUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_putaway_session_updated'));
  }
}

export function getPutawayOutboxBatches(): PutawayOutboxBatch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PUTAWAY_OUTBOX_STORAGE_KEY);
    const parsed: PutawayOutboxBatch[] = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getPendingPutawayOutboxCount(): number {
  return getPutawayOutboxBatches().length;
}

function savePutawayOutboxBatches(batches: PutawayOutboxBatch[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (batches.length === 0) {
      localStorage.removeItem(PUTAWAY_OUTBOX_STORAGE_KEY);
    } else {
      localStorage.setItem(PUTAWAY_OUTBOX_STORAGE_KEY, JSON.stringify(batches));
    }
  } catch (err) {
    console.warn('[PutawayOutbox] Failed saving putaway outbox:', err);
  }
  notifyPutawayOutboxUpdated();
}

export function enqueuePutawayOutboxBatch(params: {
  taskId: string;
  invoicePutaway: string;
  sourceLocations: string[];
  completedBy: string;
  catatan: string;
  taskSnapshot: PutawayTask;
  logs: LogProdukItem[];
  movedSkus: string[];
  logsSynced?: boolean;
  taskSynced?: boolean;
}): PutawayOutboxBatch {
  const cleanInvoice = String(params.invoicePutaway || '').trim().toUpperCase();
  const newBatch: PutawayOutboxBatch = {
    batchId: `PUTAWAY-${cleanInvoice}-${Date.now()}`,
    taskId: params.taskId,
    invoicePutaway: cleanInvoice,
    sourceLocations: params.sourceLocations || [],
    completedBy: params.completedBy || 'Operator',
    catatan: params.catatan || '',
    taskSnapshot: params.taskSnapshot,
    logs: params.logs || [],
    movedSkus: Array.from(new Set(params.movedSkus || [])),
    logsSynced: Boolean(params.logsSynced || (params.logs || []).length === 0),
    taskSynced: Boolean(params.taskSynced),
    attempts: 0,
    status: 'PENDING',
    createdAtIso: new Date().toISOString(),
  };

  const current = getPutawayOutboxBatches().filter(
    (b) => b.taskId !== params.taskId && b.invoicePutaway !== cleanInvoice
  );
  savePutawayOutboxBatches([...current, newBatch]);
  return newBatch;
}

function isMissingPutawayTableError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('42p01') ||
    msg.includes('pgrst205') ||
    msg.includes('putaway_tasks') && (msg.includes('does not exist') || msg.includes('not found') || msg.includes('404'))
  );
}

export async function syncAllPutawayOutboxBatches(): Promise<{
  syncedBatches: number;
  remainingBatches: number;
  errors: string[];
}> {
  const current = getPutawayOutboxBatches();
  if (current.length === 0) {
    return { syncedBatches: 0, remainingBatches: 0, errors: [] };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      syncedBatches: 0,
      remainingBatches: current.length,
      errors: ['Perangkat sedang offline'],
    };
  }
  if (isPutawayOutboxSyncing) {
    return { syncedBatches: 0, remainingBatches: current.length, errors: [] };
  }

  isPutawayOutboxSyncing = true;
  let syncedBatches = 0;
  const errors: string[] = [];
  const workingList = [...current];
  const allMovedSkus = new Set<string>();
  const isComplete = (b: PutawayOutboxBatch) => b.logsSynced && b.taskSynced;

  try {
    for (let i = 0; i < workingList.length; i++) {
      const batch = workingList[i];
      batch.status = 'SYNCING';
      savePutawayOutboxBatches(workingList.filter((b) => !isComplete(b)));

      try {
        // Step 1: Idempotent sync to log_produk (OUT + IN)
        if (!batch.logsSynced && batch.logs.length > 0) {
          const existingRows = await supabaseFetch<Array<{ type: string; sku: string; lokasi: string; qty: number }>>(
            'log_produk',
            'GET',
            null,
            `select=type,sku,lokasi,qty&invoice=eq.${encodeURIComponent(batch.invoicePutaway)}`
          );

          const existingCounts = new Map<string, number>();
          (existingRows || []).forEach((row) => {
            const k = `${String(row.type || '').toUpperCase()}|${String(row.sku || '').toUpperCase()}|${String(row.lokasi || '').toUpperCase()}|${Number(row.qty) || 0}`;
            existingCounts.set(k, (existingCounts.get(k) || 0) + 1);
          });

          const remainingLogs: LogProdukItem[] = [];
          for (const log of batch.logs) {
            const k = `${String(log.type || '').toUpperCase()}|${String(log.sku || '').toUpperCase()}|${String(log.lokasi || '').toUpperCase()}|${Number(log.qty) || 0}`;
            const count = existingCounts.get(k) || 0;
            if (count > 0) {
              existingCounts.set(k, count - 1);
            } else {
              remainingLogs.push(log);
            }
          }

          if (remainingLogs.length > 0) {
            const CHUNK_SIZE = 150;
            for (let c = 0; c < remainingLogs.length; c += CHUNK_SIZE) {
              await supabaseFetch('log_produk', 'POST', remainingLogs.slice(c, c + CHUNK_SIZE));
            }
          }

          batch.logsSynced = true;
          savePutawayOutboxBatches(workingList.filter((b) => !isComplete(b)));
        } else {
          batch.logsSynced = true;
        }

        // Step 2: Update PutawayTask status to SELESAI in putaway_tasks or wms_system_docs
        if (!batch.taskSynced) {
          const doneTask: PutawayTask = {
            ...batch.taskSnapshot,
            status: 'SELESAI',
            completed_by: batch.completedBy,
            completed_at: batch.taskSnapshot.completed_at || batch.createdAtIso,
            updated_at: new Date().toISOString(),
            catatan: batch.catatan || batch.taskSnapshot.catatan || '',
          };

          let updatedDedicated = false;
          try {
            const patchRes = await supabaseFetch<any[]>(
              'putaway_tasks',
              'PATCH',
              {
                status: 'SELESAI',
                completed_by: doneTask.completed_by,
                completed_at: doneTask.completed_at,
                updated_at: doneTask.updated_at,
                catatan: doneTask.catatan || '',
                items: doneTask.items,
                active_operators: doneTask.active_operators,
              },
              `id=eq.${encodeURIComponent(doneTask.id)}`,
              true
            );
            if (!Array.isArray(patchRes) || patchRes.length === 0) {
              await supabaseFetch('putaway_tasks', 'POST', [doneTask]);
            }
            updatedDedicated = true;
          } catch (tblErr: any) {
            if (!isMissingPutawayTableError(tblErr)) {
              throw tblErr;
            }
          }

          if (!updatedDedicated) {
            const docs = await supabaseFetch<SystemDoc[]>(
              'wms_system_docs',
              'GET',
              null,
              `section_id=eq.${encodeURIComponent(PUTAWAY_DOCS_SECTION_OUTBOX)}&limit=1`
            );
            let existingList: PutawayTask[] = [];
            if (Array.isArray(docs) && docs[0]?.content) {
              try {
                const parsed = JSON.parse(docs[0].content);
                if (Array.isArray(parsed)) existingList = parsed;
              } catch {}
            }
            const idx = existingList.findIndex((t) => t.id === doneTask.id);
            if (idx >= 0) existingList[idx] = doneTask;
            else existingList.unshift(doneTask);

            const activeOnes = existingList.filter((t) => t.status === 'AKTIF');
            const historyOnes = existingList
              .filter((t) => t.status !== 'AKTIF')
              .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
              .slice(0, 80);

            await supabaseFetch(
              'wms_system_docs',
              'POST',
              [
                {
                  section_id: PUTAWAY_DOCS_SECTION_OUTBOX,
                  content: JSON.stringify([...activeOnes, ...historyOnes]),
                  updated_by: batch.completedBy,
                },
              ],
              'on_conflict=section_id',
              true
            );
          }

          try {
            const cachedRaw = localStorage.getItem(PUTAWAY_LOCAL_CACHE_KEY_OUTBOX);
            const cachedList: PutawayTask[] = cachedRaw ? JSON.parse(cachedRaw) : [];
            const nextCached = Array.isArray(cachedList)
              ? cachedList.map((t) => (t.id === doneTask.id ? doneTask : t))
              : [doneTask];
            if (!nextCached.some((t) => t.id === doneTask.id)) nextCached.unshift(doneTask);
            localStorage.setItem(PUTAWAY_LOCAL_CACHE_KEY_OUTBOX, JSON.stringify(nextCached));
          } catch {}

          batch.taskSynced = true;
          savePutawayOutboxBatches(workingList.filter((b) => !isComplete(b)));
        }

        batch.movedSkus.forEach((s) => allMovedSkus.add(s));
        batch.status = 'PENDING';
        batch.lastError = undefined;
        syncedBatches++;
      } catch (err: any) {
        batch.attempts = (batch.attempts || 0) + 1;
        batch.status = 'FAILED';
        batch.lastError = err?.message || 'Gangguan jaringan saat sinkronisasi Tugas Putaway';
        errors.push(batch.lastError!);
      }

      savePutawayOutboxBatches(workingList.filter((b) => !isComplete(b)));
    }

    if (syncedBatches > 0) {
      invalidateStokFisikCache();
      if (allMovedSkus.size > 0) {
        await fetchStockForSkus(Array.from(allMovedSkus)).catch(() => {});
      }
      bumpCloudCacheEpoch('STOCK_RESET').catch(() => {});
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wms_inventory_updated'));
        window.dispatchEvent(new CustomEvent('wms_stock_updated'));
        window.dispatchEvent(new CustomEvent('wms_mutasi_updated'));
        window.dispatchEvent(new CustomEvent('wms_putaway_tasks_updated'));
      }
    }
  } finally {
    isPutawayOutboxSyncing = false;
  }

  const remaining = getPutawayOutboxBatches();
  return {
    syncedBatches,
    remainingBatches: remaining.length,
    errors,
  };
}

export function saveActivePutawaySession(session: ActivePutawaySessionData): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      ACTIVE_PUTAWAY_SESSION_KEY,
      JSON.stringify({ ...session, timestamp: Date.now() })
    );
    notifyPutawaySessionUpdated();
  } catch (err) {
    console.warn('[PutawaySession] Failed saving session:', err);
  }
}

export function readActivePutawaySession(): ActivePutawaySessionData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_PUTAWAY_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActivePutawaySessionData;
    if (!parsed || !parsed.task || !parsed.task.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getActivePutawayDraftSummary(): {
  hasSession: boolean;
  isMinimized: boolean;
  taskId: string;
  invoicePutaway: string;
  sourceLocations: string[];
  totalTarget: number;
  totalPlaced: number;
  progressPct: number;
  activeTargetLoc: string;
} {
  const empty = {
    hasSession: false,
    isMinimized: false,
    taskId: '',
    invoicePutaway: '',
    sourceLocations: [] as string[],
    totalTarget: 0,
    totalPlaced: 0,
    progressPct: 0,
    activeTargetLoc: '',
  };
  const session = readActivePutawaySession();
  if (!session || session.task.status !== 'AKTIF') return empty;
  const items = Array.isArray(session.task.items) ? session.task.items : [];
  const totalTarget = items.reduce((s, it) => s + (Number(it.qty_target) || 0), 0);
  const totalPlaced = items.reduce((s, it) => s + (Number(it.qty_placed) || 0), 0);
  const progressPct = totalTarget > 0 ? Math.min(100, Math.round((totalPlaced / totalTarget) * 100)) : 0;

  return {
    hasSession: true,
    isMinimized: Boolean(session.isMinimized),
    taskId: session.task.id,
    invoicePutaway: session.task.invoice_putaway,
    sourceLocations: Array.isArray(session.task.source_locations) ? session.task.source_locations : [],
    totalTarget,
    totalPlaced,
    progressPct,
    activeTargetLoc: String(session.activeTargetLoc || '').trim(),
  };
}

export function setActivePutawaySessionMinimized(minimized: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const session = readActivePutawaySession();
    if (!session) return;
    session.isMinimized = Boolean(minimized);
    session.timestamp = Date.now();
    localStorage.setItem(ACTIVE_PUTAWAY_SESSION_KEY, JSON.stringify(session));
    notifyPutawaySessionUpdated();
    window.dispatchEvent(
      new CustomEvent(minimized ? 'wms_minimize_putaway_session' : 'wms_maximize_putaway_session')
    );
  } catch {}
}

export function clearActivePutawaySession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_PUTAWAY_SESSION_KEY);
    notifyPutawaySessionUpdated();
    window.dispatchEvent(new CustomEvent('wms_close_putaway_session'));
  } catch {}
}


