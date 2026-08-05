import { describe, expect, it } from 'vitest';
import { REQUIRED_DISCLAIMER, type SearchResponse } from '@pwsm/contracts';
import { buildPrintTable } from '../src/print.js';

const response: SearchResponse = {
  queryId: 'q-print',
  datasetVersion: '2026-07-18.fixture.1',
  ruleVersion: 1,
  disclaimerRequired: true,
  disclaimer: REQUIRED_DISCLAIMER,
  candidates: [
    {
      organizationId: 'org-demo-0002',
      name: 'みらい市 道路管理課（デモ）',
      type: 'road_admin',
      officeName: '道路管理課',
      confidence: 'A',
      confidenceBreakdown: {
        authority: 35,
        freshness: 25,
        boundaryPrecision: 18,
        reviewState: 15,
        conflictingSourcesPenalty: 0,
        linkFailurePenalty: 0,
        total: 93,
      },
      verificationState: 'unverified',
      reasons: ['指定地点が区域に含まれます'],
      precision: 'administrative_unit',
      estimated: false,
      sourceCheckedAt: '2026-06-30T15:00:00.000Z',
      freshnessDueAt: '2026-09-28T15:00:00.000Z',
      evidence: [
        {
          title: 'みらい市道の管理に関する案内（デモ）',
          url: 'https://example.com/demo/mirai-city/road',
          sourceCheckedAt: '2026-07-01T00:00:00+09:00',
        },
      ],
    },
  ],
};

const EXPORTED_AT = new Date('2026-07-18T03:00:00Z');

describe('buildPrintTable（FR-010 / §11.1）', () => {
  const table = buildPrintTable(response, EXPORTED_AT);

  it('免責・データ版・出力日時を含む', () => {
    expect(table.disclaimer).toBe(REQUIRED_DISCLAIMER);
    expect(table.datasetVersion).toBe('2026-07-18.fixture.1');
    expect(table.exportedAt).toBe(EXPORTED_AT);
  });

  it('候補1件 × 出典1件 = 1 行で、ヘッダーに必要項目を持つ', () => {
    expect(table.headers).toContain('機関名');
    expect(table.headers).toContain('出典URL');
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toContain('みらい市道の管理に関する案内（デモ）');
  });

  it('利用者判断とメモを反映する', () => {
    const withDecision = buildPrintTable(response, EXPORTED_AT, {
      'org-demo-0002': {
        state: 'candidate',
        note: '協議候補に追加',
        decidedAt: EXPORTED_AT.toISOString(),
      },
    });
    expect(withDecision.rows[0]).toContain('協議候補');
    expect(withDecision.rows[0]).toContain('協議候補に追加');
  });
});
