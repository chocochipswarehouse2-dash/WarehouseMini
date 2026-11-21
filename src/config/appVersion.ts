/**
 * App Version & Release Configuration
 * Single Source of Truth for WMS Application Version
 * Auto-managed by tools/bump_version.cjs
 */

export interface VersionInfo {
  version: string;
  versionCode: number;
  buildDate: string;
  buildHash: string;
  releaseTitle: string;
  releaseNotes: string[];
  minSupportedVersion?: string;
}

export const CURRENT_APP_VERSION_INFO: VersionInfo = {
  "version": "v2.24.3",
  "versionCode": 443,
  "buildDate": "21 November 2026",
  "buildHash": "wms-261121-v443-1328",
  "releaseTitle": "WMS v2.24.3 — Integrasi Database Live WMS DealPOS & Standardisasi Label Barcode 50x20mm",
  "releaseNotes": [
    "Integrasi database langsung WMS & DealPOS tanpa wajib upload CSV",
    "Pilihan mode Outlet Toko (DealPOS) vs Rak Fisik Gudang",
    "Penyempurnaan layout stiker thermal 50x20mm Code128 & QR Code sesuai standard",
    "Pratinjau label WYSIWYG realistis"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.24.2",
    "versionCode": 442,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v442-0614",
    "releaseTitle": "WMS v2.24.2 — Live Chat Full-Screen Edge-to-Edge",
    "releaseNotes": [
      "Menghapus seluruh margin pinggir, padding ganda, dan bingkai kartu pada Live Chat agar tampil full-screen edge-to-edge seperti aplikasi chat asli di seluler maupun desktop",
      "Ruang percakapan aktif di seluler kini tampil layar penuh (menutupi bilah navigasi bawah & header ganda) dengan safe-area top/bottom",
      "Proporsi panel chat desktop diperluas (sidebar 25% & area chat 75% di layar xl+) serta dukungan edge-to-edge penuh di Panel Pendamping"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.24.1",
    "versionCode": 441,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v441-0546",
    "releaseTitle": "WMS v2.24.1 — Optimasi Tabel, Filter & Sort Stok Produk",
    "releaseNotes": [
      "Menghapus 4 kartu ringkasan KPI pada tab Stok Produk (sudah tersedia di Dashboard Kapasitas) agar tabel langsung tampil penuh di seluler maupun desktop",
      "Menambahkan filter Status Stok (Ada Stok, Fisik > 0, DP > 0 Fisik 0, Stok Minus, Semua Master), filter Size master, dropdown Urutkan, dan tombol Reset filter",
      "Merapikan toolbar seluler bergaya aplikasi (aksi sekunder kolapsibel & swipe horizontal) serta memperluas tinggi area tabel stok produk"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.24.0",
    "versionCode": 440,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v440-1215",
    "releaseTitle": "WMS v2.24.0 — Modul CSV Barcode & CSV Distribusi",
    "releaseNotes": [
      "Tambah modul CSV Barcode (export CSV DealPOS per outlet/lokasi + ZIP + cetak stiker 50x20/104x20mm & ceklis A4)",
      "Tambah modul CSV Distribusi (import multi-file Excel Reguler & Back In Stock, kartu store 2-baris, Gudang Awal balance check, & ZIP per batch)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.23.5",
    "versionCode": 435,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v435-0112",
    "releaseTitle": "WMS v2.23.5 — Native Mobile App Shell (Bottom Tab Bar & App Launcher Sheet)",
    "releaseNotes": [
      "Ubah navigasi seluler (< 1024px) dari hamburger drawer ala web menjadi Fixed Bottom Tab Bar (4 pintasan peran/kustom + tab Menu) dan Native App Launcher Bottom Sheet dengan grid ikon 4 kolom, kustomisasi tab bawah, & grouped settings",
      "Sederhanakan Mobile Top App Bar menjadi Avatar + Judul Halaman + Bell/AI, serta amankan offset Dock & Kapasitas Rak di atas Bottom Tab Bar (Desktop tetap utuh)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.23.4",
    "versionCode": 434,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v434-0038",
    "releaseTitle": "WMS v2.23.4 — Modern Native Mobile Drawer (Opsi C)",
    "releaseNotes": [
      "Ubah Mobile Drawer menjadi gaya aplikasi seluler native: Kartu Profil di atas, 4 Control Center Tiles (Notif/Tema/Update/Sistem), Cari Menu Cepat, Pin Favorit lokal, grup lipat Operasional/HR, & gesture swipe kiri",
      "Pertahankan Sidebar Desktop Auto-Hide/Pin tetap konsisten dan tambahkan safe-area bottom footer untuk tombol App & Keluar Akun"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.23.3",
    "versionCode": 433,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v433-2345",
    "releaseTitle": "WMS v2.23.3 — Optimasi Filter & Layout Kolom Distribusi Store",
    "releaseNotes": [
      "Perbaiki filter status pengiriman agar default hanya menampilkan SELESAI & BELUM KIRIM, mengabaikan status CANCEL/BATAL",
      "Optimalkan proporsi lebar kolom tabel distribusi store agar serasi di layar desktop maupun seluler",
      "Perbaiki badge ringkasan koli dan item per toko untuk visibilitas status pengiriman yang lebih jelas"
    ],
    "minSupportedVersion": "v2.0.0"
  }
];

export const APP_VERSION = CURRENT_APP_VERSION_INFO.version;
export const APP_VERSION_CODE = CURRENT_APP_VERSION_INFO.versionCode;
export const APP_BUILD_DATE = CURRENT_APP_VERSION_INFO.buildDate;
export const APP_BUILD_HASH = CURRENT_APP_VERSION_INFO.buildHash;
export const APP_RELEASE_TITLE = CURRENT_APP_VERSION_INFO.releaseTitle;
export const APP_RELEASE_NOTES = CURRENT_APP_VERSION_INFO.releaseNotes;
