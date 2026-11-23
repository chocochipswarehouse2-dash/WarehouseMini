# WMS Module Changelog — Riwayat Permanen Revisi & Penambahan Fitur

> **Aturan Wajib Semua Agen Coding**: Setiap kali ada penambahan fitur baru, perbaikan bug penting, atau perubahan alur/UI di modul mana pun, tambahkan entri baru di bagian **paling atas** file ini sebelum menjalankan `bump_version.cjs` dan build.

---

## v2.26.0 — 22 November 2026
**Modul**: Manual Shipment, Alteration & Repair, Tugas Picking (`gasManualShipment.ts`, `ManualShipmentTab.tsx`, `AlterationRepairTab.tsx`, `PickingTasksView.tsx`, `supabase.ts`, `initialStoreFaq.ts`)
- **Auto-Create Tugas Picking untuk Item Fulfillment Marketplace / Gudang**:
  - Menambahkan `syncAutoPickingTaskForManualOrder`, `isMarketplaceFulfillmentItem`, dan `removePendingAutoPickingTask` di `src/services/gasManualShipment.ts`.
  - Setiap submit pesanan **Manual Shipment** yang memiliki item ber-fulfillment `Marketplace` (atau `Gudang`/`Warehouse`) dan setiap submit **Alteration & Repair** bersumber `Stok Gudang` otomatis membuat baris Tugas Picking di Supabase `picking_list` (kategori `Manual shipment/alter`) dengan agregasi qty per SKU, lookup nama & size Master Produk (`lookupProductBySku`), dan lookup live lokasi rak prioritas (`isWarehouseLocation` + `getPickingPriority`, mengecualikan Perbaikan & Anomali).
  - Sinkronisasi aman saat **Edit**, **Sold Out / Pulihkan**, **Batalkan**, dan **Hapus** pesanan: hanya memperbarui/menghapus tugas yang masih `PENDING` (`qty_picked = 0`), serta melindungi penuh tugas yang sudah `SEDANG PICKING` atau `SELESAI`.
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
