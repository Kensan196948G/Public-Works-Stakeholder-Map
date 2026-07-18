import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import {
  ERROR_CODES,
  metadataResponseSchema,
  REQUIRED_DISCLAIMER,
  searchRequestSchema,
  type ErrorCode,
  type MetadataResponse,
  type ProblemDetails,
  type SearchResponse,
} from '@pwsm/contracts';
import { demoDataset } from '@pwsm/fixtures';
import {
  checkDatabaseReady,
  fetchRuleVersion,
  searchCandidatesDb,
} from './repositories/db-repository.js';
import { searchCandidates } from './repositories/fixture-repository.js';

/**
 * Workers API 本体（詳細設計仕様書 §6）。
 * - Base path: /api/v1
 * - エラー: RFC 9457 Problem Details 互換
 * - 相関 ID: X-Request-ID（受信値は形式検査し、不正なら再発行）
 * - 免責: 検索応答へ常時含める（要件 FR-007）
 */

export interface AppOptions {
  /** テストから固定クロックを注入する。省略時は実時刻 */
  now?: () => Date;
}

export interface ApiContext {
  Bindings: {
    APP_ENV?: string;
    /** 設定時は Neon/PostGIS リポジトリを使用。未設定時は架空 fixture（Issue #10） */
    DATABASE_URL?: string;
    /** DB モード時のデータ版識別子（公開版切替で更新する） */
    DATASET_VERSION?: string;
  };
  Variables: { requestId: string };
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PROBLEM_TYPE_BASE = 'https://public-works-map.example/errors';

type ProblemStatus = 400 | 404 | 500;

function problemResponse(
  requestId: string,
  status: ProblemStatus,
  code: ErrorCode,
  title: string,
  detail: string,
): Response {
  const body: ProblemDetails = {
    type: `${PROBLEM_TYPE_BASE}/${code.toLowerCase()}`,
    title,
    status,
    code,
    detail,
    requestId,
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/problem+json; charset=utf-8',
      'X-Request-ID': requestId,
    },
  });
}

/** Zod の検証エラーから利用者向けのエラーコードを決める */
function classifyValidationError(path: readonly PropertyKey[]): {
  code: ErrorCode;
  detail: string;
} {
  const head = path[0];
  if (head === 'location') {
    return {
      code: ERROR_CODES.INVALID_COORDINATE,
      detail: '緯度は-90から90、経度は-180から180の範囲で指定してください',
    };
  }
  if (head === 'radiusMeters') {
    return {
      code: ERROR_CODES.INVALID_RADIUS,
      detail: '検索半径は0から5000メートルの範囲で指定してください',
    };
  }
  return {
    code: ERROR_CODES.INVALID_BODY,
    detail: '入力内容の形式が正しくありません',
  };
}

export function buildApp(options: AppOptions = {}) {
  const now = options.now ?? (() => new Date());
  const app = new Hono<ApiContext>().basePath('/api/v1');

  app.use(secureHeaders());

  // 相関 ID ミドルウェア（§6.1: 受信値は形式検査し、不正なら再発行）
  app.use(async (c, next) => {
    const incoming = c.req.header('x-request-id');
    const requestId =
      incoming !== undefined && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : crypto.randomUUID();
    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);
    await next();
  });

  /** DB モード時のデータ版。公開版切替時に DATASET_VERSION を更新する */
  function datasetVersion(env: ApiContext['Bindings'] | undefined): string {
    if (env?.DATABASE_URL === undefined) return demoDataset.datasetVersion;
    return env.DATASET_VERSION ?? 'db-unversioned';
  }

  app.get('/health/live', (c) => c.json({ status: 'ok' }));

  app.get('/health/ready', async (c) => {
    const databaseUrl = c.env?.DATABASE_URL;
    if (databaseUrl !== undefined) {
      try {
        await checkDatabaseReady(databaseUrl);
      } catch {
        // 接続情報等の内部詳細は返さない（§6.2: 秘密情報を返さない）
        return c.json({ status: 'unavailable', datasetVersion: datasetVersion(c.env) }, 503);
      }
    }
    return c.json({ status: 'ok', datasetVersion: datasetVersion(c.env) });
  });

  app.get('/metadata', async (c) => {
    const rawEnv = c.env?.APP_ENV;
    const appEnv =
      rawEnv === 'preview' || rawEnv === 'staging' || rawEnv === 'production'
        ? rawEnv
        : 'local';
    const databaseUrl = c.env?.DATABASE_URL;
    const ruleVersion =
      databaseUrl === undefined ? demoDataset.ruleVersion : await fetchRuleVersion(databaseUrl);
    const body: MetadataResponse = metadataResponseSchema.parse({
      datasetVersion: datasetVersion(c.env),
      ruleVersion,
      lastPublishedAt: null,
      disclaimer: REQUIRED_DISCLAIMER,
      appEnv,
    });
    return c.json(body);
  });

  app.post('/stakeholders/search', async (c) => {
    const requestId = c.get('requestId');

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return problemResponse(
        requestId,
        400,
        ERROR_CODES.INVALID_BODY,
        '入力内容を確認してください',
        'リクエストボディが JSON として解釈できません',
      );
    }

    const parsed = searchRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const { code, detail } = classifyValidationError(firstIssue?.path ?? []);
      return problemResponse(requestId, 400, code, '入力内容を確認してください', detail);
    }

    const databaseUrl = c.env?.DATABASE_URL;
    const result =
      databaseUrl === undefined
        ? {
            candidates: searchCandidates(demoDataset, parsed.data, now()),
            ruleVersion: demoDataset.ruleVersion,
          }
        : await searchCandidatesDb(databaseUrl, parsed.data, now());

    const body: SearchResponse = {
      queryId: crypto.randomUUID(),
      datasetVersion: datasetVersion(c.env),
      ruleVersion: result.ruleVersion,
      disclaimerRequired: true,
      disclaimer: REQUIRED_DISCLAIMER,
      candidates: result.candidates,
    };
    return c.json(body);
  });

  app.notFound((c) =>
    problemResponse(
      c.get('requestId') ?? crypto.randomUUID(),
      404,
      ERROR_CODES.NOT_FOUND,
      'リソースが見つかりません',
      '指定されたパスは存在しません',
    ),
  );

  app.onError((err, c) => {
    // スタックトレース等の内部情報は応答へ含めない（§12）
    console.error('unhandled error', { message: err.message });
    return problemResponse(
      c.get('requestId') ?? crypto.randomUUID(),
      500,
      ERROR_CODES.INTERNAL_ERROR,
      'サーバー内部でエラーが発生しました',
      '時間をおいて再度お試しください',
    );
  });

  return app;
}
