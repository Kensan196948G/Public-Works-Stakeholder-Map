import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * 窓口・連絡先エンティティ（entities 配下の JSON）と生成 SQL の検証。
 * data/schemas/source-entity.schema.json と同じ制約を zod で強制する
 * （依存追加なしで CI 検証するため。スキーマ変更時は両方を更新すること）。
 */

const contactSchema = z.strictObject({
  contactType: z.enum(['phone', 'web', 'email', 'counter']),
  label: z.string().min(1),
  displayValue: z.string().min(1),
  extension: z.string().optional(),
});

const officeSchema = z.strictObject({
  name: z.string().min(1),
  roleSummary: z.string().optional(),
  postalCode: z.string().regex(/^\d{3}-?\d{4}$/).optional(),
  addressRaw: z.string().optional(),
  receptionNote: z.string().optional(),
  contacts: z.array(contactSchema).min(1),
  sourceUrl: z.string().startsWith('https://'),
  confirmedAt: z.iso.date(),
  notes: z.string().optional(),
});

const entitySchema = z.strictObject({
  sourceSlug: z.string().min(1),
  region: z.enum(['tokyo', 'yokohama', 'osaka', 'national']),
  offices: z.array(officeSchema).min(1),
});

const entitiesDir = join(__dirname, '..', 'entities');
const registryDir = join(__dirname, '..', 'sources');

function listEntities(): { file: string; entry: unknown }[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) files.push(full);
    }
  };
  walk(entitiesDir);
  return files.map((file) => ({ file, entry: JSON.parse(readFileSync(file, 'utf8')) }));
}

const registryIds = new Set(
  readdirSync(registryDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(registryDir, f), 'utf8')).id),
);

describe('窓口・連絡先エンティティ（entities/**/*.json）', () => {
  const entries = listEntities();

  it('エンティティはスキーマに適合する', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const { file, entry } of entries) {
      const parsed = entitySchema.safeParse(entry);
      expect(parsed.success, `${file}: ${parsed.success ? '' : parsed.error.message}`).toBe(true);
    }
  });

  it('sourceSlug は情報源台帳に存在する', () => {
    for (const { file, entry } of entries) {
      const slug = (entry as { sourceSlug: string }).sourceSlug;
      expect(registryIds.has(slug), `${file}: unknown sourceSlug ${slug}`).toBe(true);
    }
  });

  it('電話番号は正規化可能な形式（10〜11 桁）である', () => {
    for (const { file, entry } of entries) {
      for (const office of (entry as { offices: { contacts: { contactType: string; displayValue: string }[] }[] }).offices) {
        for (const contact of office.contacts) {
          if (contact.contactType !== 'phone') continue;
          const digits = contact.displayValue.replace(/[^0-9]/g, '');
          expect(
            digits.length === 10 || digits.length === 11,
            `${file}: invalid phone ${contact.displayValue}`,
          ).toBe(true);
        }
      }
    }
  });

  it('生成 SQL は pending + contact_pending_review で、重複 ID がない', () => {
    const sql = readFileSync(
      join(process.cwd(), 'db/seeds/registry/0005_staging_tokyo_office_contacts.sql'),
      'utf8',
    );
    const inserts = (sql.match(/INSERT INTO staging\.import_records/g) ?? []).length;
    const offices = entries.reduce(
      (sum, e) => sum + (e.entry as { offices: unknown[] }).offices.length,
      0,
    );
    const contacts = entries.reduce(
      (sum, e) =>
        sum +
        (e.entry as { offices: { contacts: unknown[] }[] }).offices.reduce(
          (s, o) => s + o.contacts.length,
          0,
        ),
      0,
    );
    expect(inserts).toBe(offices + contacts);
    expect(sql).not.toContain("'[]'::jsonb");
    expect(sql).toContain('contact_pending_review');
    expect((sql.match(/ON CONFLICT \(id\)/g) ?? []).length).toBe(inserts);
  });
});
