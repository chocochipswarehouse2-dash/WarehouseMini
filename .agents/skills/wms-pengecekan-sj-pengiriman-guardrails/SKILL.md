---
name: wms-pengecekan-sj-pengiriman-guardrails
description: Guardrails, invariants, regression checklist, and bug log for Pengecekan Surat Jalan (Over-Scan & Unexpected Alert, SELESAI Shipping Sub-Tabs, Pause-on-Edit, Explicit Dispatched Push) and Pengiriman Store (Dispatched 2-Way Anti-Duplicate Smart Merge & Estimated Koli 1 koli = 40 pcs). Mandatory read & update on every change or bug fix in DistribusiStoreTab, pengirimanStore, or PengirimanStoreTab.
---

# WMS Pengecekan Surat Jalan & Pengiriman Store Guardrails

**WAJIB DIBACA & DIPERBARUI** oleh setiap agent sebelum/sesudah menyentuh:
- `src/components/PesananSaya/DistribusiStoreTab.tsx` (Scan, Over-Scan Alert, Panel Anomali, Submit/Bulk Submit Opsi Dispatched Default OFF, Sub-Tab Status Pengiriman pada `SELESAI`, Multi-Select & Select All/Unselect, Pause-on-Edit Dispatched Alert)
- `src/services/pengirimanStore.ts` (`syncPengecekanSjToPengirimanDispatched`, `removePengecekanSjFromPengirimanDispatched`, `savePengirimanStoreBatch`, `findDuplicateNoSjConflicts`, `updateDispatchedReportKoli`, `estimateKoliFromPcs`, `fetchSjShippingOverrides`, `setSjShippingOverridesBatch`, `buildNoSjReportIndex`, `resolvePengecekanSjShippingStatus`)
- `src/components/Pengiriman/PengirimanStoreTab.tsx` (Tab 1 Input Barang Anti-Duplikat Gabung Otomatis, Antrean Dispatched, Penyesuaian Cepat Koli Aktual, Modal Edit Dispatched, Event Listener)
- `src/types.ts` (`PengirimanStoreItem`, `PengecekanSJRecord`, `PengecekanSJDraft`)

---

## 1. Peta Arsitektur

1. **Pengecekan Surat Jalan (`DistribusiStoreTab.tsx`)**:
   - **Scan SKU (`handleScan`) & Input Manual (`handleManualQty`)**: Membandingkan qty scan fisik terhadap `qty_sj`.
   - **Panel Anomali Atas**: Menampilkan `activeDraft.unexpected` (**Di Luar SJ**) dan `overScannedItems` (**Lebih dari SJ (+N)**) berdampingan di atas tabel komparasi.
   - **Opsi Eksplisit (Tanpa Automasi Diam-Diam)**:
     - Submit Satuan (`sendToDispatchedOnSubmit`, **default `false` / OFF**).
     - Bulk Submit (`bulkSubmitModal.sendToDispatched`, **default `false` / OFF**).
     - Ubah Status Massal `PENDING → SELESAI`: **TIDAK** otomatis memasukkan ke `Dispatched`; SJ masuk `SELESAI > Belum Jadwal Kirim`.
     - Edit Riwayat SJ `SELESAI`: Jika SJ sedang di `Dispatched`, muncul alert konfirmasi & status `Dispatched` **dinonaktifkan (ditarik sementara)** selama proses edit; saat Simpan `SELESAI`, muncul checkbox opsional (default OFF) untuk memasukkan kembali ke `Dispatched`.
   - **Sub-Tab Status Pengiriman di Riwayat `SELESAI` (Non-Penerimaan)**:
     - `Semua Selesai` | `Belum Jadwal Kirim` | `Dispatched` | `Terkirim` | `Batal Kirim`.
     - Multi-select + tombol **Select All / Unselect** + aksi massal: `Kirim ke Dispatched`, `Pindah ke Terkirim`, `Batal Kirim`, `Belum Jadwal`.
