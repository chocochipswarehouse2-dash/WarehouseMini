async function test() {
  const url = 'https://filgijcfhgqlirzhvwho.supabase.co';
  const key = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';
  const endpoint = `${url}/rest/v1/log_produk?select=*&order=created_at.desc&limit=100&offset=0`;
  try {
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    console.log(res.status, (await res.text()).substring(0, 500));
  } catch (e) {
    console.error(e);
  }
}
test();
