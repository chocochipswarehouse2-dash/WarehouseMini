# WMS Module Changelog — Riwayat Permanen Revisi & Penambahan Fitur

> **Aturan Wajib Semua Agen Coding**: Setiap kali ada penambahan fitur baru, perbaikan bug penting, atau perubahan alur/UI di modul mana pun, tambahkan entri baru di bagian **paling atas** file ini sebelum menjalankan `bump_version.cjs` dan build.

---

## v2.30.1 — 25 November 2026
**Modul**: Penerimaan Produksi — Audit Hitung Ulang Multi-Batch & Google Sheet Sync (`src/services/gasProduksiSync.ts`, `gas/produksi_sheet.js`, `src/components/penerimaan/AuditHitungUlangTab.tsx`, `src/components/penerimaan/ProduksiSpreadsheetView.tsx`, `src/services/settings.ts`)
- **Perbaikan False-Alarm Multi-Batch Kedatangan Susulan (Kasus Kode `2678`)**:
  - **Deteksi Otomatis Batch Susulan (`hasPendingFollowUpBatch` / `recountPendingBatch`)**: Memisahkan item penerimaan yang sudah punya `recount_qty` (batch lama) vs item baru (`recount_qty == null`) di `gasProduksiSync.ts` dan `AuditHitungUlangTab.tsx` agar audit batch lama tidak lagi diadu dengan total gabungan baru.
  - **Proteksi Formula Google Sheet (`gas/produksi_sheet.js`)**:
    - `TOTAL HITUNG ULANG` menampilkan `"<sum> (Parsial)"` (amber) jika masih ada baris kosong atau batch susulan yang belum diaudit; otomatis berubah menjadi angka penuh saat seluruh baris selesai diaudit.
    - `SELISIH NOTA` menggunakan `ISNUMBER(TOTAL_HITUNG_ULANG)` sehingga saat audit masih parsial tetap membandingkan `TOTAL AWAL - QTY NOTA` (bebas false-alarm merah `-207`).
    - Baris dengan batch susulan menampilkan status **`BELUM LENGKAP`** (amber) alih-alih **`KURANG`** (merah), dan `LOG HITUNG ULANG` hanya mencantumkan tanggal batch yang benar-benar sudah diaudit + catatan jumlah pcs batch baru yang belum diaudit.
  - **UX Audit Susulan di WMS (`AuditHitungUlangTab.tsx`)**:
    - Kode dengan kedatangan susulan otomatis berstatus **`Susulan +qty`** (muncul di filter *Belum / Perlu Audit*), menampilkan banner peringatan di workspace beserta tombol 1-klik **`+ Gabungkan Batch Baru`** dan badge `+qty baru` pada tiap varian, serta menyimpan `audited_dates` di `saveRecountAuditRecord`.

---

## v2.30.0 — 24 November 2026
**Modul**: Tugas Picking (`PickingTasksView.tsx`, `supabase.ts`, `scannerOutboxService.ts`, `types.ts`) + Upgrade Skill (`.agents/skills/wms-picking-completion-sync-guardrails/SKILL.md`)
- **Riwayat Tugas Picking Lengkap (Paginated On-Demand + Pencarian Arsip Cloud + Tail-SJ Guard)**:
  - Menangani kasus tampilan awal hanya memuat ~10 SJ terbaru (akibat 4 SJ besar 24 Nov 2026 berisi 794 baris yang memenuhi batas `limit=800`, sementara seluruh 8.794 baris riwayat tetap aman di database).
  - Meningkatkan halaman awal menjadi `1.000` baris terbaru + seluruh tugas aktif (`status=neq.SELESAI`) disertai **Tail-SJ Boundary Guard** agar SJ pada batas halaman tidak pernah terpotong.
  - Menambahkan tombol **"Muat Riwayat Lebih Lama (+1.000 Baris)"** (`fetchPickingListHistoryPageSupabase`), pencarian arsip otomatis ke database (`searchPickingListHistorySupabase`, debounce 400ms, min. 3 karakter), serta menghapus batas potong `.slice(0, 100)` pada daftar kartu SJ.
