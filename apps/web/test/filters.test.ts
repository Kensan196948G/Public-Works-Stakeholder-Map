import { describe, expect, it } from 'vitest';
import type { Candidate } from '@pwsm/contracts';
import {
  DEFAULT_FILTERS,
  filterCandidates,
  sortCandidates,
} from '../src/filters.js';

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    organizationId: 'org-1',
    name: 'みらい市 道路管理課（デモ）',
    type: 'road_admin',
    officeName: '道路管理課',
    confidence: 'B',
    confidenceBreakdown: {
      authority: 25,
      freshness: 25,
      boundaryPrecision: 5,
      reviewState: 15,
      conflictingSourcesPenalty: 0,
      linkFailurePenalty: 0,
      total: 70,
    },
    verificationState: 'unverified',
    reasons: ['指定地点が区域に含まれます'],
    precision: 'administrative_unit',
    estimated: false,
    sourceCheckedAt: '2026-07-01T00:00:00Z',
    freshnessDueAt: '2026-10-01T00:00:00Z',
    evidence: [
      {
        title: '公式案内（デモ）',
        url: 'https://example.com/demo',
        sourceCheckedAt: '2026-07-01T00:00:00Z',
      },
    ],
    ...overrides,
  };
}

const candidates = [
  candidate({ organizationId: 'a', name: 'あ機関', type: 'issuer', confidence: 'A' }),
  candidate({
    organizationId: 'b',
    name: 'い機関',
    type: 'road_admin',
    confidence: 'C',
    verificationState: 'expired',
    estimated: true,
    freshnessDueAt: '2026-05-01T00:00:00Z',
  }),
  candidate({
    organizationId: 'c',
    name: 'う機関',
    type: 'municipality',
    confidence: 'B',
    verificationState: 'needs_inquiry',
    freshnessDueAt: '2026-12-01T00:00:00Z',
  }),
] as const;

describe('filterCandidates（FR-008）', () => {
  it('既定フィルタは全件を返す（候補を隠さない）', () => {
    expect(filterCandidates(candidates, DEFAULT_FILTERS)).toHaveLength(3);
  });

  it('種別で絞り込む', () => {
    const result = filterCandidates(candidates, { ...DEFAULT_FILTERS, types: ['road_admin'] });
    expect(result.map((c) => c.organizationId)).toEqual(['b']);
  });

  it('信頼度で絞り込む', () => {
    const result = filterCandidates(candidates, {
      ...DEFAULT_FILTERS,
      confidenceGrades: ['A', 'B'],
    });
    expect(result.map((c) => c.organizationId).sort()).toEqual(['a', 'c']);
  });

  it('確認状態で絞り込む', () => {
    const result = filterCandidates(candidates, {
      ...DEFAULT_FILTERS,
      verificationStates: ['expired'],
    });
    expect(result.map((c) => c.organizationId)).toEqual(['b']);
  });

  it('期限超過のみ・推定区域のみのフラグを組み合わせられる', () => {
    const expired = filterCandidates(candidates, {
      ...DEFAULT_FILTERS,
      onlyExpired: true,
      onlyEstimated: true,
    });
    expect(expired.map((c) => c.organizationId)).toEqual(['b']);
  });
});

describe('sortCandidates（FR-008）', () => {
  it('既定順は入力順を維持する（サーバー順）', () => {
    expect(sortCandidates(candidates, 'default').map((c) => c.organizationId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('信頼度順は A → C になる', () => {
    expect(sortCandidates(candidates, 'confidence').map((c) => c.organizationId)).toEqual([
      'a',
      'c',
      'b',
    ]);
  });

  it('名称順は日本語ロケールで整列する', () => {
    expect(sortCandidates(candidates, 'name').map((c) => c.organizationId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('鮮度順は期限が近い順になり、期限不明は末尾に置く', () => {
    const withUnknown = [
      ...candidates,
      candidate({ organizationId: 'd', name: 'え機関', freshnessDueAt: null }),
    ];
    const sorted = sortCandidates(withUnknown, 'freshness').map((c) => c.organizationId);
    expect(sorted[0]).toBe('b'); // 2026-05 が最古
    expect(sorted[sorted.length - 1]).toBe('d'); // 期限不明は末尾
  });
});
