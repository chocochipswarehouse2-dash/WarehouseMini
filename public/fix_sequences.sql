-- ==============================================================================
-- WMS CHOCOCHIPS - SINKRONISASI SEQUENCE ID (AUTO-INCREMENT) PASCA MIGRASI
-- ==============================================================================
-- Jalankan skrip ini 1x di Supabase SQL Editor pada database baru setelah kloning data.
-- Eksekusi sangat cepat (< 1 detik).
-- ==============================================================================

SELECT setval(pg_get_serial_sequence('public.log_produk', 'id'), COALESCE((SELECT MAX(id) FROM public.log_produk), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.stock_opname_queue', 'id'), COALESCE((SELECT MAX(id) FROM public.stock_opname_queue), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.penerimaan_produksi', 'id'), COALESCE((SELECT MAX(id) FROM public.penerimaan_produksi), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.picking_list', 'id'), COALESCE((SELECT MAX(id) FROM public.picking_list), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.peminjaman', 'id'), COALESCE((SELECT MAX(id) FROM public.peminjaman), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.perbaikan_tickets', 'id'), COALESCE((SELECT MAX(id) FROM public.perbaikan_tickets), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.qc_reports', 'id'), COALESCE((SELECT MAX(id) FROM public.qc_reports), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.master_shift', 'id'), COALESCE((SELECT MAX(id) FROM public.master_shift), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.roster_shift', 'id'), COALESCE((SELECT MAX(id) FROM public.roster_shift), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.presensi', 'id'), COALESCE((SELECT MAX(id) FROM public.presensi), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.lembur', 'id'), COALESCE((SELECT MAX(id) FROM public.lembur), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.perijinan_cuti', 'id'), COALESCE((SELECT MAX(id) FROM public.perijinan_cuti), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('public.wms_settings', 'id'), COALESCE((SELECT MAX(id) FROM public.wms_settings), 0) + 1, false);
