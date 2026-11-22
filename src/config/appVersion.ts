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
  "version": "v2.24.9",
  "versionCode": 449,
  "buildDate": "22 November 2026",
  "buildHash": "wms-261122-v449-1356",
  "releaseTitle": "WMS v2.24.9 — Filter Rentang Tanggal Spreadsheet Produksi",
  "releaseNotes": [
    "Mengubah dropdown daftar SJ pada tampilan Spreadsheet Produksi menjadi filter rentang tanggal (Dari s/d Sampai)",
    "Tampilan Desktop inline date range dan Seluler berupa bottom sheet dengan preset cepat (Hari Ini, 7 Hari, 30 Hari, Bulan Ini) yang tersinkronisasi dengan filter Riwayat Produksi"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.24.8",
    "versionCode": 448,
    "buildDate": "22 November 2026",
    "buildHash": "wms-261122-v448-1122",
    "releaseTitle": "WMS v2.24.8 — Default Kamera Scanner ke Camera 0",
    "releaseNotes": [
      "Default kamera scanner HP otomatis memilih camera 0 (kamera belakang utama)",
      "Dropdown pilihan kamera diurutkan dengan kamera belakang utama di posisi teratas dan selalu sinkron dengan lensa aktif"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
