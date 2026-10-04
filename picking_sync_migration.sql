-- MIGRATION SCRIPT UNTUK FASE 1: PICKING SYNC
-- Jalankan script ini di Supabase SQL Editor

-- 1. Tambahkan kolom invoice_picking ke tabel picking_list
ALTER TABLE public.picking_list ADD COLUMN IF NOT EXISTS invoice_picking TEXT DEFAULT '';

-- 2. Buat index untuk mempercepat pencarian berdasarkan invoice_picking (opsional tapi sangat disarankan)
CREATE INDEX IF NOT EXISTS idx_picking_list_invoice ON public.picking_list(invoice_picking);

-- Verifikasi tabel
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'picking_list';
