const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://atdedxyiielpmzjlnriv.supabase.co', 'sb_publishable_ZoVorqMTbLr9Fj3jif5M3Q_lnuzi0bb');

async function run() {
  const { data: viewData, error: viewErr } = await supabase
    .from('stok_real_fisik')
    .select('*')
    .limit(5);
    
  console.log('stok_real_fisik:', viewData, viewErr);
  
  const { data: mpData, error: mpErr } = await supabase
    .from('master_produk')
    .select('sku, dealpos_channels')
    .limit(5);
    
  console.log('master_produk:', mpData, mpErr);
}

run();
