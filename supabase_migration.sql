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

-- ──────────────────────────────────────────────────────────────────────────────
-- MIGRASI: Update Struktur Hak Akses (wms_users.permissions)
-- ──────────────────────────────────────────────────────────────────────────────
-- Mengubah struktur JSON permissions yang lama menjadi format baru berbasis menu_*, tab_*, action_*
UPDATE public.wms_users
SET permissions = jsonb_build_object(
  'menu_ops_dashboard', COALESCE((permissions->>'can_view_dashboard')::boolean, false),
  'menu_ops_agenda', COALESCE((permissions->>'can_agenda')::boolean, false),
  'menu_ops_pesanan_saya', COALESCE((permissions->>'can_tarikan_md')::boolean, false) OR COALESCE((permissions->>'can_manual_shipment_view')::boolean, false),
  'menu_ops_resolusi', COALESCE((permissions->>'can_view_resolusi')::boolean, false),
  'menu_ops_loading_dock', COALESCE((permissions->>'can_penerimaan_barang')::boolean, false) OR COALESCE((permissions->>'can_penerimaan')::boolean, false),
  'menu_ops_mutasi', COALESCE((permissions->>'can_view_mutasi')::boolean, false) OR COALESCE((permissions->>'can_scan')::boolean, false),
  'menu_ops_qc', COALESCE((permissions->>'can_perbaikan')::boolean, false),
  'menu_ops_inventory', COALESCE((permissions->>'can_view_inventory')::boolean, false),
  'menu_ops_picking', COALESCE((permissions->>'can_picking')::boolean, false),
  'menu_ops_peminjaman', COALESCE((permissions->>'can_peminjaman')::boolean, false),
  'menu_ops_roadmap', COALESCE((permissions->>'can_view_roadmap')::boolean, false),
  'menu_hr_karyawan', COALESCE((permissions->>'can_view_karyawan')::boolean, false),
  'menu_hr_presensi', COALESCE((permissions->>'can_view_presensi')::boolean, false),
  'menu_hr_roster', COALESCE((permissions->>'can_view_roster')::boolean, false),
  'menu_hr_lembur_cuti', COALESCE((permissions->>'can_view_lembur_cuti')::boolean, false),
  'menu_hr_approval', COALESCE((permissions->>'can_approve_hr')::boolean, false),
  'action_cetak_label', COALESCE((permissions->>'can_cetak_label')::boolean, false),
  'action_export_data', COALESCE((permissions->>'can_export_data')::boolean, false),
  'action_import_data', COALESCE((permissions->>'can_import_export_data')::boolean, false),
  'action_sync_dealpos', COALESCE((permissions->>'can_sync_dealpos')::boolean, false),
  'action_edit_master', COALESCE((permissions->>'can_edit_data')::boolean, false),
  'action_delete_master', COALESCE((permissions->>'can_delete_data')::boolean, false),
  
  -- Tab ops
  'tab_ops_mutasi_scanner', COALESCE((permissions->>'can_scan')::boolean, false),
  'tab_ops_mutasi_so', COALESCE((permissions->>'can_approve_so')::boolean, false),
  'tab_ops_pesanan_manual_shipment', COALESCE((permissions->>'can_manual_shipment_action')::boolean, false),
  'tab_ops_loading_produksi', COALESCE((permissions->>'can_penerimaan')::boolean, false),
  'tab_ops_loading_penerimaan', COALESCE((permissions->>'can_penerimaan_barang')::boolean, false),
  'tab_ops_loading_pengiriman', COALESCE((permissions->>'can_pengiriman')::boolean, false) OR COALESCE((permissions->>'can_packing')::boolean, false)
)
WHERE permissions IS NOT NULL AND permissions::text != '{}' AND permissions ? 'can_view_dashboard';

-- Update Role Admin lama menjadi 'Superadmin'
UPDATE public.wms_users
SET role = 'Superadmin'
WHERE role IN ('All', 'admin', 'Admin', 'superadmin');
