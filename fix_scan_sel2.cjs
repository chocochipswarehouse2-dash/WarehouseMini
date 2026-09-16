const fs = require('fs');

let content = fs.readFileSync('src/components/ScanMethodSelector.tsx', 'utf8');

content = content.replace(
  '<span className="whitespace-nowrap">Ketik / Scan</span>',
  '<span className="truncate">Ketik / Scan</span>'
);

content = content.replace(
  '<span className="whitespace-nowrap">Kamera HP</span>',
  '<span className="truncate">Kamera HP</span>'
);

content = content.replace(/flex-1 py-1\.5/g, 'flex-1 min-w-0 py-1.5');
content = content.replace(/flex-1 py-2/g, 'flex-1 min-w-0 py-2'); // for btnModeKamera
content = content.replace(/<Keyboard className="w-3\.5 h-3\.5" \/>/g, '<Keyboard className="w-3.5 h-3.5 flex-shrink-0" />');
content = content.replace(/<Camera className="w-3\.5 h-3\.5" \/>/g, '<Camera className="w-3.5 h-3.5 flex-shrink-0" />');

fs.writeFileSync('src/components/ScanMethodSelector.tsx', content, 'utf8');
console.log('Fixed ScanMethodSelector text 2');
