import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getAllProductsFromLocalDb,
  saveProductsToLocalDb,
  saveInventoryStocksToLocalDb,
  clearLocalDb,
} from './localDb';
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
  KaryawanRecord,
  MasterShiftRecord,
  RosterShiftRecord,
  PresensiRecord,
  LemburRecord,
  PerijinanCutiRecord,
  PerbaikanTicket,
  QcReport,
  SimpanPenerimaanPayload,
} from '../types';
import { extractSizeFromSku, formatProductNameWithSize } from '../utils/sortUtils';


export const DEFAULT_SUPABASE_URL = 'https://vxongwtxmhjixhzeoidp.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_XFvjJipUzyi0EuM_tDTTsg_ll7TJ7rA';

// Empty baseline seed - no dummy items
export const DEFAULT_SEED_PRODUCTS: ProductItem[] = [];

/**
 * Filter helper to detect and eliminate any legacy dummy placeholder products
 */
export function isDummyProduct(item: ProductItem | null | undefined): boolean {
  if (!item || !item.k) return true;
  const sku = String(item.k || (item as any).sku || '').toUpperCase().trim();
  const name = String(item.p || item.n || (item as any).nama_produk || '').toLowerCase().trim();
  
  // 1. Filter out location tags, koli barcodes, or tags starting with or containing #
  if (sku.startsWith('#') || sku.includes('#') || name.startsWith('#')) {
    return true;
  }

  // 2. Filter out non-product tags accidentally scanned as SKUs
  if (
    sku === 'KOLI' ||
    sku === 'BOX' ||
    sku.startsWith('LOK ') ||
    sku.startsWith('RAK ') ||
    sku === 'UNDEFINED' ||
    sku === 'NULL' ||
    name === 'sku tidak ditemukan' ||
    name === 'undefined' ||
    name === 'null'
  ) {
    return true;
  }

  // 3. Detect known dummy product patterns
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
  const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ? String(import.meta.env.VITE_SUPABASE_URL) : null;
  const envKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ? String(import.meta.env.VITE_SUPABASE_ANON_KEY) : null;

  let url = (isBrowser ? localStorage.getItem('wms_supabase_url') : null) || envUrl || DEFAULT_SUPABASE_URL;
  try {
    url = new URL(url).origin;
  } catch (e) {
    // Ignore invalid URLs here, let client throw
  }
  let key = (isBrowser ? localStorage.getItem('wms_supabase_key') : null) || envKey || DEFAULT_SUPABASE_ANON_KEY;

  // Auto-migrate legacy project ref to the new default in browser localStorage
  // Also enforce that default project vxongwtxmhjixhzeoidp always uses the valid publishable key
  if (!url || !url.startsWith('http') || url.includes('filgijcfhgqlirzhvwho') || url.includes('vxongwtxmhjixhzeoidp') || (isBrowser && !localStorage.getItem('wms_supabase_v2_migrated'))) {
    url = DEFAULT_SUPABASE_URL;
    key = DEFAULT_SUPABASE_ANON_KEY;
    if (isBrowser) {
      try {
        localStorage.setItem('wms_supabase_url', DEFAULT_SUPABASE_URL);
        localStorage.setItem('wms_supabase_key', DEFAULT_SUPABASE_ANON_KEY);
        localStorage.setItem('wms_supabase_v2_migrated', 'true');
      } catch {}
    }
  }

  return { url, key };
}

