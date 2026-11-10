# 🤖 Implementation Plan: Asisten AI Cerdas WMS Inventory (Google Gemini Flash)

## 1. Ringkasan Eksekutif & Kebutuhan Pengguna
Fitur **Asisten AI WMS** dirancang untuk membantu tim operasional dan manajemen menjawab pertanyaan bisnis dan gudang secara cepat via bahasa alami (*natural language*), seperti:
1. **Cek Stok & Rak**: *"Stok sailor top sekarang berapa ya?"*, *"Dimana rak celana taylor pants dark denim?"*
2. **Lookup Kode & Produk**: *"Kode 6612 itu nama produknya apa ya?"*, *"SKU DF26KBF03DDC itu barang apa?"*
3. **Laporan & Rekapitulasi Otomatis**: *"Buat rekap penerimaan produk selama bulan Oktober"*, *"Berapa total kedatangan Kargo vs CMT bulan lalu?"*
4. **Cek Pengiriman & Resi**: *"Paket toko PIM resi nya apa dan statusnya bagaimana?"*

### Batasan & Permintaan Khusus User:
1. **Akses Terbatas (Hemat Token & Kuota)**:
   - Default: **Hanya Superadmin / Akun Pemilik** yang bisa mengakses.
   - Superadmin dapat memilih (*whitelist*) pengguna lain yang diizinkan mengakses fitur AI melalui modal pengaturan atau izin user.
2. **Penempatan di Sidebar**:
   - Menu ditaruh rapi di **Sidebar** navigasi (bukan floating widget permanen di layar yang mengganggu pandangan).
   - Saat diklik dari sidebar, barulah muncul **Floating Popup Page / Workspace Modal** yang elegan dan responsif.
3. **Model & Endpoint AI**:
   - Menggunakan Google Gemini API (`gemini-3.5-flash` dengan auto-fallback `gemini-3.5-flash-lite` / `gemini-flash-latest`) via API Key resmi yang diberikan pengguna.

---

## 2. Arsitektur Teknis: Tool-Calling Grounded AI (Anti-Halusinasi & Super Hemat Token)

```
[ User Prompt di WmsAiModal ]
            │
            ▼
[ Google Gemini 3.5 Flash API ]  ◄─── System Prompt (Konteks Gudang & Persona WMS)
            │
            ▼ (Function / Tool Calling)
┌─────────────────────────────────────────────────────────────┐
│             WMS Local Tool Execution Engine                 │
│  - search_product_catalog(query)                            │
│  - get_product_stock_and_racks(sku_or_code)                 │
│  - search_production_receipts(month, year, type)            │
│  - get_trello_production_info(code)                         │
│  - check_shipment_or_resi(keyword)                          │
└─────────────────────────────────────────────────────────────┘
            │
            ▼ (Tool Results dikirim balik ke Gemini)
[ Gemini Synthesizes Jawaban & Tabel Rapi ]
            │
            ▼
[ UI Render: Markdown, Tabel, Badges, Tombol Salin & Export ]
```

> **Keunggulan Arsitektur Tool-Calling**:
> - Kita **TIDAK** menyuntikkan 28.000 katalog produk ke dalam context prompt (yang bisa menghabiskan jutaan token dan melanggar batas kuota).
> - Gemini hanya menerima schema fungsi (tools) yang sangat hemat token (~300 token).
> - Gemini memutuskan data apa yang perlu dicari, sistem lokal WMS mengeksekusinya via in-memory cache / Supabase, lalu Gemini merangkum jawabannya dalam bahasa Indonesia yang ramah, akurat, dan berbasis data real-time 100%.

---

## 3. Rencana Komponen & File Perubahan

### A. Layanan AI & Tools (`src/services/wmsAiService.ts`)
- Menyimpan konfigurasi API Key (default dari `.env.local` / `localStorage` / key yang diberikan user).
- Definisi Function Calling Schema:
  - `lookup_product`: Pencarian katalog berdasarkan nama produk, SKU, atau kode barang (menggunakan `productLookup.ts`).
  - `check_stock_locations`: Cek stok fisik, dealpos, dan lokasi rak (`stok_real_fisik` + `productCatalog`).
  - `get_production_recap`: Mengagregasi data `penerimaan_produksi` (CMT & Kargo) berdasarkan bulan dan tahun, menghasilkan total qty, jumlah kode, dan rincian.
  - `lookup_trello_code`: Cek kode produksi di `trello_up_catalog` (nama produk, foto URL, status UP).
