import {
  supabaseFetch,
  getAreaFromLokasi,
  normalizeLokasi,
  generateUUID,
  invalidateStokFisikCache,
  fetchStockForSkus,
  bumpCloudCacheEpoch,
  parsePickerNamesList,
  mergePickerNamesWithLastActor,
  isSameOperatorIdentity,
  getSystemDocs,
  saveSystemDoc,
} from './supabase';
import {
  type RackCapacityConfig,
  type ComputedRackSlot,
  type EnrichedCatalogEntry,
  isExcludedFromWarehouseRelocation,
  isPutawayEligibleSource,
  inferTargetZoneForPutaway,
  normalizeBaseProductNameForGrouping,
} from './rackCapacityService';
import {
  enqueuePutawayOutboxBatch,
  clearActivePutawaySession,
} from './scannerOutboxService';
import {
  resolveProductName,
  resolveProductDisplaySize,
  lookupCategoryByName,
  inferCategoryFromProductName,
} from '../utils/sortUtils';
import type {
  LogProdukItem,
  PutawayPlacement,
  PutawaySourceBucket,
  PutawayTask,
  PutawayTaskItem,
  StockRealtimeItem,
} from '../types';

export const PUTAWAY_DOCS_SECTION = 'wms_putaway_tasks_v1';
export const PUTAWAY_LOCAL_CACHE_KEY = 'wms_putaway_tasks_cache_v1';
export const PUTAWAY_REALTIME_CHANNEL = 'wms_putaway_live_collab';

let putawayTableAvailable: boolean | null = null;
let memoryTasksCache: PutawayTask[] | null = null;
let memoryTasksLastFetch = 0;

function isMissingTableError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('42p01') ||
    msg.includes('pgrst205') ||
    (msg.includes('putaway_tasks') &&
      (msg.includes('does not exist') || msg.includes('not found') || msg.includes('404')))
  );
}

function readLocalCachedTasks(): PutawayTask[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PUTAWAY_LOCAL_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalCachedTasks(tasks: PutawayTask[]): void {
  memoryTasksCache = tasks;
  memoryTasksLastFetch = Date.now();
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PUTAWAY_LOCAL_CACHE_KEY, JSON.stringify(tasks));
  } catch {}
}

function dispatchPutawayTasksUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wms_putaway_tasks_updated'));
  }
}

function parseJsonArrayField<T>(val: any, fallback: T[] = []): T[] {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizeTaskRecord(raw: any): PutawayTask {
  return {
    id: String(raw?.id || generateUUID()),
    invoice_putaway: String(raw?.invoice_putaway || '').trim().toUpperCase(),
    source_locations: parseJsonArrayField<string>(raw?.source_locations, []).map((l) =>
      String(l || '').trim().toUpperCase()
    ),
    source_area: String(raw?.source_area || 'Transit'),
    status: (raw?.status === 'SELESAI' || raw?.status === 'DIBATALKAN' ? raw.status : 'AKTIF') as PutawayTask['status'],
    created_by: String(raw?.created_by || 'Operator'),
    active_operators: parseJsonArrayField<string>(raw?.active_operators, []),
    completed_by: raw?.completed_by ? String(raw.completed_by) : undefined,
    safe_cap_percent: Number(raw?.safe_cap_percent) || 75,
    items: parseJsonArrayField<PutawayTaskItem>(raw?.items, []),
    catatan: raw?.catatan ? String(raw.catatan) : '',
    created_at: String(raw?.created_at || new Date().toISOString()),
    updated_at: String(raw?.updated_at || raw?.created_at || new Date().toISOString()),
    completed_at: raw?.completed_at ? String(raw.completed_at) : undefined,
  };
}

function sortTasksList(list: PutawayTask[]): PutawayTask[] {
  return [...list].sort((a, b) => {
    if (a.status === 'AKTIF' && b.status !== 'AKTIF') return -1;
    if (a.status !== 'AKTIF' && b.status === 'AKTIF') return 1;
    return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
  });
}

function mergeTaskItems(
  localItems: PutawayTaskItem[],
  remoteItems: PutawayTaskItem[]
): PutawayTaskItem[] {
  const remoteMap = new Map<string, PutawayTaskItem>();
  for (const r of remoteItems) {
    remoteMap.set(r.id, r);
  }
  const merged: PutawayTaskItem[] = [];
  const seenIds = new Set<string>();

  for (const l of localItems) {
    seenIds.add(l.id);
    const r = remoteMap.get(l.id);
    if (!r) {
      merged.push(l);
      continue;
    }
    const localTs = l.updated_at || '';
    const remoteTs = r.updated_at || '';
    merged.push(remoteTs > localTs ? r : l);
  }
  for (const r of remoteItems) {
    if (!seenIds.has(r.id)) {
      merged.push(r);
    }
  }
  return merged;
}

function mergeTwoTasks(incoming: PutawayTask, existing?: PutawayTask): PutawayTask {
  if (!existing) return incoming;
  if (incoming.status !== 'AKTIF') {
    return incoming;
  }
  if (existing.status !== 'AKTIF') {
    return existing;
  }

  const ops: string[] = [];
  [...(existing.active_operators || []), ...(incoming.active_operators || [])].forEach((op) => {
    const clean = String(op || '').trim();
    if (clean && !ops.some((ex) => isSameOperatorIdentity(ex, clean))) {
      ops.push(clean);
    }
  });

  return {
    ...existing,
    ...incoming,
    active_operators: ops,
    items: mergeTaskItems(incoming.items || [], existing.items || []),
    updated_at:
      (incoming.updated_at || '') >= (existing.updated_at || '')
        ? incoming.updated_at
        : existing.updated_at,
  };
}

export async function fetchPutawayTasks(forceRefresh = false): Promise<PutawayTask[]> {
  if (
    !forceRefresh &&
    memoryTasksCache &&
    Date.now() - memoryTasksLastFetch < 12000
  ) {
    return memoryTasksCache;
  }

  if (putawayTableAvailable !== false) {
    try {
      const rows = await supabaseFetch<any[]>(
        'putaway_tasks',
        'GET',
        null,
        'select=*&order=updated_at.desc&limit=120'
      );
      if (Array.isArray(rows)) {
        putawayTableAvailable = true;
        const normalized = sortTasksList(rows.map(normalizeTaskRecord));
        writeLocalCachedTasks(normalized);
        return normalized;
      }
    } catch (err) {
      if (isMissingTableError(err)) {
        putawayTableAvailable = false;
      } else {
        const local = readLocalCachedTasks();
        if (local.length > 0) return local;
      }
    }
  }

  try {
    const docs = await getSystemDocs();
    const target = docs.find((d) => d.section_id === PUTAWAY_DOCS_SECTION);
    if (target && target.content) {
      const parsed = JSON.parse(target.content);
      if (Array.isArray(parsed)) {
        const normalized = sortTasksList(parsed.map(normalizeTaskRecord));
        writeLocalCachedTasks(normalized);
        return normalized;
      }
    }
    return readLocalCachedTasks();
  } catch {
    return readLocalCachedTasks();
  }
}

export async function upsertPutawayTask(
  task: PutawayTask,
  mergeWithLatest = true
): Promise<PutawayTask> {
  const cleanTask = normalizeTaskRecord({
    ...task,
    updated_at: task.updated_at || new Date().toISOString(),
  });

  if (putawayTableAvailable !== false) {
    try {
      let toPersist = cleanTask;
      if (mergeWithLatest && cleanTask.status === 'AKTIF') {
        const existingRows = await supabaseFetch<any[]>(
          'putaway_tasks',
          'GET',
          null,
          `id=eq.${encodeURIComponent(cleanTask.id)}&limit=1`
        );
        if (Array.isArray(existingRows) && existingRows.length > 0) {
          toPersist = mergeTwoTasks(cleanTask, normalizeTaskRecord(existingRows[0]));
        }
      }

      const patchRes = await supabaseFetch<any[]>(
        'putaway_tasks',
        'PATCH',
        {
          invoice_putaway: toPersist.invoice_putaway,
          source_locations: toPersist.source_locations,
          source_area: toPersist.source_area,
          status: toPersist.status,
          created_by: toPersist.created_by,
          active_operators: toPersist.active_operators,
          completed_by: toPersist.completed_by || '',
          safe_cap_percent: toPersist.safe_cap_percent,
          items: toPersist.items,
          catatan: toPersist.catatan || '',
          updated_at: toPersist.updated_at,
          completed_at: toPersist.completed_at || null,
        },
        `id=eq.${encodeURIComponent(toPersist.id)}`,
        true
      );

      if (!Array.isArray(patchRes) || patchRes.length === 0) {
        await supabaseFetch('putaway_tasks', 'POST', [toPersist]);
      }

      putawayTableAvailable = true;
      const cached = readLocalCachedTasks().filter((t) => t.id !== toPersist.id);
      writeLocalCachedTasks(sortTasksList([toPersist, ...cached]));
      dispatchPutawayTasksUpdated();
      return toPersist;
    } catch (err) {
      if (isMissingTableError(err)) {
        putawayTableAvailable = false;
      } else {
        const cached = readLocalCachedTasks().filter((t) => t.id !== cleanTask.id);
        writeLocalCachedTasks(sortTasksList([cleanTask, ...cached]));
        dispatchPutawayTasksUpdated();
        throw err;
      }
    }
  }

  // Fallback to wms_system_docs
  let currentList: PutawayTask[] = [];
  try {
    const docs = await supabaseFetch<Array<{ section_id: string; content: string }>>(
      'wms_system_docs',
      'GET',
      null,
      `section_id=eq.${encodeURIComponent(PUTAWAY_DOCS_SECTION)}&limit=1`
    );
    if (Array.isArray(docs) && docs[0]?.content) {
      const parsed = JSON.parse(docs[0].content);
      if (Array.isArray(parsed)) currentList = parsed.map(normalizeTaskRecord);
    }
  } catch {
    currentList = readLocalCachedTasks();
  }

  const existing = currentList.find((t) => t.id === cleanTask.id);
  const finalTask = mergeWithLatest ? mergeTwoTasks(cleanTask, existing) : cleanTask;

  const others = currentList.filter((t) => t.id !== finalTask.id);
  const allTasks = [finalTask, ...others];
  const activeOnes = allTasks.filter((t) => t.status === 'AKTIF');
  const historyOnes = allTasks
    .filter((t) => t.status !== 'AKTIF')
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    .slice(0, 80);
  const pruned = sortTasksList([...activeOnes, ...historyOnes]);

  writeLocalCachedTasks(pruned);
  await saveSystemDoc({
    section_id: PUTAWAY_DOCS_SECTION,
    content: JSON.stringify(pruned),
    updated_by: finalTask.completed_by || finalTask.active_operators[0] || finalTask.created_by,
  });
  dispatchPutawayTasksUpdated();
  return finalTask;
}

export function generatePutawayInvoice(sourceLocations: string[]): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const tag =
    sourceLocations.length === 1
      ? sourceLocations[0].replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'LOC'
      : `MULTI${sourceLocations.length}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PUT-${ymd}-${tag}-${rand}`;
}

