import { readFileSync, writeFileSync } from 'fs';
let content = readFileSync('src/services/supabase.ts', 'utf-8');

const targetFetch = `  // 2. Fetch from Supabase candidate tables
  const candidateTables = ['picking_list', 'refill', 'tugas_picking', 'transfer_order'];
  for (const table of candidateTables) {
    try {
      const rows = await supabaseFetch<any[]>(
        table,
        'GET',
        null,
        'select=*&order=created_at.desc&limit=2000'
      );
      if (rows && Array.isArray(rows) && rows.length > 0) {
        for (const r of rows) {
          const item = extractPickingItemFromRow(r);
          if (item) {
            itemsMap.set(\`\${item.no_sj}__\${item.sku}\`, item);
          }
        }
        break; // Successfully got from primary table
      }
    } catch {
      // Continue to next table
    }
  }`;

const replaceFetch = `  // 2. Fetch from Supabase candidate tables
  const candidateTables = ['picking_list', 'refill', 'tugas_picking', 'transfer_order'];
  let anySuccess = false;
  let lastError = null;

  for (const table of candidateTables) {
    try {
      const rows = await supabaseFetch<any[]>(
        table,
        'GET',
        null,
        'select=*&order=created_at.desc&limit=2000'
      );
      anySuccess = true; // Request succeeded, even if 0 rows
      if (rows && Array.isArray(rows) && rows.length > 0) {
        for (const r of rows) {
          const item = extractPickingItemFromRow(r);
          if (item) {
            itemsMap.set(\`\${item.no_sj}__\${item.sku}\`, item);
          }
        }
        break; // Successfully got from primary table
      }
    } catch (e) {
      lastError = e;
      // Continue to next table
    }
  }

  // If no table succeeded at all (e.g. network down), throw to trigger offline cache
  if (!anySuccess && lastError) {
    throw lastError;
  }`;

content = content.replace(targetFetch, replaceFetch);
writeFileSync('src/services/supabase.ts', content);
console.log("Fixed fetch offline fallback");
