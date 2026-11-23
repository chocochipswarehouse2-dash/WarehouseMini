# PRD & Plan: Penggabungan Modul Pusat Barcode Produk & CSV (Master, DealPOS & Distribusi)

Dokumen spesifikasi produk (*Product Requirements Document*) dan rencana implementasi (*Implementation Plan*) untuk menggabungkan **Cetak Barcode Produk**, **CSV Barcode (DealPOS)**, dan **CSV Distribusi (Excel)** ke dalam **1 halaman terpadu** yang intuitif bagi **Admin** maupun **Operator Gudang**.

Status: `⏳ PENDING REVIEW` · Pemilik produk: pengelola gudang Chocochips · Stack: React 19 + TypeScript + Vite + Tailwind CSS v4

---

## 1. Ringkasan

Saat ini fungsi pencetakan barcode produk dan pengolahan file CSV/Excel DealPOS tersebar di **3 menu berbeda** dan menggunakan **2 mesin cetak barcode yang berbeda**:
1. **Menu `Cetak Label & Barcode` ➔ Tab `Cetak Barcode`** (`src/components/CetakBarcodeProdukView.tsx`): Mendukung Master Produk multi-select, Input Manual, Import CSV/Excel, dan preview/cetak QR Code stiker 50×20 mm via `LabelCustomizerPreview`.
2. **Menu `CSV Barcode (DealPOS)`** (`src/components/tools/CsvBarcodeView.tsx`): Menarik stok DealPOS / Rak Fisik WMS / CSV Inventory DealPOS per outlet/lokasi, export CSV/ZIP DealPOS, serta cetak barcode + checklist via `BatchBarcodePrintModal` & `ChecklistPrintModal` (mendukung QR Code **dan** Barcode 1D Code128).
3. **Menu `CSV Distribusi (Excel)`** (`src/components/tools/CsvDistribusiView.tsx`): Memecah Excel pembagian stok menjadi CSV DealPOS per store (ZIP) serta cetak barcode + checklist per store via `BatchBarcodePrintModal` & `ChecklistPrintModal`.

Penggabungan ini menyatukan ketiganya dalam konsep **"4 Pintu Sumber Data ➔ 1 Antrean & Mesin Cetak Terpadu"**:
- **Memisahkan** urusan *Label Operasional Gudang/Paket* (`Cetak Label Rak & Paket`: `QR Prefix` + `Label Paket`) dari urusan *Barcode Produk & CSV* (`Pusat Barcode & CSV`) agar tidak ada tab bertumpuk 3 lapis.
- **Menyatukan** seluruh alur cetak stiker 50×20 mm (QR + Barcode 1D + Checklist A4) ke dalam **1 mesin cetak dan 1 panel Antrean & Live Preview yang konsisten**.
- **Menyesuaikan tampilan sesuai peran** agar Operator Gudang fokus ke pencarian/input cepat & cetak fisik tanpa bingung oleh tombol teknis export CSV/ZIP, sementara Admin memiliki akses penuh atas ekspor CSV DealPOS maupun cetak massal per toko.

---

## 2. Masalah, Tujuan, dan Ruang Lingkup

| Masalah Saat Ini | Tujuan Penggabungan | Indikator Keberhasilan |
| --- | --- | --- |
| Fungsi cetak barcode & CSV tersebar di 3 menu sidebar | Konsolidasi menjadi 1 halaman **`Pusat Barcode & CSV`** dengan 4 sumber kerja yang jelas | Jumlah menu sidebar berkurang tanpa menghilangkan fungsi apa pun |
| Ada 2 UI dan 2 engine cetak berbeda (`CetakBarcodeProdukView` hanya QR vs `BatchBarcodePrintModal` QR + Code128) | Menyatukan 1 Antrean Cetak & 1 Mesin Cetak 50×20 mm (QR + Code128 + Checklist A4 + rotasi + harga) | 100% cetak stiker dari Master, Manual, CSV, DealPOS, dan Excel memakai mesin & preset yang sama |
| Operator bingung memilih menu saat disuruh cetak barcode alokasi / barang datang | Alur bertahap per tab + tampilan *role-aware* (Operator langsung masuk ke jalur cetak cepat) | Operator dapat langsung mencari SKU / memilih store dan mencetak tanpa melihat tombol teknis CSV |
| User tidak bisa menggabungkan SKU dari Excel/DealPOS dengan SKU tambahan manual dalam 1 sesi cetak | Semua sumber bermuara ke 1 **Antrean Cetak Terpusat** di sisi kanan (sticky di Desktop) | SKU dari sumber berbeda dapat ditambah/diedit qty-nya bersama sebelum dicetak |
| URL & shortcut modul lama berisiko rusak jika digabung | Pertahankan alias route (`cetak_barcode`, `csv_barcode`, `csv_distribusi`) & permission RBAC lama | Bookmark/shortcut lama otomatis membuka tab sumber yang sesuai di halaman baru |

