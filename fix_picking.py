with open('src/services/supabase.ts', 'r') as f:
    content = f.read()

# Fix cache handling issue in createPickingSuratJalanSupabase 
# The issue is we create the cache with one set of keys (e.g., date formats, strings) and expect it to magically align.
# Wait, let me check where we set local storage.

content = content.replace('''
  // 1. Immediately store to local caches so it appears in Tugas Picking right away
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Update wms_picking_cache
      const cached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_picking_cache') || '[]');
      const filteredCache = cached.filter(
        (c) => !(c.no_sj?.toUpperCase() === cleanNoSj && newItems.some((n) => n.sku === c.sku?.toUpperCase()))
      );
      localStorage.setItem('wms_picking_cache', JSON.stringify([...newItems, ...filteredCache]));

      // Update wms_raw_picking_list_cache (used by PickingTasksView)
      const rawCached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_raw_picking_list_cache') || '[]');
      const filteredRaw = rawCached.filter(
        (c) => !(c.no_sj?.toUpperCase() === cleanNoSj && newItems.some((n) => n.sku === c.sku?.toUpperCase()))
      );
      localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify([...newItems, ...filteredRaw]));
    }
  } catch (cErr) {
    console.warn('Error saving picking to local cache:', cErr);
  }
''', '''
  // 1. Immediately store to local caches so it appears in Tugas Picking right away
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Update wms_picking_cache
      const cached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_picking_cache') || '[]');
      const filteredCache = cached.filter(
        (c) => !(c.no_sj?.toUpperCase() === cleanNoSj)
      );
      localStorage.setItem('wms_picking_cache', JSON.stringify([...newItems, ...filteredCache]));

      // Update wms_raw_picking_list_cache (used by PickingTasksView)
      const rawCached: PickingListItem[] = JSON.parse(localStorage.getItem('wms_raw_picking_list_cache') || '[]');
      const filteredRaw = rawCached.filter(
        (c) => !(c.no_sj?.toUpperCase() === cleanNoSj)
      );
      localStorage.setItem('wms_raw_picking_list_cache', JSON.stringify([...newItems, ...filteredRaw]));
    }
  } catch (cErr) {
    console.warn('Error saving picking to local cache:', cErr);
  }
''')

with open('src/services/supabase.ts', 'w') as f:
    f.write(content)

