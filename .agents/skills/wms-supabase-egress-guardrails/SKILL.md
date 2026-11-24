---
name: wms-supabase-egress-guardrails
description: Guardrails, schema constraints, watermark/SWR/dedup patterns, measured payload benchmarks, and bug log for minimizing Supabase PostgREST Egress across all WMS modules. Mandatory read & update whenever adding/modifying Supabase fetches, polling intervals, caches, or heavy table queries.
---

# WMS Supabase PostgREST Egress Guardrails

**WAJIB DIBACA & DIPERBARUI** oleh setiap agent sebelum/sesudah menyentuh:
- Query `supabaseFetch` / REST fetch ke tabel besar (`pengecekan_sj`, `picking_list`, `penerimaan_produksi`, `manual_shipment`, `wms_settings`, `wms_system_docs`, `master_produk`, `stok_real_fisik`, `qc_reports`)
- SWR / IndexedDB / `localStorage` cache & `fetchSupabaseWatermark` (`src/services/supabase.ts`, `src/services/gasTarikanMD.ts`, `src/services/settings.ts`, `src/services/gasManualShipment.ts`)
- Polling interval, Realtime/visibility/focus listener, event bus (`wms_full_locations_refreshed`, `wms_catalog_updated`, `wms_inventory_updated`), atau lazy-loading tab (`QcPengerjaanTab`, `DistribusiStoreTab`, `PickingTasksView`, `DashboardView`, `App.tsx`)

---

## 1. Benchmark Ukuran Payload Terukur (Live Supabase, 23 Nov 2026)

| Tabel / Endpoint | Volume / Baris | Payload Tanpa Optimasi | Pola Hemat Egress Wajib |
|---|---:|---:|---|
| `pengecekan_sj` | ~794 baris | **28.88 MB** (`select=*`) / **~14.5 MB** (`PENGECEKAN_SJ_COLUMNS`) | SWR 60s + IndexedDB delta watermark (`updated_at` + `count=exact`) -> **~150B** bila unchanged |
| `master_produk` | ~29.885 SKU | **~7.5 MB** | IndexedDB `localDb.ts` + sync count & cooldown 6 jam (`wms_master_synced_cloud_count`, `wms_master_last_full_sync_at`) |
| `stok_real_fisik` | ~7.086 baris aktif | **~1.2 MB** | Memory cache (`getMemoryStokFisikCache`) + `reload(false)` saat background refresh selesai |
| `penerimaan_produksi` | ~1.548 baris | **~780 KB** | SWR 5m + watermark `id` & `count=exact` (`wms_local_penerimaan_watermark_v1`) |
| `wms_system_docs` | ~47 dokumen | **687.5 KB** (semua) / **112.9 KB** (`recount_audit_results`) | Filter wajib `section_id=eq.<key>&limit=1` + watermark `updated_at` (~120B) |
| `qc_reports` | ~669 baris | **496.9 KB** | Cache 5 menit (`LaporanQcView`) |
| `wms_settings` | 2 baris | **392.7 KB** (`katalog_manual_data` 203 KB + `recount_audit_map` 93.5 KB) | Watermark gate `updated_at` (~150B) + `LS_SETTINGS_SNAPSHOT_KEY` + dedup |
| `picking_list` | 7.841 total (`limit=800`) | **279.4 KB/call** | Probe ringan **~200B** pada polling 60s (`status=neq.SELESAI&limit=50` + `created_at.desc&limit=1`); full fetch hanya jika signature berubah |
| `manual_shipment` | 120 baris | **159.0 KB** | SWR 2 menit + watermark `updated_at` & `count=exact` |

---

## 2. Batasan Kolom Skema Nyata (Schema Column Constraints — KRITIS)

Jangan menebak kolom sebelum menulis query watermark/filter — query ke kolom yang tidak ada akan gagal HTTP 400:

| Tabel | Memiliki `updated_at`? | Kolom Watermark / Probe Valid | Catatan Skema |
|---|---|---|---|
| `pengecekan_sj` | ✅ Ya | `updated_at` + `Prefer: count=exact` | `items` JSONB sangat besar; gunakan delta `updated_at=gt.<wm>` saat count >= lokal |
| `manual_shipment` | ✅ Ya | `updated_at` + `Prefer: count=exact` | Prefix `RTR-` difilter ke `retur_barang` |
| `wms_settings` | ✅ Ya | `updated_at` | `saveWmsSettings` wajib menyinkronkan timestamp `LS_SETTINGS_UPDATED_AT_KEY` |
| `wms_system_docs` | ✅ Ya | `section_id=eq.<key>&select=updated_at&limit=1` | DILARANG fetch tanpa `section_id=eq.<key>` |
| `penerimaan_produksi` | ❌ **TIDAK** | `id` (`order=id.desc&limit=1`) + `Prefer: count=exact` | Wajib pakai `id` sebagai kolom urutan watermark |
| `picking_list` | ❌ **TIDAK** | `status=neq.SELESAI` (`select=id,no_sj,status,qty_picked,picker_name`) + `order=created_at.desc&limit=1` | Juga **TIDAK** memiliki kolom `area` |
| `stok_real_fisik` | ❌ **TIDAK (`id` juga TIDAK ada)** | — | Mutasi via `(sku, lokasi)` + SWR memory cache |

---

## 3. Invarian Wajib (HARD CONSTRAINTS — JANGAN PERNAH DILANGGAR)

