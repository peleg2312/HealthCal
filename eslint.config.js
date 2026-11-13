// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'supabase/functions/**/index.ts'],
  },
  {
    // vi.mock() calls must come before the imports they affect.
    files: ['**/*.test.ts'],
    rules: { 'import/first': 'off' },
  },
]);
