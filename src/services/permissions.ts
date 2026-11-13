import { UserSession, UserPermissions, ActivePage } from '../types';

export const isSuperadmin = (session: UserSession | null): boolean => {
  if (!session) return false;
  const user = String(session.username || '').trim().toLowerCase();
  
  // Akun outlet / store (seperti chococpj, chocogaia, chocobts, dll.) adalah akun toko, bukan superadmin gudang
  if (user.startsWith('choco') && user !== 'chocoadm') return false;
  const div = String(session.divisi || '').trim().toLowerCase();
  if (div === 'store' || div === 'outlet') return false;

  const role = String(session.role || '').trim().toLowerCase().replace(/[\s_-]/g, '');
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

/**
 * Mengecek apakah sesi yang sedang login adalah khusus akun utama `warehouse`
 * (digunakan untuk pengiriman notifikasi eksklusif seperti pengajuan Ijin/Cuti/Lembur).
 */
export const isWarehouseAccountOnly = (session: UserSession | null): boolean => {
  if (!session) return false;
  const user = String(session.username || '').trim().toLowerCase();
  const nik = String(session.nik || '').trim().toLowerCase();
  const email = String(session.email || '').trim().toLowerCase();

  return (
    user === 'warehouse' ||
    user === 'chocochips.warehouse2@gmail.com' ||
    email === 'chocochips.warehouse2@gmail.com' ||
    email.includes('warehouse2@gmail.com') ||
    nik === 'wh0001'
  );
};


export const PERMISSION_GROUPS = [
  {
    id: 'g_ops_dashboard',
    title: 'Dashboard & Komunikasi',
    badge: '📊',
    description: 'Akses halaman Dashboard utama & Live Chat Tim',
    permissions: [
      { key: 'menu_ops_dashboard', label: 'Akses Dashboard', description: 'Lihat ringkasan operasional', isSuperadminOnly: false },
      { key: 'menu_ops_live_chat', label: 'Akses Live Chat & Diskusi', description: 'Chat real-time antar user online & ruang diskusi (Otomatis aktif default)', isSuperadminOnly: false },
      { key: 'action_manage_chat_groups', label: 'Buat & Kelola Grup Diskusi', description: 'Membuat ruang diskusi baru dan menambah/mengeluarkan anggota grup', isSuperadminOnly: true },
      { key: 'action_access_wms_ai', label: 'Akses Asisten AI Pintar (Gemini)', description: 'Tanya stok produk, cari kode/UP, dan buat laporan rekap otomatis via AI', isSuperadminOnly: false },
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
      { key: 'tab_ops_pesanan_iglive', label: 'Tab IG Live', description: 'Data pesanan IG Live', isSuperadminOnly: false },
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
    id: 'g_ops_tagihan_jne',
    title: 'Rekap Tagihan & Resi JNE',
    badge: '🧾',
    description: 'Rekap tagihan ongkir dan audit resi pengiriman JNE',
    permissions: [
      { key: 'menu_rekap_tagihan_jne', label: 'Menu Rekap Tagihan JNE', description: 'Akses halaman Rekap Tagihan & Resi JNE', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_ops_produksi',
    title: 'Produksi',
    badge: '🏭',
    description: 'Penerimaan barang hasil produksi / CMT',
    permissions: [
      { key: 'menu_ops_produksi', label: 'Menu Produksi', description: 'Akses halaman Produksi', isSuperadminOnly: false },
      { key: 'tab_ops_loading_produksi', label: 'Tab Penerimaan Produksi', description: 'Terima dari CMT', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_ops_loading',
    title: 'Loading Dock',
    badge: '🚚',
    description: 'Penerimaan & Pengiriman',
    permissions: [
      { key: 'menu_ops_loading_dock', label: 'Menu Loading Dock', description: 'Akses halaman Loading Dock', isSuperadminOnly: false },
      { key: 'tab_ops_loading_penerimaan', label: 'Tab Penerimaan', description: 'Penerimaan Store & Paket', isSuperadminOnly: false },
      { key: 'tab_ops_loading_pengiriman', label: 'Tab Pengiriman', description: 'Pengiriman Store & Paket', isSuperadminOnly: false },
      { key: 'tab_ops_loading_transfer_order', label: 'Tab Transfer Order', description: 'Transfer Order Distribusi Store', isSuperadminOnly: false },
    ]
  },
  {
    id: 'g_ops_mutasi',
    title: 'Scanner & Mutasi Log',
    badge: '🔄',
    description: 'Scanner dan log mutasi stok',
    permissions: [
      { key: 'menu_ops_mutasi', label: 'Menu Scanner & Log', description: 'Akses halaman scanner & log', isSuperadminOnly: false },
      { key: 'tab_ops_mutasi_scanner', label: 'Tab Scanner', description: 'Gunakan kamera/scanner', isSuperadminOnly: false },
      { key: 'tab_ops_mutasi_log', label: 'Tab Mutasi Log', description: 'Melihat histori in/out', isSuperadminOnly: false },
      { key: 'tab_ops_mutasi_so', label: 'Stock Opname (Pengaturan Sistem)', description: 'Lihat & adjust Stock Opname di Pengaturan Sistem (Khusus Superadmin)', isSuperadminOnly: true },
    ]
  },
  {
    id: 'g_ops_qc',
    title: 'Laporan QC',
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
      { key: 'menu_ops_cetak_barcode', label: 'Menu Cetak Barcode Produk', description: 'Akses cetak barcode thermal 50x20 mm', isSuperadminOnly: false },
      { key: 'menu_ops_bbk', label: 'Menu Form BBK', description: 'Akses formulir Bukti Bank Keluar', isSuperadminOnly: false },
      { key: 'menu_ops_trello', label: 'Menu Koleksi UP (Trello)', description: 'Akses susunan upload koleksi UP dan cetak A4', isSuperadminOnly: false },
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
      { key: 'action_cetak_barcode', label: 'Cetak Barcode Produk', description: 'Mencetak stiker thermal barcode 50x20 mm', isSuperadminOnly: false },
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
  All: { ...ALL_PERMISSIONS },
  Manager: {
    menu_ops_dashboard: true,
    menu_ops_live_chat: true,
    menu_ops_agenda: true,
    tab_ops_agenda_kalendar: true,
    tab_ops_agenda_project: true,
    menu_ops_pesanan_saya: true,
    tab_ops_pesanan_dashboard: true,
    tab_ops_pesanan_manual_shipment: true,
    tab_ops_pesanan_transfer_order: true,
    tab_ops_pesanan_shopee: true,
    tab_ops_pesanan_iglive: true,
    tab_ops_pesanan_tiktok: true,
    tab_ops_pesanan_website: true,
    tab_ops_pesanan_woocommerce: true,
    tab_ops_pesanan_lazada: true,
    menu_ops_resolusi: true,
    tab_ops_resolusi_retur: true,
    tab_ops_resolusi_refund: true,
    tab_ops_resolusi_gagal: true,
    tab_ops_resolusi_komplain: true,
    tab_ops_resolusi_rating: true,
    menu_ops_produksi: true,
    tab_ops_loading_produksi: true,
    menu_ops_loading_dock: true,
    tab_ops_loading_penerimaan: true,
    tab_ops_loading_pengiriman: true,
    tab_ops_loading_transfer_order: true,
    menu_ops_mutasi: true,
    tab_ops_mutasi_scanner: true,
    tab_ops_mutasi_log: true,
    tab_ops_mutasi_so: true,
    menu_ops_qc: true,
    tab_ops_qc_reject: true,
    tab_ops_qc_cuci: true,
    tab_ops_qc_permak: true,
    tab_ops_qc_defect: true,
    menu_ops_katalog_produk: true,
    action_upload_katalog: true,
    menu_ops_inventory: true,
    menu_ops_picking: true,
    menu_ops_peminjaman: true,
    menu_ops_roadmap: true,
    menu_ops_cetak_barcode: true,
    menu_ops_bbk: true,
    menu_hr_karyawan: true,
    menu_hr_presensi: true,
    menu_hr_roster: true,
    menu_hr_lembur_cuti: true,
    menu_hr_approval: true,
    action_cetak_label: true,
    action_cetak_barcode: true,
    action_export_data: true,
    action_import_data: true,
    action_sync_dealpos: true,
    action_edit_master: true,
  },
  Operator: {
    menu_ops_dashboard: true,
    menu_ops_live_chat: true,
    menu_ops_agenda: true,
    tab_ops_agenda_kalendar: true,
    tab_ops_agenda_project: true,
    menu_ops_pesanan_saya: true,
    tab_ops_pesanan_dashboard: true,
    tab_ops_pesanan_manual_shipment: true,
    tab_ops_pesanan_transfer_order: true,
    tab_ops_pesanan_shopee: true,
    tab_ops_pesanan_tiktok: true,
    tab_ops_pesanan_website: true,
    tab_ops_pesanan_woocommerce: true,
    tab_ops_pesanan_lazada: true,
    menu_ops_resolusi: true,
    tab_ops_resolusi_retur: true,
    tab_ops_resolusi_refund: true,
    tab_ops_resolusi_gagal: true,
    tab_ops_resolusi_komplain: true,
    menu_ops_produksi: true,
    tab_ops_loading_produksi: true,
    menu_ops_loading_dock: true,
    tab_ops_loading_penerimaan: true,
    tab_ops_loading_pengiriman: true,
    tab_ops_loading_transfer_order: true,
    menu_ops_mutasi: true,
    tab_ops_mutasi_scanner: true,
    tab_ops_mutasi_log: true,
    tab_ops_mutasi_so: true,
    menu_ops_qc: true,
    tab_ops_qc_reject: true,
    tab_ops_qc_cuci: true,
    tab_ops_qc_permak: true,
    tab_ops_qc_defect: true,
    menu_ops_inventory: true,
    menu_ops_picking: true,
    menu_ops_peminjaman: true,
    menu_ops_cetak_barcode: true,
    menu_ops_katalog_produk: true,
    menu_hr_presensi: true,
    menu_hr_roster: true,
    menu_hr_lembur_cuti: true,
    action_cetak_label: true,
    action_cetak_barcode: true,
    action_export_data: true,
    action_sync_dealpos: true,
  },
  Store: {
    menu_ops_live_chat: true,
    menu_ops_pesanan_saya: true,
    tab_ops_pesanan_dashboard: true,
    tab_ops_pesanan_manual_shipment: true,
    tab_ops_pesanan_transfer_order: true,
    tab_ops_pesanan_shopee: true,
    tab_ops_pesanan_tiktok: true,
    tab_ops_pesanan_lazada: true,
    tab_ops_pesanan_website: true,
    menu_ops_inventory: true,
    menu_ops_peminjaman: true,
    menu_ops_katalog_produk: true,
    action_cetak_label: true,
    action_cetak_barcode: true,
    action_export_data: true,
  },
  Peminjaman: {
    menu_ops_live_chat: true,
    menu_ops_peminjaman: true,
    menu_ops_inventory: true,
    menu_ops_katalog_produk: true,
    action_sync_dealpos: true,
    action_export_data: true,
  },
  'Tugas Picking': {
    menu_ops_live_chat: true,
    menu_ops_picking: true,
    menu_ops_inventory: true,
    action_cetak_label: true,
  },
  Produk: {
    menu_ops_live_chat: true,
    menu_ops_katalog_produk: true,
    action_upload_katalog: true,
    menu_ops_inventory: true,
    action_sync_dealpos: true,
  },
  Fulfillment: {
    menu_ops_live_chat: true,
    menu_ops_pesanan_saya: true,
    tab_ops_pesanan_dashboard: true,
    tab_ops_pesanan_manual_shipment: true,
    tab_ops_pesanan_transfer_order: true,
    menu_ops_picking: true,
    menu_ops_loading_dock: true,
    action_cetak_label: true,
    action_sync_dealpos: true,
  },
  HR: {
    menu_ops_live_chat: true,
    menu_hr_karyawan: true,
    menu_hr_presensi: true,
    menu_hr_roster: true,
    menu_hr_lembur_cuti: true,
    menu_hr_approval: true,
  },
  'HR & Admin': {
    menu_ops_live_chat: true,
    menu_hr_karyawan: true,
    menu_hr_presensi: true,
    menu_hr_roster: true,
    menu_hr_lembur_cuti: true,
    menu_hr_approval: true,
  },
  'QC/Repair': {
    menu_ops_live_chat: true,
    menu_ops_qc: true,
    tab_ops_qc_reject: true,
    tab_ops_qc_cuci: true,
    tab_ops_qc_permak: true,
    tab_ops_qc_defect: true,
  },
  Perbaikan: {
    menu_ops_live_chat: true,
    menu_ops_qc: true,
    tab_ops_qc_reject: true,
    tab_ops_qc_cuci: true,
    tab_ops_qc_permak: true,
    tab_ops_qc_defect: true,
  },
  'Scanner Barcode': {
    menu_ops_live_chat: true,
    menu_ops_mutasi: true,
    tab_ops_mutasi_scanner: true,
    menu_ops_cetak_barcode: true,
    action_cetak_barcode: true,
  },
  Inventory: {
    menu_ops_live_chat: true,
    menu_ops_inventory: true,
    action_sync_dealpos: true,
    action_export_data: true,
  },
  'Stock Opname': {
    menu_ops_live_chat: true,
    menu_ops_mutasi: true,
    tab_ops_mutasi_so: true,
    tab_ops_mutasi_scanner: true,
    tab_ops_mutasi_log: true,
  },
  Mutasi: {
    menu_ops_live_chat: true,
    menu_ops_mutasi: true,
    tab_ops_mutasi_scanner: true,
    tab_ops_mutasi_log: true,
  },
  'Customer Service': {
    menu_ops_live_chat: true,
    menu_ops_resolusi: true,
    tab_ops_resolusi_retur: true,
    tab_ops_resolusi_refund: true,
    tab_ops_resolusi_gagal: true,
    tab_ops_resolusi_komplain: true,
    tab_ops_resolusi_rating: true,
    menu_ops_pesanan_saya: true,
    tab_ops_pesanan_dashboard: true,
    tab_ops_pesanan_manual_shipment: true,
    tab_ops_pesanan_transfer_order: true,
    tab_ops_pesanan_shopee: true,
    tab_ops_pesanan_tiktok: true,
    tab_ops_pesanan_website: true,
    tab_ops_pesanan_woocommerce: true,
    tab_ops_pesanan_lazada: true,
    menu_ops_inventory: true,
    menu_ops_katalog_produk: true,
    action_cetak_label: true,
    action_export_data: true,
  },
};

export const INITIAL_ROLE_DETAILS: Record<string, { badge: string; icon: string; name: string }> = {
  Superadmin: { badge: 'bg-red-500', icon: '👑', name: 'Superadmin' },
  Manager: { badge: 'bg-purple-500', icon: '📊', name: 'Manager' },
  Operator: { badge: 'bg-blue-500', icon: '📦', name: 'Operator' },
  Store: { badge: 'bg-emerald-500', icon: '🏪', name: 'Store' },
  'Customer Service': { badge: 'bg-indigo-500', icon: '🎧', name: 'Customer Service' },
  'Tugas Picking': { badge: 'bg-amber-500', icon: '🛒', name: 'Tugas Picking' },
  Peminjaman: { badge: 'bg-indigo-500', icon: '📑', name: 'Peminjaman' },
  Produk: { badge: 'bg-pink-500', icon: '📖', name: 'Produk' },
  Fulfillment: { badge: 'bg-teal-500', icon: '🚚', name: 'Fulfillment' },
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

export const isStoreAccountSession = (session: UserSession | null): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return false;

  const user = String(session.username || '').trim().toLowerCase();
  const role = String(session.role || '').trim().toLowerCase();
  const div = String(session.divisi || '').trim().toLowerCase();
  const storeCode = String(session.store_code || '').trim();
  const storeName = String(session.store_name || '').trim();

  if (user.startsWith('choco') && user !== 'chocoadm') return true;
  if (role === 'store' || role === 'outlet' || role === 'toko') return true;
  if (div === 'store' || div === 'outlet' || div === 'toko') return true;
  if (storeCode || storeName) return true;

  return false;
};

export const resolveRoleDefaultPermissions = (
  sessionOrRole: UserSession | string | null | undefined
): Partial<UserPermissions> => {
  if (!sessionOrRole) return {};

  if (typeof sessionOrRole === 'object') {
    if (isSuperadmin(sessionOrRole)) return { ...ALL_PERMISSIONS };
    if (isStoreAccountSession(sessionOrRole)) {
      return ROLE_DEFAULT_PERMISSIONS['Store'] || INITIAL_ROLE_DEFAULT_PERMISSIONS['Store'] || {};
    }
  }

  const rawRole =
    typeof sessionOrRole === 'string'
      ? sessionOrRole
      : String(sessionOrRole.role || '').trim();

  if (rawRole && ROLE_DEFAULT_PERMISSIONS[rawRole]) {
    return ROLE_DEFAULT_PERMISSIONS[rawRole];
  }

  const lower = rawRole.toLowerCase();
  const matchedKey = Object.keys(ROLE_DEFAULT_PERMISSIONS).find(
    (k) => k.toLowerCase() === lower
  );
  if (matchedKey) {
    return ROLE_DEFAULT_PERMISSIONS[matchedKey];
  }

  if (lower.includes('store') || lower.includes('outlet') || lower.includes('toko')) {
    return ROLE_DEFAULT_PERMISSIONS['Store'] || {};
  }
  if (lower.includes('cs') || lower.includes('customer service') || lower.includes('resolusi')) {
    return ROLE_DEFAULT_PERMISSIONS['Customer Service'] || {};
  }
  if (lower.includes('peminjam') || lower.includes('sps')) {
    return ROLE_DEFAULT_PERMISSIONS['Peminjaman'] || {};
  }
  if (lower.includes('picking') || lower.includes('picker')) {
    return ROLE_DEFAULT_PERMISSIONS['Tugas Picking'] || {};
  }

  return ROLE_DEFAULT_PERMISSIONS['Operator'] || {};
};

export const hasPermission = (session: UserSession | null, permission: string): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;

  // Guard: Akun Store DILARANG memiliki permission Produksi, HR/Presensi, Picking Gudang, atau Pusat Resolusi
  if (isStoreAccountSession(session)) {
    const blockedForStore = new Set([
      'menu_ops_produksi',
      'tab_ops_loading_produksi',
      'menu_ops_picking',
      'menu_ops_loading_dock',
      'tab_ops_loading_penerimaan',
      'tab_ops_loading_pengiriman',
      'menu_ops_resolusi',
      'tab_ops_resolusi_retur',
      'menu_hr_karyawan',
      'menu_hr_presensi',
      'menu_hr_roster',
      'menu_hr_lembur_cuti',
      'menu_hr_approval',
      'tab_ops_mutasi_so',
    ]);
    if (blockedForStore.has(permission)) return false;
  }

  // 1. Explicit permission defined in user session object
  const userPerms = session.permissions;
  if (userPerms && typeof userPerms === 'object') {
    if (typeof userPerms[permission as keyof UserPermissions] === 'boolean') {
      return userPerms[permission as keyof UserPermissions]!;
    }
    // Jika objek permissions user sudah didefinisikan secara eksplisit di database (memiliki key),
    // JANGAN fallback ke Operator untuk key yang tidak dicentang agar role spesifik (SPS/CS/Store/Picker)
    // tidak bocor mendapat akses Produksi atau Presensi!
    const definedKeys = Object.keys(userPerms);
    if (definedKeys.length > 0) {
      if (permission === 'menu_ops_live_chat') return true;
      return false;
    }
  }

  // 2. Role template default fallback
  const roleDefaults = resolveRoleDefaultPermissions(session);
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
    case 'produksi': return hasPermission(session, 'menu_ops_produksi') || hasPermission(session, 'tab_ops_loading_produksi');
    case 'loading_dock': return hasPermission(session, 'menu_ops_loading_dock') || hasPermission(session, 'tab_ops_loading_penerimaan') || hasPermission(session, 'tab_ops_loading_pengiriman') || hasPermission(session, 'tab_ops_loading_transfer_order') || hasPermission(session, 'tab_ops_pesanan_transfer_order') || hasPermission(session, 'menu_ops_picking');
    case 'penerimaan_barang': return hasPermission(session, 'tab_ops_loading_penerimaan');
    case 'packing': return hasPermission(session, 'tab_ops_loading_pengiriman');
    case 'pengiriman': return hasPermission(session, 'tab_ops_loading_pengiriman');
    case 'agenda': return hasPermission(session, 'menu_ops_agenda') || hasPermission(session, 'tab_ops_agenda_kalendar') || hasPermission(session, 'tab_ops_agenda_project');
    case 'scanner': return hasPermission(session, 'tab_ops_mutasi_scanner');
    case 'penerimaan': return hasPermission(session, 'tab_ops_loading_produksi');
    case 'inventory': return hasPermission(session, 'menu_ops_inventory') || hasPermission(session, 'menu_ops_mutasi') || hasPermission(session, 'tab_ops_mutasi_scanner') || hasPermission(session, 'tab_ops_mutasi_log') || hasPermission(session, 'tab_ops_mutasi_so');
    case 'stock_opname': return hasPermission(session, 'tab_ops_mutasi_so');
    case 'mutasi_log': return hasPermission(session, 'tab_ops_mutasi_log');
    case 'operasi_stok': return hasPermission(session, 'menu_ops_mutasi') || hasPermission(session, 'tab_ops_mutasi_scanner') || hasPermission(session, 'tab_ops_mutasi_log') || hasPermission(session, 'tab_ops_mutasi_so');
    case 'picking_tasks': return hasPermission(session, 'menu_ops_picking') || hasPermission(session, 'menu_ops_loading_dock');
    case 'peminjaman': return hasPermission(session, 'menu_ops_peminjaman');
    case 'perbaikan': return hasPermission(session, 'menu_ops_qc') || hasPermission(session, 'tab_ops_qc_reject') || hasPermission(session, 'tab_ops_qc_cuci') || hasPermission(session, 'tab_ops_qc_permak') || hasPermission(session, 'tab_ops_qc_defect');
    case 'karyawan': return hasPermission(session, 'menu_hr_karyawan');
    case 'presensi': return hasPermission(session, 'menu_hr_presensi');
    case 'roster_shift': return hasPermission(session, 'menu_hr_roster');
    case 'lembur_cuti': return hasPermission(session, 'menu_hr_lembur_cuti');
    case 'hr_approval':
    case 'hr_rekap': return hasPermission(session, 'menu_hr_approval');
    case 'cetak_label':
    case 'cetak_barcode':
      return hasPermission(session, 'action_cetak_label') || hasPermission(session, 'menu_ops_cetak_barcode') || hasPermission(session, 'action_cetak_barcode') || hasPermission(session, 'menu_ops_inventory');
    case 'pesanan_saya': return hasPermission(session, 'menu_ops_pesanan_saya') || hasPermission(session, 'tab_ops_pesanan_dashboard') || hasPermission(session, 'tab_ops_pesanan_manual_shipment') || hasPermission(session, 'tab_ops_pesanan_transfer_order') || hasPermission(session, 'tab_ops_pesanan_shopee') || hasPermission(session, 'tab_ops_pesanan_tiktok') || hasPermission(session, 'tab_ops_pesanan_website') || hasPermission(session, 'tab_ops_pesanan_woocommerce') || hasPermission(session, 'tab_ops_pesanan_lazada');
    case 'manual_shipment': return hasPermission(session, 'tab_ops_pesanan_manual_shipment');
    case 'katalog_produk': return hasPermission(session, 'menu_ops_katalog_produk');
    case 'roadmap': return hasPermission(session, 'menu_ops_roadmap');
    case 'pusat_resolusi': return hasPermission(session, 'menu_ops_resolusi') || hasPermission(session, 'tab_ops_resolusi_retur') || hasPermission(session, 'tab_ops_resolusi_refund') || hasPermission(session, 'tab_ops_resolusi_gagal') || hasPermission(session, 'tab_ops_resolusi_komplain') || hasPermission(session, 'tab_ops_resolusi_rating');
    case 'trello_up': return isSuperadmin(session) || hasPermission(session, 'menu_ops_trello') || hasPermission(session, 'menu_ops_dashboard') || hasPermission(session, 'menu_ops_produksi');
    case 'rekap_tagihan_jne': return canAccessJneRekap(session);
    case 'live_chat': return canAccessLiveChat(session);
    case 'supabase_migration': return false;
    case 'pengaturan_sistem': return canAccessSettings(session);
    default:
      return false;
  }
};

export const canAccessSettings = (session: UserSession | null): boolean => {
  if (!session) return false;
  const user = String(session.username || '').trim().toLowerCase();
  const nik = String(session.nik || '').trim().toLowerCase();
  const email = String(session.email || '').trim().toLowerCase();

  // Superadmin yang berhak melihat & membuka pengaturan sistem HANYA akun @warehouse atau pemilik sistem
  return (
    user === 'warehouse' ||
    user === 'chocoadm' ||
    user === 'chocochips.warehouse2@gmail.com' ||
    email === 'chocochips.warehouse2@gmail.com' ||
    email.includes('warehouse2@gmail.com') ||
    nik === 'wh0001'
  );
};

export const canAccessLiveChat = (session: UserSession | null): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;
  if (session.permissions && session.permissions.menu_ops_live_chat === false) {
    return false;
  }
  return true;
};

export const canManageChatGroups = (session: UserSession | null): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;
  const role = String(session.role || '').toLowerCase();
  const uname = String(session.username || '').toLowerCase();
  if (role.includes('admin') || uname === 'warehouse') return true;
  return Boolean(session.permissions?.action_manage_chat_groups);
};

/**
 * Mengecek apakah user berhak mengakses fitur Asisten AI Pintar WMS (Google Gemini).
 * Default: Superadmin (akun pemilik/warehouse/admin) selalu punya akses.
 * User staf lain hanya bisa jika explicit diberi permission atau masuk dalam whitelist Superadmin.
 */
export const canAccessWmsAi = (session: UserSession | null): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;

  // 1. Cek permission explicit dari user session
  if (session.permissions && session.permissions.action_access_wms_ai === true) {
    return true;
  }

  // 2. Cek whitelist lokal wms_ai_allowed_users
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('wms_ai_allowed_users') : null;
    if (raw) {
      const allowed: string[] = JSON.parse(raw);
      if (Array.isArray(allowed)) {
        const u = String(session.username || '').trim().toLowerCase();
        const nik = String(session.nik || '').trim().toLowerCase();
        const email = String(session.email || '').trim().toLowerCase();
        if (allowed.some((item) => {
          const clean = String(item || '').trim().toLowerCase();
          return clean === u || clean === nik || clean === email;
        })) {
          return true;
        }
      }
    }
  } catch {}

  return false;
};

export const getDefaultPageForSession = (session: UserSession | null): ActivePage => {
  if (!session) return 'dashboard';
  if (isSuperadmin(session)) return 'dashboard';

  if (hasPermission(session, 'menu_ops_dashboard')) return 'dashboard';
  
  if (hasPermission(session, 'menu_ops_pesanan_saya') || hasPermission(session, 'tab_ops_pesanan_dashboard') || hasPermission(session, 'tab_ops_pesanan_manual_shipment') || hasPermission(session, 'tab_ops_pesanan_transfer_order') || hasPermission(session, 'tab_ops_pesanan_shopee') || hasPermission(session, 'tab_ops_pesanan_tiktok') || hasPermission(session, 'tab_ops_pesanan_website') || hasPermission(session, 'tab_ops_pesanan_woocommerce') || hasPermission(session, 'tab_ops_pesanan_lazada')) return 'pesanan_saya';
  
  if (hasPermission(session, 'menu_ops_loading_dock') || hasPermission(session, 'tab_ops_loading_produksi') || hasPermission(session, 'tab_ops_loading_penerimaan') || hasPermission(session, 'tab_ops_loading_pengiriman') || hasPermission(session, 'tab_ops_loading_transfer_order') || hasPermission(session, 'tab_ops_pesanan_transfer_order') || hasPermission(session, 'menu_ops_picking')) return 'loading_dock';
  
  if (hasPermission(session, 'menu_ops_inventory') || hasPermission(session, 'menu_ops_mutasi') || hasPermission(session, 'tab_ops_mutasi_scanner') || hasPermission(session, 'tab_ops_mutasi_log') || hasPermission(session, 'tab_ops_mutasi_so')) return 'inventory';
  
  if (hasPermission(session, 'menu_ops_peminjaman')) return 'peminjaman';
  
  if (hasPermission(session, 'menu_ops_qc') || hasPermission(session, 'tab_ops_qc_reject') || hasPermission(session, 'tab_ops_qc_cuci') || hasPermission(session, 'tab_ops_qc_permak') || hasPermission(session, 'tab_ops_qc_defect')) return 'perbaikan';
  
  if (hasPermission(session, 'menu_ops_katalog_produk')) return 'katalog_produk';
  if (hasPermission(session, 'menu_hr_presensi')) return 'presensi';
  if (hasPermission(session, 'menu_hr_approval')) return 'hr_approval';
  
  if (hasPermission(session, 'menu_ops_resolusi') || hasPermission(session, 'tab_ops_resolusi_retur') || hasPermission(session, 'tab_ops_resolusi_refund') || hasPermission(session, 'tab_ops_resolusi_gagal') || hasPermission(session, 'tab_ops_resolusi_komplain') || hasPermission(session, 'tab_ops_resolusi_rating')) return 'pusat_resolusi';

  return 'dashboard';
};

// Aliases for specific component checks
export const canProduksi = (session: UserSession | null) =>
  hasPermission(session, 'menu_ops_produksi') || hasPermission(session, 'tab_ops_loading_produksi') || isSuperadmin(session);
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

/**
 * ============================================================================
 * MATRIKS FILTER NOTIFIKASI PER ROLE / USER (STRICT TARGETING)
 * ============================================================================
 * 1. Akun Store: HANYA Pesanan / Manual Shipment / Alter milik tokonya & Live Chat.
 * 2. Akun Karyawan / Picker: Tugas Picking, pengajuan Ijin/Cuti/Lembur MILIK DIRINYA
 *    SENDIRI (hanya jika punya akses Presensi/Lembur & Cuti), & Live Chat.
 * 3. Akun Spesifik (SPS, CS, Produksi, dll.): Murni sesuai role akses halaman yang dimiliki.
 * 4. Akun Admin (non-warehouse): Operasional lengkap, TANPA notif Ijin/Cuti/Lembur!
 * 5. Akun Warehouse: Seluruh notifikasi operasional + Approval HR (Ijin/Cuti/Lembur).
 */

/** 1. Notifikasi Pesanan Baru (Manual Shipment, Form Alter, Tiket Retur Baru, Antrian SO): HANYA Admin & Warehouse */
export const canReceiveAdminOrderNotif = (session: UserSession | null): boolean => {
  return isSuperadmin(session);
};

/** 2. Apakah session ini adalah akun khusus Peminjam (SPS) saja (bukan Admin/Warehouse/Picker/Operator Gudang) */
export const isPeminjamOnlySession = (session: UserSession | null): boolean => {
  if (!session || isSuperadmin(session) || isStoreAccountSession(session)) return false;
  const role = String(session.role || '').trim().toLowerCase();
  const uname = String(session.username || '').trim().toLowerCase();
  if (role === 'peminjaman' || uname.startsWith('sps') || uname.includes('peminjam')) {
    return true;
  }
  // Jika hanya punya akses menu_ops_peminjaman tanpa menu_ops_picking / mutasi / loading_dock
  if (
    hasPermission(session, 'menu_ops_peminjaman') &&
    !hasPermission(session, 'menu_ops_picking') &&
    !hasPermission(session, 'menu_ops_mutasi') &&
    !hasPermission(session, 'menu_ops_loading_dock')
  ) {
    return true;
  }
  return false;
};

/** 3. Apakah session ini adalah Customer Service (CS) */
export const isCustomerServiceSession = (session: UserSession | null): boolean => {
  if (!session || isSuperadmin(session) || isStoreAccountSession(session)) return false;
  const role = String(session.role || '').trim().toLowerCase();
  const uname = String(session.username || '').trim().toLowerCase();
  if (
    role === 'customer service' ||
    role.includes('customer service') ||
    role === 'cs' ||
    uname === 'cs' ||
    uname.startsWith('cs_') ||
    uname.startsWith('cs-')
  ) {
    return true;
  }
  // User non-admin & non-store yang diberi akses menu Pusat Resolusi / Retur tanpa akses picking/produksi
  if (
    !isPeminjamOnlySession(session) &&
    !hasPermission(session, 'menu_ops_picking') &&
    !hasPermission(session, 'menu_ops_produksi') &&
    (hasPermission(session, 'menu_ops_resolusi') || hasPermission(session, 'tab_ops_resolusi_retur'))
  ) {
    return true;
  }
  return false;
};

/** 4. Notifikasi Tugas Picking & Permintaan SPS Baru ke Gudang: HANYA Admin, Warehouse, Picker, dan Operator Gudang yang punya akses Picking */
export const canReceivePickingAndSpsNotif = (session: UserSession | null): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;

  // Store, CS, dan Peminjam-Only DILARANG menerima notifikasi Tugas Picking / SPS Gudang
  if (
    isStoreAccountSession(session) ||
    isPeminjamOnlySession(session) ||
    isCustomerServiceSession(session)
  ) {
    return false;
  }

  const role = String(session.role || '').trim().toLowerCase();
  if (
    role === 'store' ||
    role === 'peminjaman' ||
    role === 'customer service' ||
    role === 'cs' ||
    role === 'hr' ||
    role === 'produk' ||
    role === 'qc/repair' ||
    role === 'perbaikan' ||
    role === 'viewer'
  ) {
    return false;
  }

  return (
    hasPermission(session, 'menu_ops_picking') ||
    hasPermission(session, 'menu_ops_loading_dock') ||
    role === 'tugas picking' ||
    role === 'picker' ||
    role === 'fulfillment'
  );
};

