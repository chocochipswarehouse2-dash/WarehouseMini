# 🚀 PANDUAN LENGKAP MIGRASI AKUN SUPABASE WMS INVENTORY

> **Tujuan:** Mengatasi pembatasan limit **Egress 5 GB/bulan** pada Supabase Free Tier dengan cara berpindah ke akun Supabase baru secara mudah, aman, dan tanpa kehilangan riwayat maupun data stok.

---

## 📌 Ringkasan Solusi

WMS Inventory menyediakan 2 cara fleksibel untuk migrasi:

1. **Cara 1: Lewat Halaman Web App WMS (Sangat Direkomendasikan & Paling Mudah)**
   - Dapat diakses langsung dari menu **Sidebar -> Alat & Utilitas -> Migrasi Supabase** (khusus Superadmin).
   - Terdapat 5-step wizard otomatis:
     - Step 1: Petunjuk buat project Supabase baru.
     - Step 2: Copy/Download 1-klik seluruh skrip DDL SQL (24 tabel, index, view saldo fisik, RLS, realtime).
     - Step 3: Input URL & Anon Key project baru + tes koneksi instan.
     - Step 4: Scan baris tabel & Kloning data otomatis langsung di dalam browser (batching aman & progress bar realtime).
     - Step 5: Switch akun Supabase aktif di browser seketika + copy env variable untuk Vercel.

2. **Cara 2: Lewat Command Line (Node.js Script)**
   - Jalankan `node tools/migrate-supabase.cjs`.
   - Mengkloning seluruh data dari database lama ke database baru secara headless di terminal/server.

---

## 🛠️ Langkah Demi Langkah (Step-by-Step)

