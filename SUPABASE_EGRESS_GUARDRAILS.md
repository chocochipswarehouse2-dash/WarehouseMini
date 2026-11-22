# Supabase Egress Guardrails & Low-Bandwidth Architecture Standard

> **Status**: MANDATORY FOR ALL AGENTS & DEVELOPERS  
> **Target Sehat**: Pure JSON/text traffic **< 30–50 MB/hari** (Free Plan limit: **5 GB/bulan** ≈ 160 MB/hari).  
> **Catatan Aset**: Seluruh gambar/foto produk & bukti transaksi disimpan di **Google Drive**, bukan Supabase Storage. Oleh karena itu, lalu lintas Supabase 100% berupa data teks JSON dan **TIDAK SEHARUSNYA** membengkak hingga ratusan MB per hari.

---

## 1. Latar Belakang Insiden (20 November 2026)

Pada 17–20 November 2026, penggunaan Supabase Egress melonjak hingga **~562 MB/hari** (**PostgREST 88% / 494,6 MB** + **Realtime 12% / 67,6 MB**), mengancam kuota Free Plan (5 GB/bulan) habis dalam ~9 hari.

Hasil audit codebase menemukan 5 penyebab utama:
1. **Polling Agresif di Atas Realtime (`PickingTasksView.tsx`)**: Menarik `fetchPickingListFromSupabase(true)` (800 baris `picking_list` + 100 baris `peminjaman`) setiap **10,5 detik** dan refresh per SJ setiap **3,5 detik**, padahal Realtime `broadcast` + `postgres_changes` sudah aktif.
2. **Polling Global Semua User (`liveChatService.ts`)**: Menarik `wms_chat_rooms_index_v1` & `wms_chat_tombstones_v1` + mengirim `trackPresence()` setiap **8 detik** oleh seluruh akun yang login.
3. **Full-Table Fetch Tanpa Cache & Limit (`fetchManualShipments`)**: Query `manual_shipment?select=*&order=created_at.desc` tanpa `limit` dan tanpa SWR cache/deduplikasi, sehingga memanggil berulang kali menarik seluruh riwayat beserta JSON `notes_paket` (`history_logs`, `alteration_repair_data`).
4. **Realtime `postgres_changes` Tanpa Role-Gating (`App.tsx`)**: Akun Store & CS ikut menerima payload WebSocket untuk tabel khusus gudang (`picking_list`, `stock_opname_queue`, `penerimaan_produksi`, `perbaikan_tickets`, `qc_reports`).
5. **Polling Sekunder Terlalu Cepat + `select=*`**: `PutawayWorkspaceModal` (3,5s), `TrelloView` (60s), `AgendaView` (45s), serta `checkNewStoreOrdersDelta` (45s dengan `select=*` pada tabel HR).

*(Sudah ditangani tahap awal pada rilis `v2.22.11`.)*

---

## 2. Hard Constraints untuk Semua Agent (WAJIB DIPATUHI)

Setiap kali membuat modul baru, menambah fitur sync/notifikasi, atau memperbaiki bug, agent **WAJIB** mematuhi 7 aturan berikut:

### Rule 1 — Dilarang Fast Polling (`< 30 detik`) Jika Sudah Ada Realtime
- Jika fitur sudah menggunakan Supabase Realtime (`broadcast` atau `postgres_changes`), fallback `setInterval` **MINIMAL 60 detik** (`>= 60_000 ms`) untuk sync daftar data, atau **>= 15–30 detik** khusus untuk kolaborasi aktif satu dokumen.
- Setiap `setInterval` **WAJIB** mengecek `document.visibilityState === 'visible'` (dan `navigator.onLine`) agar tidak membakar kuota saat tab/HP tidak aktif.

