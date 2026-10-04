const U = 'https://ilhqerecxbywqrhfpbbc.supabase.co/rest/v1/';
const K = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const H = { apikey: K, Authorization: 'Bearer ' + K, 'Content-Type': 'application/json' };

const g = async (p, method='GET', body=null) => {
  const r = await fetch(U + p, { headers: H, method, body: body ? JSON.stringify(body) : null });
  return await r.json();
};

(async () => {
  // Use RPC if possible, or maybe there's another way. Wait, we can't query pg_class via PostgREST unless exposed.
  // Instead, let's see if there is any script that defines the schema.
  console.log("Fetching data to see if we can infer anything...");
})();
