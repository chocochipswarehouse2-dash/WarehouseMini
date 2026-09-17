import re

with open('src/services/supabase.ts', 'r') as f:
    content = f.read()

# Fix startsWith on number
content = content.replace(
    "const condition = item.id && !item.id.startsWith('pick_')",
    "const condition = item.id && (typeof item.id === 'number' || (typeof item.id === 'string' && !item.id.startsWith('pick_')))"
)

# Fix in DistribusiStoreTab.tsx for invalid status
with open('src/services/gasTarikanMD.ts', 'r') as f:
    tarikan_content = f.read()

# Fix status validation to accept 'selisih' or convert appropriately
tarikan_content = tarikan_content.replace(
    "const validStatus = ['pending', 'selesai', 'deleted'].includes(rawStatus)\n      ? (rawStatus === 'deleted' ? 'DELETED' : rawStatus)\n      : 'pending';",
    "const validStatus = ['pending', 'selesai', 'deleted'].includes(rawStatus)\n      ? (rawStatus === 'deleted' ? 'DELETED' : rawStatus)\n      : (rawStatus === 'selisih' ? 'pending' : 'pending'); // Pengecekan_sj table only accepts pending, selesai, DELETED"
)

with open('src/services/gasTarikanMD.ts', 'w') as f:
    f.write(tarikan_content)

with open('src/services/supabase.ts', 'w') as f:
    f.write(content)
