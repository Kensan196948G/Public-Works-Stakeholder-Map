import type {
  Candidate,
  ConfidenceGrade,
  JurisdictionMapResponse,
  Location,
  OrganizationType,
  OrganizationDetail,
  SearchRequest,
} from '@pwsm/contracts';
import { calculateConfidence, calculateFreshnessDue, evaluateRules } from '@pwsm/domain';
import type { DemoDataset, DemoRegion } from '@pwsm/fixtures';

/**
 * fixture ベースの候補検索リポジトリ（詳細設計仕様書 §7 のアルゴリズムを bbox で近似）。
 * DB モードではローカル PostgreSQL/PostGIS の空間検索（ST_Covers / ST_DWithin）を使うが、
 * 「行政区域特定 → 空間候補 → ルール評価 → 統合 → 信頼度 → 根拠付き返却」の流れは同一。
 */

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * 地点（+ 検索半径）と重なる区域を返す。bbox 判定は両端 inclusive とし、
 * 境界上の点が複数区域に一致する場合は全て返す（§17.2 ケース1: 片方を隠さない）。
 */
export function findMatchingRegions(
  dataset: DemoDataset,
  location: Location,
  radiusMeters: number,
): DemoRegion[] {
  const latMargin = radiusMeters / METERS_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((location.lat * Math.PI) / 180), 0.01);
  const lonMargin = radiusMeters / (METERS_PER_DEGREE_LAT * cosLat);

  return dataset.regions.filter(
    (r) =>
      location.lat >= r.bbox.minLat - latMargin &&
      location.lat <= r.bbox.maxLat + latMargin &&
      location.lon >= r.bbox.minLon - lonMargin &&
      location.lon <= r.bbox.maxLon + lonMargin,
  );
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

/** 候補検索本体。候補提示に限定し、所管・許認可を断定しない。 */
export function searchCandidates(
  dataset: DemoDataset,
  request: SearchRequest,
  now: Date,
): Candidate[] {
  const regions = findMatchingRegions(dataset, request.location, request.radiusMeters);
  if (regions.length === 0) return [];

  // 条件ルールを評価し、機関種別ごとの一致理由を集約する
  const ruleMatches = evaluateRules(request, dataset.rules);
  const reasonsByType = new Map<OrganizationType, string[]>();
  for (const match of ruleMatches) {
    for (const type of match.targetTypes) {
      const list = reasonsByType.get(type) ?? [];
      if (!list.includes(match.reason)) list.push(match.reason);
      reasonsByType.set(type, list);
    }
  }

  const candidates: Candidate[] = [];
  for (const org of dataset.organizations) {
    // 公開承認済みデータのみ提示する（§8.1: 無レビュー公開の禁止）
    if (org.reviewStatus !== 'published') continue;

    const orgRegions = regions.filter((r) => org.regionCodes.includes(r.code));
    if (orgRegions.length === 0) continue;

    const typeReasons = reasonsByType.get(org.type);
    if (typeReasons === undefined) continue;

    const sourceCheckedAt = new Date(org.sourceCheckedAt);
    const freshnessDueAt = calculateFreshnessDue(sourceCheckedAt, org.ttlDays);
    const confidence = calculateConfidence(
      {
        authority: org.authority,
        sourceCheckedAt,
        freshnessDueAt,
        precision: org.precision,
        estimated: org.estimated,
        reviewStatus: org.reviewStatus,
        conflictingSourceCount: 0,
        linkFailed: false,
      },
      now,
    );

    candidates.push({
      organizationId: org.id,
      name: org.name,
      type: org.type,
      officeName: org.officeName,
      confidence: confidence.grade,
      confidenceBreakdown: confidence.breakdown,
      // 期限超過は削除せず expired として必ず識別する（§17.2 ケース3）
      verificationState: confidence.expired ? 'expired' : 'unverified',
      reasons: [
        ...orgRegions.map((r) => `指定地点が「${r.name}」の区域に含まれます`),
        ...typeReasons,
      ],
      precision: org.precision,
      estimated: org.estimated,
      sourceCheckedAt: sourceCheckedAt.toISOString(),
      freshnessDueAt: freshnessDueAt === null ? null : freshnessDueAt.toISOString(),
      evidence: [...org.evidence],
    });
  }

  // 表示順: 機関種別 → 信頼度 → 名称（§9.2）
  candidates.sort(
    (a, b) =>
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      GRADE_ORDER[a.confidence] - GRADE_ORDER[b.confidence] ||
      a.name.localeCompare(b.name, 'ja'),
  );
  return candidates;
}

/** 検索結果の候補機関が持つ区域を GeoJSON（Polygon）で返す（FR-003 拡張・fixture モード）。 */
export function buildFixtureJurisdictionMap(
  dataset: DemoDataset,
  organizationIds: readonly string[],
  datasetVersion: string,
): JurisdictionMapResponse {
  const idSet = new Set(organizationIds);
  const features: JurisdictionMapResponse['features'] = [];
  for (const org of dataset.organizations) {
    if (!idSet.has(org.id) || org.reviewStatus !== 'published') continue;
    for (const regionCode of org.regionCodes) {
      const region = dataset.regions.find((r) => r.code === regionCode);
      if (region === undefined) continue;
      const { minLat, maxLat, minLon, maxLon } = region.bbox;
      features.push({
        type: 'Feature',
        properties: {
          organizationId: org.id,
          organizationName: org.name,
          assetName: region.name,
          precision: org.precision,
          estimated: org.estimated,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minLon, minLat],
              [maxLon, minLat],
              [maxLon, maxLat],
              [minLon, maxLat],
              [minLon, minLat],
            ],
          ],
        },
      });
    }
  }
  return { type: 'FeatureCollection', datasetVersion, features };
}

const ASSET_TYPE_BY_ORG_TYPE: Record<OrganizationType, string> = {
  issuer: 'administrative',
  road_admin: 'road',
  river_admin: 'river',
  port_admin: 'port',
  police: 'police',
  prefecture: 'administrative',
  municipality: 'administrative',
  other: 'administrative',
};

/** 機関詳細（FR-005・fixture モード）。公開済みのみ返す。 */
export function fetchOrganizationDetailFixture(
  dataset: DemoDataset,
  organizationId: string,
): OrganizationDetail | null {
  const org = dataset.organizations.find(
    (o) => o.id === organizationId && o.reviewStatus === 'published',
  );
  if (org === undefined) return null;
  const sourceCheckedAt = new Date(org.sourceCheckedAt);
  const freshnessDueAt = calculateFreshnessDue(sourceCheckedAt, org.ttlDays);

  return {
    organizationId: org.id,
    name: org.name,
    type: org.type,
    officialUrl: org.officialUrl,
    status: org.reviewStatus,
    sourceCheckedAt: sourceCheckedAt.toISOString(),
    freshnessDueAt: freshnessDueAt === null ? null : freshnessDueAt.toISOString(),
    offices: [
      {
        id: `${org.id}-office-1`,
        name: org.officeName,
        roleSummary: null,
        addressRaw: null,
        receptionNote: null,
      },
    ],
    contactPoints: [],
    jurisdictions: org.regionCodes.map((regionCode, index) => {
      const region = dataset.regions.find((r) => r.code === regionCode);
      return {
        id: `${org.id}-jur-${index + 1}`,
        assetType: ASSET_TYPE_BY_ORG_TYPE[org.type],
        assetName: region?.name ?? regionCode,
        precision: org.precision,
        estimated: org.estimated,
        scaleNote: null,
        validFrom: null,
        validTo: null,
        evidence: [...org.evidence],
      };
    }),
  };
}
