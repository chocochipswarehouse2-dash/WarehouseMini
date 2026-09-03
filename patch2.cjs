const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// replace the grid container and the tab recap
code = code.replace(/<div className="grid grid-cols-2 bg-slate-100 dark:bg-black\/50 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-\[10px\] sm:text-xs font-bold w-full sm:max-w-sm gap-1 mb-4 lg:hidden">[\s\S]*?<\/div>\s*<div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">/g, 
  '<div className="max-w-2xl mx-auto space-y-4">');

code = code.replace(/<div className={`lg:col-span-5 xl:col-span-5 space-y-2 \${scannerActiveTab === 'recap' \? 'hidden lg:block' : 'block'}`}/g, 
  '<div className="space-y-2"');

code = code.replace(/<div className={`lg:col-span-7 xl:col-span-7 \${scannerActiveTab === 'scan' \? 'hidden lg:block' : 'block'}`}>[\s\S]*?<ScannerTabRecap \/>[\s\S]*?<\/div>\s*<\/div>/g, 
  '');

code = code.replace(/import \{ ScannerTabRecap \} from '.\/components\/ScannerTabRecap';\n/g, '');

fs.writeFileSync('src/App.tsx', code);
