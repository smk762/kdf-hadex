import { defineConfig } from 'vite';
import { resolve } from 'path';
import copy from 'rollup-plugin-copy';

export default defineConfig({
  build: {
    lib: {
      entry: {
        panel: resolve(__dirname, 'src/entries/panel.ts'),
        cards: resolve(__dirname, 'src/entries/cards.ts')
      },
      formats: ['es']
    },
    rollupOptions: {
      // Do not attempt to bundle runtime-served absolute imports (e.g. /local/kdf-hadex/...)
      external: (id: string) => {
        return typeof id === 'string' && id.startsWith('/local/kdf-hadex/');
      },
      plugins: [
        copy({
          targets: [
            { src: 'vendor', dest: 'dist' },
            { src: 'kdf-styles.css', dest: 'dist' }
          ],
          hook: 'writeBundle',
          verbose: true
        })
      ],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      },
    },
    assetsDir: 'assets',
    outDir: 'dist',
    emptyOutDir: true
  }
});