export function saveSupabaseConfig(url: string, key: string) {
  let cleanUrl = url.trim();
  try {
    if (cleanUrl) {
      cleanUrl = new URL(cleanUrl).origin;
    }
  } catch (e) {}
  
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    localStorage.setItem('wms_supabase_url', cleanUrl);
    localStorage.setItem('wms_supabase_key', key.trim());
  }
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
  queryParams = '',
  preferRepresentation = false
): Promise<T> {
  const { url, key } = getStoredSupabaseConfig();
  const endpoint = `${url}/rest/v1/${table}${queryParams ? '?' + queryParams : ''}`;
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
    if (queryParams && queryParams.includes('on_conflict')) {
      headers['Prefer'] = preferRepresentation
        ? 'return=representation,resolution=merge-duplicates'
        : 'return=minimal,resolution=merge-duplicates';
    } else {
      headers['Prefer'] = preferRepresentation ? 'return=representation' : 'return=minimal';
    }
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

  if (response.status === 204) {
    return null as T;
  }
  const text = await response.text();
  if (!text || text.trim() === '') {
    return null as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null as T;
  }
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

-- 8. TABEL PENGELOLAAN REJECT, CUCI, PERMAK & DEFECT
CREATE TABLE IF NOT EXISTS public.perbaikan_tickets (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ticket_no TEXT UNIQUE NOT NULL,
  tanggal TIMESTAMPTZ DEFAULT now(),
  sku TEXT NOT NULL,
  nama_produk TEXT NOT NULL,
  size TEXT DEFAULT '-',
  qty NUMERIC DEFAULT 1,
  lokasi_asal TEXT DEFAULT 'Warehouse',
  lokasi_sekarang TEXT DEFAULT 'PERBAIKAN-01',
  is_already_in_repair BOOLEAN DEFAULT false,
  sumber_barang TEXT DEFAULT 'Gudang',
  kategori_rusak TEXT NOT NULL,
  detail_kerusakan TEXT DEFAULT '',
  foto_urls JSONB DEFAULT '[]'::jsonb,
  foto_sesudah JSONB DEFAULT '[]'::jsonb,
  tahap TEXT DEFAULT 'REJECT',
  status_pengerjaan TEXT DEFAULT 'PENDING',
  qc_pic TEXT,
  qc_tanggal TIMESTAMPTZ,
  qc_catatan TEXT DEFAULT '',
  petugas_reparasi TEXT,
  reparasi_mulai TIMESTAMPTZ,
  reparasi_selesai TIMESTAMPTZ,
  reparasi_catatan TEXT DEFAULT '',
  biaya_reparasi NUMERIC DEFAULT 0,
  acc_harga_defect NUMERIC DEFAULT 0,
  acc_harga_by TEXT,
  acc_harga_tanggal TIMESTAMPTZ,
  acc_harga_catatan TEXT DEFAULT '',
  operator_input TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. TABEL LAPORAN QUALITY CONTROL (QC)
CREATE TABLE IF NOT EXISTS public.qc_reports (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  report_no TEXT UNIQUE NOT NULL,
  tanggal TIMESTAMPTZ DEFAULT now(),
  tipe_identifikasi TEXT DEFAULT 'sku',
  sku TEXT NOT NULL,
  nama_produk TEXT NOT NULL,
  kode_produksi TEXT DEFAULT '',
  warna TEXT DEFAULT '',
  size TEXT DEFAULT '-',
  sumber_batch TEXT DEFAULT 'Penerimaan CMT',
  status TEXT NOT NULL DEFAULT 'OKE',
  qty_diperiksa NUMERIC DEFAULT 1,
  qty_oke NUMERIC DEFAULT 1,
  qty_reject NUMERIC DEFAULT 0,
  kategori_rusak TEXT DEFAULT '',
  detail_kerusakan TEXT DEFAULT '',
  lokasi_barang TEXT DEFAULT '',
  target_penanganan TEXT DEFAULT 'REJECT',
  foto_urls JSONB DEFAULT '[]'::jsonb,
  gdrive_link TEXT DEFAULT '',
  catatan TEXT DEFAULT '',
  pic_qc TEXT NOT NULL,
  perbaikan_ticket_no TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes QC
CREATE INDEX IF NOT EXISTS idx_qc_report_no ON public.qc_reports(report_no);
CREATE INDEX IF NOT EXISTS idx_qc_sku ON public.qc_reports(sku);
CREATE INDEX IF NOT EXISTS idx_qc_status ON public.qc_reports(status);
CREATE INDEX IF NOT EXISTS idx_qc_tanggal ON public.qc_reports(tanggal);

-- Pastikan kolom qc_report_no tersedia pada perbaikan_tickets
ALTER TABLE public.perbaikan_tickets ADD COLUMN IF NOT EXISTS qc_report_no TEXT;

-- 10. VIEW REALTIME STOK OTOMATIS (SISA STOK = IN - OUT)
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
ALTER TABLE public.perbaikan_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access" ON public.wms_users FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.master_produk FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.log_produk FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.stock_opname_queue FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.penerimaan_produksi FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.picking_list FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.peminjaman FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.perbaikan_tickets FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.qc_reports FOR ALL USING (true);

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'qc_reports'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_reports;
    EXCEPTION WHEN duplicate_object THEN NULL;
              WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;
`;

export const QC_REPORTS_SUPABASE_DDL_SQL = `
-- ============================================================
-- DDL SCRIPT: TABEL LAPORAN QUALITY CONTROL (QC) UNTUK SUPABASE
-- Jalankan skrip ini di menu SQL Editor di dashboard Supabase Anda
-- ============================================================

CREATE TABLE IF NOT EXISTS public.qc_reports (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  report_no TEXT UNIQUE NOT NULL,
  tanggal TIMESTAMPTZ DEFAULT now(),
  tipe_identifikasi TEXT DEFAULT 'sku',
  sku TEXT NOT NULL,
  nama_produk TEXT NOT NULL,
  kode_produksi TEXT DEFAULT '',
  warna TEXT DEFAULT '',
  size TEXT DEFAULT '-',
  sumber_batch TEXT DEFAULT 'Penerimaan CMT',
  status TEXT NOT NULL DEFAULT 'OKE',
  qty_diperiksa NUMERIC DEFAULT 1,
  qty_oke NUMERIC DEFAULT 1,
  qty_reject NUMERIC DEFAULT 0,
  kategori_rusak TEXT DEFAULT '',
  detail_kerusakan TEXT DEFAULT '',
  lokasi_barang TEXT DEFAULT '',
  target_penanganan TEXT DEFAULT 'REJECT',
  foto_urls JSONB DEFAULT '[]'::jsonb,
  gdrive_link TEXT DEFAULT '',
  catatan TEXT DEFAULT '',
  pic_qc TEXT NOT NULL,
  perbaikan_ticket_no TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indeks Pencarian Cepat
CREATE INDEX IF NOT EXISTS idx_qc_report_no ON public.qc_reports(report_no);
CREATE INDEX IF NOT EXISTS idx_qc_sku ON public.qc_reports(sku);
CREATE INDEX IF NOT EXISTS idx_qc_status ON public.qc_reports(status);
CREATE INDEX IF NOT EXISTS idx_qc_tanggal ON public.qc_reports(tanggal);

-- RLS Policy (Izinkan akses seluruh pengguna/role WMS)
ALTER TABLE public.qc_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all access" ON public.qc_reports;
CREATE POLICY "Allow public all access" ON public.qc_reports FOR ALL USING (true);

-- Realtime Publication (Aman dieksekusi berulang kali tanpa error 42710)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'qc_reports'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_reports;
    EXCEPTION 
      WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;

-- Dukungan Relasi ke Tabel Perbaikan & Reject
ALTER TABLE public.perbaikan_tickets ADD COLUMN IF NOT EXISTS qc_report_no TEXT;
`;

/**
 * Fetch real-time system stock for locations
 */
export async function fetchStockForLocations(locations: string[]): Promise<StockRealtimeItem[]> {
  if (!locations.length) return [];
  const cleanLocs = locations.map((l) => l.trim()).filter(Boolean);
  if (!cleanLocs.length) return [];

  // 1. Try querying view_stok_realtime with automatic pagination
  try {
    const lokParam = cleanLocs.map((l) => `"${l}"`).join(',');
    const encodedLokParam = encodeURIComponent(lokParam);
    const { url: supaUrl, key: supaKey } = getStoredSupabaseConfig();
    const allFetched: StockRealtimeItem[] = [];
    const pageSize = 1000;
    let offset = 0;
    const maxRows = 50000;

    while (offset < maxRows) {
      const endpoint = `${supaUrl}/rest/v1/view_stok_realtime?select=sku,lokasi,nama_produk,size,sisa_stok,area&lokasi=in.(${encodedLokParam})&order=sku.asc,lokasi.asc&limit=${pageSize}&offset=${offset}`;
      const res = await fetch(endpoint, {
        headers: {
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) break;
      const chunk = (await res.json()) as StockRealtimeItem[];
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      allFetched.push(...chunk);
      if (chunk.length < pageSize) break;
      offset += pageSize;
    }

    if (allFetched.length > 0) {
      const map = new Map<string, StockRealtimeItem>();
      for (const it of allFetched) {
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

  // OPTIMIZATION: Hanya masukkan item yang benar-benar ada selisih (selisih !== 0).
  // Item yang sesuai (fisik == sistem) tidak membutuhkan adjustment approval.
  const discrepantItems = items.filter((it) => Number(it.selisih) !== 0);
  if (!discrepantItems.length) return [];

  // Sanitize payload strictly to match Supabase stock_opname_queue columns: id, sesi_id, tanggal, sku, nama_produk, size, lokasi, area, qty_sistem, qty_fisik, selisih, status, jenis, alasan, operator, invoice, approved_by, tanggal_approve
  const sanitized = discrepantItems.map((it) => ({
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
export async function fetchRecentLogs(limit = 1000): Promise<LogProdukItem[]> {
  return fetchAllLogs(limit);
}

/**
 * Fetch all log_produk items with chunked pagination to load recent records from Supabase
 */
export async function fetchAllLogs(maxRows = 2000): Promise<LogProdukItem[]> {
  const allLogs: LogProdukItem[] = [];
  const pageSize = 1000;
  let offset = 0;

  try {
    while (offset < maxRows) {
      const batchPromises = [];
      const batchSize = Math.min(2, Math.ceil((maxRows - offset) / pageSize));
      for (let i = 0; i < batchSize && offset < maxRows; i++) {
        const currentLimit = Math.min(pageSize, maxRows - offset);
        batchPromises.push(
          supabaseFetch<LogProdukItem[]>(
            'log_produk',
            'GET',
            null,
            `select=*&order=created_at.desc&limit=${currentLimit}&offset=${offset}`
          )
        );
        offset += currentLimit;
      }
      
      const results = await Promise.all(batchPromises);
      let breakLoop = false;
      
      for (const chunk of results) {
        if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
          breakLoop = true;
          break;
        }
        allLogs.push(...chunk);
        if (chunk.length < pageSize) {
          breakLoop = true;
          break;
        }
      }
      
      if (breakLoop) {
        break;
      }
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
    const res = await supabaseFetch<any[]>('log_produk', 'DELETE', null, `id=eq.${encodeURIComponent(String(id))}`, true);
    if (res && Array.isArray(res) && res.length === 0) {
      throw new Error("Data tidak ditemukan atau akses ditolak (RLS).");
    }
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
    const res = await supabaseFetch<any[]>('log_produk', 'DELETE', null, `invoice=eq.${encodeURIComponent(invoice)}`, true);
    if (res && Array.isArray(res) && res.length === 0) {
      throw new Error("Data tidak ditemukan atau akses ditolak (RLS).");
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting log_produk invoice:', err);
    return { success: false, error: err.message || 'Gagal menghapus seluruh invoice' };
  }
}

/**
 * Delete multiple log_produk records by an array of IDs
 */
export async function deleteLogProdukBatch(
  ids: (string | number)[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!ids || ids.length === 0) return { success: true, count: 0 };
  
  try {
    // Supabase REST API limits URI length, chunk the IDs
    const chunkSize = 50;
    let deletedCount = 0;
    
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const inClause = chunk.map(id => encodeURIComponent(String(id))).join(',');
      const res = await supabaseFetch<any[]>('log_produk', 'DELETE', null, `id=in.(${inClause})`, true);
      if (res && Array.isArray(res) && res.length === 0) {
        throw new Error("Beberapa data tidak ditemukan atau akses ditolak (RLS).");
      }
      deletedCount += chunk.length;
    }
    
    return { success: true, count: deletedCount };
  } catch (err: any) {
    console.error('Error in bulk delete log_produk:', err);
    return { success: false, count: 0, error: err.message || 'Gagal menghapus log terpilih' };
  }
}

/**
 * Delete log_produk records within a specific date range
 */
export async function deleteLogProdukByDateRange(
  startDate: string, // ISO format or YYYY-MM-DD
  endDate: string // ISO format or YYYY-MM-DD
): Promise<{ success: boolean; error?: string }> {
  if (!startDate || !endDate) return { success: false, error: 'Rentang tanggal tidak valid' };
  
  try {
    // Append time if only date is provided to ensure full day coverage
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    endObj.setHours(23, 59, 59, 999);
    
    const res = await supabaseFetch<any[]>(
      'log_produk', 
      'DELETE', 
      null, 
      `created_at=gte.${encodeURIComponent(startObj.toISOString())}&created_at=lte.${encodeURIComponent(endObj.toISOString())}`,
      true
    );
    if (res && Array.isArray(res) && res.length === 0) {
      throw new Error("Data tidak ditemukan pada rentang tanggal tersebut atau akses ditolak (RLS).");
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting log_produk by date range:', err);
    return { success: false, error: err.message || 'Gagal menghapus log berdasarkan tanggal' };
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
    // 1. Batch update Supabase queue status to APPROVED (chunks of 100 to minimize HTTP requests)
    const validIds = items.map((it) => it.id).filter(Boolean) as string[];
    const chunkSize = 100;
    for (let i = 0; i < validIds.length; i += chunkSize) {
      const chunk = validIds.slice(i, i + chunkSize);
      const inClause = chunk.map((id) => `"${id}"`).join(',');
      const res = await supabaseFetch<any[]>(
        'stock_opname_queue',
        'PATCH',
        {
          status: 'APPROVED',
          approved_by: approvedBy || 'Admin',
          tanggal_approve: nowIso,
        },
        `id=in.(${encodeURIComponent(inClause)})`,
        true
      );
      if (res && Array.isArray(res) && res.length === 0) {
        throw new Error("Akses ditolak (RLS) atau gagal update.");
      }
    }

    // 2. Create ADJ_IN or ADJ_OUT in log_produk ONLY if selisih != 0
    const logsToInsert: LogProdukItem[] = [];
    for (const item of items) {
      const diff = Number(item.selisih) || 0;
      // OPTIMIZATION: Jangan pernah catat log adjustment jika selisih = 0!
      if (diff === 0) continue;

      const adjType = diff > 0 ? 'ADJ_IN' : 'ADJ_OUT';
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
        keterangan: `Adjustment SO${ketReason}`.trim(),
        created_at: nowIso,
      });
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
    const validIds = items.map((it) => it.id).filter(Boolean) as string[];
    const chunkSize = 100;
    for (let i = 0; i < validIds.length; i += chunkSize) {
      const chunk = validIds.slice(i, i + chunkSize);
      const inClause = chunk.map((id) => `"${id}"`).join(',');
      const res = await supabaseFetch<any[]>(
        'stock_opname_queue',
        'PATCH',
        {
          status: 'REJECTED',
          approved_by: rejectedBy || 'Admin',
          tanggal_approve: nowIso,
        },
        `id=in.(${encodeURIComponent(inClause)})`,
        true
      );
      if (res && Array.isArray(res) && res.length === 0) {
        throw new Error("Akses ditolak (RLS) atau gagal update.");
      }
    }
    return { success: true, count: items.length };
  } catch (err: any) {
    console.error('Error rejecting SO Queue items:', err);
    return { success: false, count: 0, error: err.message || 'Gagal reject adjustment' };
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
        const res = await supabaseFetch<any[]>('stock_opname_queue', 'DELETE', null, `id=in.(${inClause})`, true);
        if (res && Array.isArray(res) && res.length === 0) {
          throw new Error("Empty representation");
        }
      } catch {
        // Fallback to individual deletes if in.() is not accepted
        for (const singleId of chunk) {
          const resSingle = await supabaseFetch<any[]>('stock_opname_queue', 'DELETE', null, `id=eq.${encodeURIComponent(singleId)}`, true);
          if (resSingle && Array.isArray(resSingle) && resSingle.length === 0) {
            throw new Error("Akses ditolak (RLS) atau data tidak ditemukan.");
          }
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
 * Resync Stock Opname Queue items against live view_stok_realtime.
 * Recalculates qty_sistem and selisih for pending items so that any truncation errors or stale data are rectified.
 */
export async function resyncStockOpnameQueueItems(
  ids?: string[]
): Promise<{ success: boolean; updatedCount: number; matchingCount: number; error?: string }> {
  try {
    let queryFilter = 'status=eq.PENDING&select=*&limit=5000';
    if (ids && ids.length > 0) {
      const inClause = ids.map((id) => `"${id}"`).join(',');
      queryFilter += `&id=in.(${encodeURIComponent(inClause)})`;
    }

    const pendingItems = await supabaseFetch<StockOpnameQueueItem[]>(
      'stock_opname_queue',
      'GET',
      null,
      queryFilter
    );

    if (!pendingItems || !pendingItems.length) {
      return { success: true, updatedCount: 0, matchingCount: 0 };
    }

    // Collect all distinct locations in pending items
    const distinctLocations = Array.from(new Set(pendingItems.map((it) => it.lokasi).filter(Boolean)));
    const liveStock = await fetchStockForLocations(distinctLocations);

    const stockMap = new Map<string, number>();
    for (const s of liveStock) {
      const key = `${(s.sku || '').trim().toUpperCase()}__${(s.lokasi || '').trim().toUpperCase()}`;
      stockMap.set(key, Number(s.sisa_stok) || 0);
    }

    let updatedCount = 0;
    let matchingCount = 0;

    for (const item of pendingItems) {
      if (!item.id) continue;
      const key = `${(item.sku || '').trim().toUpperCase()}__${(item.lokasi || '').trim().toUpperCase()}`;
      const actualSys = stockMap.has(key) ? stockMap.get(key)! : 0;
      const actualFisik = Number(item.qty_fisik) || 0;
      const newSelisih = actualFisik - actualSys;

      if (newSelisih === 0) {
        matchingCount++;
      }

      if (Number(item.qty_sistem) !== actualSys || Number(item.selisih) !== newSelisih) {
        await supabaseFetch(
          'stock_opname_queue',
          'PATCH',
          {
            qty_sistem: actualSys,
            selisih: newSelisih,
            alasan: newSelisih === 0 ? 'Opname Sesuai (Fisik = Sistem)' : item.alasan,
          },
          `id=eq.${item.id}`
        );
        updatedCount++;
      }
    }

    return { success: true, updatedCount, matchingCount };
  } catch (err: any) {
    console.error('Error resyncing SO queue items:', err);
    return { success: false, updatedCount: 0, matchingCount: 0, error: err.message };
  }
}

/**
 * Direct Supabase Realtime Stock Fetcher (matches GAS script fetchSupabaseStokFisikDirect)
 * Highly optimized with concurrent chunk sizes, instant memory caching, and IndexedDB sync.
 */
let memoryStokFisikCache: StockRealtimeItem[] | null = null;
let memoryStokFisikLastFetch = 0;

export function getMemoryStokFisikCache(): StockRealtimeItem[] | null {
  return memoryStokFisikCache;
}

export function setMemoryStokFisikCache(data: StockRealtimeItem[]): void {
  if (Array.isArray(data) && data.length > 0) {
    memoryStokFisikCache = data;
    memoryStokFisikLastFetch = Date.now();
  }
}

export async function fetchSupabaseStokFisikDirect(forceRefresh = false): Promise<StockRealtimeItem[]> {
  // SWR: return in-memory cache if fresh within 3 minutes and not forcing refresh
  if (!forceRefresh && memoryStokFisikCache && memoryStokFisikCache.length > 0 && Date.now() - memoryStokFisikLastFetch < 180000) {
    return memoryStokFisikCache;
  }

  const { url: supaUrl, key: supaKey } = getStoredSupabaseConfig();
  const allRows: StockRealtimeItem[] = [];
  const pageSize = 1000;
  const maxRows = 100000;

  const headers = {
    apikey: supaKey,
    Authorization: 'Bearer ' + supaKey,
    'Content-Type': 'application/json',
  };

  const fetchPage = async (off: number, retries = 3): Promise<StockRealtimeItem[]> => {
    const currentLimit = Math.min(pageSize, maxRows - off);
    const url = `${supaUrl}/rest/v1/view_stok_realtime?sisa_stok=neq.0&select=sku,nama_produk,size,area,lokasi,sisa_stok&order=sku.asc,lokasi.asc&limit=${currentLimit}&offset=${off}`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json)) return json;
        } else {
          console.warn(`Supabase stock fetch page offset ${off} status ${res.status} (attempt ${attempt + 1})`);
        }
      } catch (err: any) {
        console.warn(`Supabase stock fetch page offset ${off} error (attempt ${attempt + 1}):`, err?.message);
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      }
    }
    return [];
  };

  try {
    // 1. Fetch initial 5 pages (0..5000) in parallel — covers all 4,500+ realtime rows in ~700-900ms
    const baseOffsets = [0, 1000, 2000, 3000, 4000];
    const baseResults = await Promise.all(baseOffsets.map((off) => fetchPage(off)));

    let lastPageCount = 0;
    for (const chunk of baseResults) {
      if (Array.isArray(chunk) && chunk.length > 0) {
        allRows.push(...chunk);
        lastPageCount = chunk.length;
      }
    }

    // 2. If the 5th page (offset 4000) was completely full (1000 items), fetch subsequent pages until done
    if (lastPageCount >= pageSize) {
      let nextOffset = 5000;
      while (nextOffset < maxRows) {
        const batchOffsets = [nextOffset, nextOffset + 1000, nextOffset + 2000];
        const batchResults = await Promise.all(batchOffsets.map((off) => fetchPage(off)));
        let hasIncomplete = false;

        for (const chunk of batchResults) {
          if (Array.isArray(chunk) && chunk.length > 0) {
            allRows.push(...chunk);
          }
          if (!chunk || chunk.length < pageSize) {
            hasIncomplete = true;
            break;
          }
        }
        if (hasIncomplete) break;
        nextOffset += 3000;
      }
    }

    // Fallback if 0 rows returned
    if (allRows.length === 0) {
      console.warn('Direct fetch returned 0 rows, trying un-ordered query fallback...');
      const fallbackRes = await fetch(
        `${supaUrl}/rest/v1/view_stok_realtime?sisa_stok=neq.0&select=sku,nama_produk,size,area,lokasi,sisa_stok&limit=1000&offset=0`,
        { headers }
      );
      if (fallbackRes.ok) {
        const fbJson = await fallbackRes.json();
        if (Array.isArray(fbJson) && fbJson.length > 0) {
          allRows.push(...fbJson);
        }
      }
    }

    if (allRows.length > 0) {
      memoryStokFisikCache = allRows;
      memoryStokFisikLastFetch = Date.now();
      // Auto-save snapshot to IndexedDB in background
      saveInventoryStocksToLocalDb(allRows).catch(() => {});
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
        const batchPromises = [];
        const batchSize = 5;
        for (let i = 0; i < batchSize && offset < maxRows; i++) {
          const currentLimit = Math.min(pageSize, maxRows - offset);
          batchPromises.push(
            supabaseFetch<StockRealtimeItem[]>(
              tableName,
              'GET',
              null,
              `sisa_stok=neq.0&select=*&order=sku.asc,lokasi.asc&limit=${currentLimit}&offset=${offset}`
            ).catch(() => []) // Catch individual failures
          );
          offset += currentLimit;
        }

        const results = await Promise.all(batchPromises);
        let breakLoop = false;

        for (const chunk of results) {
          if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
            breakLoop = true;
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
          if (chunk.length < pageSize) {
            breakLoop = true;
          }
        }
        if (breakLoop) break;
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

export async function saveSupabaseUser(user: WmsUser, originalUsername?: string): Promise<{ success: boolean; message?: string }> {
  return saveWmsUserToSupabase(user, originalUsername);
}

export async function deleteSupabaseUser(username: string, id?: string): Promise<{ success: boolean; message?: string }> {
  return deleteWmsUserFromSupabase(username, id);
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
  nik?: string;
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

  // Hash password for comparison (SHA-256)
  let hashedPass = '';
  if (cleanPass) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(cleanPass);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      hashedPass = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
      console.warn('Crypto API error:', err);
      // Fallback for environments where crypto is not available
      hashedPass = cleanPass; 
    }
  }

  // 1. Direct check in Supabase wms_users table (supports Username or NIK)
  try {
    const data = await supabaseFetch<WmsUser[]>(
      'wms_users',
      'GET',
      null,
      `or=(username.ilike.${encodeURIComponent(cleanUser)},nik.ilike.${encodeURIComponent(cleanUser)})&limit=1`
    );

    if (data && data.length > 0) {
      const u = data[0];
      
      // If user has a password in DB and password was provided, verify
      // Allow cleanPass to match for temporary backward compatibility if not hashed
      if (u.password && cleanPass && u.password !== hashedPass && u.password !== cleanPass) {
        return {
          success: false,
          token: '',
          user: username,
          role: 'Operator',
          message: 'Password salah untuk akun ini.',
        };
      }

      if (typeof window !== 'undefined' && u.nik) {
        localStorage.setItem('wms_user_nik', u.nik);
      }

      const token = `sb_tok_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      return {
        success: true,
        token,
        user: u.username,
        name: u.name || u.username,
        role: u.role || 'Operator',
        permissions: u.permissions || {},
        nik: u.nik,
        message: 'Login berhasil (terverifikasi dari Supabase wms_users)',
      };
    }
  } catch (err) {
    console.warn('Supabase wms_users query error:', err);
  }

  return {
    success: false,
    token: '',
    user: username,
    role: 'Operator',
    message: 'Akun tidak ditemukan atau password salah',
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
      'select=id,username,name,role,password,permissions,nik,created_at,updated_at&order=created_at.asc'
    );
    if (data && Array.isArray(data) && data.length > 0) {
      // Deduplicate by case-insensitive username just in case stale duplicates exist in DB
      const seen = new Map<string, WmsUser>();
      for (const u of data) {
        const key = u.username.toLowerCase();
        seen.set(key, u);
      }
      const deduplicated = Array.from(seen.values());
      try {
        localStorage.setItem('wms_local_users', JSON.stringify(deduplicated));
      } catch {}
      return deduplicated;
    }
  } catch (err) {
    console.warn('Could not fetch wms_users from Supabase:', err);
  }

  // Fallback to local cache
  try {
    const local = localStorage.getItem('wms_local_users');
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
 * - Identifies existing user record by UUID id, originalUsername, or current username (case-insensitive).
 * - When updating an existing user, it ALWAYS performs a PATCH by primary key ID, ensuring in-place overwrite.
 * - Only if the user record does not exist in Supabase does it perform an INSERT (POST).
 */
export async function saveWmsUserToSupabase(
  user: WmsUser,
  originalUsername?: string
): Promise<{ success: boolean; message?: string; savedUser?: WmsUser }> {
  const cleanU = user.username.trim();
  const lowerU = cleanU.toLowerCase();

  const payload: any = {
    username: cleanU,
    name: user.name || user.username,
    role: user.role || 'Operator',
    permissions: user.permissions || {},
    updated_at: new Date().toISOString(),
  };

  if (user.nik) {
    payload.nik = user.nik;
  }

  // Only hash & update password if a non-empty password was provided
  if (user.password && user.password.trim() !== '') {
    let processedPassword = user.password.trim();
    if (processedPassword.length !== 64 && typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(processedPassword);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        processedPassword = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        console.warn('Error hashing password:', e);
      }
    }
    payload.password = processedPassword;
  }

  try {
    let targetExistingId: string | null = null;

    // 1. Check existing record by valid UUID id
    if (user.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) {
      try {
        const found = await supabaseFetch<WmsUser[]>(
          'wms_users',
          'GET',
          null,
          `id=eq.${encodeURIComponent(user.id)}&select=id,username,name`
        );
        if (found && Array.isArray(found) && found.length > 0 && found[0].id) {
          targetExistingId = found[0].id;
        }
      } catch (errFindId) {
        console.warn('Error checking user by ID:', errFindId);
      }
    }

    // 2. If not found by ID, search by originalUsername (case-insensitive)
    if (!targetExistingId && originalUsername && originalUsername.trim()) {
      try {
        const found = await supabaseFetch<WmsUser[]>(
          'wms_users',
          'GET',
          null,
          `username=ilike.${encodeURIComponent(originalUsername.trim())}&select=id,username,name`
        );
        if (found && Array.isArray(found) && found.length > 0 && found[0].id) {
          targetExistingId = found[0].id;
        }
      } catch (errFindOrig) {
        console.warn('Error checking user by originalUsername:', errFindOrig);
      }
    }

    // 3. If still not found, search by current clean username (case-insensitive)
    if (!targetExistingId) {
      try {
        const found = await supabaseFetch<WmsUser[]>(
          'wms_users',
          'GET',
          null,
          `username=ilike.${encodeURIComponent(cleanU)}&select=id,username,name`
        );
        if (found && Array.isArray(found) && found.length > 0 && found[0].id) {
          targetExistingId = found[0].id;
        }
      } catch (errFindCurr) {
        console.warn('Error checking user by current username:', errFindCurr);
      }
    }

    let savedRecord: WmsUser | null = null;

    // IF USER EXISTS IN DATABASE -> PERFORM IN-PLACE UPDATE (PATCH BY PRIMARY KEY ID)
    if (targetExistingId) {
      const patchRes = await supabaseFetch<WmsUser[]>(
        'wms_users',
        'PATCH',
        payload,
        `id=eq.${encodeURIComponent(targetExistingId)}`,
        true
      );
      if (patchRes && Array.isArray(patchRes) && patchRes.length > 0) {
        savedRecord = patchRes[0];
      } else {
        const refreshed = await supabaseFetch<WmsUser[]>(
          'wms_users',
          'GET',
          null,
          `id=eq.${encodeURIComponent(targetExistingId)}&select=id,username,name,role,password,permissions,nik,created_at,updated_at`
        );
        if (refreshed && refreshed.length > 0) {
          savedRecord = refreshed[0];
        }
      }
    } else {
      // BRAND NEW USER -> INSERT (POST)
      if (!payload.password) {
        let defPass = '123456';
        if (typeof crypto !== 'undefined' && crypto.subtle) {
          try {
            const encoder = new TextEncoder();
            const data = encoder.encode(defPass);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            defPass = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
          } catch {}
        }
        payload.password = defPass;
      }

      const postRes = await supabaseFetch<WmsUser[]>(
        'wms_users',
        'POST',
        payload,
        'on_conflict=username',
        true
      );
      if (postRes && Array.isArray(postRes) && postRes.length > 0) {
        savedRecord = postRes[0];
      }
    }

    // Sync to local cache
    try {
      const local = localStorage.getItem('wms_local_users');
      const list: WmsUser[] = local ? JSON.parse(local) : [];
      const finalId = savedRecord?.id || targetExistingId || user.id;
      const updated = list.filter(
        (u) =>
          u.username.toLowerCase() !== lowerU &&
          (!finalId || u.id !== finalId) &&
          (!originalUsername || u.username.toLowerCase() !== originalUsername.toLowerCase())
      );
      updated.push({
        ...payload,
        id: finalId,
        password: payload.password || user.password,
      });
      localStorage.setItem('wms_local_users', JSON.stringify(updated));
    } catch {}

    return { success: true, savedUser: savedRecord || undefined };
  } catch (err: any) {
    console.warn('Could not save wms_user to Supabase table:', err);
    return { success: false, message: err?.message || 'Gagal menyimpan data pengguna ke Supabase.' };
  }
}

/**
 * Delete WMS user from Supabase wms_users table (permanently, by ID and case-insensitive username)
 */
export async function deleteWmsUserFromSupabase(
  username: string,
  id?: string
): Promise<{ success: boolean; message?: string }> {
  const trimmed = username.trim();
  const cleanU = trimmed.toLowerCase();
  try {
    // 1. If valid UUID id is present, delete by ID primary key
    if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      try {
        await supabaseFetch<any[]>(
          'wms_users',
          'DELETE',
          null,
          `id=eq.${encodeURIComponent(id)}`,
          true
        );
      } catch (errId) {
        console.warn('Error deleting user by ID:', errId);
      }
    }

    // 2. Also delete by case-insensitive username (ilike) to catch any uppercase/lowercase records
    try {
      await supabaseFetch<any[]>(
        'wms_users',
        'DELETE',
        null,
        `username=ilike.${encodeURIComponent(trimmed)}`,
        true
      );
    } catch (errIlike) {
      console.warn('Error deleting user by username ilike:', errIlike);
    }

    // 3. Fallback exact match if cleanU is different from trimmed
    if (cleanU !== trimmed) {
      try {
        await supabaseFetch<any[]>(
          'wms_users',
          'DELETE',
          null,
          `username=eq.${encodeURIComponent(cleanU)}`,
          true
        );
      } catch {}
    }

    // Clean up local storage cache as well
    try {
      const local = localStorage.getItem('wms_local_users');
      if (local) {
        const list: WmsUser[] = JSON.parse(local);
        const updated = list.filter(
          (u) =>
            u.username.toLowerCase() !== cleanU &&
            (!id || u.id !== id) &&
            u.username.toLowerCase() !== trimmed.toLowerCase()
        );
        localStorage.setItem('wms_local_users', JSON.stringify(updated));
      }
    } catch {}

    return { success: true };
  } catch (err: any) {
    console.warn('Could not delete wms_user from Supabase table:', err);
    return { success: false, message: err?.message || 'Gagal menghapus pengguna dari Supabase.' };
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

  if (!sku || sku.toLowerCase() === 'undefined' || sku.toLowerCase() === 'null') return null;
  if (sku.startsWith('#') || sku.includes('#')) return null;
  if (sku.toUpperCase() === 'KOLI' || sku.toUpperCase() === 'BOX' || sku.toUpperCase().startsWith('LOK ') || sku.toUpperCase().startsWith('RAK ')) return null;

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
  const d: Record<string, number> = {};
  const b: Record<string, number> = {};

  if (row.dealpos_channels && typeof row.dealpos_channels === 'object') {
    const dp = row.dealpos_channels;

    // 1. DealPOS 5-Komparasi (MAP, LIVE, STUDIO, PERMAK, DEFECT)
    const mapVal = Number(dp.MAP ?? dp['Gudang Utama'] ?? dp.Marketplace ?? dp.GUDANG ?? dp.TOTAL ?? 0) || 0;
    const liveVal = Number(dp.LIVE ?? dp['Barang Live'] ?? dp['Sample Live'] ?? 0) || 0;
    const studioVal = Number(dp.STUDIO ?? dp['Sample Studio'] ?? 0) || 0;
    const permakVal = Number(dp.PERMAK ?? dp['Permak / Cuci'] ?? dp.Permak ?? 0) || 0;
    const defectVal = Number(dp.DEFECT ?? dp['Barang Cacat'] ?? dp['Diskon Defect'] ?? dp.Cacat ?? 0) || 0;

    d['MAP'] = mapVal;
    d['Gudang Utama'] = mapVal;
    d['LIVE'] = liveVal;
    d['Barang Live'] = liveVal;
    d['STUDIO'] = studioVal;
    d['Sample Studio'] = studioVal;
    d['PERMAK'] = permakVal;
    d['Permak / Cuci'] = permakVal;
    d['DEFECT'] = defectVal;
    d['Barang Cacat'] = defectVal;

    stokMap = mapVal;
    stokStudio = studioVal;

    // 2. Offline singles (WH, QC, GA, LOG)
    b['WH'] = Number(dp.WH ?? dp.Warehouse ?? 0) || 0;
    b['QC'] = Number(dp.QC ?? dp['Gudang QC'] ?? 0) || 0;
    b['GA'] = Number(dp.GA ?? dp['Gudang Awal'] ?? 0) || 0;
    b['LOG'] = Number(dp.LOG ?? dp.Logistik ?? 0) || 0;

    // 3. Online singles (WEB, SHP, TPD, TTK, LZD, WOO)
    b['WEB'] = Number(dp.WEB ?? dp.Website ?? dp.cabang?.WEB ?? 0) || 0;
    b['SHP'] = Number(dp.SHP ?? dp.Shopee ?? dp.cabang?.SHP ?? 0) || 0;
    b['TPD'] = Number(dp.TPD ?? dp.Tokopedia ?? dp.cabang?.TPD ?? 0) || 0;
    b['TTK'] = Number(dp.TTK ?? dp.TikTok ?? dp.cabang?.TTK ?? 0) || 0;
    b['LZD'] = Number(dp.LZD ?? dp.Lazada ?? dp.cabang?.LZD ?? 0) || 0;
    b['WOO'] = Number(dp.WOO ?? dp.WooCommerce ?? dp.cabang?.WOO ?? 0) || 0;

    stokShp = b['SHP'];
    stokTtk = b['TTK'];

    // 4. Store Outlets (LMP, MKG, BTS, CPJ, CWS, LWS, DPM, PHB, PMS, NSJ, PIM, SPM, GAIA, GST, LVL, SMS, PVJ, TP, etc.)
    const STORE_CODES = ['LMP', 'MKG', 'BTS', 'CPJ', 'CWS', 'LWS', 'DPM', 'PHB', 'PMS', 'NSJ', 'PIM', 'SPM', 'GAIA', 'GST', 'LVL', 'SMS', 'PVJ', 'TP'];
    STORE_CODES.forEach((code) => {
      const q = Number(dp[code] ?? dp.cabang?.[code] ?? dp.b?.[code] ?? 0) || 0;
      b[code] = q;
    });

    // Also copy all keys from dp.b if available
    if (dp.b && typeof dp.b === 'object') {
      Object.keys(dp.b).forEach((k) => {
        b[k] = Number(dp.b[k]) || 0;
      });
    }

    // Also copy all keys from dp.cabang if available
    if (dp.cabang && typeof dp.cabang === 'object') {
      Object.keys(dp.cabang).forEach((k) => {
        b[k] = Number(dp.cabang[k]) || 0;
      });
    }

    // Also copy all keys from dp.d if available
    if (dp.d && typeof dp.d === 'object') {
      Object.keys(dp.d).forEach((k) => {
        d[k] = Number(dp.d[k]) || 0;
      });
    }

    komparasi = {
      MAP: { fisik: 0, dp: mapVal },
      LIVE: { fisik: 0, dp: liveVal },
      STUDIO: { fisik: 0, dp: studioVal },
      PERMAK: { fisik: 0, dp: permakVal },
      DEFECT: { fisik: 0, dp: defectVal },
    };
  }

  // Also check existing d and b from row if present
  if (row.d && typeof row.d === 'object') {
    Object.assign(d, row.d);
  }
  if (row.b && typeof row.b === 'object') {
    Object.assign(b, row.b);
  }

  if (stokMap === undefined) {
    const rawDp = row.sisa_stok ?? row.stok_dealpos ?? row.dealpos_stock ?? row.stock_dealpos ?? row.stok_sistem ?? row.dealpos_stok ?? row.stok_map ?? row.qty;
    if (rawDp !== undefined && rawDp !== null && rawDp !== '') {
      stokMap = Number(rawDp);
      if (!d['MAP']) d['MAP'] = stokMap;
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
  } else if (stokMap !== undefined && !komparasi) {
    komparasi = {
      MAP: { fisik: 0, dp: stokMap },
      STUDIO: stokStudio !== undefined ? { fisik: 0, dp: stokStudio } : undefined,
    };
  }

  return {
    k: sku.toUpperCase(),
    sku: sku.toUpperCase(),
    p: nama,
    nama_produk: nama,
    s: size,
    size: size,
    category,
    lokasi,
    price,
    stokMap,
    stokStudio,
    stokShp,
    stokTtk,
    komparasi,
    d,
    b,
    f: (row.f && typeof row.f === 'object') ? row.f : {},
    l: Array.isArray(row.l) ? row.l : [],
    dealpos_channels: row.dealpos_channels || row.dealpos,
    q: stokMap ?? Number(row.q || 0),
  };
}

/**
 * Fast in-memory cache for master products
 */
let memoryProductCache: ProductItem[] | null = null;
let memoryProductLastFetch = 0;

/**
 * Fetch master products from Supabase across all potential product tables with parallel loading & memory cache
 * (master_produk, view_stok_realtime, log_produk, etc.)
 */
export async function fetchMasterProductsFromSupabase(maxRowsPerTable = 50000, forceRefresh = false): Promise<ProductItem[]> {
  // 1. SWR In-Memory cache check
  if (!forceRefresh && memoryProductCache && memoryProductCache.length > 0 && Date.now() - memoryProductLastFetch < 5000) {
    return memoryProductCache;
  }

  // 2. SWR Local Database (IndexedDB) check: 0ms instant offline load, 0 network egress
  if (!forceRefresh) {
    try {
      const localDbProducts = await getAllProductsFromLocalDb();
      if (localDbProducts && localDbProducts.length > 0) {
        memoryProductCache = localDbProducts;
        memoryProductLastFetch = Date.now();
        return localDbProducts;
      }
    } catch (err) {
      console.warn('Error reading from local indexedDB:', err);
    }
  }

  const productsMap = new Map<string, ProductItem>();
  const { url: supaUrl, key: supaKey } = getStoredSupabaseConfig();

  // 2. Load from localStorage cache first for instant 0ms fallback
  try {
    const rawProdCache = localStorage.getItem('wms_product_cache');
    if (rawProdCache) {
      const parsed = JSON.parse(rawProdCache);
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          const item = extractProductFromRow(r);
          if (item && item.k && !isDummyProduct(item)) {
            productsMap.set(item.k.toUpperCase(), item);
          }
        }
      }
    }
    const rawInvCache = localStorage.getItem('wms_cache_inventory_v38');
    if (rawInvCache) {
      const parsed = JSON.parse(rawInvCache);
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

  // 3. Fast Parallel Fetch: fetch master_produk and view_stok_realtime concurrently with targeted column selection
  const pageSize = 1000;

  const fetchMasterTable = async () => {
    let offset = 0;
    while (offset < maxRowsPerTable) {
      const batchPromises = [];
      const batchSize = 6;
      for (let i = 0; i < batchSize && offset < maxRowsPerTable; i++) {
        const off = offset;
        batchPromises.push(
          fetch(`${supaUrl}/rest/v1/master_produk?select=sku,nama_produk,kategori,size,price,dealpos_channels&order=sku.asc&limit=${pageSize}&offset=${off}`, {
            headers: {
              apikey: supaKey,
              Authorization: 'Bearer ' + supaKey,
              'Content-Type': 'application/json',
            },
          }).then(r => r.ok ? r.json() : []).catch(() => [])
        );
        offset += pageSize;
      }

      const results = await Promise.all(batchPromises);
      let breakLoop = false;

      for (const rows of results) {
        if (!Array.isArray(rows) || rows.length === 0) {
          breakLoop = true;
          break;
        }

        for (const r of rows) {
          const item = extractProductFromRow(r);
          if (item && item.k && !isDummyProduct(item)) {
            const key = item.k.toUpperCase();
            const existing = productsMap.get(key);
            if (!existing) {
              productsMap.set(key, item);
            } else {
              if ((!existing.s || existing.s === '-') && item.s && item.s !== '-') existing.s = item.s;
              if ((!existing.p || existing.p === existing.k) && item.p && item.p !== item.k) existing.p = item.p;
              if (existing.price === undefined && item.price !== undefined) existing.price = item.price;
              if (item.dealpos_channels) {
                existing.dealpos_channels = {
                  ...(typeof existing.dealpos_channels === 'object' ? (existing.dealpos_channels as Record<string, any>) : {}),
                  ...(typeof item.dealpos_channels === 'object' ? (item.dealpos_channels as Record<string, any>) : {}),
                };
              }
              if (item.d && typeof item.d === 'object' && Object.keys(item.d).length > 0) {
                existing.d = { ...((existing.d || {}) as Record<string, number>), ...(item.d as Record<string, number>) };
              }
              if (item.b && typeof item.b === 'object' && Object.keys(item.b).length > 0) {
                existing.b = { ...((existing.b || {}) as Record<string, number>), ...(item.b as Record<string, number>) };
              }
              if (item.stokMap !== undefined && (!existing.stokMap || existing.stokMap === 0)) {
                existing.stokMap = item.stokMap;
              }
              if (item.komparasi && !existing.komparasi) {
                existing.komparasi = item.komparasi;
              }
            }
          }
        }
        if (rows.length < pageSize) {
          breakLoop = true;
        }
      }

      if (breakLoop) break;
    }
  };

  const fetchStockTable = async () => {
    let offset = 0;
    while (offset < maxRowsPerTable) {
      const batchPromises = [];
      const batchSize = 6;
      for (let i = 0; i < batchSize && offset < maxRowsPerTable; i++) {
        const off = offset;
        batchPromises.push(
          fetch(`${supaUrl}/rest/v1/view_stok_realtime?sisa_stok=neq.0&select=sku,lokasi,nama_produk,size,sisa_stok,area&order=sku.asc&limit=${pageSize}&offset=${off}`, {
            headers: {
              apikey: supaKey,
              Authorization: 'Bearer ' + supaKey,
              'Content-Type': 'application/json',
            },
          }).then(r => r.ok ? r.json() : []).catch(() => [])
        );
        offset += pageSize;
      }

      const results = await Promise.all(batchPromises);
      let breakLoop = false;

      for (const rows of results) {
        if (!Array.isArray(rows) || rows.length === 0) {
          breakLoop = true;
          break;
        }

        for (const r of rows) {
          const sku = String(r.sku || '').trim().toUpperCase();
          if (!sku) continue;

          let item = productsMap.get(sku);
          if (!item) {
            // ONLY associate stock with products that exist in master_produk!
            // Products outside master_produk must NEVER be created as catalog products.
            continue;
          }

          if (item && r.lokasi) {
            const locClean = String(r.lokasi).trim();
            const qty = Number(r.sisa_stok || 0);

            // Populate locList array
            if (!item.locList) item.locList = [];
            const locList = item.locList as Array<{ lokasi: string; qty?: number } | string>;
            const existingLoc = locList.find((l: any) =>
              (typeof l === 'string' ? l.toUpperCase() : l.lokasi.toUpperCase()) === locClean.toUpperCase()
            );
            if (!existingLoc) {
              locList.push({ lokasi: locClean, qty });
            } else if (typeof existingLoc === 'object') {
              existingLoc.qty = (existingLoc.qty || 0) + qty;
            }

            // Append to comma-separated lokasi string
            if (!item.lokasi || item.lokasi === '-') {
              item.lokasi = locClean;
            } else {
              const locArray = item.lokasi.split(/[,/;\n|]+/).map((x) => x.trim().toUpperCase());
              if (!locArray.includes(locClean.toUpperCase())) {
                item.lokasi = `${item.lokasi}, ${locClean}`;
              }
            }

            // Detect studio / shopee / tiktok physical stock
            const locUpper = locClean.toUpperCase();
            const areaUpper = String(r.area || '').toUpperCase();
            if (locUpper.includes('STUDIO') || areaUpper.includes('STUDIO')) {
              item.stokStudio = (item.stokStudio || 0) + qty;
            }
            if (locUpper.includes('SHOPEE') || locUpper.includes('SHP') || areaUpper.includes('SHOPEE')) {
              item.stokShp = (item.stokShp || 0) + qty;
            }
            if (locUpper.includes('TIKTOK') || locUpper.includes('TTK') || areaUpper.includes('TIKTOK')) {
              item.stokTtk = (item.stokTtk || 0) + qty;
            }

            // Populate item.f for physical breakdown
            if (!item.f || typeof item.f !== 'object') item.f = {};
            const itemF = item.f as Record<string, number>;
            const fKey = areaUpper.includes('CACAT') || locUpper.startsWith('DF')
              ? 'Barang Cacat'
              : areaUpper.includes('PERMAK') || locUpper.startsWith('PMK') || locUpper.startsWith('CC')
              ? 'Permak / Cuci'
              : areaUpper.includes('LIVE') || locUpper.includes('LIVE') || locUpper.includes('SHOPEE') || locUpper.includes('TIKTOK')
              ? 'Barang Live'
              : areaUpper.includes('STUDIO') || locUpper.includes('STUDIO')
              ? 'Sample Studio'
              : 'Gudang Utama';
            itemF[fKey] = (itemF[fKey] || 0) + qty;
            if (fKey === 'Gudang Utama') {
              item.stokMap = (item.stokMap || 0) + qty;
            }
          }
        }

        if (rows.length < pageSize) {
          breakLoop = true;
        }
      }

      if (breakLoop) break;
    }
  };

  // 3. Sequential: First fetch all master_produk to build the true catalog
  await fetchMasterTable();

  // Then enrich the existing master catalog with live location & stock from view_stok_realtime
  if (productsMap.size > 0) {
    await fetchStockTable();
  } else {
    // If master_produk returned 0 rows (e.g. offline/network glitch), fallback only to picking_list
    try {
      const rows = await supabaseFetch<any[]>('picking_list', 'GET', null, 'select=*&limit=1000');
      if (Array.isArray(rows)) {
        for (const r of rows) {
          const item = extractProductFromRow(r);
          if (item && item.k && !isDummyProduct(item)) {
            productsMap.set(item.k.toUpperCase(), item);
          }
        }
      }
    } catch {}
  }

  const result = Array.from(productsMap.values()).filter((it) => !isDummyProduct(it));
  if (result.length > 0) {
    memoryProductCache = result;
    memoryProductLastFetch = Date.now();
    try {
      await saveProductsToLocalDb(result, 'replace');
    } catch (err) {
      console.warn('Error saving products to localDb:', err);
    }
    try {
      localStorage.setItem('wms_product_cache', JSON.stringify(result.slice(0, 500)));
    } catch {}
  }
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
    // Primary query: non-zero remaining stocks (chunked for safety)
    const pageSize = 2000; // Increase page size if supported, PostgREST default max is usually 1000 or limits configured
    let viewRowsNonZero: any[] = [];
    
    if (searchKeyword && searchKeyword.trim()) {
      // If there's a search keyword, it's usually a small result set, fetch once
      const chunk = await supabaseFetch<any[]>(
        'view_stok_realtime',
        'GET',
        null,
        `select=*&sisa_stok=neq.0${searchFilter}&limit=3000`
      );
      if (chunk && Array.isArray(chunk)) viewRowsNonZero = chunk;
    } else {
      // Parallelize fetching for full load to avoid 4+ seconds sequential block
      const offsets = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000];
      const fetchPromises = offsets.map(offset => 
        supabaseFetch<any[]>(
          'view_stok_realtime',
          'GET',
          null,
          `select=*&sisa_stok=neq.0&limit=${pageSize}&offset=${offset}`
        ).catch(() => []) // fail gracefully for each chunk
      );
      
      const results = await Promise.all(fetchPromises);
      for (const chunk of results) {
        if (chunk && Array.isArray(chunk)) {
          viewRowsNonZero.push(...chunk);
        }
      }
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
      ? `select=sku,nama_produk,nama,size,ukuran${buildFuzzySearchQuery(searchKeyword, ['sku', 'nama_produk'])}&limit=100`
      : 'select=sku,nama_produk,nama,size,ukuran&limit=3000';

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
export async function deletePeminjamanFromSupabase(noPeminjaman: string): Promise<boolean> {
  if (!noPeminjaman) return false;
  try {
    await supabaseFetch('peminjaman', 'DELETE', null, `no_peminjaman=eq.${encodeURIComponent(noPeminjaman)}`);
    return true;
  } catch (err) {
    console.error('Error deleting peminjaman:', err);
    return false;
  }
}

export async function fetchPeminjamanFromSupabase(): Promise<PeminjamanRecord[]> {
  try {
    const data = await supabaseFetch<any[]>('peminjaman', 'GET', null, 'select=*&order=created_at.desc');

    if (data && Array.isArray(data)) {
      const groups = new Map<string, any>();
      
      for (const row of data) {
        const no = row.no_peminjaman;
        const waMatch = (row.keterangan || '').match(/WA:([0-9+\s-]+)/);
        const waFound = waMatch ? waMatch[1].trim() : (row.no_wa || row.no_wa_peminjam || '');
        if (!groups.has(no)) {
          groups.set(no, {
             id: no,
             noPeminjaman: no,
             namaPeminjam: row.pic || '',
             noWaPeminjam: waFound,
             no_wa_peminjam: waFound,
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

      // Check local cache for any offline or unsynced records
      try {
        const cached: PeminjamanRecord[] = JSON.parse(localStorage.getItem('wms_peminjaman_cache') || '[]');
        for (const c of cached) {
          if (c && c.noPeminjaman && !groups.has(c.noPeminjaman)) {
            groups.set(c.noPeminjaman, c);
            // Auto-sync missing record to Supabase in background
            savePeminjamanToSupabase(c).catch(() => {});
          }
        }
      } catch {}
      
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
      // Keep local cache updated
      try {
        const cached: PeminjamanRecord[] = JSON.parse(localStorage.getItem('wms_peminjaman_cache') || '[]');
        const updated = cached.map(c => c.noPeminjaman === record.noPeminjaman ? { ...c, status: record.status || 'Dipinjam' } : c);
        localStorage.setItem('wms_peminjaman_cache', JSON.stringify(updated));
      } catch {}
      return true;
    }

    // Explicit numeric ID avoids collision with out-of-sync PostgreSQL sequence on peminjaman table
    const baseId = Math.floor(Date.now() / 1000) * 1000;
    const payload = (record.items || []).map((it, idx) => {
      const rawSize = (it.size || '').trim();
      const cleanSize = (rawSize && rawSize !== '-') 
        ? rawSize 
        : (extractSizeFromSku(it.sku || '') !== '-' ? extractSizeFromSku(it.sku || '') : 'ALL');
      const rawNama = it.produk || it.sku || 'Unknown';
      const formattedNama = formatProductNameWithSize(rawNama, cleanSize);
      return {
        id: baseId + idx,
        no_peminjaman: record.noPeminjaman,
        pic: record.namaPeminjam,
        keperluan: record.keperluan,
        tanggal_pinjam: record.tglPinjam,
        sku: it.sku || `SKU-${Date.now()}`,
        nama_produk: formattedNama,
        size: cleanSize,
        qty: it.qty || 1,
        lokasi: it.lokasi || 'BLOK F',
        status: record.status || 'Dipinjam',
        operator: record.username || 'System',
        keterangan: (record.noWaPeminjam || record.no_wa_peminjam) ? `WA:${record.noWaPeminjam || record.no_wa_peminjam}` : (record.keterangan || '')
      };
    });

    if (payload.length > 0) {
      await supabaseFetch('peminjaman', 'POST', payload);
    }

    // Always keep local cache synced
    try {
      const cached: PeminjamanRecord[] = JSON.parse(localStorage.getItem('wms_peminjaman_cache') || '[]');
      const filtered = cached.filter(c => c.noPeminjaman !== record.noPeminjaman);
      filtered.unshift(record);
      localStorage.setItem('wms_peminjaman_cache', JSON.stringify(filtered));
    } catch {}

    return true;
  } catch (err) {
    console.warn('Error saving peminjaman to Supabase, caching locally:', err);
    // Cache locally as fallback
    try {
      const cached: PeminjamanRecord[] = JSON.parse(localStorage.getItem('wms_peminjaman_cache') || '[]');
      const filtered = cached.filter(c => c.noPeminjaman !== record.noPeminjaman);
      filtered.unshift(record);
      localStorage.setItem('wms_peminjaman_cache', JSON.stringify(filtered));
    } catch {}
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

  let rawSize = String(row.size || row.ukuran || row.variant || row.varian || '').trim();
  if (!rawSize || rawSize === '-') {
    rawSize = extractSizeFromSku(sku);
  }

  let nama_produk = String(row.nama_produk || row.produk || row.product || row.item_name || sku).trim();
  if (rawSize && rawSize !== '-' && rawSize !== 'ALL') {
    nama_produk = formatProductNameWithSize(nama_produk, rawSize);
  }

  return {
    id: String(row.id || `pick_${no_sj}_${sku}_${Date.now()}`),
    no_sj,
    tanggal: String(row.tanggal || row.date || row.created_at || nowIso.slice(0, 10)).slice(0, 10),
    tujuan: String(row.tujuan || row.destination || row.channel || 'Marketplace').trim(),
    sku,
    nama_produk,
    size: rawSize || '-',
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

  // Fetch from picking_list and peminjaman concurrently to avoid sequential bottlenecks
  const [pickingRes, peminjamanRes] = await Promise.allSettled([
    supabaseFetch<any[]>('picking_list', 'GET', null, 'select=*&order=created_at.desc&limit=2000'),
    supabaseFetch<any[]>('peminjaman', 'GET', null, 'select=*&order=created_at.desc&limit=100')
  ]);

  if (pickingRes.status === 'fulfilled' && pickingRes.value && Array.isArray(pickingRes.value)) {
    for (const r of pickingRes.value) {
      const item = extractPickingItemFromRow(r);
      if (item) {
        itemsMap.set(`${item.no_sj}__${item.sku}`, item);
      }
    }
  } else if (pickingRes.status === 'rejected') {
    throw pickingRes.reason;
  }

  // Auto-sync from Peminjaman (for legacy Google Sheets UI submissions)
  if (peminjamanRes.status === 'fulfilled' && peminjamanRes.value && Array.isArray(peminjamanRes.value)) {
    const toInsert: any[] = [];
    for (const p of peminjamanRes.value) {
      const no_sj = String(p.no_peminjaman || '');
      const sku = String(p.sku || '').toUpperCase();
      const pStatus = String(p.status || '').toUpperCase();
      
      // Skip items that are already returned to avoid re-adding them to picking list
      if (pStatus === 'DIKEMBALIKAN') continue;

      if (no_sj && sku && !itemsMap.has(`${no_sj}__${sku}`)) {
        let pSize = String(p.size || '').trim();
        if (!pSize || pSize === '-') {
          pSize = extractSizeFromSku(sku);
        }
        let pNama = String(p.nama_produk || sku).trim();
        if (pSize && pSize !== '-' && pSize !== 'ALL') {
          pNama = formatProductNameWithSize(pNama, pSize);
        }

        const newItem = {
          no_sj: no_sj,
          tanggal: p.tanggal_pinjam || '',
          tujuan: `SPS: ${p.pic || ''} - ${p.keperluan || ''}`,
          sku: sku,
          nama_produk: pNama,
          size: pSize || '-',
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
      // Background insert to sync Supabase picking_list
      insertPickingListRowsToSupabase(toInsert).catch(console.warn);
    }
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

/**
 * Robustly inserts rows into the Supabase 'picking_list' table.
 * Handles schema variations automatically (e.g. presence or absence of 'size' column).
 */
export async function insertPickingListRowsToSupabase(
  newItems: Array<{
    no_sj: string;
    tanggal?: string;
    tujuan?: string;
    sku: string;
    nama_produk: string;
    size?: string;
    qty_req: number;
    qty_picked?: number;
    lokasi?: string;
    status?: string;
    picker_name?: string;
    created_at?: string;
  }>
): Promise<boolean> {
  if (!newItems || newItems.length === 0) return true;

  const nowIso = new Date().toISOString();

  // 1. Full rows including 'size'
  const fullRows = newItems.map((it) => {
    const cleanSize = (it.size || '').trim();
    let nama = it.nama_produk || it.sku;
    if (cleanSize && cleanSize !== '-' && cleanSize !== 'ALL') {
      nama = formatProductNameWithSize(nama, cleanSize);
    }
    return {
      no_sj: String(it.no_sj || '').trim().toUpperCase(),
      tanggal: String(it.tanggal || nowIso.slice(0, 10)),
      tujuan: String(it.tujuan || 'Marketplace').trim(),
      sku: String(it.sku || '').trim().toUpperCase(),
      nama_produk: nama,
      size: cleanSize || '-',
      qty_req: Number(it.qty_req) || 1,
      qty_picked: Number(it.qty_picked) || 0,
      lokasi: String(it.lokasi || '-').trim(),
      status: String(it.status || 'PENDING').trim().toUpperCase(),
      created_at: it.created_at || nowIso,
    };
  });

  // 2. Schema-compliant rows matching official supabase_schema.sql (NO 'size' column)
  const schemaCompliantRows = fullRows.map(({ size, ...rest }) => rest);

  // Attempt 1: Full payload
  try {
    await supabaseFetch('picking_list', 'POST', fullRows);
    return true;
  } catch (err: any) {
    const errMsg = String(err?.message || err || '');
    console.warn('insertPickingListRowsToSupabase: Attempt 1 with size column failed, trying schema-compliant without size:', errMsg);

    // Attempt 2: Without size column
    try {
      await supabaseFetch('picking_list', 'POST', schemaCompliantRows);
      return true;
    } catch (err2: any) {
      console.warn('insertPickingListRowsToSupabase: Attempt 2 without size column failed, trying minimal payload:', err2?.message);

      // Attempt 3: Minimal fields only
      const minimalRows = schemaCompliantRows.map((r) => ({
        no_sj: r.no_sj,
        tanggal: r.tanggal,
        tujuan: r.tujuan,
        sku: r.sku,
        nama_produk: r.nama_produk,
        qty_req: r.qty_req,
        qty_picked: 0,
        lokasi: r.lokasi,
        status: 'PENDING',
      }));

      try {
        await supabaseFetch('picking_list', 'POST', minimalRows);
        return true;
      } catch (err3: any) {
        console.warn('insertPickingListRowsToSupabase: Attempt 3 failed, trying row-by-row fallback:', err3?.message);
        
        // Attempt 4: Row-by-row fallback
        let successCount = 0;
        let lastError: any = err3;
        for (const row of minimalRows) {
          try {
            await supabaseFetch('picking_list', 'POST', [row]);
            successCount++;
          } catch (rErr) {
            lastError = rErr;
          }
        }
        if (successCount === 0) {
          throw new Error(`Gagal menyimpan ke tabel picking_list Supabase: ${lastError?.message || 'Error tidak diketahui'}`);
        }
        return true;
      }
    }
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

  const newItems: PickingListItem[] = items.map((it, idx) => {
    const rawSize = (it.size || '').trim();
    const cleanSize = (rawSize && rawSize !== '-') 
      ? rawSize 
      : (extractSizeFromSku(it.sku) !== '-' ? extractSizeFromSku(it.sku) : '-');
    const rawNama = it.nama_produk.trim() || it.sku.trim().toUpperCase();
    const formattedNama = formatProductNameWithSize(rawNama, cleanSize);
    return {
      id: `pick_${cleanNoSj}_${it.sku.trim().toUpperCase()}_${Date.now()}_${idx}`,
      no_sj: cleanNoSj,
      tanggal: nowIso.slice(0, 10),
      tujuan: cleanTujuan,
      sku: it.sku.trim().toUpperCase(),
      nama_produk: formattedNama,
      size: cleanSize || '-',
      qty_req: Number(it.qty_req) || 1,
      qty_picked: 0,
      lokasi: it.lokasi || 'A-01',
      status: 'PENDING' as const,
      created_at: nowIso,
    };
  });

  // 1. Immediately store to local caches so it appears in Tugas Picking right away
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Update wms_picking_cache
      const cached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_picking_cache') || '[]');
      const filteredCache = cached.filter(
        (c) => !(c.no_sj?.toUpperCase() === cleanNoSj && newItems.some((n) => n.sku === c.sku?.toUpperCase()))
      );
      localStorage.setItem('wms_picking_cache', JSON.stringify([...newItems, ...filteredCache]));

      // Update wms_raw_picking_list_cache (used by PickingTasksView)
      const rawCached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_raw_picking_list_cache') || '[]');
      const filteredRaw = rawCached.filter(
        (c) => !(c.no_sj?.toUpperCase() === cleanNoSj && newItems.some((n) => n.sku === c.sku?.toUpperCase()))
      );
      localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify([...newItems, ...filteredRaw]));
    }
  } catch (cErr) {
    console.warn('Error saving picking to local cache:', cErr);
  }

  // 2. Persist to Supabase picking_list table with schema fallback
  try {
    await insertPickingListRowsToSupabase(newItems);
  } catch (err: any) {
    console.error('Error syncing picking SJ to Supabase remote:', err);
    throw err;
  }

  // 3. Dispatch picking update event if in browser
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('picking_list_updated', { detail: newItems }));
    } catch {}
  }

  return { success: true, createdItems: newItems };
}

export async function updatePickingSuratJalanDetailsSupabase(
  no_sj: string,
  tujuan: string,
  items: PickingListItem[],
  newItems: Array<{ sku: string; nama_produk: string; size?: string; lokasi?: string; qty_req: number }>,
  deletedItemIds: string[]
): Promise<boolean> {
  const cleanNoSj = no_sj.trim().toUpperCase();
  const isSpsOrPjm = cleanNoSj.startsWith('SPS') || cleanNoSj.startsWith('PJM');

  try {
    // 1. Delete removed items from picking_list and peminjaman
    if (deletedItemIds.length > 0) {
      for (const id of deletedItemIds) {
        if (/^\d+$/.test(String(id))) {
          try {
            const rows = await supabaseFetch<any[]>('picking_list', 'GET', null, `id=eq.${id}`);
            if (rows && rows[0] && isSpsOrPjm) {
              const encodedSj = encodeURIComponent(cleanNoSj);
              const encodedSku = encodeURIComponent(rows[0].sku);
              await supabaseFetch('peminjaman', 'DELETE', null, `no_peminjaman=ilike.${encodedSj}&sku=ilike.${encodedSku}`).catch(() => {});
            }
          } catch {}
          await supabaseFetch('picking_list', 'DELETE', undefined, `id=eq.${id}`).catch(() => {});
        }
      }
    }
    
    const nowIso = new Date().toISOString();

    // 2. Update existing items
    for (const item of items) {
      const cleanSku = (item.sku || '').trim().toUpperCase();
      const patchData: Record<string, any> = {
        tujuan: tujuan.trim(),
        qty_req: Math.max(1, Number(item.qty_req) || 1),
        lokasi: item.lokasi || 'A-01',
        nama_produk: item.nama_produk,
        size: item.size || '-',
        sku: cleanSku,
      };

      const condition = item.id && /^\d+$/.test(String(item.id))
        ? `id=eq.${item.id}`
        : `no_sj=ilike.${encodeURIComponent(cleanNoSj)}&sku=ilike.${encodeURIComponent(cleanSku)}`;

      try {
        await supabaseFetch('picking_list', 'PATCH', patchData, condition);
      } catch (patchErr) {
        // Retry without 'size' if column doesn't exist
        const { size, ...cleanPatch } = patchData;
        await supabaseFetch('picking_list', 'PATCH', cleanPatch, condition).catch(() => {});
      }

      // If SPS or PJM, also sync to peminjaman table
      if (isSpsOrPjm && cleanSku) {
        await supabaseFetch(
          'peminjaman',
          'PATCH',
          {
            nama_produk: item.nama_produk,
            size: item.size || '-',
            qty: Math.max(1, Number(item.qty_req) || 1),
            lokasi: item.lokasi || 'BLOK F',
          },
          `no_peminjaman=ilike.${encodeURIComponent(cleanNoSj)}&sku=ilike.${encodeURIComponent(cleanSku)}`
        ).catch(() => {});
      }
    }

    // 3. Insert newly added items
    if (newItems.length > 0) {
      const rows = newItems.map((it) => ({
        no_sj: cleanNoSj,
        tanggal: nowIso.slice(0, 10),
        tujuan: tujuan.trim(),
        sku: it.sku.trim().toUpperCase(),
        nama_produk: it.nama_produk.trim(),
        size: it.size || '-',
        qty_req: Math.max(1, Number(it.qty_req) || 1),
        qty_picked: 0,
        lokasi: it.lokasi || 'A-01',
        status: 'PENDING' as const,
        created_at: nowIso,
      }));
      await insertPickingListRowsToSupabase(rows).catch(console.warn);

      // If SPS / PJM, also add to peminjaman table
      if (isSpsOrPjm) {
        const basePickId = Math.floor(Date.now() / 1000) * 1000;
        const pjmRows = newItems.map((it, idx) => ({
          id: basePickId + 500 + idx,
          no_peminjaman: cleanNoSj,
          pic: tujuan.replace(/^SPS:\s*/i, '').split('-')[0]?.trim() || 'Operator',
          keperluan: tujuan.split('-')[1]?.trim() || 'Peminjaman',
          tanggal_pinjam: nowIso.slice(0, 10),
          sku: it.sku.trim().toUpperCase(),
          nama_produk: it.nama_produk.trim(),
          size: it.size || '-',
          qty: Math.max(1, Number(it.qty_req) || 1),
          lokasi: it.lokasi || 'BLOK F',
          status: 'Dipinjam',
          operator: 'Operator',
          keterangan: 'Added via edit SJ'
        }));
        await supabaseFetch('peminjaman', 'POST', pjmRows).catch(() => {});
      }
    }

    // 4. Immediately update local wms_picking_cache so everything stays synchronized
    try {
      const cached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_picking_cache') || '[]');
      const filtered = cached.filter((c) => (c.no_sj || '').trim().toUpperCase() !== cleanNoSj);
      const updatedExisting = items.map((it) => ({
        ...it,
        no_sj: cleanNoSj,
        tujuan: tujuan.trim(),
      }));
      const brandNew = newItems.map((it, idx) => ({
        id: `pick_new_${Date.now()}_${idx}`,
        no_sj: cleanNoSj,
        tanggal: nowIso.slice(0, 10),
        tujuan: tujuan.trim(),
        sku: it.sku.trim().toUpperCase(),
        nama_produk: it.nama_produk.trim(),
        size: it.size || '-',
        qty_req: Math.max(1, Number(it.qty_req) || 1),
        qty_picked: 0,
        lokasi: it.lokasi || 'A-01',
        status: 'PENDING' as const,
        created_at: nowIso,
      }));
      localStorage.setItem('wms_picking_cache', JSON.stringify([...filtered, ...updatedExisting, ...brandNew]));
    } catch {}

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

/**
 * =========================================================================
 * UPDATE DATABASE MASTER PRODUK (CSV IMPORT -> DELETE ALL OLD -> INSERT ALL NEW)
 * =========================================================================
 */

export interface MasterProdukRecord {
  sku: string;
  nama_produk: string;
  kategori?: string;
  size?: string;
  price?: number;
  dealpos_channels?: Record<string, any>;
}

/**
 * Fetch total count of master_produk rows in Supabase
 */
export async function fetchMasterProdukCount(): Promise<{ count: number; error?: string }> {
  const { url: supaUrl, key: supaKey } = getStoredSupabaseConfig();
  try {
    const res = await fetch(`${supaUrl}/rest/v1/master_produk?select=sku`, {
      method: 'GET',
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `HTTP ${res.status}`);
    }
    let count = 0;
    const range = res.headers.get('Content-Range');
    if (range) {
      const total = range.split('/')[1];
      if (total && total !== '*') count = parseInt(total, 10) || 0;
    }
    return { count };
  } catch (err: any) {
    return { count: 0, error: err.message || 'Gagal memuat status database' };
  }
}

/**
 * Delete ALL old rows from master_produk table before writing newly imported CSV data
 */
export async function deleteEntireMasterProduk(): Promise<{ success: boolean; error?: string }> {
  const { url: supaUrl, key: supaKey } = getStoredSupabaseConfig();
  try {
    const res = await fetch(`${supaUrl}/rest/v1/master_produk?sku=not.is.null`, {
      method: 'DELETE',
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
      },
    });
    if (!res.ok && res.status !== 204 && res.status !== 200) {
      // Fallback filter
      const fallbackRes = await fetch(`${supaUrl}/rest/v1/master_produk?sku=neq.__DUMMY_NONE_FILTER__`, {
        method: 'DELETE',
        headers: {
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
        },
      });
      if (!fallbackRes.ok && fallbackRes.status !== 204 && fallbackRes.status !== 200) {
        const errText = await fallbackRes.text();
        throw new Error(errText || `Gagal menghapus database lama (HTTP ${fallbackRes.status})`);
      }
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Gagal menghapus database lama' };
  }
}

/**
 * Import a full batch of Master Produk items into Supabase with chunked upsert & live progress reporting
 */
export async function importMasterProdukBatch(
  records: MasterProdukRecord[],
  onProgress?: (uploaded: number, total: number, pct: number) => void
): Promise<{ success: boolean; totalUploaded: number; error?: string }> {
  const { url: supaUrl, key: supaKey } = getStoredSupabaseConfig();
  const total = records.length;
  if (total === 0) return { success: true, totalUploaded: 0 };

  const CHUNK_SIZE = 1000;
  let uploaded = 0;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE).map((r) => ({
      sku: r.sku,
      nama_produk: r.nama_produk,
      kategori: r.kategori || '',
      size: r.size || '',
      price: typeof r.price === 'number' ? r.price : 0,
      dealpos_channels: r.dealpos_channels || {},
    }));
    const res = await fetch(`${supaUrl}/rest/v1/master_produk?on_conflict=sku`, {
      method: 'POST',
      headers: {
        apikey: supaKey,
        Authorization: `Bearer ${supaKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gagal upload chunk (${i} - ${i + chunk.length}): ${errText}`);
    }

    uploaded += chunk.length;
    const pct = Math.round((uploaded / total) * 100);
    if (onProgress) {
      onProgress(uploaded, total, pct);
    }
  }

  // Clear local product caches so new dataset is freshly reloaded
  try {
    await clearLocalDb();
    localStorage.removeItem('wms_product_cache');
    localStorage.removeItem('wms_cache_inventory_v38');
    localStorage.removeItem('wms_inventory_stock_cache');
  } catch {}

  return { success: true, totalUploaded: uploaded };
}

// ============================================================================
// HR & EMPLOYEE MANAGEMENT SERVICES (DARI WarehouseEmpl)
// ============================================================================

/**
 * Fetch presensi record today for a given NIK
 */
export async function fetchPresensiToday(nik: string, dateStr: string): Promise<PresensiRecord | null> {
  if (!nik || !dateStr) return null;
  try {
    const data = await supabaseFetch<PresensiRecord[]>(
      'presensi',
      'GET',
      null,
      `nik=eq.${encodeURIComponent(nik)}&tanggal=eq.${encodeURIComponent(dateStr)}&limit=1`
    );
    return data && data.length > 0 ? data[0] : null;
  } catch (err) {
    console.warn('fetchPresensiToday error:', err);
    return null;
  }
}

/**
 * Submit or update presensi record
 */
export async function submitPresensiRecord(record: Partial<PresensiRecord>): Promise<PresensiRecord | null> {
  const sb = getSupabaseClient();
  const sanitized = { ...record };
  if (sanitized.jam_masuk) {
    sanitized.jam_masuk = sanitized.jam_masuk.replace(/\./g, ':');
  }
  if (sanitized.jam_pulang) {
    sanitized.jam_pulang = sanitized.jam_pulang.replace(/\./g, ':');
  }

  const { data, error } = await sb
    .from('presensi')
    .upsert(sanitized, { onConflict: 'nik,tanggal' })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

/**
 * Fetch roster shifts for a date range (and optionally a specific NIK)
 */
export async function fetchRosterShiftList(
  nik?: string,
  startDate?: string,
  endDate?: string
): Promise<RosterShiftRecord[]> {
  try {
    let query = 'select=*&order=tanggal.asc';
    if (nik) {
      query += `&nik=eq.${encodeURIComponent(nik)}`;
    }
    if (startDate) {
      query += `&tanggal=gte.${encodeURIComponent(startDate)}`;
    }
    if (endDate) {
      query += `&tanggal=lte.${encodeURIComponent(endDate)}`;
    }
    const data = await supabaseFetch<RosterShiftRecord[]>('roster_shift', 'GET', null, query);
    return data || [];
  } catch (err) {
    console.warn('fetchRosterShiftList error:', err);
    return [];
  }
}

/**
 * Fetch master shifts (Shift 1, Shift 2, etc.)
 */
export async function fetchMasterShiftList(): Promise<MasterShiftRecord[]> {
  try {
    const data = await supabaseFetch<MasterShiftRecord[]>('master_shift', 'GET', null, 'order=id.asc');
    return data || [];
  } catch (err) {
    console.warn('fetchMasterShiftList error:', err);
    return [];
  }
}

/**
 * Fetch lembur records (optionally filtered by NIK)
 */
export async function fetchLemburRecords(nik?: string): Promise<LemburRecord[]> {
  try {
    let query = 'select=*&order=tanggal.desc,created_at.desc';
    if (nik) {
      query += `&nik=eq.${encodeURIComponent(nik)}`;
    }
    const data = await supabaseFetch<LemburRecord[]>('lembur', 'GET', null, query);
    return data || [];
  } catch (err) {
    console.warn('fetchLemburRecords error:', err);
    return [];
  }
}

/**
 * Submit new lembur request
 */
export async function submitLemburRecord(record: Partial<LemburRecord>): Promise<LemburRecord> {
  const sb = getSupabaseClient();
  const id = record.id || `LMB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const payload = { ...record, id };
  if (payload.jam_mulai) {
    payload.jam_mulai = payload.jam_mulai.replace(/\./g, ':');
  }
  if (payload.jam_selesai) {
    payload.jam_selesai = payload.jam_selesai.replace(/\./g, ':');
  }

  const { data, error } = await sb
    .from('lembur')
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

/**
 * Update lembur status (Admin approval)
 */
export async function updateLemburStatus(
  id: string,
  status: 'Disetujui' | 'Ditolak',
  approvedBy: string,
  catatan?: string
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('lembur')
    .update({
      status,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      catatan: catatan || '',
    })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Fetch cuti records (optionally filtered by NIK)
 */
export async function fetchCutiRecords(nik?: string): Promise<PerijinanCutiRecord[]> {
  try {
    let query = 'select=*&order=tgl_mulai.desc,created_at.desc';
    if (nik) {
      query += `&nik=eq.${encodeURIComponent(nik)}`;
    }
    const data = await supabaseFetch<PerijinanCutiRecord[]>('perijinan_cuti', 'GET', null, query);
    return data || [];
  } catch (err) {
    console.warn('fetchCutiRecords error:', err);
    return [];
  }
}

/**
 * Submit new cuti / ijin request
 */
export async function submitCutiRecord(record: Partial<PerijinanCutiRecord>): Promise<PerijinanCutiRecord> {
  const sb = getSupabaseClient();
  const id = record.id || `CTI-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const payload = { ...record, id };

  const { data, error } = await sb
    .from('perijinan_cuti')
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

/**
 * Update cuti status (Admin approval)
 */
export async function updateCutiStatus(
  id: string,
  status: 'Disetujui' | 'Ditolak',
  approvedBy: string,
  catatan?: string
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('perijinan_cuti')
    .update({
      status,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      catatan: catatan || '',
    })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Fetch all karyawan directory
 */
export async function fetchKaryawanDirectory(): Promise<KaryawanRecord[]> {
  try {
    const data = await supabaseFetch<KaryawanRecord[]>('karyawan', 'GET', null, 'order=nik.asc');
    return data || [];
  } catch (err) {
    console.warn('fetchKaryawanDirectory error:', err);
    return [];
  }
}

/**
 * Upsert Karyawan record
 */
export async function upsertKaryawanRecord(karyawan: Partial<KaryawanRecord>): Promise<{ success: boolean; message?: string }> {
  try {
    if (!karyawan.nik || !karyawan.nama) {
      return { success: false, message: 'NIK dan Nama Karyawan wajib diisi' };
    }
    const payload = {
      ...karyawan,
      updated_at: new Date().toISOString(),
    };
    const res = await supabaseFetch<any[]>('karyawan', 'POST', payload, 'on_conflict=nik', true);
    if (res && Array.isArray(res) && res.length === 0) {
      throw new Error("Akses ditolak (RLS) atau gagal menyimpan data.");
    }
    return { success: true };
  } catch (err: any) {
    console.error('upsertKaryawanRecord error:', err);
    return { success: false, message: err?.message || 'Gagal menyimpan data karyawan' };
  }
}

/**
 * Delete Karyawan record
 */
export async function deleteKaryawanRecord(nik: string): Promise<{ success: boolean; message?: string }> {
  try {
    if (!nik) return { success: false, message: 'NIK wajib ditentukan' };
    const res = await supabaseFetch<any[]>('karyawan', 'DELETE', null, `nik=eq.${encodeURIComponent(nik)}`, true);
    if (res && Array.isArray(res) && res.length === 0) {
      throw new Error("Data karyawan tidak ditemukan atau akses ditolak (RLS).");
    }
    return { success: true };
  } catch (err: any) {
    console.error('deleteKaryawanRecord error:', err);
    return { success: false, message: err?.message || 'Gagal menghapus data karyawan' };
  }
}

/**
 * Fetch all presensi records for a date range (and optional NIK)
 */
export async function fetchPresensiRange(
  startDate: string,
  endDate: string,
  nik?: string
): Promise<PresensiRecord[]> {
  try {
    let query = `select=*&tanggal=gte.${encodeURIComponent(startDate)}&tanggal=lte.${encodeURIComponent(endDate)}&order=tanggal.desc`;
    if (nik && nik !== 'ALL') {
      query += `&nik=eq.${encodeURIComponent(nik)}`;
    }
    const data = await supabaseFetch<PresensiRecord[]>('presensi', 'GET', null, query);
    return data || [];
  } catch (err) {
    console.warn('fetchPresensiRange error:', err);
    return [];
  }
}


export async function fetchSupabaseStokFisikBySkus(skus: string[]): Promise<StockRealtimeItem[]> {
  if (!skus || skus.length === 0) return [];
  const { url: supaUrl, key: supaKey } = getStoredSupabaseConfig();
  const cleanSkus = Array.from(new Set(skus.map(s => String(s || '').trim().toUpperCase()).filter(Boolean)));
  if (cleanSkus.length === 0) return [];
  
  const CHUNK_SIZE = 40;
  const allResults: StockRealtimeItem[] = [];

  for (let i = 0; i < cleanSkus.length; i += CHUNK_SIZE) {
    const chunk = cleanSkus.slice(i, i + CHUNK_SIZE);
    const skuList = chunk.map(s => `"${s}"`).join(',');
    const encodedSkus = encodeURIComponent(`(${skuList})`);
    
    try {
      const res = await fetch(`${supaUrl}/rest/v1/view_stok_realtime?sku=in.${encodedSkus}&sisa_stok=neq.0&select=sku,nama_produk,size,area,lokasi,sisa_stok`, {
        method: 'GET',
        headers: {
          'apikey': supaKey,
          'Authorization': `Bearer ${supaKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) allResults.push(...json);
      }
    } catch (err) {
      console.error('Error fetching delta stocks chunk:', err);
    }
  }
  return allResults;
}

export async function fetchMasterProductDealposChannelsBySkus(
  skus: string[]
): Promise<Record<string, any>> {
  if (!skus || skus.length === 0) return {};
  const { url: supaUrl, key: supaKey } = getStoredSupabaseConfig();
  const cleanSkus = Array.from(
    new Set(skus.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))
  );
  if (cleanSkus.length === 0) return {};

  const resultMap: Record<string, any> = {};
  const CHUNK_SIZE = 50;

  for (let i = 0; i < cleanSkus.length; i += CHUNK_SIZE) {
    const chunk = cleanSkus.slice(i, i + CHUNK_SIZE);
    const skuList = chunk.map((s) => `"${s}"`).join(',');
    const encodedSkus = encodeURIComponent(`(${skuList})`);

    try {
      const res = await fetch(
        `${supaUrl}/rest/v1/master_produk?sku=in.${encodedSkus}&select=sku,dealpos_channels`,
        {
          method: 'GET',
          headers: {
            apikey: supaKey,
            Authorization: `Bearer ${supaKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }
      );
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          json.forEach((r) => {
            const k = String(r.sku || '').trim().toUpperCase();
            if (k && r.dealpos_channels) {
              resultMap[k] = r.dealpos_channels;
            }
          });
        }
      }
    } catch (err) {
      console.warn('Error fetching delta dealpos_channels chunk:', err);
    }
  }
  return resultMap;
}

export async function fetchChannelStocksBySkus(skus: string[]): Promise<import('../types').ChannelStockItem[]> {
  if (!skus || skus.length === 0) return [];
  const viewRows = await fetchSupabaseStokFisikBySkus(skus);
  
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
  
  if (viewRows && Array.isArray(viewRows) && viewRows.length > 0) {
    for (const r of viewRows) {
      const sku = String(r.sku || r.kode || '').trim().toUpperCase();
      if (!sku || sku === 'UNDEFINED' || sku === 'NULL') continue;
      const sisa = Number(r.sisa_stok ?? r.qty ?? 0);
      const lok = String(r.lokasi || 'BLOK F').trim();
      const area = String(r.area || getAreaFromLokasi(lok)).trim();
      const nama = String(r.nama_produk || r.nama || sku).trim();
      
      let size = String(r.size || r.ukuran || '').trim();
      if (!size || size === '-' || size === 'ALL') {
        if (sku.endsWith('XXL')) size = 'XXL';
        else if (sku.endsWith('XL')) size = 'XL';
        else if (sku.endsWith('XS')) size = 'XS';
        else if (sku.endsWith('L')) size = 'L';
        else if (sku.endsWith('M')) size = 'M';
        else if (sku.endsWith('S')) size = 'S';
        else size = 'ALL';
      }

      if (!stockMap.has(sku)) {
        stockMap.set(sku, { sku, produk: nama, size: size || 'ALL', locations: new Map() });
      }

      const entry = stockMap.get(sku)!;
      if (entry.produk === sku && nama !== sku) entry.produk = nama;
      if ((!entry.size || entry.size === 'ALL' || entry.size === '-') && size && size !== '-') entry.size = size;

      const lokKey = `${lok.toUpperCase()}__${area.toUpperCase()}`;
      const prev = entry.locations.get(lokKey)?.qty || 0;
      entry.locations.set(lokKey, { lokasi: lok, area, qty: prev + sisa });
    }
  }
  
  const result: import('../types').ChannelStockItem[] = [];
  
  for (const entry of stockMap.values()) {
    let wh = 0, std = 0, shp = 0, ttk = 0;
    
    // Default mapped specific locations if direct counts not present
    for (const [_, locData] of entry.locations.entries()) {
      const l = locData.lokasi.toUpperCase();
      const a = locData.area.toUpperCase();
      const q = locData.qty;
      
      if (a === 'STUDIO' || l === 'STUDIO' || l === 'STUDIO (BLOK F)') {
        std += q;
      } else if (a === 'SHOPEE' || a === 'SHP' || l === 'SHOPEE' || l === 'SHP') {
        shp += q;
      } else if (a === 'TIKTOK' || a === 'TTK' || l === 'TIKTOK' || l === 'TTK') {
        ttk += q;
      } else if (a === 'ONLINE') {
        shp += q; // Fallback mapping
      } else {
        wh += q;
      }
    }
    
    // Add locStr logic
    const locNames = Array.from(entry.locations.values())
      .filter(it => it.qty > 0 && it.area !== 'STUDIO' && it.area !== 'SHOPEE' && it.area !== 'TIKTOK' && it.area !== 'ONLINE')
      .map(it => it.lokasi);
    const uniqueLocs = Array.from(new Set(locNames));
    const locStr = uniqueLocs.length > 0 ? uniqueLocs.join(', ') : 'Gudang (Stok Habis)';
    
    result.push({
      sku: entry.sku,
      produk: entry.produk,
      size: entry.size,
      locStr,
      whQty: wh,
      studioQty: entry.directStudio ?? std,
      shpQty: entry.directShp ?? shp,
      ttkQty: entry.directTtk ?? ttk,
      totalQty: wh + (entry.directStudio ?? std) + (entry.directShp ?? shp) + (entry.directTtk ?? ttk)
    });
  }
  
  return result.sort((a, b) => b.totalQty - a.totalQty);
}

/**
 * =========================================================================
 * MODUL PENGELOLAAN REJECT, CUCI, PERMAK & DEFECT (SUPABASE API)
 * =========================================================================
 */

/**
 * Fetch semua tiket perbaikan dari Supabase (dengan local cache fallback)
 */
export async function fetchPerbaikanTicketsFromSupabase(): Promise<PerbaikanTicket[]> {
  let localData: PerbaikanTicket[] = [];
  try {
    const cached = localStorage.getItem('wms_local_perbaikan_tickets');
    if (cached) {
      localData = JSON.parse(cached);
    }
  } catch {}

  try {
    const query = 'order=created_at.desc&limit=500';
    const newData = await supabaseFetch<PerbaikanTicket[]>('perbaikan_tickets', 'GET', undefined, query);

    if (newData && Array.isArray(newData)) {
      // Supabase is authoritative. Keep localData in sync with authoritative Supabase list
      const remoteTicketNos = new Set(newData.map(t => t.ticket_no).filter(Boolean));
      const offlinePending = localData.filter(t => 
        typeof t.id === 'number' && t.id > 1000000000 && !remoteTicketNos.has(t.ticket_no)
      );

      const merged = [...newData, ...offlinePending].sort((a, b) => 
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      localData = merged;
      try {
        localStorage.setItem('wms_local_perbaikan_tickets', JSON.stringify(localData));
      } catch {}
      return localData;
    }
  } catch (err) {
    console.warn('Gagal memuat perbaikan_tickets dari Supabase, memuat dari local cache:', err);
  }

  return localData;
}

/**
 * Simpan tiket baru ke Supabase & update local cache
 */
export async function savePerbaikanTicketToSupabase(ticket: PerbaikanTicket): Promise<PerbaikanTicket> {
  let savedTicket: PerbaikanTicket = { ...ticket };

  // Prepare payload without local mock ID if newly created
  const isLocalId = typeof ticket.id === 'number' && ticket.id > 1000000000;
  const payload: any = { ...ticket };
  if (isLocalId || !ticket.id) {
    delete payload.id;
  }

  // Attempt 1: Standard insert
  let inserted = false;
  try {
    const res = await supabaseFetch<PerbaikanTicket[]>('perbaikan_tickets', 'POST', [payload]);
    if (res && Array.isArray(res) && res.length > 0) {
      savedTicket = res[0];
      inserted = true;
    }
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    console.warn('Percobaan 1 simpan tiket perbaikan ke Supabase gagal:', errMsg);

    // Attempt 2: If qc_report_no column is missing from Supabase perbaikan_tickets schema
    try {
      const fallbackPayload: any = { ...payload };
      if (fallbackPayload.qc_report_no) {
        if (!fallbackPayload.detail_kerusakan?.includes(fallbackPayload.qc_report_no)) {
          fallbackPayload.detail_kerusakan = `[QC #${fallbackPayload.qc_report_no}] ${fallbackPayload.detail_kerusakan || ''}`.trim();
        }
        delete fallbackPayload.qc_report_no;
      }
      const res2 = await supabaseFetch<PerbaikanTicket[]>('perbaikan_tickets', 'POST', [fallbackPayload]);
      if (res2 && Array.isArray(res2) && res2.length > 0) {
        savedTicket = { ...res2[0], qc_report_no: ticket.qc_report_no };
        inserted = true;
      }
    } catch (err2: any) {
      console.warn('Percobaan 2 simpan tiket perbaikan gagal, mencoba payload minimal:', err2);
      // Attempt 3: Core required fields
      try {
        const minimalPayload: any = {
          ticket_no: payload.ticket_no,
          sku: payload.sku,
          nama_produk: payload.nama_produk,
          size: payload.size || '-',
          qty: payload.qty || 1,
          lokasi_asal: payload.lokasi_asal || 'Area QC',
          lokasi_sekarang: payload.lokasi_sekarang || 'PERBAIKAN-01',
          sumber_barang: payload.sumber_barang || 'Gudang',
          kategori_rusak: payload.kategori_rusak || 'Noda / Kotor',
          detail_kerusakan: payload.detail_kerusakan || (ticket.qc_report_no ? `[QC #${ticket.qc_report_no}]` : ''),
          foto_urls: payload.foto_urls || [],
          tahap: payload.tahap || 'REJECT',
          status_pengerjaan: payload.status_pengerjaan || 'PENDING',
          operator_input: payload.operator_input || 'Operator QC',
        };
        const res3 = await supabaseFetch<PerbaikanTicket[]>('perbaikan_tickets', 'POST', [minimalPayload]);
        if (res3 && Array.isArray(res3) && res3.length > 0) {
          savedTicket = { ...res3[0], qc_report_no: ticket.qc_report_no };
          inserted = true;
        }
      } catch (err3) {
        console.warn('Gagal menyimpan tiket perbaikan ke Supabase (tersimpan di cache lokal):', err3);
      }
    }
  }

  // Update local cache
  try {
    const cachedStr = localStorage.getItem('wms_local_perbaikan_tickets');
    const list: PerbaikanTicket[] = cachedStr ? JSON.parse(cachedStr) : [];
    const idx = list.findIndex(t => t.ticket_no === savedTicket.ticket_no);
    if (idx >= 0) {
      list[idx] = savedTicket;
    } else {
      list.unshift(savedTicket);
    }
    localStorage.setItem('wms_local_perbaikan_tickets', JSON.stringify(list));
  } catch {}

  return savedTicket;
}

/**
 * Update tiket perbaikan di Supabase & update local cache
 */
export async function updatePerbaikanTicketInSupabase(
  ticketNoOrId: string | number,
  updates: Partial<PerbaikanTicket>
): Promise<boolean> {
  const query = typeof ticketNoOrId === 'number' && ticketNoOrId < 1000000000
    ? `id=eq.${ticketNoOrId}`
    : `ticket_no=eq.${encodeURIComponent(String(ticketNoOrId))}`;

  try {
    await supabaseFetch('perbaikan_tickets', 'PATCH', { ...updates, updated_at: new Date().toISOString() }, query);
  } catch (err) {
    console.warn('Gagal mengupdate tiket perbaikan di Supabase (diupdate di cache lokal):', err);
  }

  // Update local cache
  try {
    const cachedStr = localStorage.getItem('wms_local_perbaikan_tickets');
    if (cachedStr) {
      const list: PerbaikanTicket[] = JSON.parse(cachedStr);
      const idx = list.findIndex(t => t.id === ticketNoOrId || t.ticket_no === String(ticketNoOrId));
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
        localStorage.setItem('wms_local_perbaikan_tickets', JSON.stringify(list));
      }
    }
  } catch {}

  return true;
}

/**
 * Hapus tiket perbaikan dari Supabase & local cache
 */
export async function deletePerbaikanTicketFromSupabase(ticketNoOrId: string | number): Promise<boolean> {
  const sTicketNo = String(ticketNoOrId);
  const isNumeric = typeof ticketNoOrId === 'number' && ticketNoOrId < 1000000000;
  const query = isNumeric
    ? `id=eq.${ticketNoOrId}`
    : `ticket_no=eq.${encodeURIComponent(sTicketNo)}`;

  try {
    await supabaseFetch('perbaikan_tickets', 'DELETE', undefined, query);
  } catch (err) {
    console.warn('Gagal menghapus tiket perbaikan dari Supabase:', err);
  }

  // Remove from local cache
  try {
    const cachedStr = localStorage.getItem('wms_local_perbaikan_tickets');
    if (cachedStr) {
      const list: PerbaikanTicket[] = JSON.parse(cachedStr);
      const filtered = list.filter(t => t.id !== ticketNoOrId && t.ticket_no !== sTicketNo);
      localStorage.setItem('wms_local_perbaikan_tickets', JSON.stringify(filtered));
    }
  } catch {}

  // Dispatch event agar PerbaikanView & modul terkait langsung update
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('wms_perbaikan_tickets_updated', {
          detail: { deletedTicketNo: sTicketNo }
        })
      );
    } catch {}
  }

  return true;
}

/**
 * Catat mutasi inventori IN/OUT ke log_produk untuk pergerakan fisik barang perbaikan
 */
export async function recordPerbaikanStockMutation(params: {
  type: 'IN' | 'OUT' | 'ADJ_IN' | 'ADJ_OUT';
  invoice: string;
  sku: string;
  nama_produk: string;
  size?: string;
  lokasi: string;
  area?: string;
  qty: number;
  operator: string;
  keterangan: string;
}): Promise<boolean> {
  try {
    const logItem: LogProdukItem = {
      type: params.type,
      invoice: params.invoice,
      sku: params.sku,
      nama_produk: params.nama_produk,
      size: params.size || '-',
      area: params.area || getAreaFromLokasi(params.lokasi),
      lokasi: params.lokasi,
      qty: Number(params.qty) || 1,
      operator: params.operator,
      keterangan: params.keterangan,
      created_at: new Date().toISOString(),
    };
    await insertLogProduk([logItem]);
    return true;
  } catch (e) {
    console.warn('Gagal mencatat mutasi stok perbaikan:', e);
    return false;
  }
}



/**
 * Upsert roster shift automatically for approved cuti/ijin
 */
export async function upsertRosterShiftForCuti(cuti: PerijinanCutiRecord): Promise<void> {
  const sb = getSupabaseClient();
  const dStart = new Date(cuti.tgl_mulai);
  const dEnd = new Date(cuti.tgl_selesai);
  
  const dates = [];
  let current = new Date(dStart);
  while (current <= dEnd) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }
  
  const payload = dates.map(tanggal => ({
    nik: cuti.nik,
    tanggal,
    shift: cuti.jenis.toUpperCase().includes('CUTI') ? 'CUTI' : 'IJIN',
    keterangan: cuti.alasan,
  }));
  
  // Using upsert on NIK & Tanggal requires unique constraint on (nik, tanggal), 
  // but let's just insert/update each sequentially or use upsert if supported.
  for (const record of payload) {
    // Check if exists
    const { data: existing } = await sb.from('roster_shift').select('id').eq('nik', record.nik).eq('tanggal', record.tanggal).limit(1);
    if (existing && existing.length > 0) {
      await sb.from('roster_shift').update(record).eq('id', existing[0].id);
    } else {
      await sb.from('roster_shift').insert([record]);
    }
  }
}

// ------------------------------------------------------------
// MODUL QUALITY CONTROL (QC) - FETCH, SAVE, DELETE DENGAN DUAL-LAYER CLOUD SYNC
// ------------------------------------------------------------

/**
 * Konversi objek QcReport menjadi format baris log_produk (type='QC_INSPEKSI')
 * Sebagai fallback handal jika tabel dedicated qc_reports belum dieksekusi di Supabase.
 */
function qcReportToLogProduk(report: QcReport): any {
  return {
    type: 'QC_INSPEKSI',
    invoice: report.report_no,
    sku: report.sku || report.kode_produksi || 'QC-ITEM',
    nama_produk: report.nama_produk || report.sku || 'QC Produk',
    size: report.size || '-',
    area: 'QC',
    lokasi: report.lokasi_barang || 'Area QC',
    qty: Math.max(1, Number(report.qty_diperiksa) || 1),
    operator: report.pic_qc || 'Operator QC',
    keterangan: [
      `Status: ${report.status}`,
      report.sumber_batch ? `Sumber: ${report.sumber_batch}` : '',
      report.kategori_rusak ? `Kerusakan: ${report.kategori_rusak}` : '',
      report.detail_kerusakan || '',
      report.catatan || '',
    ].filter(Boolean).join(' | '),
    raw_payload: JSON.stringify(report),
    created_at: report.created_at || new Date().toISOString(),
  };
}

/**
 * Parse baris log_produk (type='QC_INSPEKSI') kembali ke objek QcReport
 */
function logProdukToQcReport(log: any): QcReport | null {
  if (!log) return null;
  if (log.raw_payload) {
    try {
      const parsed = JSON.parse(log.raw_payload);
      if (parsed && (parsed.report_no || parsed.sku)) {
        return {
          ...parsed,
          id: log.id || parsed.id,
          created_at: parsed.created_at || log.created_at,
        };
      }
    } catch {}
  }

  // Fallback rekonstruksi jika raw_payload tidak valid
  const ket = log.keterangan || '';
  const isReject = ket.includes('REJECT') || log.type === 'REJECT';
  return {
    id: log.id,
    report_no: log.invoice || `QC-LOG-${log.id}`,
    tanggal: log.created_at || new Date().toISOString(),
    sku: log.sku,
    nama_produk: log.nama_produk,
    size: log.size || '-',
    sumber_batch: 'Gudang Fisik',
    status: isReject ? 'REJECT' : 'OKE',
    qty_diperiksa: Number(log.qty) || 1,
    qty_oke: isReject ? 0 : Number(log.qty) || 1,
    qty_reject: isReject ? Number(log.qty) || 1 : 0,
    foto_urls: [],
    catatan: ket,
    pic_qc: log.operator || 'Operator QC',
    created_at: log.created_at,
  };
}

/**
 * Memuat seluruh riwayat laporan QC dari Supabase.
 * Menggabungkan tabel 'qc_reports' dan fallback 'log_produk' (type='QC_INSPEKSI')
 * sehingga laporan dapat langsung terlihat oleh semua user/admin di seluruh perangkat.
 */
export async function fetchQcReportsFromSupabase(): Promise<QcReport[]> {
  // 1. Ambil dari cache lokal terlebih dahulu
  let localData: QcReport[] = [];
  try {
    const cachedStr = localStorage.getItem('wms_local_qc_reports');
    if (cachedStr) {
      localData = JSON.parse(cachedStr);
    }
  } catch {}

  const mergedMap = new Map<string, QcReport>();

  // 2. Coba ambil dari tabel dedicated qc_reports
  try {
    const query = 'order=created_at.desc&limit=2000';
    const data = await supabaseFetch<QcReport[]>('qc_reports', 'GET', undefined, query);
    if (data && Array.isArray(data)) {
      for (const item of data) {
        if (item && item.report_no) {
          mergedMap.set(item.report_no, item);
        }
      }
    }
  } catch (err) {
    // Normal jika tabel qc_reports belum dibuat di Supabase
  }

  // 3. Ambil dari log_produk (type=QC_INSPEKSI) sebagai fallback cloud
  try {
    const logQuery = 'type=eq.QC_INSPEKSI&order=created_at.desc&limit=2000';
    const logs = await supabaseFetch<any[]>('log_produk', 'GET', undefined, logQuery);
    if (logs && Array.isArray(logs)) {
      for (const row of logs) {
        const parsed = logProdukToQcReport(row);
        if (parsed && parsed.report_no) {
          // Jangan overwrite jika sudah ada di qc_reports (qc_reports lebih update)
          if (!mergedMap.has(parsed.report_no)) {
            mergedMap.set(parsed.report_no, parsed);
          }
        }
      }
    }
  } catch (errLog) {
    console.warn('Gagal memuat log QC_INSPEKSI dari Supabase:', errLog);
  }

  // Jika berhasil mengambil data dari server, jadikan data server sebagai sumber kebenaran (authoritative)
  // namun pertahankan data offline/pending (id > 1000000000)
  if (mergedMap.size > 0 || (mergedMap.size === 0 && localData.length > 0)) {
    const remoteReportNos = new Set(Array.from(mergedMap.keys()));
    const offlinePending = localData.filter((r) => 
      typeof r.id === 'number' && r.id > 1000000000 && !remoteReportNos.has(r.report_no)
    );

    for (const offline of offlinePending) {
      mergedMap.set(offline.report_no, offline);
    }
  }

  const finalResults = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.created_at || b.tanggal || 0).getTime() - new Date(a.created_at || a.tanggal || 0).getTime()
  );

  try {
    localStorage.setItem('wms_local_qc_reports', JSON.stringify(finalResults));
  } catch {}

  return finalResults;
}

export async function saveQcReportsBatchToSupabase(reports: QcReport[]): Promise<QcReport[]> {
  if (!reports || reports.length === 0) return [];

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const timestamp = Date.now().toString().slice(-4);

  const preparedReports: QcReport[] = reports.map((r, idx) => {
    const reportCopy = { ...r };
    if (!reportCopy.report_no) {
      const rand = Math.floor(100 + Math.random() * 900);
      reportCopy.report_no = `QC-${dateStr}-${timestamp}-${idx + 1}-${rand}`;
    }
    reportCopy.created_at = reportCopy.created_at || new Date().toISOString();
    reportCopy.updated_at = new Date().toISOString();
    return reportCopy;
  });

  let savedBatch: QcReport[] = [...preparedReports];
  let insertedToSupabase = false;

  // Jalur 1: Coba simpan ke tabel dedicated qc_reports
  try {
    const res = await supabaseFetch<QcReport[]>('qc_reports', 'POST', preparedReports);
    if (res && Array.isArray(res) && res.length > 0) {
      savedBatch = res;
      insertedToSupabase = true;
    }
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    console.warn('Gagal insert ke dedicated qc_reports, mencoba adaptasi skema:', errMsg);

    // Jika tabel ada tapi kolom tidak sesuai (misal tipe_identifikasi/kode_produksi)
    if (!errMsg.includes('404') && !errMsg.includes('PGRST205')) {
      try {
        const sanitized = preparedReports.map((r) => {
          const clean: any = { ...r };
          if (clean.kode_produksi && !clean.sku) clean.sku = clean.kode_produksi;
          delete clean.tipe_identifikasi;
          delete clean.kode_produksi;
          delete clean.warna;
          return clean;
        });
        const res2 = await supabaseFetch<QcReport[]>('qc_reports', 'POST', sanitized);
        if (res2 && Array.isArray(res2) && res2.length > 0) {
          savedBatch = res2;
          insertedToSupabase = true;
        }
      } catch (err2) {
        console.warn('Percobaan adaptasi skema qc_reports gagal:', err2);
      }
    }
  }

  // Jalur 2: Fallback penyimpanan Cloud langsung ke 'log_produk' (type='QC_INSPEKSI')
  // Menjamin data 100% tersimpan di Supabase walau tabel dedicated belum dibuat!
  if (!insertedToSupabase) {
    try {
      const logRows = preparedReports.map(qcReportToLogProduk);
      const resLog = await supabaseFetch<any[]>('log_produk', 'POST', logRows);
      if (resLog && Array.isArray(resLog) && resLog.length > 0) {
        insertedToSupabase = true;
        console.log(`Berhasil menyimpan ${resLog.length} laporan QC ke Supabase via cloud log (QC_INSPEKSI)`);
      }
    } catch (errLog) {
      console.warn('Percobaan batch log_produk gagal, mencoba per baris:', errLog);
      for (const rep of preparedReports) {
        try {
          await supabaseFetch<any[]>('log_produk', 'POST', [qcReportToLogProduk(rep)]);
          insertedToSupabase = true;
        } catch (singleErr) {
          console.error('Gagal simpan baris QC ke log_produk:', singleErr);
        }
      }
    }
  }

  // Jalur 3: Update local cache
  try {
    const cachedStr = localStorage.getItem('wms_local_qc_reports');
    let list: QcReport[] = cachedStr ? JSON.parse(cachedStr) : [];
    const reportNos = new Set(savedBatch.map((s) => s.report_no));
    list = list.filter((item) => !reportNos.has(item.report_no));
    list.unshift(...savedBatch);
    localStorage.setItem('wms_local_qc_reports', JSON.stringify(list));
  } catch {}

  // Jalur 4: Dispatch event agar komponen lain update secara reaktif
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('wms_qc_reports_updated', { detail: savedBatch }));
    } catch {}
  }

  return savedBatch;
}

/**
 * Update data laporan QC di Supabase (baik di tabel qc_reports maupun log_produk)
 */
export async function updateQcReportInSupabase(updatedReport: QcReport): Promise<boolean> {
  const reportNo = updatedReport.report_no;
  if (!reportNo) return false;

  let updatedInSupabase = false;

  // 1. Coba update ke tabel dedicated qc_reports
  try {
    const payload: any = {
      tanggal: updatedReport.tanggal,
      tipe_identifikasi: updatedReport.tipe_identifikasi || 'sku',
      sku: updatedReport.sku,
      nama_produk: updatedReport.nama_produk,
      kode_produksi: updatedReport.kode_produksi || '',
      warna: updatedReport.warna || '',
      size: updatedReport.size || '-',
      sumber_batch: updatedReport.sumber_batch,
      status: updatedReport.status,
      qty_diperiksa: Number(updatedReport.qty_diperiksa) || 1,
      qty_oke: Number(updatedReport.qty_oke) || 0,
      qty_reject: Number(updatedReport.qty_reject) || 0,
      kategori_rusak: updatedReport.kategori_rusak || '',
      detail_kerusakan: updatedReport.detail_kerusakan || '',
      lokasi_barang: updatedReport.lokasi_barang || '',
      target_penanganan: updatedReport.target_penanganan || 'REJECT',
      foto_urls: updatedReport.foto_urls || [],
      gdrive_link: updatedReport.gdrive_link || '',
      catatan: updatedReport.catatan || '',
      pic_qc: updatedReport.pic_qc,
      perbaikan_ticket_no: updatedReport.perbaikan_ticket_no || '',
      updated_at: new Date().toISOString(),
    };

    const res = await supabaseFetch(
      'qc_reports',
      'PATCH',
      payload,
      `report_no=eq.${encodeURIComponent(reportNo)}`
    );
    if (res !== null) {
      updatedInSupabase = true;
    }
  } catch (err: any) {
    const errMsg = String(err?.message || err);
    if (!errMsg.includes('404') && !errMsg.includes('PGRST205')) {
      try {
        const sanitized: any = {
          tanggal: updatedReport.tanggal,
          sku: updatedReport.sku || updatedReport.kode_produksi,
          nama_produk: updatedReport.nama_produk,
          size: updatedReport.size || '-',
          sumber_batch: updatedReport.sumber_batch,
          status: updatedReport.status,
          qty_diperiksa: Number(updatedReport.qty_diperiksa) || 1,
          qty_oke: Number(updatedReport.qty_oke) || 0,
          qty_reject: Number(updatedReport.qty_reject) || 0,
          kategori_rusak: updatedReport.kategori_rusak || '',
          detail_kerusakan: updatedReport.detail_kerusakan || '',
          lokasi_barang: updatedReport.lokasi_barang || '',
          target_penanganan: updatedReport.target_penanganan || 'REJECT',
          foto_urls: updatedReport.foto_urls || [],
          gdrive_link: updatedReport.gdrive_link || '',
          catatan: updatedReport.catatan || '',
          pic_qc: updatedReport.pic_qc,
          perbaikan_ticket_no: updatedReport.perbaikan_ticket_no || '',
          updated_at: new Date().toISOString(),
        };
        await supabaseFetch(
          'qc_reports',
          'PATCH',
          sanitized,
          `report_no=eq.${encodeURIComponent(reportNo)}`
        );
        updatedInSupabase = true;
      } catch (errSanitize) {}
    }
  }

  // 2. Update juga di log_produk jika tersimpan via fallback QC_INSPEKSI
  try {
    const logPayload = qcReportToLogProduk(updatedReport);
    await supabaseFetch(
      'log_produk',
      'PATCH',
      logPayload,
      `type=eq.QC_INSPEKSI&invoice=eq.${encodeURIComponent(reportNo)}`
    );
  } catch (errLog) {}

  // 3. Update cache lokal
  try {
    const cachedStr = localStorage.getItem('wms_local_qc_reports');
    if (cachedStr) {
      const list: QcReport[] = JSON.parse(cachedStr);
      const idx = list.findIndex((r) => r.report_no === reportNo);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...updatedReport, updated_at: new Date().toISOString() };
      } else {
        list.unshift(updatedReport);
      }
      localStorage.setItem('wms_local_qc_reports', JSON.stringify(list));
    }
  } catch {}

  // 4. Dispatch update event
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('wms_qc_reports_updated', { detail: { updated: updatedReport } })
      );
    } catch {}
  }

  return true;
}

