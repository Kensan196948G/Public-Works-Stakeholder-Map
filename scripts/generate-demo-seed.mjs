// 架空デモデータの seed SQL 生成スクリプト。
// data/fixtures (@pwsm/fixtures) を単一の真実とし、DB 用 seed を機械生成する。
// 実行: npm run build && node scripts/generate-demo-seed.mjs
// 出力: db/seeds/demo/0001_demo_dataset.sql
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { demoDataset } from '../data/fixtures/dist/index.js';
import { normalizeOrganizationName } from '../packages/domain/dist/normalize.js';

/** 決定的 UUID（同一入力 → 同一 ID で seed を冪等にする） */
function uuidFor(name) {
  const h = createHash('sha256').update(name).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function q(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** 機関種別 → 管轄資産種別（jurisdiction_asset_type）のマッピング */
const ASSET_TYPE_BY_ORG = {
  issuer: 'administrative',
  municipality: 'administrative',
  prefecture: 'administrative',
  road_admin: 'road',
  river_admin: 'river',
  port_admin: 'port',
  police: 'police',
  other: 'administrative',
};

function bboxToMultiPolygonWkt(bbox) {
  const { minLat, maxLat, minLon, maxLon } = bbox;
  return `MULTIPOLYGON(((${minLon} ${minLat}, ${maxLon} ${minLat}, ${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat})))`;
}

function freshnessDueIso(sourceCheckedAt, ttlDays) {
  return new Date(new Date(sourceCheckedAt).getTime() + ttlDays * 86_400_000).toISOString();
}

const regionByCode = new Map(demoDataset.regions.map((r) => [r.code, r]));
const lines = [
  '-- ============================================================',
  '-- 0001_demo_dataset.sql — 架空デモデータ seed（自動生成・手編集禁止）',
  '-- 生成元: data/fixtures (@pwsm/fixtures) / scripts/generate-demo-seed.mjs',
  '-- 実在の機関・連絡先・管轄を一切含まない検証用データ',
  '-- ============================================================',
  'BEGIN;',
];

for (const org of demoDataset.organizations) {
  const srcId = uuidFor(`src:${org.id}`);
  const evId = uuidFor(`ev:${org.id}`);
  const orgId = uuidFor(`org:${org.id}`);
  const officeId = uuidFor(`off:${org.id}`);
  const evidence = org.evidence[0];
  const host = new URL(org.officialUrl).hostname;
  const due = freshnessDueIso(org.sourceCheckedAt, org.ttlDays);

  lines.push(
    `INSERT INTO provenance.data_sources (id, name, publisher, base_url, authority, format, fetch_mode, ttl_days, allowed_host, active)`,
    `VALUES (${q(srcId)}, ${q(`${org.name} 公式情報`)}, ${q(org.name)}, ${q(org.officialUrl)}, ${q(org.authority)}, 'HTML', 'manual', ${org.ttlDays}, ${q(host)}, true)`,
    `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, base_url = EXCLUDED.base_url, authority = EXCLUDED.authority, ttl_days = EXCLUDED.ttl_days, allowed_host = EXCLUDED.allowed_host, active = EXCLUDED.active;`,
    `INSERT INTO provenance.source_evidence (id, source_id, title, url, captured_at)`,
    `VALUES (${q(evId)}, ${q(srcId)}, ${q(evidence.title)}, ${q(evidence.url)}, ${q(evidence.sourceCheckedAt)})`,
    `ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, title = EXCLUDED.title, url = EXCLUDED.url, captured_at = EXCLUDED.captured_at;`,
    `INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, source_checked_at, freshness_due_at)`,
    `VALUES (${q(orgId)}, ${q(org.name)}, ${q(normalizeOrganizationName(org.name))}, ${q(org.type)}, ${q(org.officialUrl)}, ${q(org.reviewStatus)}, ${q(org.sourceCheckedAt)}, ${q(due)})`,
    `ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;`,
    `INSERT INTO core.offices (id, organization_id, name, status)`,
    `VALUES (${q(officeId)}, ${q(orgId)}, ${q(org.officeName)}, ${q(org.reviewStatus)})`,
    `ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name, status = EXCLUDED.status;`,
  );

  for (const regionCode of org.regionCodes) {
    const region = regionByCode.get(regionCode);
    if (region === undefined) throw new Error(`unknown region: ${regionCode}`);
    const jurId = uuidFor(`jur:${org.id}:${regionCode}`);
    lines.push(
      `INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)`,
      `VALUES (${q(jurId)}, ${q(orgId)}, ${q(officeId)}, ${q(ASSET_TYPE_BY_ORG[org.type])}, ${q(region.name)}, ST_GeomFromText(${q(bboxToMultiPolygonWkt(region.bbox))}, 4326), ${q(org.precision)}, ${org.estimated}, ${q(org.reviewStatus)}, ${q(evId)}, ${q(org.sourceCheckedAt)})`,
      `ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;`,
    );
  }
}

for (const rule of demoDataset.rules) {
  const ruleId = uuidFor(`rule:${rule.ruleCode}`);
  const targetTypes = `ARRAY[${rule.targetTypes.map(q).join(', ')}]::core.organization_type[]`;
  lines.push(
    `INSERT INTO core.stakeholder_rules (id, rule_code, version, condition_json, target_types, reason_template, priority, status, approved_by, approved_at)`,
    `VALUES (${q(ruleId)}, ${q(rule.ruleCode)}, ${rule.version}, ${q(JSON.stringify(rule.condition))}::jsonb, ${targetTypes}, ${q(rule.reasonTemplate)}, ${rule.priority}, 'published', 'demo-seed', '2026-07-18T00:00:00Z')`,
    `ON CONFLICT (id) DO UPDATE SET condition_json = EXCLUDED.condition_json, target_types = EXCLUDED.target_types, reason_template = EXCLUDED.reason_template, priority = EXCLUDED.priority, status = EXCLUDED.status;`,
  );
}

lines.push('COMMIT;', '');

mkdirSync('db/seeds/demo', { recursive: true });
writeFileSync('db/seeds/demo/0001_demo_dataset.sql', lines.join('\n'));
console.warn(`generated db/seeds/demo/0001_demo_dataset.sql (${lines.length} lines)`);
