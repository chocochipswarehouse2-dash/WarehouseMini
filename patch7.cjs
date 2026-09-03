const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const lines = code.split('\n');
for (let i = 825; i < 845; i++) {
  if (lines[i] && lines[i].includes(')}')) {
    lines[i] = '            </div></div></div>)}';
    lines[i-1] = '';
    lines[i-2] = '';
    lines[i-3] = '';
    lines[i-4] = '';
    lines[i-5] = '';
    lines[i-6] = '';
  }
}
fs.writeFileSync('src/App.tsx', lines.join('\n'));
