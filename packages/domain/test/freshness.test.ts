import { describe, expect, it } from 'vitest';
import {
  calculateFreshnessDue,
  freshnessElapsedRatio,
  isExpired,
} from '../src/freshness.js';

const CHECKED = new Date('2026-07-01T00:00:00Z');

describe('calculateFreshnessDue', () => {
  it('確認日 + TTL 日数で期限を計算する', () => {
    expect(calculateFreshnessDue(CHECKED, 90)?.toISOString()).toBe(
      '2026-09-29T00:00:00.000Z',
    );
  });

  it('確認日が null なら期限も null（取得日で代用しない）', () => {
    expect(calculateFreshnessDue(null, 90)).toBeNull();
  });

  it('Invalid Date は RangeError で拒否する（期限内と誤判定しない）', () => {
    const invalid = new Date('not-a-date');
    expect(() => calculateFreshnessDue(invalid, 90)).toThrow(RangeError);
    expect(() => isExpired(invalid, new Date('2026-07-18T00:00:00Z'))).toThrow(RangeError);
    expect(() => isExpired(new Date('2026-10-01T00:00:00Z'), invalid)).toThrow(RangeError);
    expect(() =>
      freshnessElapsedRatio(invalid, new Date('2026-10-01T00:00:00Z'), new Date()),
    ).toThrow(RangeError);
  });

  it('TTL が 0 以下・非数なら RangeError', () => {
    expect(() => calculateFreshnessDue(CHECKED, 0)).toThrow(RangeError);
    expect(() => calculateFreshnessDue(CHECKED, -1)).toThrow(RangeError);
    expect(() => calculateFreshnessDue(CHECKED, Number.NaN)).toThrow(RangeError);
  });
});

describe('isExpired', () => {
  const due = new Date('2026-10-01T00:00:00Z');

  it('期限ちょうどは超過ではない', () => {
    expect(isExpired(due, new Date('2026-10-01T00:00:00Z'))).toBe(false);
  });

  it('期限を過ぎたら超過', () => {
    expect(isExpired(due, new Date('2026-10-01T00:00:01Z'))).toBe(true);
  });

  it('期限不明（null）は超過とみなさない', () => {
    expect(isExpired(null, new Date('2099-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('freshnessElapsedRatio', () => {
  const due = new Date('2026-09-29T00:00:00Z'); // CHECKED + 90日

  it('経過率を返す（半分経過 = 0.5）', () => {
    const halfway = new Date('2026-08-15T00:00:00Z'); // 45日後
    expect(freshnessElapsedRatio(CHECKED, due, halfway)).toBeCloseTo(0.5, 5);
  });

  it('超過時は 1 を超える', () => {
    const after = new Date('2026-10-14T00:00:00Z');
    expect(freshnessElapsedRatio(CHECKED, due, after)).toBeGreaterThan(1);
  });

  it('確認日・期限のどちらかが不明なら null', () => {
    expect(freshnessElapsedRatio(null, due, new Date())).toBeNull();
    expect(freshnessElapsedRatio(CHECKED, null, new Date())).toBeNull();
  });
});
