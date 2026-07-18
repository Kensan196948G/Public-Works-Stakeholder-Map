import { describe, expect, it } from 'vitest';
import {
  candidateSchema,
  MAX_RADIUS_METERS,
  problemDetailsSchema,
  searchRequestSchema,
  searchResponseSchema,
  REQUIRED_DISCLAIMER,
} from '../src/index.js';

describe('searchRequestSchema', () => {
  const valid = {
    location: { lat: 35.681236, lon: 139.767125 },
    radiusMeters: 500,
    workTypes: ['excavation', 'traffic_restriction'],
    assetTypes: ['road', 'river'],
    purpose: 'pre_consultation',
  };

  it('設計 §6.4 のリクエスト例を受理する', () => {
    const parsed = searchRequestSchema.parse(valid);
    expect(parsed.radiusMeters).toBe(500);
    expect(parsed.impactTypes).toEqual([]);
  });

  it('緯度・経度の範囲外を拒否する', () => {
    expect(searchRequestSchema.safeParse({ ...valid, location: { lat: 91, lon: 0 } }).success).toBe(false);
    expect(searchRequestSchema.safeParse({ ...valid, location: { lat: 0, lon: -181 } }).success).toBe(false);
  });

  it('境界値（±90 / ±180）は受理する', () => {
    expect(searchRequestSchema.safeParse({ ...valid, location: { lat: 90, lon: 180 } }).success).toBe(true);
    expect(searchRequestSchema.safeParse({ ...valid, location: { lat: -90, lon: -180 } }).success).toBe(true);
  });

  it('検索半径は 0〜5,000m に制限する（§7.2）', () => {
    expect(searchRequestSchema.safeParse({ ...valid, radiusMeters: MAX_RADIUS_METERS }).success).toBe(true);
    expect(searchRequestSchema.safeParse({ ...valid, radiusMeters: MAX_RADIUS_METERS + 1 }).success).toBe(false);
    expect(searchRequestSchema.safeParse({ ...valid, radiusMeters: -1 }).success).toBe(false);
  });

  it('未知の workType を拒否する', () => {
    expect(searchRequestSchema.safeParse({ ...valid, workTypes: ['demolition_x'] }).success).toBe(false);
  });

  it('radius / 配列は省略時デフォルトを補完する', () => {
    const parsed = searchRequestSchema.parse({ location: { lat: 0, lon: 0 } });
    expect(parsed.radiusMeters).toBe(0);
    expect(parsed.workTypes).toEqual([]);
  });
});

describe('searchResponseSchema', () => {
  it('免責必須（disclaimerRequired は literal true）', () => {
    const base = {
      queryId: 'q1',
      datasetVersion: 'dev-fixture',
      ruleVersion: 1,
      disclaimer: REQUIRED_DISCLAIMER,
      candidates: [],
    };
    expect(searchResponseSchema.safeParse({ ...base, disclaimerRequired: true }).success).toBe(true);
    expect(searchResponseSchema.safeParse({ ...base, disclaimerRequired: false }).success).toBe(false);
  });
});

describe('candidateSchema', () => {
  const baseCandidate = {
    organizationId: 'org-1',
    name: 'デモ機関',
    type: 'road_admin',
    officeName: null,
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
    reasons: ['理由'],
    estimated: true,
    sourceCheckedAt: null,
    freshnessDueAt: null,
    evidence: [{ title: '出典', url: 'https://example.com/x', sourceCheckedAt: null }],
  };

  it('§5.3: estimated=true かつ precision=official の組み合わせを拒否する', () => {
    expect(
      candidateSchema.safeParse({ ...baseCandidate, precision: 'official' }).success,
    ).toBe(false);
    expect(
      candidateSchema.safeParse({ ...baseCandidate, precision: 'estimated' }).success,
    ).toBe(true);
  });
});

describe('problemDetailsSchema', () => {
  it('RFC 9457 互換フィールドを検証する', () => {
    const ok = problemDetailsSchema.safeParse({
      type: 'https://public-works-map.example/errors/validation',
      title: '入力内容を確認してください',
      status: 400,
      code: 'INVALID_COORDINATE',
      detail: '緯度は-90から90の範囲で指定してください',
      requestId: '01J000',
    });
    expect(ok.success).toBe(true);
  });
});
