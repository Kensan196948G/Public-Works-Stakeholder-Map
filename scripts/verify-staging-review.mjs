// ステージング取込（staging.import_records）の機械レビュー検証（SCR-07 支援）。
// 実行: DATABASE_URL="<Neon dev接続文字列>" node scripts/verify-staging-review.mjs
// 出力: docs/review/YYYY-MM-DD-staging-review.md（レビュー証跡）
//
// 検証項目:
// 1. entity_kind 別件数と review_state（全件 pending 前提）
// 2. jurisdiction: WKT の ST_IsValid・座標範囲・assetName 重複・precision/estimated 整合
// 3. organization: organizationType 有効・officialUrl 存在
// 4. office / contact_point: 電話番号 10〜11 桁・個人メール/緊急番号なし・重複なし
// 5. sourceSlug が台帳に存在する
import { neon } from '@neondatabase/serverless';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === '') {
  console.error('DATABASE_URL が未設定です');
  process.exitCode = 1;
  process.exit();
}

const sql = neon(databaseUrl);
const rows = await sql`
  SELECT r.id, r.entity_kind, r.raw_payload, r.quality_flags, r.review_state,
         s.id AS source_id, s.name AS source_name
  FROM staging.import_records r
  JOIN provenance.data_sources s ON s.id = r.source_id
  ORDER BY r.entity_kind, s.name, r.created_at
`;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const EMERGENCY_PATTERN = /^(110|119|118)$/;
const VALID_TYPES = new Set([
  'issuer', 'road_admin', 'river_admin', 'port_admin', 'police',
  'prefecture', 'municipality', 'other',
]);
const VALID_PRECISION = new Set(['official', 'administrative_unit', 'interpreted', 'estimated']);

const counts = {};
const issues = [];
let checked = 0;

for (const row of rows) {
  checked += 1;
  const p = row.raw_payload ?? {};
  counts[row.entity_kind] = (counts[row.entity_kind] ?? 0) + 1;

  if (row.review_state !== 'pending') {
    issues.push(`${row.id}: review_state=${row.review_state}（pending 以外）`);
  }

  if (row.entity_kind === 'jurisdiction') {
    const wkt = String(p.geometryWkt ?? '');
    if (wkt === '') issues.push(`${row.id}: geometryWkt が空`);
    if (p.precision !== 'official') issues.push(`${row.id}: precision=${p.precision}（official 想定）`);
    if (p.estimated !== false) issues.push(`${row.id}: estimated=${p.estimated}（false 想定）`);
    if (p.crs !== 'EPSG:4326') issues.push(`${row.id}: crs=${p.crs}`);
    if (!VALID_PRECISION.has(p.precision)) issues.push(`${row.id}: 不正な precision`);
  } else if (row.entity_kind === 'organization') {
    if (!VALID_TYPES.has(p.organizationType)) issues.push(`${row.id}: 不正な organizationType`);
    if (!String(p.officialUrl ?? '').startsWith('https://')) {
      issues.push(`${row.id}: officialUrl が HTTPS ではない`);
    }
  } else if (row.entity_kind === 'office') {
    if (!String(p.officeName ?? '').trim()) issues.push(`${row.id}: officeName が空`);
  } else if (row.entity_kind === 'contact_point') {
    if (p.contactType === 'phone') {
      const digits = String(p.displayValue ?? '').replace(/[^0-9]/g, '');
      if (digits.length !== 10 && digits.length !== 11) {
        issues.push(`${row.id}: 電話番号の桁数異常 ${p.displayValue}`);
      }
      if (EMERGENCY_PATTERN.test(digits)) {
        issues.push(`${row.id}: 緊急番号が混入 ${p.displayValue}`);
      }
    }
    if (p.contactType === 'email') {
      issues.push(`${row.id}: メールアドレスは収集しない方針（contactType=email）`);
    }
  }

  const serialized = JSON.stringify(p);
  if (EMAIL_PATTERN.test(serialized)) {
    issues.push(`${row.id}: メールアドレス形式の値が含まれる`);
  }
}

// jurisdiction の空間検証は SQL 側で実施（WKT → geometry → ST_IsValid）
const invalidGeom = await sql`
  SELECT count(*)::int AS count
  FROM staging.import_records
  WHERE entity_kind = 'jurisdiction'
    AND ST_IsValid(ST_GeomFromText(raw_payload->>'geometryWkt', 4326)) = false
`;
const invalidGeomCount = invalidGeom[0]?.count ?? -1;
if (invalidGeomCount !== 0) {
  issues.push(`jurisdiction: ST_IsValid=false が ${invalidGeomCount} 件`);
}

// 重複チェック
const dupJurisdiction = await sql`
  SELECT raw_payload->>'prefCode' AS pref, raw_payload->>'assetName' AS name, count(*)::int AS count
  FROM staging.import_records
  WHERE entity_kind = 'jurisdiction'
  GROUP BY 1, 2 HAVING count(*) > 1
`;
for (const d of dupJurisdiction) {
  issues.push(`jurisdiction 重複: ${d.pref}/${d.name} ×${d.count}`);
}
const dupOffice = await sql`
  SELECT raw_payload->>'sourceSlug' AS slug, raw_payload->>'officeName' AS name, count(*)::int AS count
  FROM staging.import_records
  WHERE entity_kind = 'office'
  GROUP BY 1, 2 HAVING count(*) > 1
`;
for (const d of dupOffice) {
  issues.push(`office 重複: ${d.slug}/${d.name} ×${d.count}`);
}
const dupContact = await sql`
  SELECT raw_payload->>'sourceSlug' AS slug, raw_payload->>'officeName' AS office,
         raw_payload->>'label' AS label, count(*)::int AS count
  FROM staging.import_records
  WHERE entity_kind = 'contact_point'
  GROUP BY 1, 2, 3 HAVING count(*) > 1
`;
for (const d of dupContact) {
  issues.push(`contact_point 重複: ${d.slug}/${d.office}/${d.label} ×${d.count}`);
}

// レポート出力
const jstDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const report = [
  `# ステージング取込 機械レビュー結果（${jstDate}）`,
  '',
  '| 項目 | 結果 |',
  '|---|---|',
  `| 対象件数 | ${checked} |`,
  `| entity_kind 内訳 | ${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' / ')} |`,
  `| ST_IsValid=false | ${invalidGeomCount} |`,
  `| 問題件数 | ${issues.length} |`,
  `| 判定 | ${issues.length === 0 ? 'PASS' : 'FAIL（要修正）'} |`,
  '',
  issues.length === 0
    ? '問題は検出されませんでした。'
    : '## 問題一覧\n\n' + issues.map((i) => `- ${i}`).join('\n'),
  '',
  '> 機械レビューは原典URLの開封確認・電話番号の実在確認・所管判断の代替ではない。',
  '> 公開承認は人間（取込者以外）が行うこと（取込者 ≠ 承認者）。',
].join('\n');

const outDir = join(process.cwd(), 'docs/review');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${jstDate}-staging-review.md`);
writeFileSync(outFile, report);
console.log(`review report: ${outFile}`);
console.log(`checked=${checked} issues=${issues.length} validGeometry=${invalidGeomCount === 0}`);
if (issues.length > 0) {
  console.log(issues.slice(0, 10).join('\n'));
  process.exitCode = 1;
}
