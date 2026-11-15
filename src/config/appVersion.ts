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
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.17.0",
    "versionCode": 370,
    "buildDate": "15 November 2026",
    "buildHash": "wms-261115-v370-1344",
    "releaseTitle": "WMS v2.17.0 — Denah 2D Setup Area & Pembaruan Dashboard Kapasitas",
    "releaseNotes": [
      "Tambahkan mode Denah 2D interaktif pada Visual 3D Kapasitas untuk setup penamaan area/zona, kode lokasi WMS berurutan, dan edit cepat via tabel yang tersinkron langsung ke 3D & Cloud",
      "Rombak Dashboard Interaktif Kapasitas agar lebih ringkas, tenang tanpa animasi berkedip berlebih, serta menyatukan strip kategori penyimpanan dan status rak"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.16.0",
    "versionCode": 360,
    "buildDate": "15 November 2026",
    "buildHash": "wms-261115-v360-2014",
    "releaseTitle": "WMS v2.16.0 — Kalender Agenda Distribusi & Modul Task Delegasi Terpisah",
    "releaseNotes": [
      "2 Opsi Tampilan Kalender: Agenda Event & Agenda Distribusi (terintegrasi Asisten AI)",
      "Pemisahan Modul Task Delegasi & Project: delegasi tugas ke Admin/CS/ID Karyawan beserta status & laporan hasil kerja"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.15.1",
    "versionCode": 351,
    "buildDate": "15 November 2026",
    "buildHash": "wms-261115-v351-1309",
    "releaseTitle": "WMS v2.15.1 — Dashboard Live: Antrean Picking, Kapasitas Blok F/Global, Breakdown Manual/Alter & Anomali Scan",
    "releaseNotes": [
      "Menghilangkan duplikasi 3x blok pintasan Dashboard dan menyinkronkan hitungan Antrean Hitung Ulang (BELUM vs SELISIH) dengan tab Audit Hitung Ulang",
      "Menambahkan live widget Antrean Tugas Picking serta panel Kapasitas Warehouse Global, Shopee, TikTok, Studio & IG Live",
      "Menampilkan breakdown status Manual Shipment & Alteration (Baru, Sedang Diproses, Selesai) dengan deep-link langsung ke tab Rekap",
      "Menambahkan deteksi & kartu peringatan Anomali Data Scan (lokasi anomali, stok minus, SKU rusak/non-master) beserta modal inspeksi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.15.0",
    "versionCode": 350,
    "buildDate": "15 November 2026",
    "buildHash": "wms-261115-v350-1233",
    "releaseTitle": "WMS v2.15.0 — Migrasi Notifikasi Manual Shipment & Alter ke Grup Live Chat WMS",
    "releaseNotes": [
      "Grup Live Chat WMS otomatis per Store (@warehouse + @chocoadm + 1 Store terkait) untuk seluruh update Manual Shipment & Alteration (submit, edit, resi, batal, SJ Marketplace, sold out, dan alur 2-arah)",
      "Isolasi penuh Inter-Store Fulfillment: Store penyedia menerima permintaan kirim terpisah di grupnya sendiri dengan mirroring progres ke grup Store pemohon",
      "Picking WA Grup (Fonnte) khusus Admin difilter ketat hanya untuk item Marketplace / Gudang Utama serta pembaruan FAQ bantuan Store"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.14.0",
    "versionCode": 340,
    "buildDate": "15 November 2026",
    "buildHash": "wms-261115-v340-0910",
    "releaseTitle": "WMS v2.14.0 — Popup Input Produksi, Antrean Hitung Ulang & Anti-Freeze Minimize Dock",
    "releaseNotes": [
      "Pintasan Dashboard & Popup Luas Input Penerimaan Produksi (bisa minimize, auto-save draft & pelindung offline anti double-input)",
      "Kartu Antrean Kode Butuh Hitung Ulang di Dashboard + Popup Audit Hitung Ulang (auto-save draft per kode & Outbox Hitung Ulang Offline)",
      "Unified Minimized Workspaces Dock (Anti-Collision & Zero-DOM Anti-Freeze saat banyak jendela kerja diminimize bersamaan)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.13.0",
    "versionCode": 330,
    "buildDate": "15 November 2026",
    "buildHash": "wms-261115-v330-0823",
    "releaseTitle": "WMS v2.13.0 — Upgrade Asisten AI Pintar (Agenda/Project, Audit, PDF/Voice) & Popup Scanner Luas Anti-Duplikat Offline",
    "releaseNotes": [
      "Ekspansi 19 Tool Asisten AI Pintar: integrasi Agenda & Project, audit stok/mutasi/rak, picking, QC/perbaikan, retur, HR, draft form, PDF & Voice-to-Text",
      "Popup Scanner Gudang luas yang dapat di-minimize (auto-pause kamera) saat bekerja di halaman lain",
      "Idempotent Offline Outbox Queue (Zero Double Input, Zero Data Loss & Zero Tabrakan dengan Webhook WA)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.12.5",
    "versionCode": 325,
    "buildDate": "15 November 2026",
    "buildHash": "wms-261115-v325-0140",
    "releaseTitle": "WMS v2.12.5 — Kalender Bulanan Agenda Muat Penuh 7 Hari di Layar HP",
    "releaseNotes": [
      "Menghapus min-w-[700px] pada Month View & menjadikan strip tanggal 7 kolom sejajar agar Senin-Minggu muat penuh di layar HP tanpa terpotong",
      "Menyembunyikan tombol + dan ikon emoji kalender per-sel di mobile serta mendukung wrap 2 baris pada chip agenda 1 hari agar judul tetap terbaca jelas"
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
