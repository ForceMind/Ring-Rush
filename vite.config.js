import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        online: resolve(__dirname, 'online.html'),
        app: resolve(__dirname, 'app.html'),
        admin: resolve(__dirname, 'admin.html')
      }
    }
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
});
