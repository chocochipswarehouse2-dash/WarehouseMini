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

### Hierarki Struktur Menu, Tab & Action (Final)

**1. OPERASIONAL WAREHOUSE**
* **Dashboard** (`menu_ops_dashboard`)
* **Agenda dan Project** (`menu_ops_agenda`)
  * Tab: Kalendar Kerja (`tab_ops_agenda_kalendar`)
  * Tab: Project & Task (`tab_ops_agenda_project`)
* **Pesanan Saya** (`menu_ops_pesanan_saya`)
  * Tab: Dashboard (`tab_ops_pesanan_dashboard`)
  * Tab: Manual Shipment (`tab_ops_pesanan_manual_shipment`)
  * Tab: Transfer Order (`tab_ops_pesanan_transfer_order`)
  * Tab: Shopee (`tab_ops_pesanan_shopee`)
  * Tab: Tiktok (`tab_ops_pesanan_tiktok`)
  * Tab: Website (`tab_ops_pesanan_website`)
  * Tab: Woocommerce (`tab_ops_pesanan_woocommerce`)
  * Tab: Lazada (`tab_ops_pesanan_lazada`)
* **Pusat Resolusi** (`menu_ops_resolusi`)
  * Tab: Retur Penukaran (`tab_ops_resolusi_retur`)
  * Tab: Pengembalian Dana (`tab_ops_resolusi_refund`)
  * Tab: Pengiriman Gagal (`tab_ops_resolusi_gagal`)
  * Tab: Komplain Customer (`tab_ops_resolusi_komplain`)
  * Tab: Report Rating (`tab_ops_resolusi_rating`)
* **Loading Dock** (`menu_ops_loading_dock`)
  * Tab: Penerimaan Produksi (`tab_ops_loading_produksi`)
  * Tab: Penerimaan Barang (`tab_ops_loading_penerimaan`)
  * Tab: Pengiriman Barang (`tab_ops_loading_pengiriman`)
* **Operasi Stok (Scanner, Mutasi, SO)** (`menu_ops_mutasi`)
  * Tab: Scanner (`tab_ops_mutasi_scanner`)
  * Tab: Mutasi Log (`tab_ops_mutasi_log`)
  * Tab: Stock Opname (`tab_ops_mutasi_so`)
* **Quality Control** (`menu_ops_qc`)
  * Tab: Reject (`tab_ops_qc_reject`)
  * Tab: Cuci (`tab_ops_qc_cuci`)
  * Tab: Permak (`tab_ops_qc_permak`)
  * Tab: Defect (`tab_ops_qc_defect`)
* **Inventory** (`menu_ops_inventory`)
* **Tugas Picking** (`menu_ops_picking`)
* **Peminjaman** (`menu_ops_peminjaman`)
* **Roadmap & Update** (`menu_ops_roadmap`)

**2. KARYAWAN & PRESENSI**
* **Data Karyawan** (`menu_hr_karyawan`)
* **Presensi & Jadwal** (`menu_hr_presensi`)
* **Roster Shift** (`menu_hr_roster`)
* **Lembur & Cuti** (`menu_hr_lembur_cuti`)
* **HR Approval** (`menu_hr_approval`)

**3. ALAT & UTILITAS**
* *(Superadmin ONLY)*

**4. ACTION / EXTRA PERMISSIONS**
* `action_cetak_label`: Akses cetak label.
* `action_export_data`: Ekspor data ke CSV/Excel.
* `action_import_data`: Impor data.
* `action_sync_dealpos`: Sinkronisasi dengan API DealPOS.
* `action_edit_master`: Izin edit master data.
* `action_delete_master`: Izin delete master data.
