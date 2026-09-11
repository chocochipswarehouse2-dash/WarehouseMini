export type ScanMode = 'fisik' | 'manual' | 'kamera';

export type CategoryType = 'IN' | 'OUT' | 'SO';

export type ActivePage =
  | 'scanner'
  | 'penerimaan'
  | 'picking_tasks'
  | 'peminjaman'
  | 'stock_opname'
  | 'mutasi_log'
  | 'inventory'
  | 'perbaikan'
  | 'karyawan'
  | 'presensi'
  | 'roster_shift'
  | 'lembur_cuti'
  | 'hr_approval'
  | 'hr_rekap'
  | 'cetak_label'
  | 'manual_shipment'
  | 'tarikan_md';

export type UserRole =
  | 'Superadmin'
  | 'Scanner Barcode'
  | 'Inventory'
  | 'Stock Opname'
  | 'Mutasi'
  | 'Tugas Picking'
  | 'Peminjaman'
  | 'Perbaikan'
  | 'HR & Admin'
  | 'Operator'
  | 'Custom'
  | string;

export type UserPermissionKey =
  | 'can_scan'
  | 'can_penerimaan'
  | 'can_picking'
  | 'can_peminjaman'
  | 'can_view_inventory'
  | 'can_approve_so'
  | 'can_export_data'
  | 'can_sync_dealpos'
  | 'can_manage_users'
  | 'can_manage_settings'
  | 'can_edit_data'
  | 'can_delete_data'
  | 'can_view_mutasi'
  | 'can_import_export_data'
  | 'can_view_karyawan'
  | 'can_view_presensi'
  | 'can_view_roster'
  | 'can_view_lembur_cuti'
  | 'can_approve_hr'
  | 'can_perbaikan'
  | 'can_manual_shipment_view'
  | 'can_manual_shipment_action'
  | 'can_tarikan_md';

export interface UserPermissions {
  can_scan: boolean;
  can_penerimaan?: boolean;
  can_picking: boolean;
  can_peminjaman: boolean;
  can_view_inventory: boolean;
  can_approve_so: boolean;
  can_export_data: boolean;
  can_sync_dealpos: boolean;
  can_manage_users: boolean;
  can_manage_settings: boolean;
  can_edit_data: boolean;
  can_delete_data: boolean;
  can_view_mutasi: boolean;
  can_import_export_data: boolean;
  can_view_karyawan?: boolean;
  can_view_presensi?: boolean;
  can_view_roster?: boolean;
  can_view_lembur_cuti?: boolean;
  can_approve_hr?: boolean;
  can_perbaikan?: boolean;
  can_manual_shipment_view?: boolean;
  can_manual_shipment_action?: boolean;
  can_tarikan_md?: boolean;
}

export interface WmsUser {
  id?: string;
  username: string;
  name?: string;
  role: UserRole;
  password?: string;
  permissions?: Partial<UserPermissions>;
  created_at?: string;
  nik?: string;
  no_hp?: string;
  email?: string;
}

export interface UserSession {
  token: string;
  username: string;
  name?: string;
  role: UserRole;
  permissions?: Partial<UserPermissions>;
  endpointUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  nik?: string;
  divisi?: string;
  no_hp?: string;
  email?: string;
}

