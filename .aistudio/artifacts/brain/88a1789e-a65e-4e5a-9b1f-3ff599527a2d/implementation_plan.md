# Live Chat & Ruang Diskusi Operasional Multi-User + Unified Background Notification (Direct Reply)

Fitur komunikasi instan terintegrasi di dalam ekosistem **WMS Warehouse Mini** yang **langsung aktif tanpa perlu membuat tabel baru di Supabase (Zero-Setup)**, **otomatis aktif saat menambah user baru**, memiliki **riwayat chat permanen**, **aturan Edit & Hapus pesan berstandar audit gudang (batas 5 menit & kunci saat sudah dibaca `✓✓`)**, serta **fitur Balas Langsung (*Inline Direct Reply*) dari Notification Bar HP/Desktop**.

---

## User Review & Keputusan Produk Utama

> [!IMPORTANT]
> Berikut adalah rangkuman lengkap seluruh keputusan yang telah disepakati sebelum eksekusi pembuatan kode:

### 1. Tidak Perlu Buat Tabel Baru di Supabase (*Zero-Setup / Langsung Jalan*)
- Anda **TIDAK PERLU** menjalankan query SQL atau membuat tabel baru di Supabase agar fitur ini berjalan.
- Sistem otomatis menyimpan struktur Ruang Diskusi (`wms_chat_rooms_v1`) dan Pesan Aktif (`wms_chat_msgs_<roomId>`) di dalam tabel **`public.wms_system_docs`** yang **sudah ada dan aktif** di Supabase Anda.
- *(Opsional)* Skrip tabel SQL khusus tetap kami sediakan di modal *Update Database* jika suatu saat diinginkan, namun **tanpa klik apa pun di Supabase, fitur Live Chat 100% langsung berfungsi**.

### 2. Otomatis Aktif untuk User Baru + Kontrol Fleksibel di Hak Akses (`permissions.ts`)
- **Otomatis Aktif Default (` Default ON`)**: Saat Anda menambahkan user baru di menu Pengaturan User (role apa pun: *Store, Operator, Picker, QC, Produksi, HR, Fulfillment*), fitur Live Chat **otomatis langsung aktif** untuk user tersebut dan namanya langsung terdaftar di direktori kontak Live Chat tanpa perlu setting manual.
- **Tetap Tertanam di Matriks Role/Permission**: Kita menanamkan izin `menu_ops_live_chat` (default **`true`** di semua role) dan `action_manage_chat_groups` (default **`true` khusus Admin & Superadmin**). Dengan begitu:
  - Semua user baru langsung bisa memakai chat & menerima notifikasi.
  - Hanya **Admin & Superadmin** yang bisa membuat Ruang Diskusi Grup baru & menambah/mengeluarkan anggota.
  - Jika suatu saat ada 1 akun tertentu yang ingin Anda nonaktifkan fitur chat-nya, Anda tetap punya saklar (*checkbox*) di pengaturan hak akses user tersebut.

### 3. Balas Chat Langsung dari Notification Bar (*Inline Direct Reply* ala WhatsApp) & Unified Background Sync
- Menggunakan fitur **Service Worker Notification Actions (`type: 'text'`)** pada `public/pwa-extras.js`:
  - **`💬 Balas Cepat`**: Membuka kolom ketik langsung di bar notifikasi HP/Desktop dan mengirim balasan di background tanpa perlu membuka layar aplikasi WMS.
  - **`✓✓ Tandai Dibaca`**: Menandai pesan sudah dibaca langsung dari notifikasi.
- **Unified Background Sync**: Sekaligus menyinkronkan notifikasi background untuk **Live Chat**, **Pesanan Baru Manual Shipment**, **Form Alter/Repair**, **Tiket Retur Barang (`RTR-`)**, dan **Peminjaman Sementara (SPS)**.

### 4. Riwayat Chat Permanen (Tidak Pernah Hilang) & Hemat Kuota Supabase Free Tier
- **Lapis 1 (`IndexedDB` Perangkat)**: Menyimpan seluruh riwayat chat lama secara permanen di perangkat masing-masing (`0 Byte` Egress Supabase saat buka chat lama).
- **Lapis 2 (Supabase `wms_system_docs` Hot Store)**: Menyimpan pesan aktif lintas perangkat secara ringkas.
- **Lapis 3 (Google Drive CDN via GAS)**: Seluruh foto kendala disimpan di Google Drive (`0 Byte` di Supabase & `0 Byte` Egress Supabase) dan pesan lampau diarsipkan otomatis tanpa ada yang hilang.

### 5. Fitur Edit & Hapus Pesan Berstandar Audit Gudang (`✓✓ Dibaca` & Batas 5 Menit)
- **Bisa Edit / Hapus**: Hanya jika **belum dibaca user lain (`✓`) DAN masih dalam batas waktu $\le 5$ menit** sejak dikirim.
- **Penanda Transparan**:
  - Jika diedit $\rightarrow$ muncul label **`(Diedit • 14:25)`**.
  - Jika dihapus $\rightarrow$ berubah menjadi jejak **`🚫 Pesan ini telah dihapus oleh [Nama]`**.
- **Terkunci Otomatis**: Begitu pesan **sudah dibaca (`✓✓`)** oleh penerima atau **lewat 5 menit**, tombol Edit & Hapus otomatis terkunci.

---

## 1. Gambaran Umum & Konsep Inti

- **Apa yang Dilakukan**: Menghadirkan sistem **Live Chat (1-on-1) & Ruang Diskusi Grup** dalam mode **Tombol Floating Cepat** dan **Halaman Penuh** yang menampilkan user *Online* secara *real-time*, mendukung lampiran foto kendala (via Google Drive CDN), tag referensi `#Order / #SJ / #SKU`, fitur **Edit & Hapus Pesan berbatas 5 menit / status baca**, serta **Unified Background Notification dengan Inline Reply**.

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
│  │  - Otomatis Aktif utk User Baru  │  │  (public/pwa-extras.js)        │  │
│  │  - Status Online & Typing        │  │  1. Live Chat (+ Inline Reply) │  │
│  │  - ✓ / ✓✓ Read Receipt           │  │  2. Manual Shipment & Alter    │  │
│  │  - Edit/Hapus (<5 mnt & Unread)  │  │  3. Retur Barang (RTR) & SPS   │  │
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
   Zero-Setup Sync                      Disimpan di Google Drive (GAS)
            │                                   │
            ▼                                   ▼
┌───────────────────────────────────┐ ┌─────────────────────────────────────┐
│     INFRASTRUKTUR SUPABASE        │ │      GOOGLE DRIVE CDN (VIA GAS)     │
│  - Realtime Presence & Broadcast  │ │  - Foto Chat (0 Byte di Supabase)   │
│  - Tabel wms_system_docs (Sudah   │ │  - Arsip Chat Lama (JSON)           │
│    Ada, Tanpa Buat Tabel Baru!)   │ │                                     │
└───────────────────────────────────┘ └─────────────────────────────────────┘
```