- **Multi-Lokasi Split Picking (Ambil 1 SKU dari >1 Lokasi Rak)**:
  - Menambahkan struktur `pick_splits` (`PickingSplitAllocation[]`) yang mendukung pengambilan 1 SKU dari beberapa rak sekaligus (mis. `1 pcs A001` + `1 pcs A002`) melalui 4 jalur: **strip inline `- / +` per rak** pada kartu SKU, **scan barcode `#LOK` bergantian**, tombol **`Ambil Pas` smart auto-split** mengikuti ketersediaan stok rak, serta **editor Multi-Lokasi di modal Edit Item**.
  - Saat SJ diselesaikan (online maupun outbox offline), `buildOutLogEntriesForPickingItem` otomatis mencatat baris mutasi `#OUT` di `log_produk` secara **terpisah per lokasi rak** (tetap patuh anti-double `#OUT` delta) dan menyimpan ringkasan multi-rak (`A001 (1), A002 (1)`) di `picking_list.lokasi`.
- **Atribusi Picker Per-Produk / Per-Split pada Picking Kolaboratif**:
  - Memperbaiki alur join/leave (`claimOrJoinPickingSJSupabase`, `leavePickingSJSupabase`), sync realtime per-item (`syncSinglePickingItemRealtimeSupabase`), dan penyelesaian SJ (`completePickingSuratJalanSupabase`, `syncAllPickingOutboxBatches`) agar **setiap SKU & split rak mencatat nama operator yang benar-benar mengambil barang tersebut** (mis. SKU1 oleh `Vina`, SKU2 oleh `Yesi` dalam 1 SJ yang sama — tidak lagi ditimpa seragam `"Vina, Yesi"` pada `picking_list.picker_name` maupun `log_produk.operator`).
  - Menampilkan badge atribusi picker per-SKU di kartu picking aktif, modal Rekap sebelum submit, dan modal Detail Rekap SJ Selesai.

---

## v2.29.2 — 24 November 2026
**Modul**: Keranjang Order Picking & Distribusi Picking (`src/components/inventory/InventoryPickingCartDrawer.tsx`, `src/components/InventoryView.tsx`, `src/components/PesananSaya/DistribusiPickingModal.tsx`, `src/types.ts`)
- **Filter Area Sumber Picking pada Keranjang Order**:
  - Menambahkan pemilih **Area Sumber Picking** (`Semua Area Normal`, `Warehouse`, `Blok F`, `Kolian`, `Aksesoris`, `Transit`, `Perbaikan`, `Anomali`) beserta jumlah SKU aktif per area di bagian atas `InventoryPickingCartDrawer`.
  - Saat area tertentu dipilih (mis. `Warehouse`, `Blok F`, atau `Perbaikan`), **Pencarian Cepat Produk**, **Impor CSV/Excel/Paste**, serta **Lokasi Rak & Qty item di Keranjang** otomatis hanya menampilkan produk, rak, dan stok dari area tersebut.
  - Meneruskan `source_area` ke `PengecekanSJDraft` dan `DistribusiPickingModal` (`isLocationEligibleForDraft`) agar seluruh hasil picking (Preview, Tugas Picking App, Pesan WA Grup, & Cetak A4) ketat mengikuti lokasi area yang dipilih — sementara Pengecekan SJ Distribusi Store normal (tanpa `source_area`) tetap menjaga aturan baku `isPickingEligibleForPengecekan` (Priority 1 & 2).

---

