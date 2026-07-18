import { describe, expect, it } from 'vitest';
import { REQUIRED_DISCLAIMER, type SearchResponse } from '@pwsm/contracts';
import { buildCandidatesCsv } from '../src/csv.js';

const response: SearchResponse = {
  queryId: 'q-test',
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
      // 数式注入を試みるメモが混じっても無害化されることを確認する
      reasons: ['=HYPERLINK("https://evil.example/")', '道路での掘削作業が選択されています'],
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

describe('buildCandidatesCsv（FR-010 / §11.1）', () => {
  const csv = buildCandidatesCsv(response, EXPORTED_AT);

  it('免責・データ版・ルール版・出力日時を含む', () => {
    expect(csv).toContain(REQUIRED_DISCLAIMER);
    expect(csv).toContain('2026-07-18.fixture.1');
    expect(csv).toContain('ルール版,1');
    expect(csv).toContain('2026-07-18T03:00:00.000Z');
  });

  it('出典タイトル・URL・原典確認日を含む', () => {
    expect(csv).toContain('みらい市道の管理に関する案内（デモ）');
    expect(csv).toContain('https://example.com/demo/mirai-city/road');
    expect(csv).toContain('2026-06-30T15:00:00.000Z');
  });

  it('数式注入（=HYPERLINK）が無害化されている', () => {
    // アポストロフィ前置 + RFC4180 引用のため、生の =HYPERLINK で始まるセルは存在しない
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
    expect(csv).toContain(`'=HYPERLINK`);
  });

  it('BOM 付き・CRLF 区切りで出力される', () => {
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
  });

  it('日本語ラベルで機関種別・信頼度を出力する', () => {
    expect(csv).toContain('道路管理者');
    expect(csv).toContain('A・高');
  });

  it('利用者判断とメモを出力する（FR-009 連携）', () => {
    const withDecision = buildCandidatesCsv(response, EXPORTED_AT, {
      'org-demo-0002': {
        state: 'needs_inquiry',
        note: '=1+1 の様なメモも無害化される',
        decidedAt: EXPORTED_AT.toISOString(),
      },
    });
    expect(withDecision).toContain('要照会');
    expect(withDecision).toContain(`'=1+1`);
  });
});
