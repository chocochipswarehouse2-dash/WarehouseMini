# 🚀 PANDUAN LENGKAP MIGRASI AKUN SUPABASE — WMS CHOCOCHIPS

> **Tujuan:** Memindahkan seluruh sistem WMS ke akun/project Supabase baru secara aman dan lengkap,  
> tanpa kehilangan data, dan memastikan semua komponen (App, GAS, Fonnte, Vercel, GitHub) kembali berfungsi normal.

---

## 📌 Kapan Perlu Migrasi?

- Limit **Egress 5 GB/bulan** Supabase Free Tier hampir habis
- Ingin pindah ke organisasi/akun Supabase baru
- Rebuild project dari awal (misalnya: database korup/perlu reset total)

---

## 🗺️ Peta Komponen yang Harus Diperbarui

```
┌─────────────────────────────────────────────────────────────┐
│ KOMPONEN             │ FILE/TEMPAT                          │
├─────────────────────────────────────────────────────────────┤
│ App React (Browser)  │ src/services/supabase.ts             │
│ Build (Vercel)       │ Vercel Dashboard > Env Variables     │
│ Build (GitHub Pages) │ GitHub Repo > Secrets > Actions      │
│ GAS Bridge           │ SupabaseBridge_cloud.js (via clasp)  │
│ GAS Script Props     │ GAS Editor > Project Settings        │
│ Webhook WA (Fonnte)  │ Dashboard Fonnte (hanya verifikasi)  │
│ Test Script          │ .env file lokal                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 URUTAN FILE SQL YANG BENAR (untuk Setup DB Baru)

Jalankan semua SQL ini secara berurutan di **Supabase SQL Editor**:

```
1.  supabase_schema.sql              ← Core: wms_users, master_produk, log_produk, dll
2.  supabase_schema_hr.sql           ← HR: karyawan, shift, presensi, lembur, cuti
3.  supabase_schema_agenda_project.sql ← Agenda & Project
4.  supabase_schema_new_tables.sql   ← manual_shipment, pengecekan_sj, outlet_config
5.  supabase_migration.sql           ← Transform data (jalankan SETELAH data termigrasi)
6.  supabase_webhooks.sql            ← Bersihkan trigger lama (opsional)
```

---

## 🛠️ LANGKAH DEMI LANGKAH

---

### LANGKAH 1 — Buat Project Supabase Baru

1. Buka [https://supabase.com/dashboard](https://supabase.com/dashboard) dengan **akun baru atau organisasi baru**.
2. Klik **New Project**, isi:
   - **Name**: `wms-inventory` (atau sesuai preferensi)
   - **Database Password**: buat password kuat, simpan di tempat aman
   - **Region**: `Southeast Asia (Singapore)` untuk latensi terbaik dari Indonesia
   - **Plan**: Free Tier
3. Tunggu 1-2 menit hingga provisioning selesai.
4. Pergi ke **Project Settings → API**, salin:
   - ✅ **Project URL** → contoh: `https://newxxx.supabase.co`
   - ✅ **anon / public key** → `sb_publishable_...` 
   - ✅ **service_role key** → `eyJhbGci...` (simpan **sangat rahasia**, jangan commit!)

---

### LANGKAH 2 — Setup Schema Database Baru

1. Di Supabase Dashboard project **baru**, buka **SQL Editor**.
2. Klik **New Query**.
3. Jalankan file-file SQL berikut satu per satu **(urutan penting!)**:

```sql
-- Paste isi dari: supabase_schema.sql
-- Paste isi dari: supabase_schema_hr.sql
-- Paste isi dari: supabase_schema_agenda_project.sql
-- Paste isi dari: supabase_schema_new_tables.sql
```

4. Setelah tiap file, klik **Run** dan pastikan muncul pesan sukses.

> **Yang dibuat:** 24+ tabel, index, VIEW stok_real_fisik, RLS policies, Realtime publication.

---

### LANGKAH 3 — Migrasi Data (Kloning dari DB Lama ke DB Baru)

#### Opsi A: Via Terminal CLI (Direkomendasikan)

```powershell
# Buka terminal di folder proyek
cd "d:\Antigravity\WMS Inventory"

# Jalankan migrasi (ganti nilai URL dan KEY)
node tools/migrate-supabase.cjs `
  --source-url="https://LAMA.supabase.co" `
  --source-key="sb_publishable_SOURCE_KEY" `
  --target-url="https://BARU.supabase.co" `
  --target-key="sb_publishable_TARGET_KEY"
```

