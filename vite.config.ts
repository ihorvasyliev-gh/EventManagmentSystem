import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // On Cloudflare Pages (CF_PAGES=1) a missing key would ship a bundle that throws on load:
  // fail the build instead so the previous deployment stays live
  if (process.env.CF_PAGES && mode === 'production') {
    const env = loadEnv(mode, '.', '');
    const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing build environment variables: ${missing.join(', ')}`);
    }
  }

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    // Which build an error report came from (Cloudflare Pages sets the commit at build time)
    define: {
      __APP_RELEASE__: JSON.stringify((process.env.CF_PAGES_COMMIT_SHA || 'local').slice(0, 7)),
    },
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
  };
});
