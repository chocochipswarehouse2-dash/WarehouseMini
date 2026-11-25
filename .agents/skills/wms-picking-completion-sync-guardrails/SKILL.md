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

### C. Proteksi Ledger Stok (`log_produk` `#OUT`), Multi-Lokasi Split & Atribusi Picker Per-Produk
6. **Anti-Double `#OUT` Delta Calculation + Multi-Location Split (`pick_splits`)**:
   - Baik jalur online (`completePickingSuratJalanSupabase`) maupun jalur antrean offline (`syncAllPickingOutboxBatches`) **WAJIB** menggunakan helper tunggal `buildOutLogEntriesForPickingItem` (`src/services/supabase.ts`) yang menghitung total `#OUT` yang sudah pernah dicatat di `log_produk` per `(invoice, sku)` melalui `fetchLoggedOutQtyBySkuForSj`, lalu **hanya menyisipkan selisih tambahan (`deltaQty`)** terpecah secara presisi per kombinasi `(lokasi, picker)` dari `item.pick_splits` (contoh: `1 pcs A001` + `1 pcs A002` menghasilkan 2 baris `#OUT` terpisah di `log_produk`).
   - Saat SJ diselesaikan (`SELESAI`), `picking_list.lokasi` menyimpan ringkasan multi-rak (`summarizePickSplitsLocations`, mis. `A001 (1), A002 (1)`), dan pada saat `Lanjutkan Sisa` (`reopenRemainingPickingSJSupabase`) kolom `lokasi` otomatis diregenerasi ulang menjadi rak tunggal live dari `stok_real_fisik`.
7. **Pelacakan Picker Per-Produk / Per-Split pada Picking Kolaboratif (Anti-Overwrite)**:
   - `claimOrJoinPickingSJSupabase` dan `leavePickingSJSupabase` **DILARANG** menimpa kolom `picker_name` pada baris yang sudah memiliki `qty_picked > 0` atau `status === 'KOSONG'` — klaim kolaboratif hanya menyentuh baris yang belum dipick (`qty_picked === 0` dan `status !== 'KOSONG'`).
   - Selama sesi live, `syncSinglePickingItemRealtimeSupabase` mencatat picker aktual (berdasarkan `pick_splits` atau operator yang mengubah `0 -> >0`) ke `picking_list.picker_name`.
   - Saat selesai (`completePickingSuratJalanSupabase` & `syncAllPickingOutboxBatches`), **setiap SKU** menyimpan `picker_name` aktualnya sendiri (`resolvePickingItemActualPicker`) dan mencatat `log_produk.operator` per-split/per-SKU (mis. SKU1 oleh `Vina`, SKU2 oleh `Yesi` dalam 1 SJ yang sama) — **DILARANG** menimpa seluruh SKU dengan gabungan nama tim SJ (`"Vina, Yesi"`).
   - Di View 1, status `SEDANG PICKING` (`active_pickers`) hanya boleh membaca `picker_name` dari baris dengan `status === 'SEDANG PICKING'`, bukan baris `PENDING` atau `SELESAI`.

### D. Riwayat Picking Paginated & Pencarian Arsip Cloud (Hemat Egress + Zero Truncated SJ)
8. **Paginated History + Tail-SJ Boundary Completeness Guard + Cloud Archive Search**:
   - `fetchPickingListFromSupabase` memuat seluruh baris aktif (`status=neq.SELESAI&limit=1000`) + halaman pertama riwayat terbaru (`limit=1000` dengan `Prefer: count=exact`).
   - **Tail-SJ Boundary Guard**: Karena 1 SJ besar bisa terdiri dari ratusan baris (mis. 400+ SKU), baris paling ujung pada batas `limit` berisiko terpotong separuh. `fetchPickingListFromSupabase` dan `fetchPickingListHistoryPageSupabase` **WAJIB** melengkapi seluruh baris milik `tailNoSj` pada batas halaman agar tidak pernah tampil SJ terpotong/parsial palsu.
   - Riwayat lebih lama dimuat on-demand melalui `fetchPickingListHistoryPageSupabase(offset, 1000)` (tombol **"Muat Riwayat Lebih Lama"**) dan kotak pencarian View 1 otomatis menjalankan `searchPickingListHistorySupabase(query)` (debounce 400ms, minimal 3 karakter) langsung ke Supabase agar seluruh arsip lama (8.700+ baris) tetap bisa dicari tanpa membebani egress awal.
   - **DILARANG** memotong tampilan list kartu SJ dengan `.slice(0, 100)` keras yang menyembunyikan riwayat yang baru dimuat.

---

## 2. Checklist Regresi (Wajib Diverifikasi Setiap Perubahan Picking)

