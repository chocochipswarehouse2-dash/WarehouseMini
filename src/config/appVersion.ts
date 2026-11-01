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
  "version": "v2.6.30",
  "versionCode": 290,
  "buildDate": "1 November 2026",
  "buildHash": "wms-261101-v290-2037",
  "releaseTitle": "WMS v2.6.30 — Fix Live Chat Image Sync & Missing DocKey in Query",
  "releaseNotes": [
    "Perbaiki fetchSystemDocJson interpolasi docKey Supabase",
    "Realtime re-render foto pada desktop & PWA",
    "Passing initialRoomId ke workspace"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.29",
    "versionCode": 289,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v289-1953",
    "releaseTitle": "WMS v2.6.29 — Clean Env Vars in Push Serverless",
    "releaseNotes": [
      "Trim whitespace dan kutip dari env vars push backend"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.28",
    "versionCode": 288,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v288-1949",
    "releaseTitle": "WMS v2.6.28 — Web Push CJS/ESM Interop & Exception Guard",
    "releaseNotes": [
      "Fix webpush module import di Vercel Node runtime",
      "Try-catch internal error guard"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.27",
    "versionCode": 287,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v287-1927",
    "releaseTitle": "WMS v2.6.27 — Support Supabase Secret Keys in Web Push",
    "releaseNotes": [
      "Kompatibilitas sb_secret_ pada backend push",
      "Headers Authorization Bearer universal"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.26",
    "versionCode": 286,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v286-1846",
    "releaseTitle": "WMS v2.6.26 — Web Push: Notifikasi Pesanan & Chat Saat Aplikasi Ditutup",
    "releaseNotes": [
      "Web Push (VAPID) gaya WhatsApp: notifikasi Pesanan Baru, Retur, SPS, dan Live Chat tetap masuk walau aplikasi / browser ditutup",
      "Pendaftaran perangkat otomatis setelah izin notifikasi diberikan; berhenti otomatis saat logout",
      "Balas Cepat & Tandai Dibaca langsung dari notifikasi chat; tidak ada notifikasi ganda saat aplikasi sedang terbuka"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.25",
    "versionCode": 285,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v285-1831",
    "releaseTitle": "WMS v2.6.25 — Fluid Full-Width Layout & Anti-Dead Zones pada Zoom Out",
    "releaseNotes": [
      "Fluid Workspace Architecture: Eliminasi pembatas sempit max-w-7xl dan max-w-1600px di seluruh modul utama",
      "Dynamic Grid Scaling: Rak visual otomatis menambah kolom hingga 12-14 kolom saat zoom out atau widescreen",
      "Matriks Roster & Spreadsheet Lega: Kalender 31 hari dan tabel inventory kini memanfaatkan 100% lebar layar"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.24",
    "versionCode": 284,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v284-1052",
    "releaseTitle": "WMS v2.6.24 — Perbaikan Tampilan & Simpan Penuh Roster Shift Bulanan (1-31)",
    "releaseNotes": [
      "Perbaikan batas 1.000 baris Supabase PostgREST pada fetchRosterShiftList dengan auto-paginasi agar jadwal tanggal 06-31 selalu tampil utuh",
      "Optimasi batchSaveRosterShifts menggunakan bulk upsert atomik anti-bentrok ID untuk penyimpanan jadwal sebulan penuh dalam hitungan milidetik"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.23",
    "versionCode": 283,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v283-1037",
    "releaseTitle": "WMS v2.6.23 — Pola Reguler Shift Bulanan (Shift 1, Shift 2, Shift 3a/3b, Minggu Off) & Sticky Save Bar",
    "releaseNotes": [
      "Aturan baku Pola Reguler Bulanan: Libur Hari Minggu (OFF), Shift 1 (08:00-17:00), Shift 2 (09:00-18:00), serta Shift 3 otomatis memetakan Senin-Jumat ke 3a (12:00-21:00) dan Sabtu ke 3b (11:00-20:00)",
      "Tombol Simpan Data Shift tersedia di 4 posisi: Floating Bar Melayang di bawah layar, Header Utama, Generator Massal (Isi & Langsung Simpan), serta Footer Tabel",
      "Pengaturan, Generator, Template, dan Edit Shift dikunci ketat khusus Admin / Superadmin (Operator hanya Mode Tinjau / Read-Only)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.22",
    "versionCode": 282,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v282-0936",
    "releaseTitle": "WMS v2.6.22 — Matriks Spreadsheet Roster 1 Bulan Penuh (Multi-Karyawan & Kuas Shift Cepat)",
    "releaseNotes": [
      "Tampilan baru Matriks Sebulan (Tanggal 1-31 x Seluruh Karyawan) di menu Roster Shift tanpa perlu edit satu-satu atau import CSV",
      "Generator Massal 1 Bulan dengan fitur Bagi Hari Libur Bergilir Otomatis (Senin-Minggu merata antar staf), Rotasi Mingguan, dan Bagi 2 Tim",
      "Fitur Set Cepat 1 Bulan per baris karyawan (S1/S2/3A + Hari Off individu) serta Mode Kuas Klik & Geser (Drag Paint) di sel tanggal dengan 1-Klik Simpan Semua"
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
