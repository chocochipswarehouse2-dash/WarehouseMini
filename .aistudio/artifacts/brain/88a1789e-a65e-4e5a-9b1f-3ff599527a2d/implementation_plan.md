# Rencana Perbaikan Performa Modul Laporan QC & Perbaikan (Anti-Freeze / Anti-Lag)

## 1. Ringkasan Masalah (Root Cause Analysis)
Modul **Laporan QC** (`QualityControlView.tsx`, `LaporanQcView.tsx`, `PerbaikanView.tsx`, dan fungsi terkait di `supabase.ts`) mengalami *freeze* / *Not Responding* akibat 5 bottleneck utama di *main thread* browser:
1. **Pemrosesan Katalog Ganda di Main Thread (50.000+ Iterasi Sinkron)**: `LaporanQcView` memanggil ulang `getAllProductsFromLocalDb()` meskipun `productCatalog` sudah tersedia dari `App.tsx`, lalu menjalankan regex berat (`isDummyProduct`, `isCorruptedSku`, `resolveProductName`, `resolveProductDisplaySize`) untuk puluhan ribu SKU sebanyak 2x saat *mount*.
2. **Pencarian Autocomplete SKU Tanpa Debounce**: Mengetik 1 huruf pada kolom SKU langsung memindai seluruh katalog secara sinkron tanpa *debounce* atau batas minimal karakter.
3. **Eager Fetching & Self-Triggering Event Loop saat Buka Halaman**: Saat membuka tab **Form Laporan**, sistem langsung memanggil `fetchQcReportsFromSupabase()` dan `fetchPerbaikanTicketsFromSupabase()` (hingga 20.000 baris), serta memicu event `wms_qc_reports_updated` yang men-trigger listener di komponen yang sama secara berulang.
4. **Blokir Thread oleh `localStorage` & String Foto Base64**: Data riwayat QC dan tiket perbaikan yang mengandung fallback foto Base64 disimpan bulat-bulat ke `localStorage` (`wms_local_qc_reports` & `wms_local_perbaikan_tickets`). Setiap update memanggil `JSON.parse` / `JSON.stringify` berukuran besar secara sinkron di *main thread*.
5. **Full Scan `stok_real_fisik` & Loop `O(N × M)` di `PerbaikanView.tsx`**: Tab Perbaikan menarik seluruh stok fisik gudang (`fetchSupabaseStokFisikDirect()`) saat *mount* dan melakukan pencarian linear `.some()` di dalam loop katalog puluhan ribu item.

---

## 2. Arsitektur Solusi & Langkah Perbaikan

### A. Lazy Fetch per Tab di `QualityControlView.tsx` & `LaporanQcView.tsx`
- **Saat Buka Menu Laporan QC (Default: Tab `Form Laporan`)**:
  - Tidak lagi menjalankan `fetchQcReportsFromSupabase()` atau `fetchPerbaikanTicketsFromSupabase()` di awal. Form input langsung terbuka secara **instan (0ms network block)**.
  - Hanya memuat data `qc_reports` ketika user mengklik tab **Riwayat Laporan**, dan hanya memuat `perbaikan_tickets` ketika user mengklik tab **Perbaikan** atau **ACC Defect**.
- **Hapus Self-Triggering Event Loop**:
  - Memperbaiki `useEffect` di `LaporanQcView.tsx` agar fungsi `load()` awal tidak menembakkan `window.dispatchEvent(new CustomEvent('wms_qc_reports_updated'))` ke dirinya sendiri, serta memastikan event listener hanya merespons perubahan dari aksi simpan/edit/hapus.

### B. Batas 300 Data Terbaru + Filter Rentang Tanggal Server-Side (`supabase.ts` & UI)
- **`fetchQcReportsFromSupabase(options)`**:
  - Mengubah default query dari `limit=2000` menjadi **`limit=300`** data terbaru (`order=created_at.desc&limit=300`).
  - Menambahkan dukungan parameter filter tanggal (`startDate`, `endDate`) di `LaporanQcView.tsx` (Tab Riwayat Laporan) sehingga jika user ingin melihat laporan lama di luar 300 data terbaru, sistem dapat melakukan query spesifik berdasarkan tanggal ke Supabase.
- **`fetchPerbaikanTicketsFromSupabase(options)`**:
  - Menghentikan loop `while (offset < 20000)` yang menarik puluhan ribu tiket sekaligus.
  - Membatasi pemuatan awal menjadi **300 tiket aktif terbaru** (`limit=300`), serta mendukung filter tanggal bila user mencari tiket lama.