export async function createPutawayTask(params: {
  sourceLocations: string[];
  items: PutawayTaskItem[];
  createdBy: string;
  safeCapPercent: number;
  catatan?: string;
}): Promise<PutawayTask> {
  const nowIso = new Date().toISOString();
  const cleanSources = Array.from(
    new Set(params.sourceLocations.map((l) => String(l || '').trim().toUpperCase()).filter(Boolean))
  );
  const areaSet = new Set(cleanSources.map((l) => getAreaFromLokasi(l)));
  const sourceArea = areaSet.size === 1 ? Array.from(areaSet)[0] : 'Campuran (Transit & Kolian)';

  const newTask: PutawayTask = {
    id: generateUUID(),
    invoice_putaway: generatePutawayInvoice(cleanSources),
    source_locations: cleanSources,
    source_area: sourceArea,
    status: 'AKTIF',
    created_by: params.createdBy,
    active_operators: [params.createdBy],
    safe_cap_percent: params.safeCapPercent,
    items: params.items,
    catatan: params.catatan || '',
    created_at: nowIso,
    updated_at: nowIso,
  };

  return upsertPutawayTask(newTask, false);
}

export async function joinPutawayTask(
  taskId: string,
  username: string
): Promise<PutawayTask | null> {
  const tasks = await fetchPutawayTasks(true);
  const target = tasks.find((t) => t.id === taskId);
  if (!target || target.status !== 'AKTIF') return target || null;

  const ops = [...(target.active_operators || [])];
  if (!ops.some((op) => isSameOperatorIdentity(op, username))) {
    ops.push(username);
  }
  const updated: PutawayTask = {
    ...target,
    active_operators: ops,
    updated_at: new Date().toISOString(),
  };
  return upsertPutawayTask(updated, true);
}

export async function leavePutawayTask(
  taskId: string,
  username: string,
  localSnapshot?: PutawayTask
): Promise<PutawayTask | null> {
  const tasks = await fetchPutawayTasks(true);
  const remote = tasks.find((t) => t.id === taskId);
  const base = remote || localSnapshot;
  if (!base || base.status !== 'AKTIF') return base || null;

  const nextItems = localSnapshot
    ? mergeTaskItems(localSnapshot.items || [], base.items || [])
    : base.items;
  const nextOps = (base.active_operators || []).filter(
    (op) => !isSameOperatorIdentity(op, username)
  );

  const updated: PutawayTask = {
    ...base,
    items: nextItems,
    active_operators: nextOps,
    updated_at: new Date().toISOString(),
  };
  return upsertPutawayTask(updated, false);
}