## v2.29.1 — 24 November 2026
**Modul**: Optimasi PostgREST Egress Lintas Layanan (`gasTarikanMD.ts`, `settings.ts`, `supabase.ts`, `gasManualShipment.ts`, `DistribusiStoreTab.tsx`, `QcPengerjaanTab.tsx`, `PickingTasksView.tsx`, `DashboardView.tsx`, `useInventoryStock.ts`, `App.tsx`) + Upgrade Skill (`.agents/skills/wms-supabase-egress-guardrails/SKILL.md`)
- **Audit & Perbaikan Kebocoran PostgREST Egress (`279.481 MB/hari`)**:
  - **`pengecekan_sj` (~14.5 MB selected / ~28.88 MB raw per fetch, 794 baris)**: Menambahkan SWR 60s, in-flight deduplication, dan **IndexedDB Delta Watermark Sync** (`pengecekan_sj_sync_watermark_v1` berbasis `updated_at` + `count=exact`) di `gasTarikanMD.ts` sehingga load ulang saat data tidak berubah hanya menarik **~150 byte**; menambahkan lazy-load di `QcPengerjaanTab.tsx` (hanya fetch saat `qcMode === 'MUTASI'`) serta cooldown 60s di `DistribusiStoreTab.tsx`.
  - **`wms_settings` (`392.7 KB`) & `recount_audit_results` (`112.9 KB`)**: Menambahkan watermark gate `updated_at` (~150B), snapshot cache lokal (`LS_SETTINGS_SNAPSHOT_KEY`), SWR 2 menit untuk `fetchRecountAuditMapFromCloud`, dan in-flight dedup di `settings.ts`.
  - **`PickingTasksView.tsx` Polling 60s (`279.4 KB/call`)**: Mengganti blind fetch `picking_list?limit=800` setiap 60s dengan **probe signature ringan ~200B** (`status=neq.SELESAI` + 1 row `created_at.desc`); full fetch hanya dijalankan saat signature berubah.
  - **`penerimaan_produksi` (`~780 KB`) & `manual_shipment` (`159 KB`)**: Menambahkan `fetchSupabaseWatermark` (`id` + `count=exact` untuk `penerimaan_produksi` karena tanpa kolom `updated_at`; `updated_at` + `count=exact` untuk `manual_shipment` dengan SWR 2m).
  - **`master_produk` (`~7.5 MB`), `stok_real_fisik` (`~1.2 MB`), & Throttling Event/KPI**: Menambahkan proteksi cooldown 6 jam (`wms_master_synced_cloud_count`, `wms_master_last_full_sync_at`) di `syncSmartLowEgressCache`, hidrasi memory cache di `useInventoryStock.ts` pada event `wms_full_locations_refreshed`/`wms_catalog_updated`, cooldown 90s antrean KPI di `DashboardView.tsx`, dan throttle 15s pada `checkNewStoreOrdersDelta` (`App.tsx`).
- **Continuous Skill Upgrade**:
  - Membuat skill baru `.agents/skills/wms-supabase-egress-guardrails/SKILL.md` dan memperbarui `GEMINI.md` (`§2`) serta `docs/memory/WMS_FEATURE_REGISTRY.md`.

---

## v2.29.0 — 24 November 2026
**Modul**: Renovasi Total Rekap Tagihan JNE (`src/components/JneRekapView.tsx`, `src/services/jneRekapService.ts`, `src/services/jneRekapParser.ts`, `gas/jne_tagihan_backend.js`, `src/services/permissions.ts`, `.agents/skills/wms-jne-rekap-guardrails/SKILL.md`)
- **Sinkronisasi 2 Arah Murni ke Google Sheets `JNEMember` (`gid=1026608111`)**:
  - Merombak `gas/jne_tagihan_backend.js` & `jneRekapService.ts` agar terhubung langsung ke tab operasional `JNEMember` (`1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k`, kolom `A..K`: `No`, `Cnote No`, `Deskripsi pengiriman`, `Services`, `Receiver Name`, `Destination`, `Shipper Name`, `Amount`, `Tanggal Pengiriman`, `Agen`) lengkap dengan fallback baca JSON `gviz` bila endpoint GAS sedang sibuk.
  - Menjaga presisi format sel GSheet: `Cnote No` diformat `@` teks sebelum tulis agar angka `0` di depan (`0137900...`) tidak terpotong, `Services` dipertahankan utuh (`CTC23`, `REG23`, `CTCYES23`, `YES23`), `Amount` disimpan sebagai angka berformat `"Rp   "#,##0`, dan `Tanggal Pengiriman` disimpan sebagai objek `Date` (`dd/mm/yyyy`).
  - **Kolom D (`Deskripsi pengiriman`) 2-Way Safe**: Mendukung klik langsung (*inline spreadsheet edit* + tombol `Enter` simpan & otomatis turun ke baris berikutnya) serta **Isi Kolom D Massal**, menulis spesifik ke sel `D{baris}` di GSheet tanpa merusak kolom lain maupun menimpa isi Kolom D existing saat import resi baru.
