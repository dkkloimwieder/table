import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'

const path = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url))
export default defineConfig({
  root: path('.'),
  plugins: [
    solid(),
    {
      name: 'editing-fixture-module-audit',
      generateBundle(_options, bundle) {
        this.emitFile({
          type: 'asset',
          fileName: 'modules.json',
          source: JSON.stringify(
            Object.values(bundle).flatMap((item) =>
              item.type === 'chunk' ? Object.keys(item.modules) : [],
            ),
            null,
            2,
          ),
        })
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: /^@tanstack\/solid-table\/native$/,
        replacement: path(
          process.env.BENCH_DISTRIBUTION
            ? '../../dist/solid/native.js'
            : '../../src/native.ts',
        ),
      },
    ],
    dedupe: ['solid-js', '@solidjs/web'],
  },
  build: {
    outDir: process.env.BENCH_DEVELOPMENT
      ? '.dist-dev'
      : process.env.BENCH_DISTRIBUTION
        ? '.dist-package'
        : '.dist',
    target: 'esnext',
    minify: process.env.BENCH_PROFILE ? false : undefined,
    sourcemap: Boolean(process.env.BENCH_PROFILE),
  },
})
