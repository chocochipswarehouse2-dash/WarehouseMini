import fs from 'fs';
let code = fs.readFileSync('src/components/LiveInventoryDrawer.tsx', 'utf8');
if (!code.includes('fetchError')) {
  code = code.replace('const [isLoading, setIsLoading] = useState(false);', 'const [isLoading, setIsLoading] = useState(false);\n  const [fetchError, setFetchError] = useState<string | null>(null);');
  code = code.replace('setIsLoading(true);', 'setIsLoading(true);\n    setFetchError(null);');
  code = code.replace(/console\.warn\('Error loading live data:', e\);/g, 'console.warn("Error loading live data:", e);\n      setFetchError(e instanceof Error ? e.message : String(e));');
  code = code.replace(/<div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800">/g, '<div className="flex justify-between items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800">\n        {fetchError && <div className="absolute top-16 left-4 right-4 bg-red-100 text-red-600 p-2 rounded text-xs z-50">ERROR: {fetchError}</div>}');
  fs.writeFileSync('src/components/LiveInventoryDrawer.tsx', code);
}
