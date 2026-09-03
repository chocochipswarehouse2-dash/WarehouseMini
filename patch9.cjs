const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<React\.Suspense fallback=\{<div className="flex justify-center p-8"><span className="animate-spin text-3xl">⏳<\/span><\/div>\}>[\s\S]*?            <\/div><\/div><\/div>\)}/m;

const replacement = `<React.Suspense fallback={<div className="flex justify-center p-8"><span className="animate-spin text-3xl">⏳</span></div>}>
            {activePage === 'inventory' && (
                <InventoryView
                  session={session}
                  currentLocations={activeLocations}
                  productCatalog={productDatabase}
                  onNotify={showToast}
                  onRefreshCatalog={loadProducts}
                />
            )}`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', code);
