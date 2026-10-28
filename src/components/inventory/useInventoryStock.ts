/**
 * Physical stock store + loader hook for the Inventory page.
 *
 * - Data lives in a module-level Map<sku, rows[]> so leaving/re-entering the tab is instant (0ms).
 * - A realtime `log_produk` event only marks the SKU dirty. Dirty SKUs are re-fetched in ONE batched
 *   request (max latency ~800ms) and only those SKUs are replaced. No full-list copy, no per-event render.
 * - Bulk operations (CSV import, SO approve) that touch many SKUs fall back to one full reload.
 * - IndexedDB snapshot is written at most once every few seconds, never inside a React state updater.
 * - NEVER mutates stock on its own: this is a read-only mirror of stok_real_fisik (derived from log_produk).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StockRealtimeItem } from '../../types';
import {
  fetchSupabaseStokFisikDirect,
  getMemoryStokFisikCache,
  supabaseFetch,
} from '../../services/supabase';
import { getAllInventoryStocksFromLocalDb, saveInventoryStocksToLocalDb } from '../../services/localDb';
import { globalRealtimeStore } from '../../services/store';

const STALE_MS = 30 * 1000;
const DELTA_THROTTLE_MS = 800;
const DELTA_CHUNK = 100;
const DELTA_FULL_RELOAD_THRESHOLD = 300;
const SNAPSHOT_SAVE_DELAY_MS = 5000;

// ----------------------------------------------------------------
// Module-level store
// ----------------------------------------------------------------
const stockBySku = new Map<string, StockRealtimeItem[]>();
let loadedAt = 0;

const skuKey = (s: unknown): string => String(s || '').trim().toUpperCase();
const locKey = (l: unknown): string => String(l || '').trim().toUpperCase();

function pushNormalizedRow(bucket: StockRealtimeItem[], row: StockRealtimeItem): void {
  const cleanSku = skuKey(row.sku);
  const cleanLoc = locKey(row.lokasi);
  if (!cleanSku || !cleanLoc || cleanLoc === '-') return;
  const qty = Number(row.sisa_stok) || 0;
  if (qty === 0) return;

  const canonicalId = `${cleanSku}_${cleanLoc}`;
  const rawId = String(row.id || '');
  const isLegacyIndexedId = rawId !== canonicalId && rawId.startsWith(`${canonicalId}_`);

  const existingIdx = bucket.findIndex((b) => locKey(b.lokasi) === cleanLoc);
  if (existingIdx === -1) {
    bucket.push({
      ...row,
      id: canonicalId,
      sku: cleanSku,
      lokasi: cleanLoc,
      sisa_stok: qty,
    });
  } else {
    const existing = bucket[existingIdx];
    const existingRawArea = String(existing.area || '').trim().toUpperCase();
    const rowRawArea = String(row.area || '').trim().toUpperCase();
    // Only sum if the two rows originate from genuinely different area groups in stok_real_fisik;
    // otherwise treat as duplicate cache entry and keep the canonical/latest value
    if (existingRawArea && rowRawArea && existingRawArea !== rowRawArea) {
      existing.sisa_stok = (Number(existing.sisa_stok) || 0) + qty;
    } else if (!isLegacyIndexedId && row.updated_at && (!existing.updated_at || row.updated_at >= existing.updated_at)) {
      existing.sisa_stok = qty;
      existing.updated_at = row.updated_at;
    }
  }
}

function replaceAll(list: StockRealtimeItem[]): void {
  stockBySku.clear();
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    const key = skuKey(row.sku);
    if (!key) continue;
    let bucket = stockBySku.get(key);
    if (!bucket) {
      bucket = [];
      stockBySku.set(key, bucket);
    }
    pushNormalizedRow(bucket, row);
  }
  loadedAt = Date.now();
}

function applyDelta(skus: string[], rows: StockRealtimeItem[]): void {
  for (let i = 0; i < skus.length; i++) stockBySku.delete(skus[i]);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = skuKey(row.sku);
    if (!key) continue;
    let bucket = stockBySku.get(key);
    if (!bucket) {
      bucket = [];
      stockBySku.set(key, bucket);
    }
    pushNormalizedRow(bucket, row);
  }
}

export function getStockBySku(): Map<string, StockRealtimeItem[]> {
  return stockBySku;
}

export function flattenStock(): StockRealtimeItem[] {
  const out: StockRealtimeItem[] = [];
  stockBySku.forEach((rows) => {
    for (let i = 0; i < rows.length; i++) out.push(rows[i]);
  });
  return out;
}

const isStoreEmpty = (): boolean => stockBySku.size === 0;

// ----------------------------------------------------------------
// Hook
// ----------------------------------------------------------------
export type InventoryLoadPhase = 'loading' | 'ready' | 'syncing' | 'error';

export interface UseInventoryStock {
  /** Bumps whenever the underlying store changed. Use as a memo dependency. */
  version: number;
  phase: InventoryLoadPhase;
  error: string | null;
  isEmpty: boolean;
  reload: (manual?: boolean) => Promise<void>;
}

