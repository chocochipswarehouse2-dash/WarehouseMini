<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f4e75b90-7b34-4f2a-8a74-240b96f37e4c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## ATURAN AGEN (AGENT RULES)
- **WAJIB DEPLOY:** Jika ada perubahan kode yang sudah final/selesai dikerjakan, Anda **WAJIB** melakukan commit dan push ke GitHub (yang akan men-*trigger* deploy) sebelum mengakhiri sesi. Jangan biarkan perubahan kode belum di-*push*!

## 🚀 Migrasi Akun Supabase (Bypass Limit Egress)
- **Halaman Setup Web App:** Akses menu `Sidebar -> Alat & Utilitas -> Migrasi Supabase` (Khusus Superadmin).
- **Master Schema DDL:** File [supabase_full_schema.sql](public/supabase_full_schema.sql) berisi DDL lengkap 18 tabel, index, views saldo fisik, RLS, & realtime.
- **Script CLI:** Jalankan `node tools/migrate-supabase.cjs` untuk kloning data via terminal.
- **Dokumentasi Lengkap:** Baca panduan di [docs/PANDUAN_MIGRASI_SUPABASE.md](docs/PANDUAN_MIGRASI_SUPABASE.md).

## 🔐 Hak Akses Bertingkat (Hierarchical & Granular Permissions)
Sistem WMS menggunakan kontrol akses yang mendetail hingga ke level Menu, Submenu, Tab, dan Aksi. 
Setiap kali ada perubahan struktur UI, list di bawah ini harus terus di-update!

### Aturan Dasar (Base Rules)
1. **Superadmin (Master)**: Memiliki akses absolut ke semua fitur (contoh user: `warehouse`). 
2. **Alat & Utilitas**: Menu ini bersifat **Superadmin ONLY**. User biasa tidak boleh mengaksesnya.
3. **Konfigurasi Kustom**: User selain superadmin memiliki akses kosong (blank) pada awalnya, dan role akses mereka harus diatur (di-*setup*) satu per satu secara granular oleh Superadmin. (Role/Jabatan hanya sebagai penanda/label).

### Hierarki Struktur Menu & Tab (Draft Saat Ini)

**1. OPERASIONAL WAREHOUSE**
* **Dashboard** (Single Page)
* **Agenda dan Project**
  * Tab: Kalendar Kerja
  * Tab: Project & Task
* **Pesanan Saya**
  * Tab: Dashboard
  * Tab: Manual Shipment
  * Tab: Transfer Order
  * Tab: Shopee
  * Tab: Tiktok
  * Tab: Website
  * Tab: Woocommerce
  * Tab: Lazada
* **Pusat Resolusi**
  * Tab: Retur Penukaran
  * Tab: Pengembalian Dana
  * Tab: Pengiriman Gagal
  * Tab: Komplain Customer
  * Tab: Report Rating
* **Loading Dock**
  * Tab: Penerimaan Produksi
  * Tab: Penerimaan Barang
  * Tab: Pengiriman Barang
* **Scanner | Mutasi | SO**
  * Tab: Scanner
  * Tab: Mutasi Log
  * Tab: Stock Opname
* **Quality Control**
  * (4 Tab)
* **Inventory** (Single Page)
* *(Dan menu operasional lainnya...)*

**2. KARYAWAN & PRESENSI**
* *(Akan di-mapping sesuai struktur menu HR saat ini)*

**3. ALAT & UTILITAS**
* *(Superadmin ONLY)*

