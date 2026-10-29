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
  "version": "v2.6.1",
  "versionCode": 261,
  "buildDate": "29 Oktober 2026",
  "buildHash": "wms-261029-v261-2315",
  "releaseTitle": "WMS v2.6.1 — Sinkronisasi Badge Header Selisih Nota dengan Tabel",
  "releaseNotes": [
    "Sinkronisasi perhitungan selisih nota di header blok dengan tabel sesuai 4 kondisi",
    "Menampilkan badge Hitung Ulang di header blok jika sudah diaudit"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.0",
    "versionCode": 260,
    "buildDate": "29 Oktober 2026",
    "buildHash": "wms-261029-v260-2304",
    "releaseTitle": "WMS v2.6.0 — Rincian Row Total Datang, Total Hitung Ulang & Rumus 4-Kondisi Selisih Nota",
    "releaseNotes": [
      "Rincian subtotal per baris ukuran ditampilkan langsung pada kolom TOTAL DATANG",
      "Penambahan kolom TOTAL HITUNG ULANG pada level ringkasan blok model",
      "Formula reaktif SELISIH NOTA 4-kondisi (Total Hitung - Nota, Total Awal - Nota, atau Total Hitung - Awal jika Nota kosong)",
      "Pembaruan sinkron antara Frontend dan Google Spreadsheet Backend (v2.6.0)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.5.9",
    "versionCode": 259,
    "buildDate": "29 Oktober 2026",
    "buildHash": "wms-261029-v259-2127",
    "releaseTitle": "WMS v2.5.9 — Pencegahan Anomali Scanner & Matching Selisih Nota vs Qty Hitung Ulang",
    "releaseNotes": [
      "Mode ANOMALI dihapus dari Web Scanner & wajibkan pilih Mode (#IN/#OUT/#SO) serta Lokasi sebelum scan",
      "Selisih Nota dan Status Audit kini menggunakan Qty Hitung Ulang sebagai pembanding akhir bila audit telah selesai",
      "Formula Spreadsheet reaktif menghitung SUM(QTY HITUNG ULANG) - QTY NOTA otomatis"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.5.8",
    "versionCode": 258,
    "buildDate": "29 Oktober 2026",
    "buildHash": "wms-261029-v258-2105",
    "releaseTitle": "WMS v2.5.8 — Fisik Hitung Produksi Terbaca dari Hasil Audit",
    "releaseNotes": [
      "Kolom Fisik Hitung dan Status di tabel Produksi kini membaca hasil Audit Hitung Ulang",
      "Data audit dari Cloud ditampilkan walau belum tertulis ke item penerimaan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
