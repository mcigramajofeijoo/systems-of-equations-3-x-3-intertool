import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build` genera un único index.html autocontenido (JS y CSS inline,
// sin assets externos) en la RAÍZ del repositorio, listo para GitHub Pages.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  server: { port: 5183 },
  build: {
    outDir: '..',
    emptyOutDir: false,
  },
})