export async function syncPutawayTaskItems(
  taskId: string,
  items: PutawayTaskItem[],
  actor: string
): Promise<PutawayTask | null> {
  const tasks = await fetchPutawayTasks(false);
  const target = tasks.find((t) => t.id === taskId);
  if (!target || target.status !== 'AKTIF') return target || null;

  const ops = [...(target.active_operators || [])];
  if (actor && !ops.some((op) => isSameOperatorIdentity(op, actor))) {
    ops.push(actor);
  }

  const updated: PutawayTask = {
    ...target,
    active_operators: ops,
    items,
    updated_at: new Date().toISOString(),
  };
  return upsertPutawayTask(updated, true);
}

export async function cancelPutawayTask(
  taskId: string,
  actor: string,
  reason = ''
): Promise<PutawayTask | null> {
  const tasks = await fetchPutawayTasks(true);
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return null;
  if (target.status !== 'AKTIF') return target;

  const updated: PutawayTask = {
    ...target,
    status: 'DIBATALKAN',
    active_operators: [],
    completed_by: actor,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    catatan: reason ? `Dibatalkan oleh ${actor}: ${reason}` : `Dibatalkan oleh ${actor}`,
  };
  return upsertPutawayTask(updated, false);
}

// ============================================================================
// ANTI-COLLISION VIRTUAL RESERVATION HELPERS
// ============================================================================

/**
 * Computes how many pcs are already virtually reserved on each destination rack
 * by currently AKTIF putaway tasks (including both unplaced target allocations
 * and already-scanned placements whose log_produk hasn't been committed yet).
 */
export function computeReservedDestinationSpace(
  activeTasks: PutawayTask[],
  excludeTaskId?: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of activeTasks) {
    if (t.status !== 'AKTIF' || (excludeTaskId && t.id === excludeTaskId)) continue;
    for (const item of t.items || []) {
      for (const p of item.placements || []) {
        const loc = String(p.lokasi || '').trim().toUpperCase();
        const q = Math.max(0, Number(p.qty) || 0);
        if (loc && q > 0) {
          map.set(loc, (map.get(loc) || 0) + q);
        }
      }
      const remaining = Math.max(0, (Number(item.qty_target) || 0) - (Number(item.qty_placed) || 0));
      const recLoc = String(item.recommended_lokasi || '').trim().toUpperCase();
      if (remaining > 0 && recLoc) {
        map.set(recLoc, (map.get(recLoc) || 0) + remaining);
      }
    }
  }
  return map;
}

/**
 * Computes source quantities already claimed by AKTIF putaway tasks keyed by `SOURCE_LOKASI__SKU`.
 * New #IN scans into the same source rack remain separate as unclaimed available stock.
 */
export function computeReservedSourceQtyByLocSku(
  activeTasks: PutawayTask[],
  excludeTaskId?: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of activeTasks) {
    if (t.status !== 'AKTIF' || (excludeTaskId && t.id === excludeTaskId)) continue;
    for (const item of t.items || []) {
      const src = String(item.source_lokasi || '').trim().toUpperCase();
      const sku = String(item.sku || '').trim().toUpperCase();
      const q = Math.max(0, Number(item.qty_target) || 0);
      if (src && sku && q > 0) {
        const key = `${src}__${sku}`;
        map.set(key, (map.get(key) || 0) + q);
      }
    }
  }
  return map;
}

export function getActivePutawayTasksForSource(
  activeTasks: PutawayTask[],
  lokasi: string
): PutawayTask[] {
  const targetLoc = String(lokasi || '').trim().toUpperCase();
  if (!targetLoc) return [];
  return activeTasks.filter(
    (t) =>
      t.status === 'AKTIF' &&
      Array.isArray(t.source_locations) &&
      t.source_locations.some((l) => String(l || '').trim().toUpperCase() === targetLoc)
  );
}

export function getActivePutawayTaskForSource(
  activeTasks: PutawayTask[],
  lokasi: string
): PutawayTask | undefined {
  return getActivePutawayTasksForSource(activeTasks, lokasi)[0];
}

// ============================================================================
// LIVE SOURCE STOCK FETCHER & ROUTE GENERATOR
// ============================================================================

export interface LivePutawaySourceItem {
  key: string; // `${source_lokasi}__${sku}`
  source_lokasi: string;
  source_area: string;
  sku: string;
  nama_produk: string;
  size: string;
  kategori: string;
  liveTotalQty: number;
  reservedInActiveTaskQty: number;
  availableQty: number;
  buckets: PutawaySourceBucket[];
}

function buildLocationVariantsForQuery(locs: string[]): string[] {
  const set = new Set<string>();
  for (const rawLoc of locs) {
    const raw = String(rawLoc || '').trim();
    if (!raw) continue;
    const norm = normalizeLokasi(raw);
    [raw, raw.toUpperCase(), raw.toLowerCase(), norm, norm.toUpperCase(), norm.toLowerCase()].forEach(
      (v) => {
        if (v) set.add(v);
      }
    );
  }
  return Array.from(set);
}

