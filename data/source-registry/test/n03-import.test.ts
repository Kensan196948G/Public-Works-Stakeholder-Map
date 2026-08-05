import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(process.cwd(), 'scripts/n03-geojson-to-imports.mjs');

const FEATURES = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { N03_PREF: '13', N03_CITY: '千代田区' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [139.7, 35.65],
              [139.8, 35.65],
              [139.8, 35.7],
              [139.7, 35.7],
              [139.7, 35.65],
            ],
          ],
          [
            [
              [139.75, 35.66],
              [139.76, 35.66],
              [139.76, 35.67],
              [139.75, 35.67],
              [139.75, 35.66],
            ],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { N03_PREF: '27', N03_007: '27103', N03_003: '大阪市', N03_004: '北区' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [135.4, 34.6],
              [135.5, 34.6],
              [135.5, 34.7],
              [135.4, 34.7],
              [135.4, 34.6],
            ],
          ],
        ],
      },
    },
  ],
};

function run(args: string[], input?: string): string {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    input,
  });
}

describe('N03 GeoJSON → 管轄ステージング取込（Issue #32 第三段）', () => {
  it('全フィーチャーを jurisdiction pending として変換する', () => {
    const sql = run(['--input', '-', '--stdout'], JSON.stringify(FEATURES));
    const inserts = (sql.match(/INSERT INTO staging\.import_records/g) ?? []).length;
    expect(inserts).toBe(2);
    expect(sql).toContain("'jurisdiction'");
    expect(sql).toContain('"geometry_pending_review"');
    expect(sql).toContain('"precision":"official"');
  });

  it('都道府県コードでフィルタできる', () => {
    const sql = run(
      ['--input', '-', '--pref-code', '13', '--stdout'],
      JSON.stringify(FEATURES),
    );
    expect(sql).toContain('千代田区');
    expect(sql).not.toContain('大阪市北区');
  });

  it('複数フィーチャーを市町村単位で集約して WKT MULTIPOLYGON へ変換する', () => {
    const sql = run(['--input', '-', '--stdout'], JSON.stringify(FEATURES));
    expect(sql).toContain('MULTIPOLYGON(((');
    expect((sql.match(/MULTIPOLYGON/g) ?? []).length).toBe(2);
  });

  it('N03 の新しいプロパティ表記（N03_007 / N03_003 / N03_004）と表示名連結に対応する', () => {
    const sql = run(['--input', '-', '--stdout'], JSON.stringify(FEATURES));
    expect(sql).toContain('大阪市北区');
    expect(sql).toContain('"cityCode":"27103"');
  });

  it('同じ市区町村コードのフィーチャーは 1 行に集約される', () => {
    const duplicated = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { N03_PREF: '13', N03_007: '13101', N03_004: '千代田区' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[139.7, 35.65], [139.75, 35.65], [139.75, 35.7], [139.7, 35.7], [139.7, 35.65]]],
          },
        },
        {
          type: 'Feature',
          properties: { N03_PREF: '13', N03_007: '13101', N03_004: '千代田区' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[139.75, 35.65], [139.8, 35.65], [139.8, 35.7], [139.75, 35.7], [139.75, 35.65]]],
          },
        },
      ],
    };
    const sql = run(['--input', '-', '--stdout'], JSON.stringify(duplicated));
    expect((sql.match(/INSERT INTO staging\.import_records/g) ?? []).length).toBe(1);
    expect(sql).toContain('千代田区');
  });

  it('所属未定地（N03_007 なし）は都道府県名からコードを解決して含める', () => {
    const unassigned = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { N03_001: '東京都', N03_004: '所属未定地' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[139.6, 35.5], [139.7, 35.5], [139.7, 35.6], [139.6, 35.6], [139.6, 35.5]]],
          },
        },
      ],
    };
    const sql = run(
      ['--input', '-', '--pref-code', '13', '--stdout'],
      JSON.stringify(unassigned),
    );
    expect((sql.match(/INSERT INTO staging\.import_records/g) ?? []).length).toBe(1);
    expect(sql).toContain('"prefCode":"13"');
    expect(sql).toContain('city_unassigned');
    expect(sql).toContain('所属未定地');
  });

  it('不正な座標範囲はエラーになる', () => {
    const bad = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { N03_PREF: '13', N03_CITY: '不正' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[999, 35], [140, 35], [140, 36], [999, 35]]],
          },
        },
      ],
    };
    expect(() => run(['--input', '-', '--stdout'], JSON.stringify(bad))).toThrow();
  });
});
