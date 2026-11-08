# 📚 Pusat Dokumentasi Proyek WMS Inventory

Seluruh dokumen penting proyek ini telah dikelompokkan berdasarkan fungsi dan kebutuhannya agar mudah ditemukan, direview, maupun dipelihara oleh tim dan AI Agent.

---

## 🗂️ Struktur Direktori `docs/`

### 1. 📋 [`docs/PENDING_PLANS.md`](file:///d:/Antigravity/WMS%20Inventory/docs/PENDING_PLANS.md) — **Daftar Plan & Fitur Menunggu Review**
Berisi tabel antrean rencana fitur (*Implementation Plans* & PRD) yang sudah dirancang namun belum dieksekusi/direview. Agent akan otomatis mengingatkan daftar ini jika Anda sedang beralih mengerjakan fitur lain.

### 2. 📝 [`docs/plans/`](file:///d:/Antigravity/WMS%20Inventory/docs/plans) — **Rencana Implementasi & PRD Fitur**
Tempat penyimpanan seluruh dokumen *Implementation Plan* dan *Product Requirements Document (PRD)*:
- [`PLAN_AUTO_LOOKUP_PRODUKSI_TRELLO.md`](file:///d:/Antigravity/WMS%20Inventory/docs/plans/PLAN_AUTO_LOOKUP_PRODUKSI_TRELLO.md) — Rencana fitur Auto-Lookup Nama Produk, UP & Foto pada Tabel & Input Penerimaan Produksi dari Trello UP.
- [`PRD_PLAN_FULFILMENT_PESANAN_ONLINE_JALUR_C.md`](file:///d:/Antigravity/WMS%20Inventory/docs/plans/PRD_PLAN_FULFILMENT_PESANAN_ONLINE_JALUR_C.md) — PRD & Plan Modul Fulfilment Pesanan Online (Jalur C).

### 3. 🏗️ [`docs/blueprints/`](file:///d:/Antigravity/WMS%20Inventory/docs/blueprints) — **Blueprint Arsitektur & Standar Sistem**
Berisi aturan bisnis permanen, standar arsitektur, dan titik pemulihan sistem:
- [`PUSAT_RESOLUSI_RETUR_BLUEPRINT.md`](file:///d:/Antigravity/WMS%20Inventory/docs/blueprints/PUSAT_RESOLUSI_RETUR_BLUEPRINT.md) — Blueprint alur 3 tahap, isolasi data, dan aturan cetak Pusat Resolusi (Retur Barang).
- [`RESTORE_POINT.md`](file:///d:/Antigravity/WMS%20Inventory/docs/blueprints/RESTORE_POINT.md) — Dokumentasi titik pemulihan stabil (*Restore Point*).
- *(Catatan: Master aturan utama Agent tetap berada di root [`GEMINI.md`](file:///d:/Antigravity/WMS%20Inventory/GEMINI.md) agar otomatis terbaca oleh sistem).*

### 4. 🛠️ [`docs/guides/`](file:///d:/Antigravity/WMS%20Inventory/docs/guides) — **Panduan Setup & Operasional Teknis**
Berisi panduan instalasi, integrasi pihak ketiga, dan referensi script:
- [`PANDUAN_MIGRASI_SUPABASE.md`](file:///d:/Antigravity/WMS%20Inventory/docs/guides/PANDUAN_MIGRASI_SUPABASE.md) — Panduan migrasi dan konfigurasi database Supabase.
- [`PUSH_NOTIFICATIONS_SETUP.md`](file:///d:/Antigravity/WMS%20Inventory/docs/guides/PUSH_NOTIFICATIONS_SETUP.md) — Panduan aktivasi Web Push Notification (VAPID & Vercel Env).
- [`GOOGLE_APPS_SCRIPT_ALL_IN_ONE.js`](file:///d:/Antigravity/WMS%20Inventory/docs/guides/GOOGLE_APPS_SCRIPT_ALL_IN_ONE.js) — Referensi kode integrasi Google Apps Script.

### 5. 🗄️ [`docs/sql/`](file:///d:/Antigravity/WMS%20Inventory/docs/sql) — **Skema Database & Migrasi SQL Supabase**
Kumpulan terpusat seluruh file `.sql` untuk tabel, fungsi RPC, trigger, dan webhook Supabase:
- [`supabase_schema.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/supabase_schema.sql) — Skema utama database WMS.
- [`supabase_migration.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/supabase_migration.sql) — Skrip migrasi skema.
- [`supabase_schema_new_tables.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/supabase_schema_new_tables.sql) — Skema tabel-tabel modul tambahan.
- [`supabase_schema_hr.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/supabase_schema_hr.sql) — Skema modul HR, Absensi, Lembur & Cuti.
- [`supabase_schema_agenda_project.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/supabase_schema_agenda_project.sql) — Skema modul Agenda & Project Management.
- [`supabase_schema_loading_dock.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/supabase_schema_loading_dock.sql) — Skema modul Loading Dock.
- [`supabase_schema_recount_logs.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/supabase_schema_recount_logs.sql) — Skema log Audit Hitung Ulang Produksi.
- [`supabase_schema_store_help.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/supabase_schema_store_help.sql) — Skema modul Bantuan & FAQ Store.
- [`supabase_webhooks.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/supabase_webhooks.sql) — Konfigurasi database webhooks.
- [`picking_sync_migration.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/picking_sync_migration.sql) — Migrasi sinkronisasi antrean picking.
- [`push_notifications_setup.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/push_notifications_setup.sql) & [`push_notifications_ready.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/push_notifications_ready.sql) — Skema dan trigger Web Push Notification.
- [`clear_base64.sql`](file:///d:/Antigravity/WMS%20Inventory/docs/sql/clear_base64.sql) — Utilitas pembersihan string Base64 di database.

