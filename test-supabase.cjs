require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('master_produk')
    .select('*')
    .ilike('nama_produk', '%Darlene%');
    
  console.log("master_produk matches:", data?.length);
  console.log(data);
}
run();
