-- ==============================================================================
-- WMS: SETUP SUPABASE WEBHOOKS KE GOOGLE APPS SCRIPT
-- ==============================================================================
-- Jalankan di Supabase SQL Editor.
-- Script ini akan otomatis membuat Webhook untuk 3 tabel:
-- 1. manual_shipment
-- 2. pengecekan_sj
-- 3. address_book
-- ==============================================================================

-- 1. Webhook untuk tabel: manual_shipment
DROP TRIGGER IF EXISTS "sync-to-gas-manual-shipment" ON public.manual_shipment;
CREATE TRIGGER "sync-to-gas-manual-shipment"
AFTER INSERT OR UPDATE OR DELETE ON public.manual_shipment
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://script.google.com/macros/s/AKfycbxkBScIKlkA06Twrs3WOYZC1s6jmvl9dppV5M008ZydoPrqau3d6-VCdfDGacDUErN7Ig/exec?secret=wms-webhook-secret-2026',
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
  'https://script.google.com/macros/s/AKfycbxkBScIKlkA06Twrs3WOYZC1s6jmvl9dppV5M008ZydoPrqau3d6-VCdfDGacDUErN7Ig/exec?secret=wms-webhook-secret-2026',
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
  'https://script.google.com/macros/s/AKfycbwnGgT-ekW7L-HIE2RGxuBZQl5gATB4fUFYO-SxwGS16p8_Kc28q91gnd5N-Y30bA8Q9w/exec?secret=wms-webhook-secret-2026',
  'POST',
  '{"Content-type":"application/json"}',
  '{}',
  '5000'
);

-- Selesai! Webhook sudah aktif.
