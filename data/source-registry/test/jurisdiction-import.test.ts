import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 個別管轄ポリゴン取込（road / river / port / police）の汎用スクリプト検証。
 * scripts/jurisdiction-geojson-to-imports.mjs（N03 の汎用版）
 */
const SCRIPT = join(process.cwd(), 'scripts/jurisdiction-geojson-to-imports.mjs');

const FEATURES = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { PREF: '13', RIVER_NAME: '多摩川（デモ検証用）' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [139.6, 35.6],
              [139.7, 35.6],
              [139.7, 35.7],
              [139.6, 35.7],
              [139.6, 35.6],
            ],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { PREF: '27', PORT_NAME: '大阪港（デモ検証用）' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [135.4, 34.6],
            [135.5, 34.6],
            [135.5, 34.7],
            [135.4, 34.7],
            [135.4, 34.6],
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

describe('個別管轄ポリゴン取込（road / river / port / police 汎用版）', () => {
  it('river を jurisdiction pending として変換し、属性キーで集約する', () => {
    const sql = run(
      [
        '--input', '-', '--asset-type', 'river',
        '--group-key', 'RIVER_NAME', '--name-key', 'RIVER_NAME',
        '--source-slug', 'mlit-ksj-w05', '--stdout',
      ],
      JSON.stringify(FEATURES),
    );
    const inserts = (sql.match(/INSERT INTO staging\.import_records/g) ?? []).length;
    expect(inserts).toBe(2);
    expect(sql).toContain("'jurisdiction'");
    expect(sql).toContain('"assetType":"river"');
    expect(sql).toContain('"assetName":"多摩川（デモ検証用）"');
    expect(sql).toContain('"precision":"official"');
    expect(sql).toContain('"geometry_pending_review"');
  });

  it('port を都道府県コードでフィルタできる', () => {
    const sql = run(
      [
        '--input', '-', '--asset-type', 'port',
        '--group-key', 'PORT_NAME', '--name-key', 'PORT_NAME',
        '--source-slug', 'mlit-ksj-c02', '--pref-code', '13', '--stdout',
      ],
      JSON.stringify(FEATURES),
    );
    expect(sql).not.toContain('大阪港');
    expect(sql).toContain('"prefCode":"13"');
  });

  it('--asset-type 未指定・不正値はエラーになる', () => {
    expect(() =>
      run(['--input', '-', '--stdout'], JSON.stringify(FEATURES)),
    ).toThrow(/asset-type/);
    expect(() =>
      run(
        ['--input', '-', '--asset-type', 'unknown', '--stdout'],
        JSON.stringify(FEATURES),
      ),
    ).toThrow(/asset-type/);
  });

  it('不正な座標範囲はエラーになる', () => {
    const bad = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { PREF: '13', ROAD_NAME: '不正' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[999, 35], [140, 35], [140, 36], [999, 35]]],
          },
        },
      ],
    };
    expect(() =>
      run(
        [
          '--input', '-', '--asset-type', 'road',
          '--group-key', 'ROAD_NAME', '--source-slug', 'mlit-ksj-n13', '--stdout',
        ],
        JSON.stringify(bad),
      ),
    ).toThrow();
  });

  it('estimated=true と precision を指定できる（警察署の推定区域など）', () => {
    const police = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { PREF: '13', POLICE_NAME: '警視庁 丸の内警察署（推定・デモ）' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[139.75, 35.68], [139.77, 35.68], [139.77, 35.7], [139.75, 35.7], [139.75, 35.68]]],
          },
        },
      ],
    };
    const sql = run(
      [
        '--input', '-', '--asset-type', 'police',
        '--group-key', 'POLICE_NAME', '--name-key', 'POLICE_NAME',
        '--source-slug', 'mlit-ksj-p18', '--precision', 'interpreted',
        '--estimated', 'true', '--stdout',
      ],
      JSON.stringify(police),
    );
    expect(sql).toContain('"assetType":"police"');
    expect(sql).toContain('"precision":"interpreted"');
    expect(sql).toContain('"estimated":true');
  });

  it('--notes で注記を付与できる', () => {
    const sql = run(
      [
        '--input', '-', '--asset-type', 'river',
        '--group-key', 'RIVER_NAME', '--name-key', 'RIVER_NAME',
        '--source-slug', 'mlit-ksj-w05', '--notes', '一級河川の代表区間（デモ）', '--stdout',
      ],
      JSON.stringify(FEATURES),
    );
    expect(sql).toContain('一級河川の代表区間（デモ）');
  });
});
