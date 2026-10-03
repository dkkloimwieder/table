import { defineConfig } from 'vite'
import solidPlugin from '@solidjs/vite-plugin'

export default defineConfig({
  server: {
    port: 7777,
    allowedHosts: true,
  },
  plugins: [solidPlugin()],
  build: {
    target: 'esnext',
  },
})