export async function fetchLivePutawaySourceStock(
  sourceLocations: string[],
  catalogMap?: Map<string, EnrichedCatalogEntry>,
  activeTasks: PutawayTask[] = []
): Promise<LivePutawaySourceItem[]> {
  const cleanSources = Array.from(
    new Set(
      (sourceLocations || [])
        .map((l) => (normalizeLokasi(l) || String(l || '').trim()).toUpperCase())
        .filter(Boolean)
    )
  );
  if (cleanSources.length === 0) return [];

  const sourceSet = new Set(cleanSources);
  const variants = buildLocationVariantsForQuery(cleanSources);
  const CHUNK_SIZE = 35;
  let rawRows: StockRealtimeItem[] = [];

  for (let i = 0; i < variants.length; i += CHUNK_SIZE) {
    const chunk = variants.slice(i, i + CHUNK_SIZE);
    const locParam = chunk.map((l) => `"${encodeURIComponent(l)}"`).join(',');
    const rows = await supabaseFetch<StockRealtimeItem[]>(
      'stok_real_fisik',
      'GET',
      null,
      `lokasi=in.(${locParam})&sisa_stok=gt.0&select=sku,nama_produk,size,lokasi,area,sisa_stok,updated_at&limit=5000`
    );
    if (Array.isArray(rows)) {
      rawRows = rawRows.concat(rows);
    }
  }

  const grouped = new Map<
    string,
    {
      source_lokasi: string;
      source_area: string;
      sku: string;
      nama_produk: string;
      size: string;
      kategori: string;
      liveTotalQty: number;
      buckets: PutawaySourceBucket[];
    }
  >();

  for (const row of rawRows) {
    const sku = String(row.sku || '').trim().toUpperCase();
    const lokasiExact = String(row.lokasi || '').trim();
    if (!sku || !lokasiExact) continue;
    const normLoc = (normalizeLokasi(lokasiExact) || lokasiExact).toUpperCase();
    if (!sourceSet.has(normLoc)) continue;

    const qty = Math.max(0, Number(row.sisa_stok) || 0);
    if (qty <= 0) continue;

    const areaExact = String(row.area || getAreaFromLokasi(lokasiExact));
    const normArea = getAreaFromLokasi(normLoc);
    const key = `${normLoc}__${sku}`;

    const catInfo = catalogMap?.get(sku);
    const rawName = catInfo?.nama_produk || String(row.nama_produk || row.nama || sku).trim();
    const nama_produk = resolveProductName(sku, rawName) || rawName || sku;
    const rawSize = catInfo?.size && catInfo.size !== '-' ? catInfo.size : String(row.size || row.ukuran || '').trim();
    const size = resolveProductDisplaySize(sku, rawSize, rawSize) || '-';
    const kategori =
      (catInfo?.kategori && catInfo.kategori !== 'CLOTHING' ? catInfo.kategori : '') ||
      lookupCategoryByName(nama_produk) ||
      inferCategoryFromProductName(nama_produk) ||
      catInfo?.kategori ||
      'CLOTHING';

    const existing = grouped.get(key);
    const bucket: PutawaySourceBucket = { lokasiExact, areaExact, qty };
    if (!existing) {
      grouped.set(key, {
        source_lokasi: normLoc,
        source_area: normArea,
        sku,
        nama_produk,
        size,
        kategori,
        liveTotalQty: qty,
        buckets: [bucket],
      });
    } else {
      existing.liveTotalQty += qty;
      const sameBucket = existing.buckets.find(
        (b) => b.lokasiExact === bucket.lokasiExact && b.areaExact === bucket.areaExact
      );
      if (sameBucket) {
        sameBucket.qty += bucket.qty;
      } else {
        existing.buckets.push(bucket);
      }
    }
  }

  const reservedByKey = computeReservedSourceQtyByLocSku(activeTasks);
  const result: LivePutawaySourceItem[] = [];

  grouped.forEach((entry, key) => {
    const reserved = reservedByKey.get(key) || 0;
    const availableQty = Math.max(0, entry.liveTotalQty - reserved);
    if (availableQty <= 0) return;

    // Drain reserved qty from buckets cleanly so remaining buckets match availableQty
    let toSkip = reserved;
    const availableBuckets: PutawaySourceBucket[] = [];
    for (const b of entry.buckets) {
      if (toSkip >= b.qty) {
        toSkip -= b.qty;
        continue;
      }
      availableBuckets.push({
        ...b,
        qty: b.qty - toSkip,
      });
      toSkip = 0;
    }

    result.push({
      key,
      source_lokasi: entry.source_lokasi,
      source_area: entry.source_area,
      sku: entry.sku,
      nama_produk: entry.nama_produk,
      size: entry.size,
      kategori: entry.kategori,
      liveTotalQty: entry.liveTotalQty,
      reservedInActiveTaskQty: reserved,
      availableQty,
      buckets: availableBuckets,
    });
  });

  return result.sort((a, b) => {
    const locCmp = a.source_lokasi.localeCompare(b.source_lokasi, undefined, { numeric: true });
    if (locCmp !== 0) return locCmp;
    const nameCmp = a.nama_produk.localeCompare(b.nama_produk, 'id', { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return a.sku.localeCompare(b.sku, undefined, { numeric: true });
  });
}

export interface GenerateLivePutawayRouteParams {
  sourceItems: LivePutawaySourceItem[];
  allSlots: ComputedRackSlot[];
  config: RackCapacityConfig;
  activeTasks: PutawayTask[];
  catalogMap?: Map<string, EnrichedCatalogEntry>;
  enableKoliSplitForTransit: boolean;
  selectedKeys?: Set<string>;
  customQtyByKey?: Record<string, number>;
}

export interface GenerateLivePutawayRouteResult {
  items: PutawayTaskItem[];
  safeCapPercent: number;
  reservedRacksCount: number;
  splitToKoliPcs: number;
  unfittedAbcdPcs: number;
}

function getWalkingOrderRank(lokasi: string): { groupRank: number; loc: string } {
  const loc = (lokasi || '').trim().toUpperCase();
  if (!loc) return { groupRank: 99, loc: '' };
  if (/^A\d+/i.test(loc)) return { groupRank: 1, loc };
  if (/^B\d+/i.test(loc)) return { groupRank: 2, loc };
  if (/^C\d+/i.test(loc)) return { groupRank: 3, loc };
  if (/^D\d+/i.test(loc)) return { groupRank: 4, loc };
  if (getAreaFromLokasi(loc) === 'Aksesoris') return { groupRank: 5, loc };
  if (/^R\d+/i.test(loc)) return { groupRank: 6, loc };
  if (/^V\d+/i.test(loc)) return { groupRank: 7, loc };
  if (/^Z\d+/i.test(loc)) return { groupRank: 8, loc };
  return { groupRank: 9, loc };
}

function splitBucketsForQty(
  buckets: PutawaySourceBucket[],
  qtyNeeded: number
): { slice: PutawaySourceBucket[]; remainder: PutawaySourceBucket[] } {
  let rem = qtyNeeded;
  const slice: PutawaySourceBucket[] = [];
  const remainder: PutawaySourceBucket[] = [];

  for (const b of buckets) {
    if (rem <= 0) {
      remainder.push({ ...b });
      continue;
    }
    if (b.qty <= rem) {
      slice.push({ ...b });
      rem -= b.qty;
    } else {
      slice.push({ ...b, qty: rem });
      remainder.push({ ...b, qty: b.qty - rem });
      rem = 0;
    }
  }
  return { slice, remainder };
}

interface MutableDestBin {
  lokasi: string;
  area: string;
  prefix: string;
  maxCapacity: number;
  safeCap: number;
  effectiveQty: number;
  remainingSafeSpace: number;
  existingSkus: Set<string>;
  existingBaseNames: Set<string>;
}

export function generateLivePutawayRoute(
  params: GenerateLivePutawayRouteParams
): GenerateLivePutawayRouteResult {
  const {
    sourceItems,
    allSlots,
    config,
    activeTasks,
    catalogMap,
    enableKoliSplitForTransit,
    selectedKeys,
    customQtyByKey,
  } = params;

  const safeCapPercent = Math.max(
    50,
    Math.min(95, Number(config?.safeOccupancyCapPercent) || 75)
  );
  const maxPerSkuAbcd = Math.max(1, Number(config?.refillMaxPerSkuAbcd) || 12);

  const reservedDestMap = computeReservedDestinationSpace(activeTasks);
  const sourceLocationSet = new Set(
    sourceItems.map((it) => it.source_lokasi.trim().toUpperCase())
  );

  // Track current ABCD total qty per SKU (physical + reserved incoming from active tasks)
  const skuAbcdTotalQty = new Map<string, number>();
  const abcdBins: MutableDestBin[] = [];
  const aksesorisBins: MutableDestBin[] = [];
  const koliBins: MutableDestBin[] = [];

  for (const s of allSlots) {
    const loc = s.lokasi.trim().toUpperCase();
    const areaUpper = s.area.trim().toUpperCase();
    if (sourceLocationSet.has(loc)) continue;
    if (isExcludedFromWarehouseRelocation(s.area, s.lokasi)) continue;
    if (areaUpper === 'TRANSIT' || loc === 'X' || /^X-?\d+$/.test(loc) || loc === 'TRANSIT') {
      continue;
    }

    const reservedQty = reservedDestMap.get(loc) || 0;
    const effectiveQty = s.currentQty + reservedQty;
    const existingSkus = new Set<string>();
    const existingBaseNames = new Set<string>();

    for (const it of s.items || []) {
      if (it.qty <= 0) continue;
      const skuUp = it.sku.toUpperCase();
      existingSkus.add(skuUp);
      const cat = catalogMap?.get(skuUp);
      const base = normalizeBaseProductNameForGrouping(cat?.nama_produk || it.nama_produk || skuUp);
      if (base) existingBaseNames.add(base);
    }

    if (areaUpper === 'WAREHOUSE' && /^[ABCD]\d+$/i.test(loc)) {
      const prefixMatch = loc.match(/^([ABCD])/i);
      const prefix = prefixMatch ? prefixMatch[1].toUpperCase() : '';
      const safeCap = Math.max(1, Math.floor(s.maxCapacity * (safeCapPercent / 100)));
      const remainingSafeSpace = Math.max(0, safeCap - effectiveQty);

      for (const it of s.items || []) {
        if (it.qty > 0) {
          const skuUp = it.sku.toUpperCase();
          skuAbcdTotalQty.set(skuUp, (skuAbcdTotalQty.get(skuUp) || 0) + it.qty);
        }
      }

      abcdBins.push({
        lokasi: loc,
        area: 'Warehouse',
        prefix,
        maxCapacity: s.maxCapacity,
        safeCap,
        effectiveQty,
        remainingSafeSpace,
        existingSkus,
        existingBaseNames,
      });
    } else if (areaUpper === 'AKSESORIS') {
      const prefixMatch = loc.match(/^([A-Z]+)/i);
      const prefix = prefixMatch ? prefixMatch[1].toUpperCase() : 'AKSESORIS';
      const safeCap = Math.max(1, Math.floor(s.maxCapacity * (safeCapPercent / 100)));
      const remainingSafeSpace = Math.max(0, safeCap - effectiveQty);
      aksesorisBins.push({
        lokasi: loc,
        area: 'Aksesoris',
        prefix,
        maxCapacity: s.maxCapacity,
        safeCap,
        effectiveQty,
        remainingSafeSpace,
        existingSkus,
        existingBaseNames,
      });
    } else if ((areaUpper === 'KOLIAN' || areaUpper === 'KOLI') && /^[RVZ]\d+$/i.test(loc)) {
      const prefixMatch = loc.match(/^([RVZ])/i);
      const prefix = prefixMatch ? prefixMatch[1].toUpperCase() : 'R';
      const remainingSafeSpace = Math.max(0, s.maxCapacity - effectiveQty);
      koliBins.push({
        lokasi: loc,
        area: 'Kolian',
        prefix,
        maxCapacity: s.maxCapacity,
        safeCap: s.maxCapacity,
        effectiveQty,
        remainingSafeSpace,
        existingSkus,
        existingBaseNames,
      });
    }
  }

  // Also include unplaced recommended allocations in active tasks towards skuAbcdTotalQty
  for (const t of activeTasks) {
    if (t.status !== 'AKTIF') continue;
    for (const item of t.items || []) {
      const recLoc = String(item.recommended_lokasi || '').toUpperCase();
      if (/^[ABCD]\d+$/i.test(recLoc)) {
        const rem = Math.max(0, (item.qty_target || 0) - (item.qty_placed || 0));
        if (rem > 0) {
          const skuUp = item.sku.toUpperCase();
          skuAbcdTotalQty.set(skuUp, (skuAbcdTotalQty.get(skuUp) || 0) + rem);
        }
      }
    }
  }

  const sortBinsEmptyLowestNumeric = (a: MutableDestBin, b: MutableDestBin) => {
    const aEmpty = a.effectiveQty === 0 ? 0 : 1;
    const bEmpty = b.effectiveQty === 0 ? 0 : 1;
    if (aEmpty !== bEmpty) return aEmpty - bEmpty;
    const aPct = a.maxCapacity > 0 ? a.effectiveQty / a.maxCapacity : 1;
    const bPct = b.maxCapacity > 0 ? b.effectiveQty / b.maxCapacity : 1;
    if (Math.abs(aPct - bPct) > 0.05) return aPct - bPct;
    return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true });
  };

  const getAlternativesForZone = (
    pool: MutableDestBin[],
    preferredPrefix: string,
    excludeLoc: string,
    limit = 5
  ): string[] => {
    const candidates = pool
      .filter((b) => b.lokasi !== excludeLoc && b.remainingSafeSpace > 0)
      .sort((a, b) => {
        const aPref = a.prefix === preferredPrefix ? 0 : 1;
        const bPref = b.prefix === preferredPrefix ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;
        return sortBinsEmptyLowestNumeric(a, b);
      });
    return candidates.slice(0, limit).map((b) => b.lokasi);
  };

  const generatedItems: PutawayTaskItem[] = [];
  let splitToKoliPcs = 0;
  let unfittedAbcdPcs = 0;
  let seq = 1;

  for (const srcItem of sourceItems) {
    if (selectedKeys && !selectedKeys.has(srcItem.key)) continue;
    const rawRequested = customQtyByKey?.[srcItem.key] ?? srcItem.availableQty;
    const qty = Math.min(srcItem.availableQty, Math.max(0, Math.floor(Number(rawRequested) || 0)));
    if (qty <= 0) continue;

    let remainingBuckets = srcItem.buckets.map((b) => ({ ...b }));
    const skuUp = srcItem.sku.toUpperCase();
    const baseName = normalizeBaseProductNameForGrouping(srcItem.nama_produk);
    const targetZone = inferTargetZoneForPutaway(srcItem.nama_produk, srcItem.kategori);
    const isTransitSource = srcItem.source_area.toUpperCase() === 'TRANSIT';

    const pushRouteItem = (p: {
      qty_target: number;
      recommended_lokasi: string;
      recommended_reason: string;
      alternative_lokasis: string[];
      target_zone_label: string;
      is_koli_overflow?: boolean;
    }) => {
      const { slice, remainder } = splitBucketsForQty(remainingBuckets, p.qty_target);
      remainingBuckets = remainder;
      generatedItems.push({
        id: `put_item_${seq++}_${skuUp}`,
        source_lokasi: srcItem.source_lokasi,
        source_area: srcItem.source_area,
        source_buckets: slice,
        sku: skuUp,
        nama_produk: srcItem.nama_produk,
        size: srcItem.size,
        kategori: srcItem.kategori,
        target_zone_label: p.target_zone_label,
        is_koli_overflow: p.is_koli_overflow,
        qty_target: p.qty_target,
        recommended_lokasi: p.recommended_lokasi,
        recommended_reason: p.recommended_reason,
        alternative_lokasis: p.alternative_lokasis,
        placements: [],
        qty_placed: 0,
        status: 'PENDING',
      });
    };

    // CASE A: AKSESORIS
    if (targetZone.area === 'Aksesoris') {
      let remAks = qty;
      while (remAks > 0) {
        let pickedBin: MutableDestBin | undefined;
        let reason = '';

        // Tier 1: Same SKU in Aksesoris
        pickedBin = aksesorisBins.find(
          (b) => b.existingSkus.has(skuUp) && b.remainingSafeSpace >= 1
        );
        if (pickedBin) reason = 'SKU sama di Aksesoris';

        // Tier 2: Same base product name
        if (!pickedBin && baseName) {
          pickedBin = aksesorisBins.find(
            (b) => b.existingBaseNames.has(baseName) && b.remainingSafeSpace >= 1
          );
          if (pickedBin) reason = 'Produk sama (beda varian)';
        }

        // Tier 3: Preferred prefix (BELT/CARD/GIFT/BOX) or any Aksesoris bin with safe space
        if (!pickedBin) {
          const candidates = aksesorisBins
            .filter((b) => b.remainingSafeSpace >= 1)
            .sort((a, b) => {
              const pref = targetZone.preferredAksPrefix || '';
              if (pref) {
                const aMatch = a.lokasi.startsWith(pref) ? 0 : 1;
                const bMatch = b.lokasi.startsWith(pref) ? 0 : 1;
                if (aMatch !== bMatch) return aMatch - bMatch;
              }
              return sortBinsEmptyLowestNumeric(a, b);
            });
          pickedBin = candidates[0];
          if (pickedBin) reason = `Slot zona Aksesoris (${pickedBin.lokasi})`;
        }

        if (!pickedBin) {
          unfittedAbcdPcs += remAks;
          pushRouteItem({
            qty_target: remAks,
            recommended_lokasi: '',
            recommended_reason: `Slot Aksesoris penuh (plafon ${safeCapPercent}%) — pilih rak manual`,
            alternative_lokasis: getAlternativesForZone(abcdBins, 'D', '', 5),
            target_zone_label: 'Aksesoris',
          });
          remAks = 0;
          break;
        }

        const take = Math.min(remAks, pickedBin.remainingSafeSpace);
        pickedBin.remainingSafeSpace -= take;
        pickedBin.effectiveQty += take;
        pickedBin.existingSkus.add(skuUp);
        if (baseName) pickedBin.existingBaseNames.add(baseName);

        pushRouteItem({
          qty_target: take,
          recommended_lokasi: pickedBin.lokasi,
          recommended_reason: reason,
          alternative_lokasis: getAlternativesForZone(
            aksesorisBins,
            targetZone.preferredAksPrefix || '',
            pickedBin.lokasi,
            5
          ),
          target_zone_label: 'Aksesoris',
        });
        remAks -= take;
      }
      continue;
    }

    // CASE B: WAREHOUSE ABCD (Dress A, Bottom B, Top C, Sale D)
    let abcdTargetQty = qty;
    let koliOverflowQty = 0;

    if (isTransitSource && enableKoliSplitForTransit) {
      const existingInAbcd = skuAbcdTotalQty.get(skuUp) || 0;
      const allowance = Math.max(0, maxPerSkuAbcd - existingInAbcd);
      if (qty > allowance) {
        abcdTargetQty = Math.min(qty, allowance);
        koliOverflowQty = qty - abcdTargetQty;
      }
    }

    let remAbcd = abcdTargetQty;
    while (remAbcd > 0) {
      let pickedBin: MutableDestBin | undefined;
      let reason = '';

      // Tier 1: Same SKU in ABCD (prefer same category prefix first, then any ABCD)
      const tier1SameZone = abcdBins
        .filter(
          (b) =>
            b.prefix === targetZone.prefix &&
            b.existingSkus.has(skuUp) &&
            b.remainingSafeSpace >= 1
        )
        .sort((a, b) => b.remainingSafeSpace - a.remainingSafeSpace);
      pickedBin = tier1SameZone[0];
      if (!pickedBin) {
        const tier1AnyAbcd = abcdBins
          .filter((b) => b.existingSkus.has(skuUp) && b.remainingSafeSpace >= 1)
          .sort((a, b) => b.remainingSafeSpace - a.remainingSafeSpace);
        pickedBin = tier1AnyAbcd[0];
      }
      if (pickedBin) {
        reason = 'SKU sama di rak ini';
      }

      // Tier 2: Same base product name (different size) in target zone
      if (!pickedBin && baseName) {
        const tier2Bins = abcdBins
          .filter(
            (b) =>
              b.prefix === targetZone.prefix &&
              b.existingBaseNames.has(baseName) &&
              b.remainingSafeSpace >= 1
          )
          .sort((a, b) => b.remainingSafeSpace - a.remainingSafeSpace);
        pickedBin = tier2Bins[0];
        if (pickedBin) {
          reason = 'Produk sama (beda size)';
        }
      }

      // Tier 3: Empty / loosest rack in target category zone
      if (!pickedBin) {
        const tier3Bins = abcdBins
          .filter((b) => b.prefix === targetZone.prefix && b.remainingSafeSpace >= 1)
          .sort(sortBinsEmptyLowestNumeric);
        pickedBin = tier3Bins[0];
        if (pickedBin) {
          reason =
            pickedBin.effectiveQty === 0
              ? `Rak kosong zona ${targetZone.categoryLabel}`
              : `Rak longgar zona ${targetZone.categoryLabel}`;
        }
      }

      if (!pickedBin) {
        // Remaining ABCD items cannot fit within safeCapPercent
        if (isTransitSource) {
          koliOverflowQty += remAbcd;
        } else {
          // Kolian source MUST NOT redirect into another Koli rack
          unfittedAbcdPcs += remAbcd;
          pushRouteItem({
            qty_target: remAbcd,
            recommended_lokasi: '',
            recommended_reason: `Slot ${targetZone.categoryLabel} (${targetZone.prefix}) mencapai plafon ${safeCapPercent}% — pilih manual atau sisakan di Koli`,
            alternative_lokasis: getAlternativesForZone(abcdBins, targetZone.prefix, '', 5),
            target_zone_label: `${targetZone.categoryLabel} (Rak ${targetZone.prefix})`,
          });
        }
        remAbcd = 0;
        break;
      }

      const take = Math.min(remAbcd, pickedBin.remainingSafeSpace);
      pickedBin.remainingSafeSpace -= take;
      pickedBin.effectiveQty += take;
      pickedBin.existingSkus.add(skuUp);
      if (baseName) pickedBin.existingBaseNames.add(baseName);
      skuAbcdTotalQty.set(skuUp, (skuAbcdTotalQty.get(skuUp) || 0) + take);

      pushRouteItem({
        qty_target: take,
        recommended_lokasi: pickedBin.lokasi,
        recommended_reason: reason,
        alternative_lokasis: getAlternativesForZone(
          abcdBins,
          targetZone.prefix,
          pickedBin.lokasi,
          5
        ),
        target_zone_label: `${targetZone.categoryLabel} (Rak ${targetZone.prefix})`,
      });
      remAbcd -= take;
    }

    // Overflow to Kolian (R/V/Z) — STRICTLY ONLY for Transit X sources!
    let remKoli = isTransitSource ? koliOverflowQty : 0;
    while (remKoli > 0) {
      let pickedKoli: MutableDestBin | undefined;
      let reason = '';

      const sameSkuKoli = koliBins
        .filter((b) => b.existingSkus.has(skuUp) && b.remainingSafeSpace >= 1)
        .sort((a, b) => b.remainingSafeSpace - a.remainingSafeSpace);
      pickedKoli = sameSkuKoli[0];
      if (pickedKoli) {
        reason = 'Overflow Kolian (SKU sama)';
      }

      if (!pickedKoli) {
        const availableKoli = koliBins
          .filter((b) => b.remainingSafeSpace >= 1)
          .sort((a, b) => {
            if (b.remainingSafeSpace !== a.remainingSafeSpace) {
              return b.remainingSafeSpace - a.remainingSafeSpace;
            }
            return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true });
          });
        pickedKoli = availableKoli[0];
        if (pickedKoli) {
          reason = 'Overflow Kolian (kapasitas longgar)';
        }
      }

      if (!pickedKoli) {
        unfittedAbcdPcs += remKoli;
        pushRouteItem({
          qty_target: remKoli,
          recommended_lokasi: '',
          recommended_reason: 'Slot ABCD & Kolian penuh — pilih rak manual',
          alternative_lokasis: [],
          target_zone_label: 'Kolian (R/V/Z)',
          is_koli_overflow: true,
        });
        remKoli = 0;
        break;
      }

      const take = Math.min(remKoli, pickedKoli.remainingSafeSpace);
      pickedKoli.remainingSafeSpace -= take;
      pickedKoli.effectiveQty += take;
      pickedKoli.existingSkus.add(skuUp);
      splitToKoliPcs += take;

      pushRouteItem({
        qty_target: take,
        recommended_lokasi: pickedKoli.lokasi,
        recommended_reason: reason,
        alternative_lokasis: getAlternativesForZone(
          koliBins,
          pickedKoli.prefix,
          pickedKoli.lokasi,
          5
        ),
        target_zone_label: 'Kolian (R/V/Z)',
        is_koli_overflow: true,
      });
      remKoli -= take;
    }
  }

  // Sort generated items by physical walking route (A -> B -> C -> D -> Aksesoris -> R -> V -> Z -> Manual)
  generatedItems.sort((a, b) => {
    const rA = getWalkingOrderRank(a.recommended_lokasi);
    const rB = getWalkingOrderRank(b.recommended_lokasi);
    if (rA.groupRank !== rB.groupRank) return rA.groupRank - rB.groupRank;
    if (rA.loc !== rB.loc) return rA.loc.localeCompare(rB.loc, undefined, { numeric: true });
    const nameCmp = a.nama_produk.localeCompare(b.nama_produk, 'id', { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return a.size.localeCompare(b.size, undefined, { numeric: true });
  });

  return {
    items: generatedItems,
    safeCapPercent,
    reservedRacksCount: reservedDestMap.size,
    splitToKoliPcs,
    unfittedAbcdPcs,
  };
}

// ============================================================================
// PRE-SUBMIT VALIDATION & FINAL LEDGER COMMIT
// ============================================================================

export interface SourceStockShortageWarning {
  source_lokasi: string;
  sku: string;
  nama_produk: string;
  size: string;
  placedQty: number;
  liveStockQty: number;
  shortageQty: number;
}

export async function validateSourceStockBeforeSubmit(
  task: PutawayTask
): Promise<SourceStockShortageWarning[]> {
  const placedByLocSku = new Map<
    string,
    { source_lokasi: string; sku: string; nama_produk: string; size: string; placedQty: number }
  >();

  for (const item of task.items || []) {
    const qtyPlaced = Math.max(0, Number(item.qty_placed) || 0);
    if (qtyPlaced <= 0) continue;
    const src = item.source_lokasi.trim().toUpperCase();
    const sku = item.sku.trim().toUpperCase();
    const key = `${src}__${sku}`;
    const existing = placedByLocSku.get(key);
    if (!existing) {
      placedByLocSku.set(key, {
        source_lokasi: src,
        sku,
        nama_produk: item.nama_produk,
        size: item.size,
        placedQty: qtyPlaced,
      });
    } else {
      existing.placedQty += qtyPlaced;
    }
  }

  if (placedByLocSku.size === 0) return [];

  const variants = buildLocationVariantsForQuery(task.source_locations || []);
  const liveQtyByLocSku = new Map<string, number>();

  for (let i = 0; i < variants.length; i += 35) {
    const chunk = variants.slice(i, i + 35);
    const locParam = chunk.map((l) => `"${encodeURIComponent(l)}"`).join(',');
    const rows = await supabaseFetch<StockRealtimeItem[]>(
      'stok_real_fisik',
      'GET',
      null,
      `lokasi=in.(${locParam})&sisa_stok=gt.0&select=sku,lokasi,sisa_stok&limit=5000`
    );
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const normLoc = (normalizeLokasi(r.lokasi) || String(r.lokasi || '').trim()).toUpperCase();
        const skuUp = String(r.sku || '').trim().toUpperCase();
        const key = `${normLoc}__${skuUp}`;
        liveQtyByLocSku.set(key, (liveQtyByLocSku.get(key) || 0) + Math.max(0, Number(r.sisa_stok) || 0));
      }
    }
  }

  const warnings: SourceStockShortageWarning[] = [];
  placedByLocSku.forEach((entry, key) => {
    const liveStockQty = liveQtyByLocSku.get(key) || 0;
    if (liveStockQty < entry.placedQty) {
      warnings.push({
        source_lokasi: entry.source_lokasi,
        sku: entry.sku,
        nama_produk: entry.nama_produk,
        size: entry.size,
        placedQty: entry.placedQty,
        liveStockQty,
        shortageQty: entry.placedQty - liveStockQty,
      });
    }
  });

  return warnings;
}

