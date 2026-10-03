import { defineConfig } from 'vite'
import solidPlugin from '@solidjs/vite-plugin'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  server: {
    port: 7777,
    allowedHosts: true,
  },
  plugins: [solidPlugin()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        native: fileURLToPath(new URL('./native.html', import.meta.url)),
      },
    },
  },
})
