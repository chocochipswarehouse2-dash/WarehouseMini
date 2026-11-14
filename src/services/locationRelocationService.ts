import {
  supabaseFetch,
  getAreaFromLokasi,
  normalizeLokasi,
  invalidateStokFisikCache,
  fetchStockForSkus,
  bumpCloudCacheEpoch,
} from './supabase';
import { resolveProductName, resolveProductDisplaySize } from '../utils/sortUtils';
import type { EnrichedCatalogEntry } from './rackCapacityService';
import type { LogProdukItem, StockRealtimeItem } from '../types';

export interface RelocationSourceBucket {
  lokasiExact: string;
  areaExact: string;
  qty: number;
}

export interface RelocationPreviewItem {
  sku: string;
  nama_produk: string;
  size: string;
  totalQty: number;
  buckets: RelocationSourceBucket[];
  updated_at?: string;
}

export interface RelocationNegativeAnomalyItem {
  sku: string;
  nama_produk: string;
  size: string;
  lokasi: string;
  area: string;
  sisa_stok: number;
}

export interface RelocationPreviewResult {
  sourceLokasi: string;
  sourceArea: string;
  items: RelocationPreviewItem[];
  negativeAnomalyItems: RelocationNegativeAnomalyItem[];
  totalSkus: number;
  totalPcs: number;
  pendingSoCount: number;
  matchingLocationsFound: string[];
}

export interface ExecuteLocationRelocationItem {
  sku: string;
  nama_produk: string;
  size: string;
  moveQty: number;
  buckets: RelocationSourceBucket[];
}

export interface ExecuteLocationRelocationParams {
  sourceLokasi: string;
  targetLokasi: string;
  items: ExecuteLocationRelocationItem[];
  operatorName: string;
  notes?: string;
  mode: 'FULL' | 'PARTIAL';
}

export interface ExecuteLocationRelocationResult {
  success: boolean;
  invoice: string;
  sourceLokasi: string;
  targetLokasi: string;
  targetArea: string;
  totalSkus: number;
  totalPcs: number;
  movedItems: Array<{
    sku: string;
    nama_produk: string;
    size: string;
    qty: number;
  }>;
  createdAt: string;
  error?: string;
}

const INVALID_LOCATION_TOKENS = new Set([
  '',
  '-',
  '--',
  'NULL',
  'UNDEFINED',
  'NONE',
  'KOSONG',
  'DEFAULT',
  'UNKNOWN',
]);

export function isInvalidLocationToken(lokasi: string): boolean {
  const clean = (lokasi || '').trim().toUpperCase();
  return INVALID_LOCATION_TOKENS.has(clean);
}

function buildLocationCaseVariants(lokasi: string, extraVariants: string[] = []): string[] {
  const set = new Set<string>();
  const addVariant = (val: string) => {
    const raw = (val || '').trim();
    if (!raw) return;
    set.add(raw);
    set.add(raw.toUpperCase());
    set.add(raw.toLowerCase());
    set.add(raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase());
    const norm = normalizeLokasi(raw);
    if (norm) {
      set.add(norm);
      set.add(norm.toUpperCase());
      set.add(norm.toLowerCase());
    }
  };

  addVariant(lokasi);
  extraVariants.forEach(addVariant);
  return Array.from(set).filter(Boolean);
}

/**
 * Fetches live authoritative stock from Supabase `stok_real_fisik` for a given source location.
 */
