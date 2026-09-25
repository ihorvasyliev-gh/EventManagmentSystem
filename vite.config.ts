import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  // Production: remove all console.* and debugger from the bundle
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : {},
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split heavy vendors for better caching
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (id.includes('exceljs')) return 'vendor-exceljs';
          if (id.includes('lucide-react')) return 'vendor-lucide';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react';
        },
      },
    },
  },
}));
