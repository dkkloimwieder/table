import { defineConfig } from 'tsdown'
import solid from '@solidjs/vite-plugin'

const shared = {
  entry: [
    './src/index.tsx',
    './src/native.ts',
    './src/static-functions.ts',
    './src/experimental-worker-plugin.ts',
    './src/flex-render.tsx',
  ],
  format: ['esm'] as const,
  unbundle: true,
  dts: true,
  sourcemap: false,
  clean: false,
  minify: false,
  fixedExtension: false,
  exports: false,
}

export default defineConfig([
  { ...shared, plugins: [solid()], outDir: 'dist' },
  {
    ...shared,
    plugins: [solid({ solid: { generate: 'ssr' } })],
    outDir: 'dist/server',
    dts: false,
  },
])
