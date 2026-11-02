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
  "version": "v2.6.41",
  "versionCode": 301,
  "buildDate": "2 November 2026",
  "buildHash": "wms-261102-v301-1015",
  "releaseTitle": "WMS v2.6.41 — Proteksi Penolakan Duplikat File pada Sesi Upload Bersamaan",
  "releaseNotes": [
    "Otomatis menerima file pertama dan menolak file kedua jika 2 file SJ kembar diupload bersamaan",
    "Pesan peringatan transparan memunculkan nama file yang diterima dan file yang ditolak untuk mencegah data ganda"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.6.40",
    "versionCode": 300,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v300-1006",
    "releaseTitle": "WMS v2.6.40 — Blokir & Tolak Otomatis Import Duplikat Surat Jalan",
    "releaseNotes": [
      "Sistem otomatis menolak import file jika Nomor Surat Jalan sudah terdaftar di sistem (Riwayat Pending/Selesai atau Draft Aktif)",
      "Dialog peringatan penolakan lengkap dengan rincian status SJ lama dan opsi konfirmasi timpa khusus revisi resmi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.39",
    "versionCode": 299,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v299-0953",
    "releaseTitle": "WMS v2.6.39 — Proteksi Impor Duplikat SJ & Indikator Riwayat Pengecekan",
    "releaseNotes": [
      "Sistem otomatis mendeteksi impor file SJ ganda tanpa mendobelkan kuantitas (prinsip Replace terproteksi)",
      "Peringatan visual seketika dan badge '⚠️ Pernah Selesai' jika SJ yang diimpor sudah pernah tercatat di Riwayat Pengecekan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.38",
    "versionCode": 298,
    "buildDate": "2 November 2026",
    "buildHash": "wms-261102-v298-0020",
    "releaseTitle": "WMS v2.6.38 — Mode Presentasi 3D & Panduan Interaksi Rak",
    "releaseNotes": [
      "Menambahkan mode presentasi fullscreen 3D dengan tur 360° dan panduan lengkap edit, geser, serta ubah ukuran rak"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.37",
    "versionCode": 297,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v297-2239",
    "releaseTitle": "WMS v2.6.37 — Perbaikan LiveChat Icon & Typings",
    "releaseNotes": [
      "Menambahkan import icon Crown, LogOut, UserMinus yang hilang pada LiveChat",
      "Perbaikan type-safety dan pembersihan order context card",
      "Sinkronisasi integrasi cloud 3D Warehouse layout"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.36",
    "versionCode": 296,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v296-2222",
    "releaseTitle": "WMS v2.6.36 — Perbaikan Visual 3D & Kapasitas Rak",
    "releaseNotes": [
      "Memperbaiki inisialisasi gedung 4 lantai pada visual 3D",
      "Memperbaiki urutan parameter computeAllRackSlots agar kapasitas live WMS tersinkron sempurna"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.35",
    "versionCode": 295,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v295-1554",
    "releaseTitle": "WMS v2.6.35 — Tab 3D Visual Kapasitas Gudang di Inventory",
    "releaseNotes": [
      "Menambahkan tab baru 3D Visual Kapasitas pada halaman Inventory (5 tab terpadu)",
      "Integrasi penuh Perancang Gudang 3D (4 Lantai, 92 aset awal) dengan stok & kapasitas rak Gudang WMS secara real-time",
      "Fitur Mode Heatmap 3D Live (Hijau/Kuning/Merah), Auto-Map kode rak WMS (A/B/C/D, Koli R/V/Z, Studio), dan Simpan Layout ke Cloud"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.34",
    "versionCode": 294,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v294-2218",
    "releaseTitle": "WMS v2.6.34 — Perbaikan Pesanan Saya (MessageSquare) & Live Chat Order Card",
    "releaseNotes": [
      "Perbaiki error MessageSquare is not defined pada tab Pesanan Saya",
      "Rapikan order context card dan autocomplete mention pada Live Chat"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.33",
    "versionCode": 293,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v293-1448",
    "releaseTitle": "WMS v2.6.33 — Tabel Riwayat Peminjaman & Tanggal Kembali + Integrasi 3 Tab Cetak Label & Barcode",
    "releaseNotes": [
      "Riwayat Peminjaman (SPS) kini dilengkapi tampilan Tabel proporsional (selain Kartu & Panel Rapi), filter KPI interaktif, ekspor CSV, serta pencatatan Rencana & Tanggal Kembali Aktual beserta durasi pinjam dan catatan pengembalian.",
      "Halaman Cetak kini disatukan menjadi 1 menu 'Cetak Label & Barcode' dengan 3 tab rapi: QR Prefix, Label Paket, dan Cetak Barcode.",
      "Tampilan tab QR Prefix dirapikan total menjadi layout 2 kolom (Generator & Antrean di kiri, Pratinjau Stiker & Kustomisasi di kanan) tanpa duplikasi header bertumpuk."
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
