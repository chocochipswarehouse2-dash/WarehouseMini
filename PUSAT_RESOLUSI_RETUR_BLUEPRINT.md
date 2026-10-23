# Blueprint Sistem Pusat Resolusi — Modul Retur Barang (AI Agent & Developer Standard)

Dokumen ini adalah panduan arsitektur, alur kerja (*state machine*), struktur data, dan aturan bisnis untuk sistem **Pusat Resolusi — Retur Barang** pada aplikasi WMS Chocochips. Setiap AI Agent yang memodifikasi modul `PusatResolusi` atau `ManualShipment` **WAJIB** mematuhi standar di dokumen ini.

---

## 1. File Utama & Lokasi Modul
- **UI Utama Pusat Resolusi**: `src/components/PusatResolusi/PusatResolusiView.tsx`
- **Komponen Modul Retur Barang**: `src/components/PusatResolusi/ReturBarangTab.tsx`
- **Service & Data Layer (Supabase + GAS Email)**: `src/services/returBarangService.ts`
- **Isolasi dari Manual Shipment**: `src/services/gasManualShipment.ts` (`fetchManualShipments` memfilter keluar semua baris dengan prefix `RTR-` atau tag `[RETUR_BARANG]:`)
- **GAS Email Webhook**: `gas/webhook.js` (`handleSendEmail` dengan dukungan multi-recipient & CC)

---

## 2. Arsitektur Penyimpanan Database (Zero-DDL Cloud Sync)
Agar berjalan langsung di Supabase tanpa ketergantungan migrasi tabel baru yang memblokir operasional:
1. **Data Tiket Retur (`manual_shipment` dengan Isolasi Ketat)**:
   - Disimpan pada tabel `public.manual_shipment` dengan **`no_pesanan` berawalan `RTR-`** (contoh: `RTR-SHO-261022-ABCD`).
   - Seluruh atribut spesifik retur disimpan secara terstruktur di dalam `notes_paket` menggunakan delimiter **`[RETUR_BARANG]:{...JSON...}`**.
   - Kolom `items` JSONB diisi dengan **`produk_pengganti`** agar 100% kompatibel dengan mesin pencetak Label A6, Picking List, dan pencarian lokasi rak `stok_real_fisik`.
   - **HARD CONSTRAINT ISOLASI**: Fungsi `fetchManualShipments()` di `src/services/gasManualShipment.ts` **WAJIB** mengecualikan baris yang memiliki `no_pesanan.startsWith('RTR-')` atau `notes_paket.includes('[RETUR_BARANG]:')` agar data retur tidak pernah bocor ke tab Rekap Manual Shipment.
2. **Pengaturan Khusus Pusat Resolusi (`wms_system_docs` + `localStorage`)**:
   - Disimpan di tabel `public.wms_system_docs` dengan `section_id = 'pusat_resolusi_settings'` (serta cache `localStorage` `wms_pusat_resolusi_settings`).
   - Menyimpan:
     - `recipient_emails`: Daftar email tim penerima notifikasi otomatis (bisa lebih dari 1 email Gmail, dipisahkan koma).
     - `cc_emails`: Daftar email CC.
     - `from_name`: Nama pengirim email (default: `Chocochips - Pusat Resolusi`).
     - `auto_email_on_submit`: Kirim email otomatis saat CS klik Submit Pesanan Retur.
     - `auto_email_on_complete`: Kirim email otomatis saat Admin input No. Resi Pengiriman (Retur Selesai).
     - `wa_group_picking`: ID grup WhatsApp Fonnte untuk request picking produk pengganti.

---

## 3. Spesifikasi Field Input Form Retur (Tim CS)

### A. Field Wajib (Mandatory saat Submit Awal)
1. **No. Pesanan (`no_pesanan_asal`)**: Nomor pesanan asli dari marketplace/channel (contoh: Order ID Shopee/Tiktok/Website).
2. **Outlet Order (`outlet_order`)**: Komponen *Dropsearch* dengan opsi utama: `Shopee`, `Tiktok`, `Tokped`, `Website`, `Lazada`, `Woocommerce`, `IGlive`, ditambah seluruh daftar Store Outlet resmi.
3. **Kategori & Alasan / Deskripsi Retur (`kategori_alasan` & `alasan_retur`)**:
   - Kategori: `tukar_size_model` (Keinginan Customer), `defect_reject` (Barang Defect/Reject), `salah_kirim` (Salah Kirim Gudang/Store), `lainnya`.
   - Deskripsi detail alasan retur wajib diisi.
4. **Opsi Pengiriman (`opsi_pengiriman`)**: Komponen *Dropsearch* ekspedisi pengiriman barang pengganti (`JNE Regular`, `J&T Express`, `SiCepat REG`, `GoSend`, dll.).
5. **Data Customer**:
   - `Nama Customer` (`nama_customer`) — Wajib
   - `No. HP / WhatsApp` (`no_hp`) — Wajib
   - `Alamat Lengkap` (`alamat_lengkap`) — Wajib
