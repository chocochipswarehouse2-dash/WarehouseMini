const fs = require('fs');
const filePath = 'src/components/AgendaView.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  'className="bg-white dark:bg-[#1a2332] p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3"',
  'className="bg-white dark:bg-[#1a2332] p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-row flex-wrap justify-between items-center gap-3"'
);

fs.writeFileSync(filePath, content);
