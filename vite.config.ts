import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// Uncomment after installing: npm install --save-dev vite-plugin-compression rollup-plugin-visualizer
// import viteCompression from 'vite-plugin-compression';
// import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения
  // VITE_ переменные автоматически доступны через import.meta.env в клиентском коде
  // GEMINI_API_KEY загружаем отдельно, так как он без префикса VITE_
  const env = loadEnv(mode, '.', '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
      // Uncomment after installing vite-plugin-compression
      // viteCompression({
      //   algorithm: 'brotliCompress',
      //   ext: '.br',
      //   threshold: 1024,
      // }),
      // viteCompression({
      //   algorithm: 'gzip',
      //   ext: '.gz',
      //   threshold: 1024,
      // }),
      // Uncomment for bundle analysis: npm run build
      // visualizer({
      //   filename: './dist/stats.html',
      //   open: false,
      //   gzipSize: true,
      //   brotliSize: true,
      // }),
    ],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      emptyOutDir: true,
      // Increase chunk size warning limit
      chunkSizeWarningLimit: 1000,
      // Enable CSS code splitting
      cssCodeSplit: true,
      // Optimize assets
      assetsInlineLimit: 4096, // Inline assets smaller than 4kb
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
        output: {
          manualChunks: (id) => {
            // Split vendor chunks for better caching
            if (id.includes('node_modules')) {
              if (id.includes('exceljs')) {
                return 'vendor-exceljs';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-lucide';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) {
                return 'vendor-react';
              }
              // Allow other dependencies to be handled by Vite/Rollup automatically
              // This avoids circular dependencies caused by a generic 'vendor' chunk
            }
          },
          // Optimize chunk file names for better caching
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
      // Minification settings - using esbuild (faster and built-in)
      minify: 'esbuild',
      // Production: remove all console.* and debugger from the bundle
      esbuild: {
        ...(mode === 'production' ? { drop: ['console', 'debugger'] } : {}),
      },
    },
    define: {
      // Только переменные БЕЗ префикса VITE_ нужно определять вручную
      // VITE_ переменные автоматически доступны через import.meta.env
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    // Optimize dependencies
    optimizeDeps: {
      include: ['react', 'react-dom', '@supabase/supabase-js'],
    },
  };
});

