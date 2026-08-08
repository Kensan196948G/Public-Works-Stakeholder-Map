// Flat config: TypeScript strict linting across all workspaces.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-types/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      'coverage/**',
      // design-sync のローカル生成物（gitignore 済み・CI 対象外）— lint 対象から除外して CI と整合させる
      'ds-bundle/**',
      '.ds-sync/**',
      '.design-sync/**',
      // ClaudeOS 運用ファイル（アプリコードではない）
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node で実行するスクリプト（seed 生成・CI 検証等）
    files: ['scripts/**/*.mjs', '.github/scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Domain logic must stay explainable — forbid silent any-escape hatches.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
