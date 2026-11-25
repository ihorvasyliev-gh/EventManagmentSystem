import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Optional jsPDF dependencies only used by doc.html()/addSvgAsImage() which this app never calls
const UNUSED_JSPDF_STUB_ID = '\0stub:unused-jspdf-dep';
const UNUSED_JSPDF_DEPS = new Set(['html2canvas', 'canvg', 'dompurify']);
const stubUnusedJsPdfDeps = (): Plugin => ({
  name: 'stub-unused-jspdf-deps',
  enforce: 'pre',
  resolveId(id) {
    if (id === UNUSED_JSPDF_STUB_ID || UNUSED_JSPDF_DEPS.has(id)) return UNUSED_JSPDF_STUB_ID;
  },
  load(id) {
    if (id === UNUSED_JSPDF_STUB_ID) return 'export default {};';
  },
});

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
  // fail the build of main instead so the previous deployment stays live. Pull request previews
  // (any other branch) have no keys set up and nothing live to protect: they still build, so
  // their check says whether the code builds on Cloudflare
  const isPreview = !!process.env.CF_PAGES_BRANCH && process.env.CF_PAGES_BRANCH !== 'main';
  if (process.env.CF_PAGES && mode === 'production' && !isPreview) {
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
    resolve: {
      alias: {
        html2canvas: UNUSED_JSPDF_STUB_ID,
        canvg: UNUSED_JSPDF_STUB_ID,
        dompurify: UNUSED_JSPDF_STUB_ID,
      },
    },
    plugins: [react(), stubUnusedJsPdfDeps()],
    // Which build an error report came from (Cloudflare Pages sets the commit at build time)
    define: {
      __APP_RELEASE__: JSON.stringify((process.env.CF_PAGES_COMMIT_SHA || 'local').slice(0, 7)),
    },
    // Production: strip noisy logs & debugger while preserving console.warn and console.error
    esbuild: mode === 'production'
      ? { pure: ['console.log', 'console.debug', 'console.info'], drop: ['debugger'] }
      : {},
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
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor-react';
          },
        },
      },
    },
  };
});
