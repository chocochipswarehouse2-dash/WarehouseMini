const fs = require('fs');
let types = fs.readFileSync('src/types.ts', 'utf8');
types = types.replace(/\s*\| 'tarikan_md'/, '');
fs.writeFileSync('src/types.ts', types);
