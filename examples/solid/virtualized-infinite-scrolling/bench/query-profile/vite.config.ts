import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [solid()],
  resolve: {
    alias: {
      '@tanstack/solid-table': fileURLToPath(
        new URL(
          process.env.BENCH_DISTRIBUTION
            ? '../../../../../packages/solid-table/dist/solid/index.jsx'
            : '../../../../../packages/solid-table/src/index.tsx',
          import.meta.url,
        ),
      ),
    },
  },
  build: {
    target: 'esnext',
    minify: false,
    sourcemap: true,
    outDir: process.env.BENCH_DISTRIBUTION ? '.dist-package' : '.dist',
    emptyOutDir: true,
  },
})
