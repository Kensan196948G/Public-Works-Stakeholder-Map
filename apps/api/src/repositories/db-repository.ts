import { getSql, type Sql } from './sql-client.js';
import type {
  BoundaryPrecision,
  Candidate,
  ConfidenceGrade,
  JurisdictionMapResponse,
  OrganizationDetail,
  OrganizationType,
  RecordStatus,
  SearchRequest,
  SourceAuthority,
} from '@pwsm/contracts';
import {
  calculateConfidence,
  evaluateRules,
  type RuleCondition,
  type StakeholderRule,
} from '@pwsm/domain';

/**
 * ローカル PostgreSQL / PostGIS ベースの候補検索リポジトリ（詳細設計仕様書 §7.2、Issue #10）。
 * - 点一致: ST_Covers（境界上の点も候補に含める）
 * - 周辺検索: ST_DWithin（geography キャストでメートル距離）
 * - 公開承認済み（published）のデータのみ返す
 */

interface JurisdictionRow {
  organization_id: string;
  canonical_name: string;
  organization_type: OrganizationType;
  official_url: string | null;
  org_status: RecordStatus;
  source_checked_at: string | null;
  freshness_due_at: string | null;
  office_name: string | null;
  asset_name: string | null;
  precision: BoundaryPrecision;
  estimated: boolean;
  evidence_title: string | null;
  evidence_url: string | null;
  authority: SourceAuthority | null;
  /** true: 区域が地点を包含（ST_Covers）。false: 検索半径による周辺一致のみ */
  covered: boolean;
}

interface RuleRow {
  rule_code: string;
  version: number;
  condition_json: unknown;
  target_types: OrganizationType[];
  reason_template: string;
  priority: number;
}

const TYPE_ORDER: Record<OrganizationType, number> = {
  issuer: 0,
  road_admin: 1,
  river_admin: 2,
  port_admin: 3,
  police: 4,
  prefecture: 5,
  municipality: 6,
  other: 7,
};

const GRADE_ORDER: Record<ConfidenceGrade, number> = { A: 0, B: 1, C: 2, D: 3 };

/** DB 上の公開ルールを読み込む。condition_json は宣言的条件（未知形式は評価時に false）。 */
async function loadPublishedRules(sql: Sql): Promise<StakeholderRule[]> {
  // enum 配列は driver が未知 OID として文字列を返すため text[] へキャストする
  const rows = (await sql`
    SELECT rule_code, version, condition_json, target_types::text[] AS target_types,
           reason_template, priority
    FROM core.stakeholder_rules
    WHERE status = 'published'
      AND (effective_from IS NULL OR effective_from <= now())
      AND (effective_to IS NULL OR effective_to >= now())
    ORDER BY priority
  `) as RuleRow[];
  return rows.map((row) => ({
    ruleCode: row.rule_code,
    version: row.version,
    condition: row.condition_json as RuleCondition,
    targetTypes: row.target_types,
    reasonTemplate: row.reason_template,
    priority: row.priority,
  }));
}

/** 現在有効なルール版（メタデータ・応答用）。検索時と同じ有効期間条件で判定する。ルール未登録時は 0。 */
export async function fetchRuleVersion(databaseUrl: string): Promise<number> {
  const sql = getSql(databaseUrl);
  const rows = (await sql`
    SELECT COALESCE(MAX(version), 0) AS version
    FROM core.stakeholder_rules
    WHERE status = 'published'
      AND (effective_from IS NULL OR effective_from <= now())
      AND (effective_to IS NULL OR effective_to >= now())
  `) as { version: number }[];
  return rows[0]?.version ?? 0;
}

/** DB 接続確認（/health/ready 用）。失敗時は例外を投げる。 */
export async function checkDatabaseReady(databaseUrl: string): Promise<void> {
  const sql = getSql(databaseUrl);
  await sql`SELECT 1`;
}

export interface DbSearchResult {
  candidates: Candidate[];
  /** 適用した公開ルールの最大版（応答の再現性記録用） */
  ruleVersion: number;
}