2. **Bridge & Storage (`src/services/pengirimanStore.ts`)**:
   - `ESTIMATED_PCS_PER_KOLI = 40` dan `estimateKoliFromPcs(totalPcs)` (`Math.max(1, Math.ceil(totalPcs / 40))`).
   - **Status Arsip Pengiriman SJ Lama**: Disimpan di Supabase `wms_system_docs` (`section_id = 'pengecekan_sj_shipping_overrides'`) + localStorage cache. Memindahkan SJ lama ke `Terkirim` **TIDAK** membuat data trip palsu di `Pengiriman Store`.
   - **2-Way Anti-Duplicate Smart Merge**:
     - `syncPengecekanSjToPengirimanDispatched`: Jika No SJ sudah ada di `Dispatched` (dari input manual), **menggabungkan & melengkapi** tanpa menimpa koli aktual/deskripsi/foto manual.
     - `savePengirimanStoreBatch`: Jika input manual di Tab `1. Input Barang` memakai No SJ yang sudah ada di `Dispatched`, otomatis **menggabungkan & memperbarui** kartu Dispatched yang ada (mengubah estimasi menjadi koli aktual terkonfirmasi + melengkapi deskripsi/foto, **0 duplikat**).
     - `findDuplicateNoSjConflicts`: Menampilkan modal konfirmasi sebelum submit manual bila No SJ sudah ada di `Dispatched` atau sudah `Terkirim (Sent)`.
3. **Antrean Pengiriman Store (`PengirimanStoreTab.tsx`)**:
   - Badge `~X Koli (Est.)` selama `is_estimated_koli === true`, kontrol inline `- / + / Konfirmasi` untuk laporan 1-item, input `Jumlah Koli Aktual` pada Modal Edit Dispatched, dan modal konfirmasi Gabung/Konflik No SJ di Tab `1. Input Barang`.

---

## 2. Invarian Wajib (HARD CONSTRAINTS — JANGAN PERNAH DILANGGAR)

### A. Pengecekan Surat Jalan — Over-Scan & Di Luar SJ
1. **Suara & Notifikasi Peringatan Ganda**:
   - `playErrorBeep()` (termasuk getar haptik) + toast `warning` WAJIB berbunyi pada **2 kondisi**: SKU **tidak ada di SJ** (`unexpected`) DAN SKU **ada di SJ tetapi `qty_scan > qty_sj`** (baik via `handleScan` maupun `handleManualQty`).
   - Selama `qty_scan <= qty_sj`, `handleScan` memutar `playSuccessBeep()`.
2. **Panel Anomali Terpadu Tanpa Duplikasi Row Database**:
   - Item over-scan tampil di panel peringatan atas (`Lebih dari SJ (+selisih)`, `SJ: X · Scan: Y`, tombol `-`/`+` & reset cepat `= X`) **tanpa** dipindahkan ke `activeDraft.unexpected` (tetap `is_unexpected: false`, `status_item: 'LEBIH'`).

### B. Kontrol Eksplisit (NO Blind Automation) & Pause-on-Edit
3. **DILARANG Automasi Diam-Diam ke `Dispatched`**:
   - Checkbox **"Masukkan ke antrean Pengiriman Store > Dispatched"** pada Submit Satuan, Bulk Submit, maupun Edit Riwayat WAJIB **default `false` (OFF / tidak tercentang)**.
   - Ubah Status Massal menjadi `SELESAI` dan data SJ lama sebelum fitur ini **DILARANG** dimasukkan otomatis ke `Dispatched`.
4. **Pause-on-Edit untuk SJ yang Sedang di `Dispatched`**:
   - Jika admin klik **Edit** pada SJ `SELESAI` yang berstatus `Dispatched`, sistem WAJIB memunculkan alert konfirmasi dan **menonaktifkan sementara (menarik dari `Dispatched`)** sebelum mode edit aktif.
   - Saat disimpan kembali sebagai `SELESAI`, user diberikan pilihan checkbox (default OFF) apakah ingin memasukkannya kembali ke `Dispatched`.
5. **Khusus Pengiriman ke Store & Skip Qty Fisik 0**:
   - Hanya SJ bertipe **Pengiriman** (`!isPenerimaan`) dengan `total_qty_terima > 0` yang boleh masuk ke `Pengiriman Store > Dispatched`.
