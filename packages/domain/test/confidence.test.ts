import { describe, expect, it } from 'vitest';
import { calculateConfidence, type ConfidenceInput } from '../src/confidence.js';

const NOW = new Date('2026-07-18T00:00:00Z');

/** 期限内・公式一次情報・公式区域・レビュー済のベースケース */
function baseInput(overrides: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    authority: 'primary_official',
    sourceCheckedAt: new Date('2026-07-01T00:00:00Z'),
    freshnessDueAt: new Date('2026-10-01T00:00:00Z'),
    precision: 'official',
    estimated: false,
    reviewStatus: 'published',
    conflictingSourceCount: 0,
    linkFailed: false,
    ...overrides,
  };
}

describe('calculateConfidence', () => {
  it('公式一次情報・期限内・公式区域・レビュー済は A (100点)', () => {
    const result = calculateConfidence(baseInput(), NOW);
    expect(result.grade).toBe('A');
    expect(result.breakdown.total).toBe(100);
    expect(result.expired).toBe(false);
  });

  it('期限超過は総点に関わらず D になり expired=true', () => {
    const result = calculateConfidence(
      baseInput({ freshnessDueAt: new Date('2026-07-17T00:00:00Z') }),
      NOW,
    );
    expect(result.grade).toBe('D');
    expect(result.expired).toBe(true);
  });

  it('estimated=true は precision 表記に関わらず推定区域として最低点で評価する（§5.3）', () => {
    const official = calculateConfidence(baseInput(), NOW);
    const estimated = calculateConfidence(
      baseInput({ estimated: true, precision: 'official' }),
      NOW,
    );
    expect(estimated.breakdown.boundaryPrecision).toBe(5);
    expect(estimated.breakdown.boundaryPrecision).toBeLessThan(
      official.breakdown.boundaryPrecision,
    );
  });

  it('行政単位の概略区域は B 帯へ落ちる', () => {
    const result = calculateConfidence(
      baseInput({ precision: 'administrative_unit', authority: 'official_catalog' }),
      NOW,
    );
    // 25 + 25 + 18 + 15 = 83 → B
    expect(result.breakdown.total).toBe(83);
    expect(result.grade).toBe('B');
  });

  it('競合ソースの減点は 25 点で頭打ちになる', () => {
    const result = calculateConfidence(baseInput({ conflictingSourceCount: 10 }), NOW);
    expect(result.breakdown.conflictingSourcesPenalty).toBe(25);
  });

  it('リンク失敗は 30 点減点する', () => {
    const result = calculateConfidence(baseInput({ linkFailed: true }), NOW);
    expect(result.breakdown.linkFailurePenalty).toBe(30);
    expect(result.breakdown.total).toBe(70);
    expect(result.grade).toBe('B');
  });

  it('総点は 0 未満にならない', () => {
    const result = calculateConfidence(
      baseInput({
        authority: 'secondary_open',
        sourceCheckedAt: null,
        freshnessDueAt: null,
        precision: 'estimated',
        estimated: true,
        reviewStatus: 'draft',
        conflictingSourceCount: 5,
        linkFailed: true,
      }),
      NOW,
    );
    expect(result.breakdown.total).toBe(0);
    expect(result.grade).toBe('D');
  });

  it('TTL 半分未満経過は満点、半分超は減点した鮮度点になる', () => {
    const early = calculateConfidence(baseInput(), new Date('2026-07-10T00:00:00Z'));
    expect(early.breakdown.freshness).toBe(25);
    const late = calculateConfidence(baseInput(), new Date('2026-09-20T00:00:00Z'));
    expect(late.breakdown.freshness).toBe(15);
  });

  it('確認日不明は鮮度 0 点（不確実性を保存する）', () => {
    const result = calculateConfidence(
      baseInput({ sourceCheckedAt: null, freshnessDueAt: null }),
      NOW,
    );
    expect(result.breakdown.freshness).toBe(0);
  });

  it('期限不明だが確認済みは中間の鮮度点（10 点）', () => {
    const result = calculateConfidence(baseInput({ freshnessDueAt: null }), NOW);
    expect(result.breakdown.freshness).toBe(10);
  });
});
