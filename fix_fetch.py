import re

with open('src/services/supabase.ts', 'r') as f:
    content = f.read()

# Fix fetchAllStockRealtime batchSize and error handling
def fix_stock_realtime(match):
    return match.group(0).replace('const batchSize = 5;', 'const batchSize = 2;').replace('.catch(() => [])', '.catch(() => null)')

content = re.sub(r'const batchSize = 5;[\s\S]*?\.catch\(\(\) => \[\]\)', fix_stock_realtime, content)

# Update chunk check in fetchAllStockRealtime
content = content.replace('''        for (const chunk of results) {
          if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
            breakLoop = true;
            break;
          }''', '''        for (const chunk of results) {
          if (chunk === null) continue; // Skip failed chunk, don't break
          if (!Array.isArray(chunk) || chunk.length === 0) {
            breakLoop = true;
            break;
          }''')

# Fix fetchMasterTable
def fix_master_table(match):
    return match.group(0).replace('const batchSize = 6;', 'const batchSize = 2;').replace('.catch(() => [])', '.catch(() => null)')

content = re.sub(r'const batchSize = 6;[\s\S]*?\.catch\(\(\) => \[\]\)', fix_master_table, content)

# Update chunk check in fetchMasterTable
content = content.replace('''      for (const rows of results) {
        if (!Array.isArray(rows) || rows.length === 0) {
          breakLoop = true;
          break;
        }''', '''      for (const rows of results) {
        if (rows === null) continue;
        if (!Array.isArray(rows) || rows.length === 0) {
          breakLoop = true;
          break;
        }''')


# Fix fetchAllLogs
content = content.replace('''        batchPromises.push(
          supabaseFetch<LogProdukItem[]>(
            'log_produk',
            'GET',
            null,
            `select=*&order=created_at.desc&limit=${currentLimit}&offset=${offset}`
          )
        );''', '''        batchPromises.push(
          supabaseFetch<LogProdukItem[]>(
            'log_produk',
            'GET',
            null,
            `select=*&order=created_at.desc&limit=${currentLimit}&offset=${offset}`
          ).catch(() => null)
        );''')

content = content.replace('''      for (const chunk of results) {
        if (!chunk || !Array.isArray(chunk) || chunk.length === 0) {
          breakLoop = true;
          break;
        }''', '''      for (const chunk of results) {
        if (chunk === null) continue;
        if (!Array.isArray(chunk) || chunk.length === 0) {
          breakLoop = true;
          break;
        }''')

with open('src/services/supabase.ts', 'w') as f:
    f.write(content)
print("Done")
