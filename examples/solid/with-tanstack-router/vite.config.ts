import { defineConfig } from 'vite'
import solidPlugin from '@solidjs/vite-plugin'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'

export default defineConfig({
  server: {
    port: 7777,
    allowedHosts: true,
  },
  plugins: [solidPlugin(), TanStackRouterVite({ target: 'solid' })],
  build: {
    target: 'esnext',
  },
})