### C. Pembersihan Base64 dari `localStorage` & Penyimpanan Memori Ringan (`supabase.ts`)
- **Sanitasi Otomatis `localStorage`**:
  - Saat membaca/menulis cache `wms_local_qc_reports` dan `wms_local_perbaikan_tickets`, sistem otomatis:
    1. Membuang string foto Base64 berukuran besar (`data:image/...` > 2 KB) agar hanya URL Google Drive / HTTP ringan yang disimpan di `localStorage`.
    2. Membatasi cache `localStorage` maksimal **100 item terbaru** sebagai cadangan offline ringan, sementara data lengkap selama sesi berjalan disimpan di variabel memori (`memoryQcReportsCache` & `memoryPerbaikanTicketsCache`).
  - Saat komponen pertama kali dibuka, otomatis membersihkan beban `localStorage` lama yang sudah terlanjur penuh agar browser langsung pulih dari kondisi *not responding*.

### D. Optimasi Katalog & Autocomplete SKU Instan (`LaporanQcView.tsx`)
- **Gunakan `productCatalog` dari Props Secara Langsung**:
  - Menghapus pemanggilan ganda `getAllProductsFromLocalDb()` jika `productCatalog` dari `App.tsx` sudah berisi data.
  - Menghapus pembuatan objek baru dan eksekusi regex berat (`resolveProductName`, `isDummyProduct`) untuk 30.000+ item di awal *render*; normalisasi nama/size hanya dilakukan untuk item yang cocok dengan hasil pencarian (maksimal 25 item).
- **Debounced Search & Minimal 2 Karakter**:
  - Menambahkan *debounce* `180ms` pada input pencarian SKU dan hanya menjalankan pencarian setelah user mengetik minimal **2 karakter**, dengan *early-exit* sehingga pengetikan terasa sangat mulus.

### E. Optimasi `PerbaikanView.tsx` (Hapus Full Scan Stok Gudang & Loop `O(N × M)`)
- **Targeted Fetch Stok Rak Perbaikan (`CC`, `PMK`, `DF`)**:
  - Menghentikan pemanggilan `fetchSupabaseStokFisikDirect()` (yang mengunduh seluruh stok gudang A–Z) saat membuka tab Perbaikan.
  - Stok fisik rak perbaikan hanya ditarik ketika user mengklik tombol **"Tarik Stok Rak"** atau menggunakan query spesifik area `Perbaikan` (`area=eq.Perbaikan`), serta mengganti pengecekan duplikat `result.some(...)` (`O(N × M)`) menjadi `Set` lookup `O(1)`.
- **Pengamanan Ekspansi Tiket (`qty > 1`)**:
  - Membatasi ekspansi visual tiket di memori agar tidak memecah 1 baris data abnormal menjadi ribuan elemen DOM sekaligus.

---

## 3. Daftar File yang Akan Dimodifikasi
1. `/src/services/supabase.ts`:
   - Optimasi `fetchQcReportsFromSupabase` (default `limit=300` + dukungan filter tanggal + sanitasi Base64 & batas cache `localStorage`).
   - Optimasi `fetchPerbaikanTicketsFromSupabase` (ganti loop 20.000 baris menjadi `limit=300` + dukungan filter tanggal + sanitasi Base64 & batas cache `localStorage`).
2. `/src/components/QualityControlView.tsx`:
   - Penerapan **Lazy Fetch per Tab** (tidak memuat data riwayat/perbaikan saat tab aktif adalah `form_laporan`) dan penghapusan `JSON.parse(localStorage)` berulang di *main thread*.
3. `/src/components/LaporanQcView.tsx`:
   - Hanya menjalankan fetch riwayat ketika `viewMode !== 'form_only'`.
   - Menghapus *self-triggering event* `wms_qc_reports_updated` saat *mount*.
   - Optimasi pencarian katalog SKU (tanpa duplikasi IndexedDB & tanpa loop normalisasi 50.000 item saat *mount*, ditambah *debounce* pencarian).
   - Penambahan filter rentang tanggal pada tab **Riwayat Laporan**.
4. `/src/components/PerbaikanView.tsx`:
   - Menghentikan unduhan penuh `fetchSupabaseStokFisikDirect()` saat *mount*.
   - Mengubah algoritma `physicalRepairItems` dari `O(N × M)` menjadi `O(1)` menggunakan `Set` dan hanya memproses item area Perbaikan.