**Flag opsional:**
```powershell
# Dry run dulu (simulasi, tanpa insert data)
node tools/migrate-supabase.cjs ... --dry-run

# Migrasi tabel tertentu saja
node tools/migrate-supabase.cjs ... --tables=wms_users,master_produk,log_produk

# Lewati tabel tertentu
node tools/migrate-supabase.cjs ... --skip=wms_settings,wms_roadmap
```

Script akan otomatis:
- Memverifikasi count source vs target setiap tabel
- Retry 3x jika insert gagal (exponential backoff)
- Menyimpan laporan ke `migration-report-YYYY-MM-DD.json`

#### Opsi B: Via Web App WMS

1. Login ke WMS sebagai **Superadmin**.
2. Sidebar → **Alat & Utilitas → Migrasi Supabase**.
3. Ikuti wizard 5-step yang tersedia.

---

### LANGKAH 4 — Fix Sequence (WAJIB untuk Tabel BIGINT)

Setelah data termigrasi, jalankan SQL berikut di **SQL Editor DB Baru** untuk mencegah duplicate key error:

```sql
-- Fix sequence untuk tabel dengan BIGINT auto-increment
SELECT setval(pg_get_serial_sequence('peminjaman', 'id'),
  COALESCE((SELECT MAX(id) FROM peminjaman), 1));

SELECT setval(pg_get_serial_sequence('perbaikan_tickets', 'id'),
  COALESCE((SELECT MAX(id) FROM perbaikan_tickets), 1));

SELECT setval(pg_get_serial_sequence('qc_reports', 'id'),
  COALESCE((SELECT MAX(id) FROM qc_reports), 1));

SELECT setval(pg_get_serial_sequence('master_shift', 'id'),
  COALESCE((SELECT MAX(id) FROM master_shift), 1));

SELECT setval(pg_get_serial_sequence('roster_shift', 'id'),
  COALESCE((SELECT MAX(id) FROM roster_shift), 1));

SELECT setval(pg_get_serial_sequence('presensi', 'id'),
  COALESCE((SELECT MAX(id) FROM presensi), 1));

SELECT setval(pg_get_serial_sequence('lembur', 'id'),
  COALESCE((SELECT MAX(id) FROM lembur), 1));
```

---

### LANGKAH 5 — Jalankan Script Transformasi Data (Opsional)

Jika ada data di `log_produk` dengan type `PENGECEKAN_SJ` atau `MANUAL_SHIPMENT` yang belum dimigrasikan ke tabel baru:

```powershell
node migrate.js `
  --url="https://BARU.supabase.co" `
  --key="sb_publishable_TARGET_KEY"
```

Kemudian jalankan juga `supabase_migration.sql` di SQL Editor DB baru untuk migrasi permissions.

---

### LANGKAH 6 — Update Kode Sumber (src/services/supabase.ts)

Edit file [`src/services/supabase.ts`](../src/services/supabase.ts), ubah:

```typescript
// Baris 42-43 — ganti dengan URL dan Key baru:
export const DEFAULT_SUPABASE_URL = 'https://BARU.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_NEW_KEY';
```

Juga pastikan filter URL lama ada di baris ~123 dan ~156:
```typescript
// Tambahkan URL lama ke filter blacklist jika belum ada
!customUrl.includes('URL_LAMA_REF')
```

---

### LANGKAH 7 — Update Google Apps Script (GAS)

#### 7a. Update SupabaseBridge_cloud.js

Edit file [`SupabaseBridge_cloud.js`](../SupabaseBridge_cloud.js), ubah baris 6-7:

```javascript
const SUPABASE_URL = "https://BARU.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NEW_ANON_KEY";
```

#### 7b. Deploy Perubahan ke GAS via Script

```powershell
# Pastikan clasp sudah login
node tools/gas_deploy.cjs
```

