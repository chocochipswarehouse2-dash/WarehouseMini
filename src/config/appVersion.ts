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
  "version": "v2.6.4",
  "versionCode": 264,
  "buildDate": "30 Oktober 2026",
  "buildHash": "wms-261030-v264-1448",
  "releaseTitle": "WMS v2.6.4 — Pemisahan Kolom Kedatangan Multi-SJ & Fix Pencarian SJ",
  "releaseNotes": [
    "Kolom kedatangan pada spreadsheet sekarang otomatis dipisah per Surat Jalan jika datang di tanggal yang sama",
    "Pencarian riwayat dan spreadsheet sekarang dapat mencari berdasarkan No Surat Jalan"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.3",
    "versionCode": 263,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v263-1415",
    "releaseTitle": "WMS v2.6.3 — Fix Multi-SJ Produksi Push to GSheet",
    "releaseNotes": [
      "Otomatis menggabungkan multi-SJ pada tanggal kedatangan yang sama saat push ke Google Sheets tanpa saling menimpa",
      "Sinkronisasi utuh tab sheet 30-10-2026 Kargo berisi 16 model dan 116 pcs"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.2",
    "versionCode": 262,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v262-1233",
    "releaseTitle": "WMS v2.6.2 — Standarisasi UI/UX Gelombang 1 (Modul Inventory, Kapasitas & Log)",
    "releaseNotes": [
      "Standarisasi pembatas container max-w-[1600px] mencegah melar saat zoom out",
      "Sub-tab mobile swipe horizontal hemat ruang 40%",
      "Eliminasi pelangi tombol menjadi netral outline berhirarki",
      "Proporsi tabel fixed di Data Inventory dan Mutasi Log",
      "Simetri kartu KPI kapasitas dan pencegahan teks terpotong di HP"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
