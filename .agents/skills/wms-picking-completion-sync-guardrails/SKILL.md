---
name: wms-picking-completion-sync-guardrails
description: Guardrails, invariants, regression checklist, and bug log for Antrean Tugas Picking (Bounded parallel completion + SJ-wide orphan status sweep, Lanjutkan Sisa Picking with live stok_real_fisik location regeneration, Anti-Double #OUT delta logging, and multi-user sync). Mandatory read & update on every change or bug fix in PickingTasksView, supabase picking functions, or scannerOutboxService picking sync.
---

# WMS Picking Completion, Continuation & Sync Guardrails

**WAJIB DIBACA & DIPERBARUI** oleh setiap agent sebelum/sesudah menyentuh:
- `src/components/PickingTasksView.tsx` (View 1 Antrean, View 2 Sesi Aktif, `handleContinueRemainingSJ`, `handleRefreshActiveLiveLocations`, `handleConfirmFinishSJ`, Realtime broadcast `sj_reopened`)
- `src/services/supabase.ts` (`completePickingSuratJalanSupabase`, `reopenRemainingPickingSJSupabase`, `fetchLoggedOutQtyBySkuForSj`, `pickPrimaryFreshWarehouseLocation`, `syncSinglePickingItemRealtimeSupabase`, `fetchPickingListFromSupabase`)
- `src/services/scannerOutboxService.ts` (`syncAllPickingOutboxBatches`, `enqueuePickingOutboxBatch`)
- `src/types.ts` (`PickingListItem`, `PickingSuratJalanGroup`)

---

## 1. Invarian Wajib (HARD CONSTRAINTS — JANGAN PERNAH DILANGGAR)

### A. Penyelesaian SJ (`SELESAI`) Bebas Baris Nyangkut (Zero Orphan Row)
1. **DILARANG Loop `PATCH` Serial Panjang Tanpa Sweep Akhir**:
   - Baik `completePickingSuratJalanSupabase` (`src/services/supabase.ts`) maupun `syncAllPickingOutboxBatches` (`src/services/scannerOutboxService.ts`) **WAJIB** menjalankan update `picking_list` per item secara **paralel berbatas (`PATCH_CONCURRENCY = 8`)** dengan retry otomatis saat gagal sementara — **tidak boleh** loop serial 1-per-1 yang memakan puluhan detik dan rawan putus di item terakhir.
2. **Mandatory SJ-Wide Safety Sweep (`status=neq.SELESAI`)**:
   - Setelah seluruh patch per-item berhasil, **WAJIB** menjalankan 1x batch `PATCH` cakupan SJ (`no_sj=ilike.<NO_SJ>&status=neq.SELESAI` → `{ status: 'SELESAI', picker_name }`).
   - Tujuannya menjamin **0 baris tertinggal** di status `PENDING` atau `SEDANG PICKING` (termasuk bila ada baris kembar SKU yang ter-deduplikasi saat fetch, atau baris straggler dari sesi gabungan).

### B. Lanjutkan Sisa Picking (`reopenRemainingPickingSJSupabase`)
3. **Akses Terbuka untuk Tim Picking & Sisa-Saja (Zero Double Picking)**:
   - SJ berstatus `SELESAI` yang masih memiliki item kurang (`qty_picked < qty_req`) dapat diklik **`Lanjutkan Sisa`** oleh siapa pun yang memiliki akses Tugas Picking.
   - Item yang sudah 100% terambil pada sesi awal **WAJIB** disembunyikan dari daftar aktif; item parsial hanya menampilkan sisa targetnya (`0 / Sisa Pcs`, `AMBIL SISA N PCS`).
   - Nilai minimum `qty_picked` dikunci minimal sebesar `prev_qty_picked` sehingga hasil scan sesi sebelumnya tidak dapat ter-reset atau terhapus oleh operator sesi lanjutan.
4. **Regenerasi Lokasi Rak Live Wajib dari `stok_real_fisik`**:
   - Membuka ulang sisa picking (`reopenRemainingPickingSJSupabase`) maupun klik **Refresh Lokasi** (`handleRefreshActiveLiveLocations`) **WAJIB** memanggil `fetchStockForSkus` terbaru dari `stok_real_fisik` (memprioritaskan Warehouse → Aksesoris → Transit → Kolian → Blok F, serta selalu mengecualikan area Perbaikan & Anomali). **DILARANG** memakai lokasi lama yang mungkin sudah berubah selama jeda picking.
5. **Sinkronisasi Status Lintas Perangkat (`wms_completed_sjs_set`)**:
   - `reopenRemainingPickingSJSupabase` wajib menghapus `no_sj` dari `wms_completed_sjs_set` dan memancarkan broadcast realtime `sj_reopened`.
   - `fetchPickingListFromSupabase` wajib membersihkan `no_sj` dari `wms_completed_sjs_set` apabila Supabase mengembalikan baris non-`SELESAI` dan SJ tersebut tidak sedang antre di `wms_picking_outbox_v1`.

### C. Proteksi Ledger Stok (`log_produk` `#OUT`) & Multi-User
6. **Anti-Double `#OUT` Delta Calculation**:
   - Baik jalur online (`completePickingSuratJalanSupabase`) maupun jalur antrean offline (`syncAllPickingOutboxBatches`) **WAJIB** menghitung total `#OUT` yang sudah pernah dicatat di `log_produk` per `(invoice, sku)` melalui `fetchLoggedOutQtyBySkuForSj` / pre-flight query, lalu **hanya menyisipkan selisih tambahan (`deltaQty = pickedQty - alreadyOut`)** dengan keterangan `(Lanjutan)` bila `alreadyOut > 0`.
7. **Pelacakan Kolaborasi Multi-User**:
   - Selama sesi live, `syncSinglePickingItemRealtimeSupabase` mencatat actor terakhir di belakang daftar `picker_name` (`mergePickerNamesWithLastActor`). Saat penyelesaian SJ, seluruh participating pickers digabung (`finalPickerName`) ke `picking_list.picker_name` dan `log_produk.operator`.

---

## 2. Checklist Regresi (Wajib Diverifikasi Setiap Perubahan Picking)

- [ ] Menyelesaikan SJ dengan jumlah item besar (misal 50–100+ baris): semua baris di `picking_list` menjadi `SELESAI` (**0 baris tersisa `SEDANG PICKING` atau `PENDING`**).
- [ ] Klik `Lanjutkan Sisa` pada SJ `SELESAI (SEBAGIAN)`: item yang sudah lunas tidak muncul; item parsial hanya menampilkan sisa kekurangan; lokasi rak terupdate dari live `stok_real_fisik`.
- [ ] Menyelesaikan sesi lanjutan: `log_produk` hanya bertambah sejumlah **delta baru**, tidak memotong ulang qty sesi pertama (baik saat online maupun lewat outbox offline).
- [ ] Perangkat kedua tidak memaksa SJ lanjutan kembali ke status `SELESAI` karena `wms_completed_sjs_set` otomatis terbersihkan saat `fetchPickingListFromSupabase`.

---

## 3. Log Bug & Pembaruan (WAJIB DIUPDATE SETIAP ADA BUG/PERBAIKAN/UPDATE)

| Tanggal | Versi | Ringkasan Perubahan / Bug yang Ditemukan & Diperbaiki |
|---|---|---|
| 2026-11-23 | `v2.28.0` | Rilis fitur **Lanjutkan Sisa Picking** (`reopenRemainingPickingSJSupabase`, sisa-saja tanpa double picking, floor `prev_qty_picked`, regenerasi lokasi rak live `stok_real_fisik` + tombol `Refresh Lokasi`, anti-double `#OUT` delta via `fetchLoggedOutQtyBySkuForSj`, serta sinkron `sj_reopened`). |
| 2026-11-23 | `v2.28.2` | **Fix Bug Baris Terakhir Nyangkut `SEDANG PICKING` (Kasus `TO.OMP.26.11.00356`)**: Pada SJ 66 item, loop serial `PATCH` sebelumnya terputus di item ke-66 (`F26ITO811BN`), sehingga 65 item & `#OUT` selesai namun 1 baris tertinggal di `SEDANG PICKING` (membuat seluruh kartu SJ tampak masih dikerjakan oleh Vina Kharisma meski sudah lanjut ke SJ `00357` & `00358`). Diperbaiki dengan **parallel chunked PATCH (`CONCURRENCY = 8`) + retry 1x + SJ-wide safety sweep (`status=neq.SELESAI`)** di `completePickingSuratJalanSupabase` dan `syncAllPickingOutboxBatches`, serta pembersihan 1 baris nyangkut di Supabase. |
