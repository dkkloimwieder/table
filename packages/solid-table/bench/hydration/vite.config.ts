import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import solid from '@solidjs/vite-plugin'

const path = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url))
export default defineConfig({
  root: path('.'),
  plugins: [solid({ ssr: true, observe: true, performanceTracks: false })],
  build: {
    outDir: process.env.HYDRATION_SERVER ? '.dist-server' : '.dist',
    target: 'esnext',
    ssr: process.env.HYDRATION_SERVER ? path('server.tsx') : false,
  },
})
