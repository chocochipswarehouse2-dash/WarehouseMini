# Rencana Implementasi: Dashboard Interaktif Simulasi Kapasitas Rak Penyimpanan

## 1. Gambaran Umum & Struktur Halaman Inventory
Halaman **Inventory** (`src/components/InventoryView.tsx`) akan ditingkatkan menjadi pusat kendali penyimpanan gudang terpadu dengan **3 Tab Utama** di bagian atas halaman:

1. **Dashboard Kapasitas Rak** *(Baru)* — Visualisasi interaktif real-time kapasitas seluruh rak gudang, lengkap dengan animasi tingkat keterisian, deteksi overload (`>100%`), rekomendasi rak kosong terdekat per kategori, simulasi pindah barang, dan pengaturan kapasitas.
2. **Data Inventory Produk** *(Eksisting)* — Tabel stok produk per Area dan lokasi rak yang saat ini sudah berjalan, dilengkapi filter Area, pencarian SKU, dan Export CSV.
3. **Log Produk & Mutasi** *(Terintegrasi di Inventory & Tetap Ada di Scanner)* — Riwayat mutasi keluar-masuk barang (`#IN`, `#OUT`, `#SO`, `#ADJ_IN`, `#ADJ_OUT`) dari hasil scan operator/picker secara langsung di halaman Inventory, tanpa menghapus tab Log yang ada di halaman Scanner.

---

## 2. Arsitektur Data & Sinkronisasi Real-Time

### A. Konfigurasi Kapasitas & Zona (`wms_system_docs`)
Pengaturan kapasitas disimpan secara persisten di Supabase melalui dokumen sistem `rack_capacity_config` (dengan fallback `localStorage` agar instan saat dibuka):
- **Default Zona Utama (Area Warehouse)**:
  - **Zona A (`A001` – `A100`)**: Kategori **Dress** · Default Kapasitas Maksimal: `25 pcs` per rak
  - **Zona B (`B001` – `B100`)**: Kategori **Bottom** · Default Kapasitas Maksimal: `40 pcs` per rak
  - **Zona C (`C001` – `C100`)**: Kategori **Top** · Default Kapasitas Maksimal: `35 pcs` per rak
  - **Zona D (`D001` – `D100`)**: Kategori **Sale** · Default Kapasitas Maksimal: `50 pcs` per rak
- **Area Tambahan & Kustom**:
  - Mendukung area gudang lain sesuai standar WMS (**Kolian** `R0.. / V0.. / Z0..`, **Blok F** `TIKTOK / SHOPEE / STUDIO`, **Aksesoris** `BELT / CARD / GIFT / BOX`, **Transit** `X / TRANSIT`) serta kemampuan **Tambah Area & Rentang Lokasi Baru** secara dinamis.
- **Override Spesifik Per Rak**:
  - Setiap lokasi rak (misal `A001 = 25 pcs`, `A005 = 35 pcs`, `B001 = 40 pcs`) dapat memiliki kapasitas maksimal dan label kategori tersendiri yang menimpa pengaturan default zona.

### B. Integrasi Real-Time dengan Stok Fisik (`stok_real_fisik` & `log_produk`)
- Perhitungan isi rak (`terisi_pcs`, `jumlah_sku`, dan `daftar_produk`) dihitung langsung secara reaktif dari `useInventoryStock` (`flattenStock()`) yang terhubung dengan scan `#IN`, `#OUT`, dan `#SO` oleh operator.
- Sesuai aturan mutlak WMS (`GEMINI.md`), fitur **Simulasi Pindah Barang** di dashboard bersifat *non-destruktif* (simulasi visual & lembar kerja rekomendasi untuk picker), sehingga perubahan stok fisik nyata tetap 100% berasal dari scan fisik operator di lapangan.

---

## 3. Fitur Utama Dashboard Interaktif Kapasitas Rak

### 1. Ringkasan Kapasitas Gudang & Kartu Zona (Header Analitik)
- **Total Utilisasi Gudang**: Persentase keterisian keseluruhan gudang (`Total Pcs Terisi / Total Kapasitas Maksimal`), jumlah rak kosong (`0%`), rak aman (`1–70%`), rak hampir penuh (`71–99%`), dan rak overload (`>100%`).
- **Kartu Progres Per Zona/Kategori**: Bar progres animasi untuk **Zona A (Dress)**, **Zona B (Bottom)**, **Zona C (Top)**, **Zona D (Sale)**, dan area lainnya. Klik pada kartu zona akan langsung memfilter tampilan rak ke zona tersebut.

### 2. Mode Tampilan Ganda (Grid Visual Interaktif & Tabel Ringkas)
- **Mode Grid Visual Rak**:
  - Menampilkan deretan rak (`A001` s/d `A100`, dst.) sebagai slot rak modern dengan **animasi bar pengisian vertikal (liquid-fill)** dan angka tabular (`tabular-nums`):
    - **Kosong (`0%`)**: Netral / Abu-abu terang — siap ditempati barang baru.
    - **Aman (`1% – 70%`)**: Hijau Emerald — ruang masih longgar.
    - **Hampir Penuh (`71% – 99%`)**: Kuning Amber — mendekati batas kapasitas.
    - **Overload / Penuh (`>= 100%`)**: **Alert Visual Merah Berkedip** dengan penanda jelas untuk rak yang melebihi kapasitas maksimal.
