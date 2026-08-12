// 国土数値情報 行政区域（N03）の GeoJSON を、管轄区域のステージング取込レコードへ変換する。
// 実行例:
//   node scripts/n03-geojson-to-imports.mjs --input n03-tokyo.geojson --pref-code 13
//   node scripts/n03-geojson-to-imports.mjs --input - --pref-code 13 --stdout
//
// 前提: 入力 GeoJSON は EPSG:4326（経度・緯度）の Polygon / MultiPolygon。
//       ogr2ogr 等で変換しておく（例: ogr2ogr -f GeoJSON -t_srs EPSG:4326 out.geojson N03-xx.geojson）
// 方針: 生成物は必ず staging（pending）へ置き、SCR-07 の二者レビュー後に公開する（無レビュー公開禁止）。
// 集約: N03 は市町村単位のポリゴンが多数のフィーチャーに分割されているため、
//       市区町村キー（都道府県コード + 市区町村コード N03_007）で MultiPolygon へ集約する。
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

const raw = opts.input === '-' ? readFileSync(0, 'utf8') : readFileSync(opts.input, 'utf8');
const featureCollection = JSON.parse(raw);
if (featureCollection?.type !== 'FeatureCollection' || !Array.isArray(featureCollection.features)) {
  throw new Error('入力は FeatureCollection（GeoJSON）である必要があります');
}

const sourceId = uuidFor(`registry:${opts.sourceSlug}`);

/** 都道府県名（N03_001）→ 都道府県コード（N03_007 欠落時のフォールバック用） */
const PREF_CODE_BY_NAME = {
  北海道: '01', 青森県: '02', 岩手県: '03', 宮城県: '04', 秋田県: '05', 山形県: '06',
  福島県: '07', 茨城県: '08', 栃木県: '09', 群馬県: '10', 埼玉県: '11', 千葉県: '12',
  東京都: '13', 神奈川県: '14', 新潟県: '15', 富山県: '16', 石川県: '17', 福井県: '18',
  山梨県: '19', 長野県: '20', 岐阜県: '21', 静岡県: '22', 愛知県: '23', 三重県: '24',
  滋賀県: '25', 京都府: '26', 大阪府: '27', 兵庫県: '28', 奈良県: '29', 和歌山県: '30',
  鳥取県: '31', 島根県: '32', 岡山県: '33', 広島県: '34', 山口県: '35', 徳島県: '36',
  香川県: '37', 愛媛県: '38', 高知県: '39', 福岡県: '40', 佐賀県: '41', 長崎県: '42',
  熊本県: '43', 大分県: '44', 宮崎県: '45', 鹿児島県: '46', 沖縄県: '47',
};

function resolvePrefCode(props) {
  if (props.N03_PREF !== undefined && props.N03_PREF !== null) return String(props.N03_PREF);
  const fromCode = String(props.N03_007 ?? '').slice(0, 2);
  if (fromCode !== '') return fromCode;
  return PREF_CODE_BY_NAME[String(props.N03_001 ?? '')] ?? '';
}

const lines = [
  '-- ============================================================',
  '-- N03 行政区域のステージング取込（自動生成・手編集禁止）',
  '-- 生成: scripts/n03-geojson-to-imports.mjs',
  '-- 方針: pending で登録し、SCR-07 の二者レビュー（geometry 検証含む）後に公開する',
  '-- ============================================================',
  'BEGIN;',
];

const groups = new Map();
for (const feature of featureCollection.features) {
  const props = feature.properties ?? {};
  const prefCode = resolvePrefCode(props);
  const rawCityCode = String(props.N03_007 ?? props.N03_CITY ?? props.N03_NAME ?? '');
  // 所属未定地（N03_007 なし、または「13000」等の全ゼロ市区町村コード）は
  // 都道府県単位の「未割当」として扱う（2026-08-13: N03-2025 で 13000 表記を確認）
  const isUnassigned = rawCityCode === '' || /^\d{2}000$/.test(rawCityCode);
  const cityCode = isUnassigned && prefCode !== '' ? `${prefCode}-unknown` : rawCityCode;
  // 表示名: 「横浜市鶴見区」のように上位（N03_003）と下位（N03_004）を連結する
  const cityName = String(
    props.N03_CITY ??
      // N03-2026 以降は政令指定都市の行政区名が N03_005 に格納される（例: 大阪市/N03_004 + 北区/N03_005）
      [props.N03_003, props.N03_004, props.N03_005]
        .filter((v) => typeof v === 'string' && v !== '')
        .join('') ??
      props.N03_NAME ??
      '',
  );
  if (opts.prefCode !== null && prefCode !== opts.prefCode) continue;
  if (opts.cityFilter !== null && !cityName.includes(opts.cityFilter)) continue;
  if (feature.geometry === null || feature.geometry === undefined) continue;
  const rings = [];
  collectPolygons(feature.geometry, rings);
  assertLatLon(rings);
  const key = `${prefCode}:${cityCode}`;
  const unassigned = isUnassigned;
  const group = groups.get(key) ?? {
    prefCode,
    cityCode,
    cityName,
    polygons: [],
    unassigned,
  };
  group.polygons.push(...rings);
  groups.set(key, group);
}

let count = 0;
for (const group of groups.values()) {
  const wkt = polygonsToMultiPolygonWkt(group.polygons);
  const importId = uuidFor(`entity:jur:n03:${group.prefCode}:${group.cityCode}`);
  const payload = {
    assetType: 'administrative',
    assetName: group.cityName,
    prefCode: group.prefCode,
    cityCode: group.cityCode,
    crs: 'EPSG:4326',
    precision: 'official',
    estimated: false,
    geometryWkt: wkt,
    sourceSlug: opts.sourceSlug,
    notes: group.unassigned
      ? 'N03 所属未定地（市町村未割当）。公開可否はレビューで判断する'
      : 'N03 行政区域データ（市町村単位へ集約済み）。座標・境界の正確性はレビューで確認する',
  };
  const qualityFlags = group.unassigned
    ? ['geometry_pending_review', 'city_unassigned']
    : ['geometry_pending_review'];
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
  // 実データは Git に置かない方針のため、ファイル出力先は明示指定のみ（--output）
  const output = opts.output;
  if (output === undefined) {
    throw new Error('--output <path> を指定してください（--stdout の場合は不要）');
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(output, sql);
}
console.warn(`generated ${count} jurisdiction imports (source: ${opts.sourceSlug})`);