- **4 Jalur Penambahan Data & AI Vision Parser dengan Tabel Staging**:
  - Mendukung **Import Excel/CSV (`.xlsx/.xls/.csv`)**, **Lampiran Gambar / Screenshot (`.png/.jpg/.webp` & `Ctrl+V` langsung di halaman menggunakan Gemini Vision `/api/ai` + fallback OCR)**, **PDF (`.pdf`)**, **Input Manual Satuan**, dan **Tempel Baris Spreadsheet**.
  - Seluruh hasil ekstraksi masuk ke **Tabel Pratinjau (Staging)** dengan deteksi status `BARU` vs `ADA` di GSheet serta sel yang bisa dikoreksi sebelum disimpan.
- **Aksi Edit Lengkap & Hapus Baris GSheet untuk Admin & Warehouse + Standar UI 2-Mode**:
  - Menambahkan helper `canManageJneRekap` di `src/services/permissions.ts` serta endpoint `updateRecord` dan `deleteRecords` (penghapusan blok *bottom-to-top* aman indeks) khusus akun **Admin & Warehouse**.
  - Merombak `JneRekapView.tsx` mengikuti standar WMS 2-Mode (`Tabel` Desktop + Compact List-Table Mobile zero horizontal scroll & `Kartu` Single-Elevation), `AppActionSheet` (`1 Primary CTA + ⋯`), tab kategori swipeable, dan paginasi cepat.

---

## v2.28.2 — 23 November 2026
**Modul**: Tugas Picking Completion & Outbox Sync (`src/services/supabase.ts`, `src/services/scannerOutboxService.ts`) + Upgrade Skill & SOP Agen (`.agents/skills/`, `GEMINI.md`, `docs/memory/`)
- **Fix Bug Baris Terakhir Nyangkut `SEDANG PICKING` saat Selesai SJ (`TO.OMP.26.11.00356`)**:
  - Memperbaiki `completePickingSuratJalanSupabase` dan `syncAllPickingOutboxBatches` agar update per-item ke `picking_list` tidak lagi berjalan serial 1-per-1 yang lambat dan rentan terputus di item terakhir: kini memakai **bounded parallel chunks (`CONCURRENCY = 8`) + retry 1x** serta **mandatory SJ-wide safety sweep (`no_sj=ilike.<SJ>&status=neq.SELESAI` → `SELESAI`)** sehingga mustahil ada baris tertinggal/terduplikasi nyangkut.
  - Membersihkan 1 baris nyangkut pada `TO.OMP.26.11.00356` (`id=1795437550660065`, SKU `F26ITO811BN`, `qty_picked=0`) di Supabase menjadi `SELESAI` (total 66/66 baris kini konsisten `SELESAI`, `78 / 80 pcs`, dan sisa `2 pcs` siap diambil melalui fitur `Lanjutkan Sisa`).
- **Continuous Skill Upgrade untuk Seluruh Agen Coding**:
  - Menanamkan skill guardrail baru `.agents/skills/wms-picking-completion-sync-guardrails/SKILL.md` (invarian completion SJ-wide sweep, Lanjutkan Sisa Picking, live `stok_real_fisik` regeneration, & anti-double `#OUT` delta).
  - Menyelaraskan `.agents/skills/pre-task-sync/SKILL.md`, `.agents/skills/auto-deploy/SKILL.md`, `GEMINI.md` (`§3`, `§5`, `§14`), dan `docs/memory/WMS_FEATURE_REGISTRY.md` agar setiap temuan perbaikan bug maupun fitur baru wajib memperbarui skill & memori permanen sebelum rilis.

---

## v2.28.1 — 23 November 2026
**Modul**: Supabase Core (`supabase.ts`), Kapasitas Rak (`rackCapacityService.ts`), Putaway (`putawayService.ts`), Denah 3D (`Warehouse3DVisualTab.tsx`), Alur Sistem (`SystemWorkflow.tsx`)
- **Fix `Error fetching system docs: TypeError: Failed to fetch` & Optimasi Egress `wms_system_docs`**:
  - Mengubah `getSystemDocs(sectionId?)` agar mendukung filter langsung per `section_id` (`section_id=eq.<key>&limit=1`) dengan SWR cache memori 60 detik serta fallback non-fatal (`console.warn`) saat jaringan terganggu.
  - Memperbarui seluruh pemanggil (`fetchRackCapacityConfig`, `fetchPutawayTasks`, `Warehouse3DVisualTab`, `SystemWorkflow`) agar hanya mengambil 1 dokumen targetnya masing-masing (tidak lagi menarik seluruh 100 dokumen besar `wms_system_docs` termasuk arsip Live Chat & audit recount setiap kali Dashboard dibuka).

