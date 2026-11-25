import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Keep the Vite cache inside the project.
const cacheDir = path.resolve(__dirname, '../../.cache/vite-panel');

export default defineConfig(({ mode }) => ({
  base: './',
  cacheDir,
  plugins: [react()],
  // `vite --mode mock` previews the panel locally without Jira (see dev/mockBridge.js).
  resolve: mode === 'mock' ? { alias: { '@forge/bridge': path.resolve(__dirname, 'dev/mockBridge.js') } } : {},
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 12000,
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/node_modules/],
    },
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('onnxruntime-web')) return 'ort';
          if (id.includes('@paddleocr')) return 'paddle';
          if (id.includes('opencv')) return 'opencv';
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['clipper-lib', 'js-yaml', '@paddleocr/paddleocr-js'],
    exclude: ['onnxruntime-web'],
  },
  assetsInclude: ['**/*.wasm'],
}));
