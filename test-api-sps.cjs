const fs = require('fs');

async function test() {
  const content = fs.readFileSync('src/services/supabase.ts', 'utf8');
  const urlMatch = content.match(/DEFAULT_SUPABASE_URL = '(.*?)'/);
  const keyMatch = content.match(/DEFAULT_SUPABASE_ANON_KEY = '(.*?)'/);
  const url = urlMatch[1];
  const key = keyMatch[1];

  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  };

  const res = await fetch(`${url}/rest/v1/tugas_picking?no_sj=in.(SPS-078810,SPS-075120)`, { headers });
  const data = await res.json();
  console.log('tugas_picking matched:', data);

  const res2 = await fetch(`${url}/rest/v1/transfer_order?no_sj=in.(SPS-078810,SPS-075120)`, { headers });
  const data2 = await res2.json();
  console.log('transfer_order matched:', data2);
  
  const res3 = await fetch(`${url}/rest/v1/peminjaman?no_peminjaman=in.(SPS-078810,SPS-075120)`, { headers });
  const data3 = await res3.json();
  console.log('peminjaman matched:', data3);
}
test();
