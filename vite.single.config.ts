import { defineConfig, type Plugin } from 'vite';
import solid from 'vite-plugin-solid';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import pkg from './package.json';

/**
 * Single-file build: the whole app in one .html that works when opened
 * straight from disk, with no server. Workers are embedded in the page,
 * there is no service worker, and the Arduino compiler is left out (it is
 * 28 MB of separate files), so sketches cannot be compiled in this version.
 */

/** Turns `new Worker(new URL('./x.ts', import.meta.url), ...)` into an embedded worker. */
function inlineWorkers(): Plugin {
  const pattern = /new Worker\(\s*new URL\(\s*'(\.\/[\w.-]+\.ts)',\s*import\.meta\.url\s*\)\s*,\s*(\{[^}]*\})\s*\)/g;
  return {
    name: 'opencircuit-inline-workers',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/src/') || !code.includes('new Worker(')) return null;
      let index = 0;
      const imports: string[] = [];
      const next = code.replace(pattern, (_match, path: string, options: string) => {
        const name = `__InlineWorker${index++}`;
        imports.push(`import ${name} from '${path}?worker&inline';`);
        return `new ${name}(${options})`;
      });
      return index === 0 ? null : { code: `${imports.join('\n')}\n${next}`, map: null };
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __SINGLE_FILE__: 'true',
  },
  resolve: {
    alias: {
      'virtual:pwa-register': fileURLToPath(new URL('./src/pwa/no-pwa.ts', import.meta.url)),
    },
  },
  plugins: [inlineWorkers(), solid(), viteSingleFile()],
  worker: {
    // Classic workers: a page opened from disk has no origin, and browsers
    // refuse to start module workers from it.
    format: 'iife',
    plugins: () => [solid()],
  },
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist-single',
    emptyOutDir: true,
    sourcemap: false,
  },
});
