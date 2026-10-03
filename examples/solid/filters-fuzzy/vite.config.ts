import { defineConfig } from 'vite'
import solidPlugin from '@solidjs/vite-plugin'
export default defineConfig({
  resolve: {
    alias: {
      '@tanstack/match-sorter-utils': new URL(
        '../../../packages/match-sorter-utils/src/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  server: {
    port: 7777,
    allowedHosts: true,
  },
  plugins: [solidPlugin()],
  build: { target: 'esnext' },
})
