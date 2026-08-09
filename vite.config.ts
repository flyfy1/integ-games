import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base: base.endsWith('/') ? base : `${base}/`,
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        fallback: fileURLToPath(new URL('./404.html', import.meta.url))
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Integ Games',
        short_name: 'Integ Games',
        description: 'A calm, fast arcade in your browser.',
        theme_color: '#090D18',
        background_color: '#090D18',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,svg,woff2}']
      }
    })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts']
  }
});