/** 候補検索本体。空間一致 → ルール評価 → 機関単位統合 → 信頼度 → 根拠付き返却（§7.1） */
export async function searchCandidatesDb(
  databaseUrl: string,
  request: SearchRequest,
  now: Date,
): Promise<DbSearchResult> {
  const sql = getSql(databaseUrl);
  const { lat, lon } = request.location;
  const radius = request.radiusMeters;

  const [rules, rowsResult] = await Promise.all([
    loadPublishedRules(sql),
    sql`
      SELECT
        o.id AS organization_id,
        o.canonical_name,
        o.organization_type,
        o.official_url,
        o.status AS org_status,
        o.source_checked_at,
        o.freshness_due_at,
        f.name AS office_name,
        j.asset_name,
        j.precision,
        j.estimated,
        e.title AS evidence_title,
        e.url AS evidence_url,
        ds.authority,
        ST_Covers(j.geometry, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)) AS covered
      FROM core.jurisdictions j
      JOIN core.organizations o ON o.id = j.organization_id AND o.status = 'published'
      LEFT JOIN core.offices f ON f.id = j.office_id
      LEFT JOIN provenance.source_evidence e ON e.id = j.evidence_id
      LEFT JOIN provenance.data_sources ds ON ds.id = e.source_id
      WHERE j.status = 'published'
        AND j.geometry IS NOT NULL
        AND (
          ST_Covers(j.geometry, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326))
          OR (
            ${radius} > 0
            AND ST_DWithin(
              j.geometry::geography,
              ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
              ${radius}
            )
          )
        )
    `,
  ]);
  const rows = rowsResult as unknown as JurisdictionRow[];

  // 条件ルールを評価し、機関種別ごとの一致理由を集約する
  const ruleMatches = evaluateRules(request, rules);
  const reasonsByType = new Map<OrganizationType, string[]>();
  for (const match of ruleMatches) {
    for (const type of match.targetTypes) {
      const list = reasonsByType.get(type) ?? [];
      if (!list.includes(match.reason)) list.push(match.reason);
      reasonsByType.set(type, list);
    }
  }

  // 機関単位で統合し、複数の空間一致根拠を保持する（§5.2 手順 5）
  const byOrganization = new Map<string, JurisdictionRow[]>();
  for (const row of rows) {
    const typeReasons = reasonsByType.get(row.organization_type);
    if (typeReasons === undefined) continue;
    const list = byOrganization.get(row.organization_id) ?? [];
    list.push(row);
    byOrganization.set(row.organization_id, list);
  }

  // 複数行の統合は常に「最も不確実な値」を代表値にする保守的集約（不確実性を隠さない）
  const AUTHORITY_WEAKNESS: Record<SourceAuthority, number> = {
    secondary_open: 0,
    official_catalog: 1,
    primary_official: 2,
  };
  const PRECISION_UNCERTAINTY: readonly BoundaryPrecision[] = [
    'official',
    'administrative_unit',
    'interpreted',
    'estimated',
  ];

  const candidates: Candidate[] = [];
  for (const orgRows of byOrganization.values()) {
    const first = orgRows[0];
    if (first === undefined) continue;

    const estimated = orgRows.some((r) => r.estimated);
    const precision = orgRows
      .map((r) => r.precision)
      .sort((a, b) => PRECISION_UNCERTAINTY.indexOf(b) - PRECISION_UNCERTAINTY.indexOf(a))[0] as BoundaryPrecision;
    // 権威性は最も弱いソースを代表値にする（null は secondary_open 相当）
    const authority = orgRows
      .map((r) => r.authority ?? 'secondary_open')
      .sort((a, b) => AUTHORITY_WEAKNESS[a] - AUTHORITY_WEAKNESS[b])[0] as SourceAuthority;
    // 確認日は最古、確認期限は最も早いものを代表値にする
    const checkedTimes = orgRows
      .filter((r) => r.source_checked_at !== null)
      .map((r) => new Date(r.source_checked_at as string).getTime());
    const dueTimes = orgRows
      .filter((r) => r.freshness_due_at !== null)
      .map((r) => new Date(r.freshness_due_at as string).getTime());
    const sourceCheckedAt = checkedTimes.length === 0 ? null : new Date(Math.min(...checkedTimes));
    const freshnessDueAt = dueTimes.length === 0 ? null : new Date(Math.min(...dueTimes));

    const confidence = calculateConfidence(
      {
        authority,
        sourceCheckedAt,
        freshnessDueAt,
        precision,
        estimated,
        reviewStatus: first.org_status,
        conflictingSourceCount: 0,
        linkFailed: false,
      },
      now,
    );

    // 包含一致と周辺一致で理由を区別し、周辺一致で「含まれる」と断定しない
    const spatialReasons = [
      ...new Set(
        orgRows
          .filter((r) => r.asset_name !== null)
          .map((r) =>
            r.covered
              ? `指定地点が「${r.asset_name}」の区域に含まれます`
              : `「${r.asset_name}」の区域が検索半径 ${request.radiusMeters}m の範囲内にあります`,
          ),
      ),
    ];
    const typeReasons = reasonsByType.get(first.organization_type) ?? [];

    const evidence = [
      ...new Map(
        orgRows
          .filter((r) => r.evidence_url !== null && r.evidence_title !== null)
          .map((r) => [
            r.evidence_url,
            {
              title: r.evidence_title as string,
              url: r.evidence_url as string,
              ...(r.authority === null ? {} : { authority: r.authority }),
              sourceCheckedAt: first.source_checked_at,
            },
          ]),
      ).values(),
    ];
    // 公開データは根拠必須（§6.2）。根拠が欠落したレコードは提示しない
    if (evidence.length === 0) continue;

    candidates.push({
      organizationId: first.organization_id,
      name: first.canonical_name,
      type: first.organization_type,
      officeName: first.office_name,
      confidence: confidence.grade,
      confidenceBreakdown: confidence.breakdown,
      verificationState: confidence.expired ? 'expired' : 'unverified',
      reasons: [...spatialReasons, ...typeReasons],
      precision,
      estimated,
      sourceCheckedAt: sourceCheckedAt === null ? null : sourceCheckedAt.toISOString(),
      freshnessDueAt: freshnessDueAt === null ? null : freshnessDueAt.toISOString(),
      evidence,
    });
  }

  candidates.sort(
    (a, b) =>
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      GRADE_ORDER[a.confidence] - GRADE_ORDER[b.confidence] ||
      a.name.localeCompare(b.name, 'ja'),
  );
  return {
    candidates,
    ruleVersion: rules.reduce((max, rule) => Math.max(max, rule.version), 0),
  };
}

