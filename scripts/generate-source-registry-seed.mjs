// 公式情報源台帳（data/source-registry）から Neon provenance.data_sources 用 seed SQL を生成する。
// 実行: node scripts/generate-source-registry-seed.mjs            → db/seeds/registry/0001_source_registry.sql へ出力
//        node scripts/generate-source-registry-seed.mjs --stdout  → 標準出力へ出力（テスト・確認用）
// 方針: 台帳 JSON が単一の真実。DB 登録時に決定的 UUID を採番し、冪等（ON CONFLICT DO UPDATE）で再適用可能。
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REGISTRY_DIR = join(process.cwd(), 'data/source-registry/sources');
const OUTPUT_PATH = join(process.cwd(), 'db/seeds/registry/0001_source_registry.sql');
const toStdout = process.argv.includes('--stdout');

/** 決定的 UUID（同一 slug → 同一 UUID で冪等にする） */
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

const sources = files.map((file) => {
  const raw = JSON.parse(readFileSync(join(REGISTRY_DIR, file), 'utf8'));
  return { ...raw, _file: file };
});

if (sources.length === 0) {
  throw new Error('source registry is empty');
}

const lines = [
  '-- ============================================================',
  '-- 0001_source_registry.sql — 公式情報源台帳 seed（自動生成・手編集禁止）',
  '-- 生成元: data/source-registry/sources/*.json',
  '-- 生成: scripts/generate-source-registry-seed.mjs',
  '-- 方針: 台帳 JSON を正本とし、決定的 UUID で冪等に登録する（要件 §9.3）',
  '-- ============================================================',
  'BEGIN;',
];

for (const source of sources) {
  const id = uuidFor(`registry:${source.id}`);
  const licenseText = source.license?.summary ?? null;
  const licenseUrl = source.license?.url ?? null;
  lines.push(
    `INSERT INTO provenance.data_sources (id, name, publisher, base_url, authority, format, fetch_mode, ttl_days, allowed_host, license_text, license_url, active)`,
    `VALUES (${q(id)}, ${q(source.name)}, ${q(source.publisher)}, ${q(source.baseUrl)}, ${q(source.authority)}, ${q(source.format)}, ${q(source.fetchMode)}, ${source.ttlDays}, ${q(source.allowedHost)}, ${q(licenseText)}, ${q(licenseUrl)}, ${source.active})`,
    `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, base_url = EXCLUDED.base_url, authority = EXCLUDED.authority, format = EXCLUDED.format, fetch_mode = EXCLUDED.fetch_mode, ttl_days = EXCLUDED.ttl_days, allowed_host = EXCLUDED.allowed_host, license_text = EXCLUDED.license_text, license_url = EXCLUDED.license_url, active = EXCLUDED.active;`,
  );
}

lines.push('COMMIT;', '');
const sql = lines.join('\n');

if (toStdout) {
  process.stdout.write(sql);
} else {
  mkdirSync(join(process.cwd(), 'db/seeds/registry'), { recursive: true });
  writeFileSync(OUTPUT_PATH, sql);
  console.warn(`generated ${OUTPUT_PATH} (${sources.length} sources)`);
}
