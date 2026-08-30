import { expect, test } from '@playwright/test';

/**
 * 主要フロー E2E（Issue #35）:
 * 免責表示 → 検索 → 絞り込み → CSV/印刷 → フィードバック → URL 復元
 */

test('FR-007: 免責文が常時表示される', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByText(/緊急連絡には使用しないでください/),
  ).toBeVisible();
});

test('検索 → 候補カード表示 → 絞り込みツールバー', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '候補を検索' }).click();

  const cards = page.locator('.candidate-card');
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  // 絞り込みツールバーと件数表示（FR-008）
  await expect(page.getByRole('group', { name: '候補一覧の絞り込み' })).toBeVisible();
  await expect(page.getByText(/表示 \d+ \/ \d+ 件/)).toBeVisible();

  // 出力ボタン（FR-010）
  await expect(page.getByRole('button', { name: /CSV 出力/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /印刷 \/ PDF/ })).toBeEnabled();
});

test('絞り込みで件数が減る（種別フィルタ）', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '候補を検索' }).click();
  await expect(page.locator('.candidate-card').first()).toBeVisible();
  const before = await page.locator('.candidate-card').count();

  // 条件未選択の検索では発注者＋自治体窓口が候補になるため「自治体窓口」で絞り込む
  await page.getByLabel('種別').selectOption({ label: '自治体窓口' });
  await expect(page.locator('.candidate-card').first()).toBeVisible();
  const after = await page.locator('.candidate-card').count();
  expect(after).toBeGreaterThan(0);
  expect(after).toBeLessThan(before);
});

test('フィードバック送信で受付番号が表示される（FR-017）', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '💬 フィードバック' }).click();
  await page
    .getByRole('textbox', { name: /報告内容/ })
    .fill('E2Eテスト用の自動フィードバックです。');
  await page.getByRole('button', { name: '送信' }).click();
  await expect(page.getByText(/受付番号: FB-/)).toBeVisible();
});

test('URL の検索条件から検索を再現できる（設計 §10）', async ({ page }) => {
  await page.goto('/?lat=35.05&lon=139.05&radius=500&work=excavation&asset=road');
  await page.getByRole('button', { name: '候補を検索' }).click();
  await expect(page.locator('.candidate-card').first()).toBeVisible();
  // 検索後に URL へ条件が反映される
  await expect(page).toHaveURL(/work=excavation/);
});

test('アクセシビリティ: スキップリンクが Tab フォーカスで表示される（WCAG 2.4.1）', async ({
  page,
}) => {
  await page.goto('/');
  const skip = page.getByRole('link', { name: '本文へ移動' });
  // 初期状態では画面外（left: -9999px）
  await expect(skip).not.toBeInViewport();
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
});

test('候補詳細（FR-005）: 機関詳細を開くと窓口・管轄区域が表示される', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '候補を検索' }).click();
  await expect(page.locator('.candidate-card').first()).toBeVisible();
  await page
    .locator('.candidate-card')
    .first()
    .locator('summary', { hasText: '機関詳細' })
    .click();
  await expect(page.getByText('窓口・部署')).toBeVisible();
  await expect(page.getByText('管轄区域（視覚補助・正式境界ではない）')).toBeVisible();
});

test('モバイル幅で水平スクロールが発生しない（DD-06 レスポンシブ）', async ({ page }) => {
  // スマホ幅（390px）で全画面を確認し、横はみ出し要素がないことを検証
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: '候補を検索' }).click();
  await expect(page.locator('.candidate-card').first()).toBeVisible();

  const metrics = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const docW = document.documentElement.scrollWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .map((el) => el.getBoundingClientRect().right)
      .filter((right) => right > vw + 2).length;
    return { vw, docW, offenders };
  });
  expect(metrics.docW).toBeLessThanOrEqual(metrics.vw);
  expect(metrics.offenders).toBe(0);
});
