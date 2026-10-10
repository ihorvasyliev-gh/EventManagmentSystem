import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The headers public/_headers gives every page on Cloudflare (the `/*` block), so
 * `npm run preview` and the end-to-end tests run under the same Content-Security-Policy.
 */
const siteWideHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  let inBlock = false;
  for (const line of readFileSync('public/_headers', 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inBlock = line.trim() === '/*';
      continue;
    }
    const at = line.indexOf(':');
    if (inBlock && at > 0) headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  // The preview server is plain http on localhost
  delete headers['Strict-Transport-Security'];
  if (headers['Content-Security-Policy']) {
    headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(/;\s*upgrade-insecure-requests/, '');
  }
  return headers;
};

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
    preview: {
      headers: siteWideHeaders(),
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
