const { createClient } = require('@supabase/supabase-js');
const url = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const key = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const supabase = createClient(url, key);

async function repair() {
  console.log('Fetching affected logs (id >= 398569)...');
  const { data: logs, error } = await supabase
    .from('log_produk')
    .select('id, sku, nama_produk, size')
    .gte('id', 398569)
    .order('id', { ascending: true });

  if (error || !logs) {
    console.error('Fetch error:', error);
    return;
  }

  console.log(`Found ${logs.length} logs to inspect.`);
  const needsFix = logs.filter(l => l.nama_produk === l.sku || l.size === '-');
  console.log(`${needsFix.length} logs need metadata fix.`);

  const uniqueSkus = Array.from(new Set(needsFix.map(l => l.sku)));
  console.log(`Unique SKUs to lookup: ${uniqueSkus.length}`);

  // Lookup in master_produk
  const metaMap = new Map();
  const chunkSize = 40;
  for (let i = 0; i < uniqueSkus.length; i += chunkSize) {
    const chunk = uniqueSkus.slice(i, i + chunkSize);
    const { data: masterRows } = await supabase
      .from('master_produk')
      .select('sku, nama_produk, size')
      .in('sku', chunk);

    if (masterRows) {
      masterRows.forEach(m => {
        metaMap.set(m.sku.toUpperCase(), m);
      });
    }
  }

  console.log(`Found metadata for ${metaMap.size} of ${uniqueSkus.length} SKUs.`);

  // Update in log_produk
  let updatedCount = 0;
  for (const item of needsFix) {
    const meta = metaMap.get(item.sku.toUpperCase());
    if (meta) {
      const newName = meta.nama_produk || item.sku;
      const newSize = meta.size || '-';
      if (newName !== item.nama_produk || newSize !== item.size) {
        const { error: updErr } = await supabase
          .from('log_produk')
          .update({
            nama_produk: newName,
            size: newSize
          })
          .eq('id', item.id);

        if (!updErr) updatedCount++;
      }
    }
  }

  console.log(`Successfully updated ${updatedCount} rows in log_produk!`);
}

repair();