6. **Produk Pesanan (`produk_pesanan` — Barang yang Diretur Customer)**:
   - Terhubung ke pencarian Katalog SKU (`master_produk`).
   - Wajib memiliki minimal 1 item (`sku`, `nama_produk`, `size`, `qty`).
7. **Produk Pengganti (`produk_pengganti` — Barang yang Dikirim ke Customer)**:
   - Terhubung ke pencarian Katalog SKU (`master_produk`) + tombol pintas *"Salin dari Produk Pesanan"*.
   - Wajib memiliki minimal 1 item (`sku`, `nama_produk`, `size`, `qty`) **DAN wajib memilih `fulfillment`** (`Marketplace` atau nama Store Outlet).

### B. Field Opsional / Bisa Dikosongkan di Awal Input (Menyusul)
1. **Selisih Harga yang Harus Dibayar (`selisih_harga`)**: Boleh kosong (`null`) saat submit awal, bisa diupdate lewat tombol **+ Update Biaya / Bukti Bayar** atau **Edit**.
2. **Ongkir yang Perlu Dibayar (`ongkir_dibayar`)**: Boleh kosong (`null`) saat submit awal. Jika kategori retur adalah `defect_reject` atau `salah_kirim`, penanggung biaya otomatis disetel ke `toko_free` (Free Ongkir / Ditanggung Toko).
3. **Lampiran Bukti Pembayaran (`bukti_pembayaran_urls`)**: Boleh kosong (`[]`) di awal, diunggah ke Google Drive (`uploadImageToGDrive`) saat bukti transfer customer sudah diterima.
4. **Lampiran Foto Barang / Komplain (`foto_komplain_urls`)** & **No. Resi Balik dari Customer (`no_resi_customer`)**: Opsional.

---

## 4. Alur Tahapan Status (State Machine 3 Tahap)

Setiap tiket retur berjalan melewati 3 tahap utama yang dihitung secara deterministik oleh `computeReturEffectiveStatus(order)`:

```text
[1. PESANAN BARU ('diterima')]
   │  • Baru disubmit oleh Tim CS
   │  • Email notifikasi otomatis dikirim ke daftar email tim via GAS (MailApp.sendEmail)
   │  • Belum dicetak Label A6 / Picking List & belum ada dokumen DealPOS Admin
   ▼
   ├── Trigger Pindah ke Tahap 2:
   │   - Cetak Label A6 (is_label_printed = true), ATAU
   │   - Cetak Picking List (is_picking_printed = true), ATAU
   │   - Kirim Request Picking WA Grup (is_wa_picking_sent = true), ATAU
   │   - Admin mengisi No. SJ DealPOS to Gudang Retur (no_sj_gudang_retur), ATAU
   │   - Admin mengisi No. Invoice Return DealPOS (no_invoice_return)
   ▼
[2. PESANAN DIPROSES ('diproses')]
   │  • Tim Gudang menyiapkan Produk Pengganti (Picking & Packing)
   │  • Admin WH menginput:
   │      1) No. SJ DealPOS (to Gudang Retur) -> no_sj_gudang_retur
   │      2) No. Invoice Return DealPOS -> no_invoice_return (saat proses retur di DealPOS selesai)
   ▼
   ├── Trigger Pindah ke Tahap 3:
   │   - Admin menginput No. Resi Pengiriman (no_resi terisi)
   ▼
[3. PESANAN SELESAI ('dikirim')]
      • Produk pengganti telah dikirim ke customer dengan nomor resi ekspedisi
      • Email notifikasi penyelesaian retur dikirim ke tim (jika diaktifkan)
```

---

## 5. Standar Dokumen Cetak & Integrasi DealPOS / WA

### A. Dua Dokumen DealPOS Admin
1. **`no_sj_gudang_retur` (SJ DealPOS to Gudang Retur)**:
   - Diisi oleh Admin untuk mencatat mutasi barang retur ke Gudang Retur / pengambilan barang pengganti.
2. **`no_invoice_return` (Invoice Return DealPOS)**:
   - Diisi oleh Admin saat proses retur di DealPOS telah selesai dan barang retur dikirim.

### B. Standar Cetak Label A6 & Picking List
1. **Label A6 (`100mm x 150mm`)**:
   - Tata letak identik dengan Label A6 Manual Shipment.
   - **HARD CONSTRAINT**: Tabel produk yang terlampir di Label A6 **WAJIB mengambil data dari `produk_pengganti`** (bukan `produk_pesanan`), dilengkapi penanda **`RETUR`** di header dan nomor pesanan asal di bawah QR Code.
2. **Picking List (`A4 Portrait`) & WA Grup Picking**:
   - Tata letak identik dengan Picking List Manual Shipment.
   - Mengambil daftar **`produk_pengganti`** dan memperkaya kolom **Lokasi Rak** secara real-time dari tabel `stok_real_fisik` di Supabase jika fulfillment adalah `Marketplace`.
   - Jika `produk_pengganti` memiliki fulfillment `Marketplace`, tombol **WA Grup Picking** mengirim rincian SKU, Nama Produk, Size, Qty, dan Lokasi Rak langsung ke Grup WA Gudang melalui Fonnte.
