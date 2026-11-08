-- ============================================================
-- DDL SCRIPT: TABEL STORE HELP FAQ & BACKLOG TIKET UNTUK SUPABASE
-- WMS Chocochips Inventory System
-- ============================================================

-- 1. Tabel FAQ & Panduan Alur Terjawab (Bisa dibaca Store & Admin)
CREATE TABLE IF NOT EXISTS public.store_help_faq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT 'manual_shipment',
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  target_audience TEXT DEFAULT 'all',
  answer_admin TEXT,
  answer_store TEXT,
  action_steps_admin JSONB DEFAULT '[]',
  action_steps_store JSONB DEFAULT '[]',
  button_badges_admin JSONB DEFAULT '[]',
  button_badges_store JSONB DEFAULT '[]',
  admin_notes TEXT,
  store_notes TEXT,
  keywords TEXT[] DEFAULT '{}',
  button_badges JSONB DEFAULT '[]',
  action_steps JSONB DEFAULT '[]',
  image_url TEXT,
  view_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Migrasi kolom berbasis peran jika tabel sudah ada sebelumnya
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT 'all';
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS answer_admin TEXT;
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS answer_store TEXT;
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS action_steps_admin JSONB DEFAULT '[]';
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS action_steps_store JSONB DEFAULT '[]';
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS button_badges_admin JSONB DEFAULT '[]';
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS button_badges_store JSONB DEFAULT '[]';
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS store_notes TEXT;

-- 2. Tabel Tiket Pertanyaan Belum Terjawab & Backlog Fitur (Khusus Superadmin Hub)
CREATE TABLE IF NOT EXISTS public.store_help_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL,
  pic_name TEXT,
  category TEXT DEFAULT 'Manual Shipment & Alter',
  question TEXT NOT NULL,
  detail TEXT,
  order_id TEXT,
  status TEXT DEFAULT 'unanswered',
  ai_analysis TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

-- Aktifkan Row Level Security (RLS)
ALTER TABLE public.store_help_faq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_help_tickets ENABLE ROW LEVEL SECURITY;

-- Policy Akses Publik (Read / Write via Supabase Client Anon Key)
CREATE POLICY "Allow public all access store_help_faq" ON public.store_help_faq FOR ALL USING (true);
CREATE POLICY "Allow public all access store_help_tickets" ON public.store_help_tickets FOR ALL USING (true);

-- Index Pencarian Cepat
CREATE INDEX IF NOT EXISTS idx_store_help_faq_category ON public.store_help_faq (category);
CREATE INDEX IF NOT EXISTS idx_store_help_tickets_status ON public.store_help_tickets (status);
CREATE INDEX IF NOT EXISTS idx_store_help_tickets_store ON public.store_help_tickets (store_name);

-- Muat ulang schema cache PostgREST agar kolom baru langsung terbaca
NOTIFY pgrst, 'reload schema';

