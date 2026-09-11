-- ==============================================================================
-- WMS: MIGRASI DATA EXISTING KE TABEL BARU
-- ==============================================================================
-- Jalankan SETELAH tabel baru (supabase_schema_new_tables.sql) sudah dibuat.
-- Script ini memindahkan data dari:
--   1. GAS Manual Shipment → tabel manual_shipment (dilakukan via script terpisah)
--   2. log_produk (type=PENGECEKAN_SJ) → tabel pengecekan_sj
-- ==============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- MIGRASI: log_produk (PENGECEKAN_SJ) → pengecekan_sj
-- ──────────────────────────────────────────────────────────────────────────────
-- Data Pengecekan SJ saat ini disimpan di log_produk dengan type='PENGECEKAN_SJ'
-- dan full record ada di kolom raw_payload (JSON).

INSERT INTO public.pengecekan_sj (
  id,
  no_sj,
  tanggal_sj,
  source,
  destination,
  status,
  status_komparasi,
  total_qty_sj,
  total_qty_terima,
  total_sku,
  submitted_by,
  catatan,
  items,
  items_json,
  sync_status,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid()                                                AS id,
  COALESCE(
    (raw_payload::jsonb)->>'no_sj',
    invoice
  )                                                               AS no_sj,
  COALESCE(
    ((raw_payload::jsonb)->>'tanggal_sj')::date,
    created_at::date,
    CURRENT_DATE
  )                                                               AS tanggal_sj,
  COALESCE(
    (raw_payload::jsonb)->>'source',
    area,
    'Gudang Pusat'
  )                                                               AS source,
  COALESCE(
    (raw_payload::jsonb)->>'destination',
    lokasi,
    'Outlet'
  )                                                               AS destination,
  COALESCE(
    (raw_payload::jsonb)->>'status',
    'selesai'
  )                                                               AS status,
  COALESCE(
    (raw_payload::jsonb)->>'status_komparasi',
    keterangan,
    'COCOK'
  )                                                               AS status_komparasi,
  COALESCE(
    ((raw_payload::jsonb)->>'total_qty_sj')::numeric,
    qty,
    0
  )                                                               AS total_qty_sj,
  COALESCE(
    ((raw_payload::jsonb)->>'total_qty_terima')::numeric,
    qty,
    0
  )                                                               AS total_qty_terima,
  COALESCE(
    ((raw_payload::jsonb)->>'total_sku')::integer,
    1
  )                                                               AS total_sku,
  COALESCE(
    (raw_payload::jsonb)->>'submitted_by',
    operator,
    'Petugas'
  )                                                               AS submitted_by,
  COALESCE(
    (raw_payload::jsonb)->>'catatan',
    ''
  )                                                               AS catatan,
  COALESCE(
    (raw_payload::jsonb)->'items',
    '[]'::jsonb
  )                                                               AS items,
  COALESCE(
    (raw_payload::jsonb)->>'items_json',
    ''
  )                                                               AS items_json,
  'synced'                                                        AS sync_status,
  created_at                                                      AS created_at,
  created_at                                                      AS updated_at
FROM public.log_produk
WHERE type = 'PENGECEKAN_SJ'
  AND raw_payload IS NOT NULL
  AND raw_payload::text != '{}'
ON CONFLICT DO NOTHING;

-- Verifikasi hasil migrasi
SELECT
  'log_produk (PENGECEKAN_SJ)' AS sumber,
  COUNT(*) AS jumlah_record
FROM public.log_produk
WHERE type = 'PENGECEKAN_SJ'

UNION ALL

SELECT
  'pengecekan_sj (baru)' AS sumber,
  COUNT(*) AS jumlah_record
FROM public.pengecekan_sj;

-- ──────────────────────────────────────────────────────────────────────────────
-- CATATAN: Migrasi Manual Shipment dari GAS → Supabase
-- Dilakukan via script TypeScript terpisah karena data ada di Google Sheets:
-- 
-- 1. Fetch: GET {GAS_URL}?action=getOrders → dapat array ManualShipmentOrder[]
-- 2. Transform: gabungkan items per no_pesanan (GAS: per-baris, Supabase: per-order)
-- 3. Insert ke tabel manual_shipment via Supabase REST API atau JS SDK
-- 
-- Script ada di: /tools/migrate_manual_shipment.ts (akan dibuat)
-- ──────────────────────────────────────────────────────────────────────────────