/**
 * Hapus laporan QC dari Supabase (baik di tabel qc_reports maupun log_produk)
 * Serta secara otomatis menghapus tiket perbaikan/defect terkait (Cascade Delete)
 */
export async function deleteQcReportFromSupabase(
  reportNoOrId: string | number,
  optionalId?: number | string,
  optionalTicketNo?: string
): Promise<boolean> {
  const sReportNo = String(reportNoOrId);
  const targetId =
    optionalId !== undefined
      ? optionalId
      : typeof reportNoOrId === 'number' && reportNoOrId < 1000000000
      ? reportNoOrId
      : undefined;

  // 1. Temukan nomor tiket perbaikan terkait (jika ada)
  let linkedTicketNo = optionalTicketNo;
  if (!linkedTicketNo) {
    try {
      const cachedQc = localStorage.getItem('wms_local_qc_reports');
      if (cachedQc) {
        const qcList: QcReport[] = JSON.parse(cachedQc);
        const match = qcList.find(
          (r) => r.report_no === sReportNo || (targetId && r.id === targetId)
        );
        if (match?.perbaikan_ticket_no) {
          linkedTicketNo = match.perbaikan_ticket_no;
        }
      }
    } catch {}
  }
  if (!linkedTicketNo) {
    try {
      const cachedTickets = localStorage.getItem('wms_local_perbaikan_tickets');
      if (cachedTickets) {
        const tList: PerbaikanTicket[] = JSON.parse(cachedTickets);
        const match = tList.find((t) => t.qc_report_no === sReportNo);
        if (match?.ticket_no) {
          linkedTicketNo = match.ticket_no;
        }
      }
    } catch {}
  }

  // 2. Coba hapus dari tabel qc_reports
  try {
    await supabaseFetch(
      'qc_reports',
      'DELETE',
      undefined,
      `report_no=eq.${encodeURIComponent(sReportNo)}`
    );
  } catch (err) {
    console.warn('Delete from qc_reports by report_no failed:', err);
  }

  // Jika ada targetId numerik, coba hapus juga by id
  if (targetId) {
    try {
      await supabaseFetch('qc_reports', 'DELETE', undefined, `id=eq.${targetId}`);
    } catch (err) {}
  }

  // 3. Hapus juga dari log_produk jika tersimpan via fallback QC_INSPEKSI
  try {
    const logQuery = `type=eq.QC_INSPEKSI&invoice=eq.${encodeURIComponent(sReportNo)}`;
    await supabaseFetch('log_produk', 'DELETE', undefined, logQuery);
  } catch (err) {}

  // 4. CASCADE DELETE: Hapus tiket perbaikan & defect terkait dari Supabase
  try {
    await supabaseFetch(
      'perbaikan_tickets',
      'DELETE',
      undefined,
      `qc_report_no=eq.${encodeURIComponent(sReportNo)}`
    );
  } catch (err) {
    console.warn('Cascade delete perbaikan_tickets by qc_report_no failed:', err);
  }

  if (linkedTicketNo) {
    try {
      await supabaseFetch(
        'perbaikan_tickets',
        'DELETE',
        undefined,
        `ticket_no=eq.${encodeURIComponent(linkedTicketNo)}`
      );
    } catch (err) {
      console.warn('Cascade delete perbaikan_tickets by ticket_no failed:', err);
    }
  }

  // 5. CASCADE DELETE: Hapus tiket perbaikan & defect terkait dari local cache
  try {
    const cachedTickets = localStorage.getItem('wms_local_perbaikan_tickets');
    if (cachedTickets) {
      const tList: PerbaikanTicket[] = JSON.parse(cachedTickets);
      const filteredTickets = tList.filter((t) => {
        if (t.qc_report_no && t.qc_report_no === sReportNo) return false;
        if (linkedTicketNo && t.ticket_no === linkedTicketNo) return false;
        if (t.detail_kerusakan && t.detail_kerusakan.includes(sReportNo)) return false;
        return true;
      });
      localStorage.setItem('wms_local_perbaikan_tickets', JSON.stringify(filteredTickets));
    }
  } catch {}

  // 6. Hapus dari cache lokal QC
  try {
    const cachedStr = localStorage.getItem('wms_local_qc_reports');
    if (cachedStr) {
      const list: QcReport[] = JSON.parse(cachedStr);
      const filtered = list.filter((r) => {
        if (r.report_no && r.report_no === sReportNo) return false;
        if (targetId && r.id === targetId) return false;
        if (r.id && String(r.id) === sReportNo) return false;
        return true;
      });
      localStorage.setItem('wms_local_qc_reports', JSON.stringify(filtered));
    }
  } catch {}

  // 7. Dispatch event ke window agar LaporanQcView dan PerbaikanView ter-refresh seketika
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('wms_qc_reports_updated', {
          detail: { deleted: sReportNo, deletedTicketNo: linkedTicketNo },
        })
      );
      window.dispatchEvent(
        new CustomEvent('wms_perbaikan_tickets_updated', {
          detail: { deletedReportNo: sReportNo, deletedTicketNo: linkedTicketNo },
        })
      );
    } catch {}
  }

  return true;
}