### Di Luar Ruang Lingkup Fase Ini
- Perubahan isi/logika tab **QR Prefix** (`CetakLokasiRakTab`) dan **Label Paket** (`LabelPaketTab`), selain merapikan posisi tab `Cetak Barcode` yang dipindahkan/di-alias ke halaman terpadu.
- Integrasi API langsung ke backoffice DealPOS (ekspor tetap menghasilkan file `.csv` / `.zip` standar import DealPOS yang sudah berjalan).
- Perubahan skema database Supabase maupun Google Apps Script (modul ini bekerja di sisi klien dengan data `master_produk` & file lokal).

---

## 3. Pengguna, Peran & Aturan Visibilitas (*Role-Aware Hygiene*)

Seluruh visibilitas tab dan aksi dikendalikan oleh RBAC yang sudah ada di `src/services/permissions.ts` (`menu_ops_cetak_barcode`, `action_cetak_barcode`, `menu_ops_csv_barcode`, `menu_ops_csv_distribusi`, dan `isSuperadmin`/`userIsAdmin`):

| Peran / Izin | Tab Sumber yang Tampil | Default Tab | Batasan Aksi & Tombol |
| --- | --- | --- | --- |
| **Operator Gudang** (`menu_ops_cetak_barcode` / `action_cetak_barcode`, tanpa izin CSV) | 1. `Master & Manual`<br>2. `Import CSV/Excel` | `Master & Manual` | Hanya melihat alur cetak fisik (cari/pilih produk, atur qty, preview, **Cetak Stiker** & **Cetak Checklist**). Tidak dibebani fitur export CSV/ZIP DealPOS. |
| **Operator Gudang dengan akses CSV terbatas** (diberi `menu_ops_csv_barcode` atau `menu_ops_csv_distribusi`) | Sesuai tab yang diizinkan | `Master & Manual` | Dapat memilih outlet/store untuk dikirim ke **Antrean Cetak Barcode & Checklist**; tombol export CSV/ZIP hanya muncul jika memiliki izin Admin/CSV terkait. |
| **Admin Gudang / MD / Leader** (Admin atau punya semua izin) | Semua 4 Tab:<br>1. `Master & Manual`<br>2. `Import CSV/Excel`<br>3. `Stok DealPOS`<br>4. `Alokasi Distribusi` | Mengingat tab terakhir (atau sesuai route asal) | Akses penuh **Output File DealPOS** (`Unduh CSV`, `Download ZIP Store` — tombol *outline* netral) dan **Output Gudang Fisik** (`+ Kirim ke Antrean Cetak`, `Cetak Stiker Thermal`, `Cetak Checklist` — maksimal 1 tombol solid utama per toolbar). |

---

## 4. Arsitektur Halaman & Tata Letak (Desktop vs Mobile)

### 4.1 Struktur Navigasi Sidebar & Menu
1. **`Cetak Label Rak & Paket`** (`cetak_label`): Fokus pada 2 tab operasional gudang/pengiriman:
   - `QR Prefix (#LOK, #IN, #OUT, #SO)`
   - `Label Paket Pengiriman`
   *(Opsional: disediakan banner/tautan pintas `"Butuh cetak barcode stiker produk 50×20 mm? Buka Pusat Barcode & CSV ➔"` agar user yang terbiasa membuka menu lama langsung tahu lokasi barunya.)*
