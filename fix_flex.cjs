const fs = require('fs');

let qt = fs.readFileSync('src/components/QuickTagToolbar.tsx', 'utf8');

// Fix mode container
qt = qt.replace(
  'className="flex gap-1.5 overflow-x-auto flex-1 pb-0.5 no-scrollbar"',
  'className="flex gap-1.5 overflow-x-auto flex-1 min-w-0 pb-0.5 no-scrollbar"'
);

// Fix location container
qt = qt.replace(
  'className="flex items-center gap-1.5 overflow-x-auto flex-1 pb-0.5 no-scrollbar"',
  'className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 pb-0.5 no-scrollbar"'
);

fs.writeFileSync('src/components/QuickTagToolbar.tsx', qt, 'utf8');
console.log('Fixed QuickTagToolbar flex');
