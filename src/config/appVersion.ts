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
  "version": "v2.39.1",
  "versionCode": 591,
  "buildDate": "27 November 2026",
  "buildHash": "wms-261127-v591-2101",
  "releaseTitle": "WMS v2.39.1 — Pembaruan Sistem & Optimasi Operasional",
  "releaseNotes": [
    "Perbaikan bug localStorage penuh (QuotaExceededError) yang membuat scan >5 item gagal tersimpan diam-diam meski muncul notif berhasil",
    "Perlindungan 3 lapis Outbox (In-Memory + Auto-Eviction localStorage + IndexedDB) & perbaikan race condition antrean simpan beruntun",
    "Notifikasi Data Scan Tersimpan kini wajib terverifikasi masuk ke Supabase terlebih dahulu (anti false-positive) & dukungan ganti lokasi tag #IN X002 / #X002"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.39.0",
    "versionCode": 590,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v590-2047",
    "releaseTitle": "WMS v2.39.0 — Pembaruan Sistem & Optimasi Operasional",
    "releaseNotes": [
      "Perbaikan bug localStorage penuh (QuotaExceededError) yang membuat scan >5 item gagal tersimpan diam-diam meski muncul notif berhasil",
      "Perlindungan 3 lapis Outbox (In-Memory + Auto-Eviction localStorage + IndexedDB) & perbaikan race condition antrean simpan beruntun",
      "Notifikasi Data Scan Tersimpan kini wajib terverifikasi masuk ke Supabase terlebih dahulu (anti false-positive) & dukungan ganti lokasi tag #IN X002 / #X002"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.38.3",
    "versionCode": 583,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v583-1718",
    "releaseTitle": "WMS v2.38.3 — Pembaruan Sistem & Optimasi Operasional",
    "releaseNotes": [
      "Perbaikan bug localStorage penuh (QuotaExceededError) yang membuat scan >5 item gagal tersimpan diam-diam meski muncul notif berhasil",
      "Perlindungan 3 lapis Outbox (In-Memory + Auto-Eviction localStorage + IndexedDB) & perbaikan race condition antrean simpan beruntun",
      "Notifikasi Data Scan Tersimpan kini wajib terverifikasi masuk ke Supabase terlebih dahulu (anti false-positive) & dukungan ganti lokasi tag #IN X002 / #X002"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.38.2",
    "versionCode": 582,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v582-1700",
    "releaseTitle": "WMS v2.38.2 — Pembaruan Sistem & Optimasi Operasional",
    "releaseNotes": [
      "Perbaikan bug localStorage penuh (QuotaExceededError) yang membuat scan >5 item gagal tersimpan diam-diam meski muncul notif berhasil",
      "Perlindungan 3 lapis Outbox (In-Memory + Auto-Eviction localStorage + IndexedDB) & perbaikan race condition antrean simpan beruntun",
      "Notifikasi Data Scan Tersimpan kini wajib terverifikasi masuk ke Supabase terlebih dahulu (anti false-positive) & dukungan ganti lokasi tag #IN X002 / #X002"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.38.1",
    "versionCode": 581,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v581-1614",
    "releaseTitle": "WMS v2.38.1 — Perbaikan Kritis Outbox Scan & Anti-QuotaExceeded",
    "releaseNotes": [
      "Perbaikan bug localStorage penuh (QuotaExceededError) yang membuat scan >5 item gagal tersimpan diam-diam meski muncul notif berhasil",
      "Perlindungan 3 lapis Outbox (In-Memory + Auto-Eviction localStorage + IndexedDB) & perbaikan race condition antrean simpan beruntun",
      "Notifikasi Data Scan Tersimpan kini wajib terverifikasi masuk ke Supabase terlebih dahulu (anti false-positive) & dukungan ganti lokasi tag #IN X002 / #X002"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.38.0",
    "versionCode": 580,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v580-1344",
    "releaseTitle": "WMS v2.38.0 — Tambah Lokasi E Warehouse (E001–E050)",
    "releaseNotes": [
      "Menambahkan Lokasi E (E001–E050, kapasitas default 75 pcs, kategori Umum, dapat diubah di Setup Kapasitas) ke Area Warehouse Priority 1",
      "Sinkronisasi pengenalan kode rak E di Scanner, Picking, Putaway, Kapasitas Rak, Kosongkan Rak, Cetak Label, Anomali/SO, & Bot WA GAS",
      "Auto-migrasi konfigurasi kapasitas rak tersimpan tanpa menimpa pengaturan kustom"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.37.0",
    "versionCode": 570,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v570-1252",
    "releaseTitle": "WMS v2.37.0 — Pemisahan Roster 2 Mode: Jadwal Shift & Hasil Absensi",
    "releaseNotes": [
      "Tabel Roster kini memiliki 2 opsi tampilan terpisah: Jadwal Shift (murni S1/S2/S3/OFF) dan Hasil Absensi (Tepat Waktu, Terlambat, Tak Pulang, Cuti/Izin/Sakit, Bolos, Pra-Join)",
      "Edit Hasil Absensi langsung dari matriks/kalender/mingguan/harian hanya mengubah tabel presensi tanpa mengganggu Jadwal Shift, dan sebaliknya"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.36.1",
    "versionCode": 561,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v561-1226",
    "releaseTitle": "WMS v2.36.1 — Akurasi KPI Absensi (Roster-First, Full Shift 9 Jam & Bobot Kehadiran 40%)",
    "releaseNotes": [
      "Evaluasi keterlambatan KPI & Payroll kini memprioritaskan jam masuk Roster aktual (menghilangkan false late Shift 3a/3b yang tercatat Shift 1)",
      "Deteksi pulang normal mendukung durasi kerja penuh >= 8 jam 50 menit untuk tukar shift",
      "Bobot KPI diseimbangkan ke Kehadiran 40%, Berangkat 35%, Pulang 25% + tie-breaker kehadiran penuh & tampilkan % Kehadiran di podium KPI"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.36.0",
    "versionCode": 560,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v560-1059",
    "releaseTitle": "WMS v2.36.0 — Prorata Gaji Karyawan Baru, Join Date & Pemilih Periode Terpisah",
    "releaseNotes": [
      "Input Tanggal Bergabung (Join Date) & Tanggal Lahir ditambahkan di Master Karyawan (modal Tambah/Edit & Detail)",
      "Tanggal sebelum join date otomatis berstatus Belum Bergabung (Pra-Join) tanpa Alpha/Bolos atau penalti KPI, dengan prorata Gaji Pokok & Tunjangan proporsional hari kerja aktif",
      "Pemilih periode 26-25 di HR Rekap dipisah menjadi dropdown Nama Bulan (Januari-Desember) + panah bulan & field Tahun manual"
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