---

## v2.28.0 — 23 November 2026
**Modul**: Tugas Picking (`PickingTasksView.tsx`, `supabase.ts`, `scannerOutboxService.ts`, `types.ts`) & Dashboard Utama (`DashboardView.tsx`)
- **Fitur Lanjutkan Sisa Picking (`Lanjutkan Sisa`) + Regenerasi Lokasi Live + Anti-Double `#OUT`**:
  - Menambahkan tombol **"Lanjutkan Sisa (N)"** pada kartu SJ berstatus `SELESAI (SEBAGIAN)` / `SELESAI (0 PCS)` (dan di footer modal `Detail Rekap`) yang dapat diklik oleh siapa pun yang memiliki akses Tugas Picking.
  - **Mode Sisa-Saja (Zero Double Picking)**: Saat sesi lanjutan dibuka, item yang sudah 100% terambil di sesi awal otomatis disembunyikan dan item parsial hanya menampilkan sisa kekurangannya (`0 / Sisa Pcs`, hero badge `AMBIL SISA N PCS`, dengan proteksi floor `prev_qty_picked` sehingga hasil sesi awal tidak bisa terhapus/ter-reset ke 0).
  - **Regenerasi Lokasi Rak Live Terupdate**: Menambahkan `reopenRemainingPickingSJSupabase` & `pickPrimaryFreshWarehouseLocation` di `src/services/supabase.ts` yang otomatis memanggil `fetchStockForSkus` langsung dari `stok_real_fisik` untuk memperbarui lokasi rak terbaru (tidak memakai lokasi lama yang berpotensi basi), ditambah tombol **Refresh Lokasi** on-demand di header sesi picking aktif.
  - **Proteksi Anti-Double Deduction `log_produk`**: Menambahkan `fetchLoggedOutQtyBySkuForSj` di `src/services/supabase.ts` dan menyelaraskan `completePickingSuratJalanSupabase` serta `syncAllPickingOutboxBatches` (`scannerOutboxService.ts`) agar penyelesaian sesi lanjutan hanya mencatat selisih tambahan (`delta OUT`) yang baru terambil ke `log_produk`.
  - Menambahkan broadcast realtime `sj_reopened` dan pembersihan otomatis `wms_completed_sjs_set` agar SJ lanjutan langsung sinkron lintas perangkat tanpa kembali ke status `SELESAI`.
- **Penyelarasan Tabel "Mutasi Stok Terkini" di Dashboard Utama (`DashboardView.tsx`)**:
  - Memindahkan kartu **Mutasi Stok Terkini** menjadi panel lebar penuh di bawah baris 2-kolom `Jadwal & Agenda` + `Proyek Berjalan`, dengan tampilan tabel seragam persis `MutasiLogView.tsx` (Desktop 7 kolom: `Produk & SKU`, `Tipe & Waktu`, `Invoice` + tombol salin + sumber WA/Web, `Area & Lokasi` + `AreaBadge`, `Qty`, live `Stok` rak, `Operator`; Mobile 4 kolom compact pas layar tanpa horizontal scroll).
  - Menggunakan lookup Master Produk (`resolveProductName` & `resolveProductDisplaySize` dengan `O(1)` `dashboardCatalogMap`) dan live `stockBySkuLocMap` sambil menjaga egress minimal (`limit=12`, menampilkan 10 log mutasi fisik terakhir).

---

