import re

with open('vite.config.ts', 'r') as f:
    content = f.read()

import_statement = "import { VitePWA } from 'vite-plugin-pwa';\n"
if "vite-plugin-pwa" not in content:
    content = import_statement + content
    
    # Add VitePWA() to plugins
    plugins_bad = "plugins: [react(), tailwindcss()],"
    plugins_good = """plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}']
        },
        manifest: {
          name: 'WMS Scanner Gudang Pintar',
          short_name: 'WMS Scanner',
          description: 'Aplikasi Scanner Barcode & WMS Warehouse Management System dengan sinkronisasi Supabase real-time',
          theme_color: '#b7550e',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/WarehouseMini/',
          start_url: '/WarehouseMini/',
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],"""
    content = content.replace(plugins_bad, plugins_good)
    
    with open('vite.config.ts', 'w') as f:
        f.write(content)