export function buildPutawayLogEntries(
  task: PutawayTask,
  completedBy: string,
  catatan: string,
  createdAtIso: string
): { logs: LogProdukItem[]; movedSkus: string[] } {
  const logs: LogProdukItem[] = [];
  const movedSkuSet = new Set<string>();
  const noteSuffix = catatan?.trim() ? ` - ${catatan.trim()}` : '';
  const operatorStr = mergePickerNamesWithLastActor(
    (task.active_operators || []).join(', '),
    completedBy
  ) || completedBy;

  for (const item of task.items || []) {
    const placements = (item.placements || []).filter((p) => (Number(p.qty) || 0) > 0);
    const totalPlaced = placements.reduce((s, p) => s + (Number(p.qty) || 0), 0);
    if (totalPlaced <= 0) continue;

    movedSkuSet.add(item.sku.toUpperCase());

    // Aggregate IN per destination rack
    const destQtyMap = new Map<string, number>();
    for (const p of placements) {
      const destLoc = normalizeLokasi(p.lokasi) || p.lokasi.trim().toUpperCase();
      destQtyMap.set(destLoc, (destQtyMap.get(destLoc) || 0) + (Number(p.qty) || 0));
    }
    const destLabel = Array.from(destQtyMap.keys()).join(', ');

    // 1. OUT from exact source buckets (only up to totalPlaced; unplaced qty stays untouched at source)
    let remainingToDrain = totalPlaced;
    const buckets =
      item.source_buckets && item.source_buckets.length > 0
        ? item.source_buckets
        : [{ lokasiExact: item.source_lokasi, areaExact: item.source_area, qty: totalPlaced }];

    for (const bucket of buckets) {
      if (remainingToDrain <= 0) break;
      const take = Math.min(remainingToDrain, Math.max(0, Number(bucket.qty) || 0));
      if (take <= 0) continue;

      logs.push({
        type: 'OUT',
        invoice: task.invoice_putaway,
        sku: item.sku,
        nama_produk: item.nama_produk || item.sku,
        size: item.size || '-',
        area: bucket.areaExact || getAreaFromLokasi(bucket.lokasiExact),
        lokasi: bucket.lokasiExact,
        qty: take,
        operator: operatorStr,
        keterangan: `[#OUT PUTAWAY] ${bucket.lokasiExact} -> ${destLabel}${noteSuffix}`,
        created_at: createdAtIso,
      });
      remainingToDrain -= take;
    }

    // Fallback safety if buckets summed < totalPlaced
    if (remainingToDrain > 0) {
      logs.push({
        type: 'OUT',
        invoice: task.invoice_putaway,
        sku: item.sku,
        nama_produk: item.nama_produk || item.sku,
        size: item.size || '-',
        area: getAreaFromLokasi(item.source_lokasi),
        lokasi: item.source_lokasi,
        qty: remainingToDrain,
        operator: operatorStr,
        keterangan: `[#OUT PUTAWAY] ${item.source_lokasi} -> ${destLabel}${noteSuffix}`,
        created_at: createdAtIso,
      });
    }

    // 2. IN to each actual destination rack
    destQtyMap.forEach((inQty, destLoc) => {
      if (inQty <= 0) return;
      logs.push({
        type: 'IN',
        invoice: task.invoice_putaway,
        sku: item.sku,
        nama_produk: item.nama_produk || item.sku,
        size: item.size || '-',
        area: getAreaFromLokasi(destLoc),
        lokasi: destLoc,
        qty: inQty,
        operator: operatorStr,
        keterangan: `[#IN PUTAWAY] dari ${item.source_lokasi} -> ${destLoc}${noteSuffix}`,
        created_at: createdAtIso,
      });
    });
  }

  return { logs, movedSkus: Array.from(movedSkuSet) };
}

