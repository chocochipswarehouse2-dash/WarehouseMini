async function test() {
  const url = 'https://filgijcfhgqlirzhvwho.supabase.co';
  const key = 'sb_publishable_L4FEkugwRKqcwFzLXfpZag_aByUy5mD';
  const endpoint = `${url}/rest/v1/view_stok_realtime?select=*&limit=10000`;
  try {
    const res = await fetch(endpoint, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    const data = await res.json();
    console.log("Requested limit=10000, Got:", data.length);
  } catch (e) {
    console.error(e);
  }
}
test();
