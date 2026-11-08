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
};

export const VERSION_HISTORY: VersionInfo[] = [
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
  },
  {
    "version": "v2.6.77",
    "versionCode": 337,
    "buildDate": "7 November 2026",
    "buildHash": "wms-261107-v337-1407",
    "releaseTitle": "WMS v2.6.77 — Standarisasi Order ID Tunggal di Seluruh Modul Pesanan & Input Resi",
    "releaseNotes": [
      "Penyatuan generator Order ID Manual Shipment (MS[STORE]-YYMMDD-XXXX) sehingga no_pesanan dan no_transaksi_customer menggunakan 1 kode unik yang 100% identik",
      "Perbaikan modal Update No. Resi Massal, Batalkan Pesanan, Notifikasi WA, dan Email agar selalu menampilkan Order ID utama (#no_pesanan) yang sama persis dengan Rekap Pesanan",
      "Penghapusan tampilan ID Ref ganda hasil auto-generate lama pada kartu/tabel Rekap Pesanan"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.76",
    "versionCode": 336,
    "buildDate": "7 November 2026",
    "buildHash": "wms-261107-v336-0942",
    "releaseTitle": "WMS v2.6.76 — Perlebar & Perluas Form Input Modal Catatan",
    "releaseNotes": [
      "Perlebar ukuran modal Edit/Buat Catatan dari max-w-lg ke max-w-2xl / lg:max-w-3xl agar lebih lega",
      "Perbesar textarea Isi Catatan (minimal 6 baris / 180px, otomatis bertambah mengikuti jumlah baris teks, dan mendukung resize-y manual)",
      "Hapus batasan scroll sempit (max-h-48) pada daftar Checklist sehingga seluruh item checkbox tampil penuh dan leluasa"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.75",
    "versionCode": 335,
    "buildDate": "7 November 2026",
    "buildHash": "wms-261107-v335-1143",
    "releaseTitle": "WMS v2.6.75 — Auto-Migrasi Taylor Pants & Sanitasi Ukuran Pengecekan Surat Jalan",
    "releaseNotes": [
      "Auto-migrasi data draft antrean dan riwayat Pengecekan Surat Jalan agar SKU DF26KBF03 otomatis menjadi Taylor Pants Dark Denim",
      "Perbaikan data lampau di Supabase pengecekan_sj dan pencegahan tampilan nama produk pada kolom ukuran",
      "Sanitasi ukuran otomatis ke All Size/Default jika tidak memiliki varian S-XL"
    ],
    "minSupportedVersion": "v2.0.0"
  },
  {
    "version": "v2.6.74",
    "versionCode": 334,
    "buildDate": "7 November 2026",
    "buildHash": "wms-261107-v334-1053",
    "releaseTitle": "WMS v2.6.74 — Koreksi Master Data Taylor Pants & Sanitasi Size Produk",
    "releaseNotes": [
      "Koreksi master produk SKU DF26KBF03DD (S-XL) dari Femima Pants menjadi Taylor Pants Dark Denim",
      "Perbaikan sanitasi parsing size produk agar nama varian DealPOS/Katalog (seperti Wintour Skirt Blue) tidak bocor ke badge size",
      "Dukungan ekstraksi size huruf standar DF26 (A=Default, C=S, D=M, E=L, F=XL, G=XXL) di sortUtils"
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
