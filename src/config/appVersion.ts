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
  "version": "v2.19.0",
  "versionCode": 390,
  "buildDate": "17 November 2026",
  "buildHash": "wms-261117-v390-1951",
  "releaseTitle": "WMS v2.19.0 — Area Sortir (ST) & Smart Picking Filter Pengecekan SJ",
  "releaseNotes": [
    "Tambah Area Sortir (ST001-STnnn) ke seluruh modul WMS",
    "Filter Picking Pengecekan SJ hanya tampilkan lokasi Warehouse, Kolian, dan Transit"
  ],
  "minSupportedVersion": "v2.0.0"
};

export const VERSION_HISTORY: VersionInfo[] = [
  {
    "version": "v2.18.12",
    "versionCode": 392,
    "buildDate": "17 November 2026",
    "buildHash": "wms-261117-v392-0935",
    "releaseTitle": "WMS v2.18.12 — Auto-Provisioning & Pemulihan Grup Chat [MS & Alter] Store",
    "releaseNotes": [
      "Provisioning batch seluruh grup [MS & Alter] Store resmi via 1 atomic CAS + sinkronisasi otomatis pesanan yang terlewat (backfill 48 jam & Realtime receiver healing)",
      "Perbaikan await notifikasi Live Chat saat submit pesanan Store serta merge server sebelum simpan agar riwayat chat tidak pernah tertimpa"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.11",
    "versionCode": 391,
    "buildDate": "17 November 2026",
    "buildHash": "wms-261117-v391-1343",
    "releaseTitle": "WMS v2.18.11 — Multi-PIC Delegasi Tugas Agenda",
    "releaseNotes": [
      "Dukungan pilih lebih dari 1 PIC saat buat/edit Delegasi Tugas di modul Agenda & Tasks",
      "Tampilan badge multi-PIC pada kartu tugas dan pencocokan Tugas Saya untuk semua PIC terpilih"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.10",
    "versionCode": 390,
    "buildDate": "17 November 2026",
    "buildHash": "wms-261117-v390-1314",
    "releaseTitle": "WMS v2.18.10 — Multi-Choice Dropsearch Filter Asal & Tujuan Pengecekan SJ",
    "releaseNotes": [
      "Ubah filter Asal dan Tujuan di Riwayat Pengecekan SJ menjadi Multi-Select Dropsearch dengan pencarian dan jumlah SJ per opsi"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.18.9",
    "versionCode": 389,
    "buildDate": "17 November 2026",
    "buildHash": "wms-261117-v389-1307",
    "releaseTitle": "WMS v2.18.9 — Filter Asal, Tujuan, Tanggal, Sort & Stay on Pengecekan SJ",
    "releaseNotes": [
      "Tambah filter Asal, Tujuan, Tanggal (Dari-Sampai) & Sort Asal/Tujuan/Tanggal di Riwayat Pengecekan SJ",
      "Tetap berada di tab Pengecekan setelah submit Pending/Selesai (satuan & massal)"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
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
  },
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