### LANGKAH 1: Buat Akun & Project Baru di Supabase
1. Buka [https://supabase.com/dashboard](https://supabase.com/dashboard) menggunakan akun Google / GitHub baru atau organisasi baru.
2. Klik **New Project**.
3. Masukkan:
   - **Name**: `wms-inventory` (atau nama gudang Anda).
   - **Database Password**: Buat password yang kuat dan simpan baik-baik.
   - **Region**: Pilih **Singapore (ap-southeast-1)** untuk kecepatan latensi terbaik dari Indonesia.
   - **Pricing Plan**: Free Tier.
4. Tunggu 1-2 menit hingga provisioning database selesai.
5. Pergi ke menu **Project Settings** -> **API**:
   - Salin **Project URL** (contoh: `https://abcdefghijklmn.supabase.co`).
   - Salin **anon / public key** (`eyJhbGci...`).
   - *(Opsional jika lewat script CLI)*: Salin **service_role key** untuk bypass RLS.

---

### LANGKAH 2: Deploy Seluruh Struktur Tabel (Schema DDL)
Database baru belum memiliki tabel apapun. Anda perlu mengeksekusi DDL master yang sudah disiapkan:

1. Di Supabase Dashboard project baru, buka menu **SQL Editor** (ikon `>_` di menu kiri).
2. Klik tombol **New query**.
3. Ambil isi skrip SQL dari salah satu sumber berikut:
   - File lokal di repositori: `public/supabase_full_schema.sql`
   - Atau lewat Web App WMS: Menu **Migrasi Supabase -> Step 2 -> Klik "Salin Skrip SQL DDL"**
4. Tempelkan (paste) seluruh isi SQL tersebut ke dalam SQL Editor Supabase.
5. Klik tombol **Run** (atau tekan `Ctrl + Enter`).
6. Pastikan muncul pesan **"Success. No rows returned"**.

> **Apa saja yang dibuat oleh skrip ini?**
> - Seluruh 24 tabel WMS: `wms_users`, `master_produk`, `log_produk`, `stock_opname_queue`, `penerimaan_produksi`, `picking_list`, `peminjaman`, `perbaikan_tickets`, `qc_reports`, `manual_shipment`, `pengecekan_sj`, `address_book`, `karyawan`, `master_shift`, `roster_shift`, `presensi`, `lembur`, `perijinan_cuti`, `wms_projects`, `wms_agenda`, `wms_roadmap`, `wms_system_docs`, `outlet_config`, `wms_settings`.
> - View `stok_real_fisik` dan `view_stok_realtime`.
> - Indeks performa pencarian barcode, tanggal, SKU, status.
> - Row Level Security (RLS) permissive policies.
> - Supabase Realtime publication untuk sinkronisasi multi-device.

---

### LANGKAH 3: Kloning Data dari Database Lama ke Database Baru

#### Opsi A: Menggunakan Halaman Web App WMS (Rekomendasi)
1. Buka WMS Inventory di browser dan login sebagai akun ber-role **Superadmin**.
2. Klik menu **Migrasi Supabase** di bagian bawah Sidebar.
3. Di **Langkah 3 (Koneksi Database)**:
   - Masukkan **Supabase URL Baru** dan **Anon Key Baru** yang Anda dapatkan di Langkah 1.
   - Klik **"Cek Koneksi Database Baru"**. Pastikan muncul centang hijau *Koneksi Berhasil!*.
4. Di **Langkah 4 (Kloning Data Otomatis)**:
   - Klik tombol **"1. Pindai Data Database Lama"** untuk melihat jumlah baris di setiap tabel.
   - Klik tombol **"2. Mulai Kloning Semua Data ke Database Baru"**.
   - Sistem akan menyalin data baris per baris secara bertahap (batch) dengan indikator progress bar dan log aktivitas real-time.
   - Tunggu hingga muncul notifikasi **"Kloning Selesai 100%"**.

#### Opsi B: Menggunakan Script Terminal (Node.js)
Jika ingin melakukan migrasi dari terminal / command line:
1. Buka terminal di folder proyek (`d:\Antigravity\WMS Inventory`).
2. Jalankan perintah:
   ```bash
   node tools/migrate-supabase.cjs
   ```
3. Script akan membaca konfigurasi database lama dari `.env` dan meminta URL/Key database baru, atau Anda bisa langsung mengirimkan environment variable:
   ```bash
   $env:TARGET_SUPABASE_URL="https://abcdefghijklmn.supabase.co"
   $env:TARGET_SUPABASE_KEY="eyJhbGciOi..."
   node tools/migrate-supabase.cjs
   ```
4. Script akan menyalin seluruh data per tabel dengan pagination batch 500 baris.

---

### LANGKAH 4: Alihkan Web App ke Database Baru

#### 1. Untuk Perangkat/Browser Anda Saat Ini (Instan):
- Pada halaman **Migrasi Supabase -> Step 5**, klik tombol:
  👉 **"Aktifkan Database Baru Sekarang (Simpan & Reload)"**
- Halaman akan memuat ulang (reload) dan langsung tersambung ke database Supabase baru.

#### 2. Untuk Seluruh Pengguna & Server Vercel (Produksi):
Agar semua kru gudang, HP Android scanner, dan laptop admin tersambung ke database baru secara permanen:
1. Buka dashboard hosting Vercel di [https://vercel.com](https://vercel.com).
2. Pilih project **WMS Inventory**.
3. Masuk ke tab **Settings** -> **Environment Variables**.
4. Ubah nilai variabel berikut:
   - `VITE_SUPABASE_URL`: isi dengan URL Supabase baru.
   - `VITE_SUPABASE_ANON_KEY`: isi dengan Anon Key Supabase baru.
5. Simpan dan lakukan **Redeploy** (atau lakukan commit git push baru).

---

## 📋 Daftar Tabel yang Dimigrasikan

| No | Nama Tabel | Deskripsi Data |
|---|---|---|
| 1 | `wms_users` | Akun pengguna, PIN login, role, hak akses |
| 2 | `master_produk` | Master katalog SKU, barcode, nama barang, kategori |
| 3 | `log_produk` | Riwayat mutasi IN / OUT / SO gudang |
| 4 | `stock_opname_queue` | Antrean approval stock opname fisik |
| 5 | `penerimaan_produksi` | Surat jalan kedatangan CMT & kargo |
| 6 | `picking_list` | Tugas picking surat jalan order penjualan |
| 7 | `peminjaman` | Log peminjaman sampel, live streaming, studio |
| 8 | `perbaikan_tickets` | Tiket perbaikan barang reject / defect |
| 9 | `qc_reports` | Laporan quality control barang masuk/keluar |
| 10 | `manual_shipment` | Rekap pengiriman paket manual & resi ekspedisi |
| 11 | `pengecekan_sj` | Data audit verifikasi surat jalan |
| 12 | `address_book` | Buku alamat pengiriman tujuan & customer |
| 13 | `karyawan` | Master direktori biodata karyawan |
| 14 | `master_shift` | Master pengaturan jam shift kerja |
| 15 | `roster_shift` | Penjadwalan roster shift karyawan harian |
| 16 | `presensi` | Log absensi GPS / foto masuk & pulang |
| 17 | `lembur` | Pengajuan lembur dan approval HR |
| 18 | `perijinan_cuti` | Pengajuan izin, sakit, cuti tahunan karyawan |

---

## ❓ FAQ & Troubleshooting

### Q: Apa yang terjadi jika akun lama terblokir atau limit egress habis 100%?
Jika egress akun lama sudah mencapai limit 5GB, Supabase akan memblokir request API ke akun tersebut. Lakukan migrasi **sebelum** tanggal akhir bulan atau saat pemakaian egress mencapai 80-90%. Dashboard Supabase menampilkan indikator pemakaian egress di menu *Organization Settings -> Usage*.

### Q: Apakah data di database baru bisa diverifikasi?
Bisa. Setelah migrasi, buka halaman **Inventory** atau **Mutasi Log**. Cek apakah saldo fisik, riwayat transaksi, dan user login sudah sama persis dengan sebelumnya.

### Q: Bagaimana jika saya ingin kembali ke database sebelumnya?
Pada halaman **Migrasi Supabase**, terdapat tombol merah **"Kembalikan ke Database Default (Reset)"** yang akan menghapus override kustom di browser dan mengembalikan koneksi ke env default.
