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
      // チーム開発用の git worktree（リポジトリの複製）— 本体と二重に lint しない
      '.worktrees/**',
      // ローカル検証用の一時ファイル（gitignore 済み）
      '.tmp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // worktree 等でリポジトリ複製が併存しても TSConfig の基準を一意に固定する。
    // 未指定だと typescript-eslint が候補を決められず全ファイルが Parsing error になる。
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
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
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        performance: 'readonly',
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
