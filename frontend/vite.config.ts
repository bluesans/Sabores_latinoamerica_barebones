import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/sabores-barebones/',
  plugins: [react()],
  server: {
    proxy: {
      '/sabores-barebones/api': {
        target: 'http://localhost',
        changeOrigin: false,
      },
    },
  },
  preview: {
    proxy: {
      '/sabores-barebones/api': {
        target: 'http://localhost',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
