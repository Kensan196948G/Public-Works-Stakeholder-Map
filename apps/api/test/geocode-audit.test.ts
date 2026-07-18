import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { clearMemoryAuditEvents } from '../src/repositories/audit-repository.js';

const FIXED_NOW = new Date('2026-07-18T00:00:00Z');

/** 地理院 住所検索 API の応答形（モック） */
const gsiPayload = [
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [139.767125, 35.681236] },
    properties: { addressCode: '', title: '東京都千代田区丸の内（デモ応答）' },
  },
];

function appWithGeocoder(payload: unknown, status = 200) {
  return buildApp({
    now: () => FIXED_NOW,
    geocodeFetch: () =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
  });
}

/** 監査記録は fire-and-forget のため 1 tick 待つ */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  clearMemoryAuditEvents();
});

describe('GET /geocode（FR-001 住所検索）', () => {
  it('住所から候補地点を返す（出典表示付き）', async () => {
    const app = appWithGeocoder(gsiPayload);
    const res = await app.request('/api/v1/geocode?q=%E4%B8%B8%E3%81%AE%E5%86%85');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: { label: string; location: { lat: number; lon: number } }[];
      attribution: string;
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]?.location.lat).toBeCloseTo(35.681236, 5);
    expect(body.results[0]?.location.lon).toBeCloseTo(139.767125, 5);
    expect(body.attribution).toContain('国土地理院');
  });

  it('空クエリ・長すぎるクエリは 400 INVALID_QUERY', async () => {
    const app = appWithGeocoder(gsiPayload);
    const empty = await app.request('/api/v1/geocode?q=');
    expect(empty.status).toBe(400);
    expect(((await empty.json()) as { code: string }).code).toBe('INVALID_QUERY');

    const long = await app.request(`/api/v1/geocode?q=${'あ'.repeat(101)}`);
    expect(long.status).toBe(400);
  });

  it('上流エラーは 502 UPSTREAM_ERROR（内部詳細を漏らさない）', async () => {
    const app = appWithGeocoder({}, 500);
    const res = await app.request('/api/v1/geocode?q=test');
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code: string; detail: string };
    expect(body.code).toBe('UPSTREAM_ERROR');
    expect(body.detail).not.toContain('500');
  });

  it('想定外の応答形も 502 として扱う', async () => {
    const app = appWithGeocoder({ unexpected: true });
    const res = await app.request('/api/v1/geocode?q=test');
    expect(res.status).toBe(502);
  });

  it('結果 0 件は 200 + 空配列（エラーにしない）', async () => {
    const app = appWithGeocoder([]);
    const res = await app.request('/api/v1/geocode?q=%E3%81%A9%E3%81%93%E3%81%8B');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { results: unknown[] }).results).toHaveLength(0);
  });
});

describe('GET /audit-events（SCR-09 先行）', () => {
  it('検索実行が監査へ記録され、座標・検索条件は含まれない', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    await app.request('http://localhost/api/v1/stakeholders/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: { lat: 35.05, lon: 139.05 },
        workTypes: ['excavation'],
        assetTypes: ['road'],
      }),
    });
    await tick();

    const res = await app.request('/api/v1/audit-events');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      store: string;
      events: { action: string; result: string; metadata: Record<string, unknown> }[];
    };
    expect(body.store).toBe('memory');
    const search = body.events.find((e) => e.action === 'stakeholder.search');
    expect(search).toBeDefined();
    expect(search?.result).toBe('success');
    expect(search?.metadata['candidateCount']).toBeTypeOf('number');
    // プライバシー: 座標・条件を記録しない
    expect(JSON.stringify(body.events)).not.toContain('35.05');
    expect(JSON.stringify(body.events)).not.toContain('excavation');
  });

  it('住所検索の監査記録にクエリ本文を含めない', async () => {
    const app = appWithGeocoder(gsiPayload);
    await app.request('/api/v1/geocode?q=%E4%B8%B8%E3%81%AE%E5%86%85');
    await tick();

    const res = await app.request('/api/v1/audit-events');
    const body = (await res.json()) as { events: { action: string }[] };
    const geocodeEvent = body.events.find((e) => e.action === 'geocode.search');
    expect(geocodeEvent).toBeDefined();
    expect(JSON.stringify(body.events)).not.toContain('丸の内');
  });

  it('production 環境では 403 FORBIDDEN（認証導入まで閲覧不可）', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    const res = await app.request('/api/v1/audit-events', {}, { APP_ENV: 'production' });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('FORBIDDEN');
  });

  it('limit パラメータで件数を制限できる', async () => {
    const app = buildApp({ now: () => FIXED_NOW });
    for (let i = 0; i < 3; i++) {
      await app.request('http://localhost/api/v1/stakeholders/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: { lat: 35.05, lon: 139.05 } }),
      });
    }
    await tick();
    const res = await app.request('/api/v1/audit-events?limit=2');
    const body = (await res.json()) as { events: unknown[] };
    expect(body.events.length).toBeLessThanOrEqual(2);
  });
});
