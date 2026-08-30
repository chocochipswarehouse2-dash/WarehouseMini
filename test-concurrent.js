import fs from 'fs';
async function test() {
  const url = 'https://filgijcfhgqlirzhvwho.supabase.co';
  const key = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';
  const batchPromises = [];
  for(let i=0; i<5; i++) {
    batchPromises.push(fetch(`${url}/rest/v1/view_stok_realtime?select=*&limit=1000&offset=${i*1000}`, {
         headers: { apikey: key, Authorization: `Bearer ${key}` }
       }).then(r => r.status));
  }
  const res = await Promise.all(batchPromises);
  console.log(res);
}
test();
