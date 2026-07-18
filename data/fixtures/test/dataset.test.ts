import { describe, expect, it } from 'vitest';
import { evidenceSchema } from '@pwsm/contracts';
import { demoDataset } from '../src/index.js';

/**
 * fixture 品質検査（要件 §6.2 データ品質ルール / npm run data:validate）。
 * 公開レコードは公式 URL・取得日時・確認状態を必須とする。
 */
describe('demoDataset 品質検査', () => {
  it('全機関が架空データであることを名称で明示する（デモ表記）', () => {
    for (const org of demoDataset.organizations) {
      expect(org.name, `${org.id} の名称に（デモ）表記がない`).toContain('（デモ）');
    }
  });

  it('公開レコードは公式 URL と原典確認日時を必須とする', () => {
    for (const org of demoDataset.organizations) {
      if (org.reviewStatus === 'published') {
        expect(org.officialUrl, `${org.id} に officialUrl がない`).toMatch(/^https:\/\//);
        expect(Date.parse(org.sourceCheckedAt), `${org.id} の sourceCheckedAt が不正`).not.toBeNaN();
      }
    }
  });

  it('全機関が最低 1 件の根拠（出典）を持つ', () => {
    for (const org of demoDataset.organizations) {
      expect(org.evidence.length, `${org.id} に evidence がない`).toBeGreaterThan(0);
      for (const ev of org.evidence) {
        expect(evidenceSchema.safeParse(ev).success, `${org.id} の evidence が契約不一致`).toBe(true);
      }
    }
  });

  it('estimated=true の機関は precision が official ではない（§5.3）', () => {
    for (const org of demoDataset.organizations) {
      if (org.estimated) {
        expect(org.precision, `${org.id} が推定なのに official 精度`).not.toBe('official');
      }
    }
  });

  it('TTL は正の日数である', () => {
    for (const org of demoDataset.organizations) {
      expect(org.ttlDays, `${org.id} の ttlDays が不正`).toBeGreaterThan(0);
    }
  });

  it('全 region コードが定義済みである', () => {
    const codes = new Set(demoDataset.regions.map((r) => r.code));
    for (const org of demoDataset.organizations) {
      for (const rc of org.regionCodes) {
        expect(codes.has(rc), `${org.id} が未定義 region ${rc} を参照`).toBe(true);
      }
    }
  });

  it('bbox の範囲が正しい（min < max、緯度経度範囲内）', () => {
    for (const region of demoDataset.regions) {
      const { minLat, maxLat, minLon, maxLon } = region.bbox;
      expect(minLat).toBeLessThan(maxLat);
      expect(minLon).toBeLessThan(maxLon);
      expect(minLat).toBeGreaterThanOrEqual(-90);
      expect(maxLat).toBeLessThanOrEqual(90);
      expect(minLon).toBeGreaterThanOrEqual(-180);
      expect(maxLon).toBeLessThanOrEqual(180);
    }
  });

  it('ルールコードは一意である', () => {
    const codes = demoDataset.rules.map((r) => r.ruleCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('region コードと機関 ID は一意である', () => {
    const regionCodes = demoDataset.regions.map((r) => r.code);
    expect(new Set(regionCodes).size).toBe(regionCodes.length);
    const orgIds = demoDataset.organizations.map((o) => o.id);
    expect(new Set(orgIds).size).toBe(orgIds.length);
  });

  it('データセットの ruleVersion と各ルールの version が一致する', () => {
    for (const rule of demoDataset.rules) {
      expect(rule.version, `${rule.ruleCode} の version 不一致`).toBe(demoDataset.ruleVersion);
    }
  });
});
