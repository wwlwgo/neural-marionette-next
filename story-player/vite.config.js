import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  base: process.env.STORY_BASE_PATH || '/',
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        moonPreview: fileURLToPath(new URL('./moon-preview.html', import.meta.url)),
      },
    },
  },
});
