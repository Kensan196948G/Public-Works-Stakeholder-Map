import { defineConfig, devices } from '@playwright/test';

/**
 * E2E テスト（Issue #35・Playwright）。
 * 検証用 WebUI（Node dev server・fixture モード）を自動起動してテストする。
 * 実行: npm run test:e2e
 *
 * ポートは環境変数 E2E_PORT で上書きできる（既定 8788）。
 * ローカルで他のプロセスが 8788 を使用している場合は、
 *   E2E_PORT=8790 npm run test:e2e
 * のように別ポートを指定する。
 */
const E2E_PORT = process.env.E2E_PORT ?? '8788';

export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    headless: true,
    // ヘッドレス Chromium で WebGL（MapLibre）を有効化する
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    // PORT を固定して待機 URL と一致させる（空きポート自動選択は Playwright から検出不能のため）
    command: `PORT=${E2E_PORT} npm run webui`,
    url: `http://localhost:${E2E_PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