- **Mode Tabel Ringkas**:
  - Tampilan tabel padat berkecepatan tinggi dengan kolom: `Kode Rak`, `Area & Zona`, `Kategori`, `Stok Saat Ini (pcs)`, `Kapasitas Max (pcs)`, `Persentase (%)`, `Jumlah SKU`, `Status`, dan tombol `Edit Kapasitas Cepat`.

### 3. Filter Cepat & Pencarian Pintar
- Filter 1-klik berdasarkan status rak: **Semua Rak**, **Rak Kosong (0%)**, **Masih Longgar (<70%)**, **Hampir Penuh (71–99%)**, dan **Overload (>100%)**.
- Filter berdasarkan **Zona/Kategori** (`Dress`, `Bottom`, `Top`, `Sale`, dll.) serta pencarian langsung kode lokasi (`A012`) atau kode SKU untuk melacak di rak mana saja produk tersebut berada.

### 4. Drawer Detail Rak & Rekomendasi Otomatis Rak Kosong Terdekat
Saat pengguna mengklik salah satu rak (misal `A001`):
- Menampilkan rincian produk/SKU beserta kuantitas fisik saat ini di rak tersebut.
- Menampilkan **Riwayat Scan Terakhir** (`#IN` / `#OUT` / `#SO`) khusus di lokasi rak tersebut.
- **Rekomendasi Pintar Rak Kosong / Longgar Terdekat**: Jika rak penuh atau overload, sistem otomatis merekomendasikan 5 rak kosong/longgar terdekat pada **kategori yang sama** (misal sesama Zona A - Dress, diurutkan berdasarkan jarak nomor rak terdekat seperti `A002`, `A003`, dst.).
- Input cepat untuk langsung mengubah kapasitas maksimal atau kategori rak tersebut.

### 5. Mode Simulasi Pindah Barang Antar Rak (Pre-Execution Simulator)
- Memungkinkan Admin/Kepala Gudang memilih rak sumber (misal rak yang overload `A001`) dan memindahkan sejumlah `pcs` ke rak tujuan (misal `A004` yang kosong) di dalam layar simulasi.
- Menampilkan **perbandingan persentase rak Sebelum vs Sesudah simulasi** secara langsung.
- Daftar rencana pemindahan dapat disalin sebagai **Instruksi Tugas Pindah Rak (Format WA / Cetak)** untuk dieksekusi oleh picker menggunakan Scanner (`#OUT` rak asal $\rightarrow$ `#IN` rak tujuan).

### 6. Modal Setup Kapasitas Massal & Area Baru
- **Tab Setup Massal per Zona/Prefix**: Atur sekaligus rentang rak (contoh: Prefix `A`, Nomor `001` s/d `100`, Kategori `Dress`, Kapasitas `25 pcs`).
- **Tab Tambah Area / Lokasi Kustom**: Tambahkan zona atau blok penyimpanan baru beserta warna identitas, kategori produk, dan kapasitas standarnya.
- **Tab Edit Spesifik per Rak**: Cari rak tertentu dan sesuaikan kapasitas maksimalnya secara individual.

---

## 4. Rencana Perubahan File
1. `src/services/rackCapacityService.ts` *(Baru)* — Layanan manajemen konfigurasi kapasitas rak, generator default `A001–D100` (`A=Dress`, `B=Bottom`, `C=Top`, `D=Sale`), kalkulator utilisasi real-time, serta algoritma rekomendasi rak terdekat dan simulator relokasi.
2. `src/components/inventory/RackCapacityDashboard.tsx` *(Baru)* — Komponen utama Dashboard Interaktif Kapasitas Rak (Header Zona, Toggle Grid/Tabel, Kartu Rak Animasi, Drawer Detail Rak, Modal Setup Kapasitas, dan Simulator Pindah Barang).
3. `src/components/inventory/InventoryMutationLogTab.tsx` *(Baru)* — Komponen Tab Log Produk & Mutasi di halaman Inventory yang menampilkan riwayat scan `#IN`, `#OUT`, `#SO`, dan `#ADJ` dengan filter lokasi, tipe mutasi, dan pencarian SKU/Invoice.
4. `src/components/InventoryView.tsx` *(Modifikasi)* — Menambahkan navigasi 3 tab (`Dashboard Kapasitas Rak`, `Data Inventory Produk`, `Log Produk & Mutasi`) serta menghubungkan state stok dan log produk.
5. `src/App.tsx` *(Modifikasi Ringan)* — Meneruskan data `logs` (`log_produk`) dan callback refresh ke `InventoryView` agar tab Log Produk di halaman Inventory selalu sinkron dengan halaman Scanner.
