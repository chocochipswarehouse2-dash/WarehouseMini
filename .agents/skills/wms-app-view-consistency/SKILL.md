---
name: wms-app-view-consistency
description: Standar keseragaman tampilan lintas-modul WMS untuk Desktop (Web-App Enterprise) dan Mobile/HP (Native App Feel) — mengatur sistem 2 mode tampilan (Tabel & Kartu), margin tepi mobile, konsolidasi tombol (anti-berceceran), dan Action Sheet terkelompok.
---

# WMS Cross-Module App View Consistency Standard

Skill ini adalah **konstitusi keseragaman antarmuka** yang WAJIB diterapkan di **SELURUH halaman dan modul WMS** (Pesanan Saya, Manual & Alter, Retur Barang, Stok Gudang, Picking, Pengecekan SJ, Produksi, QC, dll.) setiap kali membangun modul baru atau merenovasi modul yang sudah ada.

Tujuannya: pengguna merasakan **satu aplikasi yang seragam, rapi, mudah dipahami, tidak berceceran tombolnya, dan terasa seperti aplikasi seluler native di HP** — bukan kumpulan halaman web berbeda-beda.

---

## 1. Standar 2 Mode Tampilan (`Tabel` & `Kartu`)
- Untuk modul daftar/rekap operasional, **WAJIB hanya menyediakan 2 opsi tampilan**:
  1. **`Tabel` (`table`)** — default otomatis pada Desktop (`window.innerWidth >= 768`).
  2. **`Kartu` (`card`)** — default otomatis pada HP Seluler (`window.innerWidth < 768`).
- **DEPRECATE `Panel Rapi` (`split`)**: Jangan menambahkan atau mempertahankan mode ke-3 (`Panel Rapi` / master-detail split) pada halaman rekap/daftar karena menambah kompleksitas UI, memecah konsistensi, dan memakan area layar.
- Switcher tampilan WAJIB berupa **segmented toggle 2 opsi** yang ringkas (`Tabel | Kartu`) di pojok kanan atas toolbar.

---

## 2. Standar Margin Tepi & Feel Aplikasi Seluler (`< 640px` / Mobile)
Di layar HP (`360px–430px`), setiap piksel lebar sangat berharga. Tampilan HP WAJIB terasa seperti **aplikasi seluler native**, bukan halaman web desktop yang dikecilkan:
- **Zero Double Padding (Anti-Sempit)**:
  - Shell utama (`src/App.tsx <main>`) menggunakan `px-1 pt-1.5 sm:p-4 lg:p-6 pb-24 lg:pb-6`.
  - Kontainer dalam setiap modul/tab WAJIB `p-0` pada mobile (DILARANG menambah `p-2.5` atau `p-4` berlapis di luar card/list pada layar HP!).
- **Tab Navigasi Swipe Horizontal**:
  - Seluruh bar tab modul & tab tahap (`Baru`, `Diproses`, `Selesai`, `Batal`, `Semua`) WAJIB 1 baris swipe horizontal (`flex overflow-x-auto no-scrollbar whitespace-nowrap`). DILARANG menumpuk multi-baris (`flex-wrap`) di HP.
- **Target Sentuh Native**:
  - Tombol aksi utama, baris Action Sheet, dan ikon menu `⋯` di mobile WAJIB memiliki tinggi/area sentuh minimal `h-10` (`40px`) hingga `min-h-[48px]`.

---

## 3. Standar Konsolidasi Tombol (Anti-Berceceran & Anti-Pelangi)
Masalah utama antarmuka operasional yang rumit adalah tombol kecil yang tersebar di banyak kolom, warna-warni menyala, atau `<select>` mentah berisi belasan opsi. Terapkan aturan ketat berikut di **SEMUA modul**:

