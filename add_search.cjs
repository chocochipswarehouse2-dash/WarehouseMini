const fs = require('fs');

let content = fs.readFileSync('src/components/MutasiLogView.tsx', 'utf8');

const insertion1 = `  const [isServerSearching, setIsServerSearching] = useState(false);

  const handleServerSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsServerSearching(true);
    try {
      const data = await fetchLogsBySearch(searchQuery.trim(), 1000);
      if (data && data.length > 0) {
        // Merge with existing logs and deduplicate
        const merged = [...logs, ...data];
        const unique = Array.from(
          new Map(merged.map((item) => [item.id || \`\${item.invoice}_\${item.sku}_\${item.created_at}\`, item])).values()
        );
        // Sort descending by created_at
        unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setLogs(unique);
        if (onNotify) onNotify(\`Ditemukan \${data.length} hasil dari server.\`, 'success');
      } else {
        if (onNotify) onNotify('Tidak ditemukan hasil tambahan di database.', 'info');
      }
    } catch (err) {
      console.error(err);
      if (onNotify) onNotify('Gagal mencari di server.', 'error');
    } finally {
      setIsServerSearching(false);
    }
  };

  useEffect(() => {`;

content = content.replace('  useEffect(() => {', insertion1);

const insertion2 = `        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <Package className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Tidak Ada Mutasi Log Ditemukan
            </div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery || typeFilter !== 'ALL' || areaFilter !== 'ALL'
                ? 'Tidak ada data yang sesuai dengan filter pencarian Anda di lokal.'
                : 'Belum ada riwayat mutasi produk di database.'}
            </p>
            {searchQuery && (
              <button
                onClick={handleServerSearch}
                disabled={isServerSearching}
                className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mx-auto"
              >
                {isServerSearching ? (
                  <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {isServerSearching ? 'Mencari di Server...' : 'Cari di Seluruh Database'}
              </button>
            )}
          </div>`;

const searchReplaceRegex = /\)\s*:\s*filteredLogs\.length === 0 \? \([\s\S]*?<\/div>\s*\)\s*:\s*\(/;

const match = content.match(searchReplaceRegex);
if (match) {
  content = content.replace(searchReplaceRegex, insertion2 + ' : (');
  fs.writeFileSync('src/components/MutasiLogView.tsx', content, 'utf8');
  console.log('Successfully injected handleServerSearch and button');
} else {
  console.log('Could not find regex to replace the empty state view');
}