6. **Arsip SJ Lama ke `Terkirim` Tanpa Trip Palsu**:
   - Memindahkan SJ lama ke sub-tab `Terkirim` melalui Pengecekan SJ WAJIB hanya menyimpan status arsip pada `wms_system_docs` (`pengecekan_sj_shipping_overrides`) dan **DILARANG** membuat record trip baru di `pengiriman_store_trips` / `pengiriman_store_reports`.
   - SJ yang masih aktif di antrean `Dispatched` tidak boleh dipaksa pindah ke `Terkirim` dari Pengecekan SJ (harus melalui alur kirim normal di `Pengiriman Store` atau ditarik dulu).
7. **Privasi Store — DILARANG Mencantumkan Catatan Selisih Internal**:
   - `keterangan` WAJIB kosong (`''`) dan `deskripsi` WAJIB bersih (`Barang Pengiriman Store (N SKU)`). **DILARANG KERAS** menuliskan info internal selisih (seperti `Dari Pengecekan SJ · SJ 50 pcs / Fisik 48 pcs`) ke laporan `Pengiriman Store`.

### C. Estimasi Koli, Normalisasi Store & 2-Way Anti-Duplicate Merge
8. **Estimasi Koli = 1 Koli per 40 Pcs & Bebas Override Aktual**:
   - Formula default: `Math.max(1, Math.ceil(totalQtyScan / 40))`, ditandai `is_estimated_koli: true` dan `source_type: 'pengecekan_sj'`.
   - `savePengirimanStoreReport`, `editPengirimanStoreReportFull`, dan Modal Edit Dispatched **DILARANG** memaksa `hitung_koli = 1` untuk `satuan === 'Pcs'` bila `hitung_koli >= 1` sudah terisi.
   - Normalisasi nama store WAJIB lewat `getFullStoreName`.
9. **Tabrakan No SJ Sama = Gabung / Lengkapi / Perbarui (2 Arah, 0 Duplikat)**:
   - **Pengecekan SJ → Dispatched** saat No SJ sudah ada dari input manual: **pertahankan** koli aktual, satuan, deskripsi manual, & foto barang; hanya lengkapi field yang kosong.
   - **Input Manual (`PengirimanStoreTab`) → Dispatched** saat No SJ sudah ada di `Dispatched`: tampilkan modal konfirmasi `Gabung & Simpan`, lalu `savePengirimanStoreBatch` menggabungkan & memperbarui kartu Dispatched yang sudah ada (mengubah `is_estimated_koli` menjadi `false`, memperbarui koli aktual, deskripsi, dan foto tanpa membuat kartu kembar).
   - **Proteksi Data Terkirim (`sent`)**: Laporan yang sudah berstatus `sent` **DILARANG** dihapus oleh downgrade/batal kirim/hapus riwayat, dan input manual dengan No SJ yang sudah `sent` wajib menampilkan peringatan konfirmasi terlebih dahulu.
10. **Zero-Reload Realtime Refresh**:
    - Semua mutasi Dispatched & shipping override WAJIB memancarkan `wms_pengiriman_store_updated`; baik `DistribusiStoreTab` maupun `PengirimanStoreTab` wajib mendengarkannya tanpa `window.location.reload()`.

### D. Mobile App-Shell & Ergonomic Viewport Guardrails (`< 640px`)
11. **Zero Horizontal Table Scroll & Native Mobile Item Cards (Nama Produk + Size 1 Baris)**:
    - Baik daftar item komparasi di **Tab Pengecekan** maupun detail item di **Tab Riwayat** WAJIB merender **Kartu Item Mobile (`sm:hidden`)** vertikal dengan **Nama Produk dan Size tampil sejajar dalam 1 baris** (`Nama Produk [Size]`), SKU di bawahnya, SJ/Selisih/Scan, dan stepper `-` / `+` thumb-friendly (`>= 36px` / `h-9 w-9`), sementara `<table>` 6 kolom (`Nama Produk & Size`, `SKU`, `Qty SJ`, `Qty Scan/Terima`, `Selisih`, `Status`) hanya dirender pada `hidden sm:block`.
