// Lint rules for `npm run lint`: real mistakes only (undefined names, unused
// code, unreachable branches), no style opinions.
import globals from 'globals';

export default [
  { ignores: ['dist/', 'shots/', 'node_modules/'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-fallthrough': 'error',
      'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
      'no-constant-binary-expression': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  // Filled in by build.js when the service worker is written.
  { files: ['src/sw.js'], languageOptions: { globals: { __FILES__: 'readonly' } } },
];
