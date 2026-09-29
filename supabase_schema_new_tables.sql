-- ==============================================================================
-- WMS CHOCOCHIPS - TABEL BARU: manual_shipment & pengecekan_sj
-- ==============================================================================
-- Jalankan di Supabase SQL Editor.
-- Aman dieksekusi berulang kali (IF NOT EXISTS).
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. TABEL MANUAL SHIPMENT
-- Menyimpan data pengiriman manual dari outlet ke customer.
-- Items disimpan sebagai JSONB (tidak perlu tabel terpisah).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manual_shipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_pesanan TEXT UNIQUE NOT NULL,
  tanggal TIMESTAMPTZ DEFAULT now(),

  -- Data Pengirim (Outlet / Toko)
  nama_pengirim TEXT NOT NULL DEFAULT 'CHOCOCHIPS',
  no_telp_store TEXT DEFAULT '',
  no_transaksi_pengirim TEXT[] DEFAULT '{}'::text[], -- Array DealPOS transaction IDs

  -- Data Customer / Penerima
  nama_tujuan TEXT NOT NULL,
  no_telp_tujuan TEXT DEFAULT '',
  alamat_tujuan TEXT NOT NULL,
  notes_paket TEXT DEFAULT '',
  no_transaksi_customer TEXT DEFAULT '',

  -- Jasa Kirim & Resi
  jasa_kirim TEXT DEFAULT '',
  no_resi TEXT DEFAULT '',

  -- Status & Meta
  status TEXT DEFAULT 'diterima'
    CHECK (status IN ('diterima', 'diproses', 'dikirim', 'batal', 'DELETED')),
  submitted_by TEXT DEFAULT '',

  -- Items disimpan sebagai JSONB
  -- Format: [{ id, sku, nama_produk, size, qty, fulfillment }]
  items JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index untuk performa
CREATE INDEX IF NOT EXISTS idx_manual_shipment_no_pesanan ON public.manual_shipment(no_pesanan);
CREATE INDEX IF NOT EXISTS idx_manual_shipment_status ON public.manual_shipment(status);
CREATE INDEX IF NOT EXISTS idx_manual_shipment_tanggal ON public.manual_shipment(tanggal);
CREATE INDEX IF NOT EXISTS idx_manual_shipment_submitted_by ON public.manual_shipment(submitted_by);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. TABEL PENGECEKAN SURAT JALAN
-- Menggantikan workaround data di log_produk (type='PENGECEKAN_SJ').
-- Menyimpan data pengecekan penerimaan barang dari outlet/MD.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pengecekan_sj (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_sj TEXT NOT NULL,
  tanggal_sj DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Rute pengiriman
  source TEXT NOT NULL DEFAULT 'Gudang Pusat',      -- Asal barang
  destination TEXT NOT NULL DEFAULT 'Outlet',        -- Tujuan barang

  -- Status pemeriksaan
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'selesai', 'DELETED')),
  status_komparasi TEXT DEFAULT 'COCOK'
    CHECK (status_komparasi IN ('COCOK', 'SELISIH')),

  -- Ringkasan qty
  total_qty_sj NUMERIC DEFAULT 0,
  total_qty_terima NUMERIC DEFAULT 0,
  total_sku INTEGER DEFAULT 0,

  -- Meta
  submitted_by TEXT NOT NULL DEFAULT '',
  catatan TEXT DEFAULT '',

  -- Detail item sebagai JSONB
  -- Format: [{ id, no_sj, sku, nama_produk, category, qty_sj, qty_scan, selisih, status_item, is_unexpected }]
  items JSONB DEFAULT '[]'::jsonb,
  items_json TEXT DEFAULT '',   -- Backup string JSON (kompatibilitas)

  -- Sync status untuk offline-first
  sync_status TEXT DEFAULT 'synced'
    CHECK (sync_status IN ('synced', 'pending_sync')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index untuk performa
CREATE INDEX IF NOT EXISTS idx_pengecekan_sj_no_sj ON public.pengecekan_sj(no_sj);
CREATE INDEX IF NOT EXISTS idx_pengecekan_sj_status ON public.pengecekan_sj(status);
CREATE INDEX IF NOT EXISTS idx_pengecekan_sj_tanggal ON public.pengecekan_sj(tanggal_sj);
CREATE INDEX IF NOT EXISTS idx_pengecekan_sj_source ON public.pengecekan_sj(source);
CREATE INDEX IF NOT EXISTS idx_pengecekan_sj_destination ON public.pengecekan_sj(destination);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. TABEL OUTLET CONFIG (opsional)
-- Menyimpan daftar outlet dan jasa kirim yang saat ini ada di sheet 'outlet'.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.outlet_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipe TEXT NOT NULL CHECK (tipe IN ('outlet', 'jasa_kirim')),
  nama TEXT NOT NULL,
  fulfillment TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  urutan INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outlet_config_tipe ON public.outlet_config(tipe);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY — Allow public access (sama dengan tabel lain)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['manual_shipment', 'pengecekan_sj', 'outlet_config'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public all access" ON public.%I;', tbl);
    EXECUTE format(
      'CREATE POLICY "Allow public all access" ON public.%I FOR ALL USING (true) WITH CHECK (true);',
      tbl
    );
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. AKTIFKAN REALTIME PUBLICATION
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY['manual_shipment', 'pengecekan_sj'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. TRIGGER: auto-update updated_at pada setiap UPDATE
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_manual_shipment_updated_at ON public.manual_shipment;
CREATE TRIGGER trg_manual_shipment_updated_at
  BEFORE UPDATE ON public.manual_shipment
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_pengecekan_sj_updated_at ON public.pengecekan_sj;
CREATE TRIGGER trg_pengecekan_sj_updated_at
  BEFORE UPDATE ON public.pengecekan_sj
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- VERIFIKASI: Tampilkan tabel yang baru dibuat
-- ──────────────────────────────────────────────────────────────────────────────
SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('manual_shipment', 'pengecekan_sj', 'outlet_config')
ORDER BY table_name;
