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
  "version": "v2.18.4",
  "versionCode": 384,
  "buildDate": "16 November 2026",
  "buildHash": "wms-261116-v384-0821",
  "releaseTitle": "WMS v2.18.4 — Fitur Geser Bebas Semua Bubble Minimize",
  "releaseNotes": [
    "Semua bubble minimize (Update Database, Reset Lokasi, Dock Scanner/Produksi/Hitung Ulang, Asisten AI, Update Aplikasi) kini bisa digeser bebas ke seluruh area layar (mouse & sentuh)",
    "Posisi kustom tiap bubble tersimpan otomatis di perangkat dengan batas aman viewport dan reset cepat klik 2x pada grip handle"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.18.3",
    "versionCode": 383,
    "buildDate": "16 November 2026",
    "buildHash": "wms-261116-v383-0802",
    "releaseTitle": "WMS v2.18.3 — Perbaikan Stabilitas Indeks Live Chat (Anti-Hilang & Atomic CAS)",
    "releaseNotes": [
      "Proteksi atomic CAS PATCH + antrean sinkronisasi pada wms_chat_rooms_index_v1 agar grup & chat tidak pernah terhapus akibat gangguan jaringan atau tulis bersamaan",
      "Sinkronisasi CAS di Service Worker (pwa-extras.js) untuk aksi Balas Cepat & Tandai Dibaca",
      "Pemulihan 5 ruang chat non-tombstone (termasuk grup tim QC & chat store) dari riwayat pesan Supabase"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.2",
    "versionCode": 382,
    "buildDate": "16 November 2026",
    "buildHash": "wms-261116-v382-0744",
    "releaseTitle": "WMS v2.18.2 — Kunci Hapus Grup Chat Store MS/Alter & Auto-Save Import Awal Pengecekan SJ",
    "releaseNotes": [
      "Kunci akses hapus & keluar grup chat operasional Store Manual/Alter (store_ops) bagi Store maupun Admin Warehouse",
      "Simpan otomatis data Pengecekan SJ ke database Supabase (status PENDING) sejak import CSV pertama dan saat revisi timpa file"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.1",
    "versionCode": 381,
    "buildDate": "16 November 2026",
    "buildHash": "wms-261116-v381-0703",
    "releaseTitle": "WMS v2.18.1 — Muat Penuh Semua Riwayat Pengecekan SJ (Hapus Batas 200)",
    "releaseNotes": [
      "Hapus batas limit=200 pada fetch pengecekan_sj dengan pagination penuh (supabaseFetchAllPages) sehingga seluruh 666+ SJ dapat ditemukan & diekspor",
      "Simpan cache lengkap riwayat pengecekan_sj di IndexedDB (anti limit 5MB localStorage) & ubah simpan ulang menjadi PATCH atomik"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.0",
    "versionCode": 380,
    "buildDate": "16 November 2026",
    "buildHash": "wms-261116-v380-0137",
    "releaseTitle": "WMS v2.18.0 — Relokasi Rak Multi-Rute Sekaligus",
    "releaseNotes": [
      "Tambah mode Multi-Rute di modal Relokasi Rak untuk memindahkan banyak pasangan rak sekaligus dalam 1 aksi",
      "Dukungan tempel daftar rute otomatis, pratinjau stok & simulasi kapasitas per baris, serta bukti A4 & ringkasan WA batch"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.17.4",
    "versionCode": 374,
    "buildDate": "16 November 2026",
    "buildHash": "wms-261116-v374-0116",
    "releaseTitle": "WMS v2.17.4 — Audit Tampilan & Standarisasi Bahasa Antarmuka Profesional",
    "releaseNotes": [
      "Standarisasi istilah, label, dan petunjuk antarmuka di Dashboard, Kapasitas Rak, Denah 2D/3D, Popup Operasional, dan Live Chat agar ringkas dan profesional",
      "Hilangkan jargon teknis internal dan kalimat instruksi bertele-tele pada komponen antarmuka"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.17.3",
    "versionCode": 373,
    "buildDate": "15 November 2026",
    "buildHash": "wms-261115-v373-2350",
    "releaseTitle": "WMS v2.17.3 — Emoji Picker & Reaksi Emoticon Live Chat",
    "releaseNotes": [
      "Tambahkan tombol & panel Pemilih Emoticon/Emoji lengkap (Gudang & Kerja, Ekspresi, Gestur, Simbol) pada kolom ketik Live Chat Desktop & HP",
      "Tambahkan fitur Reaksi Emoticon cepat (👍 🙏 ✅ ❤️ 😂 🔥 📦 👀) pada setiap balon pesan Live Chat"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.17.2",
    "versionCode": 372,
    "buildDate": "15 November 2026",
    "buildHash": "wms-261115-v372-2108",
    "releaseTitle": "WMS v2.17.2 — Multi-Tab Desktop 4 Tab & Opsi Font Bawaan Sistem",
    "releaseNotes": [
      "Naikkan batas maksimal tab Keep-Alive Desktop dari 3 menjadi 4 tab",
      "Tambahkan opsi font Bawaan Sistem (Laptop) pada pengaturan Tema & Tampilan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.17.1",
    "versionCode": 371,
    "buildDate": "15 November 2026",
    "buildHash": "wms-261115-v371-2100",
    "releaseTitle": "WMS v2.17.1 — Kelola Cache Lokal Per Modul & Akses Semua User",
    "releaseNotes": [
      "Tambahkan fitur clear cache lokal per modul maupun semua modul sekaligus (Katalog, Picking, Mutasi, Store, Opname, Produksi, Dashboard, Shopee, Website, PWA)",
      "Hadirkan menu Kelola Cache di Modal Pembaruan Aplikasi agar dapat diakses seluruh role user"
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
