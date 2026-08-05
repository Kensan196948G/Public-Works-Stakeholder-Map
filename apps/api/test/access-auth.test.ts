import { beforeEach, describe, expect, it } from 'vitest';
import {
  authConfigFromEnv,
  verifyAccessJwt,
  type AuthConfig,
} from '../src/services/access-auth.js';
import {
  generateTestKeyPair,
  signTestJwt,
  type TestKeyPair,
} from './helpers/jwt.js';

const AUDIENCE = 'https://team.cloudflareaccess.com';
const NOW = Math.floor(Date.now() / 1000);

describe('verifyAccessJwt（Cloudflare Access JWT 検証・Issue #34）', () => {
  let keys: TestKeyPair;
  let config: AuthConfig;

  beforeEach(async () => {
    keys = await generateTestKeyPair();
    config = {
      enabled: true,
      audience: AUDIENCE,
      jwksUrl: null,
      certPem: keys.publicKeyPem,
      adminEmails: ['admin@example.com'],
      reviewerEmails: ['reviewer@example.com'],
      editorEmails: ['editor@example.com'],
    };
  });

  it('正当な JWT はクレームとロールを返す（admin）', async () => {
    const token = await signTestJwt(keys.privateKey, {
      sub: 'user-1',
      email: 'admin@example.com',
      name: '管理者',
      aud: AUDIENCE,
      exp: NOW + 3600,
      iat: NOW,
    });
    const claims = await verifyAccessJwt(token, config, new Date(NOW * 1000));
    expect(claims?.email).toBe('admin@example.com');
    expect(claims?.role).toBe('admin');
  });

  it('ロールはメールから決定的に割り当てられる（reviewer / viewer）', async () => {
    const reviewer = await signTestJwt(keys.privateKey, {
      sub: 'user-2',
      email: 'reviewer@example.com',
      aud: AUDIENCE,
      exp: NOW + 3600,
      iat: NOW,
    });
    expect((await verifyAccessJwt(reviewer, config, new Date(NOW * 1000)))?.role).toBe(
      'reviewer',
    );
    const viewer = await signTestJwt(keys.privateKey, {
      sub: 'user-3',
      email: 'someone@example.com',
      aud: AUDIENCE,
      exp: NOW + 3600,
      iat: NOW,
    });
    expect((await verifyAccessJwt(viewer, config, new Date(NOW * 1000)))?.role).toBe(
      'viewer',
    );
  });

  it('audience 不一致・期限切れ・改ざんは null', async () => {
    const wrongAud = await signTestJwt(keys.privateKey, {
      sub: 'u',
      email: 'admin@example.com',
      aud: 'https://other.cloudflareaccess.com',
      exp: NOW + 3600,
      iat: NOW,
    });
    expect(await verifyAccessJwt(wrongAud, config, new Date(NOW * 1000))).toBeNull();

    const expired = await signTestJwt(keys.privateKey, {
      sub: 'u',
      email: 'admin@example.com',
      aud: AUDIENCE,
      exp: NOW - 10,
      iat: NOW - 3600,
    });
    expect(await verifyAccessJwt(expired, config, new Date(NOW * 1000))).toBeNull();

    const valid = await signTestJwt(keys.privateKey, {
      sub: 'u',
      email: 'admin@example.com',
      aud: AUDIENCE,
      exp: NOW + 3600,
      iat: NOW,
    });
    const tampered = `${valid.slice(0, -2)}xx`;
    expect(await verifyAccessJwt(tampered, config, new Date(NOW * 1000))).toBeNull();
  });

  it('無効設定（enabled=false / audience 空）では常に null', async () => {
    const token = await signTestJwt(keys.privateKey, {
      sub: 'u',
      email: 'admin@example.com',
      aud: AUDIENCE,
      exp: NOW + 3600,
      iat: NOW,
    });
    expect(
      await verifyAccessJwt(token, { ...config, enabled: false }, new Date(NOW * 1000)),
    ).toBeNull();
    expect(
      await verifyAccessJwt(token, { ...config, audience: '' }, new Date(NOW * 1000)),
    ).toBeNull();
  });

  it('authConfigFromEnv は環境変数から設定を組み立てる', () => {
    const configFromEnv = authConfigFromEnv({
      AUTH_ENABLED: 'true',
      AUTH_AUDIENCE: AUDIENCE,
      AUTH_CERT_PEM: keys.publicKeyPem,
      AUTH_ADMIN_EMAILS: ' admin@example.com , Admin2@Example.com ',
      AUTH_REVIEWER_EMAILS: 'reviewer@example.com',
    });
    expect(configFromEnv.enabled).toBe(true);
    expect(configFromEnv.adminEmails).toEqual(['admin@example.com', 'admin2@example.com']);
    expect(configFromEnv.reviewerEmails).toEqual(['reviewer@example.com']);
    expect(configFromEnv.jwksUrl).toBeNull();
  });
});
