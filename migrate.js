const url = 'https://vxongwtxmhjixhzeoidp.supabase.co';
const key = 'sb_publishable_XFvjJipUzyi0EuM_tDTTsg_ll7TJ7rA';

async function main() {
  console.log('Starting migration...');

  // 1. Migrate Pengecekan SJ
  console.log('Fetching PENGECEKAN_SJ logs...');
  const sjRes = await fetch(`${url}/rest/v1/log_produk?type=eq.PENGECEKAN_SJ&select=*`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const sjLogs = await sjRes.json();
  console.log(`Found ${sjLogs.length} Pengecekan SJ records.`);

  if (sjLogs.length > 0) {
    const sjToInsert = [];
    for (const row of sjLogs) {
      if (row.raw_payload) {
        try {
          const parsed = JSON.parse(row.raw_payload);
          sjToInsert.push({
            no_sj: parsed.no_sj || row.invoice,
            tanggal_sj: parsed.tanggal_sj || row.created_at.slice(0, 10),
            source: parsed.source || row.area,
            destination: parsed.destination || row.lokasi,
            status: parsed.status || 'pending',
            status_komparasi: parsed.status_komparasi || row.keterangan || 'COCOK',
            total_qty_sj: Number(parsed.total_qty_sj || row.qty || 0),
            total_qty_terima: Number(parsed.total_qty_terima || row.qty || 0),
            total_sku: Number(parsed.total_sku || 1),
            submitted_by: parsed.submitted_by || row.operator,
            catatan: parsed.catatan || row.keterangan || '',
            items: parsed.items,
            items_json: JSON.stringify(parsed.items || []),
            sync_status: 'synced',
            created_at: parsed.created_at || row.created_at,
          });
          continue;
        } catch(e) {}
      }

      // fallback
      const no_sj = row.invoice || `SJ-${row.id}`;
      sjToInsert.push({
        no_sj,
        source: row.area || 'Gudang Pusat',
        destination: row.lokasi || 'Outlet',
        tanggal_sj: String(row.created_at || '').slice(0, 10),
        status: 'pending',
        status_komparasi: row.keterangan || 'COCOK',
        total_qty_sj: Number(row.qty || 0),
        total_qty_terima: Number(row.qty || 0),
        total_sku: 1,
        submitted_by: row.operator || 'Petugas',
        created_at: row.created_at || new Date().toISOString(),
        catatan: row.keterangan || '',
        items_json: '[]',
        sync_status: 'synced'
      });
    }

    console.log(`Inserting ${sjToInsert.length} Pengecekan SJ...`);
    const insertSjRes = await fetch(`${url}/rest/v1/pengecekan_sj`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(sjToInsert)
    });
    console.log('Insert SJ status:', insertSjRes.status);
    if (!insertSjRes.ok) {
       console.log('Error:', await insertSjRes.text());
    }
  }

  // 2. Migrate Manual Shipment
  console.log('Fetching MANUAL_SHIPMENT logs...');
  const shRes = await fetch(`${url}/rest/v1/log_produk?type=eq.MANUAL_SHIPMENT&select=*`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const shLogs = await shRes.json();
  console.log(`Found ${shLogs.length} Manual Shipment records.`);

  if (shLogs.length > 0) {
    const shToInsert = [];
    for (const row of shLogs) {
      if (row.raw_payload) {
        try {
          const parsed = JSON.parse(row.raw_payload);
          shToInsert.push({
            id: parsed.id || String(row.id),
            order_id: parsed.order_id || row.invoice,
            order_date: parsed.order_date || row.created_at.slice(0, 10),
            source: parsed.source || row.area,
            destination: parsed.destination || row.lokasi,
            total_qty: Number(parsed.total_qty || row.qty || 0),
            status: parsed.status || 'pending',
            courier: parsed.courier || '-',
            resi: parsed.resi || '',
            catatan: parsed.catatan || row.keterangan || '',
            items: parsed.items,
            items_json: JSON.stringify(parsed.items || []),
            sync_status: 'synced',
            created_at: parsed.created_at || row.created_at,
          });
          continue;
        } catch(e) {}
      }

      const order_id = row.invoice || `MS-${row.id}`;
      shToInsert.push({
        id: String(row.id),
        order_id,
        order_date: String(row.created_at || '').slice(0, 10),
        source: row.area || 'Gudang Pusat',
        destination: row.lokasi || 'Customer',
        total_qty: Number(row.qty || 0),
        status: 'pending',
        courier: '-',
        resi: '',
        catatan: row.keterangan || '',
        items_json: '[]',
        sync_status: 'synced',
        created_at: row.created_at || new Date().toISOString()
      });
    }

    console.log(`Inserting ${shToInsert.length} Manual Shipment...`);
    const insertShRes = await fetch(`${url}/rest/v1/manual_shipment`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(shToInsert)
    });
    console.log('Insert Shipment status:', insertShRes.status);
    if (!insertShRes.ok) {
       console.log('Error:', await insertShRes.text());
    }
  }

  console.log('Migration complete!');
}

main().catch(console.error);
