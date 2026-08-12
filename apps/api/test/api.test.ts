import { beforeEach, describe, expect, it } from 'vitest';
import {
  feedbackResponseSchema,
  jurisdictionMapResponseSchema,
  organizationDetailSchema,
  searchResponseSchema,
  REQUIRED_DISCLAIMER,
} from '@pwsm/contracts';
import { buildApp } from '../src/app.js';
import { clearMemoryFeedback } from '../src/repositories/feedback-repository.js';

/** 固定クロック: 2026-07-18。fixture の鮮度・期限判定を決定的にする */
const FIXED_NOW = new Date('2026-07-18T00:00:00Z');
const app = buildApp({ now: () => FIXED_NOW });

function searchRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/stakeholders/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function searchRequestWithOrigin(body: unknown, origin: string): Request {
  return new Request('http://localhost/api/v1/stakeholders/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });
}

describe('health / metadata', () => {
  it('GET /health/live は 200', async () => {
    const res = await app.request('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /health/ready はデータ版を返す', async () => {
    const res = await app.request('/api/v1/health/ready');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; datasetVersion: string };
    expect(body.datasetVersion).toBe('2026-07-18.fixture.1');
  });

  it('GET /metadata は免責文と契約準拠の応答を返す', async () => {
    const res = await app.request('/api/v1/metadata');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { disclaimer: string; appEnv: string };
    expect(body.disclaimer).toBe(REQUIRED_DISCLAIMER);
    expect(body.appEnv).toBe('local');
  });

  it('APP_ENV バインディングが appEnv へ反映される', async () => {
    const res = await app.request('/api/v1/metadata', {}, { APP_ENV: 'production' });
    const body = (await res.json()) as { appEnv: string };
    expect(body.appEnv).toBe('production');
  });
});

describe('POST /stakeholders/search — 正常系', () => {
  it('道路掘削 + 交通規制の検索で該当種別の候補が根拠付きで返る', async () => {
    const res = await app.request(
      searchRequest({
        location: { lat: 35.05, lon: 139.05 },
        radiusMeters: 500,
        workTypes: ['excavation', 'traffic_restriction'],
        assetTypes: ['road'],
        purpose: 'pre_consultation',
      }),
    );
    expect(res.status).toBe(200);
    const body = searchResponseSchema.parse(await res.json());

    // 免責は常時返る（FR-007）
    expect(body.disclaimerRequired).toBe(true);
    expect(body.disclaimer).toBe(REQUIRED_DISCLAIMER);

    const ids = body.candidates.map((c) => c.organizationId);
    // 発注者・道路管理者×2・警察・自治体窓口が候補になる
    expect(ids).toContain('org-demo-0001');
    expect(ids).toContain('org-demo-0002');
    expect(ids).toContain('org-demo-0003');
    expect(ids).toContain('org-demo-0006');
    expect(ids).toContain('org-demo-0007');
    // 河川・港湾は条件に該当しないため候補にならない
    expect(ids).not.toContain('org-demo-0004');
    expect(ids).not.toContain('org-demo-0005');

    // 全候補が根拠と一致理由を持つ（設計原則 2）
    for (const candidate of body.candidates) {
      expect(candidate.reasons.length).toBeGreaterThan(0);
      expect(candidate.evidence.length).toBeGreaterThan(0);
    }
  });

  it('§17.2 ケース2: 警察の推定管轄は estimated=true として表示される', async () => {
    const res = await app.request(
      searchRequest({
        location: { lat: 35.05, lon: 139.05 },
        workTypes: ['traffic_restriction'],
        assetTypes: ['road'],
      }),
    );
    const body = searchResponseSchema.parse(await res.json());
    const police = body.candidates.find((c) => c.organizationId === 'org-demo-0006');
    expect(police).toBeDefined();
    expect(police?.estimated).toBe(true);
    expect(police?.precision).toBe('estimated');
    // 推定区域は official 精度の満点にならない
    expect(police?.confidenceBreakdown.boundaryPrecision).toBeLessThan(25);
  });

  it('§17.2 ケース3: 期限超過候補は結果に残り expired として識別される', async () => {
    const res = await app.request(
      searchRequest({
        location: { lat: 35.05, lon: 139.15 },
        workTypes: ['drainage'],
        assetTypes: ['river'],
      }),
    );
    const body = searchResponseSchema.parse(await res.json());
    const expired = body.candidates.find((c) => c.organizationId === 'org-demo-0008');
    expect(expired).toBeDefined();
    expect(expired?.verificationState).toBe('expired');
    expect(expired?.confidence).toBe('D');

    const river = body.candidates.find((c) => c.organizationId === 'org-demo-0004');
    expect(river).toBeDefined();
    expect(river?.verificationState).toBe('unverified');
  });

  it('§17.2 ケース1: 区域境界上の地点は両区域の候補を返し片方を隠さない', async () => {
    // lat 35.0 は中央地区（minLat）と臨海地区（maxLat）の境界
    const res = await app.request(
      searchRequest({
        location: { lat: 35.0, lon: 139.05 },
        assetTypes: ['port'],
      }),
    );
    const body = searchResponseSchema.parse(await res.json());
    const ids = body.candidates.map((c) => c.organizationId);
    // 臨海地区の港湾管理者と、両区域共通の発注者の双方が返る
    expect(ids).toContain('org-demo-0005');
    expect(ids).toContain('org-demo-0001');
  });

  it('検索半径で区域外の地点も候補に含まれる', async () => {
    const outside = { lat: 35.1045, lon: 139.05 }; // 中央地区北端から約500m北
    const noRadius = await app.request(
      searchRequest({ location: outside, radiusMeters: 0, assetTypes: ['road'] }),
    );
    const noRadiusBody = searchResponseSchema.parse(await noRadius.json());
    expect(noRadiusBody.candidates).toHaveLength(0);

    const withRadius = await app.request(
      searchRequest({ location: outside, radiusMeters: 1000, assetTypes: ['road'] }),
    );
    const withRadiusBody = searchResponseSchema.parse(await withRadius.json());
    expect(withRadiusBody.candidates.length).toBeGreaterThan(0);
  });

  it('候補は機関種別順に整列される（§9.2）', async () => {
    const res = await app.request(
      searchRequest({
        location: { lat: 35.05, lon: 139.05 },
        workTypes: ['excavation', 'traffic_restriction'],
        assetTypes: ['road'],
      }),
    );
    const body = searchResponseSchema.parse(await res.json());
    const types = body.candidates.map((c) => c.type);
    const order = ['issuer', 'road_admin', 'river_admin', 'port_admin', 'police', 'prefecture', 'municipality', 'other'];
    const indices = types.map((t) => order.indexOf(t));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});

describe('POST /stakeholders/search — エラー系（RFC 9457）', () => {
  it('緯度範囲外は 400 INVALID_COORDINATE', async () => {
    const res = await app.request(
      searchRequest({ location: { lat: 91, lon: 139.05 } }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = (await res.json()) as { code: string; requestId: string; status: number };
    expect(body.code).toBe('INVALID_COORDINATE');
    expect(body.status).toBe(400);
    expect(body.requestId).toBeTruthy();
  });

  it('検索半径超過は 400 INVALID_RADIUS', async () => {
    const res = await app.request(
      searchRequest({ location: { lat: 35.05, lon: 139.05 }, radiusMeters: 5001 }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('INVALID_RADIUS');
  });

  it('JSON でないボディは 400 INVALID_BODY', async () => {
    const res = await app.request('http://localhost/api/v1/stakeholders/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('INVALID_BODY');
  });

  it('未知のパスは 404 NOT_FOUND', async () => {
    const res = await app.request('/api/v1/unknown');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });
});

describe('X-Request-ID 相関 ID（§6.1）', () => {
  it('正当な受信値はそのまま返す', async () => {
    const res = await app.request('/api/v1/health/live', {
      headers: { 'X-Request-ID': 'req-abc_123' },
    });
    expect(res.headers.get('x-request-id')).toBe('req-abc_123');
  });

  it('不正な受信値は再発行する', async () => {
    const res = await app.request('/api/v1/health/live', {
      headers: { 'X-Request-ID': 'bad id with spaces!!' },
    });
    const issued = res.headers.get('x-request-id');
    expect(issued).not.toBe('bad id with spaces!!');
    expect(issued).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('POST /feedback（FR-017）', () => {
  beforeEach(() => {
    clearMemoryFeedback();
  });

  it('正当な報告は 202 と受付番号を返す', async () => {
    const res = await app.request('http://localhost/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({
        category: 'broken_link',
        message: 'あおぞら町建設課のリンクが404になっています（デモ報告）',
        sourceUrl: 'https://example.com/demo/aozora-town/kensetsu',
      }),
    });
    expect(res.status).toBe(202);
    const body = feedbackResponseSchema.parse(await res.json());
    expect(body.status).toBe('received');
    expect(body.reference).toMatch(/^FB-/);
  });

  it('短すぎる本文・不正種別・不正 URL は 400', async () => {
    const short = await app.request('http://localhost/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'other', message: '短い' }),
    });
    expect(short.status).toBe(400);

    const badCategory = await app.request('http://localhost/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'spam', message: '十分な長さの本文です' }),
    });
    expect(badCategory.status).toBe(400);

    const badUrl = await app.request('http://localhost/api/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'other',
        message: '十分な長さの本文です',
        sourceUrl: 'not-a-url',
      }),
    });
    expect(badUrl.status).toBe(400);
  });
});

describe('GET /map/jurisdictions（FR-003 拡張）', () => {
  it('指定機関の区域を FeatureCollection で返す（fixture モード）', async () => {
    const res = await app.request(
      '/api/v1/map/jurisdictions?organizationIds=org-demo-0006,org-demo-0005',
    );
    expect(res.status).toBe(200);
    const body = jurisdictionMapResponseSchema.parse(await res.json());
    expect(body.type).toBe('FeatureCollection');
    const orgIds = new Set(body.features.map((f) => f.properties.organizationId));
    expect(orgIds.has('org-demo-0006')).toBe(true);
    expect(orgIds.has('org-demo-0005')).toBe(true);
    // 警察は推定区域として properties に反映される
    const police = body.features.find((f) => f.properties.organizationId === 'org-demo-0006');
    expect(police?.properties.estimated).toBe(true);
  });

  it('未知 ID は空 FeatureCollection、ID 未指定・過多は 400', async () => {
    const empty = await app.request('/api/v1/map/jurisdictions?organizationIds=unknown-org');
    expect(empty.status).toBe(200);
    expect((await empty.json()).features).toEqual([]);

    const missing = await app.request('/api/v1/map/jurisdictions');
    expect(missing.status).toBe(400);

    const tooMany = await app.request(
      `/api/v1/map/jurisdictions?organizationIds=${Array.from({ length: 51 }, (_, i) => `org-${i}`).join(',')}`,
    );
    expect(tooMany.status).toBe(400);
  });
});

describe('GET /organizations/:id（FR-005 候補詳細）', () => {
  it('公開済み機関の詳細（窓口・管轄・根拠）を返す', async () => {
    const res = await app.request('/api/v1/organizations/org-demo-0001');
    expect(res.status).toBe(200);
    const body = organizationDetailSchema.parse(await res.json());
    expect(body.organizationId).toBe('org-demo-0001');
    expect(body.name).toBe('みらい市 契約検査課（デモ）');
    expect(body.offices.length).toBeGreaterThan(0);
    expect(body.offices[0]?.name).toBe('契約検査課');
    expect(body.jurisdictions.length).toBe(2);
    for (const jurisdiction of body.jurisdictions) {
      expect(jurisdiction.evidence.length).toBeGreaterThan(0);
    }
  });

  it('存在しない・非公開の機関は 404', async () => {
    const missing = await app.request('/api/v1/organizations/org-demo-9999');
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });

  it('本番（production）でも公開エンドポイントとして利用できる', async () => {
    const res = await app.request(
      '/api/v1/organizations/org-demo-0001',
      {},
      { APP_ENV: 'production' },
    );
    expect(res.status).toBe(200);
  });
});

describe('Origin 検査（CSRF 対策 §12.1）とキャッシュヘッダー（§13）', () => {
  it('同一オリジンの POST は許可される', async () => {
    const res = await app.request(
      searchRequestWithOrigin(
        { location: { lat: 35.05, lon: 139.05 }, assetTypes: ['road'] },
        'http://localhost',
      ),
    );
    expect(res.status).toBe(200);
  });

  it('異なるオリジンの POST は 403 で拒否される', async () => {
    const res = await app.request(
      searchRequestWithOrigin(
        { location: { lat: 35.05, lon: 139.05 } },
        'https://evil.example.com',
      ),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('FORBIDDEN');
  });

  it('metadata は public cache ヘッダーを付与する', async () => {
    const res = await app.request('/api/v1/metadata');
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });
});
