export type ScanMode = 'fisik' | 'manual' | 'kamera';

export type CategoryType = 'IN' | 'OUT' | 'SO';

export type ActivePage =
  | 'scanner'
  | 'picking_tasks'
  | 'peminjaman'
  | 'stock_opname'
  | 'mutasi_log'
  | 'inventory';

export type UserRole =
  | 'Superadmin'
  | 'Scanner Barcode'
  | 'Inventory'
  | 'Stock Opname'
  | 'Mutasi'
  | 'Tugas Picking'
  | 'Peminjaman'
  | 'Custom'
  | string;

export type UserPermissionKey =
  | 'can_scan'
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
  | 'can_import_export_data';

export interface UserPermissions {
  can_scan: boolean;
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
}

export interface WmsUser {
  id?: string;
  username: string;
  name?: string;
  role: UserRole;
  password?: string;
  permissions?: Partial<UserPermissions>;
  created_at?: string;
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
}

export interface LocalUserRecord {
  id?: string;
  username: string;
  name?: string;
  password?: string;
  role: UserRole;
  permissions?: Partial<UserPermissions>;
  created_at?: string;
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
  nama_produk?: string;
  size?: string;
  lokasi: string;
  area: string;
  sisa_stok: number;
  updated_at?: string;
}

export interface LogProdukItem {
  id?: string;
  type: 'IN' | 'OUT' | 'ADJ_IN' | 'ADJ_OUT';
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

export interface PenerimaanProduksiItem {
  id?: string;
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
