import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { AUTH_HEADER } from '../src/services/access-auth.js';
import {
  generateTestKeyPair,
  signTestJwt,
  type TestKeyPair,
} from './helpers/jwt.js';

const AUDIENCE = 'https://team.cloudflareaccess.com';
const NOW = Math.floor(Date.now() / 1000);
const FIXED_NOW = new Date(NOW * 1000);

describe('アプリ内 RBAC（Issue #34・設計 §11）', () => {
  let keys: TestKeyPair;
  let env: {
    APP_ENV: string;
    AUTH_ENABLED: string;
    AUTH_AUDIENCE: string;
    AUTH_CERT_PEM: string;
    AUTH_ADMIN_EMAILS: string;
    AUTH_REVIEWER_EMAILS: string;
    AUTH_EDITOR_EMAILS: string;
  };

  beforeEach(async () => {
    keys = await generateTestKeyPair();
    env = {
      APP_ENV: 'production',
      AUTH_ENABLED: 'true',
      AUTH_AUDIENCE: AUDIENCE,
      AUTH_CERT_PEM: keys.publicKeyPem,
      AUTH_ADMIN_EMAILS: 'admin@example.com',
      AUTH_REVIEWER_EMAILS: 'reviewer@example.com',
      AUTH_EDITOR_EMAILS: 'editor@example.com',
    };
  });

  async function tokenFor(email: string, roleAudience: string = AUDIENCE): Promise<string> {
    return signTestJwt(keys.privateKey, {
      sub: `user:${email}`,
      email,
      aud: roleAudience,
      exp: NOW + 3600,
      iat: NOW,
    });
  }

  it('認証無効時は従来通り production の admin API が 403 のまま', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const res = await app.request('/api/v1/admin/sources', {}, {
      APP_ENV: 'production',
    });
    expect(res.status).toBe(403);
  });

  it('トークン無し・検証不能トークンは 401', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const noToken = await app.request('/api/v1/admin/sources', {}, env);
    expect(noToken.status).toBe(401);
    const body = (await noToken.json()) as { code: string };
    expect(body.code).toBe('UNAUTHORIZED');

    const badToken = await app.request(
      '/api/v1/admin/sources',
      { headers: { [AUTH_HEADER]: 'not-a-jwt' } },
      env,
    );
    expect(badToken.status).toBe(401);
  });

  it('viewer は admin API へアクセスできない（403）', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const token = await tokenFor('viewer@example.com');
    const res = await app.request(
      '/api/v1/admin/sources',
      { headers: { [AUTH_HEADER]: token } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it('editor はソース台帳を閲覧でき、reviewer は取込一覧を閲覧できる', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const editorToken = await tokenFor('editor@example.com');
    const sources = await app.request(
      '/api/v1/admin/sources',
      { headers: { [AUTH_HEADER]: editorToken } },
      env,
    );
    expect(sources.status).toBe(200);

    const reviewerToken = await tokenFor('reviewer@example.com');
    const imports = await app.request(
      '/api/v1/admin/imports',
      { headers: { [AUTH_HEADER]: reviewerToken } },
      env,
    );
    expect(imports.status).toBe(200);
  });

  it('公開承認（approve）は reviewer では 403・admin で実行できる', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const reviewerToken = await tokenFor('reviewer@example.com');
    const denied = await app.request(
      '/api/v1/admin/imports/imp-demo-0002/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [AUTH_HEADER]: reviewerToken },
        body: JSON.stringify({ action: 'approve' }),
      },
      env,
    );
    expect(denied.status).toBe(403);

    const adminToken = await tokenFor('admin@example.com');
    const approved = await app.request(
      '/api/v1/admin/imports/imp-demo-0002/review',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [AUTH_HEADER]: adminToken },
        body: JSON.stringify({ action: 'approve', note: 'テスト承認' }),
      },
      env,
    );
    expect(approved.status).toBe(200);
  });

  it('監査ログは認証有効時 admin のみ閲覧できる', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const editorToken = await tokenFor('editor@example.com');
    const denied = await app.request(
      '/api/v1/audit-events',
      { headers: { [AUTH_HEADER]: editorToken } },
      env,
    );
    expect(denied.status).toBe(403);

    const adminToken = await tokenFor('admin@example.com');
    const allowed = await app.request(
      '/api/v1/audit-events',
      { headers: { [AUTH_HEADER]: adminToken } },
      env,
    );
    expect(allowed.status).toBe(200);
  });
});
