import { UserSession, UserPermissions, ActivePage } from '../types';

export const isSuperadmin = (session: UserSession | null): boolean => {
  if (!session) return false;
  const role = String(session.role || '').trim().toLowerCase().replace(/[\s_-]/g, '');
  const user = String(session.username || '').trim().toLowerCase();
  const email = String(session.email || '').trim().toLowerCase();
  const nik = String(session.nik || '').trim().toLowerCase();

  return (
    role === 'superadmin' ||
    role === 'admin' ||
    user === 'admin' ||
    user === 'admin2' ||
    user === 'chocoadm' ||
    user === 'warehouse' ||
    nik === 'wh0001' ||
    email.startsWith('admin') ||
    email.includes('warehouse2@gmail.com') ||
    email.includes('chocoadm')
  );
};

export const PERMISSION_GROUPS = [
  {
    id: 'g_ops_dashboard',
    title: 'Dashboard Operasional',
    badge: '📊',
    description: 'Akses halaman Dashboard utama',
    permissions: [
      { key: 'menu_ops_dashboard', label: 'Akses Dashboard', description: 'Lihat ringkasan operasional', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_ops_agenda',
    title: 'Agenda & Project',
    badge: '📅',
    description: 'Jadwal kerja dan tugas',
    permissions: [
      { key: 'menu_ops_agenda', label: 'Menu Agenda', description: 'Akses utama menu Agenda', isSuperadminOnly: false },
      { key: 'tab_ops_agenda_kalendar', label: 'Tab Kalendar Kerja', description: 'Akses kalendar event', isSuperadminOnly: false },
      { key: 'tab_ops_agenda_project', label: 'Tab Project & Task', description: 'Akses task management', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_ops_pesanan',
    title: 'Pesanan Saya',
    badge: '🛍️',
    description: 'Daftar pesanan dari semua channel',
    permissions: [
      { key: 'menu_ops_pesanan_saya', label: 'Menu Pesanan Saya', description: 'Akses halaman Pesanan Saya', isSuperadminOnly: false },
      { key: 'tab_ops_pesanan_dashboard', label: 'Tab Dashboard', description: 'Dashboard pesanan', isSuperadminOnly: false },
      { key: 'tab_ops_pesanan_manual_shipment', label: 'Tab Manual Shipment', description: 'Kelola kiriman manual', isSuperadminOnly: false },
      { key: 'tab_ops_pesanan_transfer_order', label: 'Tab Transfer Order', description: 'Kelola transfer order', isSuperadminOnly: false },
      { key: 'tab_ops_pesanan_shopee', label: 'Tab Shopee', description: 'Data pesanan Shopee', isSuperadminOnly: false },
      { key: 'tab_ops_pesanan_tiktok', label: 'Tab Tiktok', description: 'Data pesanan Tiktok', isSuperadminOnly: false },
      { key: 'tab_ops_pesanan_website', label: 'Tab Website', description: 'Data pesanan Website', isSuperadminOnly: false },
      { key: 'tab_ops_pesanan_woocommerce', label: 'Tab Woocommerce', description: 'Data pesanan Woocommerce', isSuperadminOnly: false },
      { key: 'tab_ops_pesanan_lazada', label: 'Tab Lazada', description: 'Data pesanan Lazada', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_ops_resolusi',
    title: 'Pusat Resolusi',
    badge: '📞',
    description: 'Kendala kiriman, komplain & retur',
    permissions: [
      { key: 'menu_ops_resolusi', label: 'Menu Pusat Resolusi', description: 'Akses Pusat Resolusi', isSuperadminOnly: false },
      { key: 'tab_ops_resolusi_retur', label: 'Tab Retur Penukaran', description: 'Proses retur tukar', isSuperadminOnly: false },
      { key: 'tab_ops_resolusi_refund', label: 'Tab Pengembalian Dana', description: 'Proses pengembalian dana', isSuperadminOnly: false },
      { key: 'tab_ops_resolusi_gagal', label: 'Tab Pengiriman Gagal', description: 'Proses kiriman gagal (RTS)', isSuperadminOnly: false },
      { key: 'tab_ops_resolusi_komplain', label: 'Tab Komplain Customer', description: 'Proses komplain', isSuperadminOnly: false },
      { key: 'tab_ops_resolusi_rating', label: 'Tab Report Rating', description: 'Laporan rating produk', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_ops_loading',
    title: 'Loading Dock',
    badge: '🚚',
    description: 'Penerimaan & Pengiriman',
    permissions: [
      { key: 'menu_ops_loading_dock', label: 'Menu Loading Dock', description: 'Akses halaman Loading Dock', isSuperadminOnly: false },
      { key: 'tab_ops_loading_produksi', label: 'Tab Penerimaan Produksi', description: 'Terima dari CMT', isSuperadminOnly: false },
      { key: 'tab_ops_loading_penerimaan', label: 'Tab Penerimaan Barang', description: 'Terima dari Supplier', isSuperadminOnly: false },
      { key: 'tab_ops_loading_pengiriman', label: 'Tab Pengiriman Barang', description: 'Handover ekpedisi', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_ops_mutasi',
    title: 'Mutasi & Stock Opname',
    badge: '🔄',
    description: 'Scanner dan log mutasi',
    permissions: [
      { key: 'menu_ops_mutasi', label: 'Menu Scanner & SO', description: 'Akses halaman scanner', isSuperadminOnly: false },
      { key: 'tab_ops_mutasi_scanner', label: 'Tab Scanner', description: 'Gunakan kamera/scanner', isSuperadminOnly: false },
      { key: 'tab_ops_mutasi_log', label: 'Tab Mutasi Log', description: 'Melihat histori in/out', isSuperadminOnly: false },
      { key: 'tab_ops_mutasi_so', label: 'Tab Stock Opname', description: 'Persetujuan dan input SO', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_ops_qc',
    title: 'Quality Control',
    badge: '🔧',
    description: 'QC & Perbaikan',
    permissions: [
      { key: 'menu_ops_qc', label: 'Menu QC', description: 'Akses laporan inspeksi mutu', isSuperadminOnly: false },
      { key: 'tab_ops_qc_reject', label: 'Tab Antrean Reject', description: 'Barang reject', isSuperadminOnly: false },
      { key: 'tab_ops_qc_cuci', label: 'Tab Cuci Noda', description: 'Antrean pencucian', isSuperadminOnly: false },
      { key: 'tab_ops_qc_permak', label: 'Tab Permak Jahit', description: 'Antrean permak', isSuperadminOnly: false },
      { key: 'tab_ops_qc_defect', label: 'Tab Defect Permanen', description: 'Barang gagal perbaikan', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_ops_lainnya',
    title: 'Operasional Lainnya',
    badge: '📦',
    description: 'Inventory, Picking & Peminjaman',
    permissions: [
      { key: 'menu_ops_inventory', label: 'Menu Inventory', description: 'Akses daftar stok', isSuperadminOnly: false },
      { key: 'menu_ops_picking', label: 'Menu Tugas Picking', description: 'Akses picking list', isSuperadminOnly: false },
      { key: 'menu_ops_peminjaman', label: 'Menu Peminjaman', description: 'Akses form peminjaman', isSuperadminOnly: false },
      { key: 'menu_ops_roadmap', label: 'Menu Roadmap', description: 'Lihat daftar fitur baru', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_hr',
    title: 'Karyawan & Presensi',
    badge: '👥',
    description: 'Modul HR dan absensi',
    permissions: [
      { key: 'menu_hr_karyawan', label: 'Menu Karyawan', description: 'Direktori karyawan', isSuperadminOnly: false },
      { key: 'menu_hr_presensi', label: 'Menu Presensi', description: 'Log absen masuk/pulang', isSuperadminOnly: false },
      { key: 'menu_hr_roster', label: 'Menu Roster Shift', description: 'Penjadwalan shift', isSuperadminOnly: false },
      { key: 'menu_hr_lembur_cuti', label: 'Menu Lembur & Cuti', description: 'Pengajuan HR', isSuperadminOnly: false },
      { key: 'menu_hr_approval', label: 'Menu Approval', description: 'Persetujuan pengajuan', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_action',
    title: 'Action & Ekstra',
    badge: '⚡',
    description: 'Tindakan khusus',
    permissions: [
      { key: 'action_cetak_label', label: 'Cetak Label Resi', description: 'Mencetak label resi manual', isSuperadminOnly: false },
      { key: 'action_export_data', label: 'Export Excel/CSV', description: 'Mengunduh data', isSuperadminOnly: false },
      { key: 'action_import_data', label: 'Import File', description: 'Mengunggah data', isSuperadminOnly: false },
      { key: 'action_sync_dealpos', label: 'Sync DealPOS', description: 'Menyelaraskan stok', isSuperadminOnly: false },
      { key: 'action_edit_master', label: 'Edit Data', description: 'Mengubah data master', isSuperadminOnly: false },
      { key: 'action_delete_master', label: 'Hapus Data', description: 'Menghapus data master', isSuperadminOnly: false },
    ]
  }
];

export const ALL_PERMISSIONS: Partial<UserPermissions> = PERMISSION_GROUPS.reduce((acc, group) => {
  group.permissions.forEach(p => {
    acc[p.key as keyof UserPermissions] = true;
  });
  return acc;
}, {} as Partial<UserPermissions>);

export const INITIAL_ROLE_DEFAULT_PERMISSIONS: Record<string, Partial<UserPermissions>> = {
  Superadmin: { ...ALL_PERMISSIONS },
};

export const INITIAL_ROLE_DETAILS: Record<string, { badge: string; icon: string; name: string }> = {
  Superadmin: { badge: 'bg-red-500', icon: '👑', name: 'Superadmin' },
  Manager: { badge: 'bg-purple-500', icon: '📊', name: 'Manager' },
  Operator: { badge: 'bg-blue-500', icon: '📦', name: 'Operator' },
  'Tugas Picking': { badge: 'bg-amber-500', icon: '🛒', name: 'Tugas Picking' },
  Peminjaman: { badge: 'bg-indigo-500', icon: '📑', name: 'Peminjaman' },
  HR: { badge: 'bg-emerald-500', icon: '👥', name: 'HR' },
  'HR & Admin': { badge: 'bg-emerald-500', icon: '👥', name: 'HR & Admin' },
  'QC/Repair': { badge: 'bg-rose-500', icon: '🔧', name: 'QC/Repair' },
  Perbaikan: { badge: 'bg-rose-500', icon: '🔧', name: 'Perbaikan' },
  'Scanner Barcode': { badge: 'bg-cyan-500', icon: '📷', name: 'Scanner Barcode' },
  Inventory: { badge: 'bg-teal-500', icon: '📚', name: 'Inventory' },
  'Stock Opname': { badge: 'bg-violet-500', icon: '📋', name: 'Stock Opname' },
  Mutasi: { badge: 'bg-orange-500', icon: '🔄', name: 'Mutasi' },
};

export let ROLE_DEFAULT_PERMISSIONS: Record<string, Partial<UserPermissions>> = {
  ...INITIAL_ROLE_DEFAULT_PERMISSIONS,
};

export let ROLE_DETAILS: Record<string, any> = {
  ...INITIAL_ROLE_DETAILS,
};

export const updateRoleTemplates = (roles: Record<string, any>) => {
  const newPerms: Record<string, any> = { ...INITIAL_ROLE_DEFAULT_PERMISSIONS };
  const newDetails: Record<string, any> = { ...INITIAL_ROLE_DETAILS };

  if (roles && typeof roles === 'object') {
    Object.keys(roles).forEach((key) => {
      const role = roles[key];
      if (role) {
        newPerms[key] = { ...(newPerms[key] || {}), ...(role.permissions || {}) };
        newDetails[key] = {
          badge: role.badge || newDetails[key]?.badge || 'bg-slate-500',
          icon: role.icon || newDetails[key]?.icon || '📦',
          name: role.name || key,
        };
      }
    });
  }

  ROLE_DEFAULT_PERMISSIONS = newPerms;
  ROLE_DETAILS = newDetails;
};

export const hasPermission = (session: UserSession | null, permission: string): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;

  // 1. Explicit permission defined in user session object
  const userPerms = session.permissions;
  if (userPerms && typeof userPerms[permission as keyof UserPermissions] === 'boolean') {
    return userPerms[permission as keyof UserPermissions]!;
  }

  // 2. Role template default fallback
  const roleKey = session.role || 'Operator';
  const roleDefaults = ROLE_DEFAULT_PERMISSIONS[roleKey] || ROLE_DEFAULT_PERMISSIONS['Operator'];
  if (roleDefaults && typeof roleDefaults[permission as keyof UserPermissions] === 'boolean') {
    return !!roleDefaults[permission as keyof UserPermissions];
  }

  return false;
};

export const canAccessPage = (session: UserSession | null, page: ActivePage): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;

  switch (page) {
    case 'dashboard': return hasPermission(session, 'menu_ops_dashboard');
    case 'loading_dock': return hasPermission(session, 'menu_ops_loading_dock') || hasPermission(session, 'tab_ops_loading_produksi') || hasPermission(session, 'tab_ops_loading_penerimaan') || hasPermission(session, 'tab_ops_loading_pengiriman');
    case 'penerimaan_barang': return hasPermission(session, 'tab_ops_loading_penerimaan');
    case 'packing': return hasPermission(session, 'tab_ops_loading_pengiriman');
    case 'pengiriman': return hasPermission(session, 'tab_ops_loading_pengiriman');
    case 'agenda': return hasPermission(session, 'menu_ops_agenda') || hasPermission(session, 'tab_ops_agenda_kalendar') || hasPermission(session, 'tab_ops_agenda_project');
    case 'scanner': return hasPermission(session, 'tab_ops_mutasi_scanner');
    case 'penerimaan': return hasPermission(session, 'tab_ops_loading_produksi');
    case 'inventory': return hasPermission(session, 'menu_ops_inventory');
    case 'stock_opname': return hasPermission(session, 'tab_ops_mutasi_so');
    case 'mutasi_log': return hasPermission(session, 'tab_ops_mutasi_log');
    case 'operasi_stok': return hasPermission(session, 'menu_ops_mutasi') || hasPermission(session, 'tab_ops_mutasi_scanner') || hasPermission(session, 'tab_ops_mutasi_log') || hasPermission(session, 'tab_ops_mutasi_so');
    case 'picking_tasks': return hasPermission(session, 'menu_ops_picking');
    case 'peminjaman': return hasPermission(session, 'menu_ops_peminjaman');
    case 'perbaikan': return hasPermission(session, 'menu_ops_qc') || hasPermission(session, 'tab_ops_qc_reject') || hasPermission(session, 'tab_ops_qc_cuci') || hasPermission(session, 'tab_ops_qc_permak') || hasPermission(session, 'tab_ops_qc_defect');
    case 'karyawan': return hasPermission(session, 'menu_hr_karyawan');
    case 'presensi': return hasPermission(session, 'menu_hr_presensi');
    case 'roster_shift': return hasPermission(session, 'menu_hr_roster');
    case 'lembur_cuti': return hasPermission(session, 'menu_hr_lembur_cuti');
    case 'hr_approval':
    case 'hr_rekap': return hasPermission(session, 'menu_hr_approval');
    case 'cetak_label': return hasPermission(session, 'action_cetak_label');
    case 'pesanan_saya': return hasPermission(session, 'menu_ops_pesanan_saya') || hasPermission(session, 'tab_ops_pesanan_dashboard') || hasPermission(session, 'tab_ops_pesanan_manual_shipment') || hasPermission(session, 'tab_ops_pesanan_transfer_order') || hasPermission(session, 'tab_ops_pesanan_shopee') || hasPermission(session, 'tab_ops_pesanan_tiktok') || hasPermission(session, 'tab_ops_pesanan_website') || hasPermission(session, 'tab_ops_pesanan_woocommerce') || hasPermission(session, 'tab_ops_pesanan_lazada');
    case 'manual_shipment': return hasPermission(session, 'tab_ops_pesanan_manual_shipment');
    case 'tarikan_md': return hasPermission(session, 'tab_ops_pesanan_transfer_order');
    case 'roadmap': return hasPermission(session, 'menu_ops_roadmap');
    case 'pusat_resolusi': return hasPermission(session, 'menu_ops_resolusi') || hasPermission(session, 'tab_ops_resolusi_retur') || hasPermission(session, 'tab_ops_resolusi_refund') || hasPermission(session, 'tab_ops_resolusi_gagal') || hasPermission(session, 'tab_ops_resolusi_komplain') || hasPermission(session, 'tab_ops_resolusi_rating');
    case 'supabase_migration': return false;
    default:
      return false;
  }
};

export const canAccessSettings = (session: UserSession | null): boolean => {
  if (!session) return false;
  return isSuperadmin(session);
};

export const getDefaultPageForSession = (session: UserSession | null): ActivePage => {
  if (!session) return 'dashboard';
  if (isSuperadmin(session)) return 'dashboard';

  if (hasPermission(session, 'menu_ops_dashboard')) return 'dashboard';
  
  if (hasPermission(session, 'menu_ops_pesanan_saya') || hasPermission(session, 'tab_ops_pesanan_dashboard') || hasPermission(session, 'tab_ops_pesanan_manual_shipment') || hasPermission(session, 'tab_ops_pesanan_transfer_order') || hasPermission(session, 'tab_ops_pesanan_shopee') || hasPermission(session, 'tab_ops_pesanan_tiktok') || hasPermission(session, 'tab_ops_pesanan_website') || hasPermission(session, 'tab_ops_pesanan_woocommerce') || hasPermission(session, 'tab_ops_pesanan_lazada')) return 'pesanan_saya';
  
  if (hasPermission(session, 'menu_ops_loading_dock') || hasPermission(session, 'tab_ops_loading_produksi') || hasPermission(session, 'tab_ops_loading_penerimaan') || hasPermission(session, 'tab_ops_loading_pengiriman')) return 'loading_dock';
  
  if (hasPermission(session, 'menu_ops_mutasi') || hasPermission(session, 'tab_ops_mutasi_scanner') || hasPermission(session, 'tab_ops_mutasi_log') || hasPermission(session, 'tab_ops_mutasi_so')) return 'operasi_stok';
  
  if (hasPermission(session, 'menu_ops_picking')) return 'picking_tasks';
  if (hasPermission(session, 'menu_ops_peminjaman')) return 'peminjaman';
  
  if (hasPermission(session, 'menu_ops_qc') || hasPermission(session, 'tab_ops_qc_reject') || hasPermission(session, 'tab_ops_qc_cuci') || hasPermission(session, 'tab_ops_qc_permak') || hasPermission(session, 'tab_ops_qc_defect')) return 'perbaikan';
  
  if (hasPermission(session, 'menu_ops_inventory')) return 'inventory';
  if (hasPermission(session, 'menu_hr_presensi')) return 'presensi';
  if (hasPermission(session, 'menu_hr_approval')) return 'hr_approval';
  
  if (hasPermission(session, 'menu_ops_resolusi') || hasPermission(session, 'tab_ops_resolusi_retur') || hasPermission(session, 'tab_ops_resolusi_refund') || hasPermission(session, 'tab_ops_resolusi_gagal') || hasPermission(session, 'tab_ops_resolusi_komplain') || hasPermission(session, 'tab_ops_resolusi_rating')) return 'pusat_resolusi';

  return 'dashboard';
};

// Aliases for specific component checks
export const canPenerimaanBarang = (session: UserSession | null) =>
  hasPermission(session, 'tab_ops_loading_penerimaan') || isSuperadmin(session);
export const canPacking = (session: UserSession | null) =>
  hasPermission(session, 'tab_ops_loading_pengiriman') || isSuperadmin(session);
export const canPengiriman = (session: UserSession | null) =>
  hasPermission(session, 'tab_ops_loading_pengiriman') || isSuperadmin(session);
export const canAgenda = (session: UserSession | null) =>
  hasPermission(session, 'menu_ops_agenda') || isSuperadmin(session);
export const canPenerimaan = (session: UserSession | null) =>
  hasPermission(session, 'tab_ops_loading_produksi') || isSuperadmin(session);
export const canViewDashboard = (session: UserSession | null) =>
  hasPermission(session, 'menu_ops_dashboard') || isSuperadmin(session);
export const canPeminjaman = (session: UserSession | null) =>
  hasPermission(session, 'menu_ops_peminjaman') || isSuperadmin(session);

export const TOTAL_PERMISSIONS_COUNT = PERMISSION_GROUPS.reduce(
  (acc, g) => acc + g.permissions.length,
  0
);

export const countGrantedPermissions = (perms: Partial<UserPermissions> | undefined | null) => {
  if (!perms || typeof perms !== 'object') return 0;
  const validKeys = new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)));
  return Object.entries(perms).filter(([key, value]) => validKeys.has(key) && value).length;
};
