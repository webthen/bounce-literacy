import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 8088,
    open: true,
    host: true,
    proxy: {
      '/api/fish-tts': {
        target: 'https://api.fish.audio',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/fish-tts/, '/v1/tts')
      }
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
});
