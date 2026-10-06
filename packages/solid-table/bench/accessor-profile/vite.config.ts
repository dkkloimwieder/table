import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [solid()],
  resolve: {
    alias: {
      '@tanstack/solid-table/native': fileURLToPath(
        new URL(
          process.env.BENCH_DISTRIBUTION
            ? '../../dist/solid/native.js'
            : '../../src/native.ts',
          import.meta.url,
        ),
      ),
    },
  },
  build: {
    target: 'esnext',
    outDir: process.env.BENCH_DISTRIBUTION ? '.dist-package' : '.dist',
    emptyOutDir: true,
  },
})
