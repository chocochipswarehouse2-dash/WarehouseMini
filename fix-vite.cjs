const fs = require('fs');
let content = fs.readFileSync('vite.config.ts', 'utf8');

content = content.replace(/icons: \[\s*{\s*src: 'icon-512\.png',\s*sizes: '192x192',\s*type: 'image\/png'\s*}\s*\]/, `icons: [
                {
                  src: 'icon-192.png',
                  sizes: '192x192',
                  type: 'image/png'
                }
              ]`);

content = content.replace(/icons: \[\s*{\s*src: 'icon-512\.png',\s*sizes: '192x192',\s*type: 'image\/png',\s*purpose: 'any'\s*},\s*{\s*src: 'icon-512\.png',\s*sizes: '192x192',\s*type: 'image\/png',\s*purpose: 'maskable'\s*},\s*{\s*src: 'icon-512\.png',\s*sizes: '512x512',\s*type: 'image\/png',\s*purpose: 'any'\s*},\s*{\s*src: 'icon-512\.png',\s*sizes: '512x512',\s*type: 'image\/png',\s*purpose: 'maskable'\s*}\s*\]/, `icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]`);

content = content.replace(/icons: \[\{ src: 'icon-512\.png', sizes: '192x192' \}\]/, `icons: [{ src: 'icon-192.png', sizes: '192x192' }]`);

content = content.replace(/screenshots: \[\s*{\s*src: 'icon-512\.png',\s*sizes: '512x512'/g, `screenshots: [\n            {\n              src: 'icon-512.png',\n              sizes: '512x512'`);

fs.writeFileSync('vite.config.ts', content);
