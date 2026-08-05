import { describe, expect, it } from 'vitest';
import { decodeSearchQuery, encodeSearchQuery, type UrlSearchState } from '../src/urlState.js';

const FALLBACK: UrlSearchState = {
  lat: 35.05,
  lon: 139.05,
  radiusMeters: 500,
  workTypes: [],
  assetTypes: [],
  impactTypes: [],
  purpose: 'pre_consultation',
};

describe('urlState（検索条件の URL 共有・設計 §10）', () => {
  it('encode → decode の round trip で条件が復元される', () => {
    const state: UrlSearchState = {
      lat: 35.1,
      lon: 139.2,
      radiusMeters: 1000,
      workTypes: ['excavation', 'traffic_restriction'],
      assetTypes: ['road'],
      impactTypes: ['traffic_impact'],
      purpose: 'pre_bid',
    };
    const query = encodeSearchQuery(state);
    expect(decodeSearchQuery(`?${query}`, FALLBACK)).toEqual(state);
  });

  it('不正な値は既定値へフォールバックする', () => {
    const decoded = decodeSearchQuery('?lat=999&lon=abc&radius=-1&work=not-a-work', FALLBACK);
    expect(decoded.lat).toBe(FALLBACK.lat);
    expect(decoded.lon).toBe(FALLBACK.lon);
    expect(decoded.radiusMeters).toBe(FALLBACK.radiusMeters);
    expect(decoded.workTypes).toEqual([]);
  });

  it('既定の purpose と半径 0 は URL へ含めない', () => {
    const query = encodeSearchQuery({ ...FALLBACK, radiusMeters: 0 });
    expect(query).not.toContain('radius=');
    expect(query).not.toContain('purpose=');
  });

  it('空クエリはフォールバックを返す', () => {
    expect(decodeSearchQuery('', FALLBACK)).toEqual(FALLBACK);
  });
});
