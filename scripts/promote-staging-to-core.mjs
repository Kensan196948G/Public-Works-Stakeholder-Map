// 承認済みステージング取込（review_state=approved）を core.* へ昇格する SQL を生成する。
// 実行:
//   DATABASE_URL="<Neon dev接続文字列>" node scripts/promote-staging-to-core.mjs
//     → reports/0006_core_real_data.sql（生成のみ・巨大 WKT のため Git 管理外）
//   DATABASE_URL="<Neon dev接続文字列>" node scripts/promote-staging-to-core.mjs --apply
//     → 生成 SQL を同接続先へ適用（dev 検証用）
//
// 方針:
// - 無レビュー公開禁止のため、生成対象は review_state='approved' のみ
// - 行政区域（N03）管轄は「<都道府県>（行政区域）」の代表機関に紐付ける
//   （市区町村単位の窓口機関・道路/河川/港湾/警察の管轄ポリゴンは次フェーズ）
// - すべて決定的 UUID・冪等（ON CONFLICT DO UPDATE）
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { neon } from '@neondatabase/serverless';
import { normalizeOrganizationName } from '@pwsm/domain';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === '') {
  console.error('DATABASE_URL が未設定です');
  process.exitCode = 1;
  process.exit();
}
const applyToDb = process.argv.includes('--apply');

