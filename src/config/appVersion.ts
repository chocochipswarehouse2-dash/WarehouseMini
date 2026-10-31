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
  "version": "v2.6.14",
  "versionCode": 274,
  "buildDate": "31 Oktober 2026",
  "buildHash": "wms-261031-v274-1052",
  "releaseTitle": "WMS v2.6.14 — Sinkronisasi Otomatis Realtime Data Katalog & Inventori Multi-Perangkat",
  "releaseNotes": [
    "Sinkronisasi Realtime Katalog: Menambahkan broadcast event 'catalog_updated' via Supabase Realtime WebSocket saat update database produk selesai",
    "Auto-Reload Inventori: Hook useInventoryStock dan InventoryView kini otomatis merefresh stok fisik seketika saat menerima event pembaruan katalog tanpa perlu klik tombol refresh manual",
    "Low-Egress Background Sync: Perangkat user lain otomatis mendeteksi pembaruan katalog dan menyinkronkan data tampilan secara live"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.13",
    "versionCode": 273,
    "buildDate": "31 Oktober 2026",
    "buildHash": "wms-261031-v273-0843",
    "releaseTitle": "WMS v2.6.13 — Optimasi Penghematan Kuota Supabase Log Ingestion",
    "releaseNotes": [
      "Menambahkan tab visibility guard agar polling berhenti total saat tab di-minimize",
      "Mengubah interval polling delta dari 10 detik ke 60 detik (menghemat 83 persen request)",
      "Menghapus kolom items yang besar dari select query notifikasi",
      "Menaikkan interval Service Worker background dari 25 detik ke 3 menit (menghemat 86 persen background traffic)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.12",
    "versionCode": 272,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v272-2109",
    "releaseTitle": "WMS v2.6.12 — Backward Compatibility Thread Reply Email Retur Lama",
    "releaseNotes": [
      "Menambahkan auto-deteksi tiket retur legacy agar update berikutnya otomatis me-reply utas email yang sudah ada di inbox tim",
      "Memastikan 100 persen tiket lama dan baru tersusun rapi dalam 1 thread percakapan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.11",
    "versionCode": 271,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v271-2043",
    "releaseTitle": "WMS v2.6.11 — Standarisasi Utas Percakapan (Thread Reply) Email Retur Barang",
    "releaseNotes": [
      "Standarisasi subjek email retur barang agar seluruh riwayat update & selesai otomatis menjadi balasan (reply) di thread email yang sama",
      "Menambahkan opsi auto-email balasan saat edit data retur dan banner visual update di badan email"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.10",
    "versionCode": 270,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v270-2010",
    "releaseTitle": "WMS v2.6.10 — Optimasi Instant Update PWA & FAQ Penjelasan Qty PO",
    "releaseNotes": [
      "Optimasi pembersihan precache PWA saat 1-klik Perbarui agar bundle versi terbaru langsung aktif",
      "Penjelasan lengkap keamanan data Qty PO buyer pada push master produksi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.9",
    "versionCode": 269,
    "buildDate": "30 Oktober 2026",
    "buildHash": "wms-261030-v269-1954",
    "releaseTitle": "WMS v2.6.9 — Restorasi Indikator Mode Aktif Scanner (#IN/#OUT/#SO)",
    "releaseNotes": [
      "Memulihkan kembali tombol pilihan dan indikator mode aktif (#IN Masuk, #OUT Keluar, #SO Opname) pada QuickTagToolbar scanner web app",
      "Menjawab arsitektur delta update untuk pengeditan data di frontend"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