### A. Toolbar Header Modul
- **Kiri**: Judul modul (`text-[15px] sm:text-base font-bold`) + angka jumlah item bersih (`tabular-nums`, tanpa badge kapsul berlebihan).
- **Kanan (Maksimal 4 elemen terstruktur)**:
  1. **Maksimal 1 Tombol Primary Solid** (`bg-indigo-600 text-white`) untuk aksi terpenting halaman tersebut (misal: `Resi Massal`, `Tambah Data`, `Buat SPK`).
  2. **1 Tombol Refresh** (ikon netral outline).
  3. **1 Menu Utilitas (`⋯`)** berupa dropdown/popover untuk aksi sekunder yang jarang dipakai (`Export CSV`, `Muat Ulang Penuh`, `Slide SOP`, dll.) — DILARANG menjejerkan 4–5 tombol utilitas berwarna di header.
  4. **Segmented Switcher 2 Mode (`Tabel | Kartu`)**.

### B. Filter & Batch Bar
- **Baris Pencarian Tunggal**: Input Search (`flex-1`) + Dropdown Urutkan ringkas + Tombol `Filter` (dengan badge jumlah filter aktif) + Tombol `Reset` (hanya muncul jika ada filter aktif).
- **Filter Lanjutan Collapsible**: Semua dropdown filter sekunder WAJIB tersembunyi rapi di dalam panel lipat (`isFilterExpanded`).
- **Role-Aware Visibility**: Filter/tombol khusus Admin Gudang (seperti Quick Filter Cetak Label/Picking) WAJIB disembunyikan dari akun Store agar layar Store bersih dari tombol yang tidak relevan.
- **Batch Action Bar Kontekstual**: Bar aksi massal (`Cetak Massal`, `WA Grup`, dll.) HANYA tampil penuh saat `selectedCount > 0`.

### C. Aksi Per Baris / Per Kartu (Aturan Emas `1 + ⋯`)
- DILARANG menaruh tombol aksi di 4–5 kolom berbeda dalam 1 baris tabel.
- DILARANG menggunakan elemen HTML `<select>` mentah ("Pilih Aksi...") untuk daftar aksi pesanan.
- Setiap baris tabel (Desktop) dan footer kartu (Desktop & Mobile) WAJIB mengikuti pola **`1 Primary Contextual CTA` + `1 Tombol Menu Aksi (⋯)`**:
  1. **Primary Contextual CTA**: 1 tombol paling masuk akal sesuai tahap & role saat ini (misal: `Kirim ke Gudang` untuk Store, `Cetak Picking` / `Cetak Label A6` / `Input Resi` untuk Admin, `WA Customer` jika resi sudah ada, atau `Lihat Detail`).
  2. **Unified Action Sheet (`⋯`)**: Membuka:
     - **Mobile (`< 640px`)**: **Native Bottom Sheet** (`rounded-t-3xl` slide-up dari bawah dengan drag handle dan safe-area padding).
     - **Desktop (`>= 640px`)**: **Modal Aksi Terkelompok** (`max-w-md rounded-2xl`).
     - Di dalam Action Sheet, seluruh aksi dikelompokkan logis (contoh: *Dokumen & Cetak*, *Alur & Pengiriman*, *Komunikasi & Detail*, *Pengelolaan*) dengan **judul jelas + 1 baris keterangan singkat** agar pengguna langsung paham fungsi setiap tombol tanpa menebak-nebak.

---

## 4. Standar Renovasi Mode `Tabel` (Desktop vs Mobile)
1. **Desktop (`hidden md:block`)**:
   - Gunakan maksimal **5–6 kolom proporsional** (`lg:table-fixed w-full`).
   - **Zero Nested Boxes**: Jangan membungkus metadata (PIC, DPOS, SJ, Resi) dalam kotak abu-abu/berwarna berlapis di dalam sel tabel. Gunakan tipografi bertingkat bersih, `font-mono tabular-nums` untuk ID/SKU/Resi/SJ, dan garis tipis `divide-y`.
   - Seluruh aksi ditempatkan rapi di kolom paling kanan (`Aksi`, rata kanan) dengan pola `1 Primary CTA + ⋯`.
