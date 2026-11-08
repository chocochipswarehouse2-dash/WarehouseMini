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
  "version": "v2.6.99",
  "versionCode": 359,
  "buildDate": "9 November 2026",
  "buildHash": "wms-261109-v359-0526",
  "releaseTitle": "WMS v2.6.99 — Refine Produksi Couple Match Scoring & Instant Trello Swap Button",
  "releaseNotes": [
    "Koreksi gender scoring pada kode kembar busana couple (25751 MAN -> Logan Top SAMPLE, 25751 WOMAN -> Kailea Set)",
    "Tombol interaktif 1-klik 'Ganti Produk' di tabel Produksi untuk menukar kartu Trello alternatif secara instan tanpa ketik manual"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.98",
    "versionCode": 358,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v358-2137",
    "releaseTitle": "WMS v2.6.98 — Fix Produksi Trello Match Ambiguity & Sheet Push Product Name/UP",
    "releaseNotes": [
      "Sistem scoring ranking multi-faktor untuk pencocokan Trello dengan gender/single-code hint (memastikan 25762 - WOMAN cocok ke Viorica Top bukan Cedric Top)",
      "Enrichment otomatis nama produk dan UP Vendor saat push ke Google Sheets Master & Tanggal (menjamin kolom C dan D tidak kosong/default KARGO)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.97",
    "versionCode": 357,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v357-2052",
    "releaseTitle": "WMS v2.6.97 — Filter Pengaman Header Tabel pada Modul IG Live",
    "releaseNotes": [
      "Pembersihan dan filter pencegah baris header template gsheet (NAMA PEMESAN / SKU) terbaca sebagai pesanan valid",
      "Deploy Google Apps Script IG Live v28"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.96",
    "versionCode": 356,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v356-2002",
    "releaseTitle": "WMS v2.6.96 — Auto-Lookup Trello UP pada Penerimaan Produksi",
    "releaseNotes": [
      "Auto-lookup Nama Produk, UP, dan Foto dari data Trello UP board pada Form Penerimaan dan Spreadsheet Produksi (CMT & Kargo)",
      "Chip preview match Trello real-time saat ketik kode produk",
      "Tombol 1-klik Lengkapi Trello pada toolbar Spreadsheet Produksi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.95",
    "versionCode": 355,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v355-1204",
    "releaseTitle": "WMS v2.6.95 — Perbaikan Foto Koleksi UP (Trello) & Auto-Recovery GDrive",
    "releaseNotes": [
      "Perbaikan bug auto-sync Trello 60 detik yang sebelumnya menimpa cache lokal tanpa gdrive_image_url sehingga foto berubah menjadi No Photo",
      "Penambahan pewarisan foto lintas UP otomatis untuk kode barang yang sama (misal artikel 251052 & 622289 yang belum dilampiri foto di salah satu UP otomatis mewarisi foto dari UP lain / Katalog Produk)",
      "Peningkatan komponen TrelloImage dengan lazy loading, referrerPolicy no-referrer, antrean batas request (mencegah error 429 Too Many Requests saat memuat 727 kartu), serta 3-tahap fallback otomatis (Google Drive CDN -> GDrive Thumbnail -> Trello OAuth Blob)",
      "Penambahan filter cepat Belum Ada Foto dan tombol Pasang/Ganti Foto manual langsung ke Google Drive pada modal detail kartu Trello"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.94",
    "versionCode": 354,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v354-1043",
    "releaseTitle": "WMS v2.6.94 — Hapus Tombol Menu Mengambang Ganda di Seluler & Bubble Live Chat Draggable Saat Ada Pesan Baru",
    "releaseNotes": [
      "Menghapus tombol hamburger mengambang di kanan bawah pada tampilan seluler karena sudah ada tombol menu sticky di bagian atas layar",
      "Bubble Live Chat kini hanya muncul saat ada pesan baru/belum dibaca dan dapat digeser bebas (draggable) ke posisi mana saja di layar"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.93",
    "versionCode": 353,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v353-1030",
    "releaseTitle": "WMS v2.6.93 — Data Shift & Absensi di Approval Lembur, Ijin Pulang Cepat & Notifikasi Khusus Warehouse",
    "releaseNotes": [
      "Penambahan informasi Shift dan Jam Absen Datang/Pulang pada Daftar Approval Lembur, Cuti, dan Riwayat",
      "Penambahan opsi Ijin Pulang Cepat pada Form Ijin/Cuti lengkap dengan input Jam Pulang, Keterangan, serta info Shift & Absensi",
      "Notifikasi real-time & background khusus ke akun warehouse setiap ada pengajuan Ijin, Cuti, atau Lembur baru"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.92",
    "versionCode": 352,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v352-1514",
    "releaseTitle": "WMS v2.6.92 — Matriks Input Penerimaan Produksi & Mode Ukuran (Multi-Size / All Size)",
    "releaseNotes": [
      "Desain kartu Input Penerimaan Produksi disesuaikan dengan referensi matriks ukuran (Banyak Ukuran S-3XL yang judul kolomnya dapat diedit & All Size / Free Size)",
      "Penyesuaian tampilan responsif HP Seluler (Grid 3 kolom ukuran, tanpa scroll horizontal)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.91",
    "versionCode": 351,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v351-1451",
    "releaseTitle": "WMS v2.6.91 — Isolasi Sesi Multi-Tab & Pembersihan Cache Saat Ganti Akun",
    "releaseNotes": [
      "Reset otomatis seluruh Multi-Tab Keep-Alive, Panel Samping, dan halaman aktif saat Logout atau Login akun baru",
      "Filter ketat tab berdasarkan hak akses canAccessPage agar tab akun sebelumnya tidak pernah bocor ke akun lain",
      "Tampilan sapaan nama lengkap operator di Dashboard"
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
