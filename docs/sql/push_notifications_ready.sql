-- =====================================================================
-- WMS WEB PUSH NOTIFIKASI (SIAP JALANKAN DI SUPABASE SQL EDITOR)
-- Domain Vercel: warehousemini.vercel.app
-- Secret: e895617c94e315b459d722e2acdbfffee974cc441fceaa70
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
CREATE POLICY "wms_push_subscriptions_all" ON public.push_subscriptions
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Pastikan kolom kompatibilitas doc_key tersedia di wms_system_docs
ALTER TABLE public.wms_system_docs ADD COLUMN IF NOT EXISTS doc_key TEXT;
UPDATE public.wms_system_docs SET doc_key = section_id WHERE doc_key IS NULL;

-- 3. Ekstensi HTTP dari database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 4. Fungsi pengirim ke endpoint Vercel /api/push
CREATE OR REPLACE FUNCTION public.wms_push_notify(p_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://warehousemini.vercel.app/api/push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', 'e895617c94e315b459d722e2acdbfffee974cc441fceaa70'
    ),
    body    := p_payload,
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  NULL; -- kegagalan push tidak boleh menggagalkan transaksi bisnis
END;
$$;

-- 5. Trigger level-statement untuk INSERT (1 request per batch)
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

-- 5B. Trigger khusus Pengajuan Lembur & Ijin/Cuti (dikirim khusus ke akun warehouse)
CREATE OR REPLACE FUNCTION public.wms_push_on_insert_lembur() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.wms_push_notify(jsonb_build_object('table','lembur','records',
    (SELECT COALESCE(jsonb_agg(to_jsonb(n)),'[]'::jsonb) FROM new_rows n)));
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.wms_push_on_insert_cuti() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.wms_push_notify(jsonb_build_object('table','perijinan_cuti','records',
    (SELECT COALESCE(jsonb_agg(to_jsonb(n)),'[]'::jsonb) FROM new_rows n)));
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS wms_push_lembur ON public.lembur;
CREATE TRIGGER wms_push_lembur AFTER INSERT ON public.lembur
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.wms_push_on_insert_lembur();

DROP TRIGGER IF EXISTS wms_push_perijinan_cuti ON public.perijinan_cuti;
CREATE TRIGGER wms_push_perijinan_cuti AFTER INSERT ON public.perijinan_cuti
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.wms_push_on_insert_cuti();

-- 6. Trigger Live Chat: perubahan index ruang chat (wms_chat_rooms_index_v1)
CREATE OR REPLACE FUNCTION public.wms_push_on_chat_index() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.wms_push_notify(
    jsonb_build_object(
      'table',
      'wms_system_docs',
      'record',
      jsonb_build_object(
        'section_id', NEW.section_id,
        'doc_key', COALESCE(NEW.doc_key, NEW.section_id),
        'content', NEW.content
      ),
      'old_record',
      CASE
        WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
          'section_id', OLD.section_id,
          'doc_key', COALESCE(OLD.doc_key, OLD.section_id),
          'content', OLD.content
        )
        ELSE '{}'::jsonb
      END
    )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS wms_push_chat_index ON public.wms_system_docs;
CREATE TRIGGER wms_push_chat_index
AFTER INSERT OR UPDATE ON public.wms_system_docs
FOR EACH ROW
WHEN (NEW.section_id = 'wms_chat_rooms_index_v1' OR NEW.doc_key = 'wms_chat_rooms_index_v1')
EXECUTE FUNCTION public.wms_push_on_chat_index();
