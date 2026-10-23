const U = 'https://ilhqerecxbywqrhfpbbc.supabase.co/rest/v1/';
const K = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const H = {
  apikey: K,
  Authorization: 'Bearer ' + K,
  'Content-Type': 'application/json',
  Prefer: 'return=representation'
};

const migrations = [
  { typo: 'CO43', target: 'C043', area: 'Warehouse' },
  { typo: 'CO38', target: 'C038', area: 'Warehouse' },
  { typo: 'ROO5', target: 'R005', area: 'Kolian' }
];

async function run() {
  console.log('--- Memulai Migrasi Normalisasi Typo Huruf O di Supabase ---');

  for (const m of migrations) {
    console.log(`\nProcessing ${m.typo} -> ${m.target} (${m.area})...`);

    // 1. Update log_produk
    const logRes = await fetch(`${U}log_produk?lokasi=eq.${m.typo}`, {
      method: 'PATCH',
      headers: H,
      body: JSON.stringify({
        lokasi: m.target,
        area: m.area
      })
    });
    const updatedLogs = await logRes.json();
    console.log(`Updated ${Array.isArray(updatedLogs) ? updatedLogs.length : 0} logs for ${m.typo} -> ${m.target}`);

    // 2. Query stok_real_fisik for the typo location
    const typoStockRes = await fetch(`${U}stok_real_fisik?lokasi=eq.${m.typo}`, { headers: H });
    const typoStocks = await typoStockRes.json();
    console.log(`Found ${typoStocks.length} rows in stok_real_fisik for ${m.typo}`);

    for (const row of typoStocks) {
      // Check if target rack already has a record for this SKU
      const targetStockRes = await fetch(`${U}stok_real_fisik?lokasi=eq.${m.target}&sku=eq.${encodeURIComponent(row.sku)}`, { headers: H });
      const targetStocks = await targetStockRes.json();

      if (targetStocks && targetStocks.length > 0) {
        const existing = targetStocks[0];
        const combinedQty = (existing.sisa_stok || 0) + (row.sisa_stok || 0);
        console.log(`  Merging SKU ${row.sku}: existing ${existing.sisa_stok} + typo ${row.sisa_stok} = ${combinedQty}`);

        // Update target row
        await fetch(`${U}stok_real_fisik?lokasi=eq.${m.target}&sku=eq.${encodeURIComponent(row.sku)}`, {
          method: 'PATCH',
          headers: H,
          body: JSON.stringify({
            sisa_stok: combinedQty,
            area: m.area,
            updated_at: new Date().toISOString()
          })
        });

        // Delete typo row
        await fetch(`${U}stok_real_fisik?lokasi=eq.${m.typo}&sku=eq.${encodeURIComponent(row.sku)}`, {
          method: 'DELETE',
          headers: H
        });
        console.log(`  Deleted typo row for SKU ${row.sku} on ${m.typo}`);
      } else {
        console.log(`  Updating SKU ${row.sku} directly from ${m.typo} to ${m.target}`);
        // Simply update the typo row to the target location and area
        await fetch(`${U}stok_real_fisik?lokasi=eq.${m.typo}&sku=eq.${encodeURIComponent(row.sku)}`, {
          method: 'PATCH',
          headers: H,
          body: JSON.stringify({
            lokasi: m.target,
            area: m.area,
            updated_at: new Date().toISOString()
          })
        });
      }
    }
  }

  console.log('\n--- Migrasi Selesai! Melakukan Verifikasi Akhir ---');
  for (const m of migrations) {
    const s = await (await fetch(`${U}stok_real_fisik?lokasi=eq.${m.typo}`, { headers: H })).json();
    const l = await (await fetch(`${U}log_produk?lokasi=eq.${m.typo}`, { headers: H })).json();
    console.log(`Sisa data ${m.typo}: stok=${s.length}, logs=${l.length}`);
  }
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