export async function fetchLocationRelocationPreview(
  sourceLokasi: string,
  catalogMap?: Map<string, EnrichedCatalogEntry>,
  extraKnownVariants: string[] = []
): Promise<RelocationPreviewResult> {
  const cleanSource = normalizeLokasi((sourceLokasi || '').trim().toUpperCase()) || (sourceLokasi || '').trim().toUpperCase();
  const sourceArea = getAreaFromLokasi(cleanSource);

  if (!cleanSource || isInvalidLocationToken(cleanSource)) {
    return {
      sourceLokasi: cleanSource,
      sourceArea,
      items: [],
      negativeAnomalyItems: [],
      totalSkus: 0,
      totalPcs: 0,
      pendingSoCount: 0,
      matchingLocationsFound: [],
    };
  }

  const variants = buildLocationCaseVariants(sourceLokasi, [cleanSource, ...extraKnownVariants]);
  const locParam = variants.map((l) => `"${encodeURIComponent(l)}"`).join(',');

  let rawRows: StockRealtimeItem[] = [];
  let pendingSoCount = 0;

  // 1. Fetch live stock rows from stok_real_fisik
  const rows = await supabaseFetch<StockRealtimeItem[]>(
    'stok_real_fisik',
    'GET',
    null,
    `lokasi=in.(${locParam})&sisa_stok=neq.0&select=sku,nama_produk,size,lokasi,area,sisa_stok,updated_at&limit=5000`
  );
  if (Array.isArray(rows)) {
    rawRows = rows;
  }

  // 2. Check if there are pending Stock Opname queue entries at this location
  try {
    const pendingQueues = await supabaseFetch<Array<{ id: string }>>(
      'stock_opname_queue',
      'GET',
      null,
      `lokasi=in.(${locParam})&status=eq.PENDING&select=id&limit=500`
    );
    if (Array.isArray(pendingQueues)) {
      pendingSoCount = pendingQueues.length;
    }
  } catch {
    // Non-blocking
  }

  const positiveMap = new Map<string, RelocationPreviewItem>();
  const negativeAnomalyItems: RelocationNegativeAnomalyItem[] = [];
  const matchingLocSet = new Set<string>();

  for (const row of rawRows) {
    const sku = String(row.sku || '').trim().toUpperCase();
    if (!sku) continue;
    const lokasiExact = String(row.lokasi || cleanSource);
    const areaExact = String(row.area || getAreaFromLokasi(lokasiExact));
    const qty = Number(row.sisa_stok) || 0;
    if (qty === 0) continue;

    matchingLocSet.add(lokasiExact);

    const catEntry = catalogMap?.get(sku);
    const rawName = catEntry?.nama_produk || String(row.nama_produk || row.nama || sku).trim();
    const resolvedName = resolveProductName(sku, rawName) || rawName || sku;
    const rawSize = catEntry?.size || String(row.size || row.ukuran || '').trim();
    const resolvedSize = resolveProductDisplaySize(sku, rawSize, rawSize) || '-';

    if (qty < 0) {
      negativeAnomalyItems.push({
        sku,
        nama_produk: resolvedName,
        size: resolvedSize,
        lokasi: lokasiExact,
        area: areaExact,
        sisa_stok: qty,
      });
      continue;
    }

    const existing = positiveMap.get(sku);
    const bucket: RelocationSourceBucket = {
      lokasiExact,
      areaExact,
      qty,
    };

    if (!existing) {
      positiveMap.set(sku, {
        sku,
        nama_produk: resolvedName,
        size: resolvedSize,
        totalQty: qty,
        buckets: [bucket],
        updated_at: row.updated_at,
      });
    } else {
      existing.totalQty += qty;
      const sameBucket = existing.buckets.find(
        (b) => b.lokasiExact === bucket.lokasiExact && b.areaExact === bucket.areaExact
      );
      if (sameBucket) {
        sameBucket.qty += bucket.qty;
      } else {
        existing.buckets.push(bucket);
      }
      if (row.updated_at && (!existing.updated_at || row.updated_at > existing.updated_at)) {
        existing.updated_at = row.updated_at;
      }
    }
  }

  const items = Array.from(positiveMap.values()).sort((a, b) => {
    const nameCmp = a.nama_produk.localeCompare(b.nama_produk, 'id', { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return a.sku.localeCompare(b.sku, 'id', { numeric: true });
  });

  const totalPcs = items.reduce((sum, it) => sum + it.totalQty, 0);

  return {
    sourceLokasi: cleanSource,
    sourceArea,
    items,
    negativeAnomalyItems,
    totalSkus: items.length,
    totalPcs,
    pendingSoCount,
    matchingLocationsFound: Array.from(matchingLocSet),
  };
}

export function generateRelocationInvoice(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const hms = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `REL-${ymd}-${hms}-${rand}`;
}

/**
 * Executes stock relocation by appending paired OUT (from exact source buckets)
 * and IN (to normalized destination location) entries into `log_produk`.
 */
export async function executeLocationRelocation(
  params: ExecuteLocationRelocationParams
): Promise<ExecuteLocationRelocationResult> {
  const rawSource = (params.sourceLokasi || '').trim().toUpperCase();
  const cleanSource = normalizeLokasi(rawSource) || rawSource;
  const rawTarget = (params.targetLokasi || '').trim().toUpperCase();
  const cleanTarget = normalizeLokasi(rawTarget) || rawTarget;
  const targetArea = getAreaFromLokasi(cleanTarget);
  const operator = (params.operatorName || 'Admin').trim() || 'Admin';
  const invoice = generateRelocationInvoice();
  const createdAt = new Date().toISOString();

  if (!cleanSource || isInvalidLocationToken(cleanSource)) {
    return {
      success: false,
      invoice,
      sourceLokasi: cleanSource,
      targetLokasi: cleanTarget,
      targetArea,
      totalSkus: 0,
      totalPcs: 0,
      movedItems: [],
      createdAt,
      error: 'Lokasi asal tidak valid.',
    };
  }

  if (!cleanTarget || isInvalidLocationToken(cleanTarget)) {
    return {
      success: false,
      invoice,
      sourceLokasi: cleanSource,
      targetLokasi: cleanTarget,
      targetArea,
      totalSkus: 0,
      totalPcs: 0,
      movedItems: [],
      createdAt,
      error: 'Lokasi tujuan wajib diisi dengan kode rak yang valid.',
    };
  }

  if (cleanSource === cleanTarget) {
    return {
      success: false,
      invoice,
      sourceLokasi: cleanSource,
      targetLokasi: cleanTarget,
      targetArea,
      totalSkus: 0,
      totalPcs: 0,
      movedItems: [],
      createdAt,
      error: 'Lokasi asal dan lokasi tujuan tidak boleh sama.',
    };
  }

  if (targetArea === 'Anomali') {
    return {
      success: false,
      invoice,
      sourceLokasi: cleanSource,
      targetLokasi: cleanTarget,
      targetArea,
      totalSkus: 0,
      totalPcs: 0,
      movedItems: [],
      createdAt,
      error: `Kode rak tujuan "${cleanTarget}" tidak sesuai standar denah gudang (Anomali). Contoh valid: A001, V004, R010, X105, SHOPEE.`,
    };
  }

  const validItems = params.items.filter((it) => Math.floor(Number(it.moveQty) || 0) > 0);
  if (validItems.length === 0) {
    return {
      success: false,
      invoice,
      sourceLokasi: cleanSource,
      targetLokasi: cleanTarget,
      targetArea,
      totalSkus: 0,
      totalPcs: 0,
      movedItems: [],
      createdAt,
      error: 'Tidak ada item dengan kuantitas pindah > 0.',
    };
  }

  const modeLabel = params.mode === 'FULL' ? 'Relokasi Full' : 'Relokasi Sebagian';
  const noteSuffix = params.notes?.trim() ? ` - ${params.notes.trim()}` : '';

  const logsToInsert: LogProdukItem[] = [];
  const movedItems: Array<{ sku: string; nama_produk: string; size: string; qty: number }> = [];
  const movedSkus: string[] = [];

  for (const item of validItems) {
    const requestedQty = Math.floor(Number(item.moveQty) || 0);
    if (requestedQty <= 0) continue;

    let remaining = requestedQty;
    let actualDeducted = 0;

    // Drain from exact (lokasiExact, areaExact) buckets so stok_real_fisik view groups cancel cleanly to 0
    const buckets =
      item.buckets && item.buckets.length > 0
        ? item.buckets
        : [{ lokasiExact: cleanSource, areaExact: getAreaFromLokasi(cleanSource), qty: requestedQty }];

    for (const bucket of buckets) {
      if (remaining <= 0) break;
      const available = Math.max(0, Math.floor(Number(bucket.qty) || 0));
      if (available <= 0) continue;
      const take = Math.min(remaining, available);
      if (take <= 0) continue;

      logsToInsert.push({
        type: 'OUT',
        invoice,
        sku: item.sku,
        nama_produk: item.nama_produk || item.sku,
        size: item.size || '-',
        area: bucket.areaExact || getAreaFromLokasi(bucket.lokasiExact),
        lokasi: bucket.lokasiExact,
        qty: take,
        operator,
        keterangan: `${modeLabel} ${cleanSource} -> ${cleanTarget}${noteSuffix}`,
        created_at: createdAt,
      });

      remaining -= take;
      actualDeducted += take;
    }

    if (actualDeducted > 0) {
      logsToInsert.push({
        type: 'IN',
        invoice,
        sku: item.sku,
        nama_produk: item.nama_produk || item.sku,
        size: item.size || '-',
        area: targetArea,
        lokasi: cleanTarget,
        qty: actualDeducted,
        operator,
        keterangan: `${modeLabel} dari ${cleanSource} -> ${cleanTarget}${noteSuffix}`,
        created_at: createdAt,
      });

      movedItems.push({
        sku: item.sku,
        nama_produk: item.nama_produk || item.sku,
        size: item.size || '-',
        qty: actualDeducted,
      });
      movedSkus.push(item.sku);
    }
  }

  if (logsToInsert.length === 0) {
    return {
      success: false,
      invoice,
      sourceLokasi: cleanSource,
      targetLokasi: cleanTarget,
      targetArea,
      totalSkus: 0,
      totalPcs: 0,
      movedItems: [],
      createdAt,
      error: 'Gagal menyusun log mutasi relokasi (stok asal tidak mencukupi).',
    };
  }

  try {
    // Post directly to log_produk in chunks so exact bucket area is preserved for OUT rows
    const CHUNK_SIZE = 150;
    for (let i = 0; i < logsToInsert.length; i += CHUNK_SIZE) {
      const chunk = logsToInsert.slice(i, i + CHUNK_SIZE);
      await supabaseFetch('log_produk', 'POST', chunk);
    }

    // Refresh caches & notify all listeners across components
    invalidateStokFisikCache();
    await fetchStockForSkus(movedSkus).catch(() => {});
    bumpCloudCacheEpoch('STOCK_RESET').catch(() => {});

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wms_inventory_updated'));
      window.dispatchEvent(new CustomEvent('wms_stock_updated'));
      window.dispatchEvent(new CustomEvent('wms_mutasi_updated'));
    }

    const totalPcs = movedItems.reduce((sum, it) => sum + it.qty, 0);

    return {
      success: true,
      invoice,
      sourceLokasi: cleanSource,
      targetLokasi: cleanTarget,
      targetArea,
      totalSkus: movedItems.length,
      totalPcs,
      movedItems,
      createdAt,
    };
  } catch (err: any) {
    console.error('[LocationRelocation] Error inserting relocation logs:', err);
    return {
      success: false,
      invoice,
      sourceLokasi: cleanSource,
      targetLokasi: cleanTarget,
      targetArea,
      totalSkus: 0,
      totalPcs: 0,
      movedItems: [],
      createdAt,
      error: err?.message || 'Gagal menyimpan log mutasi relokasi ke Supabase.',
    };
  }
}
