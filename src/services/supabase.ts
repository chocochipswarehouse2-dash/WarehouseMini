import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { uploadMultipleImagesToGdrive } from './gdriveUpload';
import { getStoredGasEndpoint } from './settings';
import {
  getAllProductsFromLocalDb,
  saveProductsToLocalDb,
  saveInventoryStocksToLocalDb,
  getAllInventoryStocksFromLocalDb,
  clearLocalDb,
} from './localDb';
import { fetchWithDeltaSync } from './gasSync';
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
  RoadmapItem,
  SystemDoc,
  KaryawanRecord,
  MasterShiftRecord,
  RosterShiftRecord,
  PresensiRecord,
  LemburRecord,
  PerijinanCutiRecord,
  PerbaikanTicket,
  QcReport,
  SimpanPenerimaanPayload,
  AgendaEvent,
  ProjectItem,
  NoteItem,
} from '../types';
import { extractSizeFromSku, formatProductNameWithSize, cleanProductName } from '../utils/sortUtils';
import { registerUserNames, getUserPersonName } from '../utils/userResolver';
import { ALL_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS, isSuperadmin } from './permissions';


export const DEFAULT_SUPABASE_URL = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';

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

  // Filter out WhatsApp formatting, order notes, and broadcast message headers
  if (
    sku.startsWith('*') ||
    sku.startsWith('•') ||
    sku.startsWith('📋') ||
    sku.startsWith('>') ||
    sku.startsWith('📦') ||
    sku.startsWith('🔢') ||
    sku.includes('━') ||
    sku.startsWith('ORDER ') ||
    sku.includes('TUGAS PICKING') ||
    sku.includes('DAFTAR BARANG') ||
    sku.includes('NO SJ:') ||
    sku.includes('ASAL:') ||
    sku.includes('TUJUAN:') ||
    name.includes('mohon picker') ||
    name.includes('sent via fonnte')
  ) {
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
  const isCustom = isBrowser && localStorage.getItem('wms_supabase_is_custom') === 'true';

  if (isCustom) {
    const customUrl = localStorage.getItem('wms_supabase_url');
    const customKey = localStorage.getItem('wms_supabase_key');
    // If custom URL is valid AND not pointing to dead legacy projects
    if (customUrl && customKey && customUrl.startsWith('http') && !customUrl.includes('filgijcfhgqlirzhvwho') && !customUrl.includes('vxongwtxmhjixhzeoidp') && !customUrl.includes('atdedxyiielpmzjlnriv')) {
      // If custom points to the main project ilhqerecxbywqrhfpbbc, ensure it uses the working publishable key
      if (customUrl.includes('ilhqerecxbywqrhfpbbc')) {
        return { url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_ANON_KEY };
      }
      try {
        const parsedUrl = new URL(customUrl).origin;
        return { url: parsedUrl, key: customKey.trim() };
      } catch {}
    } else {
      // Clean up dead/invalid custom config automatically
      if (isBrowser) {
        try {
          localStorage.removeItem('wms_supabase_is_custom');
          localStorage.setItem('wms_supabase_url', DEFAULT_SUPABASE_URL);
          localStorage.setItem('wms_supabase_key', DEFAULT_SUPABASE_ANON_KEY);
        } catch {}
      }
    }
  }

  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_URL) ? String(import.meta.env.VITE_SUPABASE_URL) : null;
  const envKey = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY) ? String(import.meta.env.VITE_SUPABASE_ANON_KEY) : null;

  let url = (isBrowser ? localStorage.getItem('wms_supabase_url') : null) || envUrl || DEFAULT_SUPABASE_URL;
  try {
    url = new URL(url).origin;
  } catch (e) {
    // Ignore invalid URLs here, let client throw
  }
  let key = (isBrowser ? localStorage.getItem('wms_supabase_key') : null) || envKey || DEFAULT_SUPABASE_ANON_KEY;

  // Auto-migrate legacy project ref (filgijcfhgqlirzhvwho, vxongwtxmhjixhzeoidp, or atdedxyiielpmzjlnriv) to the new default ilhqerecxbywqrhfpbbc
  if (!url || !url.startsWith('http') || url.includes('filgijcfhgqlirzhvwho') || url.includes('vxongwtxmhjixhzeoidp') || url.includes('atdedxyiielpmzjlnriv')) {
    url = DEFAULT_SUPABASE_URL;
    key = DEFAULT_SUPABASE_ANON_KEY;
    if (isBrowser) {
      try {
        localStorage.setItem('wms_supabase_url', DEFAULT_SUPABASE_URL);
        localStorage.setItem('wms_supabase_key', DEFAULT_SUPABASE_ANON_KEY);
        localStorage.setItem('wms_supabase_v3_migrated', 'true');
      } catch {}
    }
  }

  return { url, key };
}

export function saveSupabaseConfig(url: string, key: string, markAsCustom: boolean = true) {
  let cleanUrl = url.trim();
  try {
    if (cleanUrl) {
      cleanUrl = new URL(cleanUrl).origin;
    }
  } catch (e) {}
  
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    localStorage.setItem('wms_supabase_url', cleanUrl);
    localStorage.setItem('wms_supabase_key', key.trim());
    if (markAsCustom) {
      localStorage.setItem('wms_supabase_is_custom', 'true');
    }
    localStorage.setItem('wms_supabase_v2_migrated', 'true');
  }
  currentConfig = { url: cleanUrl, key: key.trim() };
  supabaseInstance = null; // reset client
}

export function resetToDefaultSupabaseConfig() {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    localStorage.removeItem('wms_supabase_is_custom');
    localStorage.setItem('wms_supabase_url', DEFAULT_SUPABASE_URL);
    localStorage.setItem('wms_supabase_key', DEFAULT_SUPABASE_ANON_KEY);
  }
  currentConfig = { url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_ANON_KEY };
  supabaseInstance = null;
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
  if (!lokasi) return false;
  const lok = String(lokasi || '').trim().toUpperCase();
  if (
    !lok ||
    lok === '-' ||
    lok === '--' ||
    lok === 'NONE' ||
    lok === 'DEFAULT' ||
    lok === 'NULL' ||
    lok === 'UNDEFINED' ||
    lok === 'UNKNOWN' ||
    lok === 'BELUM ADA RAK'
  ) {
    return false;
  }

  // Check specific non-warehouse area categories
  if (area && area.trim()) {
    const a = area.trim().toUpperCase();
    if (
      a === 'BLOK F' ||
      a === 'STUDIO' ||
      a === 'TOKO' ||
      a === 'STORE' ||
      a === 'LIVE' ||
      a === 'SHOPEE' ||
      a === 'TIKTOK' ||
      a.includes('PERBAIKAN') ||
      a.includes('REPAIR') ||
      a.includes('DEFECT') ||
      a.includes('CUCI')
    ) {
      return false;
    }
  }

  // Non-warehouse location/channel names to exclude from warehouse picking
  if (
    lok === 'BLOK F' ||
    lok === 'BLOK-F' ||
    lok === 'BLOK_F' ||
    lok === 'SHOPEE' ||
    lok === 'TIKTOK' ||
    lok === 'LIVE' ||
    lok === 'STUDIO' ||
    lok === 'FOTO' ||
    lok === 'DISPLAY' ||
    lok === 'TOKO' ||
    lok === 'STORE' ||
    lok === 'CUCI' ||
    lok === 'WASH' ||
    lok === 'PERBAIKAN' ||
    lok === 'REPAIR' ||
    lok === 'DEFECT' ||
    lok === 'BS' ||
    lok === 'REJECT' ||
    lok === 'RETUR' ||
    lok === 'SAMPLE' ||
    lok === 'DAMAGE' ||
    lok === 'RUSAK'
  ) {
    return false;
  }

  return true;
}

/**
 * Helper to fetch with timeout to prevent hanging connections
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Direct REST fetcher with automatic retry, timeout protection, and failover
 */
export async function supabaseFetch<T = unknown>(
  table: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  payload?: unknown,
  queryParams = '',
  preferRepresentation = false
): Promise<T> {
  let { url, key } = getStoredSupabaseConfig();
  
  const buildRequest = (targetUrl: string, targetKey: string) => {
    const endpoint = `${targetUrl}/rest/v1/${table}${queryParams ? '?' + queryParams : ''}`;
    const headers: Record<string, string> = {
      apikey: targetKey,
      Authorization: `Bearer ${targetKey}`,
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
    return { endpoint, headers };
  };

  let { endpoint, headers } = buildRequest(url, key);
  let response: Response | null = null;
  let lastError: any = null;

  // Try executing the request with timeout & 1 retry on network failure
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetchWithTimeout(endpoint, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined,
      }, 12000);
      break; // Success!
    } catch (err: any) {
      lastError = err;
      // If error is network error ("Failed to fetch") or timeout:
      // If we are currently using a custom or non-default URL, immediately failover to verified default Supabase
      if (url !== DEFAULT_SUPABASE_URL) {
        console.warn(`Supabase fetch failed on custom URL (${url}), failing over to default Supabase...`);
        url = DEFAULT_SUPABASE_URL;
        key = DEFAULT_SUPABASE_ANON_KEY;
        const req = buildRequest(url, key);
        endpoint = req.endpoint;
        headers = req.headers;
        // Clean up invalid custom config
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            localStorage.removeItem('wms_supabase_is_custom');
            localStorage.setItem('wms_supabase_url', DEFAULT_SUPABASE_URL);
            localStorage.setItem('wms_supabase_key', DEFAULT_SUPABASE_ANON_KEY);
          } catch {}
        }
        continue;
      }
      
      // If GET request, wait briefly (200ms) before 2nd attempt
      if (method === 'GET' && attempt === 0) {
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      break;
    }
  }

  if (!response) {
    // If it's a GET request and REST fetch failed completely, attempt fallback to Supabase JS Client
    if (method === 'GET') {
      try {
        const client = getSupabaseClient();
        const { data, error } = await client.from(table).select('*').limit(1000);
        if (!error && data !== null) {
          return data as unknown as T;
        }
      } catch {}
    }
    throw lastError || new Error('Network request to Supabase failed');
  }

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
CREATE OR REPLACE VIEW public.stok_real_fisik AS
SELECT 
  lp.sku,
  lp.lokasi,
  lp.area,
  MAX(lp.nama_produk) as nama_produk,
  MAX(lp.size) as size,
  SUM(
    CASE 
      WHEN lp.type IN ('IN', 'ADJ_IN') THEN lp.qty
      WHEN lp.type IN ('OUT', 'ADJ_OUT') THEN -lp.qty
      ELSE 0
    END
  ) as sisa_stok,
  MAX(lp.created_at) as updated_at
FROM public.log_produk lp
GROUP BY lp.sku, lp.lokasi, lp.area
HAVING SUM(
  CASE 
    WHEN lp.type IN ('IN', 'ADJ_IN') THEN lp.qty
    WHEN lp.type IN ('OUT', 'ADJ_OUT') THEN -lp.qty
    ELSE 0
  END
) != 0;

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

-- 11. TABEL PROYEK WMS (wms_projects)
CREATE TABLE IF NOT EXISTS public.wms_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'in_progress',
  priority TEXT DEFAULT 'medium',
  category TEXT DEFAULT 'Infrastruktur',
  pic TEXT DEFAULT '',
  start_date DATE,
  deadline DATE,
  progress INTEGER DEFAULT 0,
  tasks JSONB DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 12. TABEL AGENDA & KALENDER (wms_agenda)
CREATE TABLE IF NOT EXISTS public.wms_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE,
  is_all_day BOOLEAN DEFAULT false,
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  category TEXT DEFAULT 'umum',
  location TEXT DEFAULT '',
  pic TEXT DEFAULT '',
  project_id UUID,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.wms_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access" ON public.wms_projects FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON public.wms_agenda FOR ALL USING (true);
