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

export const TOTAL_PERMISSIONS_COUNT = 9;

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'operasional',
    title: 'Operasional Gudang & Scanner',
    badge: '📦',
    description: 'Hak akses scan barcode fisik, tugas picking dan peminjaman',
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
        label: 'Audit & Stok Realtime Drawer',
        description: 'Melihat log mutasi, sisa stok lokasi rak & komparasi DealPOS',
      },
      {
        key: 'can_export_data',
        label: 'Ekspor Data CSV / Excel',
        description: 'Download riwayat log produk & laporan stok fisik ke Excel/CSV',
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
        key: 'can_approve_so',
        label: 'Approval & Reject Stock Opname (SO)',
        description: 'Otorisasi persetujuan / penolakan selisih fisik hasil audit SO',
        isSuperadminOnly: true,
      },
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
];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  Superadmin: {
    can_scan: true,
    can_picking: true,
    can_peminjaman: true,
    can_view_inventory: true,
    can_approve_so: true,
    can_export_data: true,
    can_sync_dealpos: true,
    can_manage_users: true,
    can_manage_settings: true,
  },
  All: {
    can_scan: true,
    can_picking: true,
    can_peminjaman: true,
    can_view_inventory: true,
    can_approve_so: true,
    can_export_data: true,
    can_sync_dealpos: true,
    can_manage_users: true,
    can_manage_settings: true,
  },
  Operator: {
    can_scan: true,
    can_picking: true,
    can_peminjaman: false,
    can_view_inventory: false,
    can_approve_so: false,
    can_export_data: false,
    can_sync_dealpos: false,
    can_manage_users: false,
    can_manage_settings: false,
  },
  Produk: {
    can_scan: true,
    can_picking: false,
    can_peminjaman: false,
    can_view_inventory: true,
    can_approve_so: false,
    can_export_data: true,
    can_sync_dealpos: true,
    can_manage_users: false,
    can_manage_settings: false,
  },
  Fulfillment: {
    can_scan: false,
    can_picking: true,
    can_peminjaman: false,
    can_view_inventory: true,
    can_approve_so: false,
    can_export_data: false,
    can_sync_dealpos: false,
    can_manage_users: false,
    can_manage_settings: false,
  },
  Peminjaman: {
    can_scan: false,
    can_picking: false,
    can_peminjaman: true,
    can_view_inventory: true,
    can_approve_so: false,
    can_export_data: false,
    can_sync_dealpos: false,
    can_manage_users: false,
    can_manage_settings: false,
  },
  Custom: {
    can_scan: true,
    can_picking: false,
    can_peminjaman: false,
    can_view_inventory: false,
    can_approve_so: false,
    can_export_data: false,
    can_sync_dealpos: false,
    can_manage_users: false,
    can_manage_settings: false,
  },
};

export const ROLE_DETAILS: Record<
  string,
  {
    title: string;
    label: string;
    description: string;
    badge: string;
    badgeColor: string;
    isSuperadmin?: boolean;
  }
> = {
  Superadmin: {
    title: 'Superadmin',
    label: 'Super Admin',
    description: 'Akses penuh ke semua modul, approval SO, manajemen pengguna & database',
    badge: '👑',
    badgeColor:
      'bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    isSuperadmin: true,
  },
  All: {
    title: 'Superadmin (All)',
    label: 'Super Admin (All)',
    description: 'Akses penuh ke semua modul, approval SO, manajemen pengguna & database',
    badge: '👑',
    badgeColor:
      'bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    isSuperadmin: true,
  },
  Operator: {
    title: 'Operator Gudang',
    label: 'Operator Gudang',
    description: 'Fokus scanner barcode fisik (IN/OUT/SO) dan eksekusi picking order',
    badge: '📦',
    badgeColor:
      'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  },
  Produk: {
    title: 'Tim Produk',
    label: 'Tim Produk & Inventory',
    description: 'Audit stok, komparasi DealPOS, riwayat mutasi dan sinkronisasi katalog',
    badge: '🏷️',
    badgeColor:
      'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-300 dark:border-blue-800',
  },
  Fulfillment: {
    title: 'Tim Fulfillment',
    label: 'Tim Fulfillment & Picking',
    description: 'Pemrosesan surat jalan picking dan monitoring lokasi stok',
    badge: '🚚',
    badgeColor:
      'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
  },
  Peminjaman: {
    title: 'Tim Peminjaman',
    label: 'Tim Peminjaman (SPS)',
    description: 'Peminjaman barang sample live TikTok/Shopee & pengembalian',
    badge: '📋',
    badgeColor:
      'bg-pink-100 text-pink-700 dark:bg-pink-950/70 dark:text-pink-300 border-pink-300 dark:border-pink-800',
  },
  Custom: {
    title: 'Custom',
    label: 'Custom Role',
    description: 'Hak akses disesuaikan secara khusus per pengguna oleh Superadmin',
    badge: '⚙️',
    badgeColor:
      'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800',
  },
};

/**
 * Count active permissions in an object
 */
export function countGrantedPermissions(
  permissions?: Partial<UserPermissions> | null
): number {
  if (!permissions) return 0;
  return Object.values(permissions).filter(Boolean).length;
}

/**
 * Get effective permissions for a user or session
 */
export function getUserPermissions(
  userOrSession?: { role?: string; permissions?: Partial<UserPermissions> } | null
): UserPermissions {
  if (!userOrSession) {
    return {
      can_scan: false,
      can_picking: false,
      can_peminjaman: false,
      can_view_inventory: false,
      can_approve_so: false,
      can_export_data: false,
      can_sync_dealpos: false,
      can_manage_users: false,
      can_manage_settings: false,
    };
  }

  const role = userOrSession.role || 'Operator';
  const isSuper =
    role.toLowerCase() === 'all' ||
    role.toLowerCase() === 'superadmin' ||
    role.toLowerCase() === 'admin';

  if (isSuper) {
    return {
      can_scan: true,
      can_picking: true,
      can_peminjaman: true,
      can_view_inventory: true,
      can_approve_so: true,
      can_export_data: true,
      can_sync_dealpos: true,
      can_manage_users: true,
      can_manage_settings: true,
    };
  }

  const basePermissions =
    ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS['Operator'];

  if (userOrSession.permissions && typeof userOrSession.permissions === 'object') {
    return {
      ...basePermissions,
      ...userOrSession.permissions,
    };
  }

  return { ...basePermissions };
}

/**
 * Check if user has specific permission
 */
export function hasPermission(
  userOrSession:
    | { role?: string; permissions?: Partial<UserPermissions> }
    | null
    | undefined,
  permission: keyof UserPermissions
): boolean {
  const perms = getUserPermissions(userOrSession);
  return !!perms[permission];
}

/**
 * Check if user is Superadmin
 */
export function isSuperadmin(
  userOrSession: { role?: string } | null | undefined
): boolean {
  if (!userOrSession || !userOrSession.role) return false;
  const r = userOrSession.role.toLowerCase();
  return r === 'all' || r === 'superadmin' || r === 'admin';
}
