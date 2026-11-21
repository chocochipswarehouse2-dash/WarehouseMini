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
  "version": "v2.24.7",
  "versionCode": 447,
  "buildDate": "21 November 2026",
  "buildHash": "wms-261121-v447-1609",
  "releaseTitle": "WMS v2.24.7 — Integrasi Lengkap Entitas WMS & B-LWS B-PNK QC WH MAP",
  "releaseNotes": [
    "Pastikan B-LWS, B-PNK Panakkukang, QC, WH, MAP selalu tampil lengkap di CSV Barcode",
    "Tingkatkan pencarian outlet agar mengenali nama panjang Panakkukang & Living World",
    "Tambah filter cepat kategori Bazaar (B-) dan Gudang/QC WMS"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.24.6",
    "versionCode": 446,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v446-1547",
    "releaseTitle": "WMS v2.24.6 — Standardisasi Penamaan Entitas Bazaar Prefix B- & Integrasi Engine Cetak Teruji WMS",
    "releaseNotes": [
      "Standarisasi penamaan entitas bazaar prefix B- (B-EMP, B-LWS, B-PNK, B-SMS)",
      "Adopsi styling & CSS cetak Quicksand + JetBrains Mono dari modul teruji WMS",
      "Penyempurnaan @page dan layout thermal roll 50x20mm pada CSV Barcode & CSV Distribusi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.24.5",
    "versionCode": 445,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v445-1530",
    "releaseTitle": "WMS v2.24.5 — Penyempurnaan Spasi Baris Label & Filtrasi Murni Store Fisik DealPOS",
    "releaseNotes": [
      "Filter ketat saluran non-store (BOOKED, PERMAK/CUCI, BARANG CACAT, dll) agar murni Store Fisik DealPOS",
      "Perbaiki spasi baris label QR code yang renggang dan presisikan jarak baris teks",
      "Tambahkan kontrol cepat orientasi Lanskap Potret & rotasi 90/270 derajat Xprinter XP-420B"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.24.4",
    "versionCode": 444,
    "buildDate": "21 November 2026",
    "buildHash": "wms-261121-v444-1439",
    "releaseTitle": "WMS v2.24.4 — Perbaikan Cetak Multi-Halaman & Kontrol Orientasi Rotasi Barcode 50x20mm",
    "releaseNotes": [
      "Perbaiki bug cetak hanya 1 lembar pembatas pada printer thermal roll",
      "Tambah opsi orientasi Lanskap Potret & rotasi 0 90 180 270 derajat",
      "Filter otomatis kolom summary TOTAL_STOK & TP dari daftar outlet"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
  }
];

export const CURRENT_APP_VERSION = CURRENT_APP_VERSION_INFO.version;

/**
 * Compare two semver-like strings (e.g. 'v2.5.1' vs 'v2.5.2')
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareVersions(v1: string, v2: string): number {
  const clean = (v: string) => v.replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const p1 = clean(v1);
  const p2 = clean(v2);

  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export function isNewerVersion(
  serverVersion: string,
  clientVersion: string = CURRENT_APP_VERSION,
  serverBuildHash?: string,
  clientBuildHash: string = CURRENT_APP_VERSION_INFO.buildHash
): boolean {
  if (!serverVersion) return false;
  const cmp = compareVersions(serverVersion, clientVersion);
  if (cmp > 0) return true;
  if (cmp === 0 && serverBuildHash && clientBuildHash && serverBuildHash !== clientBuildHash) {
    return true;
  }
  return false;
}
