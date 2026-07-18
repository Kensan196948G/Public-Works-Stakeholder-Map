import {
  auditEventsResponseSchema,
  geocodeResponseSchema,
  metadataResponseSchema,
  problemDetailsSchema,
  searchResponseSchema,
  type AuditEventsResponse,
  type GeocodeResponse,
  type MetadataResponse,
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
