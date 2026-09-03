import { UserPermissions, UserRole, UserSession, WmsUser } from '../types';

export type UserPermissionKey = keyof UserPermissions;

export interface PermissionItem {
  key: UserPermissionKey;
  label: string;
  description: string;
  isSuperadminOnly?: boolean;
}

export interface PermissionGroup {
  id: string;
  title: string;
  badge: string;
  description: string;
  permissions: PermissionItem[];
}

export const TOTAL_PERMISSIONS_COUNT = 13;

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'operasional',
    title: 'Operasional Gudang & Scanner',
    badge: '📦',
    description: 'Hak akses fitur operasional harian gudang',
    permissions: [
      {
        key: 'can_scan',
        label: 'Scanner Barcode (IN / OUT / SO)',
        description: 'Scan lokasi rak, SKU, multi-scan dan submit mutasi fisik barang',
      },
      {
        key: 'can_picking',
        label: 'Tugas Picking & Surat Jalan',
        description: 'Akses daftar task picking pesanan dan verifikasi barcode item',
      },
      {
        key: 'can_peminjaman',
        label: 'Peminjaman Barang (SPS)',
        description: 'Peminjaman sample baju live TikTok/Shopee & pengembalian',
      },
    ],
  },
  {
    id: 'monitoring',
    title: 'Data, Monitoring & Stok',
    badge: '📊',
    description: 'Hak akses melihat data mutasi, saldo lokasi dan integrasi',
    permissions: [
      {
        key: 'can_view_inventory',
        label: 'Inventory & Stok Realtime Drawer',
        description: 'Melihat sisa stok lokasi rak',
      },
      {
        key: 'can_view_mutasi',
        label: 'Riwayat Mutasi Barang',
        description: 'Melihat log keluar/masuk barang (Mutasi)',
      },
      {
        key: 'can_approve_so',
        label: 'Persetujuan Stock Opname',
        description: 'Melihat dan menyetujui hasil Stock Opname',
      },
    ],
  },
  {
    id: 'special',
    title: 'Peran Khusus & Aksi Data',
    badge: '⚡',
    description: 'Hak akses untuk modifikasi data tingkat lanjut',
    permissions: [
      {
        key: 'can_edit_data',
        label: 'Edit Data',
        description: 'Bisa mengubah data yang sudah tersimpan',
      },
      {
        key: 'can_delete_data',
        label: 'Hapus Data',
        description: 'Bisa menghapus data yang sudah tersimpan',
      },
      {
        key: 'can_import_export_data',
        label: 'Import / Ekspor Data',
        description: 'Upload CSV atau ekspor ke Excel',
      },
      {
        key: 'can_export_data',
        label: 'Ekspor Data Laporan (Legacy)',
        description: 'Ekspor riwayat data',
      },
      {
        key: 'can_sync_dealpos',
        label: 'Sinkronisasi Katalog DealPOS',
        description: 'Tarik pembaruan master produk & kuota stok DealPOS',
      },
    ],
  },
  {
    id: 'otorisasi',
    title: 'Otorisasi & Administrasi (Superadmin)',
    badge: '👑',
    description: 'Fitur krusial yang memerlukan persetujuan otorisasi tingkat tinggi',
    permissions: [
      {
        key: 'can_manage_users',
        label: 'Manajemen Pengguna & Pengaturan Role',
        description: 'Tambah, edit, hapus user dan kustomisasi izin akses per pengguna',
        isSuperadminOnly: true,
      },
      {
        key: 'can_manage_settings',
        label: 'Konfigurasi Sistem & Database',
        description: 'Mengatur URL/Anon Key Supabase & Endpoint Google Apps Script',
        isSuperadminOnly: true,
      },
    ],
  },
  {
    id: 'hr_employee',
    title: 'Karyawan & Absensi',
    badge: '👥',
    description: 'Hak akses presensi, jadwal roster, lembur dan cuti',
    permissions: [
      {
        key: 'can_approve_hr',
        label: 'Persetujuan Lembur & Cuti (Approval Admin)',
        description: 'Menyetujui atau menolak pengajuan lembur dan izin/cuti karyawan',
        isSuperadminOnly: false,
      },
    ],
  },
];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  Superadmin: {
    can_scan: true, can_picking: true, can_peminjaman: true,
    can_view_inventory: true, can_view_mutasi: true, can_approve_so: true,
    can_export_data: true, can_sync_dealpos: true, can_manage_users: true,
    can_manage_settings: true, can_edit_data: true, can_delete_data: true,
    can_import_export_data: true, can_approve_hr: true,
  },
  'All': {
    can_scan: true, can_picking: true, can_peminjaman: true,
    can_view_inventory: true, can_view_mutasi: true, can_approve_so: true,
    can_export_data: true, can_sync_dealpos: true, can_manage_users: true,
    can_manage_settings: true, can_edit_data: true, can_delete_data: true,
    can_import_export_data: true, can_approve_hr: true,
  },
  'Scanner Barcode': {
    can_scan: true, can_picking: false, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false, can_approve_hr: false,
  },
  'Inventory': {
    can_scan: false, can_picking: false, can_peminjaman: false,
    can_view_inventory: true, can_view_mutasi: false, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false, can_approve_hr: false,
  },
  'Stock Opname': {
    can_scan: false, can_picking: false, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: true,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false, can_approve_hr: false,
  },
  'Mutasi': {
    can_scan: false, can_picking: false, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: true, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false, can_approve_hr: false,
  },
  'Tugas Picking': {
    can_scan: false, can_picking: true, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false, can_approve_hr: false,
  },
  'Peminjaman': {
    can_scan: false, can_picking: false, can_peminjaman: true,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false, can_approve_hr: false,
  },
  'Operator': {
    can_scan: true, can_picking: true, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false, can_approve_hr: false,
  }
};