### Rule 2 — Dilarang `select=*` Tanpa `limit` pada Tabel Transaksi
- **WAJIB** sebutkan kolom spesifik (`select=id,no_pesanan,status,created_at,...`), terutama jika tabel memiliki kolom JSON besar (`notes_paket`, `raw_json`, `items`, `history_logs`, `content`).
- **WAJIB** sertakan `limit=` (atau filter tanggal/watermark `updated_at=gt...` / `id=gt...`) pada setiap query list.

### Rule 3 — Wajib In-Memory SWR Cache + In-Flight Deduplication
- Fungsi fetch tabel utama (seperti `fetchManualShipments`, `fetchPickingListFromSupabase`, `fetchMasterProductsFromSupabase`) **WAJIB** memiliki:
  - **SWR TTL Cache** (minimal 30–120 detik) yang di-invalidate otomatis saat mutasi lokal atau event Realtime masuk.
  - **In-flight promise deduplication** agar beberapa komponen yang mount bersamaan (misal `DashboardView` + tab modul + keep-alive tab) hanya memicu **1 HTTP request**, bukan N request kembar.

### Rule 4 — Role-Gating pada Realtime `postgres_changes`
- Jangan mendaftarkan `.on('postgres_changes', { table: ... })` secara global di `App.tsx` untuk semua role jika hanya dipakai oleh role tertentu.
- Akun **Store** dan **Customer Service** tidak boleh menerima payload Realtime dari tabel internal gudang (`log_produk` bulk, `picking_list`, `stock_opname_queue`, `penerimaan_produksi`, `perbaikan_tickets`, `qc_reports`).

### Rule 5 — Jangan Simpan Data Append-Only sebagai 1 JSON Blob di `wms_system_docs`
- `wms_system_docs` hanya cocok untuk **konfigurasi kecil / state ringkas** (< 50 KB) yang jarang berubah.
- Data yang terus bertambah setiap hari (log pesan chat, histori transaksi, antrian panjang) **JANGAN** disimpan sebagai 1 array JSON raksasa di `wms_system_docs`, karena setiap 1 baris baru memaksa klien mengunduh ulang seluruh riwayat dari nol. Gunakan tabel relasional dengan `limit` / pagination delta.

### Rule 6 — Katalog & Stok Wajib Lewat IndexedDB + Watermark Delta
- Dilarang memanggil `fetchMasterProductsFromSupabase(50000, true)` atau `fetchAllStockRealtime(50000, true)` secara periodik atau saat pindah halaman.
- Gunakan `syncSmartLowEgressCache()` (cek watermark ~250 byte) dan `fetchStockForSkus(skus)` untuk SKU yang berubah saja.

### Rule 7 — Perhatikan Dampak Desktop Multi-Tab Keep-Alive
- Ingat bahwa di Desktop (`>= 1024px`), hingga **4 tab halaman** bisa tetap *mounted* secara bersamaan di latar belakang (`document.visibilityState` tetap `'visible'`).
- Oleh karena itu, komponen halaman **TIDAK BOLEH** menjalankan polling agresif terus-menerus selama mounted jika halaman tersebut bukan fokus utama, atau harus memakai interval hemat (`>= 60–180 detik`).

### Rule 8 — `master_produk.dealpos_channels` Wajib Format Flat Non-Zero (Tanpa Duplikasi `b`/`d`/`cabang` & Key `:0`)
- Jangan pernah menyimpan duplikat objek bersarang (`b`, `d`, `cabang`), `total_stok`, atau ~23 outlet bernilai `0` di kolom JSONB `master_produk.dealpos_channels` (sebelumnya membengkakkan 29.885 baris menjadi **34–39 MB** per full sync).
- Simpan HANYA key flat bernilai non-zero + `TP` (Tag Price), misal `{"TP":395000,"MAP":3,"CPJ":1}`, sehingga total tabel turun **~87,8% menjadi ~4,16 MB** (100% lossless; outlet yang tidak ada otomatis dibaca `0` oleh `extractProductFromRow`).
- Utility pemadatan aman tersedia di `tools/compact_master_dealpos_channels.cjs`.

