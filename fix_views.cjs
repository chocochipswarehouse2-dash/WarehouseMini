const fs = require('fs');

function applyClean(file) {
  let content = fs.readFileSync(file, 'utf8');
  
  if (!content.includes('cleanProductName')) {
    content = content.replace(
      /import \{([^}]+)\} from '\.\.\/utils\/sortUtils';/,
      `import {$1, cleanProductName } from '../utils/sortUtils';`
    );
  }
  
  // Wait, some files might not import from sortUtils at all
  if (!content.includes('../utils/sortUtils') && !content.includes('cleanProductName')) {
    content = content.replace(
      /import \{([^}]+)\} from '\.\.\/types';/,
      `import {$1} from '../types';\nimport { cleanProductName } from '../utils/sortUtils';`
    );
  }

  // Replace {productCatalog?.find... || item.nama_produk || '-'} with {cleanProductName(...)}
  content = content.replace(
    /\{productCatalog\?\.find\(p => p\.k\.toUpperCase\(\) === item\.sku\.toUpperCase\(\)\)\?\.p \|\| item\.nama_produk \|\| '-'\}/g,
    `{cleanProductName(productCatalog?.find(p => p.k.toUpperCase() === item.sku.toUpperCase())?.p || item.nama_produk || '-')}`
  );

  fs.writeFileSync(file, content, 'utf8');
}

applyClean('src/components/MutasiLogView.tsx');
applyClean('src/components/StockOpnameView.tsx');
applyClean('src/components/PickingTasksView.tsx');
applyClean('src/components/InventoryView.tsx');

console.log('Fixed Views');