/** 5. Notifikasi Tugas Hitung Ulang Fisik (Recount Kargo/CMT): HANYA Admin, Warehouse, dan akun yang punya akses halaman Produksi */
export const canReceiveRecountNotif = (session: UserSession | null): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;

  // Store, CS, Peminjam, Picker murni, dan HR DILARANG KERAS menerima notifikasi Hitung Ulang Kargo/Produksi
  if (
    isStoreAccountSession(session) ||
    isCustomerServiceSession(session) ||
    isPeminjamOnlySession(session)
  ) {
    return false;
  }

  const role = String(session.role || '').trim().toLowerCase();
  if (
    role === 'store' ||
    role === 'peminjaman' ||
    role === 'customer service' ||
    role === 'cs' ||
    role === 'tugas picking' ||
    role === 'picker' ||
    role === 'hr' ||
    role === 'produk' ||
    role === 'qc/repair' ||
    role === 'perbaikan'
  ) {
    return false;
  }

  // Jika user memiliki custom permissions eksplisit, wajib punya menu_ops_produksi / tab_ops_loading_produksi
  if (session.permissions && Object.keys(session.permissions).length > 0) {
    return Boolean(
      session.permissions.menu_ops_produksi || session.permissions.tab_ops_loading_produksi
    );
  }

  return role === 'produksi' || role === 'manager';
};

