const fs = require('fs');
let code = fs.readFileSync('src/services/supabase.ts', 'utf-8');

// The issue is completePickingSuratJalanBatchSupabase saves to wms_picking_cache but PickingTasksView reads from wms_raw_picking_list_cache for rawItems. Let's fix the cache logic.

let viewCode = fs.readFileSync('src/components/PickingTasksView.tsx', 'utf-8');
const oldCacheUpdate = `          setRawItems((prev) => {
            const updated = prev.map((item) => {
              if (upperSJs.has((item.no_sj || '').toUpperCase().trim())) {
                return {
                  ...item,
                  status: 'SELESAI' as const,
                  picker_name: currentUser || 'Admin',
                };
              }
              return item;
            });
            try {
              localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify(updated));
            } catch {}
            return updated;
          });`;

const newCacheUpdate = `          setRawItems((prev) => {
            const updated = prev.map((item) => {
              if (upperSJs.has((item.no_sj || '').toUpperCase().trim())) {
                return {
                  ...item,
                  status: 'SELESAI' as const,
                  qty_picked: item.qty_req, // Assume full pick on batch complete
                  picker_name: currentUser || 'Admin',
                };
              }
              return item;
            });
            try {
              localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify(updated));
            } catch {}
            return updated;
          });`;

viewCode = viewCode.replace(oldCacheUpdate, newCacheUpdate);
fs.writeFileSync('src/components/PickingTasksView.tsx', viewCode);
console.log('Fixed PickingTasksView local state');
