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

export const ALL_PERMISSIONS: Partial<UserPermissions> = {
  can_view_dashboard: true,
  can_penerimaan_barang: true,
  can_packing: true,
  can_pengiriman: true,
  can_agenda: true,
  can_scan: true,
  can_penerimaan: true,
  can_picking: true,
  can_peminjaman: true,
  can_view_inventory: true,
  can_approve_so: true,
  can_view_mutasi: true,
  can_perbaikan: true,
  can_view_karyawan: true,
  can_view_presensi: true,
  can_view_roster: true,
  can_view_lembur_cuti: true,
  can_approve_hr: true,
  can_cetak_label: true,
  can_manual_shipment_view: true,
  can_manual_shipment_action: true,
  can_tarikan_md: true,
  can_view_roadmap: true,
  can_view_resolusi: true,
  can_manage_settings: true,
  can_manage_users: true,
  can_edit_data: true,
  can_delete_data: true,
  can_export_data: true,
  can_sync_dealpos: true,
  can_import_export_data: true,
};

export const INITIAL_ROLE_DEFAULT_PERMISSIONS: Record<string, Partial<UserPermissions>> = {
  Superadmin: { ...ALL_PERMISSIONS },
  Manager: {
    can_view_dashboard: true,
    can_penerimaan_barang: true,
    can_packing: true,
    can_pengiriman: true,
    can_agenda: true,
    can_scan: true,
    can_penerimaan: true,
    can_picking: true,
    can_peminjaman: true,
    can_view_inventory: true,
    can_approve_so: true,
    can_view_mutasi: true,
    can_perbaikan: true,
    can_view_karyawan: true,
    can_view_presensi: true,
    can_view_roster: true,
    can_view_lembur_cuti: true,
    can_approve_hr: true,
    can_cetak_label: true,
    can_manual_shipment_view: true,
    can_manual_shipment_action: true,
    can_tarikan_md: true,
    can_view_roadmap: true,
    can_view_resolusi: true,
    can_manage_users: true,
    can_manage_settings: false,
    can_edit_data: true,
    can_delete_data: true,
    can_export_data: true,
    can_sync_dealpos: true,
    can_import_export_data: true,
  },
  Operator: {
    can_view_dashboard: true,
    can_penerimaan_barang: true,
    can_packing: true,
    can_pengiriman: true,
    can_agenda: true,
    can_scan: true,
    can_penerimaan: true,
    can_picking: true,
    can_peminjaman: true,
    can_view_inventory: true,
    can_approve_so: false,
    can_view_mutasi: true,
    can_perbaikan: true,
    can_view_presensi: true,
    can_view_roster: true,
    can_view_lembur_cuti: true,
    can_cetak_label: true,
    can_manual_shipment_view: true,
    can_manual_shipment_action: true,
    can_tarikan_md: true,
    can_view_resolusi: true,
    can_edit_data: true,
    can_delete_data: false,
    can_export_data: false,
  },
  'Tugas Picking': {
    can_view_dashboard: true,
    can_picking: true,
    can_scan: true,
    can_view_inventory: true,
    can_view_mutasi: true,
    can_manual_shipment_view: true,
    can_tarikan_md: true,
    can_cetak_label: true,
    can_view_presensi: true,
    can_view_roster: true,
    can_view_lembur_cuti: true,
    can_edit_data: true,
  },
  Peminjaman: {
    can_view_dashboard: true,
    can_peminjaman: true,
    can_view_inventory: true,
    can_view_mutasi: true,
    can_scan: true,
    can_view_presensi: true,
    can_view_roster: true,
    can_view_lembur_cuti: true,
  },
  'QC/Repair': {
    can_view_dashboard: true,
    can_perbaikan: true,
    can_scan: true,
    can_view_inventory: true,
    can_view_mutasi: true,
    can_view_presensi: true,
    can_view_roster: true,
    can_view_lembur_cuti: true,
  },
  Perbaikan: {
    can_view_dashboard: true,
    can_perbaikan: true,
    can_scan: true,
    can_view_inventory: true,
    can_view_mutasi: true,
    can_view_presensi: true,
    can_view_roster: true,
    can_view_lembur_cuti: true,
  },
  HR: {
    can_view_dashboard: true,
    can_view_karyawan: true,
    can_view_presensi: true,
    can_view_roster: true,
    can_view_lembur_cuti: true,
    can_approve_hr: true,
  },
  'HR & Admin': {
    can_view_dashboard: true,
    can_view_karyawan: true,
    can_view_presensi: true,
    can_view_roster: true,
    can_view_lembur_cuti: true,
    can_approve_hr: true,
    can_manage_users: true,
  },
  'Scanner Barcode': {
    can_view_dashboard: true,
    can_scan: true,
    can_penerimaan_barang: true,
    can_penerimaan: true,
    can_view_inventory: true,
    can_view_mutasi: true,
  },
  Inventory: {
    can_view_dashboard: true,
    can_view_inventory: true,
    can_view_mutasi: true,
    can_approve_so: true,
    can_scan: true,
  },
  'Stock Opname': {
    can_view_dashboard: true,
    can_approve_so: true,
    can_view_inventory: true,
    can_scan: true,
    can_view_mutasi: true,
  },
  Mutasi: {
    can_view_dashboard: true,
    can_view_mutasi: true,
    can_view_inventory: true,
    can_scan: true,
  },
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
    case 'dashboard':
      return hasPermission(session, 'can_view_dashboard');
    case 'loading_dock':
      return (
        hasPermission(session, 'can_penerimaan_barang') ||
        hasPermission(session, 'can_pengiriman') ||
        hasPermission(session, 'can_penerimaan')
      );
    case 'penerimaan_barang':
      return hasPermission(session, 'can_penerimaan_barang') || hasPermission(session, 'can_penerimaan');
    case 'packing':
      return hasPermission(session, 'can_packing');
    case 'pengiriman':
      return hasPermission(session, 'can_pengiriman');
    case 'agenda':
      return hasPermission(session, 'can_agenda');
    case 'scanner':
      return hasPermission(session, 'can_scan');
    case 'penerimaan':
      return hasPermission(session, 'can_penerimaan') || hasPermission(session, 'can_penerimaan_barang');
    case 'inventory':
      return hasPermission(session, 'can_view_inventory');
    case 'stock_opname':
      return hasPermission(session, 'can_approve_so');
    case 'mutasi_log':
      return hasPermission(session, 'can_view_mutasi');
    case 'operasi_stok':
      return (
        hasPermission(session, 'can_scan') ||
        hasPermission(session, 'can_view_mutasi') ||
        hasPermission(session, 'can_approve_so')
      );
    case 'picking_tasks':
      return hasPermission(session, 'can_picking');
    case 'peminjaman':
      return hasPermission(session, 'can_peminjaman');
    case 'perbaikan':
      return hasPermission(session, 'can_perbaikan');
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
    case 'cetak_label':
      return hasPermission(session, 'can_cetak_label');
    case 'pesanan_saya':
      return (
        hasPermission(session, 'can_manual_shipment_view') ||
        hasPermission(session, 'can_manual_shipment_action') ||
        hasPermission(session, 'can_tarikan_md')
      );
    case 'manual_shipment':
      return (
        hasPermission(session, 'can_manual_shipment_view') ||
        hasPermission(session, 'can_manual_shipment_action')
      );
    case 'tarikan_md':
      return hasPermission(session, 'can_tarikan_md');
    case 'roadmap':
      return hasPermission(session, 'can_view_roadmap');
    case 'pusat_resolusi':
      return hasPermission(session, 'can_view_resolusi');
    case 'supabase_migration':
      return isSuperadmin(session);
    default:
      return false;
  }
};

