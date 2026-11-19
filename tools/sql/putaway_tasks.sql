-- ============================================================
-- DDL SCRIPT: TABEL TUGAS PUTAWAY GUDANG (putaway_tasks)
-- Jalankan di Supabase SQL Editor (opsional: frontend sudah memiliki
-- fallback otomatis ke wms_system_docs [wms_putaway_tasks_v1] jika
-- tabel ini belum dibuat di database Supabase Anda).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.putaway_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_putaway TEXT UNIQUE NOT NULL,
  source_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_area TEXT DEFAULT 'Transit',
  status TEXT NOT NULL DEFAULT 'AKTIF' CHECK (status IN ('AKTIF', 'SELESAI', 'DIBATALKAN')),
  created_by TEXT NOT NULL,
  active_operators JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_by TEXT DEFAULT '',
  safe_cap_percent NUMERIC DEFAULT 75,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  catatan TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_putaway_tasks_status ON public.putaway_tasks(status);
CREATE INDEX IF NOT EXISTS idx_putaway_tasks_updated_at ON public.putaway_tasks(updated_at DESC);

ALTER TABLE public.putaway_tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'putaway_tasks' AND policyname = 'Allow public all access putaway_tasks'
  ) THEN
    CREATE POLICY "Allow public all access putaway_tasks" ON public.putaway_tasks FOR ALL USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'putaway_tasks'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.putaway_tasks;
    EXCEPTION WHEN duplicate_object THEN NULL;
              WHEN OTHERS THEN NULL;
    END;
  END IF;
END $$;