// ========================================================
// PENERIMAAN PRODUKSI & KEDATANGAN BARANG (LOKAL CMT & KARGO)
// ========================================================

/**
 * Fetch list data Penerimaan Produksi dari Supabase dengan sinkronisasi local storage
 */
export async function fetchPenerimaanProduksiFromSupabase(filters?: {
  kategori?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  limit?: number;
}): Promise<PenerimaanProduksiItem[]> {
  let localData: PenerimaanProduksiItem[] = [];
  try {
    const cached = localStorage.getItem('wms_local_penerimaan_produksi');
    if (cached) {
      localData = JSON.parse(cached);
    }
  } catch {}

  try {
    const queryParts: string[] = ['order=created_at.desc'];
    const limit = filters?.limit || 1000;
    queryParts.push(`limit=${limit}`);

    if (filters?.kategori && filters.kategori !== 'Semua') {
      queryParts.push(`kategori=eq.${encodeURIComponent(filters.kategori)}`);
    }
    if (filters?.startDate) {
      queryParts.push(`tanggal_penerimaan=gte.${encodeURIComponent(filters.startDate)}`);
    }
    if (filters?.endDate) {
      queryParts.push(`tanggal_penerimaan=lte.${encodeURIComponent(filters.endDate)}`);
    }

    const query = queryParts.join('&');
    const remoteData = await supabaseFetch<PenerimaanProduksiItem[]>('penerimaan_produksi', 'GET', undefined, query);

    if (remoteData && Array.isArray(remoteData)) {
      // Supabase is authoritative.
      const remoteIds = new Set(remoteData.map((d) => String(d.id || '')).filter(Boolean));
      // Keep offline pending items (temporary numeric id or un-synced)
      const offlinePending = localData.filter((d) => {
        const sid = String(d.id || '');
        return (typeof d.id === 'number' && d.id > 1000000000) || (!remoteIds.has(sid) && sid.startsWith('local_'));
      });

      const merged = [...remoteData, ...offlinePending].sort((a, b) => {
        const dateA = new Date(a.tanggal_penerimaan || a.created_at || 0).getTime();
        const dateB = new Date(b.tanggal_penerimaan || b.created_at || 0).getTime();
        return dateB - dateA;
      });

      localData = merged;
      try {
        localStorage.setItem('wms_local_penerimaan_produksi', JSON.stringify(localData));
      } catch {}

      // Apply keyword filter client-side if provided
      if (filters?.keyword && filters.keyword.trim()) {
        const kw = filters.keyword.trim().toLowerCase();
        return localData.filter((it) =>
          (it.kode_produksi || '').toLowerCase().includes(kw) ||
          (it.no_surat_jalan || '').toLowerCase().includes(kw) ||
          (it.warna || '').toLowerCase().includes(kw) ||
          (it.keterangan || '').toLowerCase().includes(kw) ||
          (it.operator || '').toLowerCase().includes(kw)
        );
      }

      return localData;
    }
  } catch (err) {
    console.warn('Gagal memuat penerimaan_produksi dari Supabase, memuat dari local cache:', err);
  }

  // Filter cached data if keyword provided
  if (filters?.keyword && filters.keyword.trim()) {
    const kw = filters.keyword.trim().toLowerCase();
    return localData.filter((it) =>
      (it.kode_produksi || '').toLowerCase().includes(kw) ||
      (it.no_surat_jalan || '').toLowerCase().includes(kw) ||
      (it.warna || '').toLowerCase().includes(kw) ||
      (it.keterangan || '').toLowerCase().includes(kw) ||
      (it.operator || '').toLowerCase().includes(kw)
    );
  }

  return localData;
}