export const canAccessSettings = (session: UserSession | null): boolean => {
  if (!session) return false;
  return (
    isSuperadmin(session) ||
    hasPermission(session, 'can_manage_settings') ||
    hasPermission(session, 'can_manage_users')
  );
};

export const getDefaultPageForSession = (session: UserSession | null): ActivePage => {
  if (!session) return 'dashboard';
  if (isSuperadmin(session)) return 'dashboard';

  if (hasPermission(session, 'can_view_dashboard')) return 'dashboard';
  if (canAccessPage(session, 'pesanan_saya')) return 'pesanan_saya';
  if (canAccessPage(session, 'loading_dock')) return 'loading_dock';
  if (canAccessPage(session, 'operasi_stok')) return 'operasi_stok';
  if (hasPermission(session, 'can_picking')) return 'picking_tasks';
  if (hasPermission(session, 'can_peminjaman')) return 'peminjaman';
  if (hasPermission(session, 'can_perbaikan')) return 'perbaikan';
  if (hasPermission(session, 'can_view_inventory')) return 'inventory';
  if (hasPermission(session, 'can_cetak_label')) return 'cetak_label';
  if (hasPermission(session, 'can_view_presensi')) return 'presensi';
  if (hasPermission(session, 'can_approve_hr')) return 'hr_approval';
  if (hasPermission(session, 'can_view_resolusi')) return 'pusat_resolusi';

  return 'scanner';
};

