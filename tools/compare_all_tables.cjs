const { createClient } = require('@supabase/supabase-js');

const OLD_URL = 'https://vxongwtxmhjixhzeoidp.supabase.co';
const OLD_KEY = 'sb_publishable_XFvjJipUzyi0EuM_tDTTsg_ll7TJ7rA';

const NEW_URL = 'https://atdedxyiielpmzjlnriv.supabase.co';
const NEW_KEY = 'sb_publishable_ZoVorqMTbLr9Fj3jif5M3Q_lnuzi0bb';

const oldClient = createClient(OLD_URL, OLD_KEY);
const newClient = createClient(NEW_URL, NEW_KEY);

const tables = [
  'wms_users',
  'master_produk',
  'log_produk',
  'stock_opname_queue',
  'penerimaan_produksi',
  'picking_list',
  'peminjaman',
  'perbaikan_tickets',
  'qc_reports',
  'manual_shipment',
  'pengecekan_sj',
  'address_book',
  'karyawan',
  'master_shift',
  'roster_shift',
  'presensi',
  'lembur',
  'perijinan_cuti',
  'wms_projects',
  'wms_agenda',
  'wms_roadmap',
  'wms_system_docs',
  'outlet_config',
  'wms_settings'
];

async function compareTables() {
  console.log('| Tabel | Lama | Baru | Selisih |');
  console.log('|---|---|---|---|');
  for (const t of tables) {
    let oldCount = '-';
    let newCount = '-';
    try {
      const { count } = await oldClient.from(t).select('*', { count: 'exact', head: true });
      oldCount = count !== null ? count : '-';
    } catch (e) {}

    try {
      const { count } = await newClient.from(t).select('*', { count: 'exact', head: true });
      newCount = count !== null ? count : '-';
    } catch (e) {}

    const diff = (typeof oldCount === 'number' && typeof newCount === 'number') ? (oldCount - newCount) : '-';
    console.log(`| ${t} | ${oldCount} | ${newCount} | ${diff} |`);
  }
}

compareTables();
