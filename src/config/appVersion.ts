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
  "version": "v2.7.3",
  "versionCode": 273,
  "buildDate": "10 November 2026",
  "buildHash": "wms-261110-v273-2001",
  "releaseTitle": "WMS v2.7.3 — Centralized Cloud Gemini API Key & Multi-Device Auto-Sync",
  "releaseNotes": [
    "Penyimpanan Gemini API Key terpusat di Supabase wms_system_docs",
    "Auto-sync API Key ke seluruh perangkat (HP, Laptop, PC Toko) tanpa input berulang",
    "Auto-fetch API Key saat app load dan sebelum eksekusi AI chat"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.7.2",
    "versionCode": 272,
    "buildDate": "10 November 2026",
    "buildHash": "wms-261110-v272-1919",
    "releaseTitle": "WMS v2.7.2 — Smart Multi-Token Product Search & Zero-SKU Requirement",
    "releaseNotes": [
      "Pencarian produk cerdas berbasis nama pakaian (multi-token & multi-layer)",
      "Tidak mewajibkan SKU & fallback langsung ke Supabase PostgREST",
      "Pencegahan AI meminta/menuntut kode SKU kepada operator"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.7.1",
    "versionCode": 271,
    "buildDate": "10 November 2026",
    "buildHash": "wms-261110-v271-1848",
    "releaseTitle": "WMS v2.7.1 — Interaktif Order Keranjang & Fix Multi-Tool Call AI",
    "releaseNotes": [
      "Penambahan tool add_to_inventory_cart untuk memasukkan produk ke keranjang order inventory",
      "Dukungan interaksi cerdas: tanya qty jika kosong, penawaran alternatif warna/size jika stok 0",
      "Perbaikan multi-tool calling agar seluruh produk dieksekusi simultan dan menghasilkan rangkuman lengkap"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
