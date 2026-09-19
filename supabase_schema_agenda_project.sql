-- ==============================================================================
-- WMS CHOCOCHIPS - SKEMA DATABASE: wms_projects, wms_agenda, & wms_notes
-- ==============================================================================
-- Jalankan di Supabase SQL Editor.
-- Aman dieksekusi berulang kali (IF NOT EXISTS & ON CONFLICT DO NOTHING).
-- ==============================================================================

-- 1. TABEL PROYEK (wms_projects)
CREATE TABLE IF NOT EXISTS public.wms_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'in_progress' 
    CHECK (status IN ('planned', 'in_progress', 'review', 'completed', 'on_hold')),
  priority TEXT DEFAULT 'medium' 
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  category TEXT DEFAULT 'Infrastruktur',
  pic TEXT DEFAULT '',
  start_date DATE,
  deadline DATE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  tasks JSONB DEFAULT '[]'::jsonb, -- Array of { id, title, is_completed, assigned_to, due_date }
  attachments JSONB DEFAULT '[]'::jsonb, -- Array of { id, name, size, type, url }
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index untuk tabel wms_projects
CREATE INDEX IF NOT EXISTS idx_wms_projects_status ON public.wms_projects(status);
CREATE INDEX IF NOT EXISTS idx_wms_projects_deadline ON public.wms_projects(deadline);
CREATE INDEX IF NOT EXISTS idx_wms_projects_created_at ON public.wms_projects(created_at DESC);

-- 2. TABEL AGENDA & KALENDER KERJA (wms_agenda)
CREATE TABLE IF NOT EXISTS public.wms_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE,
  is_all_day BOOLEAN DEFAULT false,
  start_time TEXT DEFAULT '', -- format "HH:mm" misal "09:00"
  end_time TEXT DEFAULT '',   -- format "HH:mm" misal "10:30"
  category TEXT DEFAULT 'umum', -- Kategori dinamis (tidak dibatasi CHECK constraint agar mendukung custom category)
  location TEXT DEFAULT '',
  pic TEXT DEFAULT '',
  project_id UUID REFERENCES public.wms_projects(id) ON DELETE SET NULL,
  attachments JSONB DEFAULT '[]'::jsonb, -- Array of { id, name, size, type, url }
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Drop constraint kategori lama jika ada (agar kategori kustom/kapital tidak ditolak)
ALTER TABLE public.wms_agenda DROP CONSTRAINT IF EXISTS wms_agenda_category_check;

-- Index untuk tabel wms_agenda
CREATE INDEX IF NOT EXISTS idx_wms_agenda_start_date ON public.wms_agenda(start_date);
CREATE INDEX IF NOT EXISTS idx_wms_agenda_category ON public.wms_agenda(category);
CREATE INDEX IF NOT EXISTS idx_wms_agenda_project_id ON public.wms_agenda(project_id);
CREATE INDEX IF NOT EXISTS idx_wms_agenda_created_at ON public.wms_agenda(created_at DESC);

-- 3. TABEL CATATAN & STICKY NOTES (wms_notes)
CREATE TABLE IF NOT EXISTS public.wms_notes (
  id TEXT PRIMARY KEY,
  title TEXT DEFAULT '',
  content TEXT NOT NULL,
  color TEXT DEFAULT 'yellow',
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index untuk tabel wms_notes
CREATE INDEX IF NOT EXISTS idx_wms_notes_created_at ON public.wms_notes(created_at DESC);

-- 4. PERMISSIONS & ROW LEVEL SECURITY (RLS)
ALTER TABLE public.wms_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_notes ENABLE ROW LEVEL SECURITY;

-- Policy untuk wms_projects (Akses penuh untuk aplikasi WMS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_projects' AND policyname = 'Allow public read wms_projects') THEN
    CREATE POLICY "Allow public read wms_projects" ON public.wms_projects FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_projects' AND policyname = 'Allow public insert wms_projects') THEN
    CREATE POLICY "Allow public insert wms_projects" ON public.wms_projects FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_projects' AND policyname = 'Allow public update wms_projects') THEN
    CREATE POLICY "Allow public update wms_projects" ON public.wms_projects FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_projects' AND policyname = 'Allow public delete wms_projects') THEN
    CREATE POLICY "Allow public delete wms_projects" ON public.wms_projects FOR DELETE USING (true);
  END IF;
END $$;

-- Policy untuk wms_agenda (Akses penuh untuk aplikasi WMS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_agenda' AND policyname = 'Allow public read wms_agenda') THEN
    CREATE POLICY "Allow public read wms_agenda" ON public.wms_agenda FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_agenda' AND policyname = 'Allow public insert wms_agenda') THEN
    CREATE POLICY "Allow public insert wms_agenda" ON public.wms_agenda FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_agenda' AND policyname = 'Allow public update wms_agenda') THEN
    CREATE POLICY "Allow public update wms_agenda" ON public.wms_agenda FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_agenda' AND policyname = 'Allow public delete wms_agenda') THEN
    CREATE POLICY "Allow public delete wms_agenda" ON public.wms_agenda FOR DELETE USING (true);
  END IF;
END $$;

-- Policy untuk wms_notes (Akses penuh untuk aplikasi WMS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_notes' AND policyname = 'Allow public read wms_notes') THEN
    CREATE POLICY "Allow public read wms_notes" ON public.wms_notes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_notes' AND policyname = 'Allow public insert wms_notes') THEN
    CREATE POLICY "Allow public insert wms_notes" ON public.wms_notes FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_notes' AND policyname = 'Allow public update wms_notes') THEN
    CREATE POLICY "Allow public update wms_notes" ON public.wms_notes FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wms_notes' AND policyname = 'Allow public delete wms_notes') THEN
    CREATE POLICY "Allow public delete wms_notes" ON public.wms_notes FOR DELETE USING (true);
  END IF;
END $$;

-- 5. TAMBAHKAN KE REALTIME PUBLICATION SUPABASE (Jika didukung)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wms_agenda;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wms_projects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wms_notes;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
