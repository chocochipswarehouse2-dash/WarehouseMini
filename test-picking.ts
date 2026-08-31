import { supabaseFetch } from './src/services/supabase.js';

global.localStorage = {
  getItem: () => null,
  setItem: () => null
};

async function run() {
    try {
        const noSps = `SPS-${Date.now().toString().slice(-6)}`;
        const pickingTasks = [{
            no_sj: noSps,
            tanggal: new Date().toISOString().split('T')[0],
            tujuan: `SPS: Test - Keperluan`,
            sku: 'F26HTN798LA',
            nama_produk: 'Olinda Top Latte',
            qty_req: 1,
            qty_picked: 0,
            lokasi: 'BLOK F',
            status: 'PENDING',
            created_at: new Date().toISOString()
        }];
        const res = await supabaseFetch('picking_list', 'POST', pickingTasks);
        console.log("Success", res);
    } catch(err) {
        console.error("Error:", err.message);
    }
}
run();