/**
 * 6. Apakah user berhak menerima notifikasi Ijin / Cuti / Lembur MILIK DIRINYA SENDIRI:
 *    - Admin (non-warehouse) TIDAK PERLU notif ijin/cuti/lembur.
 *    - Store, CS, Peminjam, atau user yang TIDAK punya akses Presensi / Lembur & Cuti DILARANG menerima notif ijin/cuti/lembur.
 *    - Hanya karyawan yang memiliki akses halaman Presensi atau Lembur & Cuti yang boleh menerima notif pengajuan miliknya sendiri.
 */
export const canReceiveEmployeeOwnHrNotif = (session: UserSession | null): boolean => {
  if (!session) return false;
  // Admin & Warehouse tidak menggunakan jalur notifikasi karyawan ini (Warehouse punya jalur HR Approval sendiri, Admin tidak perlu notif HR)
  if (isSuperadmin(session)) return false;
  if (isStoreAccountSession(session)) return false;
  if (isCustomerServiceSession(session)) return false;
  if (isPeminjamOnlySession(session)) return false;

  return (
    hasPermission(session, 'menu_hr_presensi') ||
    hasPermission(session, 'menu_hr_lembur_cuti')
  );
};

/** 7. Cek apakah record HR (Lembur / Ijin / Cuti / Pulang Cepat) benar-benar milik karyawan yang sedang login */
export const isEmployeeMatchingRecord = (
  session: UserSession | null,
  record: { nik?: string | null; nama?: string | null; username?: string | null }
): boolean => {
  if (!session || !record) return false;
  if (!canReceiveEmployeeOwnHrNotif(session)) return false;

  const myNik = String(session.nik || '').trim().toLowerCase();
  const myName = String(session.name || '').trim().toLowerCase();
  const myUser = String(session.username || '').trim().toLowerCase();

  const recNik = String(record.nik || '').trim().toLowerCase();
  const recName = String(record.nama || '').trim().toLowerCase();
  const recUser = String(record.username || '').trim().toLowerCase();

  if (myNik && recNik && myNik === recNik) return true;
  if (myUser && recUser && myUser === recUser) return true;
  if (myName && recName && myName.length >= 3 && myName === recName) return true;
  return false;
};