1. **Watermark Gate Sebelum Full Fetch Tabel Sedang/Besar**:
   - Gunakan `fetchSupabaseWatermark(table, orderCol, extraFilter)` (~150 byte) sebelum menarik ulang payload > 100 KB (`pengecekan_sj`, `penerimaan_produksi`, `manual_shipment`, `wms_settings`, `recount_audit_results`) saat TTL cache lokal habis.
   - Bila `cloudCount === localCount && cloudLatestKey === localLatestKey`, kembalikan snapshot lokal tanpa menarik payload besar.
   - **Cache Invalidation Wajib**: Setiap fungsi mutasi (`save*`, `delete*`, `invalidate*Cache`) wajib memperbarui atau menghapus key watermark agar UI tidak menyajikan data basi.
2. **Concurrent In-Flight Deduplication**:
   - Fungsi fetcher bersama yang dapat dipanggil simultan oleh banyak komponen (`DashboardView`, `App.tsx`, `PickingTasksView`, `DistribusiStoreTab`, `fetchWmsSettings`, `fetchRecountAuditMapFromCloud`, `fetchPickingListFromSupabase`, `fetchPenerimaanProduksiFromSupabase`, `fetchPengecekanSJRecords`) wajib menyimpan `inflightPromise` agar hanya 1 request jaringan yang berjalan (kecuali mode bypass mutlak setelah write).
3. **Probe Ringan untuk Polling Interval (`PickingTasksView`)**:
   - Interval 60 detik atau latar belakang **DILARANG** menarik `picking_list?limit=800` (~280 KB) secara membabi buta.
   - Wajib lakukan 2 probe ringan (~200B total: item aktif `status=neq.SELESAI` + 1 row `created_at.desc`), dan jalankan full fetch hanya jika signature berubah.
4. **Lazy-Load Tab & Cooldown Event/Focus**:
   - Komponen ber-mode tab (`QcPengerjaanTab` mode `MUTASI`, `DistribusiStoreTab` tab `riwayat`) **DILARANG** memanggil fetch tabel berat (terutama `pengecekan_sj`) di luar mode/tab aktif saat mount.
   - Listener global (`visibilitychange` + `focus` di `App.tsx`, `wms_full_locations_refreshed` / `wms_catalog_updated` di `useInventoryStock.ts`) wajib memiliki throttle/cooldown dan tidak memicu network reload penuh `stok_real_fisik` (7.086 baris) bila cache memori baru saja disegarkan.
5. **Proteksi Cooldown Master Produk (`master_produk`)**:
   - `syncSmartLowEgressCache` di `src/services/supabase.ts` wajib menghormati `wms_master_synced_cloud_count` dan cooldown minimal 6 jam (`wms_master_last_full_sync_at`) sehingga perbedaan kecil (mis. 500–2000 row vs toleransi) tidak memicu full-sync ~7.5 MB berulang kali.

---

## 4. Checklist Regresi Egress (Wajib Cek Sebelum Merge / Release)

- [ ] Tidak ada query baru ke `wms_system_docs` tanpa `section_id=eq.<key>`.
- [ ] Tidak ada `select=*` tanpa batas pada tabel besar (`pengecekan_sj`, `log_produk`, `master_produk`, `stok_real_fisik`, `picking_list`).
- [ ] Polling / interval > 1x/menit hanya mengirim query probe <= 1 KB dan berhenti/lewat saat tidak ada perubahan watermark/signature.
- [ ] Mutasi (`save`/`update`/`delete`) tetap meng-update atau membersihkan watermark cache sehingga user langsung melihat data terbaru tanpa harus hard-reload.
- [ ] Di tab browser baru / cold start + refresh berulang, request `pengecekan_sj`, `wms_settings`, `recount_audit_results`, `penerimaan_produksi`, dan `manual_shipment` menjadi **~150B** saat data cloud tidak berubah.

---

## 5. Log Bug & Pembaruan Egress (WAJIB DIUPDATE SETIAP TEMUAN BARU)

| Tanggal | Versi | Ringkasan Temuan Kebocoran & Perbaikan |
|---|---|---|
| 2026-11-23 | `v2.28.1` | `getSystemDocs()` tanpa `section_id` menarik seluruh ~47 dokumen `wms_system_docs` (**687.5 KB**) berulang kali saat membuka Dashboard/Rak/Putaway/Denah 3D. Diperbaiki dengan filter `section_id=eq.<key>&limit=1` + SWR 60 detik. |
| 2026-11-24 | `v2.29.1` | **Audit PostgREST Egress 279.481 MB/hari (97.8% total egress)**: (1) `pengecekan_sj` **794 baris = 14.5 MB/fetch (~28.88 MB raw)** tanpa SWR/delta, terpanggil ganda di `DistribusiStoreTab` & unconditionally saat mount `QcPengerjaanTab` -> diperbaiki dengan SWR 60s + IndexedDB delta watermark (`pengecekan_sj_sync_watermark_v1`) + lazy-load `MUTASI` + dedup 60s; (2) `wms_settings` (**392.7 KB**) + `recount_audit_results` (**112.9 KB**) = **~505 KB/call** -> diperbaiki dengan watermark `updated_at` (~150B) + SWR 2m + dedup; (3) `PickingTasksView` polling 60s menarik **279.4 KB** saat idle -> diganti probe ~200B; (4) `penerimaan_produksi` (**~780 KB**) & `manual_shipment` (**159 KB**) ditambah watermark gate + SWR; (5) `DashboardView`, `App.tsx`, `useInventoryStock.ts`, & `syncSmartLowEgressCache` ditambah dedup/cooldown agar tidak re-fetch redundan `master_produk` (~7.5 MB) dan `stok_real_fisik` (~1.2 MB). |
