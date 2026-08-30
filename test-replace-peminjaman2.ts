import * as fs from 'fs';

let content = fs.readFileSync('src/components/PeminjamanView.tsx', 'utf-8');

// 1. Fix imports
content = content.replace(
  /import React, { useState, useEffect } from 'react';/,
  "import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';"
);

// 2. Fix filteredStocks
content = content.replace(
  /const filteredStocks = \(\(\) => \{([\s\S]*?)\}\)\(\);/m,
  `const deferredSearchStock = useDeferredValue(searchStock);
  const filteredStocks = useMemo(() => {
    $1
  }, [channelStocks, selectedChannel, deferredSearchStock]);`
);
content = content.replace(
  /fuzzySearchMultiple\(searchStock, /g,
  'fuzzySearchMultiple(deferredSearchStock, '
);
content = content.replace(
  /if \(!searchStock\.trim\(\)\)/g,
  'if (!deferredSearchStock.trim())'
);

// 3. Fix combobox filteredProductOpts
// Let's insert the precomputed states right before formItems.map
const mapStartIndex = content.indexOf('return formItems.map((item, index) => {');
if (mapStartIndex !== -1) {
  const precomputeCode = `
                  const deferredComboboxSearch = useDeferredValue(comboboxSearch);
                  const comboboxProductPool = useMemo(() => {
                    return channelStocks.length > 0 ? channelStocks : productCatalog;
                  }, [channelStocks, productCatalog]);
                  
                  const filteredProductOpts = useMemo(() => {
                    const pool = comboboxProductPool;
                    const filtered = pool.filter((p) => {
                      const name = 'p' in p ? p.p : p.produk;
                      const sku = 'k' in p ? p.k : p.sku;
                      return fuzzySearchMultiple(deferredComboboxSearch, [name, sku]);
                    });
                    return sortAlphabeticalAndSize(filtered, (p) => ('p' in p ? p.p : p.produk) || ('k' in p ? p.k : p.sku) || '', (p) => ('s' in p ? p.s : p.size) || '');
                  }, [comboboxProductPool, deferredComboboxSearch]);\n\n                `;
                  
  // Remove the inline calculation
  const blockToRemoveStart = content.indexOf('const pool = channelStocks.length > 0 ? channelStocks : productCatalog;');
  const blockToRemoveEnd = content.indexOf('})();', blockToRemoveStart) + 5;
  
  if (blockToRemoveStart !== -1 && blockToRemoveEnd > blockToRemoveStart) {
    const inlineBlock = content.substring(blockToRemoveStart, blockToRemoveEnd);
    content = content.replace(inlineBlock, '');
  }
  
  // We need to place hooks at the TOP level of the component, NOT inside render of the mapped item, 
  // Wait! useDeferredValue and useMemo MUST be at the top level of the component!
  // I can't put them inside the return block rendering the form.
}

fs.writeFileSync('src/components/PeminjamanView.temp.tsx', content);
