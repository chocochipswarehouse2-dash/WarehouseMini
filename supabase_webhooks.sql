-- ==============================================================================
-- WMS: CLEANUP SUPABASE WEBHOOKS KE GOOGLE APPS SCRIPT
-- ==============================================================================
-- Menghapus semua trigger yang sebelumnya digunakan untuk sync data ke Google Sheets via GAS.
-- Hal ini akan mempercepat proses insert/update/delete di Supabase secara signifikan.
-- Jalankan skrip ini di SQL Editor Supabase.

DROP TRIGGER IF EXISTS "sync-to-gas-manual-shipment" ON public.manual_shipment;
DROP TRIGGER IF EXISTS "sync-to-gas-pengecekan-sj" ON public.pengecekan_sj;
DROP TRIGGER IF EXISTS "sync-to-gas-address-book" ON public.address_book;
DROP TRIGGER IF EXISTS "sync-to-gas-log-produk" ON public.log_produk;
DROP TRIGGER IF EXISTS "sync-to-gas-stock-opname" ON public.stock_opname_queue;
DROP TRIGGER IF EXISTS "sync-to-gas-stok-real" ON public.stok_real_fisik;
DROP TRIGGER IF EXISTS "sync-to-gas-master-produk" ON public.master_produk;

-- Selesai! Webhook GAS sudah dibersihkan dari database.
