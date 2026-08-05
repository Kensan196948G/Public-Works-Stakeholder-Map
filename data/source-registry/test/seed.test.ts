import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REGISTRY_DIR = join(process.cwd(), 'data/source-registry/sources');
const SCRIPT = join(process.cwd(), 'scripts/generate-source-registry-seed.mjs');

function generateSeed(): string {
  return execFileSync(process.execPath, [SCRIPT, '--stdout'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
}

describe('source registry → Neon seed 生成（Issue #32 台帳登録）', () => {
  const sql = generateSeed();
  const sourceFiles = readdirSync(REGISTRY_DIR).filter((f) => f.endsWith('.json'));

  it('全台帳エントリが INSERT される（台帳 JSON と seed の対応）', () => {
    const insertCount = (sql.match(/INSERT INTO provenance\.data_sources/g) ?? []).length;
    expect(insertCount).toBe(sourceFiles.length);
  });

  it('name・publisher・license summary が SQL へ含まれる', () => {
    // 代表 1 件の実値を確認する
    const tokyoRoad = JSON.parse(readFileSync(join(REGISTRY_DIR, 'tokyo-kensetsu-road.json'), 'utf8'));
    expect(sql).toContain(tokyoRoad.name);
    expect(sql).toContain(tokyoRoad.publisher);
    expect(sql).toContain(tokyoRoad.license.summary);
  });

  it('決定的 UUID・冪等（ON CONFLICT DO UPDATE）・トランザクションを備える', () => {
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });

  it('allowed_host が許可ホストの正本として含まれる', () => {
    const kanagawa = JSON.parse(
      readFileSync(join(REGISTRY_DIR, 'kanagawa-police-road-use.json'), 'utf8'),
    );
    expect(sql).toContain(kanagawa.allowedHost);
  });
});
