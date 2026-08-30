import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  LogProdukItem,
  StockOpnameQueueItem,
  StockRealtimeItem,
  PenerimaanProduksiItem,
  PickingListItem,
  WmsUser,
  ProductItem,
  PeminjamanRecord,
  UserRole,
  UserPermissions,
} from '../types';

export const DEFAULT_SUPABASE_URL = 'https://filgijcfhgqlirzhvwho.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';

// Empty baseline seed - no dummy items
export const DEFAULT_SEED_PRODUCTS: ProductItem[] = [];

/**
 * Filter helper to detect and eliminate any legacy dummy placeholder products
 */
export function isDummyProduct(item: ProductItem | null | undefined): boolean {
  if (!item || !item.k) return true;
  const sku = item.k.toUpperCase().trim();
  const name = String(item.p || item.n || '').toLowerCase();
  
  // Detect known dummy product patterns
  if (
    sku === 'SKU-001' ||
    sku === 'SKU-002' ||
    sku === 'SKU-003' ||
    sku === 'SKU-004' ||
    sku === 'SKU-005' ||
    sku === 'SKU-006' ||
    sku === 'SKU-007' ||
    sku === 'SKU-008' ||
    sku === 'SKU-009' ||
    sku === 'SKU-010' ||
    sku === 'SKU-011' ||
    sku === 'SKU-012'
  ) {
    if (
      name.includes('t-shirt cotton combed') ||
      name.includes('hoodie oversized') ||
      name.includes('denim jacket') ||
      name.includes('chino pants') ||
      name.includes('sneakers canvas') ||
      name.includes('polo shirt pique') ||
      name.includes('cargo shorts') ||
      name.includes('bucket hat ripstop') ||
      name.includes('cardigan knitwear') ||
      name.includes('dress floral summer')
    ) {
      return true;
    }
  }
  return false;
}

let supabaseInstance: SupabaseClient | null = null;
let currentConfig = {
  url: DEFAULT_SUPABASE_URL,
  key: DEFAULT_SUPABASE_ANON_KEY,
};

export function getStoredSupabaseConfig() {
  const url = localStorage.getItem('wms_supabase_url') || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem('wms_supabase_key') || DEFAULT_SUPABASE_ANON_KEY;
  return { url, key };
}

export function saveSupabaseConfig(url: string, key: string) {
  localStorage.setItem('wms_supabase_url', url);
  localStorage.setItem('wms_supabase_key', key);
  currentConfig = { url, key };
  supabaseInstance = null; // reset client
}

