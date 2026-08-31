const url = 'https://filgijcfhgqlirzhvwho.supabase.co';
const key = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';

fetch(`${url}/rest/v1/peminjaman?select=*&order=created_at.desc&limit=5`, {
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`
  }
}).then(res => res.text()).then(console.log).catch(console.error);
