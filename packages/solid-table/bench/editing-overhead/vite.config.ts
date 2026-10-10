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
      name: 'editing-overhead-module-audit',
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
    target: 'esnext',
    outDir: process.env.BENCH_DISTRIBUTION ? '.dist-package' : '.dist',
    minify: false,
    sourcemap: true,
  },
})
