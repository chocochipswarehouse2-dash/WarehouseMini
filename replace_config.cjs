const fs = require('fs');
let code = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

// The declaration was changed to DEFAULT_CATEGORY_CONFIG, so the rest of CATEGORY_CONFIG should be replaced by categoryConfig
code = code.replace(/CATEGORY_CONFIG/g, 'categoryConfig');
code = code.replace(/DEFAULT_categoryConfig/g, 'DEFAULT_CATEGORY_CONFIG');

// Fix setSelectedCategories reset
code = code.replace(
  /setSelectedCategories\(\{\s*\}\)/g, 
  "setSelectedCategories(Object.keys(categoryConfig).reduce((acc, k) => ({...acc, [k]: true}), {}))"
);

fs.writeFileSync('src/components/AgendaView.tsx', code);
