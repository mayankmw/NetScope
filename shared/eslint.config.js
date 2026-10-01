import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

// Shared code runs in both Node and the browser: only universal globals are allowed.
export default defineConfig([
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals['shared-node-browser'],
    },
  },
]);