2. **`Barcode Produk & CSV`** (`pusat_barcode` — atau mempertahankan ID `cetak_barcode` sebagai halaman utama terpadu):
   - Menjadi satu-satunya rumah untuk **Cetak Barcode Produk**, **CSV Barcode (DealPOS)**, dan **CSV Distribusi (Excel)**.

### 4.2 Wireframe Desktop (`>= 1024px`) — Split Workspace `62% : 38%`

```text
+---------------------------------------------------------------------------------------------------+
| HEADER: Pusat Barcode Produk & CSV                                                                |
| Subtitle: Cetak stiker 50x20 mm (QR / Barcode 1D), Checklist A4, & Export CSV Import DealPOS      |
|---------------------------------------------------------------------------------------------------|
| TAB SUMBER DATA (1 baris segmented tab, tanpa tab bertumpuk):                                     |
| [ 1. Master & Manual ]   [ 2. Import CSV / Excel ]   [ 3. Stok DealPOS ]   [ 4. Alokasi Distribusi]|
+-----------------------------------------------------------+---------------------------------------+
| KOLOM KIRI (lg:col-span-7 / ~60-62%): SUMBER DATA         | KOLOM KANAN (lg:col-span-5 / ~38-40%) |
|                                                           | STICKY WORKSPACE CETAK & PREVIEW      |
| Area kerja aktif sesuai tab yang dipilih:                 |                                       |
| - Tab 1: Pencarian Master Produk + Quick Add Satuan       | [1] LIVE PREVIEW STIKER (50x20 mm)    |
| - Tab 2: Upload/Tempel CSV Daftar Cetak + Unduh Template  |     Mode: [ QR Code ] | [ Barcode 1D ]|
| - Tab 3: Pilihan Stok Live/Rak/CSV + Pilih Outlet/Gudang  |     Orientasi, Rotasi, Size, Harga    |
|          Footer Aksi Tab 3:                               |                                       |
|          [Unduh CSV / ZIP] (Outline)                      | [2] ANTREAN CETAK TERPUSAT            |
|          [+ Tambah ke Antrean Cetak] (Primary)            |     (N SKU · M Lembar Terpilih)       |
| - Tab 4: Upload Excel Alokasi + Pilih Sheet & Store       |     Search antrean | Pilih/Hapus      |
|          Footer Aksi Tab 4:                               |     Tabel/Daftar SKU + +/- Qty        |
|          [Download ZIP Store] (Outline)                   |     (Dikelompokkan/label asal Outlet) |
|          [+ Tambah ke Antrean Cetak] (Primary)            |                                       |
|                                                           |     CTA FOOTER:                       |
|                                                           |     [ Cetak Checklist A4 ] (Outline)  |
|                                                           |     [ Cetak Stiker (M Lbr) ] (Solid) |
+-----------------------------------------------------------+---------------------------------------+
```

### 4.3 Tata Letak Mobile (`< 768px`) — Native Feel & Anti-Scroll Panjang
- **Bar Tab Sumber Data**: Swipe horizontal (`overflow-x-auto no-scrollbar whitespace-nowrap`) dengan target sentuh minimum `40px`.
- **Panel Kanan di HP**: Tidak ditumpuk panjang di bawah tabel sumber; digantikan oleh **Sticky Bottom Bar** di bagian bawah viewport:
  - Kiri: Ringkasan `N SKU · M Stiker` (+ thumbnail kecil status mode `QR` / `1D`).
  - Kanan: Tombol `Preview & Antrean` (membuka Slide-Up Sheet / Drawer full-height berisi Preview 50×20 mm, pengaturan stiker, daftar antrean, tombol **Cetak Checklist**, dan **Cetak Stiker**).

---

## 5. Spesifikasi Fungsional Rinci

