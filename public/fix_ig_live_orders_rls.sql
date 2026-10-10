-- ==============================================================================
-- WMS CHOCOCHIPS: FIX ROW-LEVEL SECURITY (RLS) UNTUK TABEL IG_LIVE_ORDERS
-- ==============================================================================
-- Mengatasi error 42501: "new row violates row-level security policy for table ig_live_orders"
-- Jalankan skrip ini 1x di Supabase SQL Editor (1-Click Run).
-- ==============================================================================

-- 1. Pastikan tabel ig_live_orders ada
CREATE TABLE IF NOT EXISTS public.ig_live_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_pesanan TEXT UNIQUE NOT NULL,
  tanggal TIMESTAMPTZ DEFAULT now(),
  session_live TEXT DEFAULT 'IG Live Session',
  username_ig TEXT DEFAULT '@customer',
  nama_pembeli TEXT DEFAULT 'Customer IG',
  no_telp TEXT DEFAULT '',
  alamat_lengkap TEXT DEFAULT '',
  kota_kabupaten TEXT DEFAULT '',
  provinsi TEXT DEFAULT '',
  kode_pos TEXT DEFAULT '',
  ekspedisi TEXT DEFAULT 'JNE',
  layanan TEXT DEFAULT 'REG',
  no_resi TEXT DEFAULT '-',
  biaya_ongkir NUMERIC DEFAULT 0,
  total_bayar NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'siap_diproses',
  alasan_batal TEXT DEFAULT '',
  catatan TEXT DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  is_picked BOOLEAN DEFAULT false,
  waktu_picking TIMESTAMPTZ,
  petugas_picking TEXT,
  waktu_packing TIMESTAMPTZ,
  petugas_packing TEXT,
  waktu_kirim TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indeks Performa
CREATE INDEX IF NOT EXISTS idx_ig_live_orders_no ON public.ig_live_orders(no_pesanan);
CREATE INDEX IF NOT EXISTS idx_ig_live_orders_status ON public.ig_live_orders(status);
CREATE INDEX IF NOT EXISTS idx_ig_live_orders_created_at ON public.ig_live_orders(created_at DESC);

-- 3. Aktifkan RLS dan Berikan Policy Akses Penuh untuk Anonim / Operator WMS
ALTER TABLE public.ig_live_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all access" ON public.ig_live_orders;
CREATE POLICY "Allow public all access" ON public.ig_live_orders FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. Tambahkan ke Realtime Publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ig_live_orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.ig_live_orders;
    END IF;
  END IF;
END $$;
