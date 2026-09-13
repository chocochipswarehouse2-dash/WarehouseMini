const fs = require('fs');
let code = fs.readFileSync('vite.config.ts', 'utf-8');

code = code.replace(/icon-192\.png/g, 'logo.png');
code = code.replace(/icon-512\.png/g, 'logo.png');

// Ensure we still pass the right sizes to appease PWA requirements, even if it's the same file
fs.writeFileSync('vite.config.ts', code);
console.log('Fixed vite config to use logo.png');