function uuidFor(name) {
  const h = createHash('sha256').update(name).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function q(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const sql = neon(databaseUrl);
const registry = new Map(
  readdirSync(join(process.cwd(), 'data/source-registry/sources'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const entry = JSON.parse(readFileSync(join(process.cwd(), 'data/source-registry/sources', f), 'utf8'));
      return [entry.id, entry];
    }),
);

const approved = await sql`
  SELECT id, source_id, entity_kind, raw_payload, quality_flags, review_state, reviewer_note
  FROM staging.import_records
  WHERE review_state = 'approved'
  ORDER BY entity_kind, created_at
`;
if (approved.length === 0) {
  console.error('approved レコードがありません（先に SCR-07 レビューで approve してください）');
  process.exitCode = 1;
  process.exit();
}

const SOURCE_EVIDENCE_ID = uuidFor('evidence:jur:mlit-ksj-n03');
const ADMIN_ORGS = {
  13: { name: '東京都（行政区域）', url: 'https://www.metro.tokyo.lg.jp/' },
  14: { name: '神奈川県（行政区域）', url: 'https://www.pref.kanagawa.jp/' },
  27: { name: '大阪府（行政区域）', url: 'https://www.pref.osaka.lg.jp/' },
};
// 行政区域の代表機関は「自治体窓口」候補として municipality で扱う
// （基本ルール R-BASE-ISSUER の targetTypes と整合させる）
const ADMIN_TYPE = 'municipality';

const lines = [
  '-- ============================================================',
  '-- 0006_core_real_data.sql — 承認済み staging の core 昇格（自動生成・手編集禁止）',
  '-- 生成: scripts/promote-staging-to-core.mjs',
  '-- 方針: approved のみ・決定的 UUID・冪等。行政区域は都道府県代表機関に紐付け',
  '-- ============================================================',
  'BEGIN;',
  // N03 用の根拠（source_evidence）
  `INSERT INTO provenance.source_evidence (id, source_id, title, url, captured_at)`,
  `VALUES (${q(SOURCE_EVIDENCE_ID)}, ${q(uuidFor('registry:mlit-ksj-n03'))}, '国土数値情報 行政区域データ（N03-20260101）', 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_0.html', '2026-08-13T00:00:00+09:00')`,
  `ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, title = EXCLUDED.title, url = EXCLUDED.url, captured_at = EXCLUDED.captured_at;`,
];

const orgRows = approved.filter((r) => r.entity_kind === 'organization');
const officeRows = approved.filter((r) => r.entity_kind === 'office');
const contactRows = approved.filter((r) => r.entity_kind === 'contact_point');
const jurRows = approved.filter((r) => r.entity_kind === 'jurisdiction');

// 1) 機関（source 由来・16 件想定）
const orgIdBySlug = new Map();
for (const row of orgRows) {
  const p = row.raw_payload;
  const slug = p.sourceSlug;
  const source = registry.get(slug);
  if (source === undefined) continue;
  const orgId = uuidFor(`core:org:${slug}`);
  orgIdBySlug.set(slug, orgId);
  const checkedAt = '2026-08-13T00:00:00+09:00';
  const dueAt = new Date(Date.parse(checkedAt) + source.ttlDays * 86400000).toISOString();
  lines.push(
    `INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, external_source_id, external_ref, source_checked_at, freshness_due_at)`,
    `VALUES (${q(orgId)}, ${q(source.publisher)}, ${q(normalizeOrganizationName(source.publisher))}, ${q(source.organizationType)}, ${q(source.baseUrl)}, 'published', ${q(uuidFor(`registry:${slug}`))}, ${q(slug)}, ${q(checkedAt)}, ${q(dueAt)})`,
    `ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, external_source_id = EXCLUDED.external_source_id, external_ref = EXCLUDED.external_ref, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;`,
  );
}

// 2) 行政区域の代表機関（都道府県単位・3 件）
const adminOrgIdByPref = new Map();
for (const [pref, info] of Object.entries(ADMIN_ORGS)) {
  const orgId = uuidFor(`core:org:admin:${pref}`);
  adminOrgIdByPref.set(pref, orgId);
  lines.push(
    `INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, external_source_id, external_ref, source_checked_at, freshness_due_at)`,
    `VALUES (${q(orgId)}, ${q(info.name)}, ${q(normalizeOrganizationName(info.name))}, ${q(ADMIN_TYPE)}, ${q(info.url)}, 'published', ${q(uuidFor('registry:mlit-ksj-n03'))}, ${q(`n03-admin-${pref}`)}, '2026-08-13T00:00:00+09:00', '2027-08-13T00:00:00+09:00')`,
    `ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, external_source_id = EXCLUDED.external_source_id, external_ref = EXCLUDED.external_ref, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;`,
  );
}

// 3) 窓口（office）
const officeIdMap = new Map();
for (const row of officeRows) {
  const p = row.raw_payload;
  const orgId = orgIdBySlug.get(p.sourceSlug);
  if (orgId === undefined) continue;
  const officeId = uuidFor(`core:office:${p.sourceSlug}:${p.officeName}`);
  officeIdMap.set(`${p.sourceSlug}:${p.officeName}`, officeId);
  lines.push(
    `INSERT INTO core.offices (id, organization_id, name, role_summary, postal_code, address_raw, reception_note, status)`,
    `VALUES (${q(officeId)}, ${q(orgId)}, ${q(p.officeName)}, ${q(p.roleSummary ?? null)}, ${q(p.postalCode ?? null)}, ${q(p.addressRaw ?? null)}, ${q(p.receptionNote ?? null)}, 'published')`,
    `ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name, role_summary = EXCLUDED.role_summary, postal_code = EXCLUDED.postal_code, address_raw = EXCLUDED.address_raw, reception_note = EXCLUDED.reception_note, status = EXCLUDED.status;`,
  );
}

// 4) 連絡先（contact_point）
for (const row of contactRows) {
  const p = row.raw_payload;
  const officeId = officeIdMap.get(`${p.sourceSlug}:${p.officeName}`);
  if (officeId === undefined) continue;
  const contactId = uuidFor(`core:contact:${p.sourceSlug}:${p.officeName}:${p.contactType}:${p.label}`);
  const normalized =
    p.contactType === 'phone'
      ? String(p.displayValue ?? '').replace(/[^0-9]/g, '')
      : String(p.displayValue ?? '');
  lines.push(
    `INSERT INTO core.contact_points (id, office_id, contact_type, label, display_value, normalized_value, extension, is_emergency, source_checked_at)`,
    `VALUES (${q(contactId)}, ${q(officeId)}, ${q(p.contactType)}, ${q(p.label)}, ${q(p.displayValue)}, ${q(normalized)}, ${q(p.extension ?? null)}, false, '2026-08-13T00:00:00+09:00')`,
    `ON CONFLICT (id) DO UPDATE SET office_id = EXCLUDED.office_id, contact_type = EXCLUDED.contact_type, label = EXCLUDED.label, display_value = EXCLUDED.display_value, normalized_value = EXCLUDED.normalized_value, extension = EXCLUDED.extension, is_emergency = EXCLUDED.is_emergency, source_checked_at = EXCLUDED.source_checked_at;`,
  );
}

// 5) 管轄区域（N03 行政区域 → 都道府県代表機関）
for (const row of jurRows) {
  const p = row.raw_payload;
  const pref = String(p.prefCode);
  const orgId = adminOrgIdByPref.get(pref);
  if (orgId === undefined) continue;
  const jurId = uuidFor(`core:jur:n03:${pref}:${p.cityCode}`);
  lines.push(
    `INSERT INTO core.jurisdictions (id, organization_id, asset_type, asset_name, geometry, precision, estimated, scale_note, status, evidence_id, source_checked_at)`,
    `VALUES (${q(jurId)}, ${q(orgId)}, 'administrative', ${q(p.assetName)}, ST_GeomFromText(${q(p.geometryWkt)}, 4326), ${q(p.precision)}, ${p.estimated === true ? 'true' : 'false'}, '国土数値情報 N03-20260101（約500m精度）', 'published', ${q(SOURCE_EVIDENCE_ID)}, '2026-08-13T00:00:00+09:00')`,
    `ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, scale_note = EXCLUDED.scale_note, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;`,
  );
}

lines.push('COMMIT;', '');
const generatedSql = lines.join('\n');
const outFile = join(process.cwd(), 'reports/0006_core_real_data.sql');
mkdirSync(join(process.cwd(), 'reports'), { recursive: true });
writeFileSync(outFile, generatedSql);
console.warn(
  `generated ${outFile} (orgs=${orgRows.length} adminOrgs=${Object.keys(ADMIN_ORGS).length} offices=${officeRows.length} contacts=${contactRows.length} jurisdictions=${jurRows.length})`,
);

if (applyToDb) {
  const client = neon(databaseUrl);
  await client.unsafe(generatedSql.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''));
  console.warn('applied to database (dev)');
}
