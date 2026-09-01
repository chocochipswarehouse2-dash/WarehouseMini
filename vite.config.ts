import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: '/WarehouseMini/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: process.env.NODE_ENV === 'production' ? 'auto' : null,
        manifestFilename: 'manifest.json',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          importScripts: ['pwa-extras.js'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/[a-z0-9]+\.supabase\.co\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-api-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        manifest: {
          id: '/WarehouseMini/',
          name: 'Warehouse Mini',
          short_name: 'Warehouse Mini',
          description: 'Aplikasi Scanner Barcode & WMS Warehouse Management System dengan sinkronisasi Supabase real-time',
          theme_color: '#b7550e',
          background_color: '#0f172a',
          display: 'standalone',
          display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
          orientation: 'portrait',
          scope: '/WarehouseMini/',
          start_url: '/WarehouseMini/',
          lang: 'id',
          dir: 'ltr',
          categories: ['business', 'productivity', 'utilities'],
          iarc_rating_id: 'e-84b0d5f2-7ce9-4b8a-9a91-4d32e9d2ab82',
          prefer_related_applications: false,
          related_applications: [
            {
              platform: 'webapp',
              url: 'https://chocochipswarehouse2-dash.github.io/WarehouseMini/manifest.json'
            }
          ],
          scope_extensions: [{ origin: '*.github.io' }],
          note_taking: {
            new_note_url: '/WarehouseMini/'
          },
          edge_side_panel: {
            preferred_width: 400
          },
          widgets: [
            {
              name: 'Scanner Widget',
              short_name: 'Scanner',
              description: 'Quick access to Warehouse Scanner',
              tag: 'scanner-widget',
              template_url: '/WarehouseMini/',
              ms_ac_template: '/WarehouseMini/',
              data: '/WarehouseMini/',
              type: 'application/json',
              icons: [
                {
                  src: 'icon-192.png',
                  sizes: '192x192',
                  type: 'image/png'
                }
              ]
            }
          ],
          file_handlers: [
            {
              action: '/WarehouseMini/',
              accept: {
                'text/csv': ['.csv']
              }
            }
          ],
          share_target: {
            action: '/WarehouseMini/',
            method: 'GET',
            enctype: 'application/x-www-form-urlencoded',
            params: {
              title: 'title',
              text: 'text',
              url: 'url'
            }
          },
          launch_handler: {
            client_mode: 'navigate-existing'
          },
          protocol_handlers: [
            {
              protocol: 'web+wms',
              url: '/WarehouseMini/?query=%s'
            }
          ],
          icons: [
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
          ],
          screenshots: [
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Warehouse Mini Dashboard'
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Warehouse Mini Mobile Scanner'
            }
          ],
          shortcuts: [
            {
              name: 'Scan Barcode',
              short_name: 'Scan',
              description: 'Buka pemindai',
              url: '/WarehouseMini/',
              icons: [{ src: 'icon-192.png', sizes: '192x192' }]
            }
          ]
        } as any
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
