const fs = require('fs');
let code = fs.readFileSync('src/components/Logo.tsx', 'utf-8');

// To ensure the browser doesn't cache the old logo, let's append a query string
code = code.replace(
  'src="/logo.png"',
  'src="/logo.png?v=2"'
);

fs.writeFileSync('src/components/Logo.tsx', code);
console.log('Fixed Logo cache bust');
