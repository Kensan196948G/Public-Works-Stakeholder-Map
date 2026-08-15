// 個別管轄ポリゴン（道路・河川・港湾・警察）の GeoJSON を、管轄区域のステージング取込レコードへ変換する。
// N03 行政区域（scripts/n03-geojson-to-imports.mjs）と同一パターンで、asset_type を指定可能にした汎用版。
//
// 実行例:
//   node scripts/jurisdiction-geojson-to-imports.mjs \
//     --input harbor-tokyo.geojson --asset-type port --pref-code 13 \
//     --source-slug mlit-ksj-c02 --output db/seeds/registry/0006_staging_port_jurisdictions.sql
//   node scripts/jurisdiction-geojson-to-imports.mjs --input - --asset-type police --stdout
//
// 前提: 入力 GeoJSON は EPSG:4326（経度・緯度）の Polygon / MultiPolygon。
//       ogr2ogr 等で変換しておく（例: ogr2ogr -f GeoJSON -t_srs EPSG:4326 out.geojson in.shp）
// 方針: 生成物は必ず staging（pending）へ置き、SCR-07 の二者レビュー後に公開する（無レビュー公開禁止）。
// 集約: 属性キー（--group-key）で MultiPolygon へ集約する。未指定時はフィーチャー単位（ポリゴン結合なし）。
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
  const assetType = args.get('asset-type') ?? '';
  if (!['road', 'river', 'port', 'police'].includes(assetType)) {
    throw new Error('--asset-type は road / river / port / police のいずれかです');
  }
  return {
    input: args.get('input') ?? '',
    assetType,
    prefCode: args.get('pref-code') ?? null,
    groupKey: args.get('group-key') ?? null, // 例: N05_002（路線名）等
    nameKey: args.get('name-key') ?? null, // 表示名を取る属性キー
    sourceSlug: args.get('source-slug') ?? '',
    precision: args.get('precision') ?? 'official',
    estimated: args.get('estimated') === 'true',
    notes: args.get('notes') ?? '',
    output: args.get('output'),
    stdout: argv.includes('--stdout'),
  };
}

function assertLatLon(polygons) {
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
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
  }
}

function closeRing(ring) {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

function collectPolygons(geometry, out) {
  if (geometry.type === 'Polygon') {
    out.push(geometry.coordinates.map(closeRing));
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      out.push(poly.map(closeRing));
    }
  }
}

function polygonsToMultiPolygonWkt(polygons) {
  const parts = polygons.map((poly) => {
    const rings = poly.map(
      (ring) => `(${ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ')})`,
    );
    return `(${rings.join(', ')})`;
  });
  return `MULTIPOLYGON(${parts.join(', ')})`;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.input === '') {
  throw new Error('--input <path|-> は必須です（- は標準入力）');
}
if (opts.sourceSlug === '') {
  throw new Error('--source-slug <slug> は必須です（provenance.data_sources に登録済みの slug）');
}

const raw = opts.input === '-' ? readFileSync(0, 'utf8') : readFileSync(opts.input, 'utf8');
const featureCollection = JSON.parse(raw);
if (featureCollection?.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features)) {
  throw new Error('入力は FeatureCollection（GeoJSON）である必要があります');
}

const sourceId = uuidFor(`registry:${opts.sourceSlug}`);

const lines = [
  '-- ============================================================',
  `-- ${opts.assetType} 管轄区域のステージング取込（自動生成・手編集禁止）`,
  '-- 生成: scripts/jurisdiction-geojson-to-imports.mjs',
  `-- asset_type: ${opts.assetType} / source: ${opts.sourceSlug}`,
  '-- 方針: pending で登録し、SCR-07 の二者レビュー（geometry 検証含む）後に公開する',
  '-- ============================================================',
  'BEGIN;',
];

const groups = new Map();
for (const feature of featureCollection.features) {
  const props = feature.properties ?? {};
  const prefCode = String(props.N03_PREF ?? props.pref ?? props.PREF ?? '');
  if (opts.prefCode !== null && prefCode !== opts.prefCode) continue;
  if (feature.geometry === null || feature.geometry === undefined) continue;
  const rings = [];
  collectPolygons(feature.geometry, rings);
  if (rings.length === 0) continue;
  assertLatLon(rings);

  // 集約キー: group-key 指定時はその属性値、未指定時はフィーチャーごとに一意な連番
  const groupValue = opts.groupKey ? String(props[opts.groupKey] ?? '') : `f${groups.size}`;
  const nameValue = opts.nameKey ? String(props[opts.nameKey] ?? groupValue) : groupValue;
  const key = `${prefCode}:${opts.assetType}:${groupValue}`;
  const group = groups.get(key) ?? { prefCode, name: nameValue, polygons: [] };
  group.polygons.push(...rings);
  groups.set(key, group);
}

let count = 0;
for (const group of groups.values()) {
  const wkt = polygonsToMultiPolygonWkt(group.polygons);
  const importId = uuidFor(`entity:jur:${opts.assetType}:${group.prefCode}:${group.name}`);
  const payload = {
    assetType: opts.assetType,
    assetName: group.name,
    prefCode: group.prefCode,
    crs: 'EPSG:4326',
    precision: opts.precision,
    estimated: opts.estimated,
    geometryWkt: wkt,
    sourceSlug: opts.sourceSlug,
    notes: opts.notes || `${opts.assetType} 管轄データ。座標・境界の正確性はレビューで確認する`,
  };
  const qualityFlags = ['geometry_pending_review'];
  lines.push(
    `INSERT INTO staging.import_records (id, source_id, entity_kind, raw_payload, quality_flags, review_state)`,
    `VALUES (${q(importId)}, ${q(sourceId)}, 'jurisdiction', ${q(JSON.stringify(payload))}::jsonb, ${q(JSON.stringify(qualityFlags))}::jsonb, 'pending')`,
    `ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, entity_kind = EXCLUDED.entity_kind, raw_payload = EXCLUDED.raw_payload, quality_flags = EXCLUDED.quality_flags, review_state = EXCLUDED.review_state;`,
  );
  count += 1;
}

lines.push('COMMIT;', '');
const sql = lines.join('\n');
if (opts.stdout) {
  process.stdout.write(sql);
} else {
  const output = opts.output;
  if (output === undefined) {
    throw new Error('--output <path> を指定してください（--stdout の場合は不要）');
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(output, sql);
}
console.warn(`generated ${count} ${opts.assetType} jurisdiction imports (source: ${opts.sourceSlug})`);
