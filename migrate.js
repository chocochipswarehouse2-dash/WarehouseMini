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
            no_pesanan: parsed.no_pesanan || parsed.order_id || row.invoice || `MS-${row.id}`,
            nama_pengirim: parsed.nama_pengirim || 'CHOCOCHIPS',
            pic_store: parsed.pic_store || '',
            no_telp_store: parsed.no_telp_store || '',
            no_transaksi_pengirim: Array.isArray(parsed.no_transaksi_pengirim) ? parsed.no_transaksi_pengirim : [],
            nama_tujuan: parsed.nama_tujuan || parsed.destination || parsed.nama_penerima || row.lokasi || 'Customer',
            no_telp_tujuan: parsed.no_telp_tujuan || parsed.no_telp || '',
            alamat_tujuan: parsed.alamat_tujuan || parsed.alamat || '',
            notes_paket: parsed.notes_paket || parsed.catatan || parsed.keterangan || row.keterangan || '',
            no_transaksi_customer: parsed.no_transaksi_customer || '',
            jasa_kirim: parsed.jasa_kirim || parsed.courier || '-',
            no_resi: parsed.no_resi || parsed.resi || '',
            status: parsed.status || 'diterima',
            submitted_by: parsed.submitted_by || row.operator || '',
            items: parsed.items || [],
            created_at: parsed.created_at || row.created_at || new Date().toISOString(),
            updated_at: parsed.updated_at || row.created_at || new Date().toISOString()
          });
          continue;
        } catch(e) {}
      }

      const no_pesanan = row.invoice || `MS-${row.id}`;
      shToInsert.push({
        no_pesanan,
        nama_pengirim: 'CHOCOCHIPS',
        pic_store: '',
        no_telp_store: '',
        no_transaksi_pengirim: [],
        nama_tujuan: row.lokasi || 'Customer',
        no_telp_tujuan: '',
        alamat_tujuan: '',
        notes_paket: row.keterangan || '',
        no_transaksi_customer: '',
        jasa_kirim: '-',
        no_resi: '',
        status: 'diterima',
        submitted_by: row.operator || '',
        items: [],
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.created_at || new Date().toISOString()
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
