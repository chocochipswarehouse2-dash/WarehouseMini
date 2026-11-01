# Live Chat & Ruang Diskusi Operasional Multi-User + Unified Background Notification (Direct Reply)

Fitur komunikasi instan terintegrasi di dalam ekosistem **WMS Warehouse Mini** dengan **riwayat chat permanen**, **aturan Edit & Hapus pesan berstandar audit gudang (batas 5 menit & kunci saat sudah dibaca `✓✓`)**, **fitur Balas Langsung (*Inline Direct Reply*) dari Notification Bar HP/Desktop tanpa perlu membuka aplikasi**, serta **Sinkronisasi Background Terpadu untuk Notifikasi Pesanan Baru (Manual Shipment, Alter/Repair, Retur Barang, dan SPS)**.

---

## User Review & Keputusan Produk Utama

> [!IMPORTANT]
> Berikut adalah penyempurnaan rancangan berdasarkan masukan terbaru Anda mengenai **Balas Chat dari Notification Bar** dan **Sinkronisasi Notifikasi Pesanan Baru (Manual Shipment & Retur)** di background:

### 1. Balas Chat Langsung dari Notification Bar Tanpa Buka Aplikasi (*Inline Direct Reply* ala WhatsApp)
Menggunakan fitur **Service Worker Notification Actions (`type: 'text'`)** pada `public/pwa-extras.js`:
- Saat ada pesan Live Chat masuk ketika aplikasi sedang tertutup/di-*minimize*, notifikasi yang muncul di bar atas HP Android / Desktop memiliki **2 Tombol Aksi Langsung**:
  1. **`💬 Balas Cepat` (*Inline Text Input*)**: Ketika diketuk, langsung memunculkan kolom ketik balasan di dalam bar notifikasi HP/Desktop (persis seperti WhatsApp). Begitu Anda ketik dan tekan kirim, **Service Worker langsung mengirim balasan tersebut ke ruang chat di background tanpa perlu membuka halaman aplikasi WMS**!
  2. **`✓✓ Tandai Dibaca`**: Langsung mengubah status pesan menjadi sudah dibaca (`✓✓`) dan menutup notifikasi tanpa perlu membuka aplikasi.

### 2. Sinkronisasi Terpadu Background: Live Chat + Manual Shipment + Alter + Retur Barang + SPS
Dengan diaktifkannya mesin **Unified Live Background Sync** di `public/pwa-extras.js` dan penghubung otomatis saat user login di aplikasi:
- **Tidak hanya Live Chat**, tetapi seluruh aktivitas krusial gudang otomatis ikut tersinkronisasi secara *real-time* di background:
  - **`💬 Live Chat & Ruang Diskusi`**: Pesan pribadi (1-on-1) maupun pesan Grup Diskusi yang menyebut/melibatkan Anda.
  - **`🛍️ Manual Shipment & ✂️ Form Alter/Repair Baru`**: Begitu Store menginput pesanan baru, Admin langsung mendapat notifikasi sistem (lengkap dengan tombol aksi cepat di notifikasi).
  - **`🔄 Tiket Retur Barang Baru (Pusat Resolusi)`**: Begitu CS/Store mengajukan retur `RTR-...`, notifikasi langsung muncul di bar HP/Desktop Admin.
  - **`📋 Permintaan Peminjaman Sementara (SPS) Baru`**: Notifikasi otomatis untuk Admin dan Tim Picker saat ada pengajuan SPS baru.

### 3. Riwayat Chat Permanen (Tidak Pernah Hilang) & Hemat Kuota Supabase Free Tier
- **Lapis 1 (`IndexedDB` Perangkat)**: Menyimpan seluruh riwayat chat lama secara permanen di perangkat masing-masing (`0 Byte` Egress Supabase saat buka chat lama).
- **Lapis 2 (Supabase Hot Store)**: Menyimpan pesan aktif lintas perangkat (sangat hemat: 10.000 pesan teks = `~1,8 MB`).
- **Lapis 3 (Arsip Otomatis ke Google Drive via GAS)**: Foto kendala (`0 Byte` di Supabase) dan arsip chat lama otomatis tersimpan di Google Drive Anda (kuota 15 GB gratis Google).

### 4. Fitur Edit & Hapus Pesan Berstandar Audit Gudang (`✓✓ Dibaca` & Batas 5 Menit)
- **Bisa Edit / Hapus**: Hanya jika **belum dibaca user lain (`✓`) DAN masih dalam batas waktu $\le 5$ menit** sejak dikirim.
- **Penanda Transparan**:
  - Jika diedit $\rightarrow$ muncul label **`(Diedit • 14:25)`**.
  - Jika dihapus $\rightarrow$ berubah menjadi jejak **`🚫 Pesan ini telah dihapus oleh [Nama]`**.
- **Terkunci Otomatis**: Begitu pesan **sudah dibaca (`✓✓`)** oleh penerima atau **lewat 5 menit**, tombol Edit & Hapus otomatis terkunci demi menjaga akuntabilitas instruksi gudang.

---

## 1. Gambaran Umum & Konsep Inti

