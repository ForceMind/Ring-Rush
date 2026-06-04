import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2015',
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
});
