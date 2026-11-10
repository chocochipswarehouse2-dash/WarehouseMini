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
  "version": "v2.6.103",
  "versionCode": 363,
  "buildDate": "10 November 2026",
  "buildHash": "wms-261110-v363-1456",
  "releaseTitle": "WMS v2.6.103 — Pembersihan Pseudo Kategori Physical Stock & Standarisasi Lookup Size Master",
  "releaseNotes": [
    "Mengeliminasi kategori palsu Physical Stock dengan pencarian kategori resmi DealPOS via lookup nama produk",
    "Menghilangkan pemaksaan varian ALL pada barang dengan size unassigned menjadi tanda strip (-)",
    "Menghapus sisa regex endsWith size yang melangkahi master produk di Supabase Blok F dan Inventori"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.102",
    "versionCode": 362,
    "buildDate": "10 November 2026",
    "buildHash": "wms-261110-v362-1126",
    "releaseTitle": "WMS v2.6.102 — Eliminasi Menyeluruh Regex & String Splitting Nama Produk & Size",
    "releaseNotes": [
      "Standarisasi lookup O(1) master catalog untuk nama produk & size di seluruh modul",
      "Pencegahan polusi suffix size pada nama produk di Manual Shipment & IG Live",
      "Dukungan kode produksi alfanumerik (cth: D1055, CCT045) & auto-lookup Trello UP ke Google Sheet",
      "Perbaikan penentuan size di QC Job Card, Distribusi Picking, dan WhatsApp"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.101",
    "versionCode": 361,
    "buildDate": "10 November 2026",
    "buildHash": "wms-261110-v361-0759",
    "releaseTitle": "WMS v2.6.101 — Standardisasi Pure O(1) Master Product SKU Lookup & Eliminasi Regex Parsing",
    "releaseNotes": [
      "Standarisasi lookup nama produk & size berbasis VLOOKUP/XLOOKUP murni O(1) dari master_produk",
      "Eliminasi regex parsing dan hardcoded matrix pada SKU (DF26, letter code, dsb)",
      "Sinkronisasi master catalog in-memory 28.000+ SKU di seluruh modul (Picking, Live, Produksi, Distribusi)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.100",
    "versionCode": 360,
    "buildDate": "9 November 2026",
    "buildHash": "wms-261109-v360-1033",
    "releaseTitle": "WMS v2.6.100 — Anti Quota Exceeded Engine & Safe LocalStorage Healing",
    "releaseNotes": [
      "Arsitektur Safe Storage Utility (safeLocalStorageSet, auto-eviction, clearHeavyCaches) mencegah crash 'The quota has been exceeded' pada Tugas Picking",
      "Optimasi cache offline PickingTasksView hanya menyimpan tugas aktif (mereduksi 95% beban memori localStorage)",
      "Penyempurnaan ErrorBoundary dengan tombol pemulihan darurat dan pembersihan otomatis storage"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
