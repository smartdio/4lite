import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const sharedServerConfig = {
  host: '0.0.0.0',
  port: 6175,
  strictPort: true,
};

export default defineConfig({
  server: sharedServerConfig,
  preview: sharedServerConfig,
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        about: fileURLToPath(new URL('./about/index.html', import.meta.url)),
        help: fileURLToPath(new URL('./help/index.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-vendor';
        },
      },
    },
  },
});
