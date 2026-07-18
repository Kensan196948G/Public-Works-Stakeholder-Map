import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type {
  BoundaryPrecision,
  Candidate,
  ConfidenceGrade,
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
 * Neon PostgreSQL / PostGIS ベースの候補検索リポジトリ（詳細設計仕様書 §7.2、Issue #10）。
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

type Sql = NeonQueryFunction<false, false>;

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

/** 現在有効なルール版（メタデータ・応答用）。ルール未登録時は 0。 */
export async function fetchRuleVersion(databaseUrl: string): Promise<number> {
  const sql = neon(databaseUrl);
  const rows = (await sql`
    SELECT COALESCE(MAX(version), 0) AS version FROM core.stakeholder_rules WHERE status = 'published'
  `) as { version: number }[];
  return rows[0]?.version ?? 0;
}

/** DB 接続確認（/health/ready 用）。失敗時は例外を投げる。 */
export async function checkDatabaseReady(databaseUrl: string): Promise<void> {
  const sql = neon(databaseUrl);
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
  const sql = neon(databaseUrl);
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
        ds.authority
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
  const rows = rowsResult as JurisdictionRow[];

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

  const candidates: Candidate[] = [];
  for (const orgRows of byOrganization.values()) {
    const first = orgRows[0];
    if (first === undefined) continue;

    // 複数管轄一致時は「最も不確実な区分」を代表値にする（不確実性を隠さない）
    const estimated = orgRows.some((r) => r.estimated);
    const precision = orgRows
      .map((r) => r.precision)
      .sort(
        (a, b) =>
          ['official', 'administrative_unit', 'interpreted', 'estimated'].indexOf(b) -
          ['official', 'administrative_unit', 'interpreted', 'estimated'].indexOf(a),
      )[0] as BoundaryPrecision;

    const sourceCheckedAt = first.source_checked_at === null ? null : new Date(first.source_checked_at);
    const freshnessDueAt = first.freshness_due_at === null ? null : new Date(first.freshness_due_at);

    const confidence = calculateConfidence(
      {
        authority: first.authority ?? 'secondary_open',
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

    const spatialReasons = [
      ...new Set(
        orgRows
          .filter((r) => r.asset_name !== null)
          .map((r) => `指定地点が「${r.asset_name}」の区域に含まれます`),
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