export function useInventoryStock(): UseInventoryStock {
  const [version, setVersion] = useState(0);
  const [phase, setPhase] = useState<InventoryLoadPhase>(() => (isStoreEmpty() ? 'loading' : 'ready'));
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const reload = useCallback(
    async (manual = false): Promise<void> => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      try {
        // 1. Instant paint from cache when the store is cold
        if (isStoreEmpty()) {
          const mem = getMemoryStokFisikCache();
          if (mem && mem.length > 0) {
            replaceAll(mem);
            loadedAt = 0; // cache hydrate is not a fresh sync
            bump();
          } else {
            try {
              const local = await getAllInventoryStocksFromLocalDb();
              if (local && local.length > 0) {
                replaceAll(local);
                loadedAt = 0;
                bump();
              }
            } catch {
              /* IndexedDB unavailable: continue to network */
            }
          }
        }

        // 2. Skip network if the data was synced very recently
        if (!manual && !isStoreEmpty() && Date.now() - loadedAt < STALE_MS) {
          setPhase('ready');
          return;
        }

        setPhase(isStoreEmpty() ? 'loading' : 'syncing');
        setError(null);

        const list = await fetchSupabaseStokFisikDirect(manual);
        if (list && list.length > 0) {
          replaceAll(list);
          bump();
          setPhase('ready');
        } else if (isStoreEmpty()) {
          setError('Data stok fisik tidak dapat dimuat dari Supabase. Silakan klik Muat Ulang.');
          setPhase('error');
        } else {
          setPhase('ready');
        }
      } catch (e: any) {
        if (isStoreEmpty()) {
          setError(e?.message || 'Gagal memuat data stok fisik');
          setPhase('error');
        } else {
          setPhase('ready');
        }
      } finally {
        loadingRef.current = false;
      }
    },
    [bump]
  );

  // Initial load
  useEffect(() => {
    reload(false);
  }, [reload]);

  // Realtime: batched per-SKU delta
  useEffect(() => {
    const pending = new Set<string>();
    let needFull = false;
    let deltaTimer: ReturnType<typeof setTimeout> | null = null;
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const scheduleSnapshotSave = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        saveInventoryStocksToLocalDb(flattenStock()).catch(() => {});
      }, SNAPSHOT_SAVE_DELAY_MS);
    };

    const flush = async () => {
      deltaTimer = null;
      if (disposed) return;

      if (needFull || pending.size > DELTA_FULL_RELOAD_THRESHOLD) {
        pending.clear();
        needFull = false;
        await reload(true);
        return;
      }

      const skus = Array.from(pending);
      pending.clear();
      if (skus.length === 0) return;

      try {
        const merged: StockRealtimeItem[] = [];
        for (let i = 0; i < skus.length; i += DELTA_CHUNK) {
          const chunk = skus.slice(i, i + DELTA_CHUNK);
          const skuParam = chunk.map((s) => `"${encodeURIComponent(s)}"`).join(',');
          const rows = await supabaseFetch<StockRealtimeItem[]>(
            'stok_real_fisik',
            'GET',
            null,
            `sku=in.(${skuParam})&sisa_stok=neq.0&select=sku,nama_produk,size,lokasi,area,sisa_stok,updated_at`
          );
          if (!Array.isArray(rows)) throw new Error('Invalid delta response');
          for (let j = 0; j < rows.length; j++) merged.push(rows[j]);
        }
        if (disposed) return;
        applyDelta(skus, merged);
        bump();
        scheduleSnapshotSave();
      } catch {
        // A failed delta must NOT blank the SKU. Fall back to a full reload instead.
        if (!disposed) await reload(true);
      }
    };

    const onLog = (payload: any) => {
      const sku = skuKey(payload?.new?.sku || payload?.old?.sku);
      if (sku) pending.add(sku);
      else needFull = true;
      if (!deltaTimer) deltaTimer = setTimeout(flush, DELTA_THROTTLE_MS);
    };

    const unsub = globalRealtimeStore.subscribe('log_produk', onLog);
    return () => {
      disposed = true;
      unsub();
      if (deltaTimer) clearTimeout(deltaTimer);
      if (saveTimer) clearTimeout(saveTimer);
    };
  }, [bump, reload]);

  return { version, phase, error, isEmpty: isStoreEmpty(), reload };
}