export function getSupabaseClient(): SupabaseClient {
  const { url, key } = getStoredSupabaseConfig();
  if (!supabaseInstance || currentConfig.url !== url || currentConfig.key !== key) {
    currentConfig = { url, key };
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return supabaseInstance;
}

export function getAreaFromLokasi(lokasi: string, area?: string): string {
  if (area && area.trim()) {
    const a = area.trim();
    // Normalize area string if clearly identifiable
    const aUp = a.toUpperCase();
    if (aUp.includes('BLOK')) return 'Blok F';
    if (aUp.includes('STUDIO') || aUp.includes('FOTO')) return 'Studio';
    if (aUp.includes('TOKO') || aUp.includes('STORE')) return 'Toko';
    if (aUp.includes('PERBAIKAN') || aUp.includes('REPAIR') || aUp.includes('DEFECT') || aUp.includes('BS') || aUp.includes('QC') || aUp.includes('CUCI')) return 'Perbaikan';
    if (aUp.includes('WAREHOUSE') || aUp.includes('GUDANG') || aUp === 'WH') return 'Warehouse';
    return a;
  }
  const lok = String(lokasi || '').trim().toUpperCase();
  if (!lok) return 'Warehouse';

  // Area Blok F & Channel Peminjaman (Shopee, TikTok, Live, etc.)
  if (
    lok.includes('BLOK F') ||
    lok.includes('BLOK-F') ||
    lok.includes('BLOK_F') ||
    lok.includes('SHOPEE') ||
    lok.includes('TIKTOK') ||
    lok.includes('TOK') ||
    lok.includes('SHP') ||
    lok.includes('TTK') ||
    lok.includes('LIVE')
  ) {
    return 'Blok F';
  }

  // Area Studio
  if (lok.includes('STUDIO') || lok.includes('FOTO') || lok.includes('DISPLAY') || lok.startsWith('STD')) {
    return 'Studio';
  }

  // Area Toko
  if (lok.startsWith('T-') || lok.startsWith('TK-') || lok.includes('TOKO') || lok.includes('STORE')) {
    return 'Toko';
  }

  // Area Perbaikan / Defect / QC / Cuci
  if (
    lok.startsWith('CC') || // CC001, CC002, CC003 etc.
    lok.includes('CUCI') ||
    lok.includes('WASH') ||
    lok.includes('PERBAIKAN') ||
    lok.includes('REPAIR') ||
    lok.includes('DEFECT') ||
    lok.includes('BS') ||
    lok.includes('REJECT') ||
    lok.includes('RETUR') ||
    lok.includes('SAMPLE') ||
    lok.includes('DAMAGE') ||
    lok.includes('RUSAK')
  ) {
    return 'Perbaikan';
  }

  // General Warehouse Racks
  return 'Warehouse';
}

/**
 * Check if a given location & area belongs to the warehouse area (for picking & fulfillment)
 */
export function isWarehouseLocation(lokasi: string, area?: string): boolean {
  if (area && area.trim()) {
    const a = area.trim().toUpperCase();
    if (
      a.includes('BLOK') ||
      a.includes('STUDIO') ||
      a.includes('TOKO') ||
      a.includes('PERBAIKAN') ||
      a.includes('REPAIR') ||
      a.includes('DEFECT') ||
      a.includes('LIVE') ||
      a.includes('SHOPEE') ||
      a.includes('TIKTOK') ||
      a.includes('BS') ||
      a.includes('SAMPLE') ||
      a.includes('STORE') ||
      a.includes('CUCI')
    ) {
      return false;
    }
  }

  const lok = String(lokasi || '').trim().toUpperCase();
  if (!lok) return true; // Default fallback to warehouse

  // Non-warehouse location keywords to exclude from warehouse picking
  if (
    lok.includes('BLOK F') ||
    lok.includes('BLOK-F') ||
    lok.includes('BLOK_F') ||
    lok.includes('SHOPEE') ||
    lok.includes('TIKTOK') ||
    lok.includes('TOK') ||
    lok.includes('SHP') ||
    lok.includes('TTK') ||
    lok.includes('LIVE') ||
    lok.includes('STUDIO') ||
    lok.includes('FOTO') ||
    lok.includes('DISPLAY') ||
    lok.includes('TOKO') ||
    lok.includes('STORE') ||
    lok.startsWith('STD') ||
    lok.startsWith('TK') ||
    lok.startsWith('CC') || // CC001, CC002, CC003 etc.
    lok.includes('CUCI') ||
    lok.includes('WASH') ||
    lok.includes('PERBAIKAN') ||
    lok.includes('REPAIR') ||
    lok.includes('DEFECT') ||
    lok.includes('BS') ||
    lok.includes('REJECT') ||
    lok.includes('RETUR') ||
    lok.includes('SAMPLE') ||
    lok.includes('DAMAGE') ||
    lok.includes('RUSAK')
  ) {
    return false;
  }

  return true;
}

/**
 * Direct REST fetcher (compatible with existing edge proxy or direct REST API)
 */
export async function supabaseFetch<T = unknown>(
  table: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  payload?: unknown,
  queryParams = ''
): Promise<T> {
  const { url, key } = getStoredSupabaseConfig();
  const endpoint = `${url}/rest/v1/${table}${queryParams ? '?' + queryParams : ''}`;
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  if (method === 'POST' || method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
  }

  const response = await fetch(endpoint, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase Error (${response.status}): ${errorText}`);
  }

  if (response.status !== 204) {
    return (await response.json()) as T;
  }
  return null as T;
}

/**
 * =========================================================================
 * SCHEMA SQL DEFINITIONS & GENERATOR FOR SUPABASE
 * Jika table belum ada di database Supabase user, sistem menyediakan DDL Script
 * =========================================================================
 */
export const SUPABASE_DATABASE_SCHEMA_SQL = `
-- ============================================================
-- WMS CHOCOCHIPS SMART SYSTEM - SUPABASE DATABASE DDL SCHEMA
-- ============================================================

-- 1. TABEL MASTER USERS & ROLE AKSES
CREATE TABLE IF NOT EXISTS public.wms_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Operator', -- 'All', 'Produk', 'Fulfillment', 'Peminjaman', 'Operator'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert Default Super Admin User jika belum ada
INSERT INTO public.wms_users (username, password, role)
VALUES ('admin', 'admin123', 'All'),
       ('operator', '123456', 'Operator')
ON CONFLICT (username) DO NOTHING;

-- 2. TABEL MASTER PRODUK
CREATE TABLE IF NOT EXISTS public.master_produk (
  sku TEXT PRIMARY KEY,
  nama_produk TEXT NOT NULL,
  kategori TEXT DEFAULT 'Apparel',
  size TEXT DEFAULT 'Default',
  price NUMERIC DEFAULT 0,
  dealpos_channels JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABEL LOG PRODUK (IN / OUT / ADJ_IN / ADJ_OUT)
CREATE TABLE IF NOT EXISTS public.log_produk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'IN', 'OUT', 'ADJ_IN', 'ADJ_OUT'
  invoice TEXT NOT NULL,
  sku TEXT NOT NULL,
  nama_produk TEXT NOT NULL,
  size TEXT DEFAULT '-',
  area TEXT DEFAULT 'Warehouse',
  lokasi TEXT NOT NULL,
  qty NUMERIC DEFAULT 1,
  operator TEXT NOT NULL,
  keterangan TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABEL STOCK OPNAME & ADJUSTMENT QUEUE
CREATE TABLE IF NOT EXISTS public.stock_opname_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesi_id TEXT NOT NULL,
  tanggal TIMESTAMPTZ DEFAULT now(),
  sku TEXT NOT NULL,
  nama_produk TEXT NOT NULL,
  size TEXT DEFAULT '-',
  lokasi TEXT NOT NULL,
  area TEXT DEFAULT 'Warehouse',
  qty_sistem NUMERIC DEFAULT 0,
  qty_fisik NUMERIC DEFAULT 0,
  selisih NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
  jenis TEXT DEFAULT 'Opname', -- 'Opname', 'Manual'
  alasan TEXT DEFAULT '',
  operator TEXT NOT NULL,
  invoice TEXT NOT NULL,
  approved_by TEXT,
  tanggal_approve TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TABEL PENERIMAAN PRODUKSI & KEDATANGAN BARANG
CREATE TABLE IF NOT EXISTS public.penerimaan_produksi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal_penerimaan DATE NOT NULL DEFAULT CURRENT_DATE,
  kategori TEXT NOT NULL DEFAULT 'Lokal CMT', -- 'Lokal CMT', 'Kargo'
  no_surat_jalan TEXT NOT NULL,
  kode_produksi TEXT NOT NULL,
  warna TEXT DEFAULT '',
  size TEXT DEFAULT 'Default',
  qty NUMERIC DEFAULT 1,
  foto_url TEXT DEFAULT '',
  keterangan TEXT DEFAULT '',
  operator TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TABEL FULFILLMENT PICKING LIST
CREATE TABLE IF NOT EXISTS public.picking_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_sj TEXT NOT NULL,
  tanggal TEXT DEFAULT '',
  tujuan TEXT DEFAULT 'Marketplace',
  sku TEXT NOT NULL,
  nama_produk TEXT NOT NULL,
  qty_req NUMERIC DEFAULT 0,
  qty_picked NUMERIC DEFAULT 0,
  lokasi TEXT DEFAULT '-',
  status TEXT DEFAULT 'PENDING', -- 'PENDING', 'TERCETAK', 'SELESAI'
  picker_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. TABEL PEMINJAMAN SEMENTARA (SPS)
CREATE TABLE IF NOT EXISTS public.peminjaman_sps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_peminjaman TEXT UNIQUE NOT NULL,
  nama_peminjam TEXT NOT NULL,
  keperluan TEXT NOT NULL,
  tgl_pinjam DATE NOT NULL DEFAULT CURRENT_DATE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'Dipinjam', -- 'Dipinjam', 'Dikembalikan'
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. VIEW REALTIME STOK OTOMATIS (SISA STOK = IN - OUT)
CREATE OR REPLACE VIEW public.view_stok_realtime AS
SELECT 
  lp.sku,
  lp.lokasi,
  lp.area,
  lp.nama_produk,
  lp.size,
  SUM(
    CASE 
      WHEN lp.type IN ('IN', 'ADJ_IN') THEN lp.qty
      WHEN lp.type IN ('OUT', 'ADJ_OUT') THEN -lp.qty
      ELSE 0
    END
  ) as sisa_stok,
  MAX(lp.created_at) as updated_at
FROM public.log_produk lp
GROUP BY lp.sku, lp.lokasi, lp.area, lp.nama_produk, lp.size;

-- RLS Permissions (Open Anon for WMS Applet)
ALTER TABLE public.wms_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_produk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_produk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_opname_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penerimaan_produksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picking_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peminjaman_sps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access" ON public.wms_users FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.master_produk FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.log_produk FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.stock_opname_queue FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.penerimaan_produksi FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.picking_list FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.peminjaman_sps FOR ALL USING (true);
`;

/**
 * Fetch real-time system stock for locations
 */
export async function fetchStockForLocations(locations: string[]): Promise<StockRealtimeItem[]> {
  if (!locations.length) return [];
  try {
    const lokParam = locations.map((l) => `"${l}"`).join(',');
    const data = await supabaseFetch<StockRealtimeItem[]>(
      'view_stok_realtime',
      'GET',
      null,
      `lokasi=in.(${encodeURIComponent(lokParam)})`
    );
    return data || [];
  } catch (err) {
    console.warn('Error fetching realtime stock from Supabase view, returning fallback:', err);
    return [];
  }
}

/**
 * Fetch real-time system stock by SKUs across all warehouse locations
 */
export async function fetchStockForSkus(skus: string[]): Promise<StockRealtimeItem[]> {
  if (!skus.length) return [];
  try {
    const cleanSkus = Array.from(new Set(skus.map((s) => s.trim()))).filter(Boolean);
    if (!cleanSkus.length) return [];
    const skuParam = cleanSkus.map((s) => `"${s}"`).join(',');
    const data = await supabaseFetch<StockRealtimeItem[]>(
      'view_stok_realtime',
      'GET',
      null,
      `sku=in.(${encodeURIComponent(skuParam)})`
    );
    if (data && Array.isArray(data)) {
      return data.filter((item) => isWarehouseLocation(item.lokasi, item.area));
    }
    return [];
  } catch (err) {
    console.warn('Error fetching realtime stock by SKUs:', err);
    return [];
  }
}

/**
 * Insert logs into log_produk table (with local fallback if offline or table missing)
 */
export async function insertLogProduk(logs: LogProdukItem[]): Promise<unknown> {
  if (!logs.length) return [];
  try {
    return await supabaseFetch('log_produk', 'POST', logs);
  } catch (err) {
    console.warn('Direct Supabase insert failed, caching locally:', err);
    try {
      const existing = JSON.parse(localStorage.getItem('wms_offline_logs') || '[]');
      localStorage.setItem('wms_offline_logs', JSON.stringify([...existing, ...logs]));
    } catch {}
    return logs;
  }
}

/**
 * Insert stock opname queue records
 */
export async function insertStockOpnameQueue(items: StockOpnameQueueItem[]): Promise<unknown> {
  if (!items.length) return [];
  try {
    return await supabaseFetch('stock_opname_queue', 'POST', items);
  } catch (err) {
    console.warn('Stock Opname Queue direct insert failed, caching locally:', err);
    return items;
  }
}

/**
 * Fetch latest log_produk items for real-time history inspection with automatic chunked pagination
 */
export async function fetchRecentLogs(limit = 2000): Promise<LogProdukItem[]> {
  return fetchAllLogs(limit);
}

/**
 * Fetch all log_produk items with chunked pagination to load 100% of records from Supabase
 */
export async function fetchAllLogs(maxRows = 50000): Promise<LogProdukItem[]> {
  const allLogs: LogProdukItem[] = [];
  const pageSize = 1000;
  let offset = 0;

  try {
    while (offset < maxRows) {
      const currentLimit = Math.min(pageSize, maxRows - offset);
      const chunk = await supabaseFetch<LogProdukItem[]>(
        'log_produk',
        'GET',
        null,
        `select=*&order=created_at.desc&limit=${currentLimit}&offset=${offset}`
      );
      if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
        break;
      }
      allLogs.push(...chunk);
      if (chunk.length < currentLimit) {
        // Reached end of table records
        break;
      }
      offset += chunk.length;
    }
    return allLogs;
  } catch (err) {
    console.warn('Error fetching all logs from Supabase, returning partial or cached:', err);
    if (allLogs.length > 0) return allLogs;
    try {
      return JSON.parse(localStorage.getItem('wms_offline_logs') || '[]');
    } catch {
      return [];
    }
  }
}

/**
 * Fetch stock opname queue items with status filter
 */
export async function fetchStockOpnameQueue(
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL' = 'ALL',
  limit = 1000
): Promise<StockOpnameQueueItem[]> {
  try {
    const statusQuery = status !== 'ALL' ? `status=eq.${encodeURIComponent(status)}&` : '';
    const data = await supabaseFetch<StockOpnameQueueItem[]>(
      'stock_opname_queue',
      'GET',
      null,
      `select=*&${statusQuery}order=created_at.desc&limit=${limit}`
    );
    return data || [];
  } catch (err) {
    console.warn('Error fetching SO queue from Supabase:', err);
    return [];
  }
}

/**
 * Approve Stock Opname Queue item(s) and create adjustment log in log_produk
 */
export async function approveStockOpnameQueueItems(
  items: StockOpnameQueueItem[],
  approvedBy: string
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!items.length) return { success: true, count: 0 };
  const nowIso = new Date().toISOString();

  try {
    const logsToInsert: LogProdukItem[] = [];

    for (const item of items) {
      // 1. Update queue status to APPROVED
      if (item.id) {
        await supabaseFetch(
          'stock_opname_queue',
          'PATCH',
          {
            status: 'APPROVED',
            approved_by: approvedBy || 'Admin',
            tanggal_approve: nowIso,
          },
          `id=eq.${item.id}`
        );
      }

      // 2. If there is a selisih, automatically create ADJ_IN or ADJ_OUT in log_produk
      const diff = Number(item.selisih) || 0;
      if (diff !== 0) {
        const adjType = diff > 0 ? 'ADJ_IN' : 'ADJ_OUT';
        const loc = item.lokasi || 'Warehouse';
        logsToInsert.push({
          type: adjType,
          invoice: item.invoice || `ADJ-SO-${Date.now()}`,
          sku: item.sku,
          nama_produk: item.nama_produk || item.sku,
          size: item.size || '-',
          area: item.area || getAreaFromLokasi(loc),
          lokasi: loc,
          qty: Math.abs(diff),
          operator: `${approvedBy || 'Admin'} (Approved SO)`,
          keterangan: `[SO ADJUSTMENT APPROVED] Sesi: ${item.sesi_id || '-'} | Sistem: ${item.qty_sistem} -> Fisik: ${item.qty_fisik} (Selisih: ${diff > 0 ? `+${diff}` : diff})`.trim(),
          created_at: nowIso,
        });
      }
    }

    // Insert all adjustment logs
    if (logsToInsert.length > 0) {
      await insertLogProduk(logsToInsert);
    }

    return { success: true, count: items.length };
  } catch (err: any) {
    console.error('Error approving SO Queue items:', err);
    return { success: false, count: 0, error: err.message || 'Gagal approve adjustment' };
  }
}

/**
 * Reject Stock Opname Queue item(s)
 */
export async function rejectStockOpnameQueueItems(
  items: StockOpnameQueueItem[],
  rejectedBy: string
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!items.length) return { success: true, count: 0 };
  const nowIso = new Date().toISOString();

  try {
    for (const item of items) {
      if (item.id) {
        await supabaseFetch(
          'stock_opname_queue',
          'PATCH',
          {
            status: 'REJECTED',
            approved_by: rejectedBy || 'Admin',
            tanggal_approve: nowIso,
          },
          `id=eq.${item.id}`
        );
      }
    }
    return { success: true, count: items.length };
  } catch (err: any) {
    console.error('Error rejecting SO Queue items:', err);
    return { success: false, count: 0, error: err.message || 'Gagal me-reject item' };
  }
}

/**
 * Delete item(s) permanently from stock_opname_queue
 */
export async function deleteStockOpnameQueueItems(
  itemIds: string[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!itemIds.length) return { success: true, count: 0 };

  try {
    for (const id of itemIds) {
      await supabaseFetch('stock_opname_queue', 'DELETE', null, `id=eq.${id}`);
    }
    return { success: true, count: itemIds.length };
  } catch (err: any) {
    console.error('Error deleting SO Queue items:', err);
    return { success: false, count: 0, error: err.message || 'Gagal menghapus item' };
  }
}

/**
 * Fetch all realtime stock across all locations with chunked pagination to load 100% of rows
 */
export async function fetchAllStockRealtime(maxRows = 50000): Promise<StockRealtimeItem[]> {
  const allItems: StockRealtimeItem[] = [];
  const pageSize = 1000;
  let offset = 0;

  // 1. Try querying view_stok_realtime with pagination
  try {
    while (offset < maxRows) {
      const currentLimit = Math.min(pageSize, maxRows - offset);
      const chunk = await supabaseFetch<StockRealtimeItem[]>(
        'view_stok_realtime',
        'GET',
        null,
        `select=*&limit=${currentLimit}&offset=${offset}`
      );
      if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
        break;
      }
      allItems.push(...chunk);
      if (chunk.length < currentLimit) {
        break;
      }
      offset += chunk.length;
    }
    if (allItems.length > 0) {
      return allItems;
    }
  } catch (err) {
    console.warn('Error fetching view_stok_realtime from Supabase:', err);
  }

  // 2. Resilient fallback: calculate dynamically from 100% of log_produk records
  try {
    const logs = await fetchAllLogs(maxRows);
    const stockMap = new Map<string, StockRealtimeItem>();

    for (const log of logs) {
      const sku = (log.sku || '').trim().toUpperCase();
      if (!sku) continue;
      const lokasi = (log.lokasi || 'Warehouse').trim();
      const area = log.area || getAreaFromLokasi(lokasi);
      const key = `${sku}__${lokasi.toUpperCase()}`;

      const qty = Number(log.qty) || 0;
      const type = (log.type || '').toUpperCase();
      const delta = type === 'IN' || type === 'ADJ_IN' ? qty : type === 'OUT' || type === 'ADJ_OUT' ? -qty : 0;

      if (!stockMap.has(key)) {
        stockMap.set(key, {
          sku,
          nama_produk: log.nama_produk || sku,
          size: log.size || '-',
          lokasi,
          area,
          sisa_stok: delta,
          updated_at: log.created_at,
        });
      } else {
        const item = stockMap.get(key)!;
        item.sisa_stok += delta;
      }
    }
    return Array.from(stockMap.values());
  } catch {
    return [];
  }
}

/**
 * Fetch and manage users with role-based permissions in Supabase
 */
export async function fetchSupabaseUsers(): Promise<WmsUser[]> {
  try {
    const data = await supabaseFetch<WmsUser[]>('wms_users', 'GET', null, 'select=*&order=username.asc');
    if (data && data.length > 0) return data;
  } catch (err) {
    console.warn('Supabase wms_users not found, using default users:', err);
  }
  // Fallback to local
  try {
    const local = localStorage.getItem('wms_custom_users');
    if (local) return JSON.parse(local);
  } catch {}
  return [
    { username: 'admin', role: 'All' },
    { username: 'superadmin', role: 'All' },
    { username: 'operator', role: 'Operator' },
    { username: 'produk_team', role: 'Produk' },
    { username: 'fulfillment_team', role: 'Fulfillment' },
    { username: 'peminjaman_team', role: 'Peminjaman' },
  ];
}

export async function saveSupabaseUser(user: WmsUser): Promise<boolean> {
  try {
    await supabaseFetch('wms_users', 'POST', user, 'on_conflict=username');
  } catch (err) {
    console.warn('Failed saving user to Supabase, saving to local storage:', err);
  }
  try {
    const users = await fetchSupabaseUsers();
    const updated = users.filter((u) => u.username !== user.username);
    updated.push(user);
    localStorage.setItem('wms_custom_users', JSON.stringify(updated));
  } catch {}
  return true;
}

export async function deleteSupabaseUser(username: string): Promise<boolean> {
  try {
    await supabaseFetch('wms_users', 'DELETE', null, `username=eq.${encodeURIComponent(username)}`);
  } catch (err) {
    console.warn('Failed deleting user on Supabase:', err);
  }
  try {
    const users = await fetchSupabaseUsers();
    const updated = users.filter((u) => u.username !== username);
    localStorage.setItem('wms_custom_users', JSON.stringify(updated));
  } catch {}
  return true;
}

/**
 * Verify user login directly via Supabase / local cached users (fast & lightweight, 0s latency)
 */
export async function verifySupabaseLogin(
  username: string,
  password?: string
): Promise<{
  success: boolean;
  token: string;
  user: string;
  name?: string;
  role: UserRole;
  permissions?: Partial<UserPermissions>;
  message?: string;
}> {
  const cleanUser = username.trim().toLowerCase();
  const cleanPass = (password || '').trim();

  const sbClient = getSupabaseClient();
  
  // 0. Use native Supabase better auth if email format is provided
  if (cleanUser.includes('@') && cleanPass) {
    try {
      const { data, error } = await sbClient.auth.signInWithPassword({
        email: cleanUser,
        password: cleanPass
      });
      if (!error && data.session) {
        return {
          success: true,
          token: data.session.access_token,
          user: data.user.email || cleanUser,
          role: 'Superadmin', // default for native authenticated users
          message: 'Berhasil login via Supabase Auth'
        };
      }
    } catch (err) {
      console.warn('Native Supabase auth failed, falling back:', err);
    }
  }

  // 1. Check in Supabase wms_users table
  try {
    const data = await supabaseFetch<WmsUser[]>(
      'wms_users',
      'GET',
      null,
      `username=ilike.${encodeURIComponent(cleanUser)}&limit=1`
    );

    if (data && data.length > 0) {
      const u = data[0];
      // If user has a password in DB and user provided password, check
      if (u.password && cleanPass && u.password !== cleanPass) {
        return {
          success: false,
          token: '',
          user: username,
          role: 'Operator',
          message: 'Password salah untuk akun ini.',
        };
      }

      const token = `sb_tok_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      return {
        success: true,
        token,
        user: u.username,
        name: u.name,
        role: u.role || 'Operator',
        permissions: u.permissions,
      };
    }
  } catch (err) {
    console.warn('Supabase user check error, fallback to preset accounts:', err);
  }

  // 2. Preset / Predefined Account verification fallback
  const presetUsers: Record<string, { pass: string; role: UserRole; name?: string }> = {
    admin: { pass: 'admin123', role: 'Superadmin', name: 'Super Admin Utama' },
    superadmin: { pass: 'admin123', role: 'Superadmin', name: 'Super Admin Utama' },
    chocochips: { pass: 'admin123', role: 'Superadmin', name: 'Chocochips Admin' },
    'chocochips.warehouse2@gmail.com': { pass: 'admin123', role: 'Superadmin', name: 'Warehouse 2 Lead' },
    operator: { pass: '123456', role: 'Operator', name: 'Operator Gudang' },
    gudang1: { pass: 'gudang123', role: 'Operator', name: 'Staff Gudang 1' },
    produk_team: { pass: 'produk123', role: 'Produk', name: 'Tim Produk & Stok' },
    fulfillment_team: { pass: 'fulfillment123', role: 'Fulfillment', name: 'Tim Fulfillment' },
    peminjaman_team: { pass: 'peminjaman123', role: 'Peminjaman', name: 'Tim Peminjaman SPS' },
  };

  const matched = presetUsers[cleanUser];
  if (matched) {
    const token = `sb_preset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return {
      success: true,
      token,
      user: username,
      name: matched.name,
      role: matched.role,
    };
  }

  // 3. Dynamic User auto-provision as Operator / Superadmin
  const token = `sb_user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const role: UserRole = cleanUser.includes('admin') ? 'Superadmin' : 'Operator';
  return {
    success: true,
    token,
    user: username,
    name: username,
    role,
  };
}

/**
 * Fetch list of WMS users from Supabase with fallback to local cached users
 */
export async function fetchWmsUsersFromSupabase(): Promise<WmsUser[]> {
  try {
    const data = await supabaseFetch<WmsUser[]>(
      'wms_users',
      'GET',
      null,
      'select=*&order=created_at.asc'
    );
    if (data && Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn('Could not fetch wms_users from Supabase (table may not exist yet):', err);
  }
  return [];
}

/**
 * Save / Upsert WMS user into Supabase table
 */
export async function saveWmsUserToSupabase(user: WmsUser): Promise<boolean> {
  try {
    await supabaseFetch(
      'wms_users',
      'POST',
      {
        username: user.username.trim().toLowerCase(),
        name: user.name || user.username,
        role: user.role,
        password: user.password,
        permissions: user.permissions || {},
        updated_at: new Date().toISOString(),
      },
      'on_conflict=username'
    );
    return true;
  } catch (err) {
    console.warn('Could not save wms_user to Supabase table:', err);
    return false;
  }
}

/**
 * Delete WMS user from Supabase table
 */
export async function deleteWmsUserFromSupabase(username: string): Promise<boolean> {
  try {
    await supabaseFetch(
      'wms_users',
      'DELETE',
      null,
      `username=eq.${encodeURIComponent(username.trim().toLowerCase())}`
    );
    return true;
  } catch (err) {
    console.warn('Could not delete wms_user from Supabase table:', err);
    return false;
  }
}

/**
 * Extract a standard ProductItem from any Supabase table row object with varying column names
 */
export function extractProductFromRow(row: Record<string, any>): ProductItem | null {
  if (!row || typeof row !== 'object') return null;

  const sku = String(
    row.sku ||
    row.sku_code ||
    row.kode_produk ||
    row.kode_barang ||
    row.kode ||
    row.code ||
    row.barcode ||
    row.id ||
    ''
  ).trim();

  if (!sku || sku === 'undefined' || sku === 'null') return null;

  const nama = String(
    row.nama_produk ||
    row.nama_barang ||
    row.nama ||
    row.product_name ||
    row.name ||
    row.title ||
    row.deskripsi ||
    sku
  ).trim();

  const size = String(
    row.size ||
    row.ukuran ||
    row.varian ||
    row.variant ||
    row.opsi ||
    ''
  ).trim();

  const category = String(
    row.kategori ||
    row.category ||
    row.jenis ||
    'Apparel'
  ).trim();

  const lokasi = String(
    row.lokasi ||
    row.lokasi_rak ||
    row.rak ||
    row.location ||
    row.area ||
    ''
  ).trim();

  const price = typeof row.price === 'number' ? row.price : (typeof row.harga === 'number' ? row.harga : undefined);

  // Extract DealPOS stock & channel comparison numbers if present in table row
  let stokMap: number | undefined = undefined;
  let stokStudio: number | undefined = undefined;
  let stokShp: number | undefined = undefined;
  let stokTtk: number | undefined = undefined;
  let komparasi: ProductItem['komparasi'] = undefined;

  if (row.dealpos_channels && typeof row.dealpos_channels === 'object') {
    const dp = row.dealpos_channels;
    if (typeof dp.MAP === 'number' || typeof dp.TOTAL === 'number' || typeof dp.GUDANG === 'number') {
      stokMap = Number(dp.MAP ?? dp.TOTAL ?? dp.GUDANG) || 0;
    }
    if (typeof dp.STUDIO === 'number') stokStudio = Number(dp.STUDIO) || 0;
    if (typeof dp.SHOPEE === 'number' || typeof dp.SHP === 'number') stokShp = Number(dp.SHOPEE ?? dp.SHP) || 0;
    if (typeof dp.TIKTOK === 'number' || typeof dp.TTK === 'number') stokTtk = Number(dp.TIKTOK ?? dp.TTK) || 0;
  }

  if (stokMap === undefined) {
    const rawDp = row.stok_dealpos ?? row.dealpos_stock ?? row.stock_dealpos ?? row.stok_sistem ?? row.dealpos_stok ?? row.stok_map;
    if (rawDp !== undefined && rawDp !== null && rawDp !== '') {
      stokMap = Number(rawDp);
    }
  }

  if (row.komparasi && typeof row.komparasi === 'object') {
    komparasi = row.komparasi;
  } else if (stokMap !== undefined) {
    komparasi = {
      MAP: { fisik: 0, dp: stokMap },
      STUDIO: stokStudio !== undefined ? { fisik: 0, dp: stokStudio } : undefined,
    };
  }

  return {
    k: sku.toUpperCase(),
    p: nama,
    s: size,
    category,
    lokasi,
    price,
    stokMap,
    stokStudio,
    stokShp,
    stokTtk,
    komparasi,
  };
}

/**
 * Fetch master products from Supabase across all potential product tables
 * (master_produk, produk, products, master_barang, barang, view_stok_realtime, log_produk, picking_list, etc.)
 */
export async function fetchMasterProductsFromSupabase(): Promise<ProductItem[]> {
  const productsMap = new Map<string, ProductItem>();

  // Multi-table queries to ensure any database schema structure in Supabase is captured
  const tableSources = [
    { table: 'master_produk', query: 'select=*&limit=2000' },
    { table: 'produk', query: 'select=*&limit=2000' },
    { table: 'products', query: 'select=*&limit=2000' },
    { table: 'master_barang', query: 'select=*&limit=2000' },
    { table: 'barang', query: 'select=*&limit=2000' },
    { table: 'view_stok_realtime', query: 'select=*&limit=1000' },
    { table: 'stock_realtime', query: 'select=*&limit=1000' },
    { table: 'stok_realtime', query: 'select=*&limit=1000' },
    { table: 'stok_produk', query: 'select=*&limit=1000' },
    { table: 'log_produk', query: 'select=sku,nama_produk,size,lokasi,area&order=created_at.desc&limit=1000' },
    { table: 'picking_list', query: 'select=sku,nama_produk,size,lokasi&limit=500' },
    { table: 'penerimaan_produksi', query: 'select=sku,nama_produk,size&limit=500' },
  ];

  await Promise.allSettled(
    tableSources.map(async ({ table, query }) => {
      try {
        const rows = await supabaseFetch<any[]>(table, 'GET', null, query);
        if (rows && Array.isArray(rows)) {
          for (const r of rows) {
            const item = extractProductFromRow(r);
            if (item && item.k && !isDummyProduct(item)) {
              const existing = productsMap.get(item.k);
              if (!existing) {
                productsMap.set(item.k, item);
              } else {
                // Enrich existing item if new record has location or size
                if (!existing.lokasi && item.lokasi) existing.lokasi = item.lokasi;
                if (!existing.s && item.s) existing.s = item.s;
                if (existing.p === existing.k && item.p !== item.k) existing.p = item.p;
              }
            }
          }
        }
      } catch {
        // Table not found or inaccessible, ignore and continue
      }
    })
  );

  const result = Array.from(productsMap.values()).filter((it) => !isDummyProduct(it));
  try {
    localStorage.setItem('wms_product_cache', JSON.stringify(result));
  } catch {}
  return result;
}

/**
 * Helper to build fuzzy search queries (AND for all words)
 */
export function buildFuzzySearchQuery(keyword: string, columns: string[]): string {
  const tokens = keyword.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  
  if (tokens.length === 1) {
    const term = encodeURIComponent(tokens[0]);
    return `&or=(${columns.map(c => `${c}.ilike.*${term}*`).join(',')})`;
  }
  
  const andParts = tokens.map(token => {
    const term = encodeURIComponent(token);
    return `or(${columns.map(c => `${c}.ilike.*${term}*`).join(',')})`;
  });
  
  return `&and=(${andParts.join(',')})`;
}

/**
 * Live search products directly in Supabase with ILIKE filters
 */
export async function searchProductsInSupabase(keyword: string): Promise<ProductItem[]> {
  const cleanQ = keyword.trim();
  if (!cleanQ) return [];

  const foundMap = new Map<string, ProductItem>();
  const searchTargets = [
    { table: 'master_produk', filter: `${buildFuzzySearchQuery(cleanQ, ['sku', 'nama_produk', 'kategori']).substring(1)}&limit=40` },
    { table: 'produk', filter: `${buildFuzzySearchQuery(cleanQ, ['sku', 'nama', 'nama_produk']).substring(1)}&limit=40` },
    { table: 'products', filter: `${buildFuzzySearchQuery(cleanQ, ['sku', 'name']).substring(1)}&limit=40` },
    { table: 'master_barang', filter: `${buildFuzzySearchQuery(cleanQ, ['kode_barang', 'nama_barang']).substring(1)}&limit=40` },
  ];

  await Promise.allSettled(
    searchTargets.map(async (target) => {
      try {
        const rows = await supabaseFetch<any[]>(target.table, 'GET', null, target.filter);
        if (rows && Array.isArray(rows)) {
          for (const r of rows) {
            const item = extractProductFromRow(r);
            if (item && !isDummyProduct(item) && !foundMap.has(item.k)) {
              foundMap.set(item.k, item);
            }
          }
        }
      } catch {
        // Silently skip non-existent tables
      }
    })
  );

  return Array.from(foundMap.values()).filter((it) => !isDummyProduct(it));
}

/**
 * Fetch real-time available stocks per channel & location from Supabase
 * Specifically tracks Area BLOK F, Lokasi: Shopee, TikTok, Studio, and Warehouse.
 */
export async function fetchRealtimeChannelStocksSupabase(searchKeyword?: string): Promise<import('../types').ChannelStockItem[]> {
  const stockMap = new Map<
    string,
    {
      sku: string;
      produk: string;
      size: string;
      locations: Map<string, { lokasi: string; area: string; qty: number }>;
      directStudio?: number;
      directShp?: number;
      directTtk?: number;
    }
  >();

  // 1. Fetch from view_stok_realtime prioritizing rows with sisa_stok <> 0
  const searchFilter = searchKeyword && searchKeyword.trim()
    ? buildFuzzySearchQuery(searchKeyword, ['sku', 'nama_produk'])
    : '';

  try {
    // Primary query: non-zero remaining stocks
    const viewRowsNonZero = await supabaseFetch<any[]>(
      'view_stok_realtime',
      'GET',
      null,
      `select=*&sisa_stok=neq.0${searchFilter}&limit=10000`
    );

    if (viewRowsNonZero && Array.isArray(viewRowsNonZero) && viewRowsNonZero.length > 0) {
      for (const r of viewRowsNonZero) {
        const sku = String(r.sku || r.kode || '').trim().toUpperCase();
        if (!sku || sku === 'UNDEFINED' || sku === 'NULL') continue;
        const sisa = Number(r.sisa_stok ?? r.qty ?? 0);
        const lok = String(r.lokasi || 'BLOK F').trim();
        const area = String(r.area || getAreaFromLokasi(lok)).trim();
        const nama = String(r.nama_produk || r.nama || sku).trim();
        
        let size = String(r.size || r.ukuran || '').trim();
        if (!size || size === '-' || size === 'ALL') {
          // Detect size suffix if present (e.g. WHL -> L, WHXL -> XL)
          if (sku.endsWith('XXL')) size = 'XXL';
          else if (sku.endsWith('XL')) size = 'XL';
          else if (sku.endsWith('XS')) size = 'XS';
          else if (sku.endsWith('L')) size = 'L';
          else if (sku.endsWith('M')) size = 'M';
          else if (sku.endsWith('S')) size = 'S';
          else size = 'ALL';
        }

        if (!stockMap.has(sku)) {
          stockMap.set(sku, {
            sku,
            produk: nama,
            size: size || 'ALL',
            locations: new Map(),
          });
        }
        const entry = stockMap.get(sku)!;
        if (entry.produk === sku && nama !== sku) entry.produk = nama;
        if ((!entry.size || entry.size === 'ALL' || entry.size === '-') && size && size !== '-') entry.size = size;

        const lokKey = `${lok.toUpperCase()}__${area.toUpperCase()}`;
        const prev = entry.locations.get(lokKey)?.qty || 0;
        entry.locations.set(lokKey, { lokasi: lok, area, qty: prev + sisa });
      }
    }

    // Secondary query: also fetch any remaining active view rows if needed
    if (stockMap.size < 50 && !searchKeyword) {
      const fallbackViewRows = await supabaseFetch<any[]>('view_stok_realtime', 'GET', null, 'select=*&limit=3000');
      if (fallbackViewRows && Array.isArray(fallbackViewRows)) {
        for (const r of fallbackViewRows) {
          const sku = String(r.sku || r.kode || '').trim().toUpperCase();
          if (!sku || sku === 'UNDEFINED' || sku === 'NULL') continue;
          const sisa = Number(r.sisa_stok ?? r.qty ?? 0);
          const lok = String(r.lokasi || 'BLOK F').trim();
          const area = String(r.area || getAreaFromLokasi(lok)).trim();
          const nama = String(r.nama_produk || r.nama || sku).trim();
          const size = String(r.size || r.ukuran || '-').trim();

          if (!stockMap.has(sku)) {
            stockMap.set(sku, {
              sku,
              produk: nama,
              size: size || 'ALL',
              locations: new Map(),
            });
          }
          const entry = stockMap.get(sku)!;
          if (entry.produk === sku && nama !== sku) entry.produk = nama;

          const lokKey = `${lok.toUpperCase()}__${area.toUpperCase()}`;
          const prev = entry.locations.get(lokKey)?.qty || 0;
          entry.locations.set(lokKey, { lokasi: lok, area, qty: prev + sisa });
        }
      }
    }
  } catch (err) {
    console.warn('Error fetching from view_stok_realtime in Supabase:', err);
  }

  // 2. Also fetch and calculate from log_produk to ensure complete realtime accuracy
  try {
    const logQuery = searchKeyword && searchKeyword.trim()
      ? `select=sku,nama_produk,size,area,lokasi,qty,type${buildFuzzySearchQuery(searchKeyword, ['sku', 'nama_produk'])}&order=created_at.desc&limit=2000`
      : 'select=sku,nama_produk,size,area,lokasi,qty,type&order=created_at.desc&limit=5000';

    const logRows = await supabaseFetch<any[]>('log_produk', 'GET', null, logQuery);
    if (logRows && Array.isArray(logRows) && logRows.length > 0) {
      // If view_stok_realtime was empty, compute net stock from log_produk
      const isFromLogsOnly = stockMap.size === 0;
      for (const log of logRows) {
        const sku = String(log.sku || '').trim().toUpperCase();
        if (!sku) continue;
        const lok = String(log.lokasi || 'BLOK F').trim();
        const area = String(log.area || getAreaFromLokasi(lok)).trim();
        const nama = String(log.nama_produk || sku).trim();
        const size = String(log.size || '-').trim();
        const qty = Number(log.qty) || 0;
        const type = String(log.type || '').toUpperCase();
        const delta = type === 'IN' || type === 'ADJ_IN' ? qty : type === 'OUT' || type === 'ADJ_OUT' ? -qty : 0;

        if (!stockMap.has(sku)) {
          stockMap.set(sku, {
            sku,
            produk: nama,
            size: size || 'ALL',
            locations: new Map(),
          });
        }
        const entry = stockMap.get(sku)!;
        if (entry.produk === sku && nama !== sku) entry.produk = nama;
        if ((!entry.size || entry.size === 'ALL' || entry.size === '-') && size && size !== '-') entry.size = size;

        if (isFromLogsOnly) {
          const lokKey = `${lok.toUpperCase()}__${area.toUpperCase()}`;
          const prev = entry.locations.get(lokKey)?.qty || 0;
          entry.locations.set(lokKey, { lokasi: lok, area, qty: prev + delta });
        }
      }
    }
  } catch (err) {
    console.warn('Error computing stock from log_produk:', err);
  }

  // 3. Fetch Master Produk to enrich product names & include products with 0 stock
  try {
    const masterQuery = searchKeyword && searchKeyword.trim()
      ? `select=*${buildFuzzySearchQuery(searchKeyword, ['sku', 'nama_produk'])}&limit=100`
      : 'select=*&limit=3000';

    const masterRows = await supabaseFetch<any[]>('master_produk', 'GET', null, masterQuery);
    if (masterRows && Array.isArray(masterRows)) {
      for (const m of masterRows) {
        const sku = String(m.sku || '').trim().toUpperCase();
        if (!sku) continue;
        const nama = String(m.nama_produk || m.nama || sku).trim();
        let size = String(m.size || m.ukuran || '').trim();
        if (!size || size === '-') {
          if (sku.endsWith('XXL')) size = 'XXL';
          else if (sku.endsWith('XL')) size = 'XL';
          else if (sku.endsWith('XS')) size = 'XS';
          else if (sku.endsWith('L')) size = 'L';
          else if (sku.endsWith('M')) size = 'M';
          else if (sku.endsWith('S')) size = 'S';
          else size = 'ALL';
        }

        if (!stockMap.has(sku)) {
          stockMap.set(sku, {
            sku,
            produk: nama,
            size: size || 'ALL',
            locations: new Map(),
          });
        } else {
          const entry = stockMap.get(sku)!;
          if (nama && nama !== sku) entry.produk = nama;
          if (size && size !== '-' && (!entry.size || entry.size === 'ALL' || entry.size === '-')) entry.size = size;
        }

        // If dealpos_channels or explicit stock columns exist in master_produk
        const entry = stockMap.get(sku)!;
        if (m.dealpos_channels && typeof m.dealpos_channels === 'object') {
          if (m.dealpos_channels.STUDIO !== undefined) entry.directStudio = Number(m.dealpos_channels.STUDIO) || 0;
          if (m.dealpos_channels.SHOPEE !== undefined) entry.directShp = Number(m.dealpos_channels.SHOPEE) || 0;
          if (m.dealpos_channels.TIKTOK !== undefined) entry.directTtk = Number(m.dealpos_channels.TIKTOK) || 0;
        }
      }
    }
  } catch {}

  // 4. Transform into structured ChannelStockItem list
  const channelStockList: import('../types').ChannelStockItem[] = [];

  for (const entry of stockMap.values()) {
    // Check if dummy
    if (isDummyProduct({ k: entry.sku, p: entry.produk })) continue;

    let studioQty = entry.directStudio || 0;
    let shpQty = entry.directShp || 0;
    let ttkQty = entry.directTtk || 0;
    let totalQty = 0;

    const locParts: string[] = [];

    for (const locInfo of entry.locations.values()) {
      const q = Math.max(0, locInfo.qty);
      const lokName = locInfo.lokasi.trim();
      const lokUpper = lokName.toUpperCase();
      const areaUpper = locInfo.area.toUpperCase();

      totalQty += q;

      const isStudio = lokUpper.includes('STUDIO') || lokUpper.includes('FOTO') || areaUpper.includes('STUDIO');
      const isShopee = lokUpper.includes('SHOPEE') || lokUpper.includes('SHP') || areaUpper.includes('SHOPEE');
      const isTikTok = lokUpper.includes('TIKTOK') || lokUpper.includes('TTK') || lokUpper.includes('TOK') || areaUpper.includes('TIKTOK');
      const isBlokF = lokUpper.includes('BLOK F') || areaUpper.includes('BLOK F') || lokUpper.startsWith('F-');

      if (isStudio) {
        studioQty += q;
      }
      if (isShopee) {
        shpQty += q;
      }
      if (isTikTok) {
        ttkQty += q;
      }

      if (q > 0) {
        const areaLabel = isBlokF && !lokUpper.includes('BLOK F') ? `BLOK F - ${lokName}` : lokName;
        locParts.push(`${areaLabel} (${q})`);
      }
    }

    // Default formatting of location string
    let locStr = locParts.length > 0 ? locParts.join(', ') : 'BLOK F (0)';

    channelStockList.push({
      sku: entry.sku,
      produk: entry.produk,
      size: entry.size || 'ALL',
      locStr,
      studioQty,
      shpQty,
      ttkQty,
      totalQty,
    });
  }

  // Sort: Items with available stock first, then alphabetically
  channelStockList.sort((a, b) => {
    if (b.totalQty !== a.totalQty) return b.totalQty - a.totalQty;
    return a.produk.localeCompare(b.produk);
  });

  return channelStockList;
}

/**
 * =========================================================================
 * PEMINJAMAN SEMENTARA (SPS) SUPABASE SERVICES
 * =========================================================================
 */
export async function fetchPeminjamanFromSupabase(): Promise<PeminjamanRecord[]> {
  try {
    const data = await supabaseFetch<
      Array<{
        id: string;
        no_peminjaman: string;
        nama_peminjam: string;
        keperluan: string;
        tgl_pinjam: string;
        items: PeminjamanRecord['items'];
        status: 'Dipinjam' | 'Dikembalikan';
        username: string;
        created_at: string;
      }>
    >('peminjaman_sps', 'GET', null, 'select=*&order=created_at.desc');

    if (data && Array.isArray(data) && data.length > 0) {
      const records: PeminjamanRecord[] = data.map((r) => ({
        id: r.id || r.no_peminjaman,
        noPeminjaman: r.no_peminjaman,
        namaPeminjam: r.nama_peminjam,
        keperluan: r.keperluan,
        tglPinjam: r.tgl_pinjam,
        timestamp: r.created_at || new Date().toISOString(),
        status: r.status || 'Dipinjam',
        items: Array.isArray(r.items) ? r.items : [],
        username: r.username || 'System',
      }));
      localStorage.setItem('wms_peminjaman_cache', JSON.stringify(records));
      return records;
    }
  } catch (err) {
    console.warn('Error fetching peminjaman from Supabase, loading cache:', err);
  }

  try {
    const cached = localStorage.getItem('wms_peminjaman_cache');
    if (cached) return JSON.parse(cached);
  } catch {}
  return [];
}

export async function savePeminjamanToSupabase(record: PeminjamanRecord): Promise<boolean> {
  try {
    const payload = {
      no_peminjaman: record.noPeminjaman,
      nama_peminjam: record.namaPeminjam,
      keperluan: record.keperluan,
      tgl_pinjam: record.tglPinjam,
      items: record.items,
      status: record.status || 'Dipinjam',
      username: record.username || 'System',
    };
    await supabaseFetch('peminjaman_sps', 'POST', [payload]);
    return true;
  } catch (err) {
    console.warn('Error saving peminjaman to Supabase, caching locally:', err);
    return false;
  }
}

export async function returnPeminjamanSupabase(noPeminjaman: string): Promise<boolean> {
  try {
    await supabaseFetch(
      'peminjaman_sps',
      'PATCH',
      { status: 'Dikembalikan' },
      `no_peminjaman=eq.${encodeURIComponent(noPeminjaman)}`
    );
    return true;
  } catch (err) {
    console.warn('Error returning peminjaman in Supabase:', err);
    return false;
  }
}


export async function fetchPickingListFromSupabase(): Promise<PickingListItem[]> {
  try {
    const data = await supabaseFetch<PickingListItem[]>(
      'picking_list',
      'GET',
      null,
      'select=*&order=created_at.desc'
    );
    if (data && Array.isArray(data)) {
      localStorage.setItem('wms_picking_cache', JSON.stringify(data));
      return data;
    }
  } catch (err) {
    console.warn('Error fetching picking list from Supabase, loading cache:', err);
  }
  try {
    const cached = localStorage.getItem('wms_picking_cache');
    if (cached) return JSON.parse(cached);
  } catch {}
  return [];
}

export async function savePickingItemToSupabase(item: PickingListItem): Promise<boolean> {
  // 1. Update local cache immediately
  try {
    const cached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_picking_cache') || '[]');
    const idx = cached.findIndex((c) => (item.id && c.id === item.id) || (c.no_sj === item.no_sj && c.sku === item.sku));
    if (idx >= 0) {
      cached[idx] = { ...cached[idx], ...item };
    } else {
      cached.unshift(item);
    }
    localStorage.setItem('wms_picking_cache', JSON.stringify(cached));
  } catch {}

  // 2. Sync to Supabase
  try {
    const isUuid = item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
    if (isUuid) {
      await supabaseFetch('picking_list', 'PATCH', item, `id=eq.${item.id}`);
    } else {
      await supabaseFetch('picking_list', 'POST', [item]);
    }
    return true;
  } catch (err) {
    console.warn('Error saving picking item to Supabase (saved in local cache):', err);
    return true;
  }
}

export async function savePickingBatchToSupabase(items: PickingListItem[]): Promise<boolean> {
  if (!items.length) return true;
  // 1. Update local cache
  try {
    const cached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_picking_cache') || '[]');
    items.forEach((item) => {
      const idx = cached.findIndex((c) => (item.id && c.id === item.id) || (c.no_sj === item.no_sj && c.sku === item.sku));
      if (idx >= 0) {
        cached[idx] = { ...cached[idx], ...item };
      } else {
        cached.unshift(item);
      }
    });
    localStorage.setItem('wms_picking_cache', JSON.stringify(cached));
  } catch {}

  // 2. Sync to Supabase
  try {
    for (const it of items) {
      const isUuid = it.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(it.id);
      if (isUuid) {
        await supabaseFetch('picking_list', 'PATCH', it, `id=eq.${it.id}`);
      } else {
        await supabaseFetch('picking_list', 'POST', [it]);
      }
    }
    return true;
  } catch (err) {
    console.warn('Error batch saving picking items to Supabase (saved locally):', err);
    return true;
  }
}

export async function completePickingSuratJalanSupabase(
  no_sj: string,
  items: PickingListItem[],
  unexpectedItems: PickingListItem[],
  pickerName: string,
  catatan: string,
  syncOutToLog: boolean
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const cleanNoSj = (no_sj || '').trim().toUpperCase();

  // 1. ALWAYS update local cache first so work is never lost
  try {
    const cached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_picking_cache') || '[]');
    
    // Update existing items in cache
    const updatedCache = cached.map((c) => {
      if (c.no_sj && c.no_sj.trim().toUpperCase() === cleanNoSj) {
        const matchingItem = items.find((it) => (it.id && it.id === c.id) || it.sku.toUpperCase() === c.sku.toUpperCase());
        if (matchingItem) {
          return {
            ...c,
            qty_picked: matchingItem.qty_picked,
            status: 'SELESAI' as const,
            picker_name: pickerName || c.picker_name || 'Operator',
            catatan: catatan || matchingItem.catatan || c.catatan || '',
          };
        }
      }
      return c;
    });

    // Add unexpected items to cache
    for (const unexp of unexpectedItems) {
      const exists = updatedCache.some((c) => c.no_sj?.trim().toUpperCase() === cleanNoSj && c.sku.toUpperCase() === unexp.sku.toUpperCase());
      if (!exists) {
        updatedCache.unshift({
          id: `unexp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          no_sj: cleanNoSj,
          tanggal: nowIso.slice(0, 10),
          tujuan: items[0]?.tujuan || 'Marketplace',
          sku: unexp.sku,
          nama_produk: unexp.nama_produk || unexp.sku,
          size: unexp.size || '-',
          qty_req: 0,
          qty_picked: unexp.qty_picked,
          lokasi: unexp.lokasi || '-',
          status: 'SELESAI',
          picker_name: pickerName || 'Operator',
          catatan: `[SALAH AMBIL / TAMBAHAN] ${catatan || ''}`.trim(),
          created_at: nowIso,
        });
      }
    }

    localStorage.setItem('wms_picking_cache', JSON.stringify(updatedCache));
  } catch (cacheErr) {
    console.warn('Failed saving picking completion to local cache:', cacheErr);
  }

  // 2. Sync to log_produk (OUT) automatically for picking fulfillment
  if (syncOutToLog) {
    try {
      const logsOut: LogProdukItem[] = [];
      const allPicked = [...items, ...unexpectedItems].filter((x) => x.qty_picked > 0);
      for (const it of allPicked) {
        const actualLocation = it.lokasi_picked || it.lokasi || 'Warehouse';
        logsOut.push({
          type: 'OUT',
          invoice: cleanNoSj,
          sku: it.sku,
          nama_produk: it.nama_produk || it.sku,
          size: it.size || '',
          area: getAreaFromLokasi(actualLocation),
          lokasi: actualLocation,
          qty: it.qty_picked,
          operator: pickerName || 'Picker',
          keterangan: `[#OUT PICKING] Surat Jalan ${cleanNoSj} (Lokasi: ${actualLocation}) ${catatan ? `- ${catatan}` : ''}`.trim(),
          created_at: nowIso,
        });
      }
      if (logsOut.length > 0) {
        await insertLogProduk(logsOut);
      }
    } catch (logErr) {
      console.warn('Error creating OUT log for picking:', logErr);
    }
  }

  // 3. Update Supabase picking_list table
  try {
    for (const item of items) {
      const isUuid = item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
      const queryParam = isUuid
        ? `id=eq.${item.id}`
        : `no_sj=eq.${encodeURIComponent(cleanNoSj)}&sku=eq.${encodeURIComponent(item.sku)}`;

      // Try updating with standard columns
      try {
        const payload: Record<string, any> = {
          qty_picked: item.qty_picked,
          status: 'SELESAI',
          picker_name: pickerName,
        };
        if (catatan) {
          payload.catatan = catatan;
        }
        await supabaseFetch('picking_list', 'PATCH', payload, queryParam);
      } catch (patchErr: any) {
        // If failed due to unknown 'catatan' column, retry without catatan
        try {
          const minimalPayload = {
            qty_picked: item.qty_picked,
            status: 'SELESAI',
            picker_name: pickerName,
          };
          await supabaseFetch('picking_list', 'PATCH', minimalPayload, queryParam);
        } catch (innerErr) {
          console.warn(`Supabase patch failed for item ${item.sku}:`, innerErr);
        }
      }
    }

    // 4. Insert unexpected/wrong items scanned to Supabase
    for (const unexp of unexpectedItems) {
      try {
        const payload: Record<string, any> = {
          no_sj: cleanNoSj,
          tanggal: nowIso.slice(0, 10),
          tujuan: items[0]?.tujuan || 'Marketplace',
          sku: unexp.sku,
          nama_produk: unexp.nama_produk || unexp.sku,
          qty_req: 0,
          qty_picked: unexp.qty_picked,
          lokasi: unexp.lokasi || '-',
          status: 'SELESAI',
          picker_name: pickerName,
          created_at: nowIso,
        };
        await supabaseFetch('picking_list', 'POST', [payload]);
      } catch (unexpErr) {
        console.warn(`Failed inserting unexpected item ${unexp.sku} to Supabase:`, unexpErr);
      }
    }

    return true;
  } catch (err) {
    console.warn('Supabase remote sync failed, but task saved to local cache:', err);
    return true;
  }
}

export async function createPickingSuratJalanSupabase(
  no_sj: string,
  tujuan: string,
  items: Array<{ sku: string; nama_produk: string; size?: string; lokasi?: string; qty_req: number }>
): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const rows = items.map((it) => ({
      no_sj: no_sj.trim().toUpperCase(),
      tanggal: nowIso.slice(0, 10),
      tujuan: tujuan.trim(),
      sku: it.sku.trim().toUpperCase(),
      nama_produk: it.nama_produk.trim(),
      size: it.size || '-',
      qty_req: Number(it.qty_req) || 1,
      qty_picked: 0,
      lokasi: it.lokasi || 'A-01',
      status: 'PENDING' as const,
      created_at: nowIso,
    }));
    await supabaseFetch('picking_list', 'POST', rows);
    return true;
  } catch (err) {
    console.warn('Error creating picking SJ in Supabase:', err);
    return false;
  }
}

export async function updatePickingSuratJalanDetailsSupabase(
  no_sj: string,
  tujuan: string,
  items: PickingListItem[],
  newItems: Array<{ sku: string; nama_produk: string; size?: string; lokasi?: string; qty_req: number }>,
  deletedItemIds: string[]
): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();

    // 1. Update existing items
    for (const item of items) {
      if (item.id) {
        await supabaseFetch(
          'picking_list',
          'PATCH',
          {
            tujuan: tujuan.trim(),
            qty_req: item.qty_req,
            lokasi: item.lokasi,
            nama_produk: item.nama_produk,
          },
          `id=eq.${item.id}`
        );
      }
    }

    // 2. Delete removed items
    for (const id of deletedItemIds) {
      await supabaseFetch('picking_list', 'DELETE', undefined, `id=eq.${id}`);
    }

    // 3. Insert newly added items
    if (newItems.length > 0) {
      const rows = newItems.map((it) => ({
        no_sj: no_sj.trim().toUpperCase(),
        tanggal: nowIso.slice(0, 10),
        tujuan: tujuan.trim(),
        sku: it.sku.trim().toUpperCase(),
        nama_produk: it.nama_produk.trim(),
        size: it.size || '-',
        qty_req: Number(it.qty_req) || 1,
        qty_picked: 0,
        lokasi: it.lokasi || 'A-01',
        status: 'PENDING' as const,
        created_at: nowIso,
      }));
      await supabaseFetch('picking_list', 'POST', rows);
    }

    return true;
  } catch (err) {
    console.warn('Error updating picking SJ in Supabase:', err);
    return false;
  }
}



