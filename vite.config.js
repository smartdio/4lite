import { defineConfig } from 'vite';
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const sharedServerConfig = {
  host: '0.0.0.0',
  port: 6175,
  strictPort: true,
};

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

function collectHtmlInputs(directory, prefix) {
  if (!existsSync(directory)) return {};
  const inputs = {};
  const visit = current => {
    for (const entry of readdirSync(current, {withFileTypes: true})) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      if (entry.isFile() && entry.name === 'index.html') {
        const key = `${prefix}-${relative(directory, path).replaceAll(/[\\/]/g, '-').replace(/-index\.html$/, '') || 'index'}`;
        inputs[key] = path;
      }
    }
  };
  visit(directory);
  return inputs;
}

export default defineConfig({
  server: sharedServerConfig,
  preview: sharedServerConfig,
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        english: fileURLToPath(new URL('./en/index.html', import.meta.url)),
        about: fileURLToPath(new URL('./about/index.html', import.meta.url)),
        help: fileURLToPath(new URL('./help/index.html', import.meta.url)),
        englishAbout: fileURLToPath(new URL('./en/about/index.html', import.meta.url)),
        englishHelp: fileURLToPath(new URL('./en/help/index.html', import.meta.url)),
        ...collectHtmlInputs(join(projectRoot, 'stories'), 'stories'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-vendor';
        },
      },
    },
  },
});
