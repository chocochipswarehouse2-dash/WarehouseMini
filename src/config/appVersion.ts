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
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.6.83",
    "versionCode": 343,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v343-1112",
    "releaseTitle": "WMS v2.6.83 — Profil Store: No. HP dari Master Kontak",
    "releaseNotes": [
      "Profil akun Store otomatis menampilkan No. HP & email dari Master Kontak Store",
      "Edit No. HP/email di profil Store ikut memperbarui Master Kontak Store"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.82",
    "versionCode": 342,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v342-1109",
    "releaseTitle": "WMS v2.6.82 — Trello Auto-Sync & Tanpa Filter Default",
    "releaseNotes": [
      "Trello WMS otomatis sinkron dari Trello asli setiap 60 detik + saat halaman dibuka/kembali aktif",
      "Kartu yang dihapus/diarsip di Trello asli ikut hilang di WMS",
      "Tombol Sinkronkan Trello manual tetap tersedia",
      "Halaman Trello dibuka tanpa filter UP default"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.81",
    "versionCode": 341,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v341-1053",
    "releaseTitle": "WMS v2.6.81 — Profil: Auto Logout setelah Ganti Password",
    "releaseNotes": [
      "Setelah password diganti, user otomatis logout dalam 3 detik dan wajib login ulang",
      "Simpan profil & password diverifikasi benar-benar tersimpan di Supabase wms_users"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.80",
    "versionCode": 340,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v340-1048",
    "releaseTitle": "WMS v2.6.80 — Profil Pengguna",
    "releaseNotes": [
      "Klik kartu user di sidebar membuka popup Profil",
      "Edit nama, No. HP & email",
      "Ganti password (verifikasi password lama, SHA-256)",
      "Upload foto profil atau pilih avatar"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.79",
    "versionCode": 339,
    "buildDate": "8 November 2026",
    "buildHash": "wms-261108-v339-0957",
    "releaseTitle": "WMS v2.6.79 — Presisi Urutan Kolom Kanban Trello Asli",
    "releaseNotes": [
      "Sinkronisasi posisi list horizontal papan Trello asli ke Kanban WMS",
      "Penyelarasan urutan UP batch dari kiri ke kanan (September ke April)",
      "Pencegahan salah parse judul tanggal menjadi nomor batch"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.78",
    "versionCode": 338,
    "buildDate": "7 November 2026",
    "buildHash": "wms-261107-v338-2302",
    "releaseTitle": "WMS v2.6.78 — Audit & Optimasi Halaman Inventory, Lookup Master SKU & Drawer Komparasi",
    "releaseNotes": [
      "Perbaikan tabel Komparasi Fisik vs DealPOS per Area (MAP, LIVE, STUDIO, PERMAK, DEFECT) di Drawer Rincian Inventory agar kuantitas fisik live tidak berubah menjadi 0",
      "Standarisasi 100% lookup Nama Produk dan Size via Master Produk (resolveProductName & resolveProductDisplaySize) di Tabel Stok, Kapasitas Rak & 3D Gudang tanpa anomali Default/SKU",
      "Penambahan fungsi pengurutan kolom Area (AREA_ASC & AREA_DESC) pada Tabel Stok Inventory",
      "Sinkronisasi otomatis realtime store Inventory saat perbaikan anomali atau update stok (wms_inventory_updated & wms_stock_updated)"
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