/** 候補機関の公開管轄区域を GeoJSON で返す（FR-003 拡張・DB モード）。 */
export async function fetchJurisdictionMapDb(
  databaseUrl: string,
  organizationIds: readonly string[],
  datasetVersion: string,
): Promise<JurisdictionMapResponse> {
  const sql = getSql(databaseUrl);
  // DB の id は uuid のため、形式不正な ID は型エラー（500）にせず対象外にする。
  // UI は検索応答の organizationId（uuid）を渡すが、直接 API 呼び出しでも安全に空結果を返す。
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validIds = organizationIds.filter((id) => UUID_PATTERN.test(id));
  if (validIds.length === 0) {
    return { type: 'FeatureCollection', datasetVersion, features: [] };
  }
  const rows = (await sql`
    SELECT
      o.id AS organization_id,
      o.canonical_name AS organization_name,
      j.asset_name,
      j.precision::text AS precision,
      j.estimated,
      -- 詳細設計仕様書 §6.2「表示範囲内の簡略化管轄GeoJSON」に従い、
      -- 境界の概形を保つ簡略化を適用する。行政区域ポリゴンは細部が非常に細かく、
      -- 未簡略化だと東京63件で約13.9MB/48万点になり描画・転送が重くなる（DD-09・2026-08-31実測）。
      -- 二段階: ST_SnapToGrid（座標丸め・自己交差なし）→ ST_SimplifyPreserveTopology（トポロジー保存）。
      -- 実測: 13.9MB → 0.24MB（約1/58）、時間 1.1s → 約175ms、自己交差なし。
      -- 地図は視覚補助であり正式境界を保証しないため、簡略化は表示要件に合致する。
      ST_AsGeoJSON(
        ST_SimplifyPreserveTopology(ST_SnapToGrid(j.geometry, 0.0005), 0.0005)
      ) AS geometry
    FROM core.jurisdictions j
    JOIN core.organizations o ON o.id = j.organization_id
    WHERE o.id = ANY(${validIds}::uuid[])
      AND j.status = 'published'
      AND o.status = 'published'
      AND j.geometry IS NOT NULL
    ORDER BY o.canonical_name, j.asset_name
  `) as {
    organization_id: string;
    organization_name: string;
    asset_name: string | null;
    precision: string;
    estimated: boolean;
    geometry: string | null;
  }[];

  const features = rows
    .map((row) => {
      let geometry: Record<string, unknown> | null = null;
      if (row.geometry !== null) {
        try {
          const parsed: unknown = JSON.parse(row.geometry);
          if (typeof parsed === 'object' && parsed !== null) {
            geometry = parsed as Record<string, unknown>;
          }
        } catch {
          // 不正な GeoJSON はハイライト対象から外す（候補一覧自体は影響を受けない）
        }
      }
      return {
        type: 'Feature' as const,
        properties: {
          organizationId: row.organization_id,
          organizationName: row.organization_name,
          assetName: row.asset_name,
          precision: row.precision,
          estimated: row.estimated,
        },
        geometry,
      };
    })
    .slice(0, 500);

  return { type: 'FeatureCollection', datasetVersion, features };
}

