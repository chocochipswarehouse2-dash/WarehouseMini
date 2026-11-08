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
  "version": "v2.6.92",
  "versionCode": 352,
  "buildDate": "8 November 2026",
  "buildHash": "wms-261108-v352-1514",
  "releaseTitle": "WMS v2.6.92 — Matriks Input Penerimaan Produksi & Mode Ukuran (Multi-Size / All Size)",
  "releaseNotes": [
    "Desain kartu Input Penerimaan Produksi disesuaikan dengan referensi matriks ukuran (Banyak Ukuran S-3XL yang judul kolomnya dapat diedit & All Size / Free Size)",
    "Penyesuaian tampilan responsif HP Seluler (Grid 3 kolom ukuran, tanpa scroll horizontal)"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.91",
    "versionCode": 351,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v351-1451",
    "releaseTitle": "WMS v2.6.91 — Isolasi Sesi Multi-Tab & Pembersihan Cache Saat Ganti Akun",
    "releaseNotes": [
      "Reset otomatis seluruh Multi-Tab Keep-Alive, Panel Samping, dan halaman aktif saat Logout atau Login akun baru",
      "Filter ketat tab berdasarkan hak akses canAccessPage agar tab akun sebelumnya tidak pernah bocor ke akun lain",
      "Tampilan sapaan nama lengkap operator di Dashboard"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.90",
    "versionCode": 350,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v350-1435",
    "releaseTitle": "WMS v2.6.90 — Hotfix Pengaturan Sistem & Inisialisasi Halaman",
    "releaseNotes": [
      "Perbaikan inisialisasi variabel showToast, toggleDarkMode, dan updateModal pada halaman Pengaturan Sistem",
      "Sinkronisasi judul dan ikon halaman Pengaturan Sistem di Navbar"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.89",
    "versionCode": 349,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v349-1418",
    "releaseTitle": "WMS v2.6.89 — Pengaturan Sistem Menjadi Halaman Penuh Terpadu",
    "releaseNotes": [
      "Penyatuan menu pengaturan sistem, database, hak akses, dan migrasi",
      "Pengaturan sistem kini menjadi halaman utama (page) bukan popup modal",
      "Pembersihan duplikasi menu di sidebar dan integrasi tab Migrasi Supabase"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.88",
    "versionCode": 348,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v348-1254",
    "releaseTitle": "WMS v2.6.88 — Perbaikan Scroll Halaman Utama & Penghapusan Default Sandingkan",
    "releaseNotes": [
      "Hapus saran hardcoded Sandingkan Trello/Produksi menjadi tombol universal Buka Panel Samping (bebas pilih menu apa saja)",
      "Perbaikan CSS scroll container (overflow-x: clip & penghapusan backdrop-blur berat) agar scroll vertikal halaman utama lancar dan responsif"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.87",
    "versionCode": 347,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v347-1230",
    "releaseTitle": "WMS v2.6.87 — Hotfix Layar Blank / TDZ showToast pada Inisialisasi App",
    "releaseNotes": [
      "Perbaikan urutan deklarasi hook useCallback showToast di App.tsx yang sempat menyebabkan ReferenceError (layar gelap/blank) saat aplikasi dimuat"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.86",
    "versionCode": 346,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v346-1215",
    "releaseTitle": "WMS v2.6.86 — Multitasking Multi-Tab & Panel Samping (Khusus Laptop/PC) + Proteksi Operasional HP",
    "releaseNotes": [
      "Fitur Multi-Tab Keep-Alive & Panel Samping (Slide-Over / Split) khusus Laptop/PC (>= 1024px) untuk membuka 2 halaman sekaligus (misal Produksi berdampingan dengan Trello UP) tanpa me-reset form/filter",
      "Proteksi Ketat Operasional HP Seluler (< 1024px): Fitur multi-tab otomatis nonaktif di HP agar layar dan RAM HP 100% aman untuk operasional scanner & lapangan",
      "Penetapan Rule Permanen #13 di GEMINI.md dan Skill Agent agar seluruh agen mematuhi isolasi Desktop vs Mobile"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.85",
    "versionCode": 345,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v345-1209",
    "releaseTitle": "WMS v2.6.85 — Fix: Anti-Freeze Ketebalan Ikon & Penjelasan Icon Pack",
    "releaseNotes": [
      "Optimalisasi anti-freeze instan 0ms pada ketebalan ikon",
      "Penyesuaian label akurat Ketebalan Ikon (Light, Regular, Bold)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.84",
    "versionCode": 344,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v344-1148",
    "releaseTitle": "WMS v2.6.84 — Gaya Ikon (Icon Pack): Minimalist, Duotone, Sharp & Bold",
    "releaseNotes": [
      "Pembaruan Icon Pack tema dengan 4 karakter visual nyata: Minimalist Line, Duotone Semi-Fill, Sharp Industrial, dan Bold Stamp",
      "Pilihan gaya ikon tersedia di Pengaturan & Sesuaikan Tampilan"
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
