import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'drizzle'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // The scanner is a pure engine (spec 2.1): no database, queue or API imports,
    // and every HTTP request goes through net/guarded-fetch.ts (spec P1-02).
    files: ['src/scanner/**/*.ts'],
    ignores: ['src/scanner/net/guarded-fetch.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Use createGuardedFetch() from src/scanner/net/guarded-fetch.ts.',
        },
        { name: 'XMLHttpRequest', message: 'Use createGuardedFetch().' },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'undici',
            'node:http',
            'node:https',
            'http',
            'https',
            'axios',
            'node-fetch',
            'got',
          ].map((name) => ({
            name,
            message: 'Use createGuardedFetch() from src/scanner/net/guarded-fetch.ts.',
          })),
          patterns: [
            {
              group: [
                '**/db/**',
                '**/db',
                '**/routes/**',
                '**/middleware/**',
                '**/app.js',
                'pg',
                'drizzle-orm*',
              ],
              message: 'The scanner must not depend on the database or the API.',
            },
          ],
        },
      ],
    },
  },
  {
    // supertest response bodies are untyped by design.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  { files: ['eslint.config.js'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