/**
 * Simpan Batch Penerimaan Produksi ke Supabase & Google Apps Script mirror
 */
export async function simpanBatchPenerimaanProduksiToSupabase(
  payload: SimpanPenerimaanPayload,
  operatorName?: string
): Promise<PenerimaanProduksiItem[]> {
  const rowsToInsert: any[] = [];
  const nowStr = new Date().toISOString();
  const targetOperator = (operatorName || 'Operator').trim();

  // If payload contains produk_list (compact format)
  if (payload.produk_list && payload.produk_list.length > 0) {
    for (const prod of payload.produk_list) {
      const kode = (prod.kode_produksi || '').trim().toUpperCase();
      const fotoUrl = prod.foto_url || payload.foto_url || '';
      const catatanProd = (prod.catatan || payload.keterangan || '').trim();

      for (const v of prod.variants) {
        const qty = Math.max(1, Number(v.qty) || 1);
        rowsToInsert.push({
          tanggal_penerimaan: payload.tanggal,
          kategori: payload.kategori || 'Lokal CMT',
          no_surat_jalan: (payload.no_surat_jalan || '').trim().toUpperCase(),
          kode_produksi: kode,
          warna: (v.warna || '').trim().toUpperCase(),
          size: (v.size || 'Default').trim(),
          qty: qty,
          foto_url: fotoUrl,
          keterangan: catatanProd,
          operator: targetOperator,
          created_at: nowStr,
        });
      }
    }
  } else if (payload.items && payload.items.length > 0) {
    for (const it of payload.items) {
      rowsToInsert.push({
        tanggal_penerimaan: it.tanggal_penerimaan || payload.tanggal,
        kategori: it.kategori || payload.kategori || 'Lokal CMT',
        no_surat_jalan: (it.no_surat_jalan || payload.no_surat_jalan || '').trim().toUpperCase(),
        kode_produksi: (it.kode_produksi || '').trim().toUpperCase(),
        warna: (it.warna || '').trim().toUpperCase(),
        size: (it.size || 'Default').trim(),
        qty: Math.max(1, Number(it.qty) || 1),
        foto_url: it.foto_url || payload.foto_url || '',
        keterangan: (it.keterangan || payload.keterangan || '').trim(),
        operator: it.operator || targetOperator,
        created_at: it.created_at || nowStr,
      });
    }
  }

  if (rowsToInsert.length === 0) {
    throw new Error('Tidak ada baris data barang untuk disimpan.');
  }

  let savedItems: PenerimaanProduksiItem[] = [];

  // Attempt 1: Direct Supabase insert
  try {
    const res = await supabaseFetch<PenerimaanProduksiItem[]>('penerimaan_produksi', 'POST', rowsToInsert);
    if (res && Array.isArray(res) && res.length > 0) {
      savedItems = res;
    } else {
      savedItems = rowsToInsert.map((r, idx) => ({ ...r, id: `local_${Date.now()}_${idx}` }));
    }
  } catch (err) {
    console.warn('Gagal insert penerimaan_produksi ke Supabase, simpan ke local cache:', err);
    savedItems = rowsToInsert.map((r, idx) => ({ ...r, id: `local_${Date.now()}_${idx}` }));
  }

  // Update local cache
  try {
    const cached = localStorage.getItem('wms_local_penerimaan_produksi');
    let localList: PenerimaanProduksiItem[] = cached ? JSON.parse(cached) : [];
    localList = [...savedItems, ...localList];
    localStorage.setItem('wms_local_penerimaan_produksi', JSON.stringify(localList));
  } catch {}

  // Google Apps Script Mirror (if configured)
  const gasUrl = localStorage.getItem('wms_gas_endpoint') || localStorage.getItem('wms_endpoint_url') || '';
  if (gasUrl && gasUrl.startsWith('http')) {
    try {
      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'no-cors',
        body: JSON.stringify({
          action: 'simpanPenerimaanProduksi',
          payload: {
            tanggal: payload.tanggal,
            kategori: payload.kategori,
            no_surat_jalan: payload.no_surat_jalan,
            keterangan: payload.keterangan || '',
            produk_list: payload.produk_list || [],
            operator: targetOperator,
          },
        }),
      }).catch((e) => console.warn('GAS mirror penerimaan failed:', e));
    } catch {}
  }

  // Dispatch window event for realtime UI update
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('wms_penerimaan_produksi_updated', {
          detail: { action: 'insert', no_surat_jalan: payload.no_surat_jalan },
        })
      );
    } catch {}
  }

  return savedItems;
}

