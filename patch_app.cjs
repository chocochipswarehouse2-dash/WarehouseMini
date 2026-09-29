const fs = require('fs');

let content = fs.readFileSync('src/components/PickingTasksView.tsx', 'utf8');

// 1. Add hideCompleted state
if (!content.includes('hideCompleted, setHideCompleted')) {
  content = content.replace(
    /const \[activeSJ, setActiveSJ\] = useState/,
    "const [hideCompleted, setHideCompleted] = useState(true);\n  const [activeSJ, setActiveSJ] = useState"
  );
}

// 2. Hide completed logic in activeItems rendering
// Replace `{(activeItems || []).map((item, index) => {` 
// with logic that filters `activeItems` based on `hideCompleted`

const activeItemsMapStr = "{(activeItems || []).map((item, index) => {";
if (content.includes(activeItemsMapStr)) {
  content = content.replace(
    activeItemsMapStr,
    `{(activeItems || []).map((item, index) => {
            const reqQty = Math.max(1, Number(item.qty_req) || 1);
            const pickedQty = Math.max(0, Number(item.qty_picked) || 0);
            const isCompleted = pickedQty >= reqQty;
            if (hideCompleted && isCompleted) return null;`
  );
}

// Add the eye toggle button near "Daftar Barang Surat Jalan"
const dftrBarangHeader = `<h2 className="text-xs font-black text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Daftar Barang Surat Jalan ({activeItems.length} SKU)
            </h2>`;
const toggleButton = `<div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHideCompleted(!hideCompleted)}
                className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-sm"
              >
                {hideCompleted ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {hideCompleted ? 'Tampilkan Selesai' : 'Sembunyikan Selesai'}
              </button>
              <span className="text-[11px] font-bold text-slate-500">
                {activeLocation ? \`📍 Filter Rak: \${activeLocation}\` : 'Semua Rak'}
              </span>
            </div>`;

content = content.replace(
  /<span className="text-\[11px\] font-bold text-slate-500">\s*\{activeLocation \? \`📍 Filter Rak: \$\{activeLocation\}\` : 'Semua Lokasi Rak'\}\s*<\/span>/g,
  ""
);
content = content.replace(dftrBarangHeader, dftrBarangHeader + "\n" + toggleButton);


// 3. Regex for cleaning size out of the product name.
// e.g. "Azura Set Dark Red [S]" -> "Azura Set Dark Red" if size is "S".
// Let's modify the place where displayName is set.
const displayNameLine = "const displayName = item.nama_produk || itemSku;";
if (content.includes(displayNameLine)) {
  const newDisplayNameLine = `let displayName = item.nama_produk || itemSku;
            if (item.size && displayName.toUpperCase().includes(item.size.toUpperCase())) {
              displayName = displayName.replace(new RegExp(\`\\\\s*\\\\(?\\\\[?\\\\s*\${item.size}\\\\s*\\\\]?\\\\)?\\\\s*$\`, 'i'), '');
            }`;
  content = content.replace(displayNameLine, newDisplayNameLine);
}

// 4. Imports for Eye and EyeOff if missing
if (!content.includes('EyeOff')) {
  content = content.replace('AlertTriangle,', 'AlertTriangle, Eye, EyeOff,');
}

fs.writeFileSync('src/components/PickingTasksView.tsx', content, 'utf8');
console.log("PickingTasksView patched.");
