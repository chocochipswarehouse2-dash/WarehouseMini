-- =====================================================================
-- WMS WEB PUSH (notifikasi saat aplikasi/browser ditutup, gaya WhatsApp)
-- Jalankan SEKALI di Supabase Dashboard -> SQL Editor.
-- Ganti 2 placeholder:  <DOMAIN_VERCEL>  dan  <PUSH_WEBHOOK_SECRET>
--   contoh <DOMAIN_VERCEL> : wms-chocochips.vercel.app   (tanpa https://)
--   <PUSH_WEBHOOK_SECRET>  : nilai yang sama dengan env PUSH_WEBHOOK_SECRET di Vercel
-- =====================================================================

-- 1. Tabel perangkat yang berlangganan push
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint    TEXT PRIMARY KEY,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  username    TEXT NOT NULL,
  is_admin    BOOLEAN NOT NULL DEFAULT false,
  is_picker   BOOLEAN NOT NULL DEFAULT false,
  store_name  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_username_idx ON public.push_subscriptions (username);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wms_push_subscriptions_all" ON public.push_subscriptions;
-- Konsisten dengan tabel WMS lain (akses via anon key aplikasi)
CREATE POLICY "wms_push_subscriptions_all" ON public.push_subscriptions
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Ekstensi pengirim HTTP dari database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 3. Fungsi pengirim ke endpoint Vercel /api/push
CREATE OR REPLACE FUNCTION public.wms_push_notify(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://<DOMAIN_VERCEL>/api/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', '<PUSH_WEBHOOK_SECRET>'
    ),
    body    := p_payload,
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- kegagalan push TIDAK boleh menggagalkan transaksi bisnis
END;
$$;

-- 4. Trigger level-statement untuk INSERT (1 request per batch, bukan per baris)
CREATE OR REPLACE FUNCTION public.wms_push_on_insert_ms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.wms_push_notify(jsonb_build_object('table','manual_shipment','records',
    (SELECT COALESCE(jsonb_agg(to_jsonb(n)),'[]'::jsonb) FROM new_rows n)));
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.wms_push_on_insert_retur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.wms_push_notify(jsonb_build_object('table','retur_barang','records',
    (SELECT COALESCE(jsonb_agg(to_jsonb(n)),'[]'::jsonb) FROM new_rows n)));
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.wms_push_on_insert_sps() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.wms_push_notify(jsonb_build_object('table','peminjaman','records',
    (SELECT COALESCE(jsonb_agg(to_jsonb(n)),'[]'::jsonb) FROM new_rows n)));
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS wms_push_manual_shipment ON public.manual_shipment;
CREATE TRIGGER wms_push_manual_shipment AFTER INSERT ON public.manual_shipment
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.wms_push_on_insert_ms();

DROP TRIGGER IF EXISTS wms_push_retur_barang ON public.retur_barang;
CREATE TRIGGER wms_push_retur_barang AFTER INSERT ON public.retur_barang
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.wms_push_on_insert_retur();

DROP TRIGGER IF EXISTS wms_push_peminjaman ON public.peminjaman;
CREATE TRIGGER wms_push_peminjaman AFTER INSERT ON public.peminjaman
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.wms_push_on_insert_sps();

-- 5. Live Chat: indeks ruang chat berubah (pesan baru) -> push ke peserta yang belum membaca
CREATE OR REPLACE FUNCTION public.wms_push_on_chat_index() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.wms_push_notify(jsonb_build_object(
    'table','wms_system_docs',
    'record', jsonb_build_object('doc_key', NEW.doc_key, 'content', NEW.content),
    'old_record', CASE WHEN TG_OP = 'UPDATE'
      THEN jsonb_build_object('doc_key', OLD.doc_key, 'content', OLD.content)
      ELSE '{}'::jsonb END));
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS wms_push_chat_index ON public.wms_system_docs;
CREATE TRIGGER wms_push_chat_index AFTER INSERT OR UPDATE ON public.wms_system_docs
  FOR EACH ROW WHEN (NEW.doc_key = 'wms_chat_rooms_index_v1')
  EXECUTE FUNCTION public.wms_push_on_chat_index();
