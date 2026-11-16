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
  "version": "v2.18.8",
  "versionCode": 388,
  "buildDate": "16 November 2026",
  "buildHash": "wms-261116-v388-1406",
  "releaseTitle": "WMS v2.18.8 — Perketat Kunci Portrait-Primary & Opsi Orientasi Layar Per-Perangkat",
  "releaseNotes": [
    "Ubah manifest PWA ke orientation portrait-primary (kunci 0 derajat tegak, hilangkan fallback SENSOR_PORTRAIT yang memicu sensor putar pada sebagian ROM Android)",
    "Perbaiki deteksi isMobilePhoneDevice untuk HP DPI kecil/Situs Desktop serta tambah listener orientationchange & gesture lock ulang",
    "Tambah kontrol Orientasi Layar HP di Pengaturan Perangkat (Kunci Tegak Default vs Ikuti Pengaturan HP OS)"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.18.7",
    "versionCode": 387,
    "buildDate": "16 November 2026",
    "buildHash": "wms-261116-v387-1316",
    "releaseTitle": "WMS v2.18.7 — Minimize Proses Tugas Picking & Perlindungan Offline",
    "releaseNotes": [
      "Fitur Minimize saat proses picking aktif (di header, sticky scanner bar, dan bar bawah) ke dock mengambang yang bebas digeser",
      "Perlindungan Offline penuh untuk Tugas Picking: auto-save draft per Surat Jalan ke memori lokal dan Outbox Offline idempotent saat penyelesaian SJ tanpa koneksi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.6",
    "versionCode": 386,
    "buildDate": "16 November 2026",
    "buildHash": "wms-261116-v386-1312",
    "releaseTitle": "WMS v2.18.6 — Minimize Tugas Picking, Perlindungan Offline & Perbaikan Lokasi Tunggal",
    "releaseNotes": [
      "Tambah tombol Minimize Picking di workspace Tugas Picking lengkap dengan banner lanjutkan di Daftar SJ & bubble floating draggable di dock lintas menu",
      "Tambah perlindungan offline Tugas Picking: auto-save draft per SJ, indikator Online/Offline, antrean outbox wms_picking_offline_outbox_v1, dan auto-sync ke Supabase saat kembali online",
      "Perbaiki bug klik pill lokasi dan tombol +1/Maks yang sebelumnya memicu log multi-lokasi anomali (koma/gabungan) agar selalu mencatat 1 rak tunggal prioritas serta flag Anomali di getAreaFromLokasi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.5",
    "versionCode": 385,
    "buildDate": "16 November 2026",
    "buildHash": "wms-261116-v385-1226",
    "releaseTitle": "WMS v2.18.5 — Submit Sekaligus Antrean Pengecekan Surat Jalan",
    "releaseNotes": [
      "Tambah tombol Submit Sekaligus / Submit Semua di Antrean Pengecekan SJ dengan modal ringkasan qty, pilihan status PENDING/SELESAI, dan simpan massal ke Supabase",
      "Rapikan hierarki tombol toolbar Antrean Pengecekan (1 primary solid + tombol sekunder outline)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
