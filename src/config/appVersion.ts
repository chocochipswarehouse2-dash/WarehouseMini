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
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.35.0",
    "versionCode": 550,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v550-1016",
    "releaseTitle": "WMS v2.35.0 — Aturan Potongan Gaji Lengkap, Edit Absensi Inline, & Publish Slip Gaji",
    "releaseNotes": [
      "Aturan siklus periode administrasi & kalkulasi gaji bulanan tanggal 26 bulan lalu s/d 25 bulan berjalan (contoh: 26 Okt - 25 Nov = November)",
      "Fungsi calculateMonthlyPayroll + tab Kalkulasi Gaji, Slip Gaji, & Ekspor Excel di Rekap HR",
      "Jadwal Shift (RosterShiftView) tetap ketat tanggal 1 s/d akhir bulan kalender",
      "Perbaikan off-by-one zona waktu WIB pada getDatesInRange"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.34.1",
    "versionCode": 541,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v541-0955",
    "releaseTitle": "WMS v2.34.1 — Perbaikan Akurasi KPI Absensi (Shift 3b, Cutoff Hari Ini, & Status Roster)",
    "releaseNotes": [
      "Aturan siklus periode administrasi & kalkulasi gaji bulanan tanggal 26 bulan lalu s/d 25 bulan berjalan (contoh: 26 Okt - 25 Nov = November)",
      "Fungsi calculateMonthlyPayroll + tab Kalkulasi Gaji, Slip Gaji, & Ekspor Excel di Rekap HR",
      "Jadwal Shift (RosterShiftView) tetap ketat tanggal 1 s/d akhir bulan kalender",
      "Perbaikan off-by-one zona waktu WIB pada getDatesInRange"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.34.0",
    "versionCode": 540,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v540-0222",
    "releaseTitle": "WMS v2.34.0 — Kalkulasi Gaji Bulanan Siklus 26–25",
    "releaseNotes": [
      "Aturan siklus periode administrasi & kalkulasi gaji bulanan tanggal 26 bulan lalu s/d 25 bulan berjalan (contoh: 26 Okt - 25 Nov = November)",
      "Fungsi calculateMonthlyPayroll + tab Kalkulasi Gaji, Slip Gaji, & Ekspor Excel di Rekap HR",
      "Jadwal Shift (RosterShiftView) tetap ketat tanggal 1 s/d akhir bulan kalender",
      "Perbaikan off-by-one zona waktu WIB pada getDatesInRange"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.33.2",
    "versionCode": 532,
    "buildDate": "27 November 2026",
    "buildHash": "wms-261127-v532-0050",
    "releaseTitle": "WMS v2.33.2 — Catatan Rilis Khusus Owner Warehouse",
    "releaseNotes": [
      "Catatan Rilis Terbaru dan Riwayat Pembaruan Sebelumnya di modal pembaruan kini hanya tampil untuk akun owner @warehouse",
      "Tooltip floating widget pembaruan menyesuaikan peran akun non-owner"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.33.1",
    "versionCode": 531,
    "buildDate": "26 November 2026",
    "buildHash": "wms-261126-v531-1206",
    "releaseTitle": "WMS v2.33.1 — Proteksi Reset 0 Pcs & Undo Reset Picking",
    "releaseNotes": [
      "Hapus tombol Reset 0 Pcs di sebelah Lanjutkan Picking pada kartu antrean agar tidak kepencet tidak sengaja",
      "Wajib ketik RESET untuk konfirmasi reset progres + backup Undo Reset otomatis 24 jam ke Supabase & draft lokal"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.33.0",
    "versionCode": 530,
    "buildDate": "26 November 2026",
    "buildHash": "wms-261126-v530-0623",
    "releaseTitle": "WMS v2.33.0 — Share Kekurangan Pengecekan SJ ke Tugas Picking",
    "releaseNotes": [
      "Tombol Share ke Tugas Picking pada item selisih kurang di Pengecekan SJ Pengiriman",
      "Rekonsiliasi SJ eksisting vs baru di picking_list, tampil hanya sisa kurang, dan anti-double #OUT via baseline persisten"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.32.1",
    "versionCode": 521,
    "buildDate": "26 November 2026",
    "buildHash": "wms-261126-v521-0304",
    "releaseTitle": "WMS v2.32.1 — Pembaruan Sistem & Optimasi Operasional",
    "releaseNotes": [
      "Pagination & pencarian arsip riwayat picking, multi-lokasi split picking per rak, serta atribusi picker per-produk/per-split ke log_produk #OUT"
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
