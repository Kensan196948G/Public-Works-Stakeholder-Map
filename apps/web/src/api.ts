import {
  adminImportsResponseSchema,
  adminSourcesResponseSchema,
  auditEventsResponseSchema,
  geocodeResponseSchema,
  importRecordSchema,
  metadataResponseSchema,
  problemDetailsSchema,
  qualityReportSchema,
  searchResponseSchema,
  type AdminImportsResponse,
  type AdminSourcesResponse,
  type AuditEventsResponse,
  type CreateImportRequest,
  type GeocodeResponse,
  type ImportRecord,
  type MetadataResponse,
  type QualityReport,
  type ReviewRequest,
  type ReviewState,
  type SearchRequest,
  type SearchResponse,
} from '@pwsm/contracts';

/** API 呼び出しエラー（Problem Details の内容を保持する） */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function throwProblem(res: Response, fallbackMessage: string): Promise<never> {
  const problem = problemDetailsSchema.safeParse(await res.json().catch(() => null));
  if (problem.success) {
    throw new ApiError(problem.data.detail, problem.data.status, problem.data.code);
  }
  throw new ApiError(fallbackMessage, res.status, null);
}

/** 候補検索 API。応答は契約スキーマで検証し、契約外の応答を UI へ流さない。 */
export async function searchStakeholders(request: SearchRequest): Promise<SearchResponse> {
  const res = await fetch('/api/v1/stakeholders/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    await throwProblem(res, '検索に失敗しました。時間をおいて再度お試しください。');
  }
  return searchResponseSchema.parse(await res.json());
}

/** 住所検索（ジオコーディング） */
export async function geocode(query: string): Promise<GeocodeResponse> {
  const res = await fetch(`/api/v1/geocode?q=${encodeURIComponent(query)}`);
  if (!res.ok) {
    await throwProblem(res, '住所検索に失敗しました。時間をおいて再度お試しください。');
  }
  return geocodeResponseSchema.parse(await res.json());
}

/** メタデータ（データ版・ルール版・環境） */
export async function fetchMetadata(): Promise<MetadataResponse> {
  const res = await fetch('/api/v1/metadata');
  if (!res.ok) {
    await throwProblem(res, 'メタデータの取得に失敗しました。');
  }
  return metadataResponseSchema.parse(await res.json());
}

/** 監査イベント一覧（非本番のみ。認証導入後に管理者向けへ移行） */
export async function fetchAuditEvents(limit = 50): Promise<AuditEventsResponse> {
  const res = await fetch(`/api/v1/audit-events?limit=${limit}`);
  if (!res.ok) {
    await throwProblem(res, '監査ログの取得に失敗しました。');
  }
  return auditEventsResponseSchema.parse(await res.json());
}

/* ---------------- 管理系 API（SCR-06〜08、Phase 2） ---------------- */
/* 本番では 403（認証導入後に管理者ロールへ提供）。各画面はエラーメッセージで案内する */

/** SCR-06: データソース台帳 */
export async function fetchAdminSources(): Promise<AdminSourcesResponse> {
  const res = await fetch('/api/v1/admin/sources');
  if (!res.ok) {
    await throwProblem(res, 'データソース台帳の取得に失敗しました。');
  }
  return adminSourcesResponseSchema.parse(await res.json());
}

/** SCR-07: 取込ステージング一覧 */
export async function fetchAdminImports(state?: ReviewState): Promise<AdminImportsResponse> {
  const query = state === undefined ? '' : `?state=${encodeURIComponent(state)}`;
  const res = await fetch(`/api/v1/admin/imports${query}`);
  if (!res.ok) {
    await throwProblem(res, '取込レコードの取得に失敗しました。');
  }
  return adminImportsResponseSchema.parse(await res.json());
}

/** SCR-06: 手動取込の登録（ステージングへ pending で追加） */
export async function createAdminImport(request: CreateImportRequest): Promise<ImportRecord> {
  const res = await fetch('/api/v1/admin/imports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    await throwProblem(res, '取込の登録に失敗しました。');
  }
  return importRecordSchema.parse(await res.json());
}

/** SCR-07: レビュー操作（承認・差戻し・隔離など） */
export async function reviewAdminImport(id: string, request: ReviewRequest): Promise<ImportRecord> {
  const res = await fetch(`/api/v1/admin/imports/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    await throwProblem(res, 'レビュー操作に失敗しました。');
  }
  return importRecordSchema.parse(await res.json());
}

/** SCR-08: 品質ダッシュボード */
export async function fetchQualityReport(): Promise<QualityReport> {
  const res = await fetch('/api/v1/admin/quality');
  if (!res.ok) {
    await throwProblem(res, '品質レポートの取得に失敗しました。');
  }
  return qualityReportSchema.parse(await res.json());
}
