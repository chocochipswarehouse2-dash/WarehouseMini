with open('src/services/supabase.ts', 'r') as f:
    content = f.read()

# Fix cache handling issue in fetchPickingListFromSupabase
# Currently fetchWithDeltaSync might be caching things incorrectly or missing them.

content = content.replace('''
  // Fetch from picking_list and peminjaman concurrently to avoid sequential bottlenecks
  const [pickingRes, peminjamanRes] = await Promise.allSettled([
    fetchWithDeltaSync<any>('picking_list', 
      (row) => row.id || `${row.no_sj}_${row.sku}`,
      (row) => row.no_sj
    ),
    supabaseFetch<any[]>('peminjaman', 'GET', null, 'select=*&order=created_at.desc&limit=100')
  ]);
''', '''
  // Fetch from picking_list and peminjaman concurrently to avoid sequential bottlenecks
  // Bypass fetchWithDeltaSync temporarily to ensure all fresh rows are fetched properly
  const [pickingRes, peminjamanRes] = await Promise.allSettled([
    supabaseFetch<any[]>('picking_list', 'GET', null, 'select=*&order=created_at.desc&limit=2000'),
    supabaseFetch<any[]>('peminjaman', 'GET', null, 'select=*&order=created_at.desc&limit=100')
  ]);
''')

with open('src/services/supabase.ts', 'w') as f:
    f.write(content)