### 5.1 Tab 1 — `Master & Manual` (Pengganti Gabungan `TabKatalogMultiSelect` + `TabInputManual`)
- Menggabungkan pencarian katalog Master Produk (`28.000+ SKU`) dan form input manual dalam **1 tab** dengan 2 sub-mode ringkas atau bar "Input Manual Cepat" yang bisa dibuka/tutup (*collapsible*) di atas daftar katalog:
  - Pencarian cepat by SKU / Nama Produk / Size dengan *O(1) lookup* (`lookupProductBySku`).
  - Multi-select varian warna & size + isi jumlah stiker per varian ➔ tombol `+ Tambah ke Antrean Cetak`.
  - Input manual bebas (SKU custom, nama, size, harga, lokasi rak, qty) untuk barang baru yang belum ada di master.

### 5.2 Tab 2 — `Import CSV / Excel` (`TabImportCsv`)
- Mendukung drag & drop / upload CSV atau Excel daftar SKU + Qty (+ optional Harga & Lokasi).
- Tetap menyediakan tombol **Unduh Template CSV** dengan contoh format valid.
- Menampilkan tabel pratinjau validasi SKU terhadap Master Produk (`lookupProductBySku`) sebelum menekan tombol `+ Masukkan ke Antrean Cetak`.

### 5.3 Tab 3 — `Stok Outlet / DealPOS` (Adaptasi `CsvBarcodeView`)
- **Langkah 1 — Sumber Data Stok**:
  - `Stok DealPOS Live` (dari `dealpos_channels` Master Produk)
  - `Rak Fisik Gudang WMS` (dari `stok_real_fisik`)
  - `Upload CSV Inventory DealPOS` (opsional jika Admin ingin memakai file export manual terbaru)
- **Langkah 2 — Filter & Pilih Outlet/Lokasi**:
  - Checklist outlet/gudang resmi (`MASTER_DEALPOS_CHANNELS`: toko fisik, bazaar `B-*`, internal `WH`/`QC`/`MAP`, online) dengan pencarian produk/SKU & toggle sembunyikan stok 0.
- **Langkah 3 — Dua Jalur Output Tegas**:
  - **Admin Export File**: `Export CSV Outlet Terpilih` / `Download ZIP Semua Outlet` (tombol *outline* netral).
  - **Kirim ke Antrean Cetak**: Tombol `+ Masukkan Outlet Terpilih ke Antrean Cetak` (mengisi antrean kanan dengan label sumber outlet seperti `LWS`, `B-EMP`, `WH`, dan bisa langsung dicetak stiker atau Checklist A4 per outlet).

### 5.4 Tab 4 — `Alokasi Distribusi` (Adaptasi `CsvDistribusiView`)
- **Langkah 1 — Upload File Excel Distribusi**: Mendukung multi-file workbook (`.xlsx`/`.xls`) dan otomatis mendeteksi sheet terbaik + nomor batch (`findBestDistSheet`, `extractBatchNumber`).
- **Langkah 2 — Pilih Sheet, Store & Pengaturan Export DealPOS**:
  - Checklist store tujuan, pola prefix nama file (`{store}`), opsi `Exclude Qty 0`, dan `Space Padding`.
  - Preview ringkas SKU & total unit per store.
- **Langkah 3 — Dua Jalur Output Tegas**:
  - **Admin Export File**: `Download ZIP CSV DealPOS per Store` (tombol *outline* netral).
  - **Kirim ke Antrean Cetak**: Tombol `+ Masukkan Store Terpilih ke Antrean Cetak` (mengirim item alokasi store ke panel Antrean Cetak kanan lengkap dengan tag store-nya untuk cetak Stiker 50×20 mm maupun Checklist A4 per store).

### 5.5 Penyatuan Mesin Cetak & Antrean Terpusat (`UnifiedBarcodeWorkspace`)
- **Dukungan Dual-Mode Kode pada 1 Mesin Cetak**:
  - **QR Code** (`qrcode`) *dan* **Barcode 1D Code128** (`jsbarcode`) dengan pengaturan lebar/tinggi barcode, ukuran QR, rotasi (`0° / 90° / 180° / 270°`), orientasi (`Landscape 50×20` / `Portrait 20×50`), opsi tampilkan Nama Produk (2 baris vs 1 baris), Size, Harga (`None / Rp / IDR / Custom`), Lokasi Rak, dan Teks Kustom tambahan.
