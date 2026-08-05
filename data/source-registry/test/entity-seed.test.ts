import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REGISTRY_DIR = join(process.cwd(), 'data/source-registry/sources');
const SCRIPT = join(process.cwd(), 'scripts/generate-entity-imports.mjs');

function generate(): string {
  return execFileSync(process.execPath, [SCRIPT, '--stdout'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
}

describe('source registry → staging 組織取込 seed（Issue #32 第二段）', () => {
  const sql = generate();
  const sourceFiles = readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.json'));

  it('全 15 ソース分の organization 取込が pending で生成される', () => {
    const inserts = (sql.match(/INSERT INTO staging\.import_records/g) ?? []).length;
    expect(inserts).toBe(sourceFiles.length);
    expect((sql.match(/'organization'/g) ?? []).length).toBe(sourceFiles.length);
    expect(sql).toContain("'pending'");
  });

  it('raw_payload に canonicalName・officialUrl・sourceSlug を含む', () => {
    expect(sql).toContain('"canonicalName"');
    expect(sql).toContain('"officialUrl"');
    expect(sql).toContain('"sourceSlug"');
  });

  it('冪等（ON CONFLICT DO UPDATE）とトランザクションを備える', () => {
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
