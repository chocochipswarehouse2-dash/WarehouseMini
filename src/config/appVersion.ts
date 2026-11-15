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
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.12.4",
    "versionCode": 324,
    "buildDate": "14 November 2026",
    "buildHash": "wms-261114-v324-2330",
    "releaseTitle": "WMS v2.12.4 — Fix Tampilan Menu Notifikasi Perangkat di Drawer Mobile",
    "releaseNotes": [
      "Memperbaiki bug kondisi collapsed pada renderQuickTools di Sidebar agar menu Notifikasi Perangkat dan switch ON/OFF tampil penuh di Mobile Drawer (tidak hanya ikon lonceng)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.12.3",
    "versionCode": 323,
    "buildDate": "14 November 2026",
    "buildHash": "wms-261114-v323-2326",
    "releaseTitle": "WMS v2.12.3 — Penyempurnaan Tampilan Switch Notifikasi Perangkat",
    "releaseNotes": [
      "Mengganti tampilan tombol ON/OFF ganda pada Notifikasi Perangkat menjadi switch standar yang bersih dan sejajar di Sidebar, Notification Hub, dan Settings"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.12.2",
    "versionCode": 322,
    "buildDate": "14 November 2026",
    "buildHash": "wms-261114-v322-2316",
    "releaseTitle": "WMS v2.12.2 — Audit Header, Isolasi Profil & Akses Store, serta Kontrol ON/OFF Notifikasi Perangkat",
    "releaseNotes": [
      "Perbaikan tampilan & responsivitas Header aplikasi di seluler dan desktop",
      "Audit Profil User: akun Store & non-karyawan tidak lagi masuk profil Warehouse (WH0001), bebas KPI, dan memblokir kebocoran menu Pengaturan Sistem [ADMIN]",
      "Kontrol switch ON/OFF Notifikasi Perangkat di Sidebar, Notification Hub & Settings (menghentikan pop-up OS, Web Push, Service Worker watcher & suara chime saat OFF)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.12.1",
    "versionCode": 321,
    "buildDate": "14 November 2026",
    "buildHash": "wms-261114-v321-1123",
    "releaseTitle": "WMS v2.12.1 — Penandaan Otomatis Status BOLOS pada Jadwal Roster Shift",
    "releaseNotes": [
      "Karyawan yang tidak melakukan absensi datang dan pulang pada hari kerja otomatis ditandai sebagai BOLOS pada Jadwal Roster Shift (Matriks Sebulan, Kalender Staf, Mingguan, Tabel Harian & Kartu)",
      "Menambahkan indikator statistik Bolos (Alpha), filter khusus Bolos, serta detail keterangan audit (Tidak Absen Datang & Pulang / Tidak Absen Pulang) beserta jadwal shift awalnya"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.12.0",
    "versionCode": 320,
    "buildDate": "14 November 2026",
    "buildHash": "wms-261114-v320-1106",
    "releaseTitle": "WMS v2.12.0 — Relokasi & Multi-Select Kosongkan Rak, Minimize Background & Roster Shift Bulanan Responsif HP",
    "releaseNotes": [
      "Fitur Relokasi Rak Penuh (contoh X105 ke V004) & Multi-Select Kosongkan Rak langsung dari Dashboard Interaktif Kapasitas",
      "Fitur Minimize ke latar belakang untuk Reset Lokasi & Relokasi Rak serta optimasi chunking anti-freeze (bebas Page Not Responding)",
      "Perbaikan tampilan Roster Shift Matriks Bulanan (1-31) di HP: kolom sticky kompak 112px, filter rentang mingguan, proteksi sentuh geser, dan Mode Kalender Staf 7 kolom"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.10",
    "versionCode": 320,
    "buildDate": "13 November 2026",
    "buildHash": "wms-261113-v320-0638",
    "releaseTitle": "WMS v2.11.10 — Perbaikan VLOOKUP Size Master Produk (F25GBG278BNL/BNS & Akhiran Warna + S/M/L)",
    "releaseNotes": [
      "Menghapus override heuristik isCorruptedColorCodeSize terhadap data resmi master_produk sehingga SKU seperti F25GBG278BNL (L) dan F25GBG278BNS (S) tampil akurat sesuai database",
      "Memperbaiki batas 1.000 baris PostgREST pada Delta Sync master_produk dan menaikkan versi IndexedDB ke v7 agar cache lokal tersinkronisasi 100%"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.9",
    "versionCode": 319,
    "buildDate": "13 November 2026",
    "buildHash": "wms-261113-v319-0143",
    "releaseTitle": "WMS v2.11.9 — Minimize Background Update Database & Notifikasi Eksklusif Warehouse",
    "releaseNotes": [
      "Fitur Update Database Master (CSV) kini dapat di-minimize ke latar belakang saat proses upload berjalan tanpa menghalangi aktivitas menu lain",
      "Indikator mengambang (Floating Progress Widget) di pojok kanan bawah menampilkan progres persentase, jumlah SKU, dan tombol Buka Detail",
      "Notifikasi selesai Update Database (Toast, Notification Hub & Push Notification) dikunci eksklusif hanya untuk akun utama Warehouse"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.11.8",
    "versionCode": 318,
    "buildDate": "13 November 2026",
    "buildHash": "wms-261113-v318-0759",
    "releaseTitle": "WMS v2.11.8 — Fix Import Master CSV Verbatim & Hemat Egress",
    "releaseNotes": [
      "UpdateDatabaseModal kini menyimpan size CSV DealPOS apa adanya (menutup sumber data karangan A->ALL, B->XS, G->XXL)",
      "Pertahankan nilai Default apa adanya di Retur, Manual Shipment, Distribusi, dan AI",
      "Optimasi egress: naikkan ambang logGap ke 2000, batasi select picking_list ke 800 baris, dan longgarkan interval polling"
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
