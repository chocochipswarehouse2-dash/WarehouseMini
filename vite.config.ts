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
        injectRegister: 'auto',
        manifestFilename: 'manifest.json',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}']
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
          prefer_related_applications: false,
          related_applications: [],
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
        }
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
