# 📋 Daftar Plan & Fitur Pending Review (WMS Inventory)

File ini menyimpan daftar rencana implementasi (*Implementation Plans*) dan PRD yang sudah dirancang namun **belum direview / belum dieksekusi** karena dialihkan ke pekerjaan lain terlebih dahulu.

> **Instruksi untuk Agent**:
> Setiap kali menyelesaikan suatu task atau ketika user beralih mengerjakan hal lain, cek tabel di bawah ini. Jika masih ada plan berstatus **`⏳ PENDING REVIEW`**, selipkan pengingat singkat 1-2 baris di bagian akhir respons kepada user. Saat sebuah plan sudah selesai dikerjakan, ubah statusnya menjadi **`✅ SELESAI`**.

| No | Judul Plan / Fitur | Lokasi Dokumen Plan | Tanggal Dibuat | Status |
| :-: | :--- | :--- | :---: | :---: |
| 1 | **Auto-Lookup Nama Produk, UP & Foto Produksi dari Data Trello UP** (Input Penerimaan, Submit & Tabel Spreadsheet Produksi CMT/Kargo dengan pencocokan Kode & Kemiripan Gambar) | [`docs/plans/PLAN_AUTO_LOOKUP_PRODUKSI_TRELLO.md`](./plans/PLAN_AUTO_LOOKUP_PRODUKSI_TRELLO.md) | 2026-11-08 | `✅ SELESAI` |
| 2 | **PRD & Plan: Modul Fulfilment Pesanan Online (Jalur C)** (Semi-manual multi-marketplace: impor pesanan, batch picking list, scan-pack, handover kurir) | [`docs/plans/PRD_PLAN_FULFILMENT_PESANAN_ONLINE_JALUR_C.md`](./plans/PRD_PLAN_FULFILMENT_PESANAN_ONLINE_JALUR_C.md) | 2026-11-08 | `🚧 IN PROGRESS (Fase 1)` |
| 3 | **Asisten AI Cerdas WMS Inventory (Google Gemini Flash)** (Tanya stok, nama SKU, kode produksi & buat rekap laporan via Natural Language) | [`docs/plans/PLAN_WMS_AI_ASSISTANT.md`](./plans/PLAN_WMS_AI_ASSISTANT.md) | 2026-11-10 | `✅ SELESAI` |
| 4 | **PRD & Plan: Optimasi Full-Coverage Asisten AI WMS, AI Self-Reporting Backlog & Sinkronisasi Memori Permanen Lintas Agen (GitHub)** (Kode baseline `v2.25.0` selesai ditulis; pending uji live Supabase/AI, selaras skill lokal, commit/push GitHub & deploy Vercel oleh Antigravity) | [`docs/plans/PRD_PLAN_AI_FULL_COVERAGE_DAN_MEMORI_PERMANEN_SYNC.md`](./plans/PRD_PLAN_AI_FULL_COVERAGE_DAN_MEMORI_PERMANEN_SYNC.md) | 2026-11-22 | `⏳ PENDING EXECUTION (ANTIGRAVITY)` |
| 5 | **PRD & Plan: Penggabungan Modul Pusat Barcode Produk & CSV (Master, DealPOS & Distribusi)** (Konsolidasi Cetak Barcode, CSV Barcode, & CSV Distribusi menjadi 4 sumber data menuju 1 antrean & mesin cetak terpadu yang role-aware) | [`docs/plans/PRD_PLAN_MERGE_BARCODE_PRODUK_CSV.md`](./plans/PRD_PLAN_MERGE_BARCODE_PRODUK_CSV.md) | 2026-11-23 | `⏳ PENDING REVIEW` |