/** 8. Cek apakah record Pesanan / Manual Shipment / Alter milik Store yang sedang login */
export const isStoreMatchingOrderRecord = (
  session: UserSession | null,
  record: {
    nama_pengirim?: string | null;
    store_name?: string | null;
    pic_store?: string | null;
    submitted_by?: string | null;
  }
): boolean => {
  if (!session || !record) return false;
  if (!isStoreAccountSession(session)) return false;

  const sender = String(record.nama_pengirim || record.store_name || '').trim().toLowerCase();
  const submittedBy = String(record.submitted_by || record.pic_store || '').trim().toLowerCase();

  const myStoreName = String(session.store_name || '').trim().toLowerCase();
  const myStoreCode = String(session.store_code || '').trim().toLowerCase();
  const myName = String(session.name || '').trim().toLowerCase();
  const myUser = String(session.username || '').trim().toLowerCase();

  if (myStoreName && sender && (sender.includes(myStoreName) || myStoreName.includes(sender))) return true;
  if (myStoreCode && sender && sender.includes(myStoreCode)) return true;
  if (myName && sender && (sender.includes(myName) || myName.includes(sender))) return true;
  if (myUser && submittedBy && submittedBy === myUser) return true;
  if (myUser.startsWith('choco') && myUser.length > 5) {
    const suffix = myUser.replace(/^choco[\s_-]*/, '').trim();
    if (suffix.length >= 3 && sender.includes(suffix)) return true;
  }

  return false;
};

