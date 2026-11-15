-- ============================================================
-- DDL SCRIPT: TABEL TUGAS DELEGASI WMS (wms_tasks)
-- Jalankan di Supabase SQL Editor (opsional: frontend sudah memiliki
-- fallback otomatis ke wms_system_docs jika tabel ini belum dibuat)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wms_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date DATE,
  assigned_to_id TEXT NOT NULL,
  assigned_to_name TEXT DEFAULT '',
  assigned_to_role TEXT DEFAULT '',
  assigned_by TEXT DEFAULT '',
  work_report TEXT DEFAULT '',
  report_attachments JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  project_id UUID REFERENCES public.wms_projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wms_tasks_assigned_to ON public.wms_tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_wms_tasks_status ON public.wms_tasks(status);
CREATE INDEX IF NOT EXISTS idx_wms_tasks_due_date ON public.wms_tasks(due_date);

ALTER TABLE public.wms_tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_tasks' AND policyname = 'Allow public all access wms_tasks') THEN
    CREATE POLICY "Allow public all access wms_tasks" ON public.wms_tasks FOR ALL USING (true);
  END IF;
END $$;

