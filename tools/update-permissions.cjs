const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/services/permissions.ts');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Define PERMISSION_GROUPS
const permissionGroupsCode = `
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
    id: 'g_ops_katalog',
    title: 'Katalog Produk',
    badge: '📖',
    description: 'Katalog visual produk, foto model & cetak',
    permissions: [
      { key: 'menu_ops_katalog_produk', label: 'Menu Katalog Produk', description: 'Akses halaman katalog produk', isSuperadminOnly: false },
      { key: 'action_upload_katalog', label: 'Upload & Kelola Foto/Excel', description: 'Upload file excel katalog, ganti batch & upload foto', isSuperadminOnly: false },
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
`;

// Replace from export const ALL_PERMISSIONS to the end of INITIAL_ROLE_DEFAULT_PERMISSIONS
content = content.replace(/export const ALL_PERMISSIONS[\s\S]*?Mutasi: {[\s\S]*?},\n};/, permissionGroupsCode);

// Remove the old PERMISSION_GROUPS at the bottom (lines 401 to 473)
content = content.replace(/export const PERMISSION_GROUPS = \[[\s\S]*?}\n  \},\n\];\n/g, '');

const accessPageCode = `
export const canAccessPage = (session: UserSession | null, page: ActivePage): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;

  switch (page) {
    case 'dashboard': return hasPermission(session, 'menu_ops_dashboard');
    case 'loading_dock': return hasPermission(session, 'menu_ops_loading_dock');
    case 'penerimaan_barang': return hasPermission(session, 'tab_ops_loading_penerimaan');
    case 'packing': return hasPermission(session, 'tab_ops_loading_pengiriman');
    case 'pengiriman': return hasPermission(session, 'tab_ops_loading_pengiriman');
    case 'agenda': return hasPermission(session, 'menu_ops_agenda');
    case 'scanner': return hasPermission(session, 'tab_ops_mutasi_scanner');
    case 'penerimaan': return hasPermission(session, 'tab_ops_loading_produksi');
    case 'inventory': return hasPermission(session, 'menu_ops_inventory');
    case 'stock_opname': return hasPermission(session, 'tab_ops_mutasi_so');
    case 'mutasi_log': return hasPermission(session, 'tab_ops_mutasi_log');
    case 'operasi_stok': return hasPermission(session, 'menu_ops_mutasi');
    case 'picking_tasks': return hasPermission(session, 'menu_ops_picking');
    case 'peminjaman': return hasPermission(session, 'menu_ops_peminjaman');
    case 'perbaikan': return hasPermission(session, 'menu_ops_qc');
    case 'karyawan': return hasPermission(session, 'menu_hr_karyawan');
    case 'presensi': return hasPermission(session, 'menu_hr_presensi');
    case 'roster_shift': return hasPermission(session, 'menu_hr_roster');
    case 'lembur_cuti': return hasPermission(session, 'menu_hr_lembur_cuti');
    case 'hr_approval':
    case 'hr_rekap': return hasPermission(session, 'menu_hr_approval');
    case 'cetak_label': return hasPermission(session, 'action_cetak_label');
    case 'pesanan_saya': return hasPermission(session, 'menu_ops_pesanan_saya');
    case 'manual_shipment': return hasPermission(session, 'tab_ops_pesanan_manual_shipment');
    case 'tarikan_md': return hasPermission(session, 'tab_ops_pesanan_transfer_order'); // mapped temporarily
    case 'roadmap': return hasPermission(session, 'menu_ops_roadmap');
    case 'pusat_resolusi': return hasPermission(session, 'menu_ops_resolusi');
    case 'supabase_migration': return false; // Utilitas is hardcoded false for non-superadmin
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
  if (hasPermission(session, 'menu_ops_pesanan_saya')) return 'pesanan_saya';
  if (hasPermission(session, 'menu_ops_loading_dock')) return 'loading_dock';
  if (hasPermission(session, 'menu_ops_mutasi')) return 'operasi_stok';
  if (hasPermission(session, 'menu_ops_picking')) return 'picking_tasks';
  if (hasPermission(session, 'menu_ops_peminjaman')) return 'peminjaman';
  if (hasPermission(session, 'menu_ops_qc')) return 'perbaikan';
  if (hasPermission(session, 'menu_ops_inventory')) return 'inventory';
  if (hasPermission(session, 'menu_hr_presensi')) return 'presensi';
  if (hasPermission(session, 'menu_hr_approval')) return 'hr_approval';
  if (hasPermission(session, 'menu_ops_resolusi')) return 'pusat_resolusi';

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
`;

content = content.replace(/export const canAccessPage = [\s\S]*?hasPermission\(session, 'can_peminjaman'\) \|\| isSuperadmin\(session\);/, accessPageCode);

fs.writeFileSync(filePath, content);
console.log('Update complete');
