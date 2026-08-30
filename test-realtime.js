async function test() {
  const url = 'https://filgijcfhgqlirzhvwho.supabase.co';
  const key = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';
  const endpoint = `${url}/rest/v1/view_stok_realtime?select=*&sisa_stok=neq.0&limit=1000&offset=0`;
  try {
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    console.log(res.status, await res.text());
  } catch (e) {
    console.error(e);
  }
}
test();