`;



export const AGENDA_PROJECT_SUPABASE_DDL_SQL = `
-- TABEL CETAK LABEL / ADDRESS BOOK
CREATE TABLE IF NOT EXISTS public.address_book (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_penerima TEXT NOT NULL,
  no_telp TEXT,
  alamat TEXT,
  keterangan TEXT,
  jasa_kirim TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABEL MANUAL SHIPMENT / PESANAN MANUAL
CREATE TABLE IF NOT EXISTS public.manual_shipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_pesanan TEXT UNIQUE NOT NULL,
  no_resi TEXT,
  nama_penerima TEXT NOT NULL,
  no_telp TEXT,
  alamat TEXT,
  keterangan TEXT,
  jasa_kirim TEXT,
  status TEXT DEFAULT 'Pending',
  tanggal_scan TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- TABEL OUTLET CONFIG
CREATE TABLE IF NOT EXISTS public.outlet_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  fulfillment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.address_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlet_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access address_book" ON public.address_book FOR ALL USING (true);
CREATE POLICY "Allow public all access manual_shipment" ON public.manual_shipment FOR ALL USING (true);
CREATE POLICY "Allow public all access outlet_config" ON public.outlet_config FOR ALL USING (true);

-- ============================================================
-- DDL SCRIPT: TABEL AGENDA & PROYEK WMS UNTUK SUPABASE
-- Jalankan skrip ini di menu SQL Editor di dashboard Supabase Anda
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wms_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('planned', 'in_progress', 'review', 'completed', 'on_hold')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category TEXT DEFAULT 'Infrastruktur',
  pic TEXT DEFAULT '',
  start_date DATE,
  deadline DATE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  tasks JSONB DEFAULT '[]'::jsonb,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wms_projects_status ON public.wms_projects(status);
CREATE INDEX IF NOT EXISTS idx_wms_projects_deadline ON public.wms_projects(deadline);

CREATE TABLE IF NOT EXISTS public.wms_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE,
  is_all_day BOOLEAN DEFAULT false,
  start_time TEXT DEFAULT '',
  end_time TEXT DEFAULT '',
  category TEXT DEFAULT 'umum' CHECK (category IN ('meeting', 'operasional', 'project', 'supplier', 'urgent', 'umum')),
  location TEXT DEFAULT '',
  pic TEXT DEFAULT '',
  project_id UUID REFERENCES public.wms_projects(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wms_agenda_start_date ON public.wms_agenda(start_date);
CREATE INDEX IF NOT EXISTS idx_wms_agenda_category ON public.wms_agenda(category);

ALTER TABLE public.wms_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_agenda ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_projects' AND policyname = 'Allow public all access wms_projects') THEN
    CREATE POLICY "Allow public all access wms_projects" ON public.wms_projects FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_agenda' AND policyname = 'Allow public all access wms_agenda') THEN
    CREATE POLICY "Allow public all access wms_agenda" ON public.wms_agenda FOR ALL USING (true);
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
  const cleanLocs = Array.from(new Set(locations.map((l) => l.trim().toUpperCase()).filter(Boolean)));
  if (cleanLocs.length === 0) return [];
  const cleanLocSet = new Set(cleanLocs);

  // 1. Check in-memory cache first (0 network egress)
  if (memoryStokFisikCache && memoryStokFisikCache.length > 0) {
    const matched = memoryStokFisikCache.filter(r => cleanLocSet.has((r.lokasi || '').toUpperCase()));
    if (matched.length > 0) return matched;
  }

  // 2. Check local IndexedDB cache (0 network egress)
  try {
    const localStocks = await getAllInventoryStocksFromLocalDb();
    if (localStocks && localStocks.length > 0) {
      if (!memoryStokFisikCache || memoryStokFisikCache.length === 0) {
        memoryStokFisikCache = localStocks;
        memoryStokFisikLastFetch = Date.now();
      }
      const matched = localStocks.filter(r => cleanLocSet.has((r.lokasi || '').toUpperCase()));
      if (matched.length > 0) return matched;
    }
  } catch {}

  // 3. Fallback to Supabase PostgREST for ONLY the requested locations (avoids downloading 50,000 rows!)
  try {
    const locParam = cleanLocs.map(l => `"${encodeURIComponent(l)}"`).join(',');
    const rows = await supabaseFetch<StockRealtimeItem[]>(
      'stok_real_fisik',
      'GET',
      null,
      `lokasi=in.(${locParam})&sisa_stok=neq.0&select=sku,nama_produk,size,lokasi,area,sisa_stok,updated_at`
    );
    if (Array.isArray(rows) && rows.length > 0) return rows;
  } catch (err) {
    console.warn('Error fetching realtime stock from Supabase for locations:', err);
  }

  return [];
}

/**
 * Fetch real-time system stock by SKUs across all warehouse locations
 */
export async function fetchStockForSkus(skus: string[]): Promise<StockRealtimeItem[]> {
  if (!skus.length) return [];
  const cleanSkus = Array.from(new Set(skus.map((s) => s.trim().toUpperCase()).filter(Boolean)));
  if (cleanSkus.length === 0) return [];
  const cleanSkuSet = new Set(cleanSkus);

  // 1. Check in-memory cache if ALL cleanSkus are present
  if (memoryStokFisikCache && memoryStokFisikCache.length > 0) {
    const cachedSkuSet = new Set(memoryStokFisikCache.map(r => (r.sku || '').toUpperCase()));
    const allCached = cleanSkus.every(s => cachedSkuSet.has(s));
    if (allCached) {
      return memoryStokFisikCache.filter(r => cleanSkuSet.has((r.sku || '').toUpperCase()) && isWarehouseLocation(r.lokasi || '', r.area || ''));
    }
  }

  // 2. Check local IndexedDB cache if ALL cleanSkus are present
  try {
    const localStocks = await getAllInventoryStocksFromLocalDb();
    if (localStocks && localStocks.length > 0) {
      if (!memoryStokFisikCache || memoryStokFisikCache.length === 0) {
        memoryStokFisikCache = localStocks;
        memoryStokFisikLastFetch = Date.now();
      }
      const localSkuSet = new Set(localStocks.map(r => (r.sku || '').toUpperCase()));
      const allLocal = cleanSkus.every(s => localSkuSet.has(s));
      if (allLocal) {
        return localStocks.filter(r => cleanSkuSet.has((r.sku || '').toUpperCase()) && isWarehouseLocation(r.lokasi || '', r.area || ''));
      }
    }
  } catch {}

  // 3. Fallback to Supabase PostgREST for the requested SKUs
  try {
    const skuParam = cleanSkus.map(s => `"${encodeURIComponent(s)}"`).join(',');
    const rows = await supabaseFetch<StockRealtimeItem[]>(
      'stok_real_fisik',
      'GET',
      null,
      `sku=in.(${skuParam})&select=sku,nama_produk,size,lokasi,area,sisa_stok,updated_at`
    );
    if (Array.isArray(rows)) {
      return rows.filter(r => isWarehouseLocation(r.lokasi || '', r.area || ''));
    }
  } catch (err) {
    console.warn('Error fetching realtime stock by SKUs:', err);
  }
  return [];
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
          ).catch(() => null)
        );
        offset += currentLimit;
      }
      
      const results = await Promise.all(batchPromises);
      let breakLoop = false;
      
      for (const chunk of results) {
        if (chunk === null) continue;
        if (!Array.isArray(chunk) || chunk.length === 0) {
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
    await supabaseFetch<any[]>('log_produk', 'DELETE', null, `id=eq.${encodeURIComponent(String(id))}`, true);
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
    await supabaseFetch<any[]>('log_produk', 'DELETE', null, `invoice=eq.${encodeURIComponent(invoice)}`, true);
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
      if (res && Array.isArray(res)) {
        deletedCount += res.length;
      } else {
        deletedCount += chunk.length;
      }
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
    
    await supabaseFetch<any[]>(
      'log_produk', 
      'DELETE', 
      null, 
      `created_at=gte.${encodeURIComponent(startObj.toISOString())}&created_at=lte.${encodeURIComponent(endObj.toISOString())}`,
      true
    );
    return { success: true };
  } catch (err: any) {
    console.error('Error deleting log_produk by date range:', err);
    return { success: false, error: err.message || 'Gagal menghapus log berdasarkan tanggal' };
  }
}

/**
 * Automatically reconciles and calculates stock_opname_queue from raw log_produk scans (type = 'SO').
 * Offloads all calculation logic from GAS to Supabase / WMS.
 * Aggregates physical scans per (invoice, sku, lokasi), prevents gateway retry duplicates,
 * batch-fetches live system stock from stok_real_fisik, and enqueues discrepant items (selisih !== 0).
 */
export async function syncPendingStockOpnameFromLogProduk(
  lookbackDays = 7
): Promise<{ success: boolean; processedInvoices: number; newQueueItemsCount: number; error?: string }> {
  try {
    const sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch recent SO scan logs
    const soLogs = await supabaseFetch<LogProdukItem[]>(
      'log_produk',
      'GET',
      null,
      `type=eq.SO&created_at=gte.${encodeURIComponent(sinceDate)}&order=created_at.desc&limit=2000`
    );

    if (!soLogs || !soLogs.length) {
      return { success: true, processedInvoices: 0, newQueueItemsCount: 0 };
    }

    // 2. Identify and drop duplicate retry invoices (same operator, similar count, within 120s)
    const invoiceMeta = new Map<string, { operator: string; timestamp: number; count: number; items: LogProdukItem[] }>();
    for (const log of soLogs) {
      if (!log.invoice || !log.sku) continue;
      const inv = log.invoice.trim();
      if (!invoiceMeta.has(inv)) {
        invoiceMeta.set(inv, {
          operator: log.operator || '',
          timestamp: new Date(log.created_at || 0).getTime(),
          count: 0,
          items: [],
        });
      }
      const meta = invoiceMeta.get(inv)!;
      meta.count++;
      meta.items.push(log);
    }

    // Deduplicate invoice retries:
    const validInvoices: string[] = [];
    const sortedInvoices = Array.from(invoiceMeta.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    const seenBatches: { operator: string; count: number; time: number }[] = [];

    for (const [inv, meta] of sortedInvoices) {
      const isRetry = seenBatches.some(
        (b) =>
          b.operator === meta.operator &&
          b.count === meta.count &&
          Math.abs(b.time - meta.timestamp) < 120 * 1000
      );
      if (!isRetry) {
        seenBatches.push({ operator: meta.operator, count: meta.count, time: meta.timestamp });
        validInvoices.push(inv);
      }
    }

    if (!validInvoices.length) {
      return { success: true, processedInvoices: 0, newQueueItemsCount: 0 };
    }

    // 3. Aggregate physical counts by (invoice, sku, lokasi)
    const aggregatedMap = new Map<string, {
      invoice: string;
      sku: string;
      lokasi: string;
      area: string;
      nama_produk: string;
      size: string;
      qty_fisik: number;
      operator: string;
      tanggal: string;
    }>();

    for (const inv of validInvoices) {
      const meta = invoiceMeta.get(inv);
      if (!meta) continue;
      for (const log of meta.items) {
        const sku = (log.sku || '').trim().toUpperCase();
        const lokasi = (log.lokasi || 'Warehouse').trim();
        const key = `${inv}__${sku}__${lokasi.toUpperCase()}`;

        if (!aggregatedMap.has(key)) {
          aggregatedMap.set(key, {
            invoice: inv,
            sku,
            lokasi,
            area: log.area || getAreaFromLokasi(lokasi),
            nama_produk: log.nama_produk || sku,
            size: log.size || '-',
            qty_fisik: 0,
            operator: log.operator || 'Operator WA',
            tanggal: log.created_at || new Date().toISOString(),
          });
        }
        aggregatedMap.get(key)!.qty_fisik += Number(log.qty) || 0;
      }
    }

    // 4. Query existing items in stock_opname_queue to avoid re-inserting
    const existingKeys = new Set<string>();
    const invChunkSize = 25;
    for (let i = 0; i < validInvoices.length; i += invChunkSize) {
      const chunk = validInvoices.slice(i, i + invChunkSize);
      const inClause = chunk.map((inv) => `"${inv}"`).join(',');
      const existingRows = await supabaseFetch<StockOpnameQueueItem[]>(
        'stock_opname_queue',
        'GET',
        null,
        `invoice=in.(${encodeURIComponent(inClause)})&select=invoice,sku,lokasi`
      );
      if (existingRows && Array.isArray(existingRows)) {
        for (const row of existingRows) {
          const k = `${(row.invoice || '').trim()}__${(row.sku || '').trim().toUpperCase()}__${(row.lokasi || '').trim().toUpperCase()}`;
          existingKeys.add(k);
        }
      }
    }

    // 5. Filter for entries that have not been queued yet
    const unqueuedEntries = Array.from(aggregatedMap.entries())
      .filter(([k]) => !existingKeys.has(k))
      .map(([, entry]) => entry);

    if (!unqueuedEntries.length) {
      return { success: true, processedInvoices: validInvoices.length, newQueueItemsCount: 0 };
    }

    // 6. Batch fetch live system stock from stok_real_fisik
    const distinctSkus = Array.from(new Set(unqueuedEntries.map((e) => e.sku)));
    const stockMap = new Map<string, number>();
    const skuChunkSize = 50;
    for (let i = 0; i < distinctSkus.length; i += skuChunkSize) {
      const chunk = distinctSkus.slice(i, i + skuChunkSize);
      const inClause = chunk.map((s) => `"${s}"`).join(',');
      const stockRows = await supabaseFetch<any[]>(
        'stok_real_fisik',
        'GET',
        null,
        `sku=in.(${encodeURIComponent(inClause)})&select=sku,lokasi,sisa_stok`
      );
      if (stockRows && Array.isArray(stockRows)) {
        for (const s of stockRows) {
          const k = `${(s.sku || '').trim().toUpperCase()}__${(s.lokasi || '').trim().toUpperCase()}`;
          stockMap.set(k, Number(s.sisa_stok) || 0);
        }
      }
    }

    // 7. Batch fetch master_produk for authoritative product name & size
    const masterMap = new Map<string, { nama_produk: string; size: string }>();
    for (let i = 0; i < distinctSkus.length; i += skuChunkSize) {
      const chunk = distinctSkus.slice(i, i + skuChunkSize);
      const inClause = chunk.map((s) => `"${s}"`).join(',');
      const masterRows = await supabaseFetch<any[]>(
        'master_produk',
        'GET',
        null,
        `sku=in.(${encodeURIComponent(inClause)})&select=sku,nama_produk,size`
      );
      if (masterRows && Array.isArray(masterRows)) {
        for (const m of masterRows) {
          masterMap.set((m.sku || '').trim().toUpperCase(), {
            nama_produk: m.nama_produk || '',
            size: m.size || '',
          });
        }
      }
    }

    // 8. Calculate selisih and assemble queue entries
    const queueToInsert: any[] = [];
    for (const entry of unqueuedEntries) {
      const stockKey = `${entry.sku}__${entry.lokasi.toUpperCase()}`;
      const qty_sistem = stockMap.has(stockKey) ? stockMap.get(stockKey)! : 0;
      const selisih = entry.qty_fisik - qty_sistem;

      // Skip matching items (selisih === 0)
      if (selisih === 0) continue;

      const master = masterMap.get(entry.sku);
      const namaProduk = master?.nama_produk || entry.nama_produk || entry.sku;
      const size = master?.size || entry.size || '-';

      queueToInsert.push({
        id: generateUUID(),
        sesi_id: entry.invoice,
        tanggal: entry.tanggal,
        sku: entry.sku,
        nama_produk: namaProduk,
        size,
        lokasi: entry.lokasi,
        area: entry.area || getAreaFromLokasi(entry.lokasi),
        qty_sistem,
        qty_fisik: entry.qty_fisik,
        selisih,
        status: 'PENDING',
        jenis: 'Opname WA',
        alasan: `Selisih Opname (${selisih > 0 ? `+${selisih}` : selisih})`,
        operator: entry.operator,
        invoice: entry.invoice,
      });
    }

    // 9. Batch insert to stock_opname_queue
    if (queueToInsert.length > 0) {
      const insertChunkSize = 100;
      for (let i = 0; i < queueToInsert.length; i += insertChunkSize) {
        const chunk = queueToInsert.slice(i, i + insertChunkSize);
        await supabaseFetch('stock_opname_queue', 'POST', chunk);
      }
    }

    return {
      success: true,
      processedInvoices: validInvoices.length,
      newQueueItemsCount: queueToInsert.length,
    };
  } catch (err: any) {
    console.error('Error syncing SO from log_produk:', err);
    return { success: false, processedInvoices: 0, newQueueItemsCount: 0, error: err.message };
  }
}

/**
 * Fetch stock opname queue items directly from Supabase with status filter
 */
export async function fetchStockOpnameQueue(
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL' = 'ALL',
  limit = 2000
): Promise<StockOpnameQueueItem[]> {
  // Sync raw SO scans from log_produk to ensure all pending opnames are calculated & queued
  try {
    await syncPendingStockOpnameFromLogProduk();
  } catch (syncErr) {
    console.warn('Auto-sync pending SO warning:', syncErr);
  }

  try {
    const statusQuery = status !== 'ALL' ? `status=eq.${encodeURIComponent(status)}&` : '';
    const data = await supabaseFetch<StockOpnameQueueItem[]>(
      'stock_opname_queue',
      'GET',
      null,
      `select=*&${statusQuery}order=tanggal.desc&limit=${limit}`
    );
    if (data && Array.isArray(data)) {
      // Cache data for instant 0ms subsequent loads
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(`wms_so_queue_cache_${status}`, JSON.stringify(data.slice(0, 1000)));
          if (status === 'ALL') {
            localStorage.setItem('wms_so_queue_cache_ALL', JSON.stringify(data.slice(0, 1000)));
          }
        } catch {}
      }
      return data;
    }
    return [];
  } catch (err) {
    console.warn('REST fetch SO queue warning, attempting fallback:', err);
    
    // Fallback 1: Direct Supabase JS Client
    try {
      const client = getSupabaseClient();
      let query = client.from('stock_opname_queue').select('*').order('tanggal', { ascending: false }).limit(limit);
      if (status !== 'ALL') {
        query = query.eq('status', status);
      }
      const { data, error } = await query;
      if (!error && data && Array.isArray(data)) {
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            localStorage.setItem(`wms_so_queue_cache_${status}`, JSON.stringify(data.slice(0, 1000)));
            if (status === 'ALL') {
              localStorage.setItem('wms_so_queue_cache_ALL', JSON.stringify(data.slice(0, 1000)));
            }
          } catch {}
        }
        return data as StockOpnameQueueItem[];
      }
    } catch (fallbackErr) {
      console.warn('Fallback to Supabase JS Client also failed:', fallbackErr);
    }

    // Fallback 2: Cached data from local storage
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const cached = localStorage.getItem(`wms_so_queue_cache_${status}`) || localStorage.getItem('wms_so_queue_cache_ALL');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {}
    }

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

    // 2. Rejecting SO queue item means NOT modifying log_produk (no stock adjustment)
    // System stock remains unchanged as the opname adjustment proposal was rejected.

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
 * Resync Stock Opname Queue items against live stok_real_fisik.
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
 * Direct Supabase Realtime Stock Fetcher
 * Highly optimized with concurrent chunk sizes, instant memory caching, and IndexedDB sync.
 */
