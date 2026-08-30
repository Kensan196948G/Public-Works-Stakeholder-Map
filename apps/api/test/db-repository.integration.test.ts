import { describe, expect, it } from 'vitest';
import {
  fetchOrganizationDetailDb,
  fetchJurisdictionMapDb,
  searchCandidatesDb,
} from '../src/repositories/db-repository.js';
import {
  clearMemoryAuditEvents,
  recordAuditEvent,
  verifyAuditChain,
} from '../src/repositories/audit-repository.js';
import { getSql } from '../src/repositories/sql-client.js';

/**
 * ローカル PostgreSQL / PostGIS 統合テスト（Issue #10）。
 * TEST_DATABASE_URL（ローカル PostgreSQL + migration/seed 適用済み）設定時のみ実行し、
 * CI など未設定環境では skip する。接続文字列はコード・ログへ出力しない。
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const FIXED_NOW = new Date('2026-07-18T00:00:00Z');

describe.skipIf(databaseUrl === undefined)('searchCandidatesDb（ローカル PostgreSQL）', () => {
  const url = databaseUrl as string;

  it('道路掘削 + 交通規制の検索で該当種別の候補が根拠付きで返る', async () => {
    const result = await searchCandidatesDb(
      url,
      {
        location: { lat: 35.05, lon: 139.05 },
        radiusMeters: 500,
        workTypes: ['excavation', 'traffic_restriction'],
        assetTypes: ['road'],
        impactTypes: [],
        purpose: 'pre_consultation',
      },
      FIXED_NOW,
    );

    expect(result.ruleVersion).toBe(1);
    const names = result.candidates.map((c) => c.name);
    expect(names).toContain('みらい市 道路管理課（デモ）');
    expect(names).toContain('みらい市 契約検査課（デモ）');
    expect(names).toContain('あおぞら県警察 みらい警察署（デモ）');
    // 河川・港湾は条件に該当しない
    expect(names).not.toContain('あおぞら県 河川整備課（デモ）');
    expect(names).not.toContain('みらい港 港湾管理事務所（デモ）');

    for (const candidate of result.candidates) {
      expect(candidate.reasons.length).toBeGreaterThan(0);
      expect(candidate.evidence.length).toBeGreaterThan(0);
    }

    const police = result.candidates.find((c) => c.type === 'police');
    expect(police?.estimated).toBe(true);
  });

  it('期限超過の機関は結果に残り expired として識別される（§17.2 ケース3）', async () => {
    const result = await searchCandidatesDb(
      url,
      {
        location: { lat: 35.05, lon: 139.15 },
        radiusMeters: 0,
        workTypes: ['drainage'],
        assetTypes: ['river'],
        impactTypes: [],
        purpose: 'pre_consultation',
      },
      FIXED_NOW,
    );
    const expired = result.candidates.find((c) => c.name === 'あおぞら町 建設課（デモ）');
    expect(expired).toBeDefined();
    expect(expired?.verificationState).toBe('expired');
    expect(expired?.confidence).toBe('D');
  });

  it('区域境界上の点は両区域の候補を返す（§17.2 ケース1・ST_Covers）', async () => {
    const result = await searchCandidatesDb(
      url,
      {
        location: { lat: 35.0, lon: 139.05 },
        radiusMeters: 0,
        workTypes: [],
        assetTypes: ['port'],
        impactTypes: [],
        purpose: 'pre_consultation',
      },
      FIXED_NOW,
    );
    const names = result.candidates.map((c) => c.name);
    // 臨海地区の港湾管理者（境界南側）と両区域共通の発注者
    expect(names).toContain('みらい港 港湾管理事務所（デモ）');
    expect(names).toContain('みらい市 契約検査課（デモ）');
  });

  it('全区域外の地点は候補 0 件（radius 0）', async () => {
    const result = await searchCandidatesDb(
      url,
      {
        location: { lat: 40.0, lon: 141.0 },
        radiusMeters: 0,
        workTypes: ['excavation'],
        assetTypes: ['road'],
        impactTypes: [],
        purpose: 'pre_consultation',
      },
      FIXED_NOW,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it('fetchJurisdictionMapDb: 検索結果の UUID で FeatureCollection を返す', async () => {
    const search = await searchCandidatesDb(
      url,
      {
        location: { lat: 35.05, lon: 139.05 },
        radiusMeters: 500,
        workTypes: ['traffic_restriction'],
        assetTypes: ['road'],
        impactTypes: [],
        purpose: 'pre_consultation',
      },
      FIXED_NOW,
    );
    const ids = search.candidates.map((c) => c.organizationId);
    expect(ids.length).toBeGreaterThan(0);
    const map = await fetchJurisdictionMapDb(url, ids, 'integration-test');
    expect(map.type).toBe('FeatureCollection');
    const returnedIds = new Set(map.features.map((f) => f.properties.organizationId));
    for (const id of ids) {
      expect(returnedIds.has(id)).toBe(true);
    }
  });

  it('fetchJurisdictionMapDb: 非 UUID 形式 ID は 500 にせず空を返す', async () => {
    const map = await fetchJurisdictionMapDb(
      url,
      ['org-demo-0006', 'not-a-uuid'],
      'integration-test',
    );
    expect(map.type).toBe('FeatureCollection');
    expect(map.features).toEqual([]);
  });
});

describe.skipIf(databaseUrl === undefined)('fetchOrganizationDetailDb（Neon dev ブランチ）', () => {
  const url = databaseUrl as string;

  it('公開済み機関の詳細を返す（デモ seed の固定 UUID）', async () => {
    const detail = await fetchOrganizationDetailDb(
      url,
      '61b6c075-a069-4a55-81da-790f1d178aff',
    );
    expect(detail).not.toBeNull();
    expect(detail?.name).toBe('みらい市 契約検査課（デモ）');
    expect(detail?.offices.length).toBeGreaterThan(0);
    expect(detail?.jurisdictions.length).toBeGreaterThan(0);
    for (const jurisdiction of detail?.jurisdictions ?? []) {
      expect(jurisdiction.evidence.length).toBeGreaterThan(0);
    }
  });

  it('存在しない・非公開の UUID は null を返す', async () => {
    expect(
      await fetchOrganizationDetailDb(url, '00000000-0000-0000-0000-000000000000'),
    ).toBeNull();
    expect(await fetchOrganizationDetailDb(url, 'not-a-uuid')).toBeNull();
  });
});

describe.skipIf(databaseUrl === undefined)('監査チェーン（migration 0003・ローカル PostgreSQL）', () => {
  const url = databaseUrl as string;

  it('記録したイベントのチェーンが検証に成功し、改ざんを検出する', async () => {
    const sql = getSql(url);
    // 検証用イベントを 2 件記録（テスト専用プレフィックスのアクションで識別）
    await recordAuditEvent(url, {
      actor: 'integration-test',
      action: 'admin.audit.integration_test',
      targetKind: 'audit',
      result: 'success',
      correlationId: 'integration-chain-1',
      metadata: { case: 'chain-valid' },
    }, new Date('2026-08-12T00:00:00Z'));
    await recordAuditEvent(url, {
      actor: 'integration-test',
      action: 'admin.audit.integration_test',
      targetKind: 'audit',
      result: 'success',
      correlationId: 'integration-chain-2',
      metadata: { case: 'chain-valid' },
    }, new Date('2026-08-12T00:00:01Z'));

    const valid = await verifyAuditChain(url);
    expect(valid.valid).toBe(true);
    expect(valid.checked).toBeGreaterThanOrEqual(2);

    // 改ざん: 最新イベントの actor を SQL で書き換える
    await sql`
      UPDATE audit.audit_events
      SET actor = 'tampered'
      WHERE correlation_id = 'integration-chain-2'
    `;
    const invalid = await verifyAuditChain(url);
    expect(invalid.valid).toBe(false);
    expect(invalid.reason).toContain('不正');

    // 後続テストへの影響を避けるため検証用イベントを削除
    await sql`
      DELETE FROM audit.audit_events
      WHERE correlation_id IN ('integration-chain-1', 'integration-chain-2')
    `;
    clearMemoryAuditEvents();
  });
});

describe.skipIf(databaseUrl === undefined)('検索パフォーマンス用インデックス（migration 0004・DD-01）', () => {
  const url = databaseUrl as string;

  it('geography 式 GiST インデックス idx_jurisdictions_geometry_geography が存在する', async () => {
    const sql = getSql(url);
    const rows = (await sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'core' AND tablename = 'jurisdictions'
        AND indexname = 'idx_jurisdictions_geometry_geography'
    `) as { indexname: string }[];
    expect(rows.length).toBe(1);
  });
});
