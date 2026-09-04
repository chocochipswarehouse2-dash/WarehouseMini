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

export const TOTAL_PERMISSIONS_COUNT = 18;

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
    description: 'Hak akses data karyawan, presensi, jadwal roster tim, lembur dan cuti',
    permissions: [
      {
        key: 'can_view_karyawan',
        label: 'Data & Direktori Karyawan',
        description: 'Akses membuka modul data & direktori profil staf/karyawan',
      },
      {
        key: 'can_view_presensi',
        label: 'Presensi & Shift Saya',
        description: 'Akses menu absen masuk/pulang dan monitoring shift pribadi',
      },
      {
        key: 'can_view_roster',
        label: 'Jadwal Roster Tim',
        description: 'Akses melihat jadwal shift mingguan/bulanan seluruh tim',
      },
      {
        key: 'can_view_lembur_cuti',
        label: 'Pengajuan Lembur & Cuti',
        description: 'Akses mengisi form lembur, permohonan izin dan cuti kerja',
      },
      {
        key: 'can_approve_hr',
        label: 'Persetujuan & Rekap HR (Approval Admin)',
        description: 'Menyetujui atau menolak pengajuan lembur/cuti dan melihat rekapitulasi HR',
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
    can_import_export_data: true,
    can_view_karyawan: true, can_view_presensi: true, can_view_roster: true, can_view_lembur_cuti: true,
    can_approve_hr: true,
  },
  'All': {
    can_scan: true, can_picking: true, can_peminjaman: true,
    can_view_inventory: true, can_view_mutasi: true, can_approve_so: true,
    can_export_data: true, can_sync_dealpos: true, can_manage_users: true,
    can_manage_settings: true, can_edit_data: true, can_delete_data: true,
    can_import_export_data: true,
    can_view_karyawan: true, can_view_presensi: true, can_view_roster: true, can_view_lembur_cuti: true,
    can_approve_hr: true,
  },
  'HR & Admin': {
    can_scan: false, can_picking: false, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: false,
    can_export_data: true, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: true, can_delete_data: false,
    can_import_export_data: false,
    can_view_karyawan: true, can_view_presensi: true, can_view_roster: true, can_view_lembur_cuti: true,
    can_approve_hr: true,
  },
  'Scanner Barcode': {
    can_scan: true, can_picking: false, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false,
    can_view_karyawan: false, can_view_presensi: false, can_view_roster: false, can_view_lembur_cuti: false,
    can_approve_hr: false,
  },
  'Inventory': {
    can_scan: false, can_picking: false, can_peminjaman: false,
    can_view_inventory: true, can_view_mutasi: false, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false,
    can_view_karyawan: false, can_view_presensi: false, can_view_roster: false, can_view_lembur_cuti: false,
    can_approve_hr: false,
  },
  'Stock Opname': {
    can_scan: false, can_picking: false, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: true,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false,
    can_view_karyawan: false, can_view_presensi: false, can_view_roster: false, can_view_lembur_cuti: false,
    can_approve_hr: false,
  },
  'Mutasi': {
    can_scan: false, can_picking: false, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: true, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false,
    can_view_karyawan: false, can_view_presensi: false, can_view_roster: false, can_view_lembur_cuti: false,
    can_approve_hr: false,
  },
  'Tugas Picking': {
    can_scan: false, can_picking: true, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false,
    can_view_karyawan: false, can_view_presensi: false, can_view_roster: false, can_view_lembur_cuti: false,
    can_approve_hr: false,
  },
  'Peminjaman': {
    can_scan: false, can_picking: false, can_peminjaman: true,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false,
    can_view_karyawan: false, can_view_presensi: false, can_view_roster: false, can_view_lembur_cuti: false,
    can_approve_hr: false,
  },
  'Operator': {
    can_scan: true, can_picking: true, can_peminjaman: false,
    can_view_inventory: false, can_view_mutasi: false, can_approve_so: false,
    can_export_data: false, can_sync_dealpos: false, can_manage_users: false,
    can_manage_settings: false, can_edit_data: false, can_delete_data: false,
    can_import_export_data: false,
    can_view_karyawan: false, can_view_presensi: false, can_view_roster: false, can_view_lembur_cuti: false,
    can_approve_hr: false,
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
  'HR & Admin': { desc: 'Akses khusus data karyawan, absensi, jadwal roster & approval HR', icon: '👥', badge: 'bg-teal-500' },
  Operator: { desc: 'Akses default operasional', icon: '⚙️', badge: 'bg-slate-500' },
  All: { desc: 'Akses penuh (Legacy)', icon: '⭐', badge: 'bg-indigo-500' },
  Custom: { desc: 'Role dengan permission custom', icon: '🔧', badge: 'bg-gray-500' },
};

export const isSuperadmin = (session: UserSession | null): boolean => {
  return session?.role === 'Superadmin' || session?.role === 'All';
};

/**
 * Memeriksa apakah session user berhak mengakses halaman tertentu
 */
export const canAccessPage = (session: UserSession | null, page: import('../types').ActivePage): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;

  switch (page) {
    case 'scanner':
      return hasPermission(session, 'can_scan');
    case 'inventory':
      return hasPermission(session, 'can_view_inventory');
    case 'stock_opname':
      return hasPermission(session, 'can_approve_so');
    case 'mutasi_log':
      return hasPermission(session, 'can_view_mutasi');
    case 'picking_tasks':
      return hasPermission(session, 'can_picking');
    case 'peminjaman':
      return hasPermission(session, 'can_peminjaman');
    case 'karyawan':
      return hasPermission(session, 'can_view_karyawan');
    case 'presensi':
      return hasPermission(session, 'can_view_presensi');
    case 'roster_shift':
      return hasPermission(session, 'can_view_roster');
    case 'lembur_cuti':
      return hasPermission(session, 'can_view_lembur_cuti');
    case 'hr_approval':
    case 'hr_rekap':
      return hasPermission(session, 'can_approve_hr');
    default:
      return false;
  }
};

/**
 * Memeriksa apakah session user berhak mengakses menu pengaturan sistem
 */
export const canAccessSettings = (session: UserSession | null): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;
  return hasPermission(session, 'can_manage_settings') || hasPermission(session, 'can_manage_users');
};

/**
 * Mendapatkan halaman pertama yang sah untuk user berdasarkan hak akses yang dimiliki
 */
export const getDefaultPageForSession = (session: UserSession | null): import('../types').ActivePage => {
  if (!session) return 'inventory';
  if (isSuperadmin(session)) return 'inventory';

  // Urutan prioritas modul yang dapat diakses:
  if (hasPermission(session, 'can_peminjaman')) return 'peminjaman';
  if (hasPermission(session, 'can_scan')) return 'scanner';
  if (hasPermission(session, 'can_view_inventory')) return 'inventory';
  if (hasPermission(session, 'can_picking')) return 'picking_tasks';
  if (hasPermission(session, 'can_view_mutasi')) return 'mutasi_log';
  if (hasPermission(session, 'can_approve_so')) return 'stock_opname';
  if (hasPermission(session, 'can_view_karyawan')) return 'karyawan';
  if (hasPermission(session, 'can_view_presensi')) return 'presensi';
  if (hasPermission(session, 'can_view_roster')) return 'roster_shift';
  if (hasPermission(session, 'can_view_lembur_cuti')) return 'lembur_cuti';
  if (hasPermission(session, 'can_approve_hr')) return 'hr_approval';

  return 'peminjaman';
};
