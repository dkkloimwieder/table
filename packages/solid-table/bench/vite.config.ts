import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [solid()],
  resolve: {
    alias: [
      {
        find: /^@tanstack\/solid-table\/native$/,
        replacement: fileURLToPath(
          new URL(
            process.env.BENCH_DISTRIBUTION
              ? '../dist/solid/native.js'
              : '../src/native.ts',
            import.meta.url,
          ),
        ),
      },
      ...(process.env.BENCH_DISTRIBUTION
        ? [
            {
              find: /^\.\/native-table$/,
              replacement: fileURLToPath(
                new URL('../dist/solid/native.js', import.meta.url),
              ),
            },
          ]
        : []),
    ],
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        features: fileURLToPath(new URL('features.html', import.meta.url)),
        grouping: fileURLToPath(new URL('grouping.html', import.meta.url)),
        virtualized: fileURLToPath(
          new URL('virtualized.html', import.meta.url),
        ),
      },
    },
    target: 'esnext',
    outDir: process.env.BENCH_DEVELOPMENT
      ? '../.bench-dev-dist'
      : process.env.BENCH_PROFILE
        ? '../.heap-dist'
        : process.env.BENCH_DISTRIBUTION
          ? '../.bench-package-dist'
          : '../.bench-dist',
    minify: process.env.BENCH_PROFILE ? false : undefined,
    sourcemap: Boolean(process.env.BENCH_PROFILE),
    emptyOutDir: true,
  },
})
