// 公式情報源から収集した窓口・連絡先エンティティ（data/source-registry/entities/**/*.json）から、
// ステージング取込レコード（staging.import_records・entity_kind=office / contact_point）を生成する。
// 実行: node scripts/generate-office-contact-imports.mjs            → db/seeds/registry/0005_staging_office_contacts.sql
//        node scripts/generate-office-contact-imports.mjs --stdout  → 標準出力へ出力（テスト・確認用）
//
// 方針: 無レビュー公開禁止（§6.2）。生成物は必ず staging（pending）+ contact_pending_review で登録し、
//       SCR-07 の二者レビュー（原典突合・電話/住所の確認）後に公開する。
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REGISTRY_DIR = join(process.cwd(), 'data/source-registry/sources');
const ENTITIES_ROOT = join(process.cwd(), 'data/source-registry/entities');
const OUTPUT_PATH = join(process.cwd(), 'db/seeds/registry/0005_staging_office_contacts.sql');
const toStdout = process.argv.includes('--stdout');

function uuidFor(name) {
  const h = createHash('sha256').update(name).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function q(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const sources = new Map(
  readdirSync(REGISTRY_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const entry = JSON.parse(readFileSync(join(REGISTRY_DIR, file), 'utf8'));
      return [entry.id, entry];
    }),
);

const entityFiles = readdirSync(ENTITIES_ROOT, { recursive: true })
  .filter((f) => String(f).endsWith('.json'))
  .sort();
const entities = entityFiles.map((file) =>
  JSON.parse(readFileSync(join(ENTITIES_ROOT, String(file)), 'utf8')),
);

if (entities.length === 0) {
  throw new Error('source entities are empty');
}

const lines = [
  '-- ============================================================',
  '-- 0005_staging_office_contacts.sql — 窓口・連絡先のステージング取込（自動生成・手編集禁止）',
  '-- 生成元: data/source-registry/entities/**/*.json',
  '-- 生成: scripts/generate-office-contact-imports.mjs',
  '-- 方針: 無レビュー公開禁止（§6.2）。pending + contact_pending_review で登録し、二者レビュー後に公開する',
  '-- ============================================================',
  'BEGIN;',
];

let officeCount = 0;
let contactCount = 0;
for (const entity of entities) {
  const source = sources.get(entity.sourceSlug);
  if (source === undefined) {
    throw new Error(`unknown sourceSlug: ${entity.sourceSlug}`);
  }
  const sourceId = uuidFor(`registry:${entity.sourceSlug}`);
  for (const office of entity.offices) {
    const officeId = uuidFor(`entity:office:${entity.sourceSlug}:${office.name}`);
    const officePayload = {
      entityKind: 'office',
      sourceSlug: entity.sourceSlug,
      organizationName: source.publisher,
      officeName: office.name,
      roleSummary: office.roleSummary ?? null,
      postalCode: office.postalCode ?? null,
      addressRaw: office.addressRaw ?? null,
      receptionNote: office.receptionNote ?? null,
      sourceUrl: office.sourceUrl,
      confirmedAt: office.confirmedAt,
      notes: office.notes ?? null,
    };
    lines.push(
      `INSERT INTO staging.import_records (id, source_id, entity_kind, raw_payload, quality_flags, review_state)`,
      `VALUES (${q(officeId)}, ${q(sourceId)}, 'office', ${q(JSON.stringify(officePayload))}::jsonb, '["contact_pending_review"]'::jsonb, 'pending')`,
      `ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, entity_kind = EXCLUDED.entity_kind, raw_payload = EXCLUDED.raw_payload, quality_flags = EXCLUDED.quality_flags, review_state = EXCLUDED.review_state;`,
    );
    officeCount += 1;

    for (const contact of office.contacts) {
      const contactId = uuidFor(
        `entity:contact:${entity.sourceSlug}:${office.name}:${contact.contactType}:${contact.label}`,
      );
      const contactPayload = {
        entityKind: 'contact_point',
        sourceSlug: entity.sourceSlug,
        officeName: office.name,
        contactType: contact.contactType,
        label: contact.label,
        displayValue: contact.displayValue,
        extension: contact.extension ?? null,
        sourceUrl: office.sourceUrl,
        confirmedAt: office.confirmedAt,
      };
      lines.push(
        `INSERT INTO staging.import_records (id, source_id, entity_kind, raw_payload, quality_flags, review_state)`,
        `VALUES (${q(contactId)}, ${q(sourceId)}, 'contact_point', ${q(JSON.stringify(contactPayload))}::jsonb, '["contact_pending_review"]'::jsonb, 'pending')`,
        `ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, entity_kind = EXCLUDED.entity_kind, raw_payload = EXCLUDED.raw_payload, quality_flags = EXCLUDED.quality_flags, review_state = EXCLUDED.review_state;`,
      );
      contactCount += 1;
    }
  }
}

lines.push('COMMIT;', '');
const sql = lines.join('\n');

if (toStdout) {
  process.stdout.write(sql);
} else {
  mkdirSync(join(process.cwd(), 'db/seeds/registry'), { recursive: true });
  writeFileSync(OUTPUT_PATH, sql);
  console.warn(`generated ${OUTPUT_PATH} (${officeCount} offices / ${contactCount} contacts)`);
}
