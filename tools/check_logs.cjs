const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
if (!fs.existsSync(envPath)) {
  const envPath2 = path.resolve(__dirname, '../../.env'); // if tools is in subfolder? No, it's just .env
}
const envContent = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8');
const supabaseUrl = envContent.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('log_produk')
    .select('*')
    .eq('sku', 'C25CBH240BA');
    
  if (error) console.error(error);
  else console.table(data);
}
check();
