import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

export default defineConfig({
  // Relative base: the build works under any GitHub Pages path
  // (user.github.io/<repo>/) without knowing the repository name.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __SINGLE_FILE__: 'false',
  },
  plugins: [
    solid(),
    VitePWA({
      // 'prompt': a new version never reloads the page under the user;
      // the app shows a toast and the user decides when to update.
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'OpenCircuit',
        short_name: 'OpenCircuit',
        description:
          'Circuit simulator: electronics, Arduino, industrial IEC and PLC. Runs fully offline.',
        lang: 'es',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        theme_color: '#1a1e1c',
        background_color: '#121514',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Everything the app needs is precached, including the WASM
        // toolchain and firmware assets added in later phases.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2,wasm,json,hex,webmanifest}'],
        maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
