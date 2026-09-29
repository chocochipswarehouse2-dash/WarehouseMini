with open('src/services/gasTarikanMD.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "const validStatus = ['pending', 'selesai', 'deleted'].includes(rawStatus)\n      ? (rawStatus === 'deleted' ? 'DELETED' : rawStatus)\n      : (rawStatus === 'selisih' ? 'pending' : 'pending'); // Pengecekan_sj table only accepts pending, selesai, DELETED",
    "const validStatus = ['pending', 'selesai', 'deleted'].includes(rawStatus)\n      ? (rawStatus === 'deleted' ? 'DELETED' : rawStatus)\n      : (rawStatus === 'selisih' ? 'selesai' : 'pending'); // Pengecekan_sj table only accepts pending, selesai, DELETED"
)

with open('src/services/gasTarikanMD.ts', 'w') as f:
    f.write(content)
