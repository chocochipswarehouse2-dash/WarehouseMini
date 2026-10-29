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
  "version": "v2.5.7",
  "versionCode": 257,
  "buildDate": "29 Oktober 2026",
  "buildHash": "wms-261029-v257-1900",
  "releaseTitle": "WMS v2.5.7 — Pengaman Qty Nota Buyer saat Re-push Sheet",
  "releaseNotes": [
    "Qty Nota yang diketik Buyer di sheet tidak lagi tertimpa saat push ulang",
    "Push dibatalkan otomatis jika pembacaan sheet lama gagal"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.5.6",
    "versionCode": 256,
    "buildDate": "29 Oktober 2026",
    "buildHash": "wms-261029-v256-1812",
    "releaseTitle": "WMS v2.5.6 — Header Sheet Produksi Auto-Wrap & Istilah Qty Hitung Ulang",
    "releaseNotes": [
      "Header kolom sheet produksi otomatis wrap dan tidak terpotong",
      "Kolom FISIK HASIL HITUNG diganti QTY HITUNG ULANG agar konsisten",
      "Tinggi baris menyesuaikan panjang Log Hitung Ulang"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.5.5",
    "versionCode": 255,
    "buildDate": "29 Oktober 2026",
    "buildHash": "wms-261029-v255-1729",
    "releaseTitle": "WMS v2.5.5 — Integrasi Qty Nota Buyer & Auto-Antrian Audit",
    "releaseNotes": [
      "Kolom QTY NOTA & SELISIH di sheet satuan dan master produksi",
      "Qty Nota Buyer disinkron ke Supabase",
      "Selisih nota otomatis masuk antrian Audit Hitung Ulang"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.5.4",
    "versionCode": 254,
    "buildDate": "29 Oktober 2026",
    "buildHash": "wms-261029-v254-1325",
    "releaseTitle": "WMS v2.5.4 — Copy-Paste & Drag-Drop Foto Input Produksi",
    "releaseNotes": [
      "Fitur Copy-Paste (Ctrl+V & Tombol Paste) Foto Produk: Mendukung tempel gambar langsung dari clipboard pada setiap blok kode produk di form Input Penerimaan Produksi.",
      "Fitur Drag & Drop Foto Produk: Tarik dan lepaskan file gambar langsung ke baris/blok produk pada form Input Penerimaan Produksi dengan kompresi WebP otomatis."
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.5.3",
    "versionCode": 253,
    "buildDate": "29 Oktober 2026",
    "buildHash": "wms-261029-v253-1317",
    "releaseTitle": "WMS v2.5.3 — Skill Otomasi Rilis Multi-User & Anti-Freeze Auditor",
    "releaseNotes": [
      "Penambahan Skill & CLI Auditor Anti-Freeze (wms-performance-anti-freeze): Deteksi dan proteksi otomatis terhadap komputasi berat pada modal tertutup (InventoryAnomalyModal, InventoryLokasiExportModal, HitungUlangModal, PushSuratJalanModal).",
      "Penyempurnaan Skill Rilis & Verifikasi Multi-User (wms-app-release-update): Penambahan sub-perintah CLI 'verify-release' untuk memvalidasi sinkronisasi 3 file versi, proteksi Zero Forced-Reload, dan pengecekan otomatis FAQ Store/Admin."
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.5.2",
    "versionCode": 252,
    "buildDate": "29 Oktober 2026",
    "buildHash": "wms-261029-v252-1046",
    "releaseTitle": "WMS v2.5.2 — Pembaruan Aman Multi-User & Optimasi Instan Produksi",
    "releaseNotes": [
      "Sistem Pembaruan Aman Multi-User (Zero Forced-Reload): Pembaruan sistem tidak lagi me-reload halaman secara paksa saat user sedang mengisi form atau scan barcode, serta otomatis diterapkan secara mulus saat berpindah menu utama.",
      "Pembaruan 1-Klik Tanpa Gangguan Sesi Login: Menghapus simulasi unduhan dua tahap; pembaruan langsung aktif dalam 1 klik dengan sesi akun (Store, Gudang, Admin) tetap 100% terjaga.",
      "Optimasi Performa Halaman Produksi: Menghapus bottleneck pembacaan katalog berulang sehingga tab Produksi dan Spreadsheet Matrix terbuka instan tanpa freeze.",
      "Standarisasi Tampilan Rekap Pesanan & Lokasi Rak Inventori: Penambahan opsi Panel Rapi (Master-Detail), penyempurnaan Versi Tabel, serta penggabungan otomatis lokasi rak identik."
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.5.1",
    "versionCode": 251,
    "buildDate": "25 Oktober 2026",
    "buildHash": "wms-261025-v251",
    "releaseTitle": "WMS v2.5.1 — Side-by-Side Inventory & Notifikasi Store",
    "releaseNotes": [
      "Penyajian Inventori Berdampingan (Side-by-Side): Tampilan data DealPOS (Marketplace & Perbaikan) berdampingan langsung dengan lokasi fisik rak tanpa distraksi selisih.",
      "Kartu Inventori Mobile Touch-Optimized: Tata letak kartu per SKU yang ringkas dan responsif untuk audit fisik di lorong gudang via smartphone.",
      "Notifikasi Otomatis WA Store (Fonnte): Pengiriman otomatis format permintaan kirim barang ke WhatsApp Store ketika pesanan manual shipment disubmit.",
      "Sinkronisasi Kanal DealPOS Real-time: Integrasi data dealpos_channels dari Supabase dan mekanisme auto-heal cache lokal yang memastikan data kanal selalu akurat."
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