## v2.27.0 — 22 November 2026
**Modul**: Manual Shipment & Alteration (`BulkUpdateSjModal.tsx`, `RekapToolbar.tsx`, `ManualShipmentTab.tsx`, `gasManualShipment.ts`, `orderChatNotificationService.ts`, `initialStoreFaq.ts`)
- **Fitur Input No. SJ DealPOS Massal (`SJ Massal`) untuk Produk Fulfillment Marketplace / Gudang**:
  - Menambahkan modal `BulkUpdateSjModal.tsx` (khusus Admin WH, akses via tombol outline netral **"SJ Massal"** beserta badge jumlah antrean di samping tombol primer **"Resi Massal"** pada `RekapToolbar.tsx`).
  - Menampilkan daftar lengkap **No. Pesanan** beserta rincian **produk aktif fulfillment Marketplace/Gudang** (`SKU`, nama & size resmi Master Produk via `lookupProductBySku`, `qty`, badge alter, status SJ) yang perlu dibuatkan No. SJ Delivery DealPOS.
  - Menyediakan filter `Belum Ada SJ` vs `Semua MKT`, filter **Store** (dengan hitungan pending per toko untuk mempermudah pembuatan 1 Transfer Order DealPOS per Store), pencarian bebas (`#order`, `SKU`, `nama produk`, `store`, `no SJ`), pilihan multi-baris + **Terapkan 1 No. SJ ke X Pesanan**, **Tempel SJ Berurutan**, **Salin Daftar Produk** (dikelompokkan per Store), serta tab **Import CSV & Template** (unduh template lengkap kolom rincian produk Marketplace + pratinjau validasi upload).
  - Menambahkan `bulkUpdateOrdersSjDealpos` di `src/services/gasManualShipment.ts` (update batch paralel ke Supabase + validasi tolak No. SJ yang sama dengan `no_transaksi_pengirim` kasir Store) dan `notifyBulkSjMarketplaceUpdatedToChat` di `src/services/orderChatNotificationService.ts` (notifikasi ringkasan terkelompok per Store di Live Chat WMS).
  - Menyelaraskan `pendingSjCount` dan filter `filterDealposSj` di `ManualShipmentTab.tsx` agar mengecualikan pesanan `batal` serta item `sold_out`/`cancelled` menggunakan `isMarketplaceFulfillmentItem`, dan menyinkronkan panduan role-aware di `src/data/initialStoreFaq.ts`.

---

## v2.26.0 — 22 November 2026
**Modul**: Manual Shipment, Alteration & Repair, Tugas Picking (`gasManualShipment.ts`, `ManualShipmentTab.tsx`, `AlterationRepairTab.tsx`, `PickingTasksView.tsx`, `supabase.ts`, `initialStoreFaq.ts`)
- **Auto-Create Tugas Picking untuk Item Fulfillment Marketplace / Gudang**:
  - Menambahkan `syncAutoPickingTaskForManualOrder`, `isMarketplaceFulfillmentItem`, dan `removePendingAutoPickingTask` di `src/services/gasManualShipment.ts`.
  - Setiap submit pesanan **Manual Shipment** yang memiliki item ber-fulfillment `Marketplace` (atau `Gudang`/`Warehouse`) dan setiap submit **Alteration & Repair** bersumber `Stok Gudang` otomatis membuat baris Tugas Picking di Supabase `picking_list` (kategori `Manual shipment/alter`) dengan agregasi qty per SKU, lookup nama & size Master Produk (`lookupProductBySku`), dan lookup live lokasi rak prioritas (`isWarehouseLocation` + `getPickingPriority`, mengecualikan Perbaikan & Anomali).
  - Sinkronisasi aman saat **Edit**, **Sold Out / Pulihkan**, **Batalkan**, dan **Hapus** pesanan: **hanya** memperbarui/menghapus tugas yang sudah ada & masih `PENDING` (`qty_picked = 0`). Tidak pernah membuat tugas picking baru secara retroaktif untuk pesanan lama maupun menimpa tugas yang sudah `SEDANG PICKING`/`SELESAI`.
  - Memperbarui klasifikasi kategori `MANUAL_ALTER` di `PickingTasksView.tsx` agar mencakup prefix `MS{KODE}-` dan `AR-`, menjaga guard `isStoreTujuan` agar tugas picking gudang tidak tertimpa label store, serta menyinkronkan event `wms_picking_list_updated` agar tab Tugas Picking keep-alive langsung termuat tanpa refresh.
  - Menyinkronkan panduan role-aware di `src/data/initialStoreFaq.ts` (perspektif terpisah Admin Gudang & Tim Store).

---

