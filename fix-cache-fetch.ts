import { readFileSync, writeFileSync } from 'fs';
let content = readFileSync('src/services/supabase.ts', 'utf-8');

const targetCacheLogic = `  // 1. Read from local cache first
  try {
    const cached = localStorage.getItem('wms_picking_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          const item = extractPickingItemFromRow(r);
          if (item) {
            itemsMap.set(\`\${item.no_sj}__\${item.sku}\`, item);
          }
        }
      }
    }
  } catch {}`;

const replaceCacheLogic = `  // 1. (REMOVED) Do not rely on local cache for the main source of truth
  // to avoid ghost items reappearing after deletion.
  // We will always fetch fresh data from Supabase.`;

if (content.includes('localStorage.getItem(\'wms_picking_cache\')')) {
  content = content.replace(targetCacheLogic, replaceCacheLogic);
  writeFileSync('src/services/supabase.ts', content);
  console.log("Disabled local cache fallback in fetch");
}