export interface KaryawanRecord {
  nik: string;
  nama: string;
  divisi: string;
  username: string;
  password?: string;
  role: string;
  gaji_pokok?: number;
  tunjangan?: number;
  rate_lembur?: number;
  saldo_kasbon?: number;
  email?: string;
  no_hp?: string;
  tgl_lahir?: string;
  tgl_bergabung?: string;
  alamat?: string;
  hobi?: string;
  kontak_darurat?: string;
  foto?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MasterShiftRecord {
  id?: number;
  nama_shift: string;
  jam_masuk: string;
  jam_pulang: string;
  toleransi: number;
  status: string;
  created_at?: string;
}

export interface RosterShiftRecord {
  id?: number;
  nik: string;
  tanggal: string;
  shift: string;
  jam_masuk?: string;
  jam_pulang?: string;
  keterangan?: string;
  created_at?: string;
  nama?: string;
}

export interface PresensiRecord {
  id?: number;
  nik: string;
  tanggal: string;
  shift: string;
  status: string;
  jam_masuk?: string | null;
  jam_pulang?: string | null;
  catatan?: string | null;
  created_at?: string;
  nama?: string;
}

export interface LemburRecord {
  id: string;
  nik: string;
  nama: string;
  divisi?: string;
  tanggal: string;
  deskripsi: string;
  jam_mulai: string;
  jam_selesai: string;
  durasi_jam: number;
  rate_lembur: number;
  total_lembur: number;
  status: 'Diajukan' | 'Disetujui' | 'Ditolak';
  approved_by?: string | null;
  approved_at?: string | null;
  catatan?: string | null;
  created_at?: string;
}

export interface PerijinanCutiRecord {
  id: string;
  nik: string;
  nama: string;
  divisi?: string;
  jenis: string;
  tgl_mulai: string;
  tgl_selesai: string;
  jumlah_hari: number;
  alasan: string;
  status: 'Diajukan' | 'Disetujui' | 'Ditolak';
  approved_by?: string | null;
  approved_at?: string | null;
  catatan?: string | null;
  created_at?: string;
}

export interface LocalUserRecord {
  id?: string;
  username: string;
  name?: string;
  password?: string;
  role: UserRole;
  permissions?: Partial<UserPermissions>;
  created_at?: string;
  nik?: string;
  phone?: string;
  email?: string;
}

export interface ProductItem {
  k: string; // SKU
  n?: string; // Nama
  p?: string; // Product name alias
  s?: string; // Size
  q?: number; // Quota / Stok DealPOS
  c?: string; // Category / Channel
  category?: string;
  lokasi?: string;
  price?: number;
  stokMap?: number;
  stokStudio?: number;
  stokShp?: number;
  stokTtk?: number;
  komparasi?: unknown;
  locList?: (string | { lokasi: string; qty?: number })[];
  [key: string]: unknown;
}

export interface ScannedItem {
  id: string;
  sku?: string;
  nama?: string;
  text?: string;
  time?: string;
  timestamp?: string;
  isCategory?: boolean;
  isLocation?: boolean;
  isInvalidSku?: boolean;
  productName?: string;
  size?: string;
  category?: CategoryType;
  kategori?: CategoryType;
  location?: string;
  lokasi?: string;
  area?: string;
  qty?: number;
  isCustomLocation?: boolean;
  [key: string]: unknown;
}

export interface ProductLocationInfo {
  lokasi: string;
  area?: string;
  stok?: number;
  qty?: number;
  isPrimary?: boolean;
  source?: 'SJ' | 'CATALOG' | 'REALTIME_STOCK' | string;
}

export interface PeminjamanItemForm {
  id?: string;
  sku: string;
  nama_produk?: string;
  produk?: string;
  nama?: string;
  size?: string;
  lokasi: string;
  qty: number;
  qtyKembali?: number;
  stokMap?: number;
  stokStudio?: number;
  stokShp?: number;
  stokTtk?: number;
  stokBlokF?: number;
  stokWh?: number;
  [key: string]: unknown;
}

export interface PeminjamanRecord {
  id?: string;
  no_sps?: string;
  noPeminjaman?: string;
  tanggal_pinjam?: string;
  tanggal_kembali?: string;
  tglPinjam?: string;
  timestamp?: string;
  channel?: string;
  nama_peminjam?: string;
  namaPeminjam?: string;
  no_wa_peminjam?: string;
  noWaPeminjam?: string;
  keperluan?: string;
  sku?: string;
  nama_produk?: string;
  size?: string;
  lokasi?: string;
  qty_pinjam?: number;
  qty_kembali?: number;
  status?: 'Dipinjam' | 'Dikembalikan' | 'DIPINJAM' | 'KEMBALI_SEBAGIAN' | 'KEMBALI_LENGKAP' | string;
  items?: PeminjamanItemForm[];
  keterangan?: string;
  operator?: string;
  username?: string;
  created_at?: string;
}

export interface ChannelStockItem {
  sku: string;
  nama_produk?: string;
  produk?: string;
  size?: string;
  channel?: string;
  total_dipinjam?: number;
  totalQty?: number;
  lokasi?: string;
  studioQty?: number;
  shpQty?: number;
  ttkQty?: number;
  blokFQty?: number;
  whQty?: number;
  locStr?: string;
  whLocStr?: string;
  [key: string]: unknown;
}

export interface StockRealtimeItem {
  id?: string;
  sku: string;
  kode?: string;
  nama_produk?: string;
  nama?: string;
  size?: string;
  ukuran?: string;
  lokasi: string;
  area: string;
  sisa_stok: number;
  qty?: number;
  updated_at?: string;
}

export interface LogProdukItem {
  id?: string;
  type: 'IN' | 'OUT' | 'ADJ_IN' | 'ADJ_OUT' | 'SO';
  invoice: string;
  sku: string;
  nama_produk: string;
  size?: string;
  area: string;
  lokasi: string;
  qty: number;
  operator: string;
  keterangan?: string;
  created_at: string;
}

export interface StockOpnameQueueItem {
  id?: string;
  sesi_id: string;
  tanggal: string;
  sku: string;
  nama_produk: string;
  size?: string;
  lokasi: string;
  alasan?: string;
  keterangan?: string;
  area: string;
  qty_sistem: number;
  qty_fisik: number;
  selisih: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  jenis: 'Opname' | 'Manual' | string;
  operator: string;
  invoice: string;
  approved_by?: string;
  tanggal_approve?: string;
  created_at?: string;
}

export interface PenerimaanVariantItem {
  warna: string;
  size: string;
  qty: number;
  timestamp?: number;
}

export interface ManualShipmentItem {
  id: string;
  nama_produk: string;
  sku: string;
  qty: number;
  fulfillment: string;
  size?: string;
}

export interface ManualShipmentOrder {
  id?: string;
  no_pesanan?: string;
  // Data Pengirim
  nama_pengirim: string;
  no_telp_store: string;
  no_transaksi_pengirim: string[];
  // Data Customer
  nama_tujuan: string;
  no_telp_tujuan: string;
  alamat_tujuan: string;
  notes_paket: string;
  no_transaksi_customer: string;
  jasa_kirim?: string;
  // Pesanan
  items: ManualShipmentItem[];
  // Status & Meta
  status: 'diterima' | 'diproses' | 'dikirim' | 'batal';
  no_resi?: string;
  created_at?: string;
  submitted_by?: string;
}

export interface PenerimaanProdukBlock {
  id: string | number;
  kode_produksi: string;
  catatan?: string;
  foto_url?: string;
  variants: PenerimaanVariantItem[];
}

export interface PenerimaanProduksiItem {
  id?: string | number;
  sheet_row?: number;
  tanggal_penerimaan: string;
  kategori: string; // 'Lokal CMT' | 'Kargo'
  no_surat_jalan: string;
  kode_produksi: string;
  warna: string;
  size: string;
  qty: number;
  foto_url?: string;
  keterangan?: string;
  operator: string;
  created_at?: string;
}

export interface SimpanPenerimaanPayload {
  tanggal: string;
  kategori: 'Lokal CMT' | 'Kargo' | string;
  no_surat_jalan: string;
  keterangan?: string;
  foto_url?: string;
  produk_list?: PenerimaanProdukBlock[];
  items?: Partial<PenerimaanProduksiItem>[];
}

export type PickingStatus = 'PENDING' | 'SEDANG PICKING' | 'TERCETAK' | 'SELESAI';

export interface PickingListItem {
  id?: string;
  no_sj: string;
  tanggal: string;
  tujuan: string;
  sku: string;
  nama_produk: string;
  size?: string;
  qty_req: number;
  qty_picked: number;
  lokasi: string;
  lokasi_picked?: string;
  status: PickingStatus;
  picker_name?: string;
  catatan?: string;
  created_at?: string;
  is_unexpected?: boolean;
}

export type RekapStatusType = 'SEMUA_PAS' | 'ADA_KURANG' | 'ADA_LEBIH' | 'SALAH_AMBIL' | 'CAMPURAN';

export interface PickingSuratJalanGroup {
  no_sj: string;
  tanggal: string;
  tujuan: string;
  status: PickingStatus;
  picker_name?: string;
  catatan?: string;
  total_items: number;
  total_qty_req: number;
  total_qty_picked: number;
  items: PickingListItem[];
  unexpected_items: PickingListItem[];
  rekap_status?: RekapStatusType;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export interface CameraDevice {
  id: string;
  label: string;
}

// ------------------------------------------------------------
// MODUL PERBAIKAN: REJECT, CUCI, PERMAK, DEFECT
// ------------------------------------------------------------
export type PerbaikanTahap =
  | 'REJECT'            // Baru masuk, menunggu sortir Kepala QC
  | 'CUCI'              // Sedang proses pencucian noda
  | 'PERMAK'            // Sedang proses jahit/permak
  | 'DEFECT'            // Vonis cacat permanen / gagal perbaikan
  | 'SELESAI_GRADE_A'   // Sembuh/bersih, kembali ke stok reguler
  | 'SELESAI_DEFECT_SALE' // Selesai di-ACC harga obral defect
  | 'SELESAI_SCRAP';    // Dimusnahkan / write-off limbah

export type PerbaikanStatusPengerjaan =
  | 'PENDING'
  | 'SEDANG_PROSES'
  | 'SELESAI_CUCI'
  | 'SELESAI_PERMAK'
  | 'GAGAL';

export interface PerbaikanTicket {
  id?: number | string;
  ticket_no: string;            // e.g. RJC-20260904-001
  tanggal: string;
  sku: string;
  nama_produk: string;
  size?: string;
  qty: number;
  lokasi_asal: string;          // e.g. A-01 / RETUR / PERBAIKAN-01
  lokasi_sekarang: string;      // e.g. PERBAIKAN-01, CC-01, PMK-01, DF-01
  is_already_in_repair?: boolean;
  sumber_barang: 'Gudang Fisik' | 'Retur Marketplace' | 'Penerimaan CMT' | 'Live/Studio' | 'Toko';
  kategori_rusak: 'Noda / Kotor' | 'Jahitan Rusak' | 'Kain Sobek / Bolong' | 'Kancing / Resleting' | 'Cacat Kain / Warna' | 'Aksesoris Kurang' | 'Lainnya';
  detail_kerusakan: string;
  foto_urls: string[];          // WebP base64 / URL terkompresi
  foto_sesudah?: string[];
  tahap: PerbaikanTahap;
  status_pengerjaan: PerbaikanStatusPengerjaan;
  qc_pic?: string;
  qc_tanggal?: string;
  qc_catatan?: string;
  petugas_reparasi?: string;
  reparasi_mulai?: string;
  reparasi_selesai?: string;
  reparasi_catatan?: string;
  biaya_reparasi?: number;
  acc_harga_defect?: number;
  acc_harga_by?: string;
  acc_harga_tanggal?: string;
  acc_harga_catatan?: string;
  operator_input: string;
  qc_report_no?: string;        // Referensi laporan QC jika berasal dari modul QC
  created_at?: string;
  updated_at?: string;
}

// ------------------------------------------------------------
// MODUL QUALITY CONTROL (QC) - LAPORAN INSPEKSI MUTU
// ------------------------------------------------------------
export type QcStatus = 'OKE' | 'REJECT';
export type ProductIdentifierType = 'sku' | 'kode_produksi';

export interface QcReport {
  id?: number | string;
  report_no: string;            // e.g. QC-20260907-001
  tanggal: string;              // YYYY-MM-DD atau ISO
  tipe_identifikasi?: ProductIdentifierType; // 'sku' | 'kode_produksi'
  sku: string;                  // SKU atau Kode Produksi
  nama_produk: string;          // Nama Produk (atau gabungan Kode Produksi + Warna jika tipe kode produksi)
  kode_produksi?: string;       // Kode Produksi jika tipe kode_produksi
  warna?: string;               // Warna produk jika tipe kode_produksi
  size?: string;
  sumber_batch: string;         // 'Penerimaan CMT' | 'Produksi Baru' | 'Gudang Fisik' | 'Retur Marketplace' | 'Live/Studio' | 'Toko' | dll
  status: QcStatus;             // 'OKE' | 'REJECT'
  qty_diperiksa: number;
  qty_oke: number;
  qty_reject: number;
  kategori_rusak?: string;      // 'Noda / Kotor' | 'Jahitan Rusak' | 'Kain Sobek / Bolong' | dll
  detail_kerusakan?: string;
  lokasi_barang?: string;       // Area inspeksi atau rak (opsional)
  target_penanganan?: 'REJECT' | 'CUCI' | 'PERMAK' | 'DEFECT'; // Target antrean perbaikan
  foto_urls: string[];          // WebP compressed data / URLs
  gdrive_link?: string;         // Opsional link Google Drive (folder/file arsip)
  catatan?: string;
  pic_qc: string;               // Nama PIC pemeriksa QC (otomatis dari user login)
  perbaikan_ticket_no?: string; // No tiket perbaikan jika reject
  created_at?: string;
  updated_at?: string;
}


export interface WmsSettings {
  id?: number;
  gas_endpoint?: string;
  manual_shipment_gas_url?: string;
  gdrive_gas_url?: string;
  gdrive_folder_url?: string;
  fonnte_token?: string;
  fonnte_group_target?: string;
  fonnte_auto_send?: boolean;
  config_json?: string;
  updated_at?: string;
}

// ------------------------------------------------------------
// MODUL PENGECEKAN SURAT JALAN (TARIKAN MD)
// ------------------------------------------------------------

/** Satu baris SKU dari file CSV Surat Jalan */
export interface TarikanMDItem {
  sku: string;
  nama_produk: string;
  category?: string;
  qty_sj: number;
}

/** Hasil komparasi SJ vs aktual scan/input */
export interface TarikanMDScanResult extends TarikanMDItem {
  qty_scan: number;
  selisih: number;          // qty_scan - qty_sj
  status: 'COCOK' | 'KURANG' | 'LEBIH';
  is_unexpected?: boolean;
}

/** Detail baris komparasi item untuk database/sheet (setara baris manual shipment) */
export interface PengecekanSJItem {
  id?: string;
  no_sj: string;
  source: string;
  destination: string;
  tanggal_sj: string;
  sku: string;
  nama_produk: string;
  category?: string;
  qty_sj: number;
  qty_scan: number;
  selisih: number;
  status_item: 'COCOK' | 'KURANG' | 'LEBIH';
  status_sj?: 'pending' | 'selesai' | 'cocok' | 'selisih';
  is_unexpected?: boolean;
  submitted_by?: string;
  created_at?: string;
  catatan?: string;
}

/** Draft antrean pengecekan surat jalan (stay di tab pengecekan) */
export interface PengecekanSJDraft {
  id: string; // key = no_sj + source + destination
  no_sj: string;
  source: string;
  destination: string;
  tanggal_sj: string;
  file_name?: string;
  items: TarikanMDItem[];
  scanQty: Record<string, number>;
  unexpected: Record<string, { nama?: string; qty: number; category?: string }>;
  catatan?: string;
  status: 'draft' | 'pending' | 'selesai';
  created_at: string;
  updated_at: string;
}

/** Record riwayat pengecekan yang disimpan ke sheet & database */
export interface PengecekanSJRecord {
  id: string;
  no_sj: string;
  source: string;
  destination: string;
  tanggal_sj: string;
  status: 'pending' | 'selesai' | 'cocok' | 'selisih';
  status_komparasi: 'COCOK' | 'SELISIH';
  total_qty_sj: number;
  total_qty_terima: number;
  total_sku: number;
  submitted_by: string;
  created_at: string;
  updated_at?: string;
  catatan?: string;
  sync_status?: 'synced' | 'pending_sync';
  items: PengecekanSJItem[];
  items_json?: string;
}

export type TarikanMDRecord = PengecekanSJRecord;
