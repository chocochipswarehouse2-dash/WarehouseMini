import { UserSession } from '../types';

export const isSuperadmin = (session: UserSession | null): boolean => {
  if (!session) return false;
  return session.role === 'superadmin' || session.role === 'Superadmin';
};

export const hasPermission = (session: UserSession | null, permission: string): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;
  return !!session.permissions?.[permission];
};

export const canAccessPage = (session: UserSession | null, page: import('../types').ActivePage): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;

  switch (page) {
    case 'dashboard': return hasPermission(session, 'can_view_dashboard');
    case 'loading_dock': return hasPermission(session, 'can_penerimaan_barang') || hasPermission(session, 'can_pengiriman') || hasPermission(session, 'can_penerimaan');
    case 'packing': return hasPermission(session, 'can_packing');
    case 'agenda': return hasPermission(session, 'can_agenda');
    case 'scanner': return hasPermission(session, 'can_scan');
    case 'inventory': return hasPermission(session, 'can_view_inventory');
    case 'stock_opname': return hasPermission(session, 'can_approve_so');
    case 'mutasi_log': return hasPermission(session, 'can_view_mutasi');
    case 'picking_tasks': return hasPermission(session, 'can_picking');
    case 'peminjaman': return hasPermission(session, 'can_peminjaman');
    case 'perbaikan': return hasPermission(session, 'can_perbaikan');
    case 'karyawan': return hasPermission(session, 'can_view_karyawan');
    case 'presensi': return hasPermission(session, 'can_view_presensi');
    case 'roster_shift': return hasPermission(session, 'can_view_roster');
    case 'lembur_cuti': return hasPermission(session, 'can_view_lembur_cuti');
    case 'hr_approval':
    case 'hr_rekap': return hasPermission(session, 'can_approve_hr');
    case 'cetak_label': return hasPermission(session, 'can_cetak_label');
    case 'manual_shipment': return hasPermission(session, 'can_manual_shipment_view') || hasPermission(session, 'can_manual_shipment_action');
    case 'tarikan_md': return hasPermission(session, 'can_tarikan_md');
    case 'roadmap': return hasPermission(session, 'can_view_roadmap');
    case 'supabase_migration': return isSuperadmin(session);
    default: return false;
  }
};

export const canAccessSettings = (session: UserSession | null): boolean => {
  if (!session) return false;
  return isSuperadmin(session) || hasPermission(session, 'can_manage_settings');
};

export const getDefaultPageForSession = (session: UserSession | null): import('../types').ActivePage => {
  if (!session) return 'dashboard';
  if (isSuperadmin(session)) return 'dashboard';

  if (hasPermission(session, 'can_view_dashboard')) return 'dashboard';
  if (hasPermission(session, 'can_peminjaman')) return 'peminjaman';
  if (hasPermission(session, 'can_manual_shipment_view') || hasPermission(session, 'can_manual_shipment_action')) return 'manual_shipment';
  if (hasPermission(session, 'can_tarikan_md')) return 'tarikan_md';
  if (hasPermission(session, 'can_cetak_label')) return 'cetak_label';
  if (hasPermission(session, 'can_penerimaan')) return 'loading_dock';
  if (hasPermission(session, 'can_perbaikan')) return 'perbaikan';
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

  if (hasPermission(session, 'can_manual_shipment_view') || hasPermission(session, 'can_manual_shipment_action')) return 'manual_shipment';
  return 'scanner';
};

// Aliases for specific component checks
export const canPenerimaanBarang = (session: UserSession | null) => hasPermission(session, 'can_penerimaan_barang') || isSuperadmin(session);
export const canPacking = (session: UserSession | null) => hasPermission(session, 'can_packing') || isSuperadmin(session);
export const canPengiriman = (session: UserSession | null) => hasPermission(session, 'can_pengiriman') || isSuperadmin(session);
export const canAgenda = (session: UserSession | null) => hasPermission(session, 'can_agenda') || isSuperadmin(session);
export const canPenerimaan = (session: UserSession | null) => hasPermission(session, 'can_penerimaan') || isSuperadmin(session);
export const canViewDashboard = (session: UserSession | null) => hasPermission(session, 'can_view_dashboard') || isSuperadmin(session);
export const canPeminjaman = (session: UserSession | null) => hasPermission(session, 'can_peminjaman') || isSuperadmin(session);

export let ROLE_DEFAULT_PERMISSIONS: Record<string, Partial<import("../types").UserPermissions>> = {
  Superadmin: {},
  Manager: {},
  Operator: {},
  HR: {},
  'QC/Repair': {}
};