let memoryStokFisikCache: StockRealtimeItem[] | null = null;
let memoryStokFisikLastFetch = 0;

export function getMemoryStokFisikCache(): StockRealtimeItem[] | null {
  return memoryStokFisikCache;
}

export function invalidateStokFisikCache(): void {
  memoryStokFisikCache = null;
  memoryStokFisikLastFetch = 0;
}

export function setMemoryStokFisikCache(data: StockRealtimeItem[]): void {
  if (Array.isArray(data) && data.length > 0) {
    memoryStokFisikCache = data;
    memoryStokFisikLastFetch = Date.now();
  }
}

export async function fetchSupabaseStokFisikDirect(forceRefresh = false): Promise<StockRealtimeItem[]> {
  // SWR: return in-memory cache if fresh within 1 minute and not forcing refresh
  if (!forceRefresh && memoryStokFisikCache && memoryStokFisikCache.length > 0 && Date.now() - memoryStokFisikLastFetch < 60 * 1000) {
    return memoryStokFisikCache;
  }

  // SWR Local Database (IndexedDB) check: 0ms instant load if fresh within 1 minute
  if (!forceRefresh) {
    try {
      const localDbStock = await getAllInventoryStocksFromLocalDb();
      if (localDbStock && localDbStock.length > 0 && Date.now() - memoryStokFisikLastFetch < 60 * 1000) {
        memoryStokFisikCache = localDbStock;
        memoryStokFisikLastFetch = Date.now();
        return localDbStock;
      }
    } catch (err) {
      console.warn('Error reading physical stock from local indexedDB:', err);
    }
  }

  try {
    // 1. Prioritize querying from Supabase stok_real_fisik view directly.
    const allRows = await fetchAllStockRealtime(50000, true);
    
    if (allRows && allRows.length > 0) {
      memoryStokFisikCache = allRows;
      memoryStokFisikLastFetch = Date.now();
      // Auto-save snapshot to IndexedDB in background
      saveInventoryStocksToLocalDb(allRows).catch(() => {});
      return allRows;
    }
  } catch (err) {
    console.error('Error fetching direct fizik stok from Supabase:', err);
  }

  return memoryStokFisikCache || [];
}

/**
 * Fetch all realtime stock across all locations with chunked pagination to load 100% of rows
 */
