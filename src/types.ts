export type ScanMode = 'fisik' | 'manual' | 'kamera';

export type CategoryType = 'IN' | 'OUT' | 'SO';

export type ActivePage =
  | 'dashboard'
  | 'penerimaan_barang'
  | 'packing'
  | 'pengiriman'
  | 'agenda'
  | 'scanner'
  | 'penerimaan'
  | 'loading_dock'
  | 'picking_tasks'
  | 'peminjaman'
  | 'stock_opname'
  | 'mutasi_log'
  | 'operasi_stok'
  | 'inventory'
  | 'perbaikan'
  | 'karyawan'
  | 'presensi'
  | 'roster_shift'
  | 'lembur_cuti'
  | 'hr_approval'
  | 'hr_rekap'
  | 'cetak_label'
  | 'cetak_barcode'
  | 'pesanan_saya'
  | 'manual_shipment'
  | 'roadmap'
  | 'katalog_produk'
  | 'pusat_resolusi'
  | 'supabase_migration';

export interface KatalogVariant {
  warna: string;
  size: string;
  sku: string;
  qty: number;
}

export interface KatalogItem {
  id: string;
  nomor: string;
  deskripsi: string;
  price: string | number;
  variants: KatalogVariant[];
  image_url: string;
  catalog_id?: string;
  catalog_name?: string;
  is_hidden?: boolean;
}

export interface KatalogBatch {
  id: string;
  name: string;
  created_at: string;
  updated_at?: string;
  items: KatalogItem[];
  is_hidden?: boolean;
}

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
  // OPERASIONAL WAREHOUSE
  | 'menu_ops_dashboard'
  | 'menu_ops_agenda'
  | 'tab_ops_agenda_kalendar'
  | 'tab_ops_agenda_project'
  | 'menu_ops_pesanan_saya'
  | 'tab_ops_pesanan_dashboard'
  | 'tab_ops_pesanan_manual_shipment'
  | 'tab_ops_pesanan_transfer_order'
  | 'tab_ops_pesanan_shopee'
  | 'tab_ops_pesanan_tiktok'
  | 'tab_ops_pesanan_website'
  | 'tab_ops_pesanan_woocommerce'
  | 'tab_ops_pesanan_lazada'
  | 'menu_ops_resolusi'
  | 'tab_ops_resolusi_retur'
  | 'tab_ops_resolusi_refund'
  | 'tab_ops_resolusi_gagal'
  | 'tab_ops_resolusi_komplain'
  | 'tab_ops_resolusi_rating'
  | 'menu_ops_loading_dock'
  | 'tab_ops_loading_produksi'
  | 'tab_ops_loading_penerimaan'
  | 'tab_ops_loading_pengiriman'
  | 'menu_ops_mutasi'
  | 'tab_ops_mutasi_scanner'
  | 'tab_ops_mutasi_log'
  | 'tab_ops_mutasi_so'
  | 'menu_ops_qc'
  | 'tab_ops_qc_reject'
  | 'tab_ops_qc_cuci'
  | 'tab_ops_qc_permak'
  | 'tab_ops_qc_defect'
  | 'menu_ops_inventory'
  | 'menu_ops_katalog_produk'
  | 'menu_ops_picking'
  | 'menu_ops_peminjaman'
  | 'menu_ops_roadmap'
  | 'menu_ops_cetak_barcode'
  // KARYAWAN & PRESENSI
  | 'menu_hr_karyawan'
  | 'menu_hr_presensi'
  | 'menu_hr_roster'
  | 'menu_hr_lembur_cuti'
  | 'menu_hr_approval'
  // ACTION / EXTRA
  | 'action_cetak_label'
  | 'action_cetak_barcode'
  | 'action_export_data'
  | 'action_import_data'
  | 'action_upload_katalog'
  | 'action_sync_dealpos'
  | 'action_edit_master'
  | 'action_delete_master';

export type UserPermissions = {
  [K in UserPermissionKey]?: boolean;
};

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
  qty: number | string;
  qtyKembali?: number;
  stokMap?: number;
  stokStudio?: number;
  stokShp?: number;
  stokTtk?: number;
  stokBlokF?: number;
  stokWh?: number;
  selected?: boolean;
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
  qty: number | string;
  timestamp?: number;
}

export interface ManualShipmentItem {
  id: string;
  nama_produk: string;
  sku: string;
  qty: number | string;
  fulfillment: string;
  size?: string;
}

export interface ManualShipmentOrder {
  id?: string;
  no_pesanan?: string;
  // Data Pengirim
  nama_pengirim: string;
  pic_store?: string;
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
  id?: string | number;
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
  wa_webhook_gas_url?: string;
  config_json?: string;
  roles?: Record<string, any>;
  agenda_categories?: Record<string, any>;
  katalog_manual_data?: string;
  updated_at?: string;
}

// ------------------------------------------------------------
// MODUL PENGECEKAN SURAT JALAN (TARIKAN MD)
// ------------------------------------------------------------

/** Satu baris SKU dari file CSV Surat Jalan */
export interface TarikanMDItem {
  sku: string;
  nama_produk: string;
  size?: string;
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
  size?: string;
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
  tipe_import?: 'Penerimaan' | 'Pengiriman';
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
  tipe_import?: 'Penerimaan' | 'Pengiriman';
  status: 'pending' | 'selesai';
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

// ------------------------------------------------------------
// MODUL ROADMAP & FEATURE REQUEST (AI & TEAM COLLABORATION)
// ------------------------------------------------------------
export type RoadmapStatus = 'ideation' | 'planned' | 'in_progress' | 'completed' | 'rejected';
export type RoadmapPriority = 'low' | 'medium' | 'high' | 'urgent';
export type RoadmapType = 'feature' | 'bug' | 'enhancement' | 'maintenance';

export interface RoadmapItem {
  id?: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  priority: RoadmapPriority;
  type: RoadmapType;
  created_by?: string;
  target_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SystemDoc {
  section_id: string;
  content: string;
  updated_by?: string;
  updated_at?: string;
}

// ------------------------------------------------------------
// MODUL AGENDA & KALENDER KERJA
// ------------------------------------------------------------
export type AgendaCategory = string;

export interface AgendaAttachment {
  id: string;
  name: string;
  size: number;
  type: 'image' | 'document';
  url?: string;
}

export interface AgendaEvent {
  id: string;
  title: string;
  description?: string;
  start_date: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  is_all_day: boolean;
  start_time?: string; // HH:mm
  end_time?: string; // HH:mm
  category: AgendaCategory;
  location?: string;
  pic?: string;
  project_id?: string;
  attachments?: AgendaAttachment[];
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

// ------------------------------------------------------------
// MODUL PROYEK WMS
// ------------------------------------------------------------
export type ProjectStatus = 'planned' | 'in_progress' | 'review' | 'completed' | 'on_hold';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProjectTask {
  id: string;
  title: string;
  is_completed: boolean;
  assigned_to?: string;
  due_date?: string;
}

export type NoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange';

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  color: NoteColor;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  category: string;
  pic?: string;
  start_date?: string;
  deadline?: string;
  progress: number; // 0 - 100
  tasks: ProjectTask[];
  attachments?: AgendaAttachment[];
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

