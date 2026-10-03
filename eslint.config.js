import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-smoke',
      // tests/populated.mjs hata ayıklarken küçültmesiz bir derleme kuruyor;
      // derleme çıktısı lint'e girmez.
      'dist-unminified',
      'dev-dist',
      'node_modules',
      '.firebase',
      'public',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Unused imports are auto-removable; unused locals are only warned about
      // so a work-in-progress edit does not fail the build.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      // The codebase still carries `any` from an earlier automated refactor.
      // Warn rather than error so it can be paid down module by module.
      '@typescript-eslint/no-explicit-any': 'warn',

      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The edge functions' shared modules. They run in Deno and in Node (the
    // tests import the same files), and they use web platform globals —
    // TextDecoder, Blob, DecompressionStream — which both runtimes have and
    // the default config knows about in neither.
    files: ['supabase/functions/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['vite.config.ts', 'scripts/**/*.{js,mjs}', 'tests/**/*.{js,mjs}', 'eslint.config.js'],
    // Test files are Node, but browser-context callbacks (Playwright's
    // addInitScript and friends) are inlined in them, so both apply.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'no-console': 'off',
    },
  },
  prettier,
);
