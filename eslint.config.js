import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'coverage/', 'test-results/', 'playwright-report/']
  },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    files: ['server/**/*.js', 'test/**/*.js', 'scripts/**/*.js', 'playwright.config.js'],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: globals.browser
    }
  }
];