2. **Mobile (`md:hidden`) — Native Compact List-Table (ZERO Horizontal Scroll)**:
   - Di HP, mode `Tabel` DILARANG merender tabel lebar 1000px yang harus digeser kiri-kanan (`overflow-x-auto`).
   - WAJIB merender **Compact List-Table 100% pas lebar layar HP** (`divide-y bg-white dark:bg-slate-900`):
     - Ketuk baris membuka Detail Lengkap.
     - Baris 1: Nama Utama / Customer (bold) + 1 status badge ringkas di kanan.
     - Baris 2: `#ID` (mono) · Store/Sumber · Qty · Kurir.
     - Baris 3: Ringkasan item pertama (`+N item`) + indikator status mikro (`Alter`, `Resi ✓`, `SJ ✓`).
     - Sisi kanan: 1 tombol `⋯` berukuran `40×40px` (`MoreHorizontal`) membuka Bottom Action Sheet.

---

## 5. Standar Renovasi Mode `Kartu` (Single-Elevation App Card)
- Grid elastis: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 sm:gap-4 p-1.5 sm:p-4`.
- **Single-Elevation Discipline**: 1 permukaan kartu bersih (`rounded-2xl border bg-white dark:bg-slate-900`) yang dibagi dengan garis tipis `border-slate-100 dark:border-slate-800` — **DILARANG** membuat kotak berwarna di dalam kotak di dalam kartu.
- **Anatomi 5 Lapis Seragam**:
  1. **Header**: Checkbox + `#ID` (mono) + tanggal di kiri; Status badge di kanan.
  2. **Subjek & Rute**: Nama Customer/Tujuan + No. Telp + Kurir + Store/PIC dalam hierarki teks bersih.
  3. **Daftar Item**: Baris produk dengan pembatas hairline `divide-y` (Nama, Size, `×Qty`, SKU, alokasi, catatan khusus).
  4. **Strip Dokumen 2 Kolom**: Ringkasan key-value (`grid-cols-2 divide-x`) untuk dokumen kunci (misal: `SJ DealPOS` | `Resi / Jadwal`) dengan tap-to-copy.
  5. **Footer 2 Kontrol**: Tombol `Primary Contextual CTA` (`flex-1 h-10 sm:h-9`) + tombol `Aksi ⋯` (`h-10 sm:h-9`).

---

## 6. Standar Modal Detail (Anti-Awan Tombol di Badan Modal)
- **DILARANG menjejerkan 8–12 tombol aksi berwarna-warni di dalam badan (body) Modal Detail** (membuat pengguna HP harus menggulir panjang hanya untuk membaca isi pesanan).
- **Anatomi Modal Detail Native App**:
  - **Mobile (`< 640px`)**: Bottom-docked sheet (`rounded-t-3xl max-h-[92vh]`) dengan drag handle dan `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`.
  - **Desktop (`>= 640px`)**: Modal 2-kolom bersih (`max-w-4xl rounded-2xl`): kolom kiri untuk Penerima/Kurir + Pengirim/Store + Riwayat Audit; kolom kanan untuk Rincian Produk + Jadwal + Resi & Template WA.
  - **Tanpa Duplikasi Informasi**: Gabungkan info Customer & Alamat Pengiriman dalam 1 kartu bersih. Pastikan tombol salin inline menggunakan `whitespace-nowrap shrink-0` agar teks tidak terlipat vertikal.
  - **Sticky Footer Konsisten (`1 Primary CTA + Salin Info + Aksi ⋯`)**: Seluruh aksi sekunder (Cetak Label, Picking List, WA Grup, SJ Struk, Chat, Edit, Batal, Hapus) dibuka lewat **Unified Action Sheet (`z-[70]`)** di atas Modal Detail (`z-50`).

---

## 7. Referensi Implementasi Acuan
Gunakan komponen berikut sebagai referensi baku saat menyelaraskan modul WMS lainnya (Retur Barang, Shopee, Website, IG Live, Stok, Picking, Produksi, dll.):
- `src/components/PesananSaya/RekapToolbar.tsx` (Header + 2-mode switcher + utility `⋯` + swipe tabs + collapsible filter)
- `src/components/PesananSaya/RekapOrderViews.tsx` (Desktop clean table + Mobile zero-scroll list-table + Single-elevation app cards)
- `src/components/PesananSaya/OrderActionSheet.tsx` (Native mobile bottom sheet + desktop grouped action modal)
- `src/components/PesananSaya/OrderDetailModal.tsx` (Native mobile detail sheet + desktop 2-column detail modal with sticky 3-control footer)