// Aliases for specific component checks
export const canPenerimaanBarang = (session: UserSession | null) =>
  hasPermission(session, 'can_penerimaan_barang') || isSuperadmin(session);
export const canPacking = (session: UserSession | null) =>
  hasPermission(session, 'can_packing') || isSuperadmin(session);
export const canPengiriman = (session: UserSession | null) =>
  hasPermission(session, 'can_pengiriman') || isSuperadmin(session);
export const canAgenda = (session: UserSession | null) =>
  hasPermission(session, 'can_agenda') || isSuperadmin(session);
export const canPenerimaan = (session: UserSession | null) =>
  hasPermission(session, 'can_penerimaan') || isSuperadmin(session);
export const canViewDashboard = (session: UserSession | null) =>
  hasPermission(session, 'can_view_dashboard') || isSuperadmin(session);
export const canPeminjaman = (session: UserSession | null) =>
  hasPermission(session, 'can_peminjaman') || isSuperadmin(session);

export const PERMISSION_GROUPS = [
  {
    id: 'g_ops',
    title: 'Operasional Gudang & Scanner',
    badge: '📦',
    description: 'Modul inti pergudangan, scanner, dan stok',
    permissions: [
      { key: 'can_view_dashboard', label: 'View Dashboard', description: 'Lihat ringkasan statistik & aktivitas', isSuperadminOnly: false },
      { key: 'can_scan', label: 'Scanner Barcode', description: 'Scan barcode fisik, kamera, & manual', isSuperadminOnly: false },
      { key: 'can_view_inventory', label: 'Stok & Inventory', description: 'Lihat stok rak & per SKU', isSuperadminOnly: false },
      { key: 'can_picking', label: 'Tugas Picking', description: 'Ambil barang & scan picking surat jalan', isSuperadminOnly: false },
      { key: 'can_peminjaman', label: 'Peminjaman (SPS)', description: 'Log pinjam live streaming & event', isSuperadminOnly: false },
      { key: 'can_perbaikan', label: 'Quality Control (QC)', description: 'Laporan QC, perbaikan & defect barang', isSuperadminOnly: false },
      { key: 'can_view_mutasi', label: 'Mutasi Log', description: 'Riwayat mutasi in/out barang', isSuperadminOnly: false },
      { key: 'can_approve_so', label: 'Stock Opname (SO)', description: 'Approval & input hasil stock opname', isSuperadminOnly: false },
    ],
  },
  {
    id: 'g_dock',
    title: 'Loading Dock & Ekspedisi',
    badge: '🚚',
    description: 'Penerimaan supplier, konveksi, packing & pengiriman',
    permissions: [
      { key: 'can_penerimaan_barang', label: 'Penerimaan Supplier', description: 'Terima kiriman kain/aksesori/bahan', isSuperadminOnly: false },
      { key: 'can_penerimaan', label: 'Penerimaan Produksi', description: 'Terima barang jadi dari penjahit/workshop', isSuperadminOnly: false },
      { key: 'can_packing', label: 'Packing Pesanan', description: 'Proses bungkus & kemas pesanan', isSuperadminOnly: false },
      { key: 'can_pengiriman', label: 'Pengiriman Ekspedisi', description: 'Handover kurir & manifes kirim', isSuperadminOnly: false },
      { key: 'can_agenda', label: 'Agenda & Project', description: 'Jadwal kerja, timeline, & deadline gudang', isSuperadminOnly: false },
    ],
  },
  {
    id: 'g_orders',
    title: 'Pesanan Saya & Surat Jalan',
    badge: '📑',
    description: 'Pengecekan surat jalan, tarikan MD, manual shipment & label',
    permissions: [
      { key: 'can_tarikan_md', label: 'Tarikan MD / Pengecekan SJ', description: 'Import, scan komparasi & submit SJ', isSuperadminOnly: false },
      { key: 'can_manual_shipment_view', label: 'Lihat Manual Shipment', description: 'Melihat daftar pesanan manual shipment', isSuperadminOnly: false },
      { key: 'can_manual_shipment_action', label: 'Aksi Manual Shipment', description: 'Input, proses, edit status manual shipment', isSuperadminOnly: false },
      { key: 'can_cetak_label', label: 'Cetak Label Resi A6', description: 'Cetak resi thermal pengiriman manual', isSuperadminOnly: false },
      { key: 'can_view_resolusi', label: 'Pusat Resolusi & Retur', description: 'Layanan kendala kiriman & retur paket', isSuperadminOnly: false },
      { key: 'can_view_roadmap', label: 'Roadmap Aplikasi', description: 'Lihat roadmap & status pembaruan WMS', isSuperadminOnly: false },
    ],
  },
  {
    id: 'g_hr',
    title: 'HR & Kepegawaian',
    badge: '👥',
    description: 'Presensi, roster shift, lembur, dan persetujuan HR',
    permissions: [
      { key: 'can_view_presensi', label: 'Presensi Karyawan', description: 'Absensi masuk / pulang staf gudang', isSuperadminOnly: false },
      { key: 'can_view_roster', label: 'Jadwal Roster Shift', description: 'Lihat jadwal pembagian shift kerja', isSuperadminOnly: false },
      { key: 'can_view_lembur_cuti', label: 'Lembur & Cuti', description: 'Pengajuan lembur dan cuti karyawan', isSuperadminOnly: false },
      { key: 'can_view_karyawan', label: 'Direktori Karyawan', description: 'Data staf gudang dan NIK', isSuperadminOnly: false },
      { key: 'can_approve_hr', label: 'Approval HR & Rekap', description: 'Persetujuan lembur/cuti dan rekap gaji', isSuperadminOnly: false },
    ],
  },
  {
    id: 'g_admin',
    title: 'Admin & Pengaturan Sistem',
    badge: '⚙️',
    description: 'Kontrol manajemen data master, user, dan konfigurasi',
    permissions: [
      { key: 'can_manage_users', label: 'Kelola Pengguna', description: 'Tambah, edit hak akses, dan NIK user', isSuperadminOnly: false },
      { key: 'can_edit_data', label: 'Edit Data Master', description: 'Dapat mengedit data produk & transaksi', isSuperadminOnly: false },
      { key: 'can_delete_data', label: 'Hapus Data Master', description: 'Dapat menghapus data dari sistem', isSuperadminOnly: false },
      { key: 'can_export_data', label: 'Export Data Excel/CSV', description: 'Unduh laporan data gudang', isSuperadminOnly: false },
      { key: 'can_import_export_data', label: 'Import / Export File', description: 'Upload batch CSV/Excel ke sistem', isSuperadminOnly: false },
      { key: 'can_sync_dealpos', label: 'Sinkronisasi DealPOS', description: 'Tarik / kirim stok ke DealPOS POS', isSuperadminOnly: false },
      { key: 'can_manage_settings', label: 'Pengaturan Sistem & Database', description: 'Akses penuh konfigurasi backend Supabase & integrasi', isSuperadminOnly: true },
    ],
  },
];

export const TOTAL_PERMISSIONS_COUNT = PERMISSION_GROUPS.reduce(
  (acc, g) => acc + g.permissions.length,
  0
);

export const countGrantedPermissions = (perms: Partial<UserPermissions> | undefined | null) => {
  if (!perms || typeof perms !== 'object') return 0;
  const validKeys = new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)));
  return Object.entries(perms).filter(([key, value]) => validKeys.has(key) && value).length;
};

