import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * 情報源台帳（sources/*.json）の検証。
 * data/schemas/source-registry.schema.json と同じ制約を zod で強制する
 * （依存追加なしで CI 検証するため。スキーマ変更時は両方を更新すること）。
 */

const licenseSchema = z.object({
  url: z.string().startsWith('https://'),
  summary: z.string().min(1).max(500),
  confirmedAt: z.iso.date(),
  confirmedBy: z.string().optional(),
});

const registryEntrySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
  dbId: z.uuid().optional(),
  region: z.enum(['tokyo', 'yokohama', 'osaka']),
  organizationType: z.enum([
    'issuer',
    'road_admin',
    'river_admin',
    'port_admin',
    'police',
    'prefecture',
    'municipality',
  ]),
  name: z.string().min(1),
  publisher: z.string().min(1),
  baseUrl: z.string().startsWith('https://'),
  allowedHost: z.string().regex(/^[a-z0-9.-]+$/),
  authority: z.enum(['primary_official', 'official_catalog', 'secondary_open']),
  format: z.enum(['HTML', 'PDF', 'CSV', 'JSON', 'XLSX', 'API']),
  fetchMode: z.enum(['manual', 'scheduled', 'api']),
  ttlDays: z.number().int().min(1).max(730),
  license: licenseSchema.optional(),
  active: z.boolean(),
  notes: z.string().max(1000).optional(),
});

const sourcesDir = join(__dirname, '..', 'sources');

function listEntries(): { file: string; entry: unknown }[] {
  let files: string[];
  try {
    files = readdirSync(sourcesDir).filter((f) => f.endsWith('.json'));
  } catch {
    return []; // sources/ 未作成の間は空
  }
  return files.map((file) => ({
    file,
    entry: JSON.parse(readFileSync(join(sourcesDir, file), 'utf-8')) as unknown,
  }));
}

describe('情報源台帳（data/source-registry/sources）', () => {
  const entries = listEntries();

  it('全エントリがスキーマに準拠する', () => {
    for (const { file, entry } of entries) {
      const result = registryEntrySchema.safeParse(entry);
      expect(result.success, `${file}: ${JSON.stringify(result.error?.issues?.[0])}`).toBe(true);
    }
  });

  it('id・allowedHost の整合性（id 一意・baseUrl ホスト一致）', () => {
    const ids = new Set<string>();
    for (const { file, entry } of entries) {
      const parsed = registryEntrySchema.parse(entry);
      expect(ids.has(parsed.id), `${file}: id 重複 ${parsed.id}`).toBe(false);
      ids.add(parsed.id);
      const host = new URL(parsed.baseUrl).hostname;
      expect(host, `${file}: baseUrl のホストが allowedHost と不一致`).toBe(parsed.allowedHost);
    }
  });

  it('利用条件未記録（license なし）のエントリは notes に限定運用の記載がある', () => {
    for (const { file, entry } of entries) {
      const parsed = registryEntrySchema.parse(entry);
      if (parsed.license === undefined) {
        // §9.3: 利用条件不明はリンク+索引限定 — 理由・状態を notes へ明記する運用
        expect(parsed.notes, `${file}: license 未記録の場合は notes に理由を書く`).toBeDefined();
      }
    }
  });
});
