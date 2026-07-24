import { describe, expect, it } from 'vitest';
import {
  adminImportsResponseSchema,
  adminSourcesResponseSchema,
  importRecordSchema,
  qualityReportSchema,
  type ImportRecord,
} from '@pwsm/contracts';
import { buildApp } from '../src/app.js';

/** 固定クロック（fixture の鮮度判定を決定的にする） */
const FIXED_NOW = new Date('2026-07-24T00:00:00Z');

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('管理系 API の保護（§9.2）', () => {
  const app = buildApp({ now: () => FIXED_NOW });

  it.each([
    ['/admin/sources'],
    ['/admin/imports'],
    ['/admin/quality'],
  ])('production では %s が 403（認証導入まで無効化）', async (path) => {
    const res = await app.request(`/api/v1${path}`, {}, { APP_ENV: 'production' });
    expect(res.status).toBe(403);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
  });

  it('production ではレビュー操作も 403', async () => {
    const res = await app.request(
      '/api/v1/admin/imports/imp-demo-0001/review',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"approve"}' },
      { APP_ENV: 'production' },
    );
    expect(res.status).toBe(403);
  });
});

describe('SCR-06 データソース台帳', () => {
  const app = buildApp({ now: () => FIXED_NOW });

  it('台帳一覧が契約に準拠し、利用条件・最終取得を含む', async () => {
    const res = await app.request('/api/v1/admin/sources');
    expect(res.status).toBe(200);
    const body = adminSourcesResponseSchema.parse(await res.json());
    expect(body.sources.length).toBeGreaterThan(0);
    // 取得失敗デモ（SCR-06 のエラー表示要件）が含まれる
    expect(body.sources.some((s) => s.lastFetchResult === 'failed')).toBe(true);
    // 利用条件未記録デモ（§9.3 リンク+索引限定の対象）が含まれる
    expect(body.sources.some((s) => s.licenseText === null && s.licenseUrl === null)).toBe(true);
  });
});

describe('SCR-06/07 取込とレビュー', () => {
  it('手動取込 → レビュー開始 → 承認が状態機械どおり遷移する', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const sourcesRes = await app.request('/api/v1/admin/sources');
    const { sources } = adminSourcesResponseSchema.parse(await sourcesRes.json());
    const sourceId = sources[0]?.id ?? '';

    const created = await app.request(
      jsonRequest('/admin/imports', {
        sourceId,
        entityKind: 'organization',
        rawPayload: { name: 'テスト取込（デモ）' },
      }),
    );
    expect(created.status).toBe(201);
    const record = importRecordSchema.parse(await created.json());
    expect(record.reviewState).toBe('pending');

    const started = await app.request(
      jsonRequest(`/admin/imports/${record.id}/review`, { action: 'start_review' }),
    );
    expect(started.status).toBe(200);
    expect(importRecordSchema.parse(await started.json()).reviewState).toBe('in_review');

    const approved = await app.request(
      jsonRequest(`/admin/imports/${record.id}/review`, { action: 'approve', note: '確認済み' }),
    );
    expect(approved.status).toBe(200);
    const approvedRecord = importRecordSchema.parse(await approved.json());
    expect(approvedRecord.reviewState).toBe('approved');
    expect(approvedRecord.reviewerNote).toBe('確認済み');
  });

  it('無レビュー承認（pending → approve）は 409 CONFLICT', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const res = await app.request(
      jsonRequest('/admin/imports/imp-demo-0001/review', { action: 'approve' }),
    );
    expect(res.status).toBe(409);
    const problem = (await res.json()) as { code: string };
    expect(problem.code).toBe('CONFLICT');
  });

  it('存在しないレコードへのレビューは 404', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const res = await app.request(
      jsonRequest('/admin/imports/no-such-id/review', { action: 'approve' }),
    );
    expect(res.status).toBe(404);
  });

  it('存在しないソースへの取込は 404', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const res = await app.request(
      jsonRequest('/admin/imports', {
        sourceId: 'src-unknown',
        entityKind: 'organization',
        rawPayload: {},
      }),
    );
    expect(res.status).toBe(404);
  });

  it('state フィルタが適用される', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const res = await app.request('/api/v1/admin/imports?state=pending');
    const body = adminImportsResponseSchema.parse(await res.json());
    expect(body.records.every((r: ImportRecord) => r.reviewState === 'pending')).toBe(true);
    expect(body.records.length).toBeGreaterThan(0);

    const invalid = await app.request('/api/v1/admin/imports?state=bogus');
    expect(invalid.status).toBe(400);
  });
});

describe('SCR-08 品質ダッシュボード', () => {
  const app = buildApp({ now: () => FIXED_NOW });

  it('品質レポートが契約に準拠し、取込状態の内訳を含む', async () => {
    const res = await app.request('/api/v1/admin/quality');
    expect(res.status).toBe(200);
    const report = qualityReportSchema.parse(await res.json());
    expect(report.sources.total).toBeGreaterThan(0);
    expect(report.published.organizations).toBeGreaterThan(0);
    // 固定クロック 2026-07-24 時点では全デモデータが TTL 期限内
    expect(report.freshness.overdue + report.freshness.withinTtl).toBe(
      report.published.organizations,
    );
    expect(report.imports.pending).toBeGreaterThan(0);
  });
});
