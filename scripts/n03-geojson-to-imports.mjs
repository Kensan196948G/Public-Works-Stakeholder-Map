// 国土数値情報 行政区域（N03）の GeoJSON を、管轄区域のステージング取込レコードへ変換する。
// 実行例:
//   node scripts/n03-geojson-to-imports.mjs --input n03-tokyo.geojson --pref-code 13
//   node scripts/n03-geojson-to-imports.mjs --input - --pref-code 13 --stdout
//
// 前提: 入力 GeoJSON は EPSG:4326（経度・緯度）の Polygon / MultiPolygon。
//       ogr2ogr 等で変換しておく（例: ogr2ogr -f GeoJSON -t_srs EPSG:4326 out.geojson N03-xx.shp）
// 方針: 生成物は必ず staging（pending）へ置き、SCR-07 の二者レビュー後に公開する（無レビュー公開禁止）。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

function uuidFor(name) {
  const h = createHash('sha256').update(name).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function q(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key?.startsWith('--')) args.set(key.slice(2), argv[i + 1]);
  }
  return {
    input: args.get('input') ?? '',
    prefCode: args.get('pref-code') ?? null,
    cityFilter: args.get('city-filter') ?? null,
    sourceSlug: args.get('source-slug') ?? 'mlit-ksj-n03',
    output: args.get('output'),
    stdout: argv.includes('--stdout'),
  };
}

function ringToWkt(ring) {
  const points = ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ');
  return `(${points})`;
}

function geometryToMultiPolygonWkt(geometry) {
  if (geometry.type === 'Polygon') {
    return `MULTIPOLYGON((${ringToWkt(geometry.coordinates[0])}))`;
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates.map((poly) => `(${ringToWkt(poly[0])})`);
    return `MULTIPOLYGON(${polys.join(', ')})`;
  }
  return null;
}

function assertLatLon(geometry) {
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0]?.[0];
  for (const [lon, lat] of ring ?? []) {
    if (
      typeof lon !== 'number' ||
      typeof lat !== 'number' ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      throw new Error(`invalid coordinate: ${lon}, ${lat}`);
    }
  }
}

const opts = parseArgs(process.argv.slice(2));
if (opts.input === '') {
  throw new Error('--input <path|-> は必須です（- は標準入力）');
}

const raw = opts.input === '-' ? readFileSync(0, 'utf8') : readFileSync(opts.input, 'utf8');
const featureCollection = JSON.parse(raw);
if (featureCollection?.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features)) {
  throw new Error('入力は FeatureCollection（GeoJSON）である必要があります');
}

const sourceId = uuidFor(`registry:${opts.sourceSlug}`);
const lines = [
  '-- ============================================================',
  '-- N03 行政区域のステージング取込（自動生成・手編集禁止）',
  '-- 生成: scripts/n03-geojson-to-imports.mjs',
  '-- 方針: pending で登録し、SCR-07 の二者レビュー（geometry 検証含む）後に公開する',
  '-- ============================================================',
  'BEGIN;',
];

let count = 0;
for (const feature of featureCollection.features) {
  const props = feature.properties ?? {};
  const prefCode = String(props.N03_PREF ?? '');
  const cityName = String(props.N03_CITY ?? props.N03_NAME ?? '');
  if (opts.prefCode !== null && prefCode !== opts.prefCode) continue;
  if (opts.cityFilter !== null && !cityName.includes(opts.cityFilter)) continue;
  if (feature.geometry === null || feature.geometry === undefined) continue;
  assertLatLon(feature.geometry);
  const wkt = geometryToMultiPolygonWkt(feature.geometry);
  if (wkt === null) continue;

  const importId = uuidFor(`entity:jur:n03:${prefCode}:${cityName}:${count}`);
  const payload = {
    assetType: 'administrative',
    assetName: cityName,
    prefCode,
    crs: 'EPSG:4326',
    precision: 'official',
    estimated: false,
    geometryWkt: wkt,
    sourceSlug: opts.sourceSlug,
    notes: 'N03 行政区域データ。座標・境界の正確性はレビューで確認する',
  };
  lines.push(
    `INSERT INTO staging.import_records (id, source_id, entity_kind, raw_payload, quality_flags, review_state)`,
    `VALUES (${q(importId)}, ${q(sourceId)}, 'jurisdiction', ${q(JSON.stringify(payload))}::jsonb, '["geometry_pending_review"]'::jsonb, 'pending')`,
    `ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, entity_kind = EXCLUDED.entity_kind, raw_payload = EXCLUDED.raw_payload, quality_flags = EXCLUDED.quality_flags, review_state = EXCLUDED.review_state;`,
  );
  count += 1;
}

lines.push('COMMIT;', '');
const sql = lines.join('\n');
if (opts.stdout) {
  process.stdout.write(sql);
} else {
  // 実データは Git に置かない方針のため、ファイル出力先は明示指定のみ（--output）
  const output = opts.output;
  if (output === undefined) {
    throw new Error('--output <path> を指定してください（--stdout の場合は不要）');
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(output, sql);
}
console.warn(`generated ${count} jurisdiction imports (source: ${opts.sourceSlug})`);
