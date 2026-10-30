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
  "version": "v2.6.8",
  "versionCode": 268,
  "buildDate": "30 Oktober 2026",
  "buildHash": "wms-261030-v268-1847",
  "releaseTitle": "WMS v2.6.8 — Perbaikan Definisi Import fetchRecountAuditMapFromCloud & Ketahanan Sinkronisasi Nota",
  "releaseNotes": [
    "Menambahkan import fetchRecountAuditMapFromCloud dan getRecountAuditMap pada gasProduksiSync",
    "Pembersihan type check TypeScript di seluruh modul produksi dan appUpdateService",
    "Sinkronisasi Tarik Qty Nota kini 100% tervalidasi bebas runtime reference error"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.7",
    "versionCode": 267,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v267-1817",
    "releaseTitle": "WMS v2.6.7 — Sinkronisasi 2 Arah Qty Nota & Formula Status Audit Produksi",
    "releaseNotes": [
      "Perbaikan formula Status Audit dan Selisih Fisik di Google Sheet agar tidak muncul LEBIH palsu",
      "Implementasi Auto-Mirror Qty Nota dua arah antara Master Produksi dan Tab Sheet Tanggal",
      "Peningkatan ketahanan fetch Qty Nota dan penanganan error toast informatif"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.6",
    "versionCode": 266,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v266-1758",
    "releaseTitle": "WMS v2.6.6 — Formula Selisih Nota Akurat & Optimasi Tarik Qty Nota",
    "releaseNotes": [
      "Memperbaiki formula Selisih Nota Google Sheets agar tidak salah kalkulasi saat Qty Hitung Ulang kosong",
      "Memperbaiki pemetaan kolom Total Awal Net agar Selisih Nota akurat (568 - 570 = -2 pcs)",
      "Optimasi sinkronisasi Tarik Qty Nota menjadi super cepat tanpa timeout"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.5",
    "versionCode": 265,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v265-1736",
    "releaseTitle": "WMS v2.6.5 — Auto-Focus Antrian Audit & Fix Indikator Metrik",
    "releaseNotes": [
      "Otomatis mengarahkan ke tab Semua dan mencari kode yang baru dimasukkan ke antrian hitung ulang",
      "Memperbaiki kontras teks angka kartu KPI antrian saat aktif terpilih",
      "Memperjelas badge status Di Antrian pada modal pemanggil kode"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
