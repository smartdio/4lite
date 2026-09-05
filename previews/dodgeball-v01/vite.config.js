import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'

const previewRoot = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const threeRoot = realpathSync(new URL('../../node_modules/three/', import.meta.url))

export default defineConfig({
  root: previewRoot,
  publicDir: false,
  cacheDir: `${projectRoot}artifacts/dodgeball-v01/.vite`,
  server: { host: '127.0.0.1', port: 6176, strictPort: true, fs: { allow: [projectRoot, threeRoot] } },
  build: {
    outDir: `${projectRoot}artifacts/dodgeball-v01/site`, emptyOutDir: true,
    rollupOptions: { output: { manualChunks: id => id.includes('/node_modules/three/') ? 'three-vendor' : undefined } },
  },
})
