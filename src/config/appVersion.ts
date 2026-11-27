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
  "version": "v2.33.2",
  "versionCode": 532,
  "buildDate": "27 November 2026",
  "buildHash": "wms-261127-v532-0050",
  "releaseTitle": "WMS v2.33.2 — Catatan Rilis Khusus Owner Warehouse",
  "releaseNotes": [
    "Catatan Rilis Terbaru dan Riwayat Pembaruan Sebelumnya di modal pembaruan kini hanya tampil untuk akun owner @warehouse",
    "Tooltip floating widget pembaruan menyesuaikan peran akun non-owner"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.33.1",
    "versionCode": 531,
    "buildDate": "26 November 2026",
    "buildHash": "wms-261126-v531-1206",
    "releaseTitle": "WMS v2.33.1 — Proteksi Reset 0 Pcs & Undo Reset Picking",
    "releaseNotes": [
      "Hapus tombol Reset 0 Pcs di sebelah Lanjutkan Picking pada kartu antrean agar tidak kepencet tidak sengaja",
      "Wajib ketik RESET untuk konfirmasi reset progres + backup Undo Reset otomatis 24 jam ke Supabase & draft lokal"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.33.0",
    "versionCode": 530,
    "buildDate": "26 November 2026",
    "buildHash": "wms-261126-v530-0623",
    "releaseTitle": "WMS v2.33.0 — Share Kekurangan Pengecekan SJ ke Tugas Picking",
    "releaseNotes": [
      "Tombol Share ke Tugas Picking pada item selisih kurang di Pengecekan SJ Pengiriman",
      "Rekonsiliasi SJ eksisting vs baru di picking_list, tampil hanya sisa kurang, dan anti-double #OUT via baseline persisten"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.32.1",
    "versionCode": 521,
    "buildDate": "26 November 2026",
    "buildHash": "wms-261126-v521-0304",
    "releaseTitle": "WMS v2.32.1 — Pembaruan Sistem & Optimasi Operasional",
    "releaseNotes": [
      "Pagination & pencarian arsip riwayat picking, multi-lokasi split picking per rak, serta atribusi picker per-produk/per-split ke log_produk #OUT"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.32.0",
    "versionCode": 520,
    "buildDate": "26 November 2026",
    "buildHash": "wms-261126-v520-0118",
    "releaseTitle": "WMS v2.32.0 — Pembaruan Sistem & Optimasi Operasional",
    "releaseNotes": [
      "Pagination & pencarian arsip riwayat picking, multi-lokasi split picking per rak, serta atribusi picker per-produk/per-split ke log_produk #OUT"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.31.1",
    "versionCode": 511,
    "buildDate": "25 November 2026",
    "buildHash": "wms-261125-v511-1840",
    "releaseTitle": "WMS v2.31.1 — Cetak Surat Jalan SPS Tanpa Kolom Lokasi",
    "releaseNotes": [
      "Pagination & pencarian arsip riwayat picking, multi-lokasi split picking per rak, serta atribusi picker per-produk/per-split ke log_produk #OUT"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.31.0",
    "versionCode": 510,
    "buildDate": "25 November 2026",
    "buildHash": "wms-261125-v510-1810",
    "releaseTitle": "WMS v2.31.0 — Scanner Batch Susulan Massal & Perbaikan Layout Panel Samping",
    "releaseNotes": [
      "Pagination & pencarian arsip riwayat picking, multi-lokasi split picking per rak, serta atribusi picker per-produk/per-split ke log_produk #OUT"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.30.1",
    "versionCode": 501,
    "buildDate": "25 November 2026",
    "buildHash": "wms-261125-v501-1703",
    "releaseTitle": "WMS v2.30.1 — Audit Hitung Ulang Multi-Batch & Anti False-Alarm Sheet",
    "releaseNotes": [
      "Pagination & pencarian arsip riwayat picking, multi-lokasi split picking per rak, serta atribusi picker per-produk/per-split ke log_produk #OUT"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.30.0",
    "versionCode": 500,
    "buildDate": "25 November 2026",
    "buildHash": "wms-261125-v500-0114",
    "releaseTitle": "WMS v2.30.0 — Riwayat Picking Lengkap, Multi-Lokasi Split & Picker Per-Produk",
    "releaseNotes": [
      "Pagination & pencarian arsip riwayat picking, multi-lokasi split picking per rak, serta atribusi picker per-produk/per-split ke log_produk #OUT"
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
