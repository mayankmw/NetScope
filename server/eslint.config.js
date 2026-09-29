import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['coverage']),
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Express error handlers must declare 4 params even when `next` is unused.
      'no-unused-vars': ['error', { argsIgnorePattern: '^(_|next$)' }],
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
]);