- **Pengelompokan Outlet/Store Opsional di Antrean**:
  - Jika antrean berasal dari Tab 3 (`Stok DealPOS`) atau Tab 4 (`Alokasi Distribusi`), setiap item menyimpan metadata `sourceLabel` / `outlet` sehingga:
    - Bisa dicetak **berurutan per Outlet/Store** (memudahkan sortir stiker).
    - Tombol **Cetak Checklist A4** (`ChecklistPrintModal`) langsung mencetak daftar pengecekan fisik per Store/Outlet sesuai antrean aktif.
    - Bisa mencetak **pemisah/header antar store** opsional saat cetak batch.
- **Migrasi Preferensi Pengguna (Zero Friction)**:
  - Membaca dan menggabungkan konfigurasi lama dari `localStorage` (`wms_barcode_print_settings_v3` & `CHO_BARCODE_CONFIG_50x20_V3`) ke kunci konfigurasi terpadu baru agar preferensi printer operator/admin yang sudah tersetel tidak hilang.

---

## 6. Standar UI/UX & Guardrails WMS yang Wajib Dipatuhi

1. **Anti-Pelangi Tombol**: Maksimal **1 tombol solid primary** (`bg-indigo-600 text-white`) per toolbar/bar footer. Aksi sekunder seperti `Unduh CSV`, `Download ZIP`, `Cetak Checklist A4`, `Pilih Semua`, dan `Unduh Template` wajib menggunakan styling *outline* netral.
2. **Master Produk Integrity**: Seluruh lookup nama produk, size, SKU, dan harga referensi saat import atau parsing wajib mengacu pada Master Produk (`lookupProductBySku` di `src/utils/productLookup.ts`).
3. **Typography & Scannability**: SKU, kode outlet/store, qty, dan harga wajib memakai `font-mono` dengan `tabular-nums`, mendukung Light & Dark Mode penuh, serta container desktop `max-w-[1600px] w-full mx-auto` agar proporsional pada semua ukuran zoom.
4. **Hanya 1 Iframe Print Tersembunyi & Konsisten Light Mode**: Menggunakan helper `printHtmlInHiddenIframe` atau container print thermal 50×20 mm dengan `color-scheme: light !important` dan `margin: 0mm` agar printer thermal (Xprinter/TSC/Zebra) tidak memotong tepi label atau ikut gelap di Dark Mode.

---

## 7. Peta Perubahan File & Kompatibilitas Route

| File / Area | Rencana Perubahan | Catatan Kompatibilitas |
| --- | --- | --- |
| `src/components/BarcodeCenter/` *(baru / terstruktur)* | Membuat container terpadu `BarcodeCenterView.tsx`, `UnifiedPreviewAndQueuePanel.tsx`, serta menampung adaptor tab `Stok DealPOS` & `Alokasi Distribusi` yang terhubung ke antrean bersama | Reuse logika parsing dari `src/utils/csvToolsUtils.ts` tanpa duplikasi fungsi |
| `src/components/CetakBarcode/` | Merapikan `TabKatalogMultiSelect`, `TabInputManual`, `TabImportCsv`, dan memperluas `LabelCustomizerPreview` / `types.ts` agar mendukung QR + Barcode 1D (`jsbarcode`) + `sourceOutlet` | Pertahankan migrasi `localStorage` `wms_barcode_print_settings_v3` & `wms_barcode_print_queue_v3` |
| `src/components/tools/CsvBarcodeView.tsx` & `CsvDistribusiView.tsx` | Refactor agar bisa berjalan sebagai tab embedded di dalam `BarcodeCenterView` dengan callback `onAddToPrintQueue(items)` (selain tetap export CSV/ZIP mandiri) | `BatchBarcodePrintModal` tetap disatukan/di-redirect ke engine tunggal agar tidak ada 2 printer berbeda |
| `src/components/CetakLabelView.tsx` | Fokus ke `QR Prefix` & `Label Paket` (tab `Cetak Barcode` diarahkan/tautkan ke menu terpadu atau menjadi wrapper transisi bila dibuka lewat link lama) | Event `wms_open_cetak_label_tab` tetap ditangani aman |
| `src/components/Sidebar.tsx` & `src/App.tsx` | Gabungkan 3 entri menu barcode/CSV menjadi **`Barcode Produk & CSV`**; jaga hash/route alias (`#cetak-barcode`, `#csv-barcode`, `#csv-distribusi`) agar otomatis membuka tab sumber yang tepat | Tidak merusak bookmark atau Keep-Alive tab Desktop (`>= 1024px`) |
| `src/services/permissions.ts` | Evaluasi izin gabungan (`canAccessBarcodeCenter`) dan kontrol visibilitas tab/tombol CSV per role; pertahankan key permission lama di DB agar role user tidak reset | Tidak perlu migrasi DB tabel `wms_users` |
| `src/services/wmsAiExtendedTools.ts` | Perbarui deskripsi pintasan navigasi modul di `WMS_MODULE_CATALOG` jika rute utama disatukan | Navigasi AI `open_wms_module_shortcut` tetap valid |

