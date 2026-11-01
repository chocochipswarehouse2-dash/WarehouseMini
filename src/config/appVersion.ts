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
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.6.32",
    "versionCode": 292,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v292-1417",
    "releaseTitle": "WMS v2.6.32 — Konsolidasi 4 Tab Inventory (Termasuk Scanner Barcode) & 4 Tab Loading Dock (Termasuk Tugas Picking)",
    "releaseNotes": [
      "Integrasi Scanner Barcode dan Log Produk ke dalam 4 Tab halaman Inventory (menghilangkan duplikasi menu Scanner",
      "LOG)",
      "Integrasi Tugas Picking sebagai tab ke-4 di halaman Loading Dock (Penerimaan, Pengiriman, Transfer Order, Tugas Picking)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.31",
    "versionCode": 291,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v291-1347",
    "releaseTitle": "WMS v2.6.31 — Penambahan Kolom Stok pada Tabel Log Produk di Detail Inventory",
    "releaseNotes": [
      "Penambahan kolom Stok (saldo stok rak saat transaksi) pada tabel dan kartu Log Produk di modal Detail Produk Inventory agar identik dengan tabel Log Produk utama"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.30",
    "versionCode": 290,
    "buildDate": "1 November 2026",
    "buildHash": "wms-261101-v290-1336",
    "releaseTitle": "WMS v2.6.30 — Redesain Scanner | Log Produk & Tampilan Tabel Log Produk di Detail Inventory",
    "releaseNotes": [
      "Perubahan nama Histori Mutasi & Mutasi menjadi Log Produk di seluruh aplikasi",
      "Penambahan tampilan Tabel (Table View) pada Log Produk di modal Detail Produk Inventory seperti pada halaman Scanner",
      "Log Produk",
      "Redesain tombol tab atas Scanner",
      "Log Produk menjadi lebih proporsional disertai 3 opsi tata letak (Panel Rapi, Tabel, Ringkas)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
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
