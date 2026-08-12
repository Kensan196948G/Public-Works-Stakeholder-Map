import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { clearRateLimitBuckets } from '../src/services/rate-limit.js';

/**
 * セキュリティ強化（2026-08-12）のテスト:
 * レート制限・ボディサイズ上限・Sec-Fetch-Site 検査。
 * レート制限はモジュール共有バケットのため、このファイル内だけで検証する。
 */

const FIXED_NOW = new Date('2026-07-18T00:00:00Z');
const app = buildApp({
  now: () => FIXED_NOW,
  // ジオコーダーは外部呼出しない（レート制限の検証に集中する）
  geocodeFetch: async () =>
    new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
});

beforeEach(() => {
  // レート制限バケットはモジュール共有のため、テストファイル間・テスト間で分離する
  clearRateLimitBuckets();
});

describe('レート制限（§12.2）', () => {
  it('geocode は 30 回/分を超えると 429 + Retry-After を返す', async () => {
    const url = '/api/v1/geocode?q=%E6%9D%B1%E4%BA%AC%E9%83%BD';
    let lastStatus = 0;
    for (let i = 0; i < 30; i += 1) {
      const res = await app.request(url);
      lastStatus = res.status;
      expect(res.status).toBe(200);
    }
    const limited = await app.request(url);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).not.toBeNull();
    const body = (await limited.json()) as { code: string; requestId: string };
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.requestId).toBeTruthy();
    expect(lastStatus).toBe(200);
  });
});

describe('ボディサイズ上限（§12.2: 64KB）', () => {
  it('Content-Length 超過の POST は 413 PAYLOAD_TOO_LARGE を返す', async () => {
    const bigPayload = JSON.stringify({
      category: 'other',
      message: 'x'.repeat(70 * 1024),
    });
    const res = await app.request('/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bigPayload,
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('チャンク転送でも上限超過は 413 になる', async () => {
    // ReadableStream ボディは Content-Length が付与されないため、ストリーム上限検査を通る
    const encoder = new TextEncoder();
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 70 * 1024) {
          controller.close();
          return;
        }
        const chunkSize = Math.min(16 * 1024, 70 * 1024 - sent);
        controller.enqueue(encoder.encode('a'.repeat(chunkSize)));
        sent += chunkSize;
      },
    });
    const res = await app.request('/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      // Node の undici はストリームボディに duplex 指定を要求する
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    expect(res.status).toBe(413);
  });
});

describe('Sec-Fetch-Site 検査（CSRF 対策強化）', () => {
  it('cross-site を明示する POST は 403 で拒否される', async () => {
    const res = await app.request('/api/v1/stakeholders/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Mode': 'cors',
      },
      body: JSON.stringify({ location: { lat: 35.05, lon: 139.05 }, assetTypes: ['road'] }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('FORBIDDEN');
  });

  it('same-origin の POST は許可される', async () => {
    const res = await app.request('/api/v1/stakeholders/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost',
        'Sec-Fetch-Site': 'same-origin',
      },
      body: JSON.stringify({ location: { lat: 35.05, lon: 139.05 }, assetTypes: ['road'] }),
    });
    expect(res.status).toBe(200);
  });
});

describe('CSP（§12.1）', () => {
  it('全応答に CSP が付与され、地図タイル・インラインスタイル以外を制限する', async () => {
    const res = await app.request('/api/v1/metadata');
    const csp = res.headers.get('content-security-policy');
    expect(csp).not.toBeNull();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    // 地図タイル（地理院）は接続・画像として許可される
    expect(csp).toContain('https://cyberjapandata.gsi.go.jp');
  });

  it('X-Frame-Options と nosniff も付与される', async () => {
    const res = await app.request('/api/v1/metadata');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