Script ini akan otomatis:
1. Mengambil file GAS dari cloud
2. Mengupdate `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di SupabaseBridge, WmsAuth, Wmsupdatedatabase
3. Push ke GAS dan buat versi baru
4. Update deployment aktif ke versi terbaru

> **Jika gas_deploy.cjs gagal** (token expired), refresh dengan:  
> `npx @google/clasp login` atau buka GAS Editor manual dan update URL secara langsung.

---

### LANGKAH 8 — Update Script Properties di GAS (WAJIB!)

Script Properties menyimpan Service Role Key yang digunakan GAS untuk bypass RLS.

1. Buka [Google Apps Script](https://script.google.com).
2. Pilih project WMS (cari nama "WMS Inventory" atau "Webhook").
3. Klik ⚙️ **Project Settings** (ikon roda gigi).
4. Scroll ke bawah ke bagian **Script properties**.
5. Cari properti bernama **`SUPABASE_SERVICE_KEY`**.
6. Klik **Edit** dan masukkan **Service Role Key** dari project Supabase baru.
7. Klik **Save script properties**.

> ⚠️ **Jika lupa langkah ini:** Semua operasi GAS yang perlu bypass RLS (seperti sync data ke Sheets) akan gagal dengan error `401 Unauthorized` atau tidak ada data yang terkirim.

---

### LANGKAH 9 — Update Vercel Environment Variables

1. Buka [Vercel Dashboard](https://vercel.com).
2. Pilih project **WMS Inventory**.
3. Tab **Settings → Environment Variables**.
4. Update nilai:
   - **`VITE_SUPABASE_URL`** → `https://BARU.supabase.co`
   - **`VITE_SUPABASE_ANON_KEY`** → `sb_publishable_NEW_KEY`
5. Klik **Save**.
6. Klik **Deployments → Redeploy** (pilih deployment terakhir → **Redeploy**).

> Setelah redeploy, semua user yang buka app via Vercel URL akan otomatis menggunakan DB baru.

---

### LANGKAH 10 — Update GitHub Secrets (untuk GitHub Actions build)

Agar build via GitHub Actions (GitHub Pages) juga menggunakan URL baru:

1. Buka halaman repositori GitHub: `github.com/chocochipswarehouse2-dash/WarehouseMini`
2. Tab **Settings → Secrets and variables → Actions**.
3. Klik **New repository secret** untuk setiap variabel:
   - **`VITE_SUPABASE_URL`** → `https://BARU.supabase.co`
   - **`VITE_SUPABASE_ANON_KEY`** → `sb_publishable_NEW_KEY`
4. Simpan.
5. Trigger build baru: lakukan `git push` atau klik **Actions → Re-run workflow**.

---

### LANGKAH 11 — Verifikasi Fonnte Webhook

Fonnte mengirimkan pesan WA ke GAS Webhook URL. Pastikan URL-nya masih benar:

