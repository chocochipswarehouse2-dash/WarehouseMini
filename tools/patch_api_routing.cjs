const fs = require('fs');

let v = fs.readFileSync('vite.config.ts', 'utf8');
if (!v.includes('navigateFallbackDenylist')) {
  v = v.replace(
    /navigateFallback: 'index\.html',(\r?\n)/,
    (m, nl) => `navigateFallback: 'index.html',${nl}          navigateFallbackDenylist: [/^\\/api\\//],${nl}`
  );
  fs.writeFileSync('vite.config.ts', v);
  console.log('vite.config.ts patched');
}

let j = fs.readFileSync('vercel.json', 'utf8');
if (!j.includes('(?!api/)')) {
  j = j.replace('"source": "/(.*)"', '"source": "/((?!api/).*)"');
  fs.writeFileSync('vercel.json', j);
  console.log('vercel.json patched');
}