12. **Ringkasan 1 Baris (Total SJ | Total Scan | Total Selisih) & Segmented Controls**:
    - Rangkuman pengecekan di Tab Pengecekan WAJIB memakai **1 baris ringkas 3 kolom (`grid-cols-3`)** baik di seluler maupun desktop: **Total SJ**, **Total Scan**, dan **Total Selisih** (klik untuk filter selisih), sedangkan tombol filter cepat `Semua | Cocok | Selisih` diletakkan di header tabel Komparasi.
    - Sub-tab utama & tipe riwayat WAJIB menggunakan segmented control 2/3 kolom rapi di HP (tanpa bar warna-warni berjejal).
    - Filter sekunder Riwayat (Asal, Tujuan, Rentang Tanggal, Urutan, Muat Ulang Penuh) WAJIB terlipat di balik tombol **Filter** (`SlidersHorizontal` + badge jumlah filter aktif) pada layar HP (`< 640px`).
    - Antrean Draft SJ di HP menggunakan horizontal swipe snap carousel (`snap-x`) dan area Import CSV otomatis terlipat bila sudah ada antrean aktif agar scanner langsung terlihat di atas lipatan layar.
13. **Anti-Pelangi & Native Bottom Action Sheets (Tanpa Tombol Menumpuk)**:
    - Toolbar card yang diperluas dan aksi massal di HP WAJIB memisahkan 1 tombol CTA utama (`bg-indigo-600`) dengan aksi sekunder di **Bottom Action Sheet** (`mobileBulkActionSheetOpen` / `mobileCardMenuRec`) + **Sticky Bottom Selection Dock** (`fixed inset-x-3 bottom-3 z-40 sm:hidden`) saat checkbox dipilih.
    - Semua tombol aksi sekunder di desktop maupun mobile wajib mengikuti aturan **Anti-Pelangi Tombol** (`GEMINI.md §10`).

---

## 3. Checklist Regresi (Wajib Diverifikasi Setiap Modifikasi)

- [ ] Scan SKU di luar SJ → `playErrorBeep()` + toast warning + masuk panel peringatan atas (`Di Luar SJ`).
- [ ] Scan SKU di SJ dengan `qty_scan > qty_sj` → `playErrorBeep()` + toast warning + masuk panel peringatan atas (`Lebih dari SJ (+N)`), hilang otomatis saat dikurangi `<= qty_sj`.
- [ ] Submit `SELESAI` (satuan & bulk): checkbox *Masukkan ke Dispatched* default **OFF**; jika tidak dicentang, SJ masuk ke `Riwayat > SELESAI > Belum Jadwal Kirim` (tidak otomatis masuk Dispatched).
- [ ] Sub-tab `SELESAI` menampilkan `Semua Selesai | Belum Jadwal Kirim | Dispatched | Terkirim | Batal Kirim` dengan jumlah akurat & swipe horizontal rapi di HP.
- [ ] Multi-select + `Select All` / `Unselect` di tab `SELESAI`:
  - `Kirim ke Dispatched` memasukkan SJ Pengiriman terpilih ke `Pengiriman Store > Dispatched` (`~X Koli (Est.)`, tanpa catatan selisih internal).
  - `Pindah ke Terkirim` memindahkan SJ lama ke tab `Terkirim` (tersimpan di Supabase lintas perangkat, **tanpa** membuat trip palsu di `Pengiriman Store`).
  - `Batal Kirim` memindahkan ke `Batal Kirim` & menarik dari `Dispatched` bila ada (tidak menyentuh `sent`).
