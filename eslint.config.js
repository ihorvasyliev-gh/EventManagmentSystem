// Lint rules for the app, the Cloudflare functions and the tests (`npm run lint`).
// Kept to rules that catch real bugs: hooks misuse and stale effect dependencies, unused
// code, and type-only imports (the tests run TypeScript in Node, which needs them).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'public/sw.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain scripts served as they are (public/)
    files: ['**/*.js'],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // The Supabase rows and a few browser APIs are untyped; `any` there is deliberate
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
);
