const fs = require('fs');

const filePath = 'src/services/permissions.ts';
let content = fs.readFileSync(filePath, 'utf8');

const newCanAccessPage = `export const canAccessPage = (session: UserSession | null, page: ActivePage): boolean => {
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
};`;

const newGetDefaultPage = `export const getDefaultPageForSession = (session: UserSession | null): ActivePage => {
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
};`;

content = content.replace(/export const canAccessPage = \([\s\S]*?return false;\n  }\n};/, newCanAccessPage);
content = content.replace(/export const getDefaultPageForSession = \([\s\S]*?return 'dashboard';\n};/, newGetDefaultPage);

fs.writeFileSync(filePath, content);
