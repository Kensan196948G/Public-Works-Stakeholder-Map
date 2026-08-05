import { defineConfig, devices } from '@playwright/test';

/**
 * E2E テスト（Issue #35・Playwright）。
 * 検証用 WebUI（Node dev server・fixture モード）を自動起動してテストする。
 * 実行: npm run test:e2e
 */
export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:8788',
    headless: true,
    // ヘッドレス Chromium で WebGL（MapLibre）を有効化する
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    // PORT を固定して待機 URL と一致させる（空きポート自動選択は Playwright から検出不能のため）
    command: 'PORT=8788 npm run webui',
    url: 'http://localhost:8788/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
