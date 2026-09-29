const fs = require('fs');
let code = fs.readFileSync('src/services/supabase.ts', 'utf-8');

// The issue might also be that itemsMap already has the item and we overwrite its status,
// or the local cache is outdated, but `fetchPickingListFromSupabase` gets raw DB data.
// Is picking_list getting updated to SELESAI properly?

const completePick = `const matchingItem = items.find((it) => (it.id && it.id === c.id) || it.sku.toUpperCase() === c.sku.toUpperCase());
        if (matchingItem) {
          return {
            ...c,
            qty_picked: matchingItem.qty_picked,
            status: 'SELESAI' as const,
            picker_name: pickerName || c.picker_name || 'Operator',
            catatan: catatan || matchingItem.catatan || c.catatan || '',
          };
        }`;

console.log(code.includes("export async function completePickingSuratJalanSupabase"));

