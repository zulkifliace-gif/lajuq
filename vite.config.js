import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('@supabase') || id.includes('@stripe')) return 'vendor-cloud';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor-core';
            return 'vendor-libs';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    allowedHosts: true,
    proxy: {
      // In dev mode, proxy /socket.io and /api from Vite :3000 → Backend :5000
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,           // Important: WebSocket support!
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});

