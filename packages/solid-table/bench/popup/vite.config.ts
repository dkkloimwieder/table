import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'
import { portSelect } from './port.ts'

const path = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url))
export default defineConfig({
  root: path('.'),
  cacheDir: path('.input/.vite'),
  // Keep the scroll ownership repair in the development transform pipeline.
  optimizeDeps: { exclude: ['@solid-primitives/scroll'] },
  plugins: [
    {
      name: 'kobalte-select-solid2-port',
      enforce: 'pre',
      async load(id) {
        id = id.split('?')[0]!
        if (process.env.BENCH_KOBALTE_UNPATCHED) return
        if (id.includes('/@solid-primitives/scroll/dist/preventScroll.js'))
          return portSelect(await readFile(id, 'utf8'), id)
        if (!id.includes('/.input/kobalte/')) return
        if (
          /\/(selection\/create-selectable-(item|collection)\.ts|select\/select-trigger\.tsx|popper\/popper-positioner\.tsx|polymorphic\/polymorphic\.tsx|dismissable-layer\/dismissable-layer\.tsx)$/.test(
            id,
          )
        )
          return portSelect(await readFile(id, 'utf8'), id)
        return undefined
      },
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
    solid({ performanceTracks: false }),
  ],
  resolve: {
    alias: [
      {
        find: 'table-popup-owned-events',
        replacement: path('ownedSelectEvents.ts'),
      },
      {
        find: /^@kobalte\/core\/select$/,
        replacement: path('.input/kobalte/packages/core/src/select/index.tsx'),
      },
      {
        find: /^@kobalte\/utils$/,
        replacement: path('.input/kobalte/packages/utils/src/index.ts'),
      },
      {
        find: /^@tanstack\/solid-table\/native$/,
        replacement: path(
          process.env.BENCH_DISTRIBUTION
            ? '../../dist/solid/native.js'
            : '../../src/native.ts',
        ),
      },
    ],
    dedupe: ['solid-js', '@solidjs/web', '@solidjs/signals'],
  },
  server: {
    fs: { allow: [path('../../../../..'), path('.input/node_modules')] },
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