/** 機関詳細（FR-005・DB モード）。公開済み機関のみ・連絡先は緊急用を除外する。 */
export async function fetchOrganizationDetailDb(
  databaseUrl: string,
  organizationId: string,
): Promise<OrganizationDetail | null> {
  const sql = getSql(databaseUrl);
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_PATTERN.test(organizationId)) return null;

  const orgRows = (await sql`
    SELECT id, canonical_name, organization_type, official_url, status,
           source_checked_at, freshness_due_at
    FROM core.organizations
    WHERE id = ${organizationId} AND status = 'published'
  `) as {
    id: string;
    canonical_name: string;
    organization_type: OrganizationDetail['type'];
    official_url: string | null;
    status: OrganizationDetail['status'];
    source_checked_at: string | null;
    freshness_due_at: string | null;
  }[];
  const org = orgRows[0];
  if (org === undefined) return null;

  const [officeRows, contactRows, jurisdictionRows] = await Promise.all([
    sql`
      SELECT id, name, role_summary, address_raw, reception_note
      FROM core.offices
      WHERE organization_id = ${organizationId} AND status = 'published'
      ORDER BY name
    `,
    sql`
      SELECT c.id, c.contact_type::text AS contact_type, c.label,
             c.display_value, c.extension, c.source_checked_at
      FROM core.contact_points c
      JOIN core.offices f ON f.id = c.office_id
      WHERE f.organization_id = ${organizationId}
        AND f.status = 'published'
        AND c.is_emergency = false
      ORDER BY f.name, c.label
    `,
    sql`
      SELECT j.id, j.asset_type::text AS asset_type, j.asset_name,
             j.precision::text AS precision, j.estimated, j.scale_note,
             j.valid_from::text AS valid_from, j.valid_to::text AS valid_to,
             e.title AS evidence_title, e.url AS evidence_url,
             e.source_published_at, ds.authority::text AS authority
      FROM core.jurisdictions j
      JOIN provenance.source_evidence e ON e.id = j.evidence_id
      LEFT JOIN provenance.data_sources ds ON ds.id = e.source_id
      WHERE j.organization_id = ${organizationId} AND j.status = 'published'
      ORDER BY j.asset_name
    `,
  ]);

  return {
    organizationId: org.id,
    name: org.canonical_name,
    type: org.organization_type,
    officialUrl: org.official_url,
    status: org.status,
    sourceCheckedAt: org.source_checked_at === null ? null : new Date(org.source_checked_at).toISOString(),
    freshnessDueAt: org.freshness_due_at === null ? null : new Date(org.freshness_due_at).toISOString(),
    offices: (officeRows as unknown as {
      id: string;
      name: string;
      role_summary: string | null;
      address_raw: string | null;
      reception_note: string | null;
    }[]).map((row) => ({
      id: row.id,
      name: row.name,
      roleSummary: row.role_summary,
      addressRaw: row.address_raw,
      receptionNote: row.reception_note,
    })),
    contactPoints: (contactRows as unknown as {
      id: string;
      contact_type: string;
      label: string;
      display_value: string;
      extension: string | null;
      source_checked_at: string | null;
    }[]).map((row) => ({
      id: row.id,
      contactType: row.contact_type as OrganizationDetail['contactPoints'][number]['contactType'],
      label: row.label,
      displayValue: row.display_value,
      extension: row.extension,
      sourceCheckedAt: row.source_checked_at === null ? null : new Date(row.source_checked_at).toISOString(),
    })),
    jurisdictions: (jurisdictionRows as unknown as {
      id: string;
      asset_type: string;
      asset_name: string | null;
      precision: string;
      estimated: boolean;
      scale_note: string | null;
      valid_from: string | null;
      valid_to: string | null;
      evidence_title: string;
      evidence_url: string;
      source_published_at: string | null;
      authority: string | null;
    }[]).map((row) => ({
      id: row.id,
      assetType: row.asset_type,
      assetName: row.asset_name,
      precision: row.precision as OrganizationDetail['jurisdictions'][number]['precision'],
      estimated: row.estimated,
      scaleNote: row.scale_note,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      evidence: [
        {
          title: row.evidence_title,
          url: row.evidence_url,
          ...(row.authority === null ? {} : { authority: row.authority as 'primary_official' | 'official_catalog' | 'secondary_open' }),
          sourceCheckedAt: row.source_published_at === null ? null : new Date(row.source_published_at).toISOString(),
        },
      ],
    })),
  };
}
