const U = 'https://ilhqerecxbywqrhfpbbc.supabase.co/rest/v1/';
const K = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const H = { apikey: K, Authorization: 'Bearer ' + K };

const g = async (p) => {
  const r = await fetch(U + p, { headers: H });
  return await r.json();
};

(async () => {
  const stock = await g('stok_real_fisik?select=sku,lokasi,area,sisa_stok&sku=eq.C25CBH240BA');
  console.log('stok_real_fisik:', stock);
  const logs = await g('log_produk?select=type,qty,lokasi,area,invoice,created_at&sku=eq.C25CBH240BA&lokasi=eq.STUDIO');
  console.log('log_produk:', logs);
})();