- [ ] Menyelesaikan SJ dengan jumlah item besar (misal 50–100+ baris): semua baris di `picking_list` menjadi `SELESAI` (**0 baris tersisa `SEDANG PICKING` atau `PENDING`**).
- [ ] Klik `Lanjutkan Sisa` pada SJ `SELESAI (SEBAGIAN)`: item yang sudah lunas tidak muncul; item parsial hanya menampilkan sisa kekurangan; lokasi rak terupdate dari live `stok_real_fisik`.
- [ ] Menyelesaikan sesi lanjutan: `log_produk` hanya bertambah sejumlah **delta baru**, tidak memotong ulang qty sesi pertama (baik saat online maupun lewat outbox offline).
- [ ] Perangkat kedua tidak memaksa SJ lanjutan kembali ke status `SELESAI` karena `wms_completed_sjs_set` otomatis terbersihkan saat `fetchPickingListFromSupabase`.
- [ ] **Multi-Lokasi Split**: Mengambil 1 SKU dari 2+ rak (mis. `1 pcs A001` + `1 pcs A002` via strip `- / +` per rak, scan `#LOK` bergantian, `Ambil Pas` auto-split, atau modal Edit Item) menghasilkan 2 baris `#OUT` terpisah per rak di `log_produk` dan ringkasan `A001 (1), A002 (1)` di `picking_list.lokasi`.
- [ ] **Atribusi Picker Per-SKU**: Dalam 1 SJ gabungan (Vina + Yesi), SKU1 diambil Vina dan SKU2 diambil Yesi -> saat submit selesai, `log_produk` mencatat `operator = Vina` untuk SKU1 dan `operator = Yesi` untuk SKU2 (bukan keduanya `"Vina, Yesi"`).
- [ ] **Arsip Riwayat Picking**: Tombol **"Muat Riwayat Lebih Lama"** memuat batch +1.000 baris berikutnya tanpa SJ terpotong di batas halaman, dan pencarian 3+ karakter menemukan SJ lama di seluruh database.

---

## 3. Log Bug & Pembaruan (WAJIB DIUPDATE SETIAP ADA BUG/PERBAIKAN/UPDATE)

| Tanggal | Versi | Ringkasan Perubahan / Bug yang Ditemukan & Diperbaiki |
|---|---|---|
| 2026-11-23 | `v2.28.0` | Rilis fitur **Lanjutkan Sisa Picking** (`reopenRemainingPickingSJSupabase`, sisa-saja tanpa double picking, floor `prev_qty_picked`, regenerasi lokasi rak live `stok_real_fisik` + tombol `Refresh Lokasi`, anti-double `#OUT` delta via `fetchLoggedOutQtyBySkuForSj`, serta sinkron `sj_reopened`). |
| 2026-11-23 | `v2.28.2` | **Fix Bug Baris Terakhir Nyangkut `SEDANG PICKING` (Kasus `TO.OMP.26.11.00356`)**: Pada SJ 66 item, loop serial `PATCH` sebelumnya terputus di item ke-66 (`F26ITO811BN`), sehingga 65 item & `#OUT` selesai namun 1 baris tertinggal di `SEDANG PICKING` (membuat seluruh kartu SJ tampak masih dikerjakan oleh Vina Kharisma meski sudah lanjut ke SJ `00357` & `00358`). Diperbaiki dengan **parallel chunked PATCH (`CONCURRENCY = 8`) + retry 1x + SJ-wide safety sweep (`status=neq.SELESAI`)** di `completePickingSuratJalanSupabase` dan `syncAllPickingOutboxBatches`, serta pembersihan 1 baris nyangkut di Supabase. |
| 2026-11-24 | `v2.30.0` | **Riwayat Picking Paginated & Search Arsip + Multi-Lokasi Split Picking + Atribusi Picker Per-Produk**: (1) Menjawab laporan "histori lama hanya tampil ~10 tugas" — 4 SJ besar 24 Nov 2026 (794 baris) memenuhi jendela `limit=800` dari total 8.794 baris DB; ditambahkan pagination on-demand (`fetchPickingListHistoryPageSupabase`), **Tail-SJ Boundary Guard**, pencarian arsip cloud (`searchPickingListHistorySupabase`), & hapus cap `.slice(0, 100)`. (2) Menambahkan `pick_splits` (`PickingSplitAllocation[]`) untuk ambil 1 SKU dari 2+ rak (via scan `#LOK`, inline `- / +` per rak, smart auto-split `Ambil Pas`, & modal Edit Item) dengan `log_produk` `#OUT` terpisah per rak. (3) Memperbaiki atribusi picker kolaboratif agar setiap SKU/split mencatat `operator` & `picker_name` aktualnya masing-masing (tidak lagi menimpa semua item dengan `"Vina, Yesi"`). |