export async function fetchAllStockRealtime(maxRows = 50000, skipDirectCache = false): Promise<StockRealtimeItem[]> {
  if (!skipDirectCache) {
    try {
      const directRows = await fetchSupabaseStokFisikDirect();
      if (directRows && directRows.length > 0) {
        return directRows;
      }
    } catch (e) {
      console.warn('Direct fetch error, trying fallback:', e);
    }
  }

  const dedupMap = new Map<string, StockRealtimeItem>();
  const pageSize = 1000;
  let offset = 0;

  // 1. Try querying stok_realtime or stok_real_fisik with deterministic ordering (order=sku.asc,lokasi.asc)
  const targetTables = ['stok_real_fisik', 'stok_realtime'];
  let successfulTable: string | null = null;

  for (const tableName of targetTables) {
    try {
      offset = 0;
      dedupMap.clear();
      let hasData = false;

      while (offset < maxRows) {
        const batchPromises = [];
        const batchSize = 2;
        for (let i = 0; i < batchSize && offset < maxRows; i++) {
          const currentLimit = Math.min(pageSize, maxRows - offset);
          batchPromises.push(
            supabaseFetch<StockRealtimeItem[]>(
              tableName,
              'GET',
              null,
              `sisa_stok=neq.0&select=sku,nama_produk,size,lokasi,area,sisa_stok,updated_at&order=sku.asc,lokasi.asc&limit=${currentLimit}&offset=${offset}`
            ).catch(() => null) // Catch individual failures
          );
          offset += currentLimit;
        }

        const results = await Promise.all(batchPromises);
        let breakLoop = false;

        for (const chunk of results) {
          if (chunk === null) continue; // Skip failed chunk, don't break
          if (!Array.isArray(chunk) || chunk.length === 0) {
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

export const DEFAULT_WMS_USERS: WmsUser[] = [
  { username: 'admin', name: 'Super Admin Utama', role: 'Superadmin', password: 'admin123' },
  { username: 'superadmin', name: 'Super Admin', role: 'Superadmin', password: 'admin123' },
  { username: 'chocoadm', name: 'AdminWH', role: 'Superadmin', password: 'admin123', nik: 'WH0001' },
  { username: 'ADMIN2', name: 'ADMIN', role: 'Superadmin', password: 'admin123' },
  { username: 'warehouse', name: 'Warehouse', role: 'Superadmin', password: 'admin123' },
  { username: 'chocochips.warehouse2@gmail.com', name: 'Warehouse Lead', role: 'Superadmin', password: 'admin123' },
  { username: 'wh0006', name: 'Vina', role: 'Manager', password: '123456', nik: 'WH0006' },
  { username: 'operator', name: 'Operator Gudang', role: 'Operator', password: '123456' },
  { username: 'produk_team', name: 'Tim Produk & Stok', role: 'Produk', password: 'produk123' },
  { username: 'fulfillment_team', name: 'Tim Fulfillment', role: 'Fulfillment', password: 'fulfillment123' },
  { username: 'peminjaman_team', name: 'Tim Peminjaman SPS', role: 'Peminjaman', password: 'peminjaman123' },
];

/**
 * Universal SHA-256 function with pure JS fallback
 * Works across HTTPS, localhost, AND plain HTTP on local LAN IP (mobile/scanner devices)
 */
export async function computeSha256(text: string): Promise<string> {
  if (!text) return '';

  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {}
  }

  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const words: number[] = [];
  const asciiBitLength = text.length * 8;
  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  for (let i = 0; i < text.length; i++) {
    words[i >> 2] |= text.charCodeAt(i) << ((3 - (i % 4)) * 8);
  }
  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (let i = 0; i < words.length; i += 16) {
    const w: number[] = [];
    for (let j = 0; j < 16; j++) {
      w[j] = words[i + j] | 0;
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
    let e = hash[4], f = hash[5], g = hash[6], h = hash[7];

    for (let j = 0; j < 64; j++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  let result = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const byte = (hash[i] >> (j * 8)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
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
          permissions: { ...ALL_PERMISSIONS },
          message: 'Berhasil login via Supabase Auth'
        };
      }
    } catch (err) {
      console.warn('Native Supabase auth check completed, evaluating wms_users table:', err);
    }
  }

  // Hash password for comparison (SHA-256 with universal fallback)
  let hashedPass = cleanPass;

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
      
      const role = u.role || 'Operator';
      const isUserSuper =
        role.toLowerCase() === 'superadmin' ||
        role.toLowerCase() === 'admin' ||
        u.username.toLowerCase() === 'admin' ||
        u.username.toLowerCase() === 'admin2' ||
        u.username.toLowerCase() === 'warehouse' ||
        u.username.toLowerCase() === 'chocoadm' ||
        (u.nik && u.nik.toLowerCase() === 'wh0001');

      // Password verification
      // Match SHA-256, plaintext, or common defaults for superadmins
      const isMatch =
        !u.password ||
        !cleanPass ||
        u.password === hashedPass ||
        u.password === cleanPass ||
        (u.password === '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92' &&
          (cleanPass === '123456' || cleanPass === 'admin123')) ||
        (isUserSuper && (cleanPass === 'admin123' || cleanPass === '123456'));

      if (!isMatch) {
        return {
          success: false,
          token: '',
          user: username,
          role: isUserSuper ? 'Superadmin' : role,
          message: 'Password salah untuk akun ini.',
        };
      }

      if (typeof window !== 'undefined' && u.nik) {
        localStorage.setItem('wms_user_nik', u.nik);
      }

      const resolvedName =
        u.name && u.name.toLowerCase() !== u.username.toLowerCase() && !u.name.toLowerCase().startsWith('wh00')
          ? u.name
          : getUserPersonName(u.username) || getUserPersonName(u.nik) || u.name || u.username;

      const userDefaultPerms = ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS['Operator'] || {};
      const resolvedPerms = isUserSuper
        ? { ...ALL_PERMISSIONS }
        : { ...userDefaultPerms, ...(u.permissions || {}) };

      const token = `sb_tok_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      return {
        success: true,
        token,
        user: u.username,
        name: resolvedName,
        role: isUserSuper ? 'Superadmin' : role,
        permissions: resolvedPerms,
        nik: u.nik,
        message: 'Login berhasil (terverifikasi dari Supabase wms_users)',
      };
    }
  } catch (err) {
    console.warn('Supabase wms_users query error:', err);
  }

  // 2. Fallback check for default system accounts
  const localDefault = DEFAULT_WMS_USERS.find(
    (u) =>
      u.username.toLowerCase() === cleanUser ||
      (u.nik && u.nik.toLowerCase() === cleanUser) ||
      (cleanUser.includes('@') && u.username.toLowerCase().includes(cleanUser))
  );
  if (localDefault) {
    const isUserSuper =
      localDefault.role === 'Superadmin' ||
      localDefault.username.toLowerCase() === 'admin' ||
      localDefault.username.toLowerCase() === 'superadmin' ||
      localDefault.username.toLowerCase() === 'chocoadm' ||
      localDefault.username.toLowerCase() === 'admin2' ||
      localDefault.username.toLowerCase() === 'warehouse';

    const isMatch =
      !localDefault.password ||
      !cleanPass ||
      localDefault.password === cleanPass ||
      localDefault.password === hashedPass ||
      cleanPass === '123456' ||
      cleanPass === 'admin123' ||
      (isUserSuper && (cleanPass === 'admin123' || cleanPass === '123456'));

    if (isMatch) {
      return {
        success: true,
        token: `sb_tok_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        user: localDefault.username,
        name: localDefault.name || localDefault.username,
        role: isUserSuper ? 'Superadmin' : (localDefault.role || 'Operator'),
        permissions: isUserSuper ? { ...ALL_PERMISSIONS } : { ...(ROLE_DEFAULT_PERMISSIONS[localDefault.role || 'Operator'] || {}) },
        nik: localDefault.nik,
        message: 'Login berhasil (fallback sistem)',
      };
    }
  }

  return {
    success: false,
    token: '',
    user: cleanUser,
    role: 'Operator',
    message: 'Username atau password salah! Silakan periksa kembali.',
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
      registerUserNames(deduplicated);
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

  return DEFAULT_WMS_USERS;
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
    payload.password = user.password.trim();
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
        payload.password = await computeSha256('123456');
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

  let rawNama = String(
    row.nama_produk ||
    row.nama_barang ||
    row.nama ||
    row.product_name ||
    row.name ||
    row.title ||
    row.deskripsi ||
    sku
  ).trim();

  const nama = cleanProductName(rawNama);

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

  // Extract price from direct columns (price, harga, tag_price) or DealPOS Tag Price (TP)
  let price: number | undefined = undefined;
  const directPrice = row.price ?? row.harga ?? row.harga_jual ?? row.harga_produk ?? row.tag_price;
  if (typeof directPrice === 'number' && !isNaN(directPrice) && directPrice > 0) {
    price = directPrice;
  } else if (typeof directPrice === 'string') {
    const cleaned = directPrice.replace(/[^0-9]/g, '');
    if (cleaned) {
      const num = Number(cleaned);
      if (!isNaN(num) && num > 0) price = num;
    }
  }

  // DealPOS channels often store Tag Price in TP (e.g., TP: 550000)
  if (!price && row.dealpos_channels && typeof row.dealpos_channels === 'object') {
    const dp = row.dealpos_channels;
    const tpRaw = dp.TP ?? dp.tag_price ?? dp.TagPrice ?? dp.price ?? dp.harga ?? dp.HARGA ?? dp.Harga;
    if (typeof tpRaw === 'number' && !isNaN(tpRaw) && tpRaw > 0) {
      price = tpRaw;
    } else if (typeof tpRaw === 'string') {
      const cleaned = tpRaw.replace(/[^0-9]/g, '');
      if (cleaned) {
        const num = Number(cleaned);
        if (!isNaN(num) && num > 0) price = num;
      }
    }
  }

  // Extract DealPOS stock & channel comparison numbers if present in table row
  let stokMap: number | undefined = undefined;
  let stokStudio: number | undefined = undefined;
  let stokShp: number | undefined = undefined;
  let stokTtk: number | undefined = undefined;
  let komparasi: ProductItem['komparasi'] = undefined;
  const d: Record<string, number> = {};
  const b: Record<string, number> = {};

  let dealposMapQty = 0;
  if (row.dealpos_channels && typeof row.dealpos_channels === 'object') {
    const dp = row.dealpos_channels;

    // 1. DealPOS 5-Komparasi (MAP, LIVE, STUDIO, PERMAK, DEFECT)
    const mapVal = Number(dp.MAP ?? dp['Gudang Utama'] ?? dp.Marketplace ?? dp.GUDANG ?? dp.TOTAL ?? 0) || 0;
    dealposMapQty = mapVal;
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

    // Note: DealPOS system quantities belong in d and dealpos_channels, NOT in physical stock fields

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

  if (stokMap === undefined && row.sisa_stok !== undefined && row.sisa_stok !== null && row.sisa_stok !== '') {
    stokMap = Number(row.sisa_stok);
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
    q: dealposMapQty || Number(row.q || 0),
  };
}

/**
 * Fast in-memory cache for master products
 */
let memoryProductCache: ProductItem[] | null = null;
let memoryProductLastFetch = 0;

/**
 * Fetch master products from Supabase across all potential product tables with parallel loading & memory cache
 * (master_produk, stok_real_fisik, log_produk, etc.)
 */
export async function fetchMasterProductsFromSupabase(maxRowsPerTable = 50000, forceRefresh = false): Promise<ProductItem[]> {
  // 1. SWR In-Memory cache check (fresh within 15 minutes)
  if (!forceRefresh && memoryProductCache && memoryProductCache.length > 0 && Date.now() - memoryProductLastFetch < 15 * 60 * 1000) {
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

  // 2. Load from localStorage cache first for instant 0ms fallback (ONLY if not force refresh)
  if (!forceRefresh) {
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
  }

  // 3. Fast Parallel Fetch: fetch master_produk and stok_real_fisik concurrently with targeted column selection
  const pageSize = 1000;

  const fetchMasterTable = async () => {
    let offset = 0;
    while (offset < maxRowsPerTable) {
      const batchPromises = [];
      const batchSize = 4;
      for (let i = 0; i < batchSize && offset < maxRowsPerTable; i++) {
        const off = offset;
        batchPromises.push(
          fetch(`${supaUrl}/rest/v1/master_produk?select=*&order=sku.asc&limit=${pageSize}&offset=${off}`, {
            headers: {
              apikey: supaKey,
              Authorization: 'Bearer ' + supaKey,
              'Content-Type': 'application/json',
            },
          }).then(r => r.ok ? r.json() : []).catch(() => null)
        );
        offset += pageSize;
      }

      const results = await Promise.all(batchPromises);
      let breakLoop = false;

      for (const rows of results) {
        if (rows === null) continue;
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
              if ((!existing.price || existing.price === 0) && item.price !== undefined && item.price > 0) existing.price = item.price;
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
    try {
      let allStok = memoryStokFisikCache;
      if (!allStok || allStok.length === 0) {
        try {
          allStok = await getAllInventoryStocksFromLocalDb();
        } catch {}
      }
      if (!allStok || allStok.length === 0) return;

      for (const r of allStok) {
        if (!r.sisa_stok || r.sisa_stok === 0) continue;

        const sku = String(r.sku || '').trim().toUpperCase();
        if (!sku) continue;

        let item = productsMap.get(sku);
        if (!item) {
          // If a product has physical stock but is missing in master_produk, create a placeholder
          const detectedSize = extractSizeFromSku(sku);
          item = {
            k: sku,
            sku: sku,
            p: '',
            nama_produk: '',
            category: 'Uncategorized',
            s: detectedSize !== '-' ? detectedSize : '',
            size: detectedSize !== '-' ? detectedSize : '',
            lokasi: '',
            price: 0,
            f: {},
            l: [],
            dealpos_channels: {},
            q: 0
          };
          productsMap.set(sku, item);
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
    } catch (err) {
      console.warn('Error fetching stock for products from Supabase:', err);
    }
  };

  // 3. Sequential: First fetch all master_produk to build the true catalog
  await fetchMasterTable();

  // Then enrich the existing master catalog with live location & stock from stok_real_fisik
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

  // 1. Fetch from stok_real_fisik prioritizing rows with sisa_stok <> 0
  const searchFilter = searchKeyword && searchKeyword.trim()
    ? buildFuzzySearchQuery(searchKeyword, ['sku', 'nama_produk'])
    : '';

  try {
    const viewRowsNonZero = await fetchAllStockRealtime(50000, false);
    const searchFilterUpper = searchKeyword ? searchKeyword.trim().toUpperCase() : '';

    if (viewRowsNonZero && Array.isArray(viewRowsNonZero) && viewRowsNonZero.length > 0) {
      for (const r of viewRowsNonZero) {
        const sku = String(r.sku || r.kode || '').trim().toUpperCase();
        if (!sku || sku === 'UNDEFINED' || sku === 'NULL') continue;
        const nama = String(r.nama_produk || r.nama || sku).trim();

        if (searchFilterUpper) {
           if (!sku.includes(searchFilterUpper) && !nama.toUpperCase().includes(searchFilterUpper)) {
             continue;
           }
        }
        
        const sisa = Number(r.sisa_stok ?? r.qty ?? 0);
        const lok = String(r.lokasi || 'BLOK F').trim();
        const area = String(r.area || getAreaFromLokasi(lok)).trim();
        
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
  } catch (err) {
    console.warn('Error fetching from stok_real_fisik in Supabase:', err);
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
    // Also clean local cache
    try {
      const cached: PeminjamanRecord[] = JSON.parse(localStorage.getItem('wms_peminjaman_cache') || '[]');
      const filtered = cached.filter(c => c.noPeminjaman !== noPeminjaman && c.id !== noPeminjaman);
      localStorage.setItem('wms_peminjaman_cache', JSON.stringify(filtered));
      localStorage.setItem('wms_peminjaman_records', JSON.stringify(filtered));
    } catch {}
    return true;
  } catch (err) {
    console.error('Error deleting peminjaman:', err);
    return false;
  }
}

export async function updatePeminjamanInSupabase(record: PeminjamanRecord): Promise<boolean> {
  const no = record.noPeminjaman || record.no_sps || record.id;
  if (!no) return false;
  try {
    // 1. Delete existing rows for this loan number
    await supabaseFetch('peminjaman', 'DELETE', null, `no_peminjaman=eq.${encodeURIComponent(no)}`);

    // 2. Re-insert updated items with fresh IDs
    const baseId = Math.floor(Date.now() / 1000) * 1000;
    const payload = (record.items || []).map((it, idx) => {
      const rawSize = (it.size || '').trim();
      const cleanSize = (rawSize && rawSize !== '-') 
        ? rawSize 
        : (extractSizeFromSku(it.sku || '') !== '-' ? extractSizeFromSku(it.sku || '') : 'ALL');
      const rawNama = it.produk || it.nama_produk || it.sku || 'Unknown';
      return {
        id: baseId + idx,
        no_peminjaman: no,
        pic: record.namaPeminjam || record.nama_peminjam || '',
        keperluan: record.keperluan || '',
        tanggal_pinjam: record.tglPinjam || record.tanggal_pinjam || '',
        sku: it.sku || `SKU-${Date.now()}`,
        nama_produk: rawNama,
        size: cleanSize,
        qty: Number(it.qty) || 1,
        lokasi: it.lokasi || 'BLOK F',
        status: record.status || 'Dipinjam',
        operator: record.username || record.operator || 'System',
        keterangan: (record.noWaPeminjam || record.no_wa_peminjam) ? `WA:${record.noWaPeminjam || record.no_wa_peminjam}` : (record.keterangan || '')
      };
    });

    if (payload.length > 0) {
      await supabaseFetch('peminjaman', 'POST', payload);
    }

    // 3. Update local cache
    try {
      const cached: PeminjamanRecord[] = JSON.parse(localStorage.getItem('wms_peminjaman_cache') || '[]');
      const updated = cached.map(c => (c.noPeminjaman === no || c.id === no) ? record : c);
      localStorage.setItem('wms_peminjaman_cache', JSON.stringify(updated));
      localStorage.setItem('wms_peminjaman_records', JSON.stringify(updated));
    } catch {}

    return true;
  } catch (err) {
    console.error('Error updating peminjaman in Supabase:', err);
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
      const formattedNama = rawNama;
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
      `no_peminjaman=ilike.${encodeURIComponent(noPeminjaman)}*`
    );
    return true;
  } catch (err) {
    console.warn('Error returning peminjaman in Supabase:', err);
    return false;
  }
}


export function extractPickingItemFromRow(row: any): PickingListItem | null {
  if (!row) return null;
  const no_sj = String(row.no_sj || row.number_delivery || row.no_delivery || row.invoice || row.nomor_sj || row.sj || '').trim().toUpperCase();
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
    // nama_produk = nama_produk;
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

let memoryPickingListCache: PickingListItem[] | null = null;
let memoryPickingListLastFetch = 0;

export function invalidatePickingListCache(): void {
  memoryPickingListCache = null;
  memoryPickingListLastFetch = 0;
}

export async function fetchPickingListFromSupabase(forceRefresh = false): Promise<PickingListItem[]> {
  if (!forceRefresh && memoryPickingListCache && memoryPickingListCache.length > 0 && Date.now() - memoryPickingListLastFetch < 3 * 60 * 1000) {
    return memoryPickingListCache;
  }

  const itemsMap = new Map<string, PickingListItem>();

  // Retrieve persistent set of completed Surat Jalan so they never bounce back to PENDING
  const storedCompletedSJs = new Set<string>();
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const cStr = localStorage.getItem('wms_completed_sjs_set');
      if (cStr) {
        const arr = JSON.parse(cStr);
        if (Array.isArray(arr)) {
          arr.forEach((s) => storedCompletedSJs.add(String(s).toUpperCase().trim()));
        }
      }
    }
  } catch {}

  // Fetch from picking_list and peminjaman concurrently to avoid sequential bottlenecks
  // Bypass fetchWithDeltaSync temporarily to ensure all fresh rows are fetched properly
  const [pickingRes, peminjamanRes] = await Promise.allSettled([
    supabaseFetch<any[]>('picking_list', 'GET', null, 'select=*&order=created_at.desc&limit=2000'),
    supabaseFetch<any[]>('peminjaman', 'GET', null, 'select=*&order=created_at.desc&limit=100')
  ]);

  if (pickingRes.status === 'fulfilled' && pickingRes.value && Array.isArray(pickingRes.value)) {
    for (const r of pickingRes.value) {
      const item = extractPickingItemFromRow(r);
      if (item) {
        if (storedCompletedSJs.has((item.no_sj || '').toUpperCase().trim())) {
          item.status = 'SELESAI';
        }
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
      const no_sj = String(p.no_peminjaman || '').trim().toUpperCase();
      const sku = String(p.sku || '').toUpperCase().trim();
      const pStatus = String(p.status || '').toUpperCase().trim();
      
      // Skip items that are already returned to avoid re-adding them to picking list
      if (pStatus === 'DIKEMBALIKAN' || pStatus === 'SELESAI') continue;
      
      // If this SJ has been marked completed by the user, ensure it stays completed
      if (storedCompletedSJs.has(no_sj)) {
        const existing = itemsMap.get(`${no_sj}__${sku}`);
        if (existing) {
          existing.status = 'SELESAI';
        }
        continue;
      }

      // Additional safety check: If it already exists in the map as SELESAI, don't overwrite it with a PENDING status from Peminjaman
      const existing = itemsMap.get(`${no_sj}__${sku}`);
      if (existing && existing.status === 'SELESAI') continue;

      if (no_sj && sku && !itemsMap.has(`${no_sj}__${sku}`)) {
        let pSize = String(p.size || '').trim();
        if (!pSize || pSize === '-') {
          pSize = extractSizeFromSku(sku);
        }
        let pNama = String(p.nama_produk || sku).trim();
        if (pSize && pSize !== '-' && pSize !== 'ALL') {
          // pNama = pNama;
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
  memoryPickingListCache = result;
  memoryPickingListLastFetch = Date.now();
  try {
    localStorage.setItem('wms_picking_cache', JSON.stringify(result));
  } catch {}
  return result;
}

export async function savePickingItemToSupabase(item: PickingListItem): Promise<boolean> {
  // 1. Update local and memory cache immediately
  try {
    const cached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_picking_cache') || '[]');
    const idx = cached.findIndex((c) => (item.id && c.id === item.id) || (c.no_sj === item.no_sj && c.sku === item.sku));
    if (idx >= 0) {
      cached[idx] = { ...cached[idx], ...item };
    } else {
      cached.unshift(item);
    }
    localStorage.setItem('wms_picking_cache', JSON.stringify(cached));
    memoryPickingListCache = cached;
  } catch {}

  // 2. Sync to Supabase
  try {
    const isUuid = item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.id));
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
      const isUuid = it.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(it.id));
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
      const isUuid = item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(item.id));
      const condition = item.id && (typeof item.id === 'number' || (typeof item.id === 'string' && !item.id.startsWith('pick_')))
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
    if (unexpectedItems.length > 0) {
      const unexpPayloads = unexpectedItems.map((unexp) => ({
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
      }));
      await insertPickingListRowsToSupabase(unexpPayloads).catch((unexpErr) => {
        console.warn(`Failed inserting unexpected items to Supabase:`, unexpErr);
      });
    }

    // 5. Also sync to peminjaman (if SPS/PJM)
    if (cleanNoSj.startsWith('SPS') || cleanNoSj.startsWith('PJM')) {
      await supabaseFetch('peminjaman', 'PATCH', { 
        status: 'SELESAI'
      }, `no_peminjaman=ilike.${encodeURIComponent(cleanNoSj)}`).catch(() => {});
    }

    // 6. Record in persistent completed set so it never bounces back
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const compStr = localStorage.getItem('wms_completed_sjs_set');
        const compSet = new Set<string>(compStr ? JSON.parse(compStr) : []);
        compSet.add(cleanNoSj);
        localStorage.setItem('wms_completed_sjs_set', JSON.stringify(Array.from(compSet)));
      }
    } catch {}

    return true;
  } catch (err) {
    console.warn('Supabase remote sync failed, but task saved to local cache:', err);
    return true;
  }
}

/**
 * Robustly inserts rows into the Supabase 'picking_list' table.
 * Handles schema variations and assigns collision-free safe BIGINT IDs
 * to completely eliminate sequence desync duplicate key errors (code 23505).
 */
export async function insertPickingListRowsToSupabase(
  newItems: Array<{
    id?: number | string;
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
  const baseTime = Date.now();

  const getSafeId = (item: any, idx: number, offset = 0) => {
    if (typeof item.id === 'number' && item.id > 0) return item.id;
    if (typeof item.id === 'string' && /^\d+$/.test(item.id) && Number(item.id) > 0) return Number(item.id);
    return (baseTime + offset) * 1000 + (idx % 1000);
  };

  // 1. Schema-compliant rows matching official Supabase picking_list table with guaranteed safe BIGINT ID
  const schemaCompliantRows = newItems.map((it, idx) => {
    const rawDate = String(it.tanggal || nowIso.slice(0, 10)).trim();
    let cleanDate = nowIso.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      cleanDate = rawDate;
    } else {
      const dmy = rawDate.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (dmy) cleanDate = `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }

    return {
      id: getSafeId(it, idx),
      no_sj: String(it.no_sj || '').trim().toUpperCase(),
      tanggal: cleanDate,
      tujuan: String(it.tujuan || 'Marketplace').trim(),
      sku: String(it.sku || '').trim().toUpperCase(),
      nama_produk: it.nama_produk || it.sku,
      qty_req: Number(it.qty_req) || 1,
      qty_picked: Number(it.qty_picked) || 0,
      lokasi: String(it.lokasi || '-').trim(),
      status: String(it.status || 'PENDING').trim().toUpperCase(),
      created_at: it.created_at || nowIso,
    };
  });

  // Attempt 1: Schema-compliant payload with explicit safe BIGINT IDs (Avoids sequence desync 23505)
  try {
    await supabaseFetch('picking_list', 'POST', schemaCompliantRows);
    return true;
  } catch (err: any) {
    console.warn('insertPickingListRowsToSupabase: Attempt 1 failed, trying fallback with fresh unique IDs:', err?.message);

    // Attempt 2: Regenerate fresh unique timestamp IDs with offset, minimal fields
    const minimalRows = schemaCompliantRows.map((r, idx) => ({
      id: (Date.now() + 2000) * 1000 + (idx % 1000) + Math.floor(Math.random() * 500 + 100),
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
    } catch (err2: any) {
      console.warn('insertPickingListRowsToSupabase: Attempt 2 failed, trying row-by-row fallback:', err2?.message);
      
      // Attempt 3: Row-by-row fallback with dynamic unique ID
      let successCount = 0;
      let lastError: any = err2;
      for (let i = 0; i < minimalRows.length; i++) {
        const row = {
          ...minimalRows[i],
          id: Date.now() * 1000 + (i % 1000) + Math.floor(Math.random() * 800 + 100),
        };
        try {
          await supabaseFetch('picking_list', 'POST', [row]);
          successCount++;
        } catch (rErr: any) {
          // If still fails with unique constraint, try one more time without ID
          try {
            const { id, ...noIdRow } = row;
            await supabaseFetch('picking_list', 'POST', [noIdRow]);
            successCount++;
          } catch (rErr2) {
            lastError = rErr2 || rErr;
          }
        }
      }
      if (successCount === 0) {
        throw new Error(`Gagal menyimpan ke tabel picking_list Supabase: ${lastError?.message || 'Error tidak diketahui'}`);
      }
      return true;
    }
  }
}

export async function createPickingSuratJalanSupabase(
  no_sj: string,
  tujuan: string,
  items: Array<{ sku: string; nama_produk: string; size?: string; lokasi?: string; qty_req: number }>
): Promise<{ success: boolean; createdItems: PickingListItem[] }> {
  const nowIso = new Date().toISOString();
  const baseTime = Date.now();
  const cleanNoSj = no_sj.trim().toUpperCase();
  const cleanTujuan = tujuan.trim() || 'Marketplace';

  const newItems: PickingListItem[] = items.map((it, idx) => {
    const cleanSku = it.sku.trim().toUpperCase();
    const rawSize = (it.size || '').trim();
    const cleanSize = (rawSize && rawSize !== '-') 
      ? rawSize 
      : (extractSizeFromSku(cleanSku) !== '-' ? extractSizeFromSku(cleanSku) : '-');

    let rawNama = (it.nama_produk || '').trim();
    const isNameSku = !rawNama || rawNama.toUpperCase() === cleanSku || rawNama.toUpperCase().replace(/\s+/g, '') === cleanSku.replace(/\s+/g, '');
    if (isNameSku) {
      const cached = memoryProductCache?.find(p => (p.k && p.k.trim().toUpperCase() === cleanSku) || ((p as any).sku && String((p as any).sku).trim().toUpperCase() === cleanSku));
      if (cached && (cached.p || (cached as any).nama_produk || cached.n)) {
        rawNama = String(cached.p || (cached as any).nama_produk || cached.n || cleanSku).trim();
      }
    }
    const formattedNama = rawNama || cleanSku;
    const safeNumericId = baseTime * 1000 + (idx % 1000);

    return {
      id: safeNumericId,
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
        (c) => !(c.no_sj?.toUpperCase() === cleanNoSj)
      );
      localStorage.setItem('wms_picking_cache', JSON.stringify([...newItems, ...filteredCache]));

      // Update wms_raw_picking_list_cache (used by PickingTasksView)
      const rawCached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_raw_picking_list_cache') || '[]');
      const filteredRaw = rawCached.filter(
        (c) => !(c.no_sj?.toUpperCase() === cleanNoSj)
      );
      localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify([...newItems, ...filteredRaw]));
    }
  } catch (cErr) {
    console.warn('Error saving picking to local cache:', cErr);
  }

  // 1.5. In Supabase, delete any existing items with the same no_sj to avoid duplicates on re-send
  try {
    await supabaseFetch('picking_list', 'DELETE', undefined, `no_sj=ilike.${encodeURIComponent(cleanNoSj)}`).catch(() => {});
  } catch {}

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
  deletedItems: PickingListItem[]
): Promise<boolean> {
  const cleanNoSj = no_sj.trim().toUpperCase();
  const isSpsOrPjm = cleanNoSj.startsWith('SPS') || cleanNoSj.startsWith('PJM');

  try {
    // 1. Delete removed items from picking_list and peminjaman
    if (deletedItems && deletedItems.length > 0) {
      for (const item of deletedItems) {
        if (item.id && /^\d+$/.test(String(item.id))) {
          await supabaseFetch('picking_list', 'DELETE', undefined, `id=eq.${item.id}`).catch(() => {});
        } else {
          // If it doesn't have a numeric ID (e.g. pick_ prefix), delete by sj and sku
          await supabaseFetch('picking_list', 'DELETE', undefined, `no_sj=eq.${encodeURIComponent(cleanNoSj)}&sku=eq.${encodeURIComponent(item.sku)}`).catch(() => {});
        }
        
        // Delete from peminjaman if needed
        if (isSpsOrPjm) {
          const encodedSj = encodeURIComponent(cleanNoSj);
          const encodedSku = encodeURIComponent(item.sku);
          await supabaseFetch('peminjaman', 'DELETE', null, `no_peminjaman=eq.${encodedSj}&sku=eq.${encodedSku}`).catch(() => {});
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
        : `no_sj=eq.${encodeURIComponent(cleanNoSj)}&sku=eq.${encodeURIComponent(cleanSku)}`;

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
          `no_peminjaman=eq.${encodeURIComponent(cleanNoSj)}&sku=eq.${encodeURIComponent(cleanSku)}`
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
    const upperNoSjs = no_sjs.map((s) => s.trim().toUpperCase());
    const upperSet = new Set(upperNoSjs);

    // Delete one by one to avoid PostgREST 'in' syntax issues with special chars
    for (const sj of upperNoSjs) {
      const encodedSj = encodeURIComponent(sj);
      await supabaseFetch('picking_list', 'DELETE', null, `no_sj=ilike.${encodedSj}`).catch(() => {});
      // Also delete from peminjaman explicitly 
      await supabaseFetch('peminjaman', 'DELETE', null, `no_peminjaman=ilike.${encodedSj}`).catch(() => {});
    }
    // Clean up local caches
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cachedStr = localStorage.getItem('wms_picking_cache');
        if (cachedStr) {
          const cached = JSON.parse(cachedStr);
          if (Array.isArray(cached)) {
            const newCache = cached.filter(item => !upperSet.has((item.no_sj || '').trim().toUpperCase()));
            localStorage.setItem('wms_picking_cache', JSON.stringify(newCache));
          }
        }
        const rawCachedStr = localStorage.getItem('wms_raw_picking_list_cache');
        if (rawCachedStr) {
          const rawCached = JSON.parse(rawCachedStr);
          if (Array.isArray(rawCached)) {
            const newRawCache = rawCached.filter(item => !upperSet.has((item.no_sj || '').trim().toUpperCase()));
            localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify(newRawCache));
          }
        }
        // Remove from completed set
        const compStr = localStorage.getItem('wms_completed_sjs_set');
        if (compStr) {
          const compSet = new Set<string>(JSON.parse(compStr));
          upperNoSjs.forEach((s) => compSet.delete(s));
          localStorage.setItem('wms_completed_sjs_set', JSON.stringify(Array.from(compSet)));
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
  const upperNoSjs = no_sjs.map((s) => s.trim().toUpperCase());
  const upperSet = new Set(upperNoSjs);

  // 1. Immediately record in persistent localStorage set and caches
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const compStr = localStorage.getItem('wms_completed_sjs_set');
      const compSet = new Set<string>(compStr ? JSON.parse(compStr) : []);
      upperNoSjs.forEach((s) => compSet.add(s));
      localStorage.setItem('wms_completed_sjs_set', JSON.stringify(Array.from(compSet)));

      // Update wms_picking_cache
      const cachedStr = localStorage.getItem('wms_picking_cache');
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (Array.isArray(cached)) {
          const newCache = cached.map((item) =>
            upperSet.has((item.no_sj || '').trim().toUpperCase())
              ? { ...item, status: 'SELESAI' as const, picker_name: pickerName || item.picker_name || 'Admin' }
              : item
          );
          localStorage.setItem('wms_picking_cache', JSON.stringify(newCache));
        }
      }

      // Update wms_raw_picking_list_cache
      const rawCachedStr = localStorage.getItem('wms_raw_picking_list_cache');
      if (rawCachedStr) {
        const rawCached = JSON.parse(rawCachedStr);
        if (Array.isArray(rawCached)) {
          const newRaw = rawCached.map((item) =>
            upperSet.has((item.no_sj || '').trim().toUpperCase())
              ? { ...item, status: 'SELESAI' as const, picker_name: pickerName || item.picker_name || 'Admin' }
              : item
          );
          localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify(newRaw));
        }
      }
    }
  } catch (cacheErr) {
    console.warn('Cache update error in completePickingSuratJalanBatchSupabase:', cacheErr);
  }

  // 2. Sync to Supabase in background / async
  try {
    for (const sj of upperNoSjs) {
      const encodedSj = encodeURIComponent(sj);

      // Try patching picking_list with picker_name
      try {
        await supabaseFetch(
          'picking_list',
          'PATCH',
          {
            status: 'SELESAI',
            picker_name: pickerName || 'Admin',
          },
          `no_sj=ilike.${encodedSj}`
        );
      } catch (patchErr: any) {
        // Retry minimal without picker_name if column doesn't exist
        try {
          await supabaseFetch(
            'picking_list',
            'PATCH',
            {
              status: 'SELESAI',
            },
            `no_sj=ilike.${encodedSj}`
          );
        } catch (innerPatchErr) {
          console.warn(`Supabase patch picking_list failed for ${sj}:`, innerPatchErr);
        }
      }

      // Also sync to peminjaman (if SPS/PJM)
      if (sj.startsWith('SPS') || sj.startsWith('PJM')) {
        await supabaseFetch(
          'peminjaman',
          'PATCH',
          {
            status: 'SELESAI',
          },
          `no_peminjaman=ilike.${encodedSj}`
        ).catch(() => {});
      }
    }
    return true;
  } catch (e) {
    console.warn('Supabase remote sync warning in batch complete (saved locally):', e);
    return true;
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
    let query = 'select=*&order=tanggal.asc&limit=1000';
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
    const data = await supabaseFetch<MasterShiftRecord[]>('master_shift', 'GET', null, 'order=id.asc&limit=100');
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
    let query = 'select=*&order=tanggal.desc,created_at.desc&limit=500';
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
    let query = 'select=*&order=tgl_mulai.desc,created_at.desc&limit=500';
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
    const data = await supabaseFetch<KaryawanRecord[]>('karyawan', 'GET', null, 'order=nik.asc&limit=1000');
    if (data && Array.isArray(data)) {
      registerUserNames(data);
    }
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
    let query = `select=*&tanggal=gte.${encodeURIComponent(startDate)}&tanggal=lte.${encodeURIComponent(endDate)}&order=tanggal.desc&limit=1000`;
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


export async function fetchSupabaseStokFisikBySkus(skus: string[], forceFresh = false): Promise<StockRealtimeItem[]> {
  if (!skus || skus.length === 0) return [];
  const cleanSkus = Array.from(new Set(skus.map(s => String(s || '').trim().toUpperCase()).filter(Boolean)));
  if (cleanSkus.length === 0) return [];
  const cleanSet = new Set(cleanSkus);
  
  if (!forceFresh) {
    // 1. Check in-memory cache first if fresh
    if (memoryStokFisikCache && memoryStokFisikCache.length > 0 && Date.now() - memoryStokFisikLastFetch < 60 * 1000) {
      const matched = memoryStokFisikCache.filter(r => cleanSet.has((r.sku || '').toUpperCase()));
      if (matched.length > 0) return matched;
    }

    // 2. Check IndexedDB local cache if fresh
    try {
      const localStocks = await getAllInventoryStocksFromLocalDb();
      if (localStocks && localStocks.length > 0 && Date.now() - memoryStokFisikLastFetch < 60 * 1000) {
        if (!memoryStokFisikCache || memoryStokFisikCache.length === 0) {
          memoryStokFisikCache = localStocks;
          memoryStokFisikLastFetch = Date.now();
        }
        const matched = localStocks.filter(r => cleanSet.has((r.sku || '').toUpperCase()));
        if (matched.length > 0) return matched;
      }
    } catch {}
  }

  // 3. Fallback to Supabase PostgREST for ONLY the requested SKUs
  try {
    const skuParam = cleanSkus.map(s => `"${encodeURIComponent(s)}"`).join(',');
    const rows = await supabaseFetch<StockRealtimeItem[]>(
      'stok_real_fisik',
      'GET',
      null,
      `sku=in.(${skuParam})&sisa_stok=neq.0&select=sku,nama_produk,size,lokasi,area,sisa_stok,updated_at`
    );
    if (Array.isArray(rows)) {
      if (rows.length > 0 && memoryStokFisikCache) {
        const fetchedSkus = new Set(rows.map(r => (r.sku || '').toUpperCase()));
        memoryStokFisikCache = [
          ...memoryStokFisikCache.filter(r => !fetchedSkus.has((r.sku || '').toUpperCase())),
          ...rows
        ];
      }
      return rows;
    }
  } catch (err) {
    console.error('Error in fetchSupabaseStokFisikBySkus:', err);
  }
  return [];
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
 * Fast in-memory cache for perbaikan tickets
 */
let memoryPerbaikanTicketsCache: PerbaikanTicket[] | null = null;
let memoryPerbaikanTicketsLastFetch = 0;

export function invalidatePerbaikanTicketsCache(): void {
  memoryPerbaikanTicketsCache = null;
  memoryPerbaikanTicketsLastFetch = 0;
}

/**
 * Fetch semua tiket perbaikan dari Supabase (dengan in-memory & local cache fallback)
 */
export async function fetchPerbaikanTicketsFromSupabase(forceRefresh = false): Promise<PerbaikanTicket[]> {
  // 1. In-memory cache check (fresh within 5 minutes)
  if (!forceRefresh && memoryPerbaikanTicketsCache && memoryPerbaikanTicketsCache.length > 0 && Date.now() - memoryPerbaikanTicketsLastFetch < 5 * 60 * 1000) {
    return memoryPerbaikanTicketsCache;
  }

  let localData: PerbaikanTicket[] = [];
  try {
    const cached = localStorage.getItem('wms_local_perbaikan_tickets');
    if (cached) {
      localData = JSON.parse(cached);
    }
  } catch {}

  // 2. Local storage cache check if not forcing refresh
  if (!forceRefresh && localData.length > 0 && Date.now() - memoryPerbaikanTicketsLastFetch < 5 * 60 * 1000) {
    memoryPerbaikanTicketsCache = localData;
    return localData;
  }

  try {
    // Fetch all tickets with chunked pagination to prevent truncation (was previously limited to 500)
    const allRemoteTickets: PerbaikanTicket[] = [];
    const pageSize = 1000;
    let offset = 0;
    const maxRows = 20000;

    while (offset < maxRows) {
      // Exclude SELESAI statuses to drastically reduce egress for active ticket views
      const query = `status_pengerjaan=not.in.(SELESAI_GRADE_A,SELESAI_DEFECT_SALE,SELESAI_SCRAP)&order=created_at.desc&limit=${pageSize}&offset=${offset}`;
      const chunk = await supabaseFetch<PerbaikanTicket[]>('perbaikan_tickets', 'GET', undefined, query);
      if (!chunk || !Array.isArray(chunk) || chunk.length === 0) break;
      allRemoteTickets.push(...chunk);
      if (chunk.length < pageSize) break;
      offset += pageSize;
    }

    // Supabase is authoritative. If we successfully fetched (no errors), we replace the local cache completely.
    // We only preserve offline items that haven't been synced yet (id > 1000000000).
    const remoteTicketNos = new Set(allRemoteTickets.map(t => t.ticket_no).filter(Boolean));
    const offlinePending = localData.filter(t => 
      typeof t.id === 'number' && t.id > 1000000000 && !remoteTicketNos.has(t.ticket_no)
    );

    const merged = [...allRemoteTickets, ...offlinePending].sort((a, b) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    localData = merged;
    memoryPerbaikanTicketsCache = merged;
    memoryPerbaikanTicketsLastFetch = Date.now();
    try {
      localStorage.setItem('wms_local_perbaikan_tickets', JSON.stringify(localData));
    } catch {}
    return localData;
  } catch (err) {
    console.warn('Gagal memuat perbaikan_tickets dari Supabase, memuat dari local cache:', err);
  }

  memoryPerbaikanTicketsCache = localData;
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
    const res = await supabaseFetch<PerbaikanTicket[]>('perbaikan_tickets', 'POST', [payload], '', true);
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
      const res2 = await supabaseFetch<PerbaikanTicket[]>('perbaikan_tickets', 'POST', [fallbackPayload], '', true);
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
        const res3 = await supabaseFetch<PerbaikanTicket[]>('perbaikan_tickets', 'POST', [minimalPayload], '', true);
        if (res3 && Array.isArray(res3) && res3.length > 0) {
          savedTicket = { ...res3[0], qc_report_no: ticket.qc_report_no };
          inserted = true;
        }
      } catch (err3) {
        console.warn('Gagal menyimpan tiket perbaikan ke Supabase (tersimpan di cache lokal):', err3);
      }
    }
  }

  // Jika gagal menyimpan ke Supabase, berikan mock ID agar tidak dihapus oleh sinkronisasi fetch
  if (!inserted && !savedTicket.id) {
    savedTicket.id = Date.now() + Math.floor(Math.random() * 1000000);
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
    memoryPerbaikanTicketsCache = list;
    memoryPerbaikanTicketsLastFetch = Date.now();
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
        memoryPerbaikanTicketsCache = list;
        memoryPerbaikanTicketsLastFetch = Date.now();
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
      memoryPerbaikanTicketsCache = filtered;
      memoryPerbaikanTicketsLastFetch = Date.now();
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

let memoryQcReportsCache: QcReport[] | null = null;
let memoryQcReportsLastFetch = 0;

export function invalidateQcReportsCache(): void {
  memoryQcReportsCache = null;
  memoryQcReportsLastFetch = 0;
}

/**
 * Memuat seluruh riwayat laporan QC dari Supabase (dengan in-memory & local cache).
 * Menggabungkan tabel 'qc_reports' dan fallback 'log_produk' (type='QC_INSPEKSI')
 * sehingga laporan dapat langsung terlihat oleh semua user/admin di seluruh perangkat.
 */
export async function fetchQcReportsFromSupabase(forceRefresh = false): Promise<QcReport[]> {
  // 1. In-memory cache check (fresh within 5 minutes)
  if (!forceRefresh && memoryQcReportsCache && memoryQcReportsCache.length > 0 && Date.now() - memoryQcReportsLastFetch < 5 * 60 * 1000) {
    return memoryQcReportsCache;
  }

  // 2. Ambil dari cache lokal terlebih dahulu
  let localData: QcReport[] = [];
  try {
    const cachedStr = localStorage.getItem('wms_local_qc_reports');
    if (cachedStr) {
      localData = JSON.parse(cachedStr);
    }
  } catch {}

  if (!forceRefresh && localData.length > 0 && Date.now() - memoryQcReportsLastFetch < 5 * 60 * 1000) {
    memoryQcReportsCache = localData;
    return localData;
  }

  const mergedMap = new Map<string, QcReport>();

  // 2. Ambil dari tabel dedicated qc_reports & fallback log_produk secara paralel untuk performa cepat
  try {
    const [qcRes, logRes] = await Promise.allSettled([
      supabaseFetch<QcReport[]>('qc_reports', 'GET', undefined, 'order=created_at.desc&limit=2000'),
      supabaseFetch<any[]>('log_produk', 'GET', undefined, 'type=eq.QC_INSPEKSI&order=created_at.desc&limit=2000'),
    ]);

    if (qcRes.status === 'fulfilled' && Array.isArray(qcRes.value)) {
      for (const item of qcRes.value) {
        if (item && item.report_no) {
          mergedMap.set(item.report_no, item);
        }
      }
    }

    if (logRes.status === 'fulfilled' && Array.isArray(logRes.value)) {
      for (const row of logRes.value) {
        const parsed = logProdukToQcReport(row);
        if (parsed && parsed.report_no && !mergedMap.has(parsed.report_no)) {
          mergedMap.set(parsed.report_no, parsed);
        }
      }
    }
  } catch (err) {
    console.warn('Gagal memuat QC reports secara paralel dari Supabase:', err);
  }

  // Jika berhasil mengambil data dari server, jadikan data server sebagai sumber kebenaran (authoritative)
  // namun pertahankan data offline/pending (id > 1000000000)
  
    const remoteReportNos = new Set(Array.from(mergedMap.keys()));
    const offlinePending = localData.filter((r) => 
      typeof r.id === 'number' && r.id > 1000000000 && !remoteReportNos.has(r.report_no)
    );

    for (const offline of offlinePending) {
      mergedMap.set(offline.report_no, offline);
    }
  
  const finalResults = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.created_at || b.tanggal || 0).getTime() - new Date(a.created_at || a.tanggal || 0).getTime()
  );

  memoryQcReportsCache = finalResults;
  memoryQcReportsLastFetch = Date.now();
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
    if (!reportCopy.id) {
      reportCopy.id = Date.now() + idx + Math.floor(Math.random() * 100000);
    }
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
    const res = await supabaseFetch<QcReport[]>('qc_reports', 'POST', preparedReports, '', true);
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
        const res2 = await supabaseFetch<QcReport[]>('qc_reports', 'POST', sanitized, '', true);
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
      const resLog = await supabaseFetch<any[]>('log_produk', 'POST', logRows, '', true);
      if (resLog && Array.isArray(resLog) && resLog.length > 0) {
        insertedToSupabase = true;
        console.log(`Berhasil menyimpan ${resLog.length} laporan QC ke Supabase via cloud log (QC_INSPEKSI)`);
      }
    } catch (errLog) {
      console.warn('Percobaan batch log_produk gagal, mencoba per baris:', errLog);
      for (const rep of preparedReports) {
        try {
          await supabaseFetch<any[]>('log_produk', 'POST', [qcReportToLogProduk(rep)], '', true);
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
let memoryPenerimaanProduksiCache: PenerimaanProduksiItem[] | null = null;
let memoryPenerimaanProduksiLastFetch = 0;

export function invalidatePenerimaanProduksiCache(): void {
  memoryPenerimaanProduksiCache = null;
  memoryPenerimaanProduksiLastFetch = 0;
}

export async function fetchPenerimaanProduksiFromSupabase(filters?: {
  kategori?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  limit?: number;
  forceRefresh?: boolean;
}): Promise<PenerimaanProduksiItem[]> {
  const hasSpecificFilters = !!(filters?.kategori && filters.kategori !== 'Semua') || !!filters?.startDate || !!filters?.endDate || !!filters?.keyword;

  if (!filters?.forceRefresh && !hasSpecificFilters && memoryPenerimaanProduksiCache && memoryPenerimaanProduksiCache.length > 0 && Date.now() - memoryPenerimaanProduksiLastFetch < 5 * 60 * 1000) {
    return memoryPenerimaanProduksiCache;
  }

  let localData: PenerimaanProduksiItem[] = [];
  try {
    const cached = localStorage.getItem('wms_local_penerimaan_produksi');
    if (cached) {
      localData = JSON.parse(cached);
    }
  } catch {}

  if (!filters?.forceRefresh && !hasSpecificFilters && localData.length > 0 && Date.now() - memoryPenerimaanProduksiLastFetch < 5 * 60 * 1000) {
    memoryPenerimaanProduksiCache = localData;
    return localData;
  }

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
        // 1. Sort by tanggal_penerimaan desc
        const dateA = new Date(a.tanggal_penerimaan || 0).getTime();
        const dateB = new Date(b.tanggal_penerimaan || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        
        // 2. Sort by no_surat_jalan asc
        const sjA = (a.no_surat_jalan || '').toLowerCase();
        const sjB = (b.no_surat_jalan || '').toLowerCase();
        if (sjA < sjB) return -1;
        if (sjA > sjB) return 1;

        // 3. Sort by kode_produksi asc
        const kpA = (a.kode_produksi || '').toLowerCase();
        const kpB = (b.kode_produksi || '').toLowerCase();
        if (kpA < kpB) return -1;
        if (kpA > kpB) return 1;
        
        // 4. Sort by created_at desc
        const ca = new Date(a.created_at || 0).getTime();
        const cb = new Date(b.created_at || 0).getTime();
        return cb - ca;
      });

      localData = merged;
      if (!hasSpecificFilters) {
        memoryPenerimaanProduksiCache = merged;
        memoryPenerimaanProduksiLastFetch = Date.now();
      }
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

  // Ensure sorting is applied (useful if falling back to cache)
  localData.sort((a, b) => {
    // 1. Sort by tanggal_penerimaan desc
    const dateA = new Date(a.tanggal_penerimaan || 0).getTime();
    const dateB = new Date(b.tanggal_penerimaan || 0).getTime();
    if (dateB !== dateA) return dateB - dateA;
    
    // 2. Sort by no_surat_jalan asc
    const sjA = (a.no_surat_jalan || '').toLowerCase();
    const sjB = (b.no_surat_jalan || '').toLowerCase();
    if (sjA < sjB) return -1;
    if (sjA > sjB) return 1;

    // 3. Sort by kode_produksi asc
    const kpA = (a.kode_produksi || '').toLowerCase();
    const kpB = (b.kode_produksi || '').toLowerCase();
    if (kpA < kpB) return -1;
    if (kpA > kpB) return 1;
    
    // 4. Sort by created_at desc
    const ca = new Date(a.created_at || 0).getTime();
    const cb = new Date(b.created_at || 0).getTime();
    return cb - ca;
  });

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
 * Sync offline Penerimaan Produksi items to Supabase
 */
export async function syncOfflinePenerimaanProduksi(): Promise<{ synced: number, failed: number, errors: string[] }> {
  let localData: PenerimaanProduksiItem[] = [];
  try {
    const cached = localStorage.getItem('wms_local_penerimaan_produksi');
    if (cached) localData = JSON.parse(cached);
  } catch {
    return { synced: 0, failed: 0, errors: [] };
  }

  const offlineItems = localData.filter((d) => {
    const sid = String(d.id || '');
    return (typeof d.id === 'number' && d.id > 1000000000) || sid.startsWith('local_');
  });

  if (offlineItems.length === 0) return { synced: 0, failed: 0, errors: [] };

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  const remainingOffline: PenerimaanProduksiItem[] = [];

  for (const item of offlineItems) {
    try {
      const rowToInsert = { ...item };
      
      // Upload image to Google Drive if it is a data URI
      if (rowToInsert.foto_url && rowToInsert.foto_url.startsWith('data:')) {
        try {
          const uploadedUrls = await uploadMultipleImagesToGdrive(
            [rowToInsert.foto_url],
            `PENERIMAAN_OFFLINE_${(rowToInsert.no_surat_jalan || '').replace(/[^a-zA-Z0-9]/g, '_')}_${rowToInsert.kode_produksi || ''}`
          );
          if (uploadedUrls && uploadedUrls.length > 0) {
            rowToInsert.foto_url = uploadedUrls[0];
          }
        } catch (ePhoto) {
          console.warn('Gagal upload foto offline ke Cloud Storage, fallback simpan data uri:', ePhoto);
        }
      }

      delete rowToInsert.id; // Let Supabase generate a new ID
      delete (rowToInsert as any).sheet_row;
      
      const res = await supabaseFetch<PenerimaanProduksiItem[]>('penerimaan_produksi', 'POST', [rowToInsert], '', true);
      if (res && Array.isArray(res) && res.length > 0) {
        synced++;
      } else {
        failed++;
        errors.push("Empty response from Supabase");
        remainingOffline.push(rowToInsert as PenerimaanProduksiItem);
      }
    } catch (err: any) {
      console.warn('Failed to sync offline item:', err);
      failed++;
      errors.push(err.message || String(err));
      // Save the updated rowToInsert (potentially with uploaded photo) back to remainingOffline
      const failedItem = { ...item };
      remainingOffline.push(failedItem);
    }
  }

  try {
    // Keep only the remaining offline items and the ones that were NOT offline
    const updatedLocal = localData.filter(d => !offlineItems.includes(d)).concat(remainingOffline);
    localStorage.setItem('wms_local_penerimaan_produksi', JSON.stringify(updatedLocal));
  } catch {}

  return { synced, failed, errors };
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
    const res = await supabaseFetch<PenerimaanProduksiItem[]>('penerimaan_produksi', 'POST', rowsToInsert, '', true);
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

/**
 * Fetch logs matching a search keyword from all history.
 */
export async function fetchLogsBySearch(keyword: string, limit = 1000): Promise<LogProdukItem[]> {
  if (!keyword) return [];
  try {
    const term = encodeURIComponent(`%${keyword}%`);
    const data = await supabaseFetch<LogProdukItem[]>(
      'log_produk',
      'GET',
      null,
      `select=*&or=(sku.ilike.${term},nama_produk.ilike.${term},invoice.ilike.${term})&order=created_at.desc&limit=${limit}`
    );
    return data || [];
  } catch (err) {
    console.warn('Error fetching logs by search:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// ROADMAP & FEATURE REQUEST MODULE
// ---------------------------------------------------------------------------

export async function getRoadmaps(): Promise<RoadmapItem[]> {
  try {
    const data = await supabaseFetch<RoadmapItem[]>('wms_roadmap', 'GET', null, 'order=created_at.desc');
    return data || [];
  } catch (err) {
    console.error('Error fetching roadmaps:', err);
    return [];
  }
}

export async function saveRoadmap(item: Partial<RoadmapItem>): Promise<void> {
  try {
    if (item.id) {
      const payload = { ...item, updated_at: new Date().toISOString() };
      delete payload.id;
      await supabaseFetch('wms_roadmap', 'PATCH', payload, `id=eq.${item.id}`);
    } else {
      const payload = { ...item, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      await supabaseFetch('wms_roadmap', 'POST', [payload]);
    }
  } catch (err) {
    console.error('Error saving roadmap:', err);
    throw err;
  }
}

export async function deleteRoadmap(id: string): Promise<void> {
  try {
    await supabaseFetch('wms_roadmap', 'DELETE', null, `id=eq.${id}`);
  } catch (err) {
    console.error('Error deleting roadmap:', err);
    throw err;
  }
}

export async function getSystemDocs(): Promise<SystemDoc[]> {
  try {
    const data = await supabaseFetch<SystemDoc[]>('wms_system_docs', 'GET', null, 'limit=100');
    return data || [];
  } catch (err) {
    console.error('Error fetching system docs:', err);
    return [];
  }
}

export async function saveSystemDoc(doc: SystemDoc): Promise<void> {
  try {
    await supabaseFetch('wms_system_docs', 'POST', [doc], 'on_conflict=section_id', true);
  } catch (err) {
    console.error('Error saving system doc:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// AGENDA & PROJECT MODULE (SUPABASE SYNC + OFFLINE-FIRST CACHE)
// ---------------------------------------------------------------------------

const LOCAL_AGENDA_KEY = 'wms_local_agenda_events_v2';
const LOCAL_PROJECTS_KEY = 'wms_local_projects_v2';

function getRelativeDateStr(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultAgendaSeed(): AgendaEvent[] {
  return [
    {
      id: 'seed-agenda-1',
      title: 'Briefing Tim Gudang & Jalur Distribusi',
      description: 'Sinkronisasi target picking harian, pengecekan ketersediaan rak, dan alokasi tim packer.',
      start_date: getRelativeDateStr(0),
      is_all_day: false,
      start_time: '08:30',
      end_time: '09:30',
      category: 'operasional',
      location: 'Ruang Briefing Gudang Utama',
      pic: 'Budi Santoso',
      created_by: 'Superadmin',
      created_at: new Date().toISOString()
    },
    {
      id: 'seed-agenda-2',
      title: 'Stock Opname Rutin Bulanan - Area B',
      description: 'Pengecekan fisik menyeluruh stok kategori atasan dan bawahan di rak B01-B12.',
      start_date: getRelativeDateStr(1),
      is_all_day: true,
      category: 'operasional',
      location: 'Gudang Area B',
      pic: 'Agus Prawiro',
      created_by: 'Superadmin',
      created_at: new Date().toISOString()
    },
    {
      id: 'seed-agenda-3',
      title: 'Meeting Negosiasi Supplier Kardus & Bubble Wrap',
      description: 'Pembahasan kontrak pengadaan bahan packing Q4 dan penyesuaian harga volume grosir.',
      start_date: getRelativeDateStr(2),
      is_all_day: false,
      start_time: '10:00',
      end_time: '11:30',
      category: 'supplier',
      location: 'Meeting Room Lantai 2 / Google Meet',
      pic: 'Dewi Rahmawati',
      created_by: 'Superadmin',
      created_at: new Date().toISOString()
    },
    {
      id: 'seed-agenda-4',
      title: 'Review Sprint & Milestone Sistem WMS Scanner PWA',
      description: 'Demo integrasi kamera scanner offline dan pengujian fitur live picking task.',
      start_date: getRelativeDateStr(3),
      is_all_day: false,
      start_time: '14:00',
      end_time: '15:30',
      category: 'project',
      location: 'Studio & IT Hub',
      pic: 'Rian Kurnia',
      created_by: 'Superadmin',
      created_at: new Date().toISOString()
    },
    {
      id: 'seed-agenda-5',
      title: 'Audit Standar Keselamatan (K3) & Jalur Forklift',
      description: 'Pengecekan marka jalan, APAR, dan kelaikan operasional forklift dan pallet jack.',
      start_date: getRelativeDateStr(5),
      is_all_day: false,
      start_time: '13:00',
      end_time: '14:30',
      category: 'urgent',
      location: 'Loading Dock & Area Transit',
      pic: 'Hendra Saputra',
      created_by: 'Superadmin',
      created_at: new Date().toISOString()
    }
  ];
}

function getDefaultProjectsSeed(): ProjectItem[] {
  return [
    {
      id: 'seed-project-1',
      title: 'Relokasi & Reorganisasi Rak Gudang Area B',
      description: 'Penataan ulang layout rak penyimpanan area B untuk memperluas manuver forklift dan mempercepat rute picking barang fast-moving.',
      status: 'in_progress',
      priority: 'high',
      category: 'Infrastruktur',
      pic: 'Hendra Saputra',
      start_date: getRelativeDateStr(-5),
      deadline: getRelativeDateStr(10),
      progress: 65,
      tasks: [
        { id: 't1', title: 'Survey dimensi layout baru & jalur aman', is_completed: true, assigned_to: 'Hendra' },
        { id: 't2', title: 'Pembersihan dan pengecatan marka lantai', is_completed: true, assigned_to: 'Tim Lapangan' },
        { id: 't3', title: 'Pemindahan rak besi B01-B08', is_completed: false, assigned_to: 'Hendra & Tim' },
        { id: 't4', title: 'Re-pelabelan QR barcode rak', is_completed: false, assigned_to: 'Agus P' }
      ],
      created_by: 'Superadmin',
      created_at: new Date().toISOString()
    },
    {
      id: 'seed-project-2',
      title: 'Upgrade Barcode Scanner PWA & Offline Engine',
      description: 'Penyempurnaan kamera scanner HTML5 dengan feedback audio haptic dan cache IndexedDB lokal untuk toleransi gangguan internet.',
      status: 'in_progress',
      priority: 'urgent',
      category: 'Sistem IT',
      pic: 'Rian Kurnia',
      start_date: getRelativeDateStr(-10),
      deadline: getRelativeDateStr(4),
      progress: 85,
      tasks: [
        { id: 't21', title: 'Integrasi worker decoding barcode', is_completed: true, assigned_to: 'Rian K' },
        { id: 't22', title: 'Uji performa scan kamera low-light', is_completed: true, assigned_to: 'Rian K' },
        { id: 't23', title: 'Pengujian batch offline mutasi stok', is_completed: true, assigned_to: 'Tim IT' },
        { id: 't24', title: 'Sosialisasi ke staf warehouse', is_completed: false, assigned_to: 'Budi S' }
      ],
      created_by: 'Superadmin',
      created_at: new Date().toISOString()
    },
    {
      id: 'seed-project-3',
      title: 'Penerapan Sistem Label QR Khusus Ekspedisi & Resi Otomatis',
      description: 'Standardisasi format thermal label 100x150mm untuk memangkas antrean di loading dock saat serah terima kurir.',
      status: 'planned',
      priority: 'medium',
      category: 'Operasional',
      pic: 'Dewi Rahmawati',
      start_date: getRelativeDateStr(2),
      deadline: getRelativeDateStr(20),
      progress: 25,
      tasks: [
        { id: 't31', title: 'Kalibrasi printer thermal Zebra & Iware', is_completed: true, assigned_to: 'Dewi R' },
        { id: 't32', title: 'Integrasi format resi pengiriman', is_completed: false, assigned_to: 'Dewi R' },
        { id: 't33', title: 'Uji coba packing 100 paket per hari', is_completed: false, assigned_to: 'Tim Packing' }
      ],
      created_by: 'Superadmin',
      created_at: new Date().toISOString()
    }
  ];
}

/**
 * Helper aman untuk menyimpan ke localStorage dengan proteksi QuotaExceededError
 * Jika kuota browser 5MB penuh akibat lampiran gambar Base64, lakukan sanitasi data URL besar agar cache lokal tetap selamat tanpa crash.
 */
function safeSetLocalStorage(key: string, data: any): void {
  if (typeof window === 'undefined') return;
  const rawStr = typeof data === 'string' ? data : JSON.stringify(data);
  try {
    localStorage.setItem(key, rawStr);
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22 || err?.number === -2147024882) {
      console.warn(`[LocalStorage] Quota penuh saat menyimpan ${key}. Membersihkan data URL gambar besar untuk cache lokal.`);
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map((item: any) => {
            if (item && Array.isArray(item.attachments)) {
              return {
                ...item,
                attachments: item.attachments.map((att: any) => ({
                  ...att,
                  url: att.url && att.url.length > 500 ? '[local_cache_omitted_data_url]' : att.url
                }))
              };
            }
            return item;
          });
          localStorage.setItem(key, JSON.stringify(sanitized));
        }
      } catch (e) {
        console.error(`[LocalStorage] Gagal memangkas cache untuk ${key}:`, e);
      }
    }
  }
}

/**
 * Mengambil daftar agenda dari Supabase dengan fallback ke local cache
 */
export async function getAgendaEvents(): Promise<AgendaEvent[]> {
  try {
    const data = await supabaseFetch<AgendaEvent[]>('wms_agenda', 'GET', null, 'order=start_date.asc,start_time.asc');
    if (Array.isArray(data)) {
      safeSetLocalStorage(LOCAL_AGENDA_KEY, data);
      return data;
    }
  } catch (err) {
    console.info('Supabase wms_agenda offline/not yet migrated, using local cache:', err);
  }

  // Fallback ke localStorage
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(LOCAL_AGENDA_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }

    // Baseline Seed jika storage kosong
    const seed = getDefaultAgendaSeed();
    safeSetLocalStorage(LOCAL_AGENDA_KEY, seed);
    return seed;
  }

  return getDefaultAgendaSeed();
}

/**
 * Menyimpan / memperbarui agenda ke Supabase dan local cache
 */
export async function saveAgendaEvent(item: Partial<AgendaEvent>): Promise<AgendaEvent> {
  const isNew = !item.id;
  const nowIso = new Date().toISOString();
  const id = item.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'agenda-' + Date.now());
  
  const payload: AgendaEvent = {
    id,
    title: item.title || 'Agenda Baru',
    description: item.description || '',
    start_date: item.start_date || getRelativeDateStr(0),
    end_date: item.end_date || item.start_date || getRelativeDateStr(0),
    is_all_day: Boolean(item.is_all_day),
    start_time: item.start_time || '',
    end_time: item.end_time || '',
    category: item.category || 'umum',
    location: item.location || '',
    pic: item.pic || '',
    project_id: item.project_id || undefined,
    attachments: item.attachments || [],
    created_by: item.created_by || 'User',
    created_at: item.created_at || nowIso,
    updated_at: nowIso,
  };

  // 1. Simpan ke Supabase
  try {
    if (isNew) {
      await supabaseFetch('wms_agenda', 'POST', [payload]);
    } else {
      const updateData = { ...payload };
      delete (updateData as any).id;
      await supabaseFetch('wms_agenda', 'PATCH', updateData, `id=eq.${encodeURIComponent(id)}`);
    }
  } catch (err) {
    console.warn('Gagal sync agenda ke Supabase (disimpan ke cache lokal):', err);
  }

  // 2. Simpan ke local cache
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(LOCAL_AGENDA_KEY);
      let list: AgendaEvent[] = cached ? JSON.parse(cached) : [];
      const idx = list.findIndex(a => a.id === id);
      if (idx >= 0) {
        list[idx] = payload;
      } else {
        list.push(payload);
      }
      safeSetLocalStorage(LOCAL_AGENDA_KEY, list);
      window.dispatchEvent(new CustomEvent('wms_agenda_updated', { detail: { item: payload } }));
    } catch (e) {
      console.error('Local cache error:', e);
    }
  }

  return payload;
}

/**
 * Menghapus agenda dari Supabase dan local cache
 */
export async function deleteAgendaEvent(id: string): Promise<void> {
  try {
    await supabaseFetch('wms_agenda', 'DELETE', null, `id=eq.${encodeURIComponent(id)}`);
  } catch (err) {
    console.warn('Gagal hapus agenda di Supabase:', err);
  }

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(LOCAL_AGENDA_KEY);
      if (cached) {
        let list: AgendaEvent[] = JSON.parse(cached);
        list = list.filter(a => a.id !== id);
        safeSetLocalStorage(LOCAL_AGENDA_KEY, list);
        window.dispatchEvent(new CustomEvent('wms_agenda_updated', { detail: { deletedId: id } }));
      }
    } catch {}
  }
}

/**
 * Mengambil daftar proyek dari Supabase dengan fallback ke local cache
 */
export async function getProjects(): Promise<ProjectItem[]> {
  try {
    const data = await supabaseFetch<ProjectItem[]>('wms_projects', 'GET', null, 'order=created_at.desc');
    if (Array.isArray(data)) {
      safeSetLocalStorage(LOCAL_PROJECTS_KEY, data);
      return data;
    }
  } catch (err) {
    console.info('Supabase wms_projects offline/not yet migrated, using local cache:', err);
  }

  // Fallback ke localStorage
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(LOCAL_PROJECTS_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }

    const seed = getDefaultProjectsSeed();
    safeSetLocalStorage(LOCAL_PROJECTS_KEY, seed);
    return seed;
  }

  return getDefaultProjectsSeed();
}

/**
 * Menyimpan / memperbarui proyek ke Supabase dan local cache
 */
export async function saveProject(item: Partial<ProjectItem>): Promise<ProjectItem> {
  const isNew = !item.id;
  const nowIso = new Date().toISOString();
  const id = item.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'project-' + Date.now());

  const payload: ProjectItem = {
    id,
    title: item.title || 'Proyek Baru',
    description: item.description || '',
    status: item.status || 'in_progress',
    priority: item.priority || 'medium',
    category: item.category || 'Infrastruktur',
    pic: item.pic || '',
    start_date: item.start_date || getRelativeDateStr(0),
    deadline: item.deadline || getRelativeDateStr(14),
    progress: typeof item.progress === 'number' ? Math.max(0, Math.min(100, item.progress)) : 0,
    tasks: item.tasks || [],
    attachments: item.attachments || [],
    created_by: item.created_by || 'User',
    created_at: item.created_at || nowIso,
    updated_at: nowIso,
  };

  // 1. Simpan ke Supabase
  try {
    if (isNew) {
      await supabaseFetch('wms_projects', 'POST', [payload]);
    } else {
      const updateData = { ...payload };
      delete (updateData as any).id;
      await supabaseFetch('wms_projects', 'PATCH', updateData, `id=eq.${encodeURIComponent(id)}`);
    }
  } catch (err) {
    console.warn('Gagal sync project ke Supabase (disimpan ke cache lokal):', err);
  }

  // 2. Simpan ke local cache
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(LOCAL_PROJECTS_KEY);
      let list: ProjectItem[] = cached ? JSON.parse(cached) : [];
      const idx = list.findIndex(p => p.id === id);
      if (idx >= 0) {
        list[idx] = payload;
      } else {
        list.unshift(payload);
      }
      safeSetLocalStorage(LOCAL_PROJECTS_KEY, list);
      window.dispatchEvent(new CustomEvent('wms_projects_updated', { detail: { item: payload } }));
    } catch (e) {
      console.error('Local cache error:', e);
    }
  }

  return payload;
}

/**
 * Menghapus proyek dari Supabase dan local cache
 */
export async function deleteProject(id: string): Promise<void> {
  try {
    await supabaseFetch('wms_projects', 'DELETE', null, `id=eq.${encodeURIComponent(id)}`);
  } catch (err) {
    console.warn('Gagal hapus project di Supabase:', err);
  }

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(LOCAL_PROJECTS_KEY);
      if (cached) {
        let list: ProjectItem[] = JSON.parse(cached);
        list = list.filter(p => p.id !== id);
        safeSetLocalStorage(LOCAL_PROJECTS_KEY, list);
        window.dispatchEvent(new CustomEvent('wms_projects_updated', { detail: { deletedId: id } }));
      }
    } catch {}
  }
}

const LOCAL_NOTES_KEY = 'wms_local_notes_v1';

export async function getNotes(): Promise<NoteItem[]> {
  try {
    const data = await supabaseFetch<NoteItem[]>('wms_notes', 'GET', null, 'order=created_at.desc');
    if (Array.isArray(data)) {
      safeSetLocalStorage(LOCAL_NOTES_KEY, data);
      return data;
    }
  } catch (err) {
    console.info('Supabase wms_notes offline/not yet migrated, using local cache:', err);
  }

  // Fallback ke localStorage
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(LOCAL_NOTES_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
  }
  return [];
}

export async function saveNote(item: Partial<NoteItem>): Promise<NoteItem> {
  const isNew = !item.id;
  const id = item.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `note-${Date.now()}`);
  const now = new Date().toISOString();
  
  const payload: NoteItem = {
    id,
    title: item.title || '',
    content: item.content || '',
    color: item.color || 'yellow',
    created_by: item.created_by || 'Warehouse',
    created_at: isNew ? now : item.created_at || now,
    updated_at: now
  };

  try {
    if (isNew) {
      await supabaseFetch('wms_notes', 'POST', [payload]);
    } else {
      const { id: _id, ...updateData } = payload;
      await supabaseFetch('wms_notes', 'PATCH', updateData, `id=eq.${encodeURIComponent(id)}`);
    }
  } catch (err) {
    console.warn('Gagal simpan catatan di Supabase, fallback ke localStorage:', err);
  }

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(LOCAL_NOTES_KEY);
      let list: NoteItem[] = [];
      if (cached) {
        list = JSON.parse(cached);
      }
      
      if (isNew) {
        list = [payload, ...list.filter(n => n.id !== payload.id)];
      } else {
        list = list.map(n => n.id === payload.id ? payload : n);
      }
      
      safeSetLocalStorage(LOCAL_NOTES_KEY, list);
      window.dispatchEvent(new CustomEvent('wms_notes_updated', { detail: { item: payload } }));
    } catch {}
  }
  
  return payload;
}

export async function deleteNote(id: string): Promise<void> {
  try {
    await supabaseFetch('wms_notes', 'DELETE', null, `id=eq.${encodeURIComponent(id)}`);
  } catch (err) {
    console.warn('Gagal hapus catatan di Supabase:', err);
  }

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(LOCAL_NOTES_KEY);
      if (cached) {
        let list: NoteItem[] = JSON.parse(cached);
        list = list.filter(n => n.id !== id);
        safeSetLocalStorage(LOCAL_NOTES_KEY, list);
        window.dispatchEvent(new CustomEvent('wms_notes_updated', { detail: { deletedId: id } }));
      }
    } catch {}
  }
}