- **Apa yang Dilakukan**: Menghadirkan sistem **Live Chat (1-on-1) & Ruang Diskusi Grup** yang menampilkan user *Online* secara *real-time*, mendukung lampiran foto kendala (via Google Drive CDN), tag referensi `#Order / #SJ / #SKU`, fitur **Edit & Hapus Pesan berbatas 5 menit / status baca**, serta **Unified Background Notification dengan Inline Reply**.
- **Hak Akses Grup**:
  - **Hanya Admin & Superadmin** yang dapat membuat **Ruang Diskusi Grup baru** dan menambahkan (*ADD*) beberapa user ke dalamnya.
  - Seluruh user dapat memulai chat personal (1-on-1) dengan rekan yang sedang online/offline dan berdiskusi di grup tempat mereka tergabung.

---

## 2. Pengalaman Pengguna (UX) & Desain Visual

### Alur Balas Cepat dari Notification Bar (Tanpa Buka Aplikasi)

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔔 WMS Warehouse Mini • Baru saja                                    │
│ 💬 Budi (Picker) di Grup: Koordinasi SO Blok A                       │
│ "Kak, untuk SKU F26KTN07BAD di rak A012 fisik sisa 3 pcs ya"         │
│                                                                      │
│  [ 💬 Balas Cepat ]    [ ✓✓ Tandai Dibaca ]    [ 👁️ Buka Ruang ]     │
├──────────────────────────────────────────────────────────────────────┤
│  Ketik balasan langsung di sini...                              [➤]  │
└──────────────────────────────────────────────────────────────────────┘
```

1. **Ketuk `💬 Balas Cepat`**: Kolom input terbuka langsung di bar notifikasi.
2. **Ketik & Tekan Kirim (`➤`)**: Service Worker mengirim pesan balasan ke ruang chat terkait atas nama akun Anda, memperbarui status pesan sebelumnya menjadi **`✓✓ Dibaca`**, dan menampilkan konfirmasi singkat *"✓ Balasan terkirim"* tanpa perlu membuka layar aplikasi WMS.

### Mode Tampilan Hybrid di Dalam Aplikasi (Floating Cepat + Halaman Penuh)

- **Floating Chat Button & Drawer**: Tombol melayang di pojok kanan bawah dengan badge jumlah pesan belum dibaca & indikator jumlah user online. Bisa dibuka sebagai panel cepat di atas halaman mana pun.
- **Halaman Penuh (Full-Page Workspace)**: Tampilan *Master-Detail* 2 kolom di layar Desktop dan tampilan responsif dengan sub-tab *horizontal swipe* di layar HP seluler.

---

## 3. Arsitektur Penyimpanan & Unified Background Sync

### Diagram Arsitektur Sistem

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   KLIEN WMS & PWA SERVICE WORKER (HP / PC)                 │
│                                                                            │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │  UI Live Chat (Floating & Full)  │  │  Unified Background Watcher    │  │
│  │  - Status Online & Typing        │  │  (public/pwa-extras.js)        │  │
│  │  - ✓ / ✓✓ Read Receipt           │  │  1. Live Chat (+ Inline Reply) │  │
│  │  - Edit/Hapus (<5 mnt & Unread)  │  │  2. Manual Shipment & Alter    │  │
│  │  - Tag #Order / #SJ / #SKU       │  │  3. Retur Barang (RTR) & SPS   │  │
│  └────────────────┬─────────────────┘  └───────────────┬────────────────┘  │
│                   │                                    │                   │
│                   ▼                                    ▼                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │        Lapis 1: Penyimpanan Permanen Perangkat (IndexedDB)           │  │
│  │  - Menyimpan seluruh riwayat chat lama di HP/Browser (0 Egress DB)   │  │
│  └────────┬───────────────────────────────────┬─────────────────────────┘  │
└───────────┼───────────────────────────────────┼───────────────────────────┘
            │                                   │
   WebSocket Broadcast +                Foto Kendala & Arsip Lama
   Hot Sync (Hemat Egress)              Disimpan di Google Drive (GAS)
            │                                   │
            ▼                                   ▼
┌───────────────────────────────────┐ ┌─────────────────────────────────────┐
│     INFRASTRUKTUR SUPABASE        │ │      GOOGLE DRIVE CDN (VIA GAS)     │
│  - Realtime Presence & Broadcast  │ │  - Foto Chat (0 Byte di Supabase)   │
│  - Lapis 2: Hot Message Store     │ │  - Lapis 3: Arsip Chat Lama (JSON)  │
└───────────────────────────────────┘ └─────────────────────────────────────┘
```

### Sinkronisasi Otomatis Konfigurasi Background (`WMS_CONFIGURE_SW_WATCHER`)

Begitu pengguna login ke aplikasi WMS, sistem otomatis menyinkronkan profil pengguna (`username`, `displayName`, `role`, `storeName`, `isAdmin`, `isPicker`) ke `IndexedDB` Service Worker (`wms_sw_bg_db`). Dengan demikian, meskipun tab aplikasi sedang di-*minimize* atau tidak sedang fokus:
1. **Pesan Live Chat Baru** yang masuk ke ruang pribadi/grup pengguna langsung memicu notifikasi dengan tombol **`💬 Balas Cepat`** & **`✓✓ Tandai Dibaca`**.
2. **Pesanan Baru Manual Shipment, Form Alter/Repair, Tiket Retur Barang (`RTR-`), dan SPS** otomatis terdeteksi secara berkala dan memunculkan notifikasi sistem real-time sesuai hak akses pengguna.
