import {
  problemDetailsSchema,
  searchResponseSchema,
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

/** 候補検索 API。応答は契約スキーマで検証し、契約外の応答を UI へ流さない。 */
export async function searchStakeholders(request: SearchRequest): Promise<SearchResponse> {
  const res = await fetch('/api/v1/stakeholders/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const problem = problemDetailsSchema.safeParse(await res.json().catch(() => null));
    if (problem.success) {
      throw new ApiError(problem.data.detail, problem.data.status, problem.data.code);
    }
    throw new ApiError('検索に失敗しました。時間をおいて再度お試しください。', res.status, null);
  }

  return searchResponseSchema.parse(await res.json());
}