export const hasPermission = (session: UserSession | null, key: UserPermissionKey): boolean => {
  if (!session) return false;
  if (session.role === 'Superadmin' || session.role === 'All') return true;
  if (session.permissions && typeof session.permissions[key] === 'boolean') {
    return session.permissions[key] as boolean;
  }
  const defaultPerms = ROLE_DEFAULT_PERMISSIONS[session.role] || ROLE_DEFAULT_PERMISSIONS['Operator'];
  return defaultPerms[key];
};

export const countGrantedPermissions = (perms: Partial<UserPermissions>): number => {
  let count = 0;
  for (const val of Object.values(perms)) {
    if (val === true) count++;
  }
  return count;
};

export const togglePermission = (
  perms: Partial<UserPermissions>,
  key: UserPermissionKey,
  value: boolean
): Partial<UserPermissions> => {
  return { ...perms, [key]: value };
};

export const fillMissingPermissions = (
  perms: Partial<UserPermissions>,
  role: string
): Partial<UserPermissions> => {
  const defaults = ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS['Operator'];
  const newPerms = { ...defaults };
  for (const [k, v] of Object.entries(perms)) {
    if (typeof v === 'boolean') {
      (newPerms as any)[k] = v;
    }
  }
  return newPerms;
};

export const ROLE_DETAILS: Record<string, { desc: string, icon: string, badge: string }> = {
  Superadmin: { desc: 'Akses penuh ke semua fitur dan pengaturan', icon: '👑', badge: 'bg-rose-500' },
  'Scanner Barcode': { desc: 'Hanya bisa melakukan scan barcode mutasi (IN/OUT/SO)', icon: '📱', badge: 'bg-emerald-500' },
  Inventory: { desc: 'Melihat stok dan lokasi rak realtime', icon: '📦', badge: 'bg-blue-500' },
  'Stock Opname': { desc: 'Melihat dan menyetujui Stock Opname', icon: '📋', badge: 'bg-violet-500' },
  Mutasi: { desc: 'Melihat riwayat mutasi barang', icon: '🔄', badge: 'bg-amber-500' },
  'Tugas Picking': { desc: 'Akses fitur Tugas Picking pesanan', icon: '🛒', badge: 'bg-orange-500' },
  Peminjaman: { desc: 'Akses fitur Peminjaman / SPS', icon: '🤝', badge: 'bg-cyan-500' },
  Operator: { desc: 'Akses default operasional', icon: '⚙️', badge: 'bg-slate-500' },
  All: { desc: 'Akses penuh (Legacy)', icon: '⭐', badge: 'bg-indigo-500' },
  Custom: { desc: 'Role dengan permission custom', icon: '🔧', badge: 'bg-gray-500' },
};

export const isSuperadmin = (session: UserSession | null): boolean => {
  return session?.role === 'Superadmin' || session?.role === 'All';
};
