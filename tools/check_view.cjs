const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const supabaseUrl = envContent.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.rpc('get_view_definition', { view_name: 'stok_real_fisik' });
  if (error) {
     console.error('Try alternative way', error);
  } else {
     console.log(data);
  }
}
check();
