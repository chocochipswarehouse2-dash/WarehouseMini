const fs = require('fs');
let code = fs.readFileSync('src/components/PeminjamanView.tsx', 'utf8');

code = code.replace(/const \[extraSearchedProducts, setExtraSearchedProducts\] = useState<ProductItem\[\]>\(\[\]\);\n/g, '');

code = code.replace(/const combinedCatalog = \[\.\.\.productCatalog, \.\.\.extraSearchedProducts\];/g, 
  'const combinedCatalog = productCatalog;');

code = code.replace(/  \}, \[productCatalog, channelStocks, extraSearchedProducts\]\);/g, 
  '  }, [productCatalog, channelStocks]);');

const searchFnRegex = /\/\/ Debounced search on Supabase master_produk when typing\s*const searchSupabaseMaster = async \(query: string\) => \{[\s\S]*?\} catch \(e\) \{\s*console\.warn\('Supabase master search error:', e\);\s*\}\s*\};\s*/g;
code = code.replace(searchFnRegex, '');

code = code.replace(/\/\/ Trigger debounced Supabase lookup if 2\+ characters\s*if \(trimmed\.length >= 2\) \{\s*const timer = setTimeout\(\(\) => \{\s*searchSupabaseMaster\(trimmed\);\s*\}, 250\);\s*\/\/ Cleanup timer via input state if needed\s*\}/g, '');

fs.writeFileSync('src/components/PeminjamanView.tsx', code);
