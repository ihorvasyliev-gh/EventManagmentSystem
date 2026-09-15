# Post-Optimization Setup Instructions

## Required Steps After Code Changes

### 1. Install Dependencies

You need to install the required npm packages. Run this command in your project directory:

```bash
npm install --save-dev vite-plugin-compression rollup-plugin-visualizer @fontsource/inter @fontsource/outfit
```

### 2. Download and Setup Local Fonts (Optional - for even better performance)

If you want to host fonts locally instead of using fontsource package:

1. Download Inter and Outfit fonts from Google Fonts
2. Place them in `public/fonts/` directory  
3. Create `fonts.css` file with `@font-face` declarations
4. Import in `index.css`

**OR** use the fontsource packages (easier):

Add to `index.css`:
```css
@import '@fontsource/inter/300.css';
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';
@import '@fontsource/outfit/400.css';
@import '@fontsource/outfit/500.css';
@import '@fontsource/outfit/600.css';
@import '@fontsource/outfit/700.css';
```

### 3. Enable Compression Plugins (Optional but Recommended)

In `vite.config.ts`, uncomment the compression plugin lines (lines 19-34).

### 4. Build and Test

```bash
# Build the project
npm run build

# Preview the production build locally
npm run preview
```

### 5. Verify Optimizations

After building, check:

1. **Bundle sizes** in the terminal output - should be significantly smaller
2. **Service Worker** registered in DevTools → Application tab
3. **Caching** working in DevTools → Network tab (assets from disk cache)
4. Run **Lighthouse** audit - aim for 90+ performance score

### 6. Deploy to Cloudflare Pages

Your `_headers` file is already configured for Cloudflare Pages with:
- 1-year immutable caching for static assets
- No-cache for HTML (always fresh)
- Proper security headers

Just push to GitHub and Cloudflare Pages will automatically deploy with optimized caching.

---

## Performance Gains Expected

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| First Load (JS) | ~500KB + 300KB CDN | ~300KB | -40% |
| Subsequent Loads | ~500KB | ~5KB (cache) | -99% |
| External Requests | 3 (CDNs) | 0 | -100% |
| Time to Interactive | ~3s | <1.5s | -50% |

---

## Rollback if Needed

If Service Worker causes issues:

1. Update `sw-register.ts`:
```typescript
export function registerServiceWorker(): void {
  // Disabled temporarily
  return;
}
```

2. Or unregister:
```typescript
import { unregisterServiceWorker } from './sw-register';
unregisterServiceWorker();
```

---

## Additional React Optimizations (Future Work)

Consider wrapping these components with `React.memo`:
- `Navbar` (if props rarely change)
- `EventFilters` (heavy component)
- `CalendarView` (heavy component)

And add `useCallback` for:
- Event handlers passed as props
- Functions in dependency arrays of useEffect/useMemo

These were not added automatically to avoid breaking changes, but can improve performance further.
