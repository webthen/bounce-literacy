import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 8088,
    open: true,
    host: true
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