### Rule 9 — Service Worker & `wms_system_docs` Wajib Watermark `updated_at` (~180 Byte) + Filter Realtime
- Background Service Worker (`public/pwa-extras.js`) **DILARANG** polling setiap 20 detik. Gunakan interval minimal **180 detik**, query watermark `select=section_id,updated_at` sebelum menarik konten dokumen (`wms_chat_rooms_index_v1`, `recount_active_queue`), dan delta `created_at=gt...` / `updated_at=gt...` dengan proyeksi kolom minimal.
- Subscription `postgres_changes` pada `wms_system_docs` **WAJIB** menggunakan `filter: section_id=eq.<key>` agar dokumen non-chat berukuran 60–105 KB (`recount_audit_results`, `produksi_qty_nota_map`, `wms_putaway_tasks_v1`) tidak ikut di-fanout ke semua perangkat.
- Subscription `postgres_changes` pada `master_produk` **DILARANG** dipasang global di `App.tsx` (gunakan `broadcast('catalog_updated')` + watermark delta).
- Query `stock_opname_queue` **WAJIB** terfilter per `status` (`PENDING` default) dengan SWR cache + debounce Realtime (`>= 1500 ms`), bukan menarik 17.000+ baris historis (~8,64 MB) setiap buka halaman atau setiap batch approve.

---

## 3. Audit Tahap 2 (21 November 2026)

Pasca perbaikan Tahap 1, lonjakan sisa **~204,9 MB/hari PostgREST (95,7%)** + **~9,3 MB/hari Realtime (4,3%)** berhasil diidentifikasi dari audit langsung ke tabel produksi:
1. **Bloat `master_produk.dealpos_channels`**: 29.885 baris × ~1.089 byte JSONB duplikat = **~34–39 MB** per full sync (dipadatkan -87,8% ke **~4,16 MB**).
2. **Hidden Service Worker Polling (`public/pwa-extras.js`)**: Menarik `wms_system_docs`, `manual_shipment` (dengan `notes_paket`), `lembur`, `perijinan_cuti`, `izin_pulang_cepat` setiap **20 detik** tanpa watermark (diubah ke 180 detik + watermark `updated_at` + delta filter).
3. **`stock_opname_queue` Full-Table Fetch Storm**: 17.338 baris (**8,64 MB**) ditarik penuh (`ALL`, `limit=100000`) saat buka halaman & tanpa debounce di setiap event Realtime (diubah ke status-scoped `PENDING` default + limit 500 histori + SWR cache + debounce 1,5 detik).
4. **Live Chat `wms_system_docs` Unfiltered Realtime & Tab Focus GET**: Dipersempit ke `filter=section_id=eq.wms_chat_rooms_index_v1` & tombstones, parsing langsung dari payload Realtime, dan cek watermark ~180 byte saat `focus`/`visibilitychange`/120s timer.
5. **Role-Gating Realtime Lanjutan (`App.tsx`)**: Menghapus listener global `master_produk`, memindahkan `log_produk` & `peminjaman` ke `!isStoreOrCsOnly`, serta gating `retur_barang`, HR, dan `penerimaan_recount_queue`.

---

## 4. Checklist Audit Sebelum Merilis Fitur Baru
Sebelum menyatakan tugas selesai, pastikan:
- [ ] Tidak ada `setInterval` baru dengan interval `< 30000 ms` yang memanggil `supabaseFetch` / `fetch(...)`.
- [ ] Tidak ada query list baru dengan `select=*` tanpa `limit`.
- [ ] Semua listener Realtime baru sudah di-cleanup di `return () => { ... }`, di-gate sesuai role, dan memakai `filter:` jika mendengar tabel besar seperti `wms_system_docs`.
- [ ] Jika ada data yang sering dibaca banyak komponen, sudah ada SWR cache / deduplikasi.
- [ ] Data JSONB di `master_produk.dealpos_channels` tetap flat non-zero tanpa key `:0` atau duplikat `b`/`d`/`cabang`.