export let ROLE_DETAILS: Record<string, any> = {
  Superadmin: { badge: 'bg-red-500', icon: '👑', name: 'Superadmin' },
  Manager: { badge: 'bg-purple-500', icon: '📊', name: 'Manager' },
  Operator: { badge: 'bg-blue-500', icon: '📦', name: 'Operator' },
  HR: { badge: 'bg-emerald-500', icon: '👥', name: 'HR' },
  'QC/Repair': { badge: 'bg-amber-500', icon: '🔧', name: 'QC/Repair' },
};

export const updateRoleTemplates = (roles: Record<string, any>) => {
  const newPerms: Record<string, any> = {};
  const newDetails: Record<string, any> = {};
  
  Object.keys(roles).forEach(key => {
    const role = roles[key];
    newPerms[key] = role.permissions || {};
    newDetails[key] = {
      badge: role.badge || 'bg-slate-500',
      icon: role.icon || '📦',
      name: role.name || key
    };
  });

  ROLE_DEFAULT_PERMISSIONS = newPerms;
  ROLE_DETAILS = newDetails;
};

export const PERMISSION_GROUPS = [
  {
    id: 'g_all',
    title: 'All',
    badge: '🚀',
    description: 'Semua Izin Akses',
    permissions: [
      { key: 'can_penerimaan_barang', label: 'Penerimaan Barang', description: 'Bisa akses Penerimaan Barang', isSuperadminOnly: false },
      { key: 'can_packing', label: 'Packing', description: 'Bisa akses Packing', isSuperadminOnly: false },
      { key: 'can_pengiriman', label: 'Pengiriman', description: 'Bisa akses Pengiriman', isSuperadminOnly: false },
      { key: 'can_agenda', label: 'Agenda', description: 'Bisa akses Agenda', isSuperadminOnly: false },
      { key: 'can_penerimaan', label: 'Penerimaan Produksi', description: 'Bisa akses Penerimaan Produksi', isSuperadminOnly: false },
      { key: 'can_peminjaman', label: 'Peminjaman', description: 'Bisa akses Peminjaman', isSuperadminOnly: false },
      { key: 'can_scan', label: 'Scanner', description: 'Bisa akses Scanner', isSuperadminOnly: false },
      { key: 'can_view_inventory', label: 'Inventory', description: 'Bisa akses Inventory', isSuperadminOnly: false },
      { key: 'can_view_mutasi', label: 'Mutasi Log', description: 'Bisa akses Mutasi Log', isSuperadminOnly: false },
      { key: 'can_approve_so', label: 'Approve SO', description: 'Bisa akses Approve SO', isSuperadminOnly: false },
      { key: 'can_picking', label: 'Picking Tasks', description: 'Bisa akses Picking', isSuperadminOnly: false },
      { key: 'can_perbaikan', label: 'Perbaikan', description: 'Bisa akses Perbaikan', isSuperadminOnly: false },
      { key: 'can_view_karyawan', label: 'View Karyawan', description: 'Bisa akses Karyawan', isSuperadminOnly: false },
      { key: 'can_view_presensi', label: 'View Presensi', description: 'Bisa akses Presensi', isSuperadminOnly: false },
      { key: 'can_view_roster', label: 'View Roster', description: 'Bisa akses Roster', isSuperadminOnly: false },
      { key: 'can_view_lembur_cuti', label: 'View Lembur/Cuti', description: 'Bisa akses Lembur', isSuperadminOnly: false },
      { key: 'can_approve_hr', label: 'Approve HR', description: 'Bisa akses Approve HR', isSuperadminOnly: false },
      { key: 'can_view_dashboard', label: 'View Dashboard', description: 'Bisa akses Dashboard', isSuperadminOnly: false },
      { key: 'can_cetak_label', label: 'Cetak Label', description: 'Bisa Cetak Label', isSuperadminOnly: false },
      { key: 'can_manual_shipment_view', label: 'Manual Shipment View', description: 'Bisa lihat Manual Shipment', isSuperadminOnly: false },
      { key: 'can_manual_shipment_action', label: 'Manual Shipment Action', description: 'Bisa aksi Manual Shipment', isSuperadminOnly: false },
      { key: 'can_tarikan_md', label: 'Tarikan MD', description: 'Bisa akses Tarikan MD', isSuperadminOnly: false },
      { key: 'can_view_roadmap', label: 'View Roadmap', description: 'Bisa akses Roadmap', isSuperadminOnly: false },
      { key: 'can_manage_settings', label: 'Manage Settings', description: 'Bisa Manage Settings', isSuperadminOnly: true }
    ]
  }
];

export const TOTAL_PERMISSIONS_COUNT = PERMISSION_GROUPS[0].permissions.length;

export const countGrantedPermissions = (perms: Partial<import("../types").UserPermissions>) => {
  const validKeys = new Set(PERMISSION_GROUPS[0].permissions.map(p => p.key));
  return Object.entries(perms).filter(([key, value]) => validKeys.has(key) && value).length;
};
