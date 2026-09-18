const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

content = content.replace(
  /\{activeTab === 'calendar' \? \(/,
  '{activeTab === \'calendar\' && ('
);

content = content.replace(
  /\n\s*\) : \(\n\s*\/\* PROJECT & INITIATIVE TAB \*\//,
  '\n      )}\n      {activeTab === \'project\' && (\n        /* PROJECT & INITIATIVE TAB */'
);

content = content.replace(
  /\n\s*\}\n\s*\{\/\* --- MODALS ---\*\/\}/,
  '\n      )}\n      {/* --- MODALS ---*/}'
);

fs.writeFileSync('src/components/AgendaView.tsx', content);
