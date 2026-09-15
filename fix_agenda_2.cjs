const fs = require('fs');
const filePath = 'src/components/AgendaView.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
  'className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3"',
  'className="flex flex-wrap items-center justify-between sm:justify-start gap-2 sm:gap-3"'
);

content = content.replace(
  'className="flex items-center justify-between sm:justify-end gap-2"',
  'className="flex flex-wrap items-center justify-between sm:justify-end gap-2"'
);

fs.writeFileSync(filePath, content);
