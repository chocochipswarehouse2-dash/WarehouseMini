const fs = require('fs');

let content = fs.readFileSync('vite.config.ts', 'utf8');

// Replace base logic to use / by default on Vercel
content = content.replace(
  /const base = process.env.VITE_BASE \|\| \(command === 'serve' \? '\/' : \(isGithubPages \? '\/WarehouseMini\/' : '\.\/'\)\);/,
  `// Automatically detect Vercel environment (VERCEL=1)
  const isVercel = !!process.env.VERCEL;
  const base = process.env.VITE_BASE || (command === 'serve' || isVercel ? '/' : (isGithubPages ? '/WarehouseMini/' : './'));`
);

// Add manualChunks to build.rollupOptions
const chunkConfig = `
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              if (id.includes('html5-qrcode')) {
                return 'vendor-scanner';
              }
              if (id.includes('react') || id.includes('react-dom')) {
                return 'vendor-react';
              }
              return 'vendor-core'; // all other deps
            }
          }
        }
      }
    },
    server: {
`;

content = content.replace('    server: {', chunkConfig);

fs.writeFileSync('vite.config.ts', content, 'utf8');
console.log('Updated vite.config.ts');