---

## 8. Rencana Implementasi Bertahap (Checklist Eksekusi)

- [ ] **Tahap 1 — Konsolidasi State, Tipe & Engine Cetak 50×20 mm**
  - Perluas `ProductBarcodeItem` & `BarcodeCustomizerSettings` di `src/components/CetakBarcode/types.ts` untuk mendukung `codeType: 'qr' | 'barcode1d'`, `barcodeWidth`, `barcodeHeight`, `customText`, dan `sourceOutlet`.
  - Gabungkan kemampuan `BatchBarcodePrintModal` (Barcode 1D Code128 + rotasi presisi + font auto-fit + Checklist A4) ke `LabelCustomizerPreview` & engine cetak terpadu (`UnifiedBarcodePrintEngine`), lengkap dengan migrasi `localStorage`.
- [ ] **Tahap 2 — Bangun Halaman Terpadu `BarcodeCenterView` (Split Desktop + Sticky Bottom Mobile)**
  - Buat layout 2 kolom desktop (`~62%` panel 4 Tab Sumber Data, `~38%` sticky panel Live Preview + Antrean Cetak).
  - Implementasikan **Tab 1 (`Master & Manual`)** dengan penggabungan pencarian Master Produk + collapsible Quick Manual Input, serta **Tab 2 (`Import CSV/Excel`)**.
  - Implementasikan Sticky Bottom Bar & Slide-Up Preview/Queue Drawer khusus Mobile (`< 768px`).
- [ ] **Tahap 3 — Integrasi Tab `Stok DealPOS` & Tab `Alokasi Distribusi` ke Antrean Tunggal**
  - Adaptasi `CsvBarcodeView` & `CsvDistribusiView` agar memiliki tombol **"+ Kirim ke Antrean Cetak"** yang langsung mendorong SKU terpilih (beserta qty & label outlet/store-nya) ke panel antrean kanan, plus tombol **"Cetak Checklist A4"** (`ChecklistPrintModal`).
  - Pertahankan 100% fitur **Export CSV / Download ZIP Store** pada kedua tab dengan guard izin role Admin/CSV.
- [ ] **Tahap 4 — Routing Alias, Sidebar, RBAC & Keep-Alive Sync**
  - Perbarui `Sidebar.tsx` & `App.tsx` (alias route `cetak_barcode`, `csv_barcode`, `csv_distribusi` mengarah ke halaman gabungan dengan initial tab otomatis).
  - Sinkronkan `permissions.ts` dan katalog pintasan Asisten AI (`wmsAiExtendedTools.ts`).
- [ ] **Tahap 5 — Uji Fungsional, Build, Memori Permanen & Rilis**
  - Uji cetak thermal QR & Barcode 1D (Landscape & Portrait, Light & Dark Mode), uji export ZIP DealPOS & Excel Distribusi, uji tampilan akun Operator vs Admin, serta uji responsif Desktop Zoom Out/In & Mobile.
  - Perbarui `docs/memory/WMS_FEATURE_REGISTRY.md`, `docs/memory/WMS_MODULE_CHANGELOG.md`, dan ubah status di `docs/PENDING_PLANS.md` menjadi `✅ SELESAI`.
  - Jalankan `npm run build`, `npm run lint`, dan `node tools/bump_version.cjs --minor` + `verify-release`.
