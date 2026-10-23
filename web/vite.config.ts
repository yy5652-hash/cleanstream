import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served from GitHub Pages at /cleanstream/; the dev server uses the same base so paths match.
export default defineConfig({
  base: '/cleanstream/',
  plugins: [react()],
  worker: { format: 'es' },
})