- [ ] Klik `Edit` pada SJ `SELESAI` yang sedang `Dispatched` → muncul alert konfirmasi & status Dispatched otomatis ditarik sementara; saat Simpan `SELESAI` → tersedia checkbox (default OFF) untuk memasukkan kembali ke Dispatched.
- [ ] Input manual di `Pengiriman Store > 1. Input Barang` dengan No SJ yang sama dengan kartu `Dispatched` → muncul modal konfirmasi `Gabung & Simpan`, hasil akhir hanya **1 kartu** dengan koli aktual terkonfirmasi + foto lengkap (0 duplikat).
- [ ] Push dari Pengecekan SJ dengan No SJ yang sudah diinput manual di `Dispatched` → **tidak** menimpa koli aktual/foto manual.
- [ ] Tampilan HP Seluler (`< 640px`) & Desktop Tab Pengecekan + Riwayat: rangkuman tampil **1 baris (Total SJ | Total Scan | Total Selisih)**, **Nama Produk + Size dalam 1 baris**, bebas horizontal scroll tabel, menggunakan Native Segmented Control, Filter Sekunder terlipat, Draft Carousel horizontal, Kartu Item Mobile + stepper `36px+`, Sticky Bottom Selection Dock, dan Bottom Action Sheet (`mobileBulkActionSheetOpen` & `mobileCardMenuRec`) yang seluruh tombolnya berfungsi nyata.
- [ ] `npm run build` dan `tsc --noEmit` bebas error di seluruh file terkait.

---

## 4. Log Bug & Pembaruan (WAJIB DIUPDATE SETIAP ADA BUG/PERBAIKAN/UPDATE)

| Tanggal | Versi | Ringkasan Perubahan / Bug yang Ditemukan & Diperbaiki |
|---|---|---|
| 2026-11-20 | `v2.23.0` | Rilis awal fitur Over-Scan Alert + Panel Anomali Terpadu di Pengecekan SJ, sinkronisasi SJ Pengiriman ke `Pengiriman Store > Dispatched` dengan estimasi 1 koli = 40 pcs + override koli aktual, privasi penuh (tanpa catatan selisih internal), dan perbaikan hardcode `satuan === 'Pcs' ? 1` di `pengirimanStore.ts` & Modal Edit Dispatched. |
| 2026-11-20 | `v2.23.1` | Perombakan pengamanan sesuai keputusan operasional: (1) Matikan blind auto-sync — ganti dengan checkbox opsional **default OFF** saat Submit/Bulk Submit/Edit ke `SELESAI`; (2) Pause-on-Edit alert yang menarik sementara SJ dari `Dispatched` saat SJ `SELESAI` diedit; (3) Tambah 4 sub-tab status pengiriman di Riwayat `SELESAI` (`Belum Jadwal Kirim \| Dispatched \| Terkirim \| Batal Kirim`) lengkap dengan multi-select, `Select All`/`Unselect`, `Kirim ke Dispatched`, `Pindah ke Terkirim` (arsip `wms_system_docs` tanpa membuat trip palsu), dan `Batal Kirim`; (4) Perbaikan anti-tabrakan No SJ 2 arah (`savePengirimanStoreBatch` & `syncPengecekanSjToPengirimanDispatched`) agar tabrakan No SJ selalu **menggabungkan / melengkapi / memperbarui** tanpa duplikat dan tanpa menimpa input manual. |
| 2026-11-20 | `v2.23.2` | Renovasi menyeluruh Mobile App-Shell UX untuk Tab **Pengecekan** & Tab **Riwayat** (`DistribusiStoreTab.tsx`): Native Segmented Controls 2/3 kolom, Import CSV lipat saat ada draft, Horizontal Snap Carousel untuk Antrean SJ, tombol scanner/kamera & stepper `-`/`+` berukuran thumb-friendly (`36px–40px`), Kartu Item Mobile (`sm:hidden`, 0 horizontal table scroll), Filter Sekunder Riwayat terlipat dengan badge count, Kartu Riwayat bersih maks 2 badge atas + hierarki tipografi jelas, Sticky Bottom Selection Dock, serta 2 Native Bottom Action Sheets untuk Aksi Massal dan Menu Kartu SJ dengan tombol netral Anti-Pelangi. |
| 2026-11-20 | `v2.23.3` | Penyederhanaan ergonomi Pengecekan & Riwayat SJ di seluler maupun desktop: (1) Gabungkan **Nama Produk + Size menjadi 1 baris** pada kartu item mobile, tabel desktop 6 kolom, serta panel over-scan di kedua tab; (2) Padatkan rangkuman pengecekan menjadi **1 baris 3 kolom (`Total SJ \| Total Scan \| Total Selisih`)** baik di seluler maupun desktop, dan pindahkan filter cepat `Semua \| Cocok \| Selisih` ke header Komparasi. |
