import {
  LogProdukItem,
  StockOpnameQueueItem,
  ProductItem,
  PenerimaanProduksiItem,
  PenerimaanRecountLogItem
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
  invalidatePenerimaanProduksiCache
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

