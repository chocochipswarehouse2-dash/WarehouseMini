import fs from 'fs';
async function test() {
  const url = 'https://filgijcfhgqlirzhvwho.supabase.co';
  const key = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';
  let offset = 0;
  let hasError = false;
  while(offset < 15000) {
     const endpoint = `${url}/rest/v1/view_stok_realtime?select=*&limit=1000&offset=${offset}`;
     try {
       console.log("fetching", offset);
       const res = await fetch(endpoint, {
         headers: { apikey: key, Authorization: `Bearer ${key}` }
       });
       if (!res.ok) throw new Error(await res.text());
       const data = await res.json();
       console.log("Got", data.length);
       if (data.length === 0) break;
       offset += data.length;
     } catch (e) {
       console.error(e);
       hasError = true;
       break;
     }
  }
}
test();
