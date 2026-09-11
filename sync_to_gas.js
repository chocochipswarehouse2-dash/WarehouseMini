const supabaseUrl = 'https://vxongwtxmhjixhzeoidp.supabase.co';
const supabaseKey = 'sb_publishable_XFvjJipUzyi0EuM_tDTTsg_ll7TJ7rA';
const gasUrl = 'https://script.google.com/macros/s/AKfycbxkBScIKlkA06Twrs3WOYZC1s6jmvl9dppV5M008ZydoPrqau3d6-VCdfDGacDUErN7Ig/exec?secret=wms-webhook-secret-2026';

async function fetchFromSupabase(table) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  return res.json();
}

async function sendWebhookToGas(table, type, record) {
  const payload = {
    type: type,
    table: table,
    record: record
  };

  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function main() {
  console.log('Starting full sync to GAS...');

  const tablesToSync = ['manual_shipment', 'pengecekan_sj', 'address_book'];

  for (const table of tablesToSync) {
    console.log(`\nFetching ${table} from Supabase...`);
    const records = await fetchFromSupabase(table);
    
    if (records.error) {
      console.error(`Error fetching ${table}:`, records.error);
      continue;
    }

    console.log(`Found ${records.length} records in ${table}. Syncing to GAS...`);
    
    // If table is empty, we can send a dummy to trigger sheet creation, then delete it, 
    // but GAS webhook expects a record with 'id'.
    if (records.length === 0) {
      console.log(`Skipping ${table} because it's empty.`);
      continue;
    }

    for (const record of records) {
      try {
        const gasRes = await sendWebhookToGas(table, 'INSERT', record);
        console.log(`Synced ${record.id || record.no_sj || record.order_id}:`, gasRes);
      } catch (err) {
        console.error(`Failed to sync record ${record.id}:`, err);
      }
    }
  }

  console.log('\nSync to GAS complete!');
}

main().catch(console.error);
