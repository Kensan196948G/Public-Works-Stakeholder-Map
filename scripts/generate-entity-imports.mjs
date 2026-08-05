// 公式情報源台帳（data/source-registry）から、ステージング取込レコード
// （staging.import_records・entity_kind=organization）を生成する。
// 実行: node scripts/generate-entity-imports.mjs            → db/seeds/registry/0002_staging_org_imports.sql
//        node scripts/generate-entity-imports.mjs --stdout  → 標準出力へ出力（テスト・確認用）
//
// 方針: 無レビュー公開禁止のため、生成物は必ず staging（pending）へ置く。
//       組織レコードは公式 URL・来歴（source_id）とセットで、SCR-07 の二者レビュー後に公開する。
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REGISTRY_DIR = join(process.cwd(), 'data/source-registry/sources');
const OUTPUT_PATH = join(process.cwd(), 'db/seeds/registry/0002_staging_org_imports.sql');
const toStdout = process.argv.includes('--stdout');

function uuidFor(name) {
  const h = createHash('sha256').update(name).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function q(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const files = readdirSync(REGISTRY_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const sources = files.map((file) => JSON.parse(readFileSync(join(REGISTRY_DIR, file), 'utf8')));

if (sources.length === 0) {
  throw new Error('source registry is empty');
}

const lines = [
  '-- ============================================================',
  '-- 0002_staging_org_imports.sql — 組織レコードのステージング取込（自動生成・手編集禁止）',
  '-- 生成元: data/source-registry/sources/*.json',
  '-- 生成: scripts/generate-entity-imports.mjs',
  '-- 方針: 無レビュー公開禁止（§6.2）。必ず pending で登録し、SCR-07 で二者レビュー後に公開する',
  '-- ============================================================',
  'BEGIN;',
];

for (const source of sources) {
  const sourceId = uuidFor(`registry:${source.id}`);
  const importId = uuidFor(`entity:org:${source.id}`);
  const payload = {
    canonicalName: source.publisher,
    sourceName: source.name,
    organizationType: source.organizationType,
    officialUrl: source.baseUrl,
    region: source.region,
    sourceSlug: source.id,
    notes: source.notes ?? null,
  };
  lines.push(
    `INSERT INTO staging.import_records (id, source_id, entity_kind, raw_payload, quality_flags, review_state)`,
    `VALUES (${q(importId)}, ${q(sourceId)}, 'organization', ${q(JSON.stringify(payload))}::jsonb, '[]'::jsonb, 'pending')`,
    `ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, entity_kind = EXCLUDED.entity_kind, raw_payload = EXCLUDED.raw_payload, quality_flags = EXCLUDED.quality_flags, review_state = EXCLUDED.review_state;`,
  );
}

lines.push('COMMIT;', '');
const sql = lines.join('\n');

if (toStdout) {
  process.stdout.write(sql);
} else {
  mkdirSync(join(process.cwd(), 'db/seeds/registry'), { recursive: true });
  writeFileSync(OUTPUT_PATH, sql);
  console.warn(`generated ${OUTPUT_PATH} (${sources.length} staging org imports)`);
}
