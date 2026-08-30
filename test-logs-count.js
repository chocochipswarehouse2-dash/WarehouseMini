async function test() {
  const url = 'https://filgijcfhgqlirzhvwho.supabase.co';
  const key = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';
  let offset = 0;
  while(offset < 10000) {
    const endpoint = `${url}/rest/v1/log_produk?select=id&limit=1000&offset=${offset}`;
    try {
      const res = await fetch(endpoint, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      });
      const data = await res.json();
      console.log("Got logs:", data.length);
      if (data.length === 0) break;
      offset += data.length;
    } catch (e) {
      console.error(e);
      break;
    }
  }
}
test();
