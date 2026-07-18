import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each workspace keeps its tests next to sources under test/.
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'data/fixtures/test/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
    },
  },
});
