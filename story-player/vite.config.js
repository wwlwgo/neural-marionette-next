import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        moonPreview: fileURLToPath(new URL('./moon-preview.html', import.meta.url)),
      },
    },
  },
});