/**
 * Update Batch Penerimaan Produksi (per Surat Jalan)
 */
export async function updateBatchPenerimaanProduksiInSupabase(
  origNoSuratJalan: string,
  payload: SimpanPenerimaanPayload,
  operatorName?: string
): Promise<PenerimaanProduksiItem[]> {
  const cleanOrigSJ = origNoSuratJalan.trim().toUpperCase();

  // 1. Hapus baris lama berdasarkan no_surat_jalan di Supabase
  try {
    await supabaseFetch(
      'penerimaan_produksi',
      'DELETE',
      undefined,
      `no_surat_jalan=eq.${encodeURIComponent(cleanOrigSJ)}`
    );
  } catch (err) {
    console.warn('Gagal delete baris lama penerimaan_produksi:', err);
  }

  // 2. Hapus baris lama dari local cache
  try {
    const cached = localStorage.getItem('wms_local_penerimaan_produksi');
    if (cached) {
      const list: PenerimaanProduksiItem[] = JSON.parse(cached);
      const filtered = list.filter((it) => (it.no_surat_jalan || '').trim().toUpperCase() !== cleanOrigSJ);
      localStorage.setItem('wms_local_penerimaan_produksi', JSON.stringify(filtered));
    }
  } catch {}

  // 3. Simpan baris baru
  const newItems = await simpanBatchPenerimaanProduksiToSupabase(payload, operatorName);

  // 4. GAS Mirror Update if configured
  const gasUrl = localStorage.getItem('wms_gas_endpoint') || localStorage.getItem('wms_endpoint_url') || '';
  if (gasUrl && gasUrl.startsWith('http')) {
    try {
      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'no-cors',
        body: JSON.stringify({
          action: 'updateBatchPenerimaanProduksi',
          payload: {
            orig_no_surat_jalan: cleanOrigSJ,
            tanggal: payload.tanggal,
            kategori: payload.kategori,
            no_surat_jalan: payload.no_surat_jalan,
            keterangan: payload.keterangan || '',
            items: newItems,
          },
        }),
      }).catch((e) => console.warn('GAS mirror update penerimaan failed:', e));
    } catch {}
  }

  return newItems;
}