/**
 * 9. CENTRAL NOTIFICATION GATEKEEPER:
 *    Menentukan apakah suatu notifikasi (berdasarkan kategori & target halaman)
 *    BOLEH ditampilkan / disimpan ke Notification Hub untuk user yang sedang login.
 */
export const canSessionReceiveNotification = (
  session: UserSession | null,
  category: string,
  target?: {
    page?: string;
    subTab?: string;
    roomId?: string;
    tag?: string;
  }
): boolean => {
  if (!session) return false;

  const cat = String(category || '').toLowerCase();
  const page = String(target?.page || '').toLowerCase();
  const tag = String(target?.tag || '').toLowerCase();

  // A. ATURAN KHUSUS AKUN STORE:
  // Hanya boleh menerima notifikasi seputar Pesanan / Manual Shipment / Alter dan Live Chat!
  if (isStoreAccountSession(session)) {
    if (cat === 'chat' || page === 'live_chat' || Boolean(target?.roomId)) {
      return canAccessLiveChat(session);
    }
    if (cat === 'pesanan' || page === 'pesanan_saya' || page === 'manual_shipment' || target?.subTab === 'manual_shipment') {
      return true;
    }
    return false;
  }

  // B. ATURAN KHUSUS NOTIFIKASI HR (IJIN / CUTI / LEMBUR / PULANG CEPAT):
  // - Admin (non-warehouse) TIDAK PERLU notif ijin/cuti/lembur!
  // - Pengajuan baru dari karyawan lain (page === 'hr_approval' atau tag 'hr-lembur-', 'hr-cuti-', 'hr-ipa-') HANYA untuk akun `warehouse`!
  // - Status/submit milik karyawan sendiri (page === 'lembur_cuti' / 'presensi') HANYA untuk karyawan yang punya akses Presensi / Lembur & Cuti!
  if (
    cat === 'hr' ||
    page === 'hr_approval' ||
    page === 'lembur_cuti' ||
    page === 'presensi' ||
    tag.startsWith('hr-')
  ) {
    if (page === 'hr_approval' || tag.startsWith('hr-lembur-') || tag.startsWith('hr-cuti-') || tag.startsWith('hr-ipa-')) {
      return isWarehouseAccountOnly(session);
    }
    if (isWarehouseAccountOnly(session)) {
      return true;
    }
    // Admin (selain warehouse) tidak perlu notif ijin/cuti/lembur
    if (isSuperadmin(session)) {
      return false;
    }
    return canReceiveEmployeeOwnHrNotif(session);
  }

  // C. ATURAN KHUSUS PRODUKSI / HITUNG ULANG KARGO & CMT:
  if (cat === 'produksi' || page === 'produksi' || tag.startsWith('recount-')) {
    return canReceiveRecountNotif(session);
  }

  // D. ATURAN KHUSUS TUGAS PICKING:
  if (cat === 'picking' || page === 'picking_tasks' || target?.subTab === 'picking_tasks' || tag.startsWith('picking-task-')) {
    return canReceivePickingAndSpsNotif(session);
  }

  // E. ATURAN KHUSUS PEMINJAMAN (SPS):
  if (cat === 'sps' || page === 'peminjaman' || tag.startsWith('sps-')) {
    if (tag.startsWith('sps-new-')) {
      return canReceivePickingAndSpsNotif(session);
    }
    return canReceivePickingAndSpsNotif(session) || hasPermission(session, 'menu_ops_peminjaman');
  }

  // F. ATURAN KHUSUS PUSAT RESOLUSI / RETUR BARANG:
  if (cat === 'retur' || page === 'pusat_resolusi' || tag.startsWith('retur-')) {
    if (tag.startsWith('retur-new-')) {
      return canReceiveAdminOrderNotif(session);
    }
    return isSuperadmin(session) || isCustomerServiceSession(session) || canAccessPage(session, 'pusat_resolusi');
  }

  // G. ATURAN KHUSUS PESANAN STORE (MANUAL SHIPMENT / ALTER):
  if (cat === 'pesanan' || page === 'pesanan_saya' || page === 'manual_shipment' || tag.startsWith('manual-shipment-') || tag.startsWith('resi-update-')) {
    if (tag.startsWith('manual-shipment-')) {
      return canReceiveAdminOrderNotif(session);
    }
    return isSuperadmin(session) || isStoreAccountSession(session) || canAccessPage(session, 'pesanan_saya');
  }

  // H. ATURAN KHUSUS STOCK OPNAME (#SO):
  if (cat === 'so' || page === 'stock_opname' || tag.startsWith('so-')) {
    return canReceiveAdminOrderNotif(session) || canAccessPage(session, 'stock_opname');
  }

  // I. ATURAN LIVE CHAT:
  if (cat === 'chat' || page === 'live_chat' || Boolean(target?.roomId)) {
    return canAccessLiveChat(session);
  }

  // J. ATURAN KHUSUS UPDATE DATABASE MASTER & PENGATURAN SISTEM:
  // Hanya untuk akun utama `warehouse` yang memiliki akses ke fitur Update Database!
  if (tag.startsWith('update-db-') || page === 'pengaturan_sistem') {
    return isWarehouseAccountOnly(session);
  }

  return true;
};

export const canAccessUpdateDatabase = (session: UserSession | null): boolean =>
  isWarehouseAccountOnly(session);

export const canKatalogProduk = (session: UserSession | null) =>
  hasPermission(session, 'menu_ops_katalog_produk') || isSuperadmin(session);
export const canManageKatalogProduk = (session: UserSession | null) =>
  hasPermission(session, 'action_upload_katalog') || hasPermission(session, 'action_edit_master') || isSuperadmin(session);

export const canAccessJneRekap = (session: UserSession | null): boolean => {
  if (!session) return false;
  if (isSuperadmin(session)) return true;
  const user = String(session.username || '').trim().toLowerCase();
  if (['chocoadm', 'admin', 'warehouse', 'admin2'].includes(user)) return true;
  return hasPermission(session, 'menu_rekap_tagihan_jne');
};

export const TOTAL_PERMISSIONS_COUNT = PERMISSION_GROUPS.reduce(
  (acc, g) => acc + g.permissions.length,
  0
);

export const countGrantedPermissions = (perms: Partial<UserPermissions> | undefined | null) => {
  if (!perms || typeof perms !== 'object') return 0;
  const validKeys = new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)));
  return Object.entries(perms).filter(([key, value]) => validKeys.has(key) && value).length;
};
