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
  "version": "v2.7.0",
  "versionCode": 270,
  "buildDate": "10 November 2026",
  "buildHash": "wms-261110-v270-1812",
  "releaseTitle": "WMS v2.7.0 — Asisten AI Pintar WMS (Google Gemini Flash)",
  "releaseNotes": [
    "Rilis Fitur Baru: Asisten AI WMS berbasis Google Gemini Flash terintegrasi di Sidebar",
    "Tanya stok real, posisi rak, lookup kode produksi Trello UP, dan rekapitulasi penerimaan bulanan via bahasa alami",
    "Kontrol akses hemat token: Superadmin default dengan Whitelist Staf Terpilih"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.105",
    "versionCode": 365,
    "buildDate": "10 November 2026",
    "buildHash": "wms-261110-v365-1802",
    "releaseTitle": "WMS v2.6.105 — Asisten AI Pintar WMS (Google Gemini Flash)",
    "releaseNotes": [
      "Penambahan Asisten AI WMS di Sidebar dengan popup floating page",
      "Mendukung tanya stok produk, letak rak, lookup kode produksi Trello UP, dan rekapitulasi penerimaan bulanan",
      "Kontrol akses token hemat: default khusus Superadmin dengan whitelist user management"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.104",
    "versionCode": 364,
    "buildDate": "10 November 2026",
    "buildHash": "wms-261110-v364-1706",
    "releaseTitle": "WMS v2.6.104 — Perbaikan Filter Tanggal Dropdown Tab Kargo & Pemulihan Tampilan Madeline Top",
    "releaseNotes": [
      "Memperbaiki pencocokan filter tanggal dropdown cepat pada ProduksiSpreadsheetView yang sebelumnya gagal karena pemisahan delimiter pipa",
      "Merapikan label dropdown tanggal penerimaan dan badge filter tanpa karakter mentah",
      "Menambahkan auto-fill nama produk untuk kode produksi alfabet seperti Madeline Top saat push/render"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
