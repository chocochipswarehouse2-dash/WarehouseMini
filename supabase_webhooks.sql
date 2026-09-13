-- ==============================================================================
-- WMS: SETUP SUPABASE WEBHOOKS KE GOOGLE APPS SCRIPT
-- ==============================================================================
-- Jalankan di Supabase SQL Editor.
-- URL GAS aktif (deployment @45 — selalu pakai yang terbaru):
--   https://script.google.com/macros/s/AKfycbyMO8rJFIrjj1xers7l2BRT7uo2RZre7yERpj-IRxFmjM_XkJjZn4B0gauI3Xm4eRVC_g/exec
--
-- Tabel yang di-sync ke GAS Sheet:
--   1. manual_shipment   → "Manual Shipment"
--   2. pengecekan_sj     → "Tarikan MD"
--   3. address_book      → "Data Alamat"
--   4. log_produk        → "Mutasi Log"       ← WAJIB untuk Mutasi Log & Stok Real
--   5. stock_opname_queue → "Stok Opname Queue"
--   6. stok_real_fisik   → "Stok Real"
--   7. master_produk     → "master_produk"
--   8. outlet_config     → "Outlet"
-- ==============================================================================

-- ─── VARIABEL URL ────────────────────────────────────────────────────────────
-- Ganti jika ada deployment GAS baru yang lebih fresh.
-- URL aktif saat ini: @45

-- 1. Webhook untuk tabel: manual_shipment
DROP TRIGGER IF EXISTS "sync-to-gas-manual-shipment" ON public.manual_shipment;
CREATE TRIGGER "sync-to-gas-manual-shipment"
AFTER INSERT OR UPDATE OR DELETE ON public.manual_shipment
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://script.google.com/macros/s/AKfycbyMO8rJFIrjj1xers7l2BRT7uo2RZre7yERpj-IRxFmjM_XkJjZn4B0gauI3Xm4eRVC_g/exec?secret=wms-webhook-secret-2026',
  'POST',
  '{"Content-type":"application/json"}',
  '{}',
  '5000'
);

-- 2. Webhook untuk tabel: pengecekan_sj
DROP TRIGGER IF EXISTS "sync-to-gas-pengecekan-sj" ON public.pengecekan_sj;
CREATE TRIGGER "sync-to-gas-pengecekan-sj"
AFTER INSERT OR UPDATE OR DELETE ON public.pengecekan_sj
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://script.google.com/macros/s/AKfycbyMO8rJFIrjj1xers7l2BRT7uo2RZre7yERpj-IRxFmjM_XkJjZn4B0gauI3Xm4eRVC_g/exec?secret=wms-webhook-secret-2026',
  'POST',
  '{"Content-type":"application/json"}',
  '{}',
  '5000'
);

-- 3. Webhook untuk tabel: address_book
DROP TRIGGER IF EXISTS "sync-to-gas-address-book" ON public.address_book;
CREATE TRIGGER "sync-to-gas-address-book"
AFTER INSERT OR UPDATE OR DELETE ON public.address_book
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://script.google.com/macros/s/AKfycbyMO8rJFIrjj1xers7l2BRT7uo2RZre7yERpj-IRxFmjM_XkJjZn4B0gauI3Xm4eRVC_g/exec?secret=wms-webhook-secret-2026',
  'POST',
  '{"Content-type":"application/json"}',
  '{}',
  '5000'
);

-- 4. Webhook untuk tabel: log_produk  ← KUNCI untuk Mutasi Log!
DROP TRIGGER IF EXISTS "sync-to-gas-log-produk" ON public.log_produk;
CREATE TRIGGER "sync-to-gas-log-produk"
AFTER INSERT OR UPDATE OR DELETE ON public.log_produk
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://script.google.com/macros/s/AKfycbyMO8rJFIrjj1xers7l2BRT7uo2RZre7yERpj-IRxFmjM_XkJjZn4B0gauI3Xm4eRVC_g/exec?secret=wms-webhook-secret-2026',
  'POST',
  '{"Content-type":"application/json"}',
  '{}',
  '5000'
);

-- 5. Webhook untuk tabel: stock_opname_queue
DROP TRIGGER IF EXISTS "sync-to-gas-stock-opname" ON public.stock_opname_queue;
CREATE TRIGGER "sync-to-gas-stock-opname"
AFTER INSERT OR UPDATE OR DELETE ON public.stock_opname_queue
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://script.google.com/macros/s/AKfycbyMO8rJFIrjj1xers7l2BRT7uo2RZre7yERpj-IRxFmjM_XkJjZn4B0gauI3Xm4eRVC_g/exec?secret=wms-webhook-secret-2026',
  'POST',
  '{"Content-type":"application/json"}',
  '{}',
  '5000'
);

-- 6. Webhook untuk tabel: stok_real_fisik
DROP TRIGGER IF EXISTS "sync-to-gas-stok-real" ON public.stok_real_fisik;
CREATE TRIGGER "sync-to-gas-stok-real"
AFTER INSERT OR UPDATE OR DELETE ON public.stok_real_fisik
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://script.google.com/macros/s/AKfycbyMO8rJFIrjj1xers7l2BRT7uo2RZre7yERpj-IRxFmjM_XkJjZn4B0gauI3Xm4eRVC_g/exec?secret=wms-webhook-secret-2026',
  'POST',
  '{"Content-type":"application/json"}',
  '{}',
  '5000'
);

-- 7. Webhook untuk tabel: master_produk
DROP TRIGGER IF EXISTS "sync-to-gas-master-produk" ON public.master_produk;
CREATE TRIGGER "sync-to-gas-master-produk"
AFTER INSERT OR UPDATE OR DELETE ON public.master_produk
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://script.google.com/macros/s/AKfycbyMO8rJFIrjj1xers7l2BRT7uo2RZre7yERpj-IRxFmjM_XkJjZn4B0gauI3Xm4eRVC_g/exec?secret=wms-webhook-secret-2026',
  'POST',
  '{"Content-type":"application/json"}',
  '{}',
  '5000'
);

-- ==============================================================================
-- SELESAI! Semua 7 webhook sudah aktif.
-- Data akan real-time sync dari Supabase → GAS Sheet setiap ada INSERT/UPDATE/DELETE.
-- Catatan: outlet_config belum ada sebagai tabel Supabase (data outlet dibaca dari GAS sheet langsung).
-- ==============================================================================