- Fungsi `askWmsAi(history, userMessage, contextData)`: Mengirim request ke Gemini, menangani tool calls berulang hingga selesai, dan mengembalikan teks jawaban markdown.
- Mekanisme retry & fallback model (`gemini-3.5-flash` $\rightarrow$ `gemini-3.5-flash-lite` jika terkena limit/503).

### B. Kontrol Akses & Hak Izin (`src/services/permissions.ts`)
- Tambah permission key: `'action_access_wms_ai'`.
- Tambah helper `canAccessWmsAi(session: UserSession | null, permissions?: UserPermissions): boolean`:
  - Mengembalikan `true` jika `isSuperadmin(session)`.
  - Mengembalikan `true` jika user terdaftar di daftar whitelist `wms_ai_allowed_users` (disimpan di Supabase `wms_system_docs` atau `localStorage`).
  - Pengguna lain yang tidak diizinkan tidak akan melihat tombol Asisten AI di Sidebar.

### C. Antarmuka Pengguna (`src/components/ai/WmsAiModal.tsx`)
- Modal floating elegan bergaya *Modern Copilot*:
  - Header: Logo AI bersinar, status kuota/koneksi, dan tombol tutup.
  - Quick Suggestion Pills:
    - 💡 *"Stok Sailor Top sekarang berapa?"*
    - 💡 *"Kode 6612 itu nama produknya apa?"*
    - 💡 *"Buat rekap penerimaan produk Oktober 2026"*
    - 💡 *"Dimana rak Taylor Pants Dark Denim?"*
  - Chat Stream / Message Bubbles: Dukungan format Markdown, tabel spreadsheet mini, kode SKU dengan copy button.
  - Export & Copy Action: Tombol 1-klik untuk menyalin laporan atau menyimpannya.
  - Input bar dengan shortcut `Enter` kirim, `Shift+Enter` baris baru, dan indikator loading berpikir (*Gemini is analyzing...*).

### D. Pengaturan Whitelist Pengguna (`WmsAiSettingsModal` / tab di `PengaturanSistemView`)
- Superadmin dapat mencentang / memilih siapa saja staf (misal: PIC Gudang, Spv Produksi, Manager) yang diberi akses ke Asisten AI.
- Pengaturan tersimpan secara terpusat di tabel `wms_system_docs` (key `wms_ai_config`) sehingga sinkron ke semua perangkat.

### E. Integrasi Sidebar (`src/components/Sidebar.tsx` & `src/App.tsx`)
- Pada Sidebar (baik Desktop maupun Mobile drawer), tampilkan tombol:
  `🤖 Asisten AI WMS` dengan badge gradient `AI / GEMINI`.
- Hanya ditampilkan jika `canAccessWmsAi(session) === true`.
- Mengklik tombol membuka `WmsAiModal`.

---

## 4. Tahapan Eksekusi & Validasi

1. **Step 1**: Buat Service `src/services/wmsAiService.ts` beserta local tool handlers.
2. **Step 2**: Tambahkan perizinan `action_access_wms_ai` dan whitelist di `src/services/permissions.ts`.
3. **Step 3**: Bangun UI `src/components/ai/WmsAiModal.tsx` dan panel kelola akses untuk Superadmin.
4. **Step 4**: Pasang tombol Asisten AI di `Sidebar.tsx` dan hubungkan state di `App.tsx`.
5. **Step 5**: Verifikasi 3 skenario user:
   - Skenario 1: *"stok sailor top sekarang berapa ya?"*
   - Skenario 2: *"kode 6612 itu nama produknya apa ya?"*
   - Skenario 3: *"buat rekap penerimaan produk selama bulan Oktober"*
6. **Step 6**: Jalankan build `npm run build`, bump versi rilis `node tools/bump_version.cjs`, commit, push ke GitHub, dan tampilkan tabel status deployment proaktif.
