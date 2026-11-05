const fs = require('fs');
const path = require('path');

const filepath = path.join('d:\\Antigravity\\WMS Inventory\\src\\components\\PesananSaya\\IGLiveTab.tsx');
let content = fs.readFileSync(filepath, 'utf8');

// 1. Update imports
content = content.replace(
  /getStoredIgLiveOrders,\n\s*saveStoredIgLiveOrders,/,
  `fetchIgLiveOrdersFromSupabase,\n  upsertIgLiveOrdersToSupabase,\n  syncLocalIgLiveToSupabase,`
);

// 2. Add saveAndSetOrders helper
const helperSnippet = `
  const saveAndSetOrders = (updatedOrders: IGLiveOrder[]) => {
    setOrders(updatedOrders);
    upsertIgLiveOrdersToSupabase(updatedOrders).catch(err => {
      console.error('Failed to sync to Supabase', err);
      onShowToast('Gagal sinkronisasi ke server!', 'error');
    });
  };
`;
// Insert right after setTempGasUrl
content = content.replace(
  /(const \[tempGasUrl, setTempGasUrl\] = useState<string>\(''\);)/,
  `$1\n${helperSnippet}`
);

// 3. Update all setOrders(updated); saveStoredIgLiveOrders(updated);
content = content.replace(/setOrders\(([^)]+)\);\s*saveStoredIgLiveOrders\(\1\);/g, 'saveAndSetOrders($1);');
// Handle the combined one
content = content.replace(/setOrders\(combined\);\s*saveStoredIgLiveOrders\(combined\);/g, 'saveAndSetOrders(combined);');

// 4. Update initialization useEffect
const initEffectRegex = /useEffect\(\(\) => \{\s*const handleAfterPrint[\s\S]*?const loadedOrders = getStoredIgLiveOrders\(productCatalog\);\s*setOrders\(loadedOrders\);[\s\S]*?return \(\) => window\.removeEventListener\('afterprint', handleAfterPrint\);\s*\}, \[productCatalog\]\);/;

const newInitEffect = `useEffect(() => {
    const handleAfterPrint = () => {
      setPrintMode(null);
      setPrintOrders([]);
    };
    window.addEventListener('afterprint', handleAfterPrint);

    const loadedGasUrl = getStoredIgLiveGasUrl();
    setGasUrl(loadedGasUrl);
    setTempGasUrl(loadedGasUrl);

    // Sync from local first, then fetch from Supabase
    syncLocalIgLiveToSupabase().then(() => {
      fetchIgLiveOrdersFromSupabase().then(res => {
        setOrders(res);
      });
    });

    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [productCatalog]);`;

content = content.replace(initEffectRegex, newInitEffect);

fs.writeFileSync(filepath, content);
console.log("IGLiveTab.tsx updated");
