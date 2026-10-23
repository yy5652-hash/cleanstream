import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { serviceWorker } from './sw-plugin.ts'

// Served from GitHub Pages at /cleanstream/; the dev server uses the same base so paths match.
export default defineConfig({
  base: '/cleanstream/',
  plugins: [react(), serviceWorker(fileURLToPath(new URL('./public', import.meta.url)))],
  worker: { format: 'es' },
})
