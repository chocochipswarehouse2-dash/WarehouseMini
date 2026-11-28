-- ============================================================
-- DDL SCRIPT: MODUL FULFILMENT PESANAN ONLINE (JALUR C - FASE 1)
-- Tabel: public.online_orders & public.online_import_jobs
-- Catatan: Frontend memiliki fallback otomatis ke wms_system_docs
-- apabila tabel ini belum dieksekusi di Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.online_orders (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL DEFAULT 'shopee',
  order_source TEXT NOT NULL DEFAULT 'excel_import',
  order_no TEXT NOT NULL,
  tracking_no TEXT DEFAULT '',
  courier_raw TEXT DEFAULT '',
  courier_name TEXT DEFAULT '',
  courier_group TEXT NOT NULL DEFAULT 'LAINNYA',
  service_tier TEXT NOT NULL DEFAULT 'reguler',
  marketplace_status TEXT DEFAULT '',
  wms_status TEXT NOT NULL DEFAULT 'new',
  order_created_at TEXT DEFAULT '',
  paid_at TEXT DEFAULT '',
  ship_by_deadline TEXT DEFAULT '',
  shipping_arranged_at TEXT DEFAULT '',
  is_preorder BOOLEAN NOT NULL DEFAULT false,
  preorder_reason TEXT DEFAULT '',
  has_resi_on_first_import BOOLEAN NOT NULL DEFAULT false,
  urgent_resi_alert BOOLEAN NOT NULL DEFAULT false,
  is_manual_edited BOOLEAN NOT NULL DEFAULT false,
  manual_edit_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  hold_reason TEXT DEFAULT '',
  hold_detected_stage TEXT DEFAULT '',
  check_reason TEXT DEFAULT '',
  cancel_reason TEXT DEFAULT '',
  daily_seq_date TEXT DEFAULT '',
  daily_seq_no INTEGER,
  batch_id TEXT DEFAULT '',
  basket_code TEXT DEFAULT '',
  buyer_username TEXT DEFAULT '',
  recipient_name TEXT DEFAULT '',
  recipient_phone TEXT DEFAULT '',
  shipping_address TEXT DEFAULT '',
  city TEXT DEFAULT '',
  province TEXT DEFAULT '',
  buyer_note TEXT DEFAULT '',
  seller_note TEXT DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_import_mode TEXT DEFAULT '',
  last_imported_at TIMESTAMPTZ DEFAULT now(),
  imported_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_online_orders_mp_order_no
  ON public.online_orders(marketplace, order_no);

CREATE INDEX IF NOT EXISTS idx_online_orders_wms_status
  ON public.online_orders(wms_status);

CREATE INDEX IF NOT EXISTS idx_online_orders_courier_group
  ON public.online_orders(courier_group);

CREATE INDEX IF NOT EXISTS idx_online_orders_updated_at
  ON public.online_orders(updated_at DESC);

ALTER TABLE public.online_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'online_orders' AND policyname = 'Allow public all access online_orders'
  ) THEN
    CREATE POLICY "Allow public all access online_orders"
      ON public.online_orders FOR ALL USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.online_import_jobs (
  id TEXT PRIMARY KEY,
  marketplace TEXT NOT NULL DEFAULT 'shopee',
  import_mode TEXT NOT NULL DEFAULT 'perlu_dikirim',
  file_name TEXT DEFAULT '',
  total_rows INTEGER NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_online_import_jobs_created_at
  ON public.online_import_jobs(created_at DESC);

ALTER TABLE public.online_import_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'online_import_jobs' AND policyname = 'Allow public all access online_import_jobs'
  ) THEN
    CREATE POLICY "Allow public all access online_import_jobs"
      ON public.online_import_jobs FOR ALL USING (true);
  END IF;
END $$;
