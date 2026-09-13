const fs = require('fs');
let code = fs.readFileSync('src/components/PesananSaya/ManualShipmentTab.tsx', 'utf-8');

// Replace the hardcoded max-w-md with a grid layout or something tighter if it's currently expanding too much
// Looking at the code:
// <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl p-4 space-y-4">
//   <div className="max-w-md">

code = code.replace(
  '<div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl p-4 space-y-4">',
  '<div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl p-4 space-y-4 max-w-2xl">'
);

fs.writeFileSync('src/components/PesananSaya/ManualShipmentTab.tsx', code);
console.log('Fixed Manual Shipment layout');
