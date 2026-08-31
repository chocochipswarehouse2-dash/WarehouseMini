const url = 'https://filgijcfhgqlirzhvwho.supabase.co';
const key = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';

fetch(`${url}/rest/v1/peminjaman_item?select=*&limit=1`, {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
}).then(res => res.text()).then(console.log).catch(console.error);
