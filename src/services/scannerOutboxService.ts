import {
  LogProdukItem,
  StockOpnameQueueItem,
  ProductItem,
  PenerimaanProduksiItem,
  PenerimaanRecountLogItem,
  PickingListItem
} from '../types';
import {
  supabaseFetch,
  fetchStockForLocations,
  insertStockOpnameQueue,
  getAreaFromLokasi,
  generateUUID,
  isValidUUID,
  invalidateStokFisikCache,
  saveRecountAuditRecord,
  savePenerimaanRecountLog,
  invalidatePenerimaanProduksiCache,
  insertPickingListRowsToSupabase,
  resolvePrimarySingleLocation
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
const PICKING_SJ_DRAFTS_KEY = 'wms_picking_sj_drafts_v1';
const ACTIVE_PICKING_SESSION_KEY = 'wms_active_picking_session';

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
    let filledVariantsCount = 0;
    const activeCode = draft.selectedCode || Object.keys(draft.draftsByCode)[0] || '';
    if (activeCode && draft.draftsByCode[activeCode]?.variantInputs) {
      Object.values(draft.draftsByCode[activeCode].variantInputs).forEach((v) => {
        if (v && v.recountQty !== null && v.recountQty !== undefined && !isNaN(Number(v.recountQty))) {
          filledVariantsCount++;
        }
      });
    }

    const rawQueue = localStorage.getItem('wms_recount_selected_queue');
    const queueMap = rawQueue ? JSON.parse(rawQueue) : {};
    const queueKeys =
      queueMap && typeof queueMap === 'object' && !Array.isArray(queueMap)
        ? Object.keys(queueMap)
        : [];

    const rawAudit = localStorage.getItem('wms_recount_audit_map');
    const auditMap = rawAudit ? JSON.parse(rawAudit) : {};

    let uncountedCodesCount = 0;
    queueKeys.forEach((k) => {
      const code = k.trim().toUpperCase();
      if (!auditMap || !auditMap[code]) {
        uncountedCodesCount++;
      }
    });

    return {
      hasActiveWorkspaceDraft: Boolean(activeCode && filledVariantsCount > 0),
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

            const existingCounts = new Map<string, number>();
            (existingRows || []).forEach((row) => {
              const key = `${String(row.sku || '').toUpperCase()}|${String(row.lokasi || '').toUpperCase()}|${Number(row.qty)}`;
              existingCounts.set(key, (existingCounts.get(key) || 0) + 1);
            });

            const logsOut: LogProdukItem[] = [];
            for (const it of allPicked) {
              const actualLocation =
                resolvePrimarySingleLocation(it.lokasi_picked || '') ||
                resolvePrimarySingleLocation(it.lokasi || '') ||
                'Warehouse';
              const key = `${String(it.sku || '').toUpperCase()}|${String(actualLocation).toUpperCase()}|${Number(it.qty_picked)}`;
              const count = existingCounts.get(key) || 0;
              if (count > 0) {
                existingCounts.set(key, count - 1);
                continue;
              }
              logsOut.push({
                type: 'OUT',
                invoice: cleanNoSj,
                sku: it.sku,
                nama_produk: it.nama_produk || it.sku,
                size: it.size || '',
                area: getAreaFromLokasi(actualLocation),
                lokasi: actualLocation,
                qty: it.qty_picked,
                operator: batch.pickerName || 'Picker',
                keterangan: `[#OUT PICKING] Surat Jalan ${cleanNoSj} (Lokasi: ${actualLocation}) ${batch.catatan ? `- ${batch.catatan}` : ''}`.trim(),
                created_at: batch.createdAtIso || new Date().toISOString()
              });
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

        // Step 2: Patch picking_list rows as SELESAI
        if (!batch.itemsSynced) {
          for (const item of batch.items || []) {
            const condition =
              item.id && (typeof item.id === 'number' || (typeof item.id === 'string' && !item.id.startsWith('pick_')))
                ? `id=eq.${item.id}`
                : `no_sj=eq.${encodeURIComponent(cleanNoSj)}&sku=eq.${encodeURIComponent(item.sku)}`;

            try {
              const payload: Record<string, any> = {
                qty_picked: item.qty_picked,
                status: 'SELESAI',
                picker_name: batch.pickerName
              };
              if (batch.catatan) {
                payload.catatan = batch.catatan;
              }
              await supabaseFetch('picking_list', 'PATCH', payload, condition);
            } catch (patchErr: any) {
              const errMsg = String(patchErr?.message || patchErr || '').toLowerCase();
              if (errMsg.includes('column') || errMsg.includes('catatan') || errMsg.includes('400')) {
                const minimalPayload = {
                  qty_picked: item.qty_picked,
                  status: 'SELESAI',
                  picker_name: batch.pickerName
                };
                await supabaseFetch('picking_list', 'PATCH', minimalPayload, condition);
              } else {
                throw patchErr;
              }
            }
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
            lokasi: resolvePrimarySingleLocation(unexp.lokasi_picked || unexp.lokasi || '') || '-',
            status: 'SELESAI',
            picker_name: batch.pickerName,
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