export async function completePutawayTask(params: {
  task: PutawayTask;
  completedBy: string;
  catatan?: string;
}): Promise<{ success: boolean; queuedOffline: boolean; task: PutawayTask; error?: string }> {
  const nowIso = new Date().toISOString();
  const catatan = (params.catatan || '').trim();
  const completedTask: PutawayTask = {
    ...params.task,
    status: 'SELESAI',
    completed_by: params.completedBy,
    completed_at: nowIso,
    updated_at: nowIso,
    catatan: catatan || params.task.catatan || '',
  };

  const { logs, movedSkus } = buildPutawayLogEntries(
    completedTask,
    params.completedBy,
    catatan,
    nowIso
  );

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (isOffline) {
    enqueuePutawayOutboxBatch({
      taskId: completedTask.id,
      invoicePutaway: completedTask.invoice_putaway,
      sourceLocations: completedTask.source_locations,
      completedBy: params.completedBy,
      catatan,
      taskSnapshot: completedTask,
      logs,
      movedSkus,
      logsSynced: logs.length === 0,
      taskSynced: false,
    });
    clearActivePutawaySession();
    return { success: true, queuedOffline: true, task: completedTask };
  }

  let logsSynced = logs.length === 0;
  try {
    if (logs.length > 0) {
      // Idempotency check
      const existingRows = await supabaseFetch<Array<{ type: string; sku: string; lokasi: string; qty: number }>>(
        'log_produk',
        'GET',
        null,
        `select=type,sku,lokasi,qty&invoice=eq.${encodeURIComponent(completedTask.invoice_putaway)}`
      );
      const existingCounts = new Map<string, number>();
      (existingRows || []).forEach((row) => {
        const k = `${String(row.type || '').toUpperCase()}|${String(row.sku || '').toUpperCase()}|${String(row.lokasi || '').toUpperCase()}|${Number(row.qty) || 0}`;
        existingCounts.set(k, (existingCounts.get(k) || 0) + 1);
      });

      const remainingLogs: LogProdukItem[] = [];
      for (const l of logs) {
        const k = `${String(l.type || '').toUpperCase()}|${String(l.sku || '').toUpperCase()}|${String(l.lokasi || '').toUpperCase()}|${Number(l.qty) || 0}`;
        const count = existingCounts.get(k) || 0;
        if (count > 0) {
          existingCounts.set(k, count - 1);
        } else {
          remainingLogs.push(l);
        }
      }

      const CHUNK_SIZE = 150;
      for (let c = 0; c < remainingLogs.length; c += CHUNK_SIZE) {
        await supabaseFetch('log_produk', 'POST', remainingLogs.slice(c, c + CHUNK_SIZE));
      }
      logsSynced = true;
    }

    const savedTask = await upsertPutawayTask(completedTask, false);

    invalidateStokFisikCache();
    if (movedSkus.length > 0) {
      await fetchStockForSkus(movedSkus).catch(() => {});
    }
    bumpCloudCacheEpoch('STOCK_RESET').catch(() => {});

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wms_inventory_updated'));
      window.dispatchEvent(new CustomEvent('wms_stock_updated'));
      window.dispatchEvent(new CustomEvent('wms_mutasi_updated'));
    }

    clearActivePutawaySession();
    return { success: true, queuedOffline: false, task: savedTask };
  } catch (err: any) {
    console.warn('[PutawayService] Network failure on submit, queueing to offline outbox:', err);
    enqueuePutawayOutboxBatch({
      taskId: completedTask.id,
      invoicePutaway: completedTask.invoice_putaway,
      sourceLocations: completedTask.source_locations,
      completedBy: params.completedBy,
      catatan,
      taskSnapshot: completedTask,
      logs,
      movedSkus,
      logsSynced,
      taskSynced: false,
    });
    clearActivePutawaySession();
    return {
      success: true,
      queuedOffline: true,
      task: completedTask,
      error: err?.message,
    };
  }
}

export function getPlacementSummaryLabel(placements: PutawayPlacement[]): string {
  if (!placements || placements.length === 0) return '';
  const byLoc = new Map<string, number>();
  for (const p of placements) {
    const loc = p.lokasi.trim().toUpperCase();
    const q = Math.max(0, Number(p.qty) || 0);
    if (loc && q > 0) {
      byLoc.set(loc, (byLoc.get(loc) || 0) + q);
    }
  }
  return Array.from(byLoc.entries())
    .map(([loc, q]) => `${loc} (${q})`)
    .join(', ');
}

export { parsePickerNamesList };
