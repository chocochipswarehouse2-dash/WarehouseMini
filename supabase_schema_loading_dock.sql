-- ==============================================================================
-- SQL DDL FOR LOADING DOCK (PENERIMAAN & PENGIRIMAN STORE)
-- Jalankan Query SQL ini di Supabase SQL Editor (https://supabase.com/dashboard)
-- ==============================================================================

-- 1. TABEL PENERIMAAN MUTASI STORE
CREATE TABLE IF NOT EXISTS public.penerimaan_mutasi_store (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal_diterima DATE NOT NULL DEFAULT CURRENT_DATE,
  asal_store_id TEXT DEFAULT '',
  asal_store_nama TEXT NOT NULL,
  no_surat_jalan TEXT DEFAULT 'Tidak ada surat jalan',
  kategori_produk TEXT DEFAULT 'Mutasi Antar Store',
  up_tujuan TEXT DEFAULT 'Warehouse',
  deskripsi TEXT DEFAULT '',
  qty NUMERIC DEFAULT 1,
  satuan_qty TEXT DEFAULT 'Pcs',
  foto_urls JSONB DEFAULT '[]'::jsonb,
  lokasi_stamp JSONB DEFAULT '{}'::jsonb,
  pic_nama TEXT DEFAULT '',
  pic_username TEXT DEFAULT '',
  timestamp_input TIMESTAMPTZ DEFAULT now(),
  keterangan TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABEL PENERIMAAN PAKET EKSPEDISI
CREATE TABLE IF NOT EXISTS public.penerimaan_paket (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal_diterima DATE NOT NULL DEFAULT CURRENT_DATE,
  ekspedisi TEXT NOT NULL,
  no_resi TEXT DEFAULT '',
  pengirim TEXT DEFAULT '',
  penerima_up TEXT DEFAULT '',
  jenis_paket TEXT DEFAULT 'Barang / Sampel',
  deskripsi TEXT DEFAULT '',
  qty_paket NUMERIC DEFAULT 1,
  foto_urls JSONB DEFAULT '[]'::jsonb,
  lokasi_stamp JSONB DEFAULT '{}'::jsonb,
  pic_nama TEXT DEFAULT '',
  pic_username TEXT DEFAULT '',
  timestamp_input TIMESTAMPTZ DEFAULT now(),
  keterangan TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABEL PENGIRIMAN STORE REPORTS (DISPATCHED QUEUE)
CREATE TABLE IF NOT EXISTS public.pengiriman_store_reports (
  id TEXT PRIMARY KEY,
  store_tujuan_id TEXT DEFAULT '',
  store_tujuan TEXT NOT NULL,
  tanggal_laporan DATE DEFAULT CURRENT_DATE,
  items JSONB DEFAULT '[]'::jsonb,
  total_item_count NUMERIC DEFAULT 0,
  total_koli NUMERIC DEFAULT 0,
  pic_nama TEXT DEFAULT '',
  pic_username TEXT DEFAULT '',
  status TEXT DEFAULT 'dispatched',
  foto_urls JSONB DEFAULT '[]'::jsonb,
  gdrive_folder_url TEXT DEFAULT '',
  trip_id TEXT DEFAULT '',
  tanggal_kirim TEXT DEFAULT '',
  waktu_kirim TEXT DEFAULT '',
  dikirim_oleh TEXT DEFAULT '',
  armada TEXT DEFAULT '',
  no_polisi TEXT DEFAULT '',
  catatan_kirim TEXT DEFAULT '',
  audit_logs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABEL PENGIRIMAN STORE TRIPS (SURAT JALAN & TRIP)
CREATE TABLE IF NOT EXISTS public.pengiriman_store_trips (
  id TEXT PRIMARY KEY,
  report_ids JSONB DEFAULT '[]'::jsonb,
  tanggal_kirim DATE DEFAULT CURRENT_DATE,
  dikirim_oleh TEXT DEFAULT '',
  armada TEXT DEFAULT '',
  no_polisi TEXT DEFAULT '',
  catatan_kirim TEXT DEFAULT '',
  status TEXT DEFAULT 'in_transit',
  foto_bukti_surat_jalan TEXT DEFAULT '',
  gdrive_folder_url TEXT DEFAULT '',
  pic_nama TEXT DEFAULT '',
  pic_username TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TABEL MANUAL SHIPMENT
CREATE TABLE IF NOT EXISTS public.manual_shipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_pesanan TEXT DEFAULT '',
  tanggal TIMESTAMPTZ DEFAULT now(),
  nama_pengirim TEXT DEFAULT 'CHOCOCHIPS',
  no_telp_store TEXT DEFAULT '',
  nama_tujuan TEXT DEFAULT '',
  no_telp_tujuan TEXT DEFAULT '',
  alamat_tujuan TEXT DEFAULT '',
  jasa_kirim TEXT DEFAULT '',
  no_resi TEXT DEFAULT '',
  status TEXT DEFAULT 'diterima',
  submitted_by TEXT DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TABEL EKSPEDISI CONFIG
CREATE TABLE IF NOT EXISTS public.ekspedisi_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. ENABLE ROW LEVEL SECURITY & PUBLIC ACCESS POLICY
ALTER TABLE public.penerimaan_mutasi_store ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penerimaan_paket ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengiriman_store_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengiriman_store_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_shipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ekspedisi_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all access" ON public.penerimaan_mutasi_store;
DROP POLICY IF EXISTS "Allow public all access" ON public.penerimaan_paket;
DROP POLICY IF EXISTS "Allow public all access" ON public.pengiriman_store_reports;
DROP POLICY IF EXISTS "Allow public all access" ON public.pengiriman_store_trips;
DROP POLICY IF EXISTS "Allow public all access" ON public.manual_shipment;
DROP POLICY IF EXISTS "Allow public all access" ON public.ekspedisi_config;

CREATE POLICY "Allow public all access" ON public.penerimaan_mutasi_store FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access" ON public.penerimaan_paket FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access" ON public.pengiriman_store_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access" ON public.pengiriman_store_trips FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access" ON public.manual_shipment FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access" ON public.ekspedisi_config FOR ALL USING (true) WITH CHECK (true);
