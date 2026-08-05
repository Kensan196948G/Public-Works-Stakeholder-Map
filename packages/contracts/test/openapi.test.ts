import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

/**
 * OpenAPI 仕様（docs/openapi.yaml・Issue #37）の整合検証。
 * 契約（packages/contracts）と API 実装（apps/api/src/app.ts）の主要エンドポイントが
 * ドキュメントへ漏れなく記載されていることを保証する。
 */

const specPath = join(process.cwd(), 'docs/openapi.yaml');
const spec = YAML.parse(readFileSync(specPath, 'utf8')) as {
  openapi: string;
  info: { title?: string; version?: string };
  paths: Record<string, unknown>;
  components?: { schemas?: Record<string, unknown> };
};

const REQUIRED_PATHS = [
  '/api/v1/health/live',
  '/api/v1/health/ready',
  '/api/v1/metadata',
  '/api/v1/geocode',
  '/api/v1/stakeholders/search',
  '/api/v1/map/jurisdictions',
  '/api/v1/feedback',
  '/api/v1/audit-events',
  '/api/v1/admin/sources',
  '/api/v1/admin/imports',
  '/api/v1/admin/imports/{id}/review',
  '/api/v1/admin/quality',
];

describe('OpenAPI 仕様（Issue #37）', () => {
  it('OpenAPI 3.1 として妥当な基本情報を持つ', () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toBeTruthy();
  });

  it('主要エンドポイントが全て記載されている', () => {
    for (const path of REQUIRED_PATHS) {
      expect(spec.paths, `missing path: ${path}`).toHaveProperty(path);
    }
  });

  it('検索・メタデータ・フィードバックの契約スキーマが定義されている', () => {
    const schemas = spec.components?.schemas ?? {};
    for (const schema of [
      'SearchRequest',
      'SearchResponse',
      'Candidate',
      'Metadata',
      'FeedbackRequest',
      'FeedbackResponse',
      'Problem',
    ]) {
      expect(schemas, `missing schema: ${schema}`).toHaveProperty(schema);
    }
  });

  it('秘密情報・プレースホルダー・実接続文字列を含まない', () => {
    const raw = readFileSync(specPath, 'utf8');
    expect(raw).not.toContain('DATABASE_URL');
    expect(raw).not.toContain('postgresql://');
    expect(raw).not.toContain('password');
    expect(raw).not.toContain('<REDACTED>');
  });
});
