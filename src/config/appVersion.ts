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
  "version": "v2.6.72",
  "versionCode": 332,
  "buildDate": "6 November 2026",
  "buildHash": "wms-261106-v332-2128",
  "releaseTitle": "WMS v2.6.72 — Tampilan Kanban 3 Baris & Sinkronisasi Cover Trello Asli",
  "releaseNotes": [
    "Tampilan Papan Kanban kompak menampilkan 3 baris gambar vertikal per kolom",
    "Pilihan kerapatan kartu (3 Baris, Standar, Besar)",
    "Perbaikan seleksi cover foto resmi Trello dan auto-replace foto 'Belum Ada Sample'"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.71",
    "versionCode": 331,
    "buildDate": "6 November 2026",
    "buildHash": "wms-261106-v331-1933",
    "releaseTitle": "WMS v2.6.71 — Tampilan Papan Kanban Mirip Trello Asli",
    "releaseNotes": [
      "Opsi tampilan Papan Kanban interaktif dengan kolom per koleksi UP",
      "Kartu artikel cover foto GDrive sequence dan info artikel",
      "Dukungan multi-kolom horizontal scroll dan cetak per kolom"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.70",
    "versionCode": 330,
    "buildDate": "6 November 2026",
    "buildHash": "wms-261106-v330-1852",
    "releaseTitle": "WMS v2.6.70 — Sinkronisasi Foto Trello ke Google Drive CDN & Prioritas GDrive Image",
    "releaseNotes": [
      "Script otomatis download foto Trello dan simpan ke Google Drive",
      "Prioritaskan gdrive_image_url pada TrelloView dan Print Modal",
      "Subfolder otomatis per koleksi UP di Google Drive",
      "Counter real-time foto Google Drive di info strip"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.69",
    "versionCode": 329,
    "buildDate": "6 November 2026",
    "buildHash": "wms-261106-v329-1425",
    "releaseTitle": "WMS v2.6.69 — Dropsearch Multi-Choice & Trello Authenticated Image Loader",
    "releaseNotes": [
      "Opsi dropsearch multi choice untuk koleksi UP dengan live filter",
      "Komponen TrelloImage dengan OAuth blob cache menyelesaikan foto tidak terload",
      "Dukungan cetak A4 multi koleksi UP dengan label badge"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.68",
    "versionCode": 328,
    "buildDate": "6 November 2026",
    "buildHash": "wms-261106-v328-1351",
    "releaseTitle": "WMS v2.6.68 — Sinkronisasi Otomatis Trello ke Supabase & Resolusi Foto",
    "releaseNotes": [
      "Muat langsung 727 artikel dari tabel Supabase trello_up_catalog saat halaman dibuka",
      "Perbaikan ekstraksi attachment foto Trello",
      "Optimasi local cache tanpa batas 5MB"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.67",
    "versionCode": 327,
    "buildDate": "6 November 2026",
    "buildHash": "wms-261106-v327-1159",
    "releaseTitle": "WMS v2.6.67 — Modul Baru Koleksi UP (Trello) & Cetak A4",
    "releaseNotes": [
      "Halaman baru Koleksi UP Trello dengan Live Sync",
      "Cetak Susunan Koleksi UP Format A4",
      "Ekspor CSV dan Lightbox Foto",
      "Skema Tabel Supabase trello_up_catalog"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.66",
    "versionCode": 326,
    "buildDate": "6 November 2026",
    "buildHash": "wms-261106-v326-0608",
    "releaseTitle": "WMS v2.6.66 — Penyempurnaan Responsif Mobile Multi-Modul & Sticky App Bar",
    "releaseNotes": [
      "Header Sticky Mobile App Bar dengan hamburger, brand dan status aktif",
      "Navigasi tab horizontal swipeable di modul Produksi",
      "Wadah fluid elastis tanpa limit margin di modul Picking"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.65",
    "versionCode": 325,
    "buildDate": "6 November 2026",
    "buildHash": "wms-261106-v325-0551",
    "releaseTitle": "WMS v2.6.65 — Audit Seluler & Integrasi Agenda Project pada Dashboard",
    "releaseNotes": [
      "Audit menyeluruh antarmuka seluler (HP) dengan grid 2x2 rapi, zero text overflow, dan header ramping",
      "Menggantikan indikator SO dengan integrasi Proyek Berjalan dan Jadwal Kerja Hari Ini/Terdekat",
      "Navigasi instan dari dashboard langsung ke tab Kalendar Kerja & Proyek Milestone"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.64",
    "versionCode": 324,
    "buildDate": "5 November 2026",
    "buildHash": "wms-261105-v324-2252",
    "releaseTitle": "WMS v2.6.64 — Renovasi Dashboard Utama Bento Grid & Zero-Egress Protection",
    "releaseNotes": [
      "Transformasi Dashboard Utama dari dummy data menjadi Bento Box Grid operasional real-time",
      "Implementasi arsitektur Ultra-Lean Zero-Egress dengan HTTP Head-Only count headers dan cache 15 menit melindungi kuota Supabase Free Tier",
      "Pusat antrean kerja gudang dan 5 mutasi live ledger terkini dengan pintasan modul langsung"
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
