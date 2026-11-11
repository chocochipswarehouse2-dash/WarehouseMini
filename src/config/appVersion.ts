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
  "version": "v2.10.1",
  "versionCode": 301,
  "buildDate": "11 November 2026",
  "buildHash": "wms-261111-v301-0529",
  "releaseTitle": "WMS v2.10.1 — Konfirmasi Kode Produksi Mirip (6612 vs 6612-1) & Lampiran Foto Produk Trello di Chat AI",
  "releaseNotes": [
    "Konfirmasi Kode Produksi Mirip di AI: Jika pengguna menyebutkan kode seperti 6612 namun di Trello UP hanya ada kode varian/mirip seperti 6612-1, AI tidak langsung auto-match diam-diam melainkan bertanya terlebih dahulu kepada pengguna",
    "Lampiran Kartu Foto Produk Trello UP di Chat AI: Saat AI bertanya konfirmasi kode mirip (maupun saat cek kode produksi), AI otomatis melampirkan Kartu Foto Produk Trello di gelembung chat lengkap dengan fitur klik perbesar (Zoom Lightbox) dan tombol 1-klik 'Ya, Pakai Kode 6612-1'"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.10.0",
    "versionCode": 300,
    "buildDate": "11 November 2026",
    "buildHash": "wms-261111-v300-0507",
    "releaseTitle": "WMS v2.10.0 — Asisten AI Penerimaan Produksi (CMT & Kargo) & Auto-Draft Form Input",
    "releaseNotes": [
      "AI kini dapat membaca & mencari rincian penerimaan barang produksi (Lokal CMT maupun Kargo) per tanggal spesifik (hari ini, kemarin, rentang tanggal), per nomor surat jalan, atau per kode produksi beserta pencocokan otomatis Nama Produk & Kode UP dari Trello UP.",
      "Fitur Bantu Input Penerimaan ke Form Input (prepare_production_receipt_form): AI menyiapkan draft Form Input Penerimaan (Kategori CMT/Kargo, Tanggal, No. Surat Jalan, Kode Produksi, Foto & UP Trello otomatis, serta matriks Warna, Size, dan Qty) sehingga Anda tinggal mengecek, melengkapi data yang kurang, dan menekan tombol Submit sendiri.",
      "Skill Tanya Jawab (Q&A) Interaktif Produksi: Jika data input penerimaan belum lengkap (misal belum ada No. Surat Jalan, Warna, atau Qty per ukuran), AI secara proaktif bertanya jawab dengan ramah dan memperbarui draft form secara bertahap."
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.9.1",
    "versionCode": 291,
    "buildDate": "10 November 2026",
    "buildHash": "wms-261110-v291-2158",
    "releaseTitle": "WMS v2.9.1 — Hotfix Import React useMemo & Proteksi Eksklusif Token Owner",
    "releaseNotes": [
      "Fix Blank Page: Menambahkan missing useMemo import di App.tsx",
      "Proteksi Eksklusif: Tombol Token & Akses AI kini HANYA tampil untuk akun @warehouse selaku owner",
      "Pencegahan Akses Pengaturan AI dari Akun Lain (Superadmin non-owner)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.9.0",
    "versionCode": 290,
    "buildDate": "10 November 2026",
    "buildHash": "wms-261110-v290-2145",
    "releaseTitle": "WMS v2.9.0 — Asisten AI Multimodal: Olah Lampiran Excel/CSV, Vision Foto OCR & Top Bar Panel Nav",
    "releaseNotes": [
      "Multimodal Vision OCR: Ekstraksi Foto Dokumen & Surat Jalan",
      "Pengolahan Lampiran Spreadsheet Excel (.xlsx/.xls) dan CSV (.csv)",
      "Navigasi Fleksibel Tombol AI di Panel Atas (Desktop & Mobile Header)",
      "Pembersihan Shortcut Panel Samping di Setiap Tab (Rapi & Minimalis)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.8.1",
    "versionCode": 281,
    "buildDate": "10 November 2026",
    "buildHash": "wms-261110-v281-2027",
    "releaseTitle": "WMS v2.8.1 — Optimasi Batch Lookup AI & Anti-Missing Stok Fisik",
    "releaseNotes": [
      "Batch Multi-Product Lookup 1-Turn",
      "Akurasi Word-Boundary Token Matching (Ruth Top Cherry 5 pcs)",
      "Penghapusan Total Halusinasi Minta Kode SKU",
      "Loop Headroom & Anti-Truncate Response"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.8.0",
    "versionCode": 280,
    "buildDate": "10 November 2026",
    "buildHash": "wms-261110-v280-2017",
    "releaseTitle": "WMS v2.8.0 — Asisten AI Multitasking Companion: Minimize Dock, Riwayat Sesi & New Chat",
    "releaseNotes": [
      "Floating Mini Dock (Minimize chat sambil kerja di modul gudang lain)",
      "Riwayat Sesi Percakapan Lampau (Chat History Drawer & Search)",
      "Tombol + Chat Baru untuk memulai topik percakapan bersih",
      "Indikator status live & preview jawaban saat diminimize"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