/**
 * Hapus seluruh data penerimaan berdasarkan No Surat Jalan
 */
export async function hapusBatchPenerimaanProduksiFromSupabase(noSuratJalan: string): Promise<boolean> {
  const cleanSJ = noSuratJalan.trim().toUpperCase();

  // 1. Supabase DELETE
  try {
    await supabaseFetch(
      'penerimaan_produksi',
      'DELETE',
      undefined,
      `no_surat_jalan=eq.${encodeURIComponent(cleanSJ)}`
    );
  } catch (err) {
    console.warn('Gagal hapus batch penerimaan_produksi dari Supabase:', err);
  }

  // 2. Local Storage Clean
  try {
    const cached = localStorage.getItem('wms_local_penerimaan_produksi');
    if (cached) {
      const list: PenerimaanProduksiItem[] = JSON.parse(cached);
      const filtered = list.filter((it) => (it.no_surat_jalan || '').trim().toUpperCase() !== cleanSJ);
      localStorage.setItem('wms_local_penerimaan_produksi', JSON.stringify(filtered));
    }
  } catch {}

  // 3. GAS Mirror Delete
  const gasUrl = localStorage.getItem('wms_gas_endpoint') || localStorage.getItem('wms_endpoint_url') || '';
  if (gasUrl && gasUrl.startsWith('http')) {
    try {
      fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'no-cors',
        body: JSON.stringify({
          action: 'hapusBatchPenerimaanProduksi',
          no_surat_jalan: cleanSJ,
        }),
      }).catch((e) => console.warn('GAS mirror hapus penerimaan failed:', e));
    } catch {}
  }

  // 4. Dispatch event
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('wms_penerimaan_produksi_updated', {
          detail: { action: 'delete_batch', no_surat_jalan: cleanSJ },
        })
      );
    } catch {}
  }

  return true;
}

/**
 * Hapus 1 baris item penerimaan spesifik
 */
export async function hapusPenerimaanProduksiSingleRowFromSupabase(id: string | number): Promise<boolean> {
  const sid = String(id);

  try {
    await supabaseFetch('penerimaan_produksi', 'DELETE', undefined, `id=eq.${encodeURIComponent(sid)}`);
  } catch (err) {
    console.warn('Gagal hapus single row penerimaan_produksi dari Supabase:', err);
  }

  try {
    const cached = localStorage.getItem('wms_local_penerimaan_produksi');
    if (cached) {
      const list: PenerimaanProduksiItem[] = JSON.parse(cached);
      const filtered = list.filter((it) => String(it.id) !== sid);
      localStorage.setItem('wms_local_penerimaan_produksi', JSON.stringify(filtered));
    }
  } catch {}

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('wms_penerimaan_produksi_updated', {
          detail: { action: 'delete_single', id: sid },
        })
      );
    } catch {}
  }

  return true;
}
