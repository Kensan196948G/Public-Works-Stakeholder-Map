// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { REQUIRED_DISCLAIMER, type SearchResponse } from '@pwsm/contracts';
import { App } from '../src/App.js';

// 地図（WebGL）は jsdom で動作しないためスタブする（実表示は WebUI 手動確認で検証）
vi.mock('../src/components/MapPicker.js', () => ({
  MapPicker: () => <div data-testid="map-stub" />,
}));

const searchResponse: SearchResponse = {
  queryId: 'q-ui-test',
  datasetVersion: '2026-07-18.fixture.1',
  ruleVersion: 1,
  disclaimerRequired: true,
  disclaimer: REQUIRED_DISCLAIMER,
  candidates: [
    {
      organizationId: 'org-demo-0006',
      name: 'あおぞら県警察 みらい警察署（デモ）',
      type: 'police',
      officeName: '交通課',
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
      reasons: ['交通規制・交通影響を伴う条件が選択されています'],
      precision: 'estimated',
      estimated: true,
      sourceCheckedAt: '2026-06-19T15:00:00.000Z',
      freshnessDueAt: '2026-09-17T15:00:00.000Z',
      evidence: [
        {
          title: '警察署管轄区域データ（デモ・推定含む）',
          url: 'https://example.com/demo/aozora-police/mirai',
          sourceCheckedAt: '2026-06-20T00:00:00+09:00',
        },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App（SCR-02/03 スモークテスト）', () => {
  it('FR-007: 免責文を常時表示する', () => {
    render(<App />);
    expect(screen.getByText(new RegExp('緊急連絡には使用しないでください'))).toBeTruthy();
  });

  it('検索実行で候補カードが表示され、推定区域の注意が出る', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/v1/map/jurisdictions')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                type: 'FeatureCollection',
                datasetVersion: '2026-07-18.fixture.1',
                features: [
                  {
                    type: 'Feature',
                    properties: {
                      organizationId: 'org-demo-0006',
                      organizationName: 'あおぞら県警察 みらい警察署（デモ）',
                      assetName: 'あおぞら町河川沿い地区（デモ）',
                      precision: 'estimated',
                      estimated: true,
                    },
                    geometry: {
                      type: 'Polygon',
                      coordinates: [
                        [
                          [139.1, 35],
                          [139.2, 35],
                          [139.2, 35.1],
                          [139.1, 35.1],
                          [139.1, 35],
                        ],
                      ],
                    },
                  },
                ],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(searchResponse), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '候補を検索' }));

    await waitFor(() => {
      // 候補カードと印刷用テーブルの両方に表示されるため複数一致を許容する
      expect(screen.getAllByText('あおぞら県警察 みらい警察署（デモ）').length).toBeGreaterThan(0);
    });
    // 断定しないラベルと推定区域の注意（§17.2 ケース2）
    expect(screen.getByText('候補です — 正式確認が必要')).toBeTruthy();
    expect(screen.getByText(/管轄区域は推定です/)).toBeTruthy();
    // 出典リンクは noopener noreferrer
    const link = screen.getAllByRole('link', { name: /警察署管轄区域データ/ })[0];
    expect(link).toBeDefined();
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('API エラー時は Problem Details の detail を表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            type: 'https://public-works-map.example/errors/invalid_coordinate',
            title: '入力内容を確認してください',
            status: 400,
            code: 'INVALID_COORDINATE',
            detail: '緯度は-90から90の範囲で指定してください',
            requestId: 'r-1',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '候補を検索' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('緯度は-90から90');
    });
  });
});
