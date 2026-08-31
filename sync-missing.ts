import { supabaseFetch } from './src/services/supabase.js';

global.localStorage = { getItem: () => null, setItem: () => null };

async function run() {
  const peminjamans = await supabaseFetch('peminjaman', 'GET', null, 'select=*&order=created_at.desc&limit=50');
  const pickings = await supabaseFetch('picking_list', 'GET', null, 'select=no_sj,sku&limit=1000');
  
  const existingSet = new Set(pickings.map(p => `${p.no_sj}_${p.sku}`));
  const toInsert = [];
  
  for (const p of peminjamans) {
    if (!existingSet.has(`${p.no_peminjaman}_${p.sku}`)) {
      toInsert.push({
        no_sj: p.no_peminjaman,
        tanggal: p.tanggal_pinjam,
        tujuan: `SPS: ${p.pic} - ${p.keperluan}`,
        sku: p.sku,
        nama_produk: p.nama_produk,
        qty_req: p.qty,
        qty_picked: 0,
        lokasi: p.lokasi,
        status: 'PENDING',
        picker_name: '',
        created_at: p.created_at || new Date().toISOString()
      });
      existingSet.add(`${p.no_peminjaman}_${p.sku}`);
    }
  }
  
  if (toInsert.length > 0) {
    console.log(`Inserting ${toInsert.length} missing items...`);
    const res = await supabaseFetch('picking_list', 'POST', toInsert);
    console.log(res);
  } else {
    console.log("No missing items.");
  }
}
run();
