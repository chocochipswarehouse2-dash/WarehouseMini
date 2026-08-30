import * as fs from 'fs';
const content = fs.readFileSync('src/App.tsx', 'utf-8');
const newContent = content.replace(
  /scanMode === 'fisik'/g,
  "(scanMode === 'fisik' || scanMode === 'manual')"
).replace(
  /\{scanMode === 'manual' && \([\s\S]*?<ManualScanInput[\s\S]*?\/>\s*\)\}/g,
  ""
);
fs.writeFileSync('src/App.tsx', newContent);
