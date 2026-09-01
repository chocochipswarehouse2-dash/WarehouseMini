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
  let url = localStorage.getItem('wms_supabase_url') || DEFAULT_SUPABASE_URL;
  try {
    url = new URL(url).origin;
  } catch (e) {
    // Ignore invalid URLs here, let client throw
  }
  const key = localStorage.getItem('wms_supabase_key') || DEFAULT_SUPABASE_ANON_KEY;
  return { url, key };
}

export function saveSupabaseConfig(url: string, key: string) {
  let cleanUrl = url.trim();
  try {
    if (cleanUrl) {
      cleanUrl = new URL(cleanUrl).origin;
    }
  } catch (e) {}
  
  localStorage.setItem('wms_supabase_url', cleanUrl);
  localStorage.setItem('wms_supabase_key', key.trim());
  currentConfig = { url: cleanUrl, key: key.trim() };
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
    lok.startsWith('DF') || // DF014
    lok.startsWith('PMK') || // PMK001
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
  name TEXT,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Operator', -- 'All', 'Produk', 'Fulfillment', 'Peminjaman', 'Operator'
  permissions JSONB DEFAULT '{}'::jsonb,
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
CREATE TABLE IF NOT EXISTS public.peminjaman (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  no_peminjaman TEXT NOT NULL,
  pic TEXT NOT NULL,
  keperluan TEXT NOT NULL,
  tanggal_pinjam DATE NOT NULL DEFAULT CURRENT_DATE,
  sku TEXT NOT NULL,
  nama_produk TEXT NOT NULL,
  size TEXT DEFAULT '-',
  qty NUMERIC DEFAULT 1,
  lokasi TEXT DEFAULT '-',
  status TEXT DEFAULT 'Dipinjam', -- 'Dipinjam', 'Dikembalikan'
  operator TEXT NOT NULL,
  tanggal_kembali DATE,
  keterangan TEXT DEFAULT '',
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
ALTER TABLE public.peminjaman ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access" ON public.wms_users FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.master_produk FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.log_produk FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.stock_opname_queue FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.penerimaan_produksi FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.picking_list FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.peminjaman FOR ALL USING (true);
`;

/**
 * Fetch real-time system stock for locations
 */
export async function fetchStockForLocations(locations: string[]): Promise<StockRealtimeItem[]> {
  if (!locations.length) return [];
  const cleanLocs = locations.map((l) => l.trim()).filter(Boolean);
  if (!cleanLocs.length) return [];

  // 1. Try querying stok_realtime or view_stok_realtime
  try {
    const lokParam = cleanLocs.map((l) => `"${l}"`).join(',');
    let data: StockRealtimeItem[] | null = null;
    try {
      data = await supabaseFetch<StockRealtimeItem[]>(
        'stok_realtime',
        'GET',
        null,
        `lokasi=in.(${lokParam})&order=sku.asc,lokasi.asc`
      );
    } catch {
      data = await supabaseFetch<StockRealtimeItem[]>(
        'view_stok_realtime',
        'GET',
        null,
        `lokasi=in.(${lokParam})&order=sku.asc,lokasi.asc`
      );
    }
    if (data && Array.isArray(data) && data.length > 0) {
      const map = new Map<string, StockRealtimeItem>();
      for (const it of data) {
        const key = `${(it.sku || '').trim().toUpperCase()}__${(it.lokasi || '').trim().toUpperCase()}`;
        if (!map.has(key)) {
          map.set(key, {
            ...it,
            sisa_stok: Number(it.sisa_stok) || 0,
            area: it.area || getAreaFromLokasi(it.lokasi),
          });
        }
      }
      return Array.from(map.values());
    }
  } catch (err) {
    console.warn('Error fetching realtime stock from Supabase view, trying log calculation:', err);
  }

  // 2. Fallback: calculate directly from log_produk for these specific locations
  try {
    const lokParam = cleanLocs.map((l) => `"${l}"`).join(',');
    const logs = await supabaseFetch<LogProdukItem[]>(
      'log_produk',
      'GET',
      null,
      `lokasi=in.(${lokParam})&order=created_at.desc&limit=5000`
    );
    if (logs && Array.isArray(logs) && logs.length > 0) {
      const stockMap = new Map<string, StockRealtimeItem>();
      for (const log of logs) {
        const sku = (log.sku || '').trim().toUpperCase();
        if (!sku) continue;
        const lok = (log.lokasi || 'Warehouse').trim();
        const area = log.area || getAreaFromLokasi(lok);
        const key = `${sku}__${lok.toUpperCase()}`;
        const qty = Number(log.qty) || 0;
        const type = (log.type || '').toUpperCase();
        const delta = type === 'IN' || type === 'ADJ_IN' ? qty : type === 'OUT' || type === 'ADJ_OUT' ? -qty : 0;

        if (!stockMap.has(key)) {
          stockMap.set(key, {
            sku,
            nama_produk: log.nama_produk || sku,
            size: log.size || '-',
            lokasi: lok,
            area,
            sisa_stok: delta,
            updated_at: log.created_at,
          });
        } else {
          stockMap.get(key)!.sisa_stok += delta;
        }
      }
      return Array.from(stockMap.values());
    }
  } catch (err) {
    console.warn('Error calculating stock from logs for locations:', err);
  }

  return [];
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
    let data: StockRealtimeItem[] | null = null;
    try {
      data = await supabaseFetch<StockRealtimeItem[]>(
        'stok_realtime',
        'GET',
        null,
        `sku=in.(${skuParam})&order=sku.asc,lokasi.asc`
      );
    } catch {
      data = await supabaseFetch<StockRealtimeItem[]>(
        'view_stok_realtime',
        'GET',
        null,
        `sku=in.(${skuParam})&order=sku.asc,lokasi.asc`
      );
    }
    if (data && Array.isArray(data)) {
      const map = new Map<string, StockRealtimeItem>();
      for (const it of data) {
        if (!isWarehouseLocation(it.lokasi, it.area)) continue;
        const key = `${(it.sku || '').trim().toUpperCase()}__${(it.lokasi || '').trim().toUpperCase()}`;
        if (!map.has(key)) {
          map.set(key, {
            ...it,
            sisa_stok: Number(it.sisa_stok) || 0,
            area: it.area || getAreaFromLokasi(it.lokasi),
          });
        }
      }
      return Array.from(map.values());
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

export function isValidUUID(str?: string | null): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Insert stock opname queue records directly into Supabase
 */
export async function insertStockOpnameQueue(items: StockOpnameQueueItem[]): Promise<unknown> {
  if (!items.length) return [];

  // Sanitize payload strictly to match Supabase stock_opname_queue columns: id, sesi_id, tanggal, sku, nama_produk, size, lokasi, area, qty_sistem, qty_fisik, selisih, status, jenis, alasan, operator, invoice, approved_by, tanggal_approve
  const sanitized = items.map((it) => ({
    id: isValidUUID(it.id) ? it.id : generateUUID(),
    sesi_id: it.sesi_id || `SESI-${Date.now()}`,
    tanggal: it.tanggal || new Date().toISOString(),
    sku: it.sku,
    nama_produk: it.nama_produk || it.sku,
    size: it.size || '-',
    lokasi: it.lokasi || 'Warehouse',
    area: it.area || getAreaFromLokasi(it.lokasi || 'Warehouse'),
    qty_sistem: Number(it.qty_sistem) || 0,
    qty_fisik: Number(it.qty_fisik) || 0,
    selisih: Number(it.selisih) || 0,
    status: it.status || 'PENDING',
    jenis: it.jenis || 'Opname',
    alasan: it.alasan || (it.keterangan ? it.keterangan : 'Opname'),
    operator: it.operator || 'Operator',
    invoice: it.invoice || `INV-${Date.now()}`,
    approved_by: it.approved_by || null,
    tanggal_approve: it.tanggal_approve || null,
  }));

  try {
    const res = await supabaseFetch('stock_opname_queue', 'POST', sanitized);
    return res;
  } catch (err: any) {
    console.error('Error inserting Stock Opname Queue to Supabase:', err);
    throw err;
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
 * Fetch logs for a specific invoice number
 */
export async function fetchLogsByInvoice(invoice: string): Promise<LogProdukItem[]> {
  if (!invoice) return [];
  try {
    const data = await supabaseFetch<LogProdukItem[]>(
      'log_produk',
      'GET',
      null,
      `select=*&invoice=eq.${encodeURIComponent(invoice)}&order=created_at.asc`
    );
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error fetching logs by invoice:', err);
    return [];
  }
}

/**
 * Update a single log_produk record
 */
export async function updateLogProdukItem(
  id: string | number,
  updates: Partial<LogProdukItem>
): Promise<{ success: boolean; data?: LogProdukItem; error?: string }> {
  try {
    const payload: Record<string, unknown> = {};
    if (updates.type !== undefined) payload.type = updates.type;
    if (updates.sku !== undefined) payload.sku = updates.sku.trim();
    if (updates.nama_produk !== undefined) payload.nama_produk = updates.nama_produk.trim();
    if (updates.size !== undefined) payload.size = updates.size;
    if (updates.lokasi !== undefined) {
      payload.lokasi = updates.lokasi.trim();
      payload.area = getAreaFromLokasi(updates.lokasi.trim());
    }
    if (updates.area !== undefined && !payload.area) payload.area = updates.area;
    if (updates.qty !== undefined) payload.qty = Number(updates.qty) || 1;
    if (updates.operator !== undefined) payload.operator = updates.operator;
    if (updates.keterangan !== undefined) payload.keterangan = updates.keterangan;

    const res = await supabaseFetch<LogProdukItem[]>(
      'log_produk',
      'PATCH',
      payload,
      `id=eq.${encodeURIComponent(String(id))}`
    );
    return { success: true, data: Array.isArray(res) ? res[0] : (res as any) };
  } catch (err: any) {
    console.error('Error updating log_produk item:', err);
    return { success: false, error: err.message || 'Gagal mengubah mutasi log' };
  }
}

/**
 * Update all items in an invoice batch
 */
export async function updateLogProdukInvoiceBatch(
  items: Array<{
    id: string | number;
    type: string;
    sku: string;
    nama_produk: string;
    size?: string;
    lokasi: string;
    area?: string;
    qty: number;
    keterangan?: string;
  }>
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!items.length) return { success: true, count: 0 };
  try {
    for (const item of items) {
      const area = item.area || getAreaFromLokasi(item.lokasi);
      await supabaseFetch(
        'log_produk',
        'PATCH',
        {
          type: item.type,
          sku: item.sku.trim(),
          nama_produk: item.nama_produk.trim(),
          size: item.size || '-',
          lokasi: item.lokasi.trim(),
          area,
          qty: Number(item.qty) || 1,
          keterangan: item.keterangan || '',
        },
        `id=eq.${encodeURIComponent(String(item.id))}`
      );
    }
    return { success: true, count: items.length };
  } catch (err: any) {
    console.error('Error updating invoice items batch:', err);
    return { success: false, count: 0, error: err.message || 'Gagal menyimpan perubahan invoice' };
  }
}

/**
 * Delete a single log_produk record by ID
 */
export async function deleteLogProdukItem(
  id: string | number
): Promise<{ success: boolean; error?: string }> {
  try {
    await supabaseFetch('log_produk', 'DELETE', null, `id=eq.${encodeURIComponent(String(id))}`);
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting log_produk item:', err);
    return { success: false, error: err.message || 'Gagal menghapus item log' };
  }
}

/**
 * Delete an entire invoice (all log_produk rows matching the invoice number)
 */
export async function deleteLogProdukInvoice(
  invoice: string
): Promise<{ success: boolean; error?: string }> {
  if (!invoice) return { success: false, error: 'Invoice tidak valid' };
  try {
    await supabaseFetch('log_produk', 'DELETE', null, `invoice=eq.${encodeURIComponent(invoice)}`);
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting log_produk invoice:', err);
    return { success: false, error: err.message || 'Gagal menghapus seluruh invoice' };
  }
}

/**
 * Fetch stock opname queue items directly from Supabase with status filter
 */
export async function fetchStockOpnameQueue(
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL' = 'ALL',
  limit = 2000
): Promise<StockOpnameQueueItem[]> {
  try {
    const statusQuery = status !== 'ALL' ? `status=eq.${encodeURIComponent(status)}&` : '';
    const data = await supabaseFetch<StockOpnameQueueItem[]>(
      'stock_opname_queue',
      'GET',
      null,
      `select=*&${statusQuery}order=tanggal.desc&limit=${limit}`
    );
    if (data && Array.isArray(data)) {
      return data;
    }
    return [];
  } catch (err) {
    console.error('Error fetching SO queue from Supabase:', err);
    return [];
  }
}

/**
 * Approve Stock Opname Queue item(s) and create adjustment log in log_produk
 * Writes status: 'APPROVED' to stock_opname_queue and logs to log_produk as IN / OUT with keterangan 'Adjusment SO'
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
      // 1. Update Supabase queue status to APPROVED
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

      // 2. If there is a selisih, automatically create IN or OUT in log_produk with keterangan Adjusment SO
      const diff = Number(item.selisih) || 0;
      if (diff !== 0) {
        const adjType = diff > 0 ? 'IN' : 'OUT';
        const loc = item.lokasi || 'Warehouse';
        const ketReason = item.alasan ? ` - ${item.alasan}` : ` (Sesi: ${item.sesi_id || '-'})`;
        logsToInsert.push({
          type: adjType,
          invoice: item.invoice || `ADJ-SO-${Date.now()}`,
          sku: item.sku,
          nama_produk: item.nama_produk || item.sku,
          size: item.size || '-',
          area: item.area || getAreaFromLokasi(loc),
          lokasi: loc,
          qty: Math.abs(diff),
          operator: `${approvedBy || 'Admin'} (Adjustment SO)`,
          keterangan: `Adjusment SO${ketReason}`.trim(),
          created_at: nowIso,
        });
      }
    }

    // 3. Insert adjustment logs directly to log_produk
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
 * Reject Stock Opname Queue item(s) in Supabase
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
 * Delete item(s) permanently from stock_opname_queue in Supabase
 */
export async function deleteStockOpnameQueueItems(
  itemIds: string[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!itemIds.length) return { success: true, count: 0 };
  const validIds = itemIds.filter(Boolean);
  if (!validIds.length) return { success: true, count: 0 };

  try {
    const chunkSize = 50;
    for (let i = 0; i < validIds.length; i += chunkSize) {
      const chunk = validIds.slice(i, i + chunkSize);
      const inClause = chunk.map((id) => encodeURIComponent(id)).join(',');
      try {
        await supabaseFetch('stock_opname_queue', 'DELETE', null, `id=in.(${inClause})`);
      } catch {
        // Fallback to individual deletes if in.() is not accepted
        for (const singleId of chunk) {
          await supabaseFetch('stock_opname_queue', 'DELETE', null, `id=eq.${encodeURIComponent(singleId)}`);
        }
      }
    }
    return { success: true, count: validIds.length };
  } catch (err: any) {
    console.error('Error deleting SO Queue items:', err);
    return { success: false, count: 0, error: err.message || 'Gagal menghapus item' };
  }
}

/**
 * Direct Supabase Realtime Stock Fetcher (matches GAS script fetchSupabaseStokFisikDirect)
 */
export async function fetchSupabaseStokFisikDirect(): Promise<StockRealtimeItem[]> {
  const { url: supaUrl, key: supaKey } = getStoredSupabaseConfig();
  const allRows: StockRealtimeItem[] = [];
  let from = 0;
  const chunkSize = 1000;

  try {
    while (true) {
      const to = from + chunkSize - 1;
      const res = await fetch(
        `${supaUrl}/rest/v1/view_stok_realtime?sisa_stok=neq.0&select=sku,nama_produk,size,area,lokasi,sisa_stok&order=sku.asc,lokasi.asc`,
        {
          headers: {
            apikey: supaKey,
            Authorization: 'Bearer ' + supaKey,
            'Range-Unit': 'items',
            Range: `${from}-${to}`,
          },
        }
      );
      if (!res.ok && res.status !== 206) break;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) break;
      allRows.push(...data);
      if (data.length < chunkSize) break;
      from += chunkSize;
    }
  } catch (err) {
    console.warn('fetchSupabaseStokFisikDirect warning:', err);
  }
  return allRows;
}

/**
 * Fetch all realtime stock across all locations with chunked pagination to load 100% of rows
 */
export async function fetchAllStockRealtime(maxRows = 50000): Promise<StockRealtimeItem[]> {
  // First try direct fetch matching GAS method
  try {
    const directRows = await fetchSupabaseStokFisikDirect();
    if (directRows && directRows.length > 0) {
      return directRows;
    }
  } catch (e) {
    console.warn('Direct fetch error, trying fallback:', e);
  }

  const dedupMap = new Map<string, StockRealtimeItem>();
  const pageSize = 1000;
  let offset = 0;

  // 1. Try querying stok_realtime or view_stok_realtime with deterministic ordering (order=sku.asc,lokasi.asc)
  const targetTables = ['view_stok_realtime', 'stok_realtime'];
  let successfulTable: string | null = null;

  for (const tableName of targetTables) {
    try {
      offset = 0;
      dedupMap.clear();
      let hasData = false;

      while (offset < maxRows) {
        const currentLimit = Math.min(pageSize, maxRows - offset);
        const chunk = await supabaseFetch<StockRealtimeItem[]>(
          tableName,
          'GET',
          null,
          `sisa_stok=neq.0&select=*&order=sku.asc,lokasi.asc&limit=${currentLimit}&offset=${offset}`
        );
        if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
          break;
        }
        hasData = true;
        for (const item of chunk) {
          const sku = (item.sku || '').trim().toUpperCase();
          const lokasi = (item.lokasi || 'Warehouse').trim();
          if (!sku) continue;
          const key = `${sku}__${lokasi.toUpperCase()}`;
          dedupMap.set(key, {
            sku: item.sku,
            nama_produk: item.nama_produk || item.sku,
            size: item.size || '-',
            lokasi: item.lokasi || lokasi,
            area: item.area || getAreaFromLokasi(lokasi),
            sisa_stok: Number(item.sisa_stok) || 0,
            updated_at: item.updated_at,
          });
        }
        if (chunk.length < currentLimit) {
          break;
        }
        offset += chunk.length;
      }

      if (hasData && dedupMap.size > 0) {
        successfulTable = tableName;
        return Array.from(dedupMap.values());
      }
    } catch (err) {
      console.warn(`Error fetching ${tableName} from Supabase:`, err);
    }
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
  return fetchWmsUsersFromSupabase();
}

export async function saveSupabaseUser(user: WmsUser): Promise<boolean> {
  return saveWmsUserToSupabase(user);
}

export async function deleteSupabaseUser(username: string): Promise<boolean> {
  return deleteWmsUserFromSupabase(username);
}

/**
 * Verify user login directly via Supabase wms_users table (fast & secure, Supabase = Frontend)
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
  
  // 0. Use native Supabase Auth if valid email format is provided
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
          name: data.user.email?.split('@')[0] || cleanUser,
          role: 'Superadmin',
          message: 'Berhasil login via Supabase Auth'
        };
      }
    } catch (err) {
      console.warn('Native Supabase auth check completed, evaluating wms_users table:', err);
    }
  }

  // 1. Direct check in Supabase wms_users table (Database = Frontend Source of Truth)
  try {
    const data = await supabaseFetch<WmsUser[]>(
      'wms_users',
      'GET',
      null,
      `username=ilike.${encodeURIComponent(cleanUser)}&limit=1`
    );

    if (data && data.length > 0) {
      const u = data[0];
      // If user has a password in DB and password was provided, verify
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
        name: u.name || u.username,
        role: u.role || 'Operator',
        permissions: u.permissions || {},
        message: 'Login berhasil (terverifikasi dari Supabase wms_users)',
      };
    }
  } catch (err) {
    console.warn('Supabase wms_users query error, checking preset accounts:', err);
  }

  // 2. Preset / Predefined Master Accounts fallback & auto-sync to Supabase
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
    if (cleanPass && matched.pass && cleanPass !== matched.pass) {
      return {
        success: false,
        token: '',
        user: username,
        role: matched.role,
        message: 'Password salah untuk akun preset ini.',
      };
    }

    // Auto-upsert preset account into Supabase so it is permanently in Supabase table
    saveWmsUserToSupabase({
      username: cleanUser,
      name: matched.name || cleanUser,
      role: matched.role,
      password: matched.pass,
    }).catch(() => {});

    const token = `sb_preset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return {
      success: true,
      token,
      user: username,
      name: matched.name || username,
      role: matched.role,
      message: 'Login berhasil via akun preset terdaftar',
    };
  }

  // 3. Dynamic User auto-provision (Superadmin for admin keywords, Operator otherwise)
  const token = `sb_user_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const role: UserRole = cleanUser.includes('admin') ? 'Superadmin' : 'Operator';
  
  // Save new dynamically created user to Supabase
  saveWmsUserToSupabase({
    username: cleanUser,
    name: username,
    role,
    password: cleanPass || '123456',
  }).catch(() => {});

  return {
    success: true,
    token,
    user: username,
    name: username,
    role,
    message: `Login berhasil sebagai ${role}`,
  };
}

/**
 * Fetch list of WMS users directly from Supabase (Database = Frontend Source of Truth)
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
      try {
        localStorage.setItem('wms_custom_users', JSON.stringify(data));
      } catch {}
      return data;
    }
  } catch (err) {
    console.warn('Could not fetch wms_users from Supabase:', err);
  }

  // Fallback to local cache
  try {
    const local = localStorage.getItem('wms_custom_users');
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  const defaultUsers: WmsUser[] = [
    { username: 'admin', name: 'Super Admin Utama', role: 'Superadmin', password: 'admin123' },
    { username: 'superadmin', name: 'Super Admin', role: 'Superadmin', password: 'admin123' },
    { username: 'chocochips.warehouse2@gmail.com', name: 'Warehouse Lead', role: 'Superadmin', password: 'admin123' },
    { username: 'operator', name: 'Operator Gudang', role: 'Operator', password: '123456' },
    { username: 'produk_team', name: 'Tim Produk & Stok', role: 'Produk', password: 'produk123' },
    { username: 'fulfillment_team', name: 'Tim Fulfillment', role: 'Fulfillment', password: 'fulfillment123' },
    { username: 'peminjaman_team', name: 'Tim Peminjaman SPS', role: 'Peminjaman', password: 'peminjaman123' },
  ];

  return defaultUsers;
}

/**
 * Save / Upsert WMS user into Supabase wms_users table (Database = Frontend)
 */
export async function saveWmsUserToSupabase(user: WmsUser): Promise<boolean> {
  const cleanU = user.username.trim().toLowerCase();
  const payload = {
    username: cleanU,
    name: user.name || user.username,
    role: user.role || 'Operator',
    password: user.password || '123456',
    permissions: user.permissions || {},
    updated_at: new Date().toISOString(),
  };

  try {
    await supabaseFetch('wms_users', 'POST', payload, 'on_conflict=username');
  } catch (err) {
    console.warn('Could not save wms_user to Supabase table:', err);
  }

  // Also sync to local cache
  try {
    const local = localStorage.getItem('wms_custom_users');
    const list: WmsUser[] = local ? JSON.parse(local) : [];
    const updated = list.filter((u) => u.username.toLowerCase() !== cleanU);
    updated.push(payload);
    localStorage.setItem('wms_custom_users', JSON.stringify(updated));
  } catch {}

  return true;
}

/**
 * Delete WMS user from Supabase wms_users table
 */
export async function deleteWmsUserFromSupabase(username: string): Promise<boolean> {
  const cleanU = username.trim().toLowerCase();
  try {
    await supabaseFetch(
      'wms_users',
      'DELETE',
      null,
      `username=eq.${encodeURIComponent(cleanU)}`
    );
  } catch (err) {
    console.warn('Could not delete wms_user from Supabase table:', err);
  }

  // Also remove from local cache
  try {
    const local = localStorage.getItem('wms_custom_users');
    if (local) {
      const list: WmsUser[] = JSON.parse(local);
      const updated = list.filter((u) => u.username.toLowerCase() !== cleanU);
      localStorage.setItem('wms_custom_users', JSON.stringify(updated));
    }
  } catch {}

  return true;
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
    const rawDp = row.sisa_stok ?? row.stok_dealpos ?? row.dealpos_stock ?? row.stock_dealpos ?? row.stok_sistem ?? row.dealpos_stok ?? row.stok_map ?? row.qty;
    if (rawDp !== undefined && rawDp !== null && rawDp !== '') {
      stokMap = Number(rawDp);
    }
  }

  // If row has location indicating live channels
  const rowLok = String(row.lokasi || '').toUpperCase();
  const rowArea = String(row.area || '').toUpperCase();
  const rowQty = Number(row.sisa_stok ?? row.qty ?? 0);
  if (rowLok.includes('STUDIO') || rowArea.includes('STUDIO')) {
    stokStudio = (stokStudio || 0) + rowQty;
  }
  if (rowLok.includes('SHOPEE') || rowLok.includes('SHP') || rowArea.includes('SHOPEE')) {
    stokShp = (stokShp || 0) + rowQty;
  }
  if (rowLok.includes('TIKTOK') || rowLok.includes('TTK') || rowArea.includes('TIKTOK')) {
    stokTtk = (stokTtk || 0) + rowQty;
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
 * Fetch master products from Supabase across all potential product tables with chunked pagination to load 100% of all products
 * (master_produk, produk, products, master_barang, barang, view_stok_realtime, log_produk, picking_list, etc.)
 */
export async function fetchMasterProductsFromSupabase(maxRowsPerTable = 50000): Promise<ProductItem[]> {
  const productsMap = new Map<string, ProductItem>();
  const { url: supaUrl, key: supaKey } = getStoredSupabaseConfig();

  // 1. Load from localStorage cache first (wms_cache_inventory_v38 and wms_product_cache)
  try {
    const rawInvCache = localStorage.getItem('wms_cache_inventory_v38');
    if (rawInvCache) {
      const parsed = JSON.parse(rawInvCache);
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          const item = extractProductFromRow(r);
          if (item && item.k && !isDummyProduct(item)) {
            productsMap.set(item.k.toUpperCase(), item);
          }
        }
      }
    }
    const rawProdCache = localStorage.getItem('wms_product_cache');
    if (rawProdCache) {
      const parsed = JSON.parse(rawProdCache);
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          const item = extractProductFromRow(r);
          if (item && item.k && !isDummyProduct(item)) {
            if (!productsMap.has(item.k.toUpperCase())) {
              productsMap.set(item.k.toUpperCase(), item);
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error reading product local cache:', err);
  }

  // 2. Multi-table queries with full range pagination (1000 items per chunk)
  const candidateTables = [
    'master_produk',
    'produk',
    'products',
    'master_barang',
    'barang',
    'view_stok_realtime',
    'stock_realtime',
    'stok_realtime',
    'stok_produk',
    'log_produk',
    'picking_list',
    'penerimaan_produksi',
  ];

  const chunkSize = 1000;

  for (const table of candidateTables) {
    let from = 0;
    try {
      while (from < maxRowsPerTable) {
        const to = from + chunkSize - 1;
        const res = await fetch(`${supaUrl}/rest/v1/${table}?select=*`, {
          headers: {
            apikey: supaKey,
            Authorization: 'Bearer ' + supaKey,
            'Range-Unit': 'items',
            Range: `${from}-${to}`,
          },
        });

        if (!res.ok && res.status !== 206) break;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) break;

        for (const r of rows) {
          const item = extractProductFromRow(r);
          if (item && item.k && !isDummyProduct(item)) {
            const key = item.k.toUpperCase();
            const existing = productsMap.get(key);
            if (!existing) {
              productsMap.set(key, item);
            } else {
              // Enrich existing item if new record has location or size or fuller name
              if (item.lokasi && item.lokasi !== '-') {
                if (!existing.lokasi || existing.lokasi === '-') {
                  existing.lokasi = item.lokasi;
                } else {
                  // Combine locations if not already present
                  const existingLocs = existing.lokasi.split(/[,/;\n|]+/).map(s => s.trim().toUpperCase());
                  const newLocs = item.lokasi.split(/[,/;\n|]+/).map(s => s.trim().toUpperCase());
                  const toAdd = newLocs.filter(l => l && l !== '-' && !existingLocs.includes(l));
                  if (toAdd.length > 0) {
                    existing.lokasi = `${existing.lokasi}, ${toAdd.join(', ')}`;
                  }
                }
              }
              if ((!existing.s || existing.s === '-') && item.s && item.s !== '-') existing.s = item.s;
              if ((!existing.p || existing.p === existing.k) && item.p && item.p !== item.k) existing.p = item.p;
            }
          }
        }

        if (rows.length < chunkSize) break;
        from += chunkSize;
      }
    } catch (err) {
      // Table doesn't exist or error, continue to next table
    }
  }

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
    // Primary query: non-zero remaining stocks (chunked sequentially for safety)
    let offset = 0;
    const pageSize = 1000;
    let keepFetching = true;
    const viewRowsNonZero: any[] = [];

    while (keepFetching && offset < 15000) {
      const chunk = await supabaseFetch<any[]>(
        'view_stok_realtime',
        'GET',
        null,
        `select=*&sisa_stok=neq.0${searchFilter}&limit=${pageSize}&offset=${offset}`
      );
      if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
        break;
      }
      viewRowsNonZero.push(...chunk);
      if (chunk.length < pageSize) {
        break;
      }
      offset += chunk.length;
    }

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
    let blokFQty = 0;
    let whQty = 0;
    let totalQty = 0;

    const locParts: string[] = [];
    const whLocParts: string[] = [];

    for (const locInfo of entry.locations.values()) {
      const q = Math.max(0, locInfo.qty);
      const lokName = locInfo.lokasi.trim();
      const lokUpper = lokName.toUpperCase();
      const areaUpper = locInfo.area.toUpperCase();

      totalQty += q;

      const isShopee = lokUpper.includes('SHOPEE') || lokUpper.includes('SHP') || lokUpper.includes('LIVE SHOPEE') || areaUpper.includes('SHOPEE');
      const isTikTok = lokUpper.includes('TIKTOK') || lokUpper === 'TTK' || lokUpper === 'TT' || lokUpper.includes('LIVE TIKTOK') || areaUpper.includes('TIKTOK');
      const isBlokF = lokUpper.includes('BLOK F') || areaUpper.includes('BLOK F') || lokUpper.startsWith('F-');
      
      let isStudio = lokUpper.includes('STUDIO') || lokUpper === 'SAMPLE' || lokUpper === 'LIVE' || lokUpper.includes('FOTO') || areaUpper.includes('STUDIO');
      if (isBlokF) {
        if (!isShopee && !isTikTok) isStudio = true;
      }
      const isWh = !isStudio && !isShopee && !isTikTok && !isBlokF && (areaUpper.includes('WAREHOUSE') || areaUpper.includes('GUDANG') || isWarehouseLocation(lokName, locInfo.area));

      if (isStudio) {
        studioQty += q;
      }
      if (isShopee) {
        shpQty += q;
      }
      if (isTikTok) {
        ttkQty += q;
      }
      if (isBlokF) {
        blokFQty += q;
      }
      if (isWh && !isBlokF) {
        whQty += q;
        if (q > 0) whLocParts.push(lokName);
      }

      if (q > 0) {
        const areaLabel = isBlokF && !lokUpper.includes('BLOK F') ? `BLOK F - ${lokName}` : lokName;
        locParts.push(`${areaLabel} (${q})`);
      }
    }

    // Default formatting of location string
    let locStr = locParts.length > 0 ? locParts.join(', ') : 'BLOK F (0)';
    let whLocStr = whLocParts.length > 0 ? whLocParts.join(', ') : '';

    channelStockList.push({
      sku: entry.sku,
      produk: entry.produk,
      size: entry.size || 'ALL',
      locStr,
      whLocStr,
      studioQty,
      shpQty,
      ttkQty,
      blokFQty,
      whQty,
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
    const data = await supabaseFetch<any[]>('peminjaman', 'GET', null, 'select=*&order=created_at.desc');

    if (data && Array.isArray(data) && data.length > 0) {
      const groups = new Map<string, any>();
      
      for (const row of data) {
        const no = row.no_peminjaman;
        if (!groups.has(no)) {
          groups.set(no, {
             id: no,
             noPeminjaman: no,
             namaPeminjam: row.pic || '',
             keperluan: row.keperluan || '',
             tglPinjam: row.tanggal_pinjam || '',
             timestamp: row.created_at || new Date().toISOString(),
             status: row.status || 'Dipinjam',
             username: row.operator || 'System',
             items: []
          });
        }
        groups.get(no).items.push({
           produk: row.nama_produk || row.sku,
           sku: row.sku,
           size: row.size || '-',
           qty: row.qty || 1,
           lokasi: row.lokasi || '-',
        });
      }
      
      const records: PeminjamanRecord[] = Array.from(groups.values());
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
    const check = await supabaseFetch<any[]>('peminjaman', 'GET', null, `no_peminjaman=eq.${encodeURIComponent(record.noPeminjaman || '')}&limit=1`);
    if (check && check.length > 0) {
      await supabaseFetch(
        'peminjaman',
        'PATCH',
        { status: record.status || 'Dipinjam', tanggal_kembali: null },
        `no_peminjaman=eq.${encodeURIComponent(record.noPeminjaman || '')}`
      );
      return true;
    }

    const payload = (record.items || []).map(it => ({
      no_peminjaman: record.noPeminjaman,
      pic: record.namaPeminjam,
      keperluan: record.keperluan,
      tanggal_pinjam: record.tglPinjam,
      sku: it.sku || `SKU-${Date.now()}`,
      nama_produk: it.produk || it.sku || 'Unknown',
      size: it.size || 'ALL',
      qty: it.qty || 1,
      lokasi: it.lokasi || 'BLOK F',
      status: record.status || 'Dipinjam',
      operator: record.username || 'System',
      keterangan: ''
    }));

    if (payload.length > 0) {
      await supabaseFetch('peminjaman', 'POST', payload);
    }
    return true;
  } catch (err) {
    console.warn('Error saving peminjaman to Supabase, caching locally:', err);
    return false;
  }
}

export async function returnPeminjamanSupabase(noPeminjaman: string): Promise<boolean> {
  try {
    await supabaseFetch(
      'peminjaman',
      'PATCH',
      { status: 'Dikembalikan', tanggal_kembali: new Date().toISOString().slice(0, 10) },
      `no_peminjaman=ilike.${encodeURIComponent(noPeminjaman)}`
    );
    return true;
  } catch (err) {
    console.warn('Error returning peminjaman in Supabase:', err);
    return false;
  }
}


function extractPickingItemFromRow(row: any): PickingListItem | null {
  if (!row) return null;
  const no_sj = String(row.no_sj || row.number_delivery || row.no_delivery || row.invoice || row.nomor_sj || row.sj || '').trim();
  const sku = String(row.sku || row.code || row.barcode || '').trim().toUpperCase();
  if (!no_sj || !sku) return null;

  const nowIso = new Date().toISOString();
  const rawQtyReq = Number(row.qty_req || row.qty || row.jumlah || row.target_qty || row.qty_total);
  const rawQtyPicked = Number(row.qty_picked || row.picked_qty || row.terambil || 0);

  return {
    id: String(row.id || `pick_${no_sj}_${sku}_${Date.now()}`),
    no_sj,
    tanggal: String(row.tanggal || row.date || row.created_at || nowIso.slice(0, 10)).slice(0, 10),
    tujuan: String(row.tujuan || row.destination || row.channel || 'Marketplace').trim(),
    sku,
    nama_produk: String(row.nama_produk || row.produk || row.product || row.item_name || sku).trim(),
    size: String(row.size || row.variant || '-').trim(),
    qty_req: isNaN(rawQtyReq) || rawQtyReq <= 0 ? 1 : rawQtyReq,
    qty_picked: isNaN(rawQtyPicked) || rawQtyPicked < 0 ? 0 : rawQtyPicked,
    lokasi: String(row.lokasi || row.location || row.rak || '-').trim(),
    status: (String(row.status || 'PENDING').trim().toUpperCase() as any) || 'PENDING',
    picker_name: row.picker_name || row.picker || '',
    catatan: row.catatan || row.notes || row.keterangan || '',
    created_at: row.created_at || nowIso,
  };
}

export async function fetchPickingListFromSupabase(): Promise<PickingListItem[]> {
  const itemsMap = new Map<string, PickingListItem>();

  // 1. (REMOVED) Do not rely on local cache for the main source of truth
  // to avoid ghost items reappearing after deletion.
  // We will always fetch fresh data from Supabase.

  // 2. Fetch from Supabase candidate tables
  const candidateTables = ['picking_list', 'refill', 'tugas_picking', 'transfer_order'];
  let anySuccess = false;
  let lastError = null;

  for (const table of candidateTables) {
    try {
      const rows = await supabaseFetch<any[]>(
        table,
        'GET',
        null,
        'select=*&order=created_at.desc&limit=2000'
      );
      anySuccess = true; // Request succeeded, even if 0 rows
      if (rows && Array.isArray(rows) && rows.length > 0) {
        for (const r of rows) {
          const item = extractPickingItemFromRow(r);
          if (item) {
            itemsMap.set(`${item.no_sj}__${item.sku}`, item);
          }
        }
        break; // Successfully got from primary table
      }
    } catch (e) {
      lastError = e;
      // Continue to next table
    }
  }

  // If no table succeeded at all (e.g. network down), throw to trigger offline cache
  if (!anySuccess && lastError) {
    throw lastError;
  }

  // 3. Auto-sync from Peminjaman (for legacy Google Sheets UI submissions)
  try {
    const peminjamans = await supabaseFetch<any[]>('peminjaman', 'GET', null, 'select=*&order=created_at.desc&limit=100');
    if (peminjamans && Array.isArray(peminjamans)) {
      const toInsert: any[] = [];
      for (const p of peminjamans) {
        const no_sj = String(p.no_peminjaman || '');
        const sku = String(p.sku || '').toUpperCase();
        const pStatus = String(p.status || '').toUpperCase();
        
        // Skip items that are already returned to avoid re-adding them to picking list
        if (pStatus === 'DIKEMBALIKAN') continue;

        if (no_sj && sku && !itemsMap.has(`${no_sj}__${sku}`)) {
          const newItem = {
            no_sj: no_sj,
            tanggal: p.tanggal_pinjam || '',
            tujuan: `SPS: ${p.pic || ''} - ${p.keperluan || ''}`,
            sku: sku,
            nama_produk: p.nama_produk || sku,
            qty_req: Number(p.qty) || 1,
            qty_picked: 0,
            lokasi: p.lokasi || 'BLOK F',
            status: 'PENDING',
            picker_name: '',
            created_at: p.created_at || new Date().toISOString()
          };
          toInsert.push(newItem);
          const extracted = extractPickingItemFromRow(newItem);
          if (extracted) {
             itemsMap.set(`${no_sj}__${sku}`, extracted);
          }
        }
      }
      if (toInsert.length > 0) {
        // Fire-and-forget background insert to sync Supabase picking_list
        supabaseFetch('picking_list', 'POST', toInsert).catch(console.warn);
      }
    }
  } catch (err) {
    console.warn('Auto-sync peminjaman to picking_list failed:', err);
  }

  const result = Array.from(itemsMap.values());
  // Sort newest first
  result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  try {
    localStorage.setItem('wms_picking_cache', JSON.stringify(result));
  } catch {}
  return result;
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
      const condition = item.id && !item.id.startsWith('pick_')
        ? `id=eq.${item.id}`
        : `no_sj=ilike.${encodeURIComponent(cleanNoSj)}&sku=ilike.${encodeURIComponent(item.sku)}`;

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
        await supabaseFetch('picking_list', 'PATCH', payload, condition);
      } catch (patchErr: any) {
        // If failed due to unknown 'catatan' column, retry without catatan
        try {
          const minimalPayload = {
            qty_picked: item.qty_picked,
            status: 'SELESAI',
            picker_name: pickerName,
          };
          await supabaseFetch('picking_list', 'PATCH', minimalPayload, condition);
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
): Promise<{ success: boolean; createdItems: PickingListItem[] }> {
  const nowIso = new Date().toISOString();
  const cleanNoSj = no_sj.trim().toUpperCase();
  const cleanTujuan = tujuan.trim() || 'Marketplace';

  const newItems: PickingListItem[] = items.map((it, idx) => ({
    id: `pick_${cleanNoSj}_${it.sku.trim().toUpperCase()}_${Date.now()}_${idx}`,
    no_sj: cleanNoSj,
    tanggal: nowIso.slice(0, 10),
    tujuan: cleanTujuan,
    sku: it.sku.trim().toUpperCase(),
    nama_produk: it.nama_produk.trim() || it.sku.trim().toUpperCase(),
    size: it.size || '-',
    qty_req: Number(it.qty_req) || 1,
    qty_picked: 0,
    lokasi: it.lokasi || 'A-01',
    status: 'PENDING' as const,
    created_at: nowIso,
  }));

  // 1. Immediately store to local picking cache so it appears in Tugas Picking right away
  try {
    const cached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_picking_cache') || '[]');
    // Filter out existing identical items
    const filteredCache = cached.filter(
      (c) => !(c.no_sj?.toUpperCase() === cleanNoSj && newItems.some((n) => n.sku === c.sku?.toUpperCase()))
    );
    const updatedCache = [...newItems, ...filteredCache];
    localStorage.setItem('wms_picking_cache', JSON.stringify(updatedCache));
  } catch (cErr) {
    console.warn('Error saving picking to local cache:', cErr);
  }

  // 2. Sync to Supabase tables (try picking_list first, then refill)
  try {
    const rows = newItems.map((it) => ({
      no_sj: it.no_sj,
      tanggal: it.tanggal,
      tujuan: it.tujuan,
      sku: it.sku,
      nama_produk: it.nama_produk,
      size: it.size,
      qty_req: it.qty_req,
      qty_picked: 0,
      lokasi: it.lokasi,
      status: 'PENDING',
      created_at: it.created_at,
    }));

    try {
      await supabaseFetch('picking_list', 'POST', rows);
    } catch {
      try {
        await supabaseFetch('refill', 'POST', rows);
      } catch {}
    }

    return { success: true, createdItems: newItems };
  } catch (err) {
    console.warn('Error syncing picking SJ to Supabase remote (persisted locally):', err);
    return { success: true, createdItems: newItems };
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
    // Attempt to delete items from peminjaman
    if (deletedItemIds.length > 0) {
      for (const id of deletedItemIds) {
        // we only have ID for picking_list, so we must fetch the SKU first to delete from peminjaman
        supabaseFetch<any[]>('picking_list', 'GET', null, `id=eq.${id}`).then((rows) => {
          if (rows && rows[0]) {
            const encodedSj = encodeURIComponent(no_sj);
            const encodedSku = encodeURIComponent(rows[0].sku);
            if (encodedSj) {
            supabaseFetch('peminjaman', 'DELETE', null, `no_peminjaman=ilike.${encodedSj}&sku=ilike.${encodedSku}`).catch(()=>{});
            }
          }
        }).catch(()=>{});
      }
    }
    
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




export async function deletePickingSuratJalanBatchSupabase(no_sjs: string[]): Promise<boolean> {
  if (!no_sjs || no_sjs.length === 0) return true;
  try {
    // Delete one by one to avoid PostgREST 'in' syntax issues with special chars
    for (const sj of no_sjs) {
      const encodedSj = encodeURIComponent(sj);
      await supabaseFetch('picking_list', 'DELETE', null, `no_sj=ilike.${encodedSj}`);
      await supabaseFetch('peminjaman', 'DELETE', null, `no_peminjaman=ilike.${encodedSj}`).catch(() => {});
    }
    // Clean up local caches
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cachedStr = localStorage.getItem('wms_picking_cache');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (Array.isArray(cached)) {
            const newCache = cached.filter(item => !no_sjs.includes(item.no_sj));
            localStorage.setItem('wms_picking_cache', JSON.stringify(newCache));
          }
        }
        const rawCachedStr = localStorage.getItem('wms_raw_picking_list_cache');
        if (rawCachedStr) {
          const rawCached = JSON.parse(rawCachedStr);
          if (Array.isArray(rawCached)) {
            const newRawCache = rawCached.filter(item => !no_sjs.includes(item.no_sj));
            localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify(newRawCache));
          }
        }
      }
    } catch (err) {
      console.warn('Failed to clean local cache after delete', err);
    }
    return true;
  } catch (e) {
    console.error('deletePickingSuratJalanBatchSupabase error:', e);
    return false;
  }
}

export async function completePickingSuratJalanBatchSupabase(no_sjs: string[], pickerName: string): Promise<boolean> {
  if (!no_sjs || no_sjs.length === 0) return true;
  try {
    for (const sj of no_sjs) {
      const encodedSj = encodeURIComponent(sj);
      await supabaseFetch('picking_list', 'PATCH', { 
        status: 'SELESAI',
        picker_name: pickerName || 'Admin'
      }, `no_sj=ilike.${encodedSj}`);
    }
    // Update local caches
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cachedStr = localStorage.getItem('wms_picking_cache');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (Array.isArray(cached)) {
            const newCache = cached.map(item => no_sjs.includes(item.no_sj) ? { ...item, status: 'SELESAI', picker_name: pickerName || 'Admin' } : item);
            localStorage.setItem('wms_picking_cache', JSON.stringify(newCache));
          }
        }
      }
    } catch (err) {}
    return true;
  } catch (e) {
    console.error('completePickingSuratJalanBatchSupabase error:', e);
    return false;
  }
}
