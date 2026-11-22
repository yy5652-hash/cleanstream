import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { serviceWorker } from './sw-plugin.ts'

// Served from GitHub Pages at /cleanstream/; the dev server uses the same base so paths match. BASE overrides it for a trial copy.
export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  base: process.env.BASE ?? '/cleanstream/',
  plugins: [react(), tailwindcss(), serviceWorker(fileURLToPath(new URL('./public', import.meta.url)))],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es' },
})