## v2.25.0 — 22 November 2026
**Fokus**: Fondasi Memori Permanen Global Semua Modul & Upgrade Full-Coverage Asisten AI WMS
- **Memori Permanen Global & Sinkronisasi Lintas Agen GitHub (`docs/memory/`, `docs/plans/`, `docs/PENDING_PLANS.md`, `GEMINI.md`, `tools/bump_version.cjs`)**:
  - Membuat `docs/memory/WMS_FEATURE_REGISTRY.md` (peta lengkap 25 modul tertanam WMS), `docs/memory/WMS_MODULE_CHANGELOG.md`, dan `docs/memory/AI_CAPABILITY_GAPS.md`.
  - Membuat dokumen handoff `docs/plans/PRD_PLAN_AI_FULL_COVERAGE_DAN_MEMORI_PERMANEN_SYNC.md` dan mendaftarkannya di `docs/PENDING_PLANS.md` (dengan relative link GitHub-portable) sebagai panduan eksekusi & verifikasi live untuk Antigravity.
  - Merapikan `GEMINI.md` agar ringkas (~11 KB, di bawah batas pemotongan 24 KB), menghapus duplikasi section, dan menetapkan protokol sinkronisasi memori 2 arah (**AI Studio <-> GitHub <-> Antigravity**).
  - Menambahkan validasi `permanentMemoryReady` dan `openAiCapabilityGaps` ke `tools/bump_version.cjs verify-release`.
- **AI Self-Reporting Capability Gap (`src/services/wmsAiGapReportService.ts`, `tools/pull_ai_dev_reports.cjs`)**:
  - Menambahkan penyimpanan backlog laporan tugas yang belum bisa dieksekusi AI ke Supabase (`wms_system_docs` -> `wms_ai_capability_gaps_index`) dengan SWR cache 60 detik, deduplikasi otomatis (`occurrences++`), dan batas 100 item hemat egress.
  - Membuat CLI `tools/pull_ai_dev_reports.cjs` untuk menarik backlog dari Supabase ke `docs/memory/AI_CAPABILITY_GAPS.md` serta mendukung `--resolve <GAP-ID> "<catatan>"`.
  - Menambahkan panel **Backlog Dev** di `WmsAiModal.tsx` (status toggle Open/Selesai, unduh `.md`) serta kartu konfirmasi laporan langsung di bubble chat AI.
- **Full-Coverage WMS AI Skills & Export CSV (`src/services/wmsAiExtendedTools.ts`, `src/services/wmsAiService.ts`, `src/utils/aiReportExporter.ts`, `src/components/ai/WmsAiModal.tsx`, `src/App.tsx`)**:
  - Menambahkan **10 tool baru** lintas modul: `query_wms_knowledge_and_sop`, `query_loading_dock_and_packing`, `query_distribusi_and_pengiriman`, `query_all_order_channels`, `query_so_and_putaway`, `query_store_help_tickets`, `get_executive_daily_summary`, `validate_items_against_master`, `open_wms_module_shortcut`, dan `report_ai_capability_gap`.
  - Menambahkan **Export CSV (`.csv` UTF-8 BOM)** dan **Export Markdown (`.md`)** melengkapi Excel (`.xlsx`) dan PDF (`.pdf`) pada tabel inline chat dan kartu laporan AI.
  - Menyambungkan `onNavigateToPage` dari `src/App.tsx` ke `WmsAiModal.tsx` untuk tombol pintasan navigasi modul 1 klik.

---

## v2.24.9 — 22 November 2026
**Modul**: Penerimaan Produksi (`ProduksiSpreadsheetView.tsx`, `PenerimaanProduksiView.tsx`)
- Mengganti dropdown filter SJ pada Riwayat Produksi tampilan Spreadsheet menjadi **Filter Range Tanggal** (`Dari s/d Sampai`) yang responsif: inline di Desktop dan Native Slide-Up Bottom Sheet dengan preset cepat (*Hari Ini*, *7 Hari*, *30 Hari*, *Bulan Ini*) di HP Seluler.

---

## v2.24.8 — 22 November 2026
**Modul**: Scanner Kamera Barcode (`CameraScanner.tsx`)
- Memperbaiki prioritas pemilihan kamera default agar **selalu otomatis memilih `camera 0` (kamera belakang utama)** saat dibuka, menyortir daftar dropdown berdasarkan prioritas kamera belakang utama, dan menyinkronkan `selectedCameraId` dengan track video aktif.
