import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE = sous-chemin GitHub Pages, ex. /cosplay-manager/ (défini par le workflow de déploiement)
const base = process.env.BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg'],
      manifest: {
        name: 'Cosplay Manager',
        short_name: 'Cosplay',
        description: 'Planifier et suivre la création de ses cosplays, pièce par pièce.',
        lang: 'fr',
        theme_color: '#6b3fa0',
        background_color: '#faf7fc',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/__/],
      },
    }),
  ],
  // Délai large : certains tests génèrent un ZIP ou un PowerPoint, lents sur une machine chargée.
  test: { environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 30_000 },
});