1. Buka [Dashboard Fonnte](https://fonnte.com/dashboard).
2. Pilih **Device** yang digunakan.
3. Cek **Webhook URL** — harus berisi GAS Web App URL yang aktif.
   - Contoh format: `https://script.google.com/macros/s/XXXXXXXXXX/exec`
4. Jika URL berubah setelah redeploy GAS, update di sini.
5. Klik **Test Webhook** untuk memastikan response `OK`.

> **Cara cek GAS Web App URL yang aktif:**  
> GAS Editor → Deploy → Manage Deployments → salin URL dari deployment aktif.

---

### LANGKAH 12 — Git Commit & Push (Trigger Auto-Deploy)

```powershell
cd "d:\Antigravity\WMS Inventory"
git add -A
git commit -m "chore: migrate Supabase to new project BARU"
git push origin main
```

GitHub Actions akan otomatis build dan deploy ke GitHub Pages.

---

### LANGKAH 13 — Instruksikan Semua Pengguna Clear Cache

Kirim pesan ke semua kru gudang:

> _"Mohon tutup dan buka kembali aplikasi WMS di HP/laptop kalian. Jika masih ada masalah login atau data tidak muncul, lakukan Clear Cache browser dan muat ulang halaman."_

**Untuk pengguna yang perlu clear manual:**

1. Di browser HP/laptop, buka **Pengaturan** (Settings)
2. **Privacy → Clear browsing data**
3. Centang **Cookies** dan **Cached images/files**
4. Klik **Clear data**
5. Buka kembali URL WMS

---

### LANGKAH 14 — Verifikasi End-to-End

Jalankan test script (perbarui `.env` dulu dengan kredensial baru):

```powershell
# Buat file .env dari template
Copy-Item .env.example .env
# Edit .env dengan URL dan key baru
notepad .env

# Jalankan test
npx ts-node test-webhook.ts
```

**Checklist manual:**
- [ ] Login ke app berhasil (semua user)
- [ ] Data Inventory / Stok tampil normal
- [ ] Data Log Mutasi tampil normal
- [ ] Perbaikan Tickets bisa dibuka
- [ ] QC Reports bisa dibuka
- [ ] Scan WA (#IN/#OUT) dari Fonnte masuk ke Supabase baru
- [ ] GAS sync berjalan (cek Sheet Log Product dapat baris baru)
- [ ] Vercel deployment berhasil (tidak ada build error)

---

## 📊 Daftar Tabel yang Dimigrasikan (24 Tabel)

| No | Tabel | Keterangan |
|----|-------|-----------|
| 1 | `wms_users` | Akun login, role, permissions |
| 2 | `master_produk` | Katalog SKU & barcode |
| 3 | `outlet_config` | Daftar outlet & jasa kirim |
| 4 | `address_book` | Buku alamat customer |
| 5 | `log_produk` | Riwayat mutasi IN/OUT/SO |
| 6 | `stock_opname_queue` | Antrean approval opname |
| 7 | `penerimaan_produksi` | Surat jalan kedatangan CMT/kargo |
| 8 | `picking_list` | Tugas picking marketplace |
| 9 | `peminjaman` | Log peminjaman sampel/live |
| 10 | `perbaikan_tickets` | Tiket reject/defect/repair |
| 11 | `qc_reports` | Laporan QC barang masuk |
| 12 | `manual_shipment` | Pengiriman manual & resi |
| 13 | `pengecekan_sj` | Audit verifikasi surat jalan |
| 14 | `karyawan` | Biodata karyawan |
| 15 | `master_shift` | Master jam shift |
| 16 | `roster_shift` | Jadwal shift karyawan |
| 17 | `presensi` | Log absensi harian |
| 18 | `lembur` | Pengajuan & approval lembur |
| 19 | `perijinan_cuti` | Izin, sakit, cuti tahunan |
| 20 | `wms_projects` | Manajemen proyek internal |
| 21 | `wms_agenda` | Agenda & kalender kerja |
| 22 | `wms_roadmap` | Roadmap pengembangan |
| 23 | `wms_system_docs` | Dokumentasi sistem |
| 24 | `wms_settings` | Konfigurasi sistem |

---

## ❓ Troubleshooting

### Q: App terbuka tapi data kosong / loading terus
**A:** Browser masih pakai URL lama dari localStorage. Instruksikan user clear localStorage:
```
F12 → Console → ketik: localStorage.clear() → Enter → reload
```

### Q: Scan WA masuk ke Fonnte tapi tidak masuk ke Supabase
**A:** GAS Webhook masih menunjuk ke URL Supabase lama. Cek GAS Script Properties `SUPABASE_SERVICE_KEY` dan jalankan `gas_deploy.cjs` ulang.

### Q: Error "duplicate key value" saat scan IN pertama kali
**A:** Sequence BIGINT belum di-reset. Jalankan SQL di Langkah 4 (fix sequence).

### Q: GAS deploy gagal dengan error "Token expired"
**A:** Token clasp kadaluarsa. Jalankan di terminal: `npx @google/clasp login`

### Q: Vercel deployment gagal build
**A:** Pastikan GitHub Secrets `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` sudah diset (Langkah 10).

### Q: Supabase Realtime tidak berfungsi (data tidak update otomatis)
**A:** Pastikan tabel sudah di-add ke publication. Jalankan di SQL Editor:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.log_produk;
ALTER PUBLICATION supabase_realtime ADD TABLE public.master_produk;
-- (ulangi untuk tabel lain yang butuh realtime)
```

### Q: Egress DB baru cepat habis setelah migrasi
**A:** Aktifkan caching lokal (IndexedDB) — sudah ada di kode. Pastikan tidak ada loop yang fetch data berulang. Cek di Supabase Dashboard > Usage > Egress.

---

## 🔒 Catatan Keamanan

- **Service Role Key** JANGAN pernah di-commit ke GitHub — selalu simpan di `.env` lokal dan GAS Script Properties
- **anon/public key** aman untuk di-embed di source code (sudah dilindungi RLS)
- File `.env` sudah ada di `.gitignore` — jangan hapus entri ini
- Setelah migrasi selesai, **jangan** bagikan URL dan Key akun lama ke siapapun
