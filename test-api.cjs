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

  const res = await fetch(`${url}/rest/v1/peminjaman?select=*&limit=1`, { headers });
  const data = await res.json();
  console.log('Peminjaman rows:', data.length);
  if (data.length > 0) {
     console.log('First peminjaman:', data[0]);
     
     // try delete
     const delRes = await fetch(`${url}/rest/v1/peminjaman?no_peminjaman=eq.${data[0].no_peminjaman}`, { method: 'DELETE', headers });
     console.log('Delete status:', delRes.status);
     const delText = await delRes.text();
     console.log('Delete resp:', delText);
  }
}
test();
