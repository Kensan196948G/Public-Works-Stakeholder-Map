import { Hono, type Context } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import {
  adminImportsResponseSchema,
  adminSourcesResponseSchema,
  auditEventsResponseSchema,
  createImportRequestSchema,
  ERROR_CODES,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_MESSAGE_MIN_LENGTH,
  GEOCODE_QUERY_MAX_LENGTH,
  MAX_MAP_ORGANIZATION_IDS,
  geocodeResponseSchema,
  feedbackResponseSchema,
  feedbackRequestSchema,
  importRecordSchema,
  jurisdictionMapResponseSchema,
  metadataResponseSchema,
  qualityReportSchema,
  REQUIRED_DISCLAIMER,
  reviewRequestSchema,
  reviewStateSchema,
  searchRequestSchema,
  type ErrorCode,
  type MetadataResponse,
  type ProblemDetails,
  type SearchResponse,
} from '@pwsm/contracts';
import { applyReviewAction } from '@pwsm/domain';
import { demoDataset } from '@pwsm/fixtures';
import {
  createDbAdminRepository,
  createFixtureAdminRepository,
  type AdminRepository,
} from './repositories/admin-repository.js';
import {
  listAuditEvents,
  recordAuditEvent,
  type AuditRecordInput,
} from './repositories/audit-repository.js';
import {
  checkDatabaseReady,
  fetchJurisdictionMapDb,
  fetchRuleVersion,
  searchCandidatesDb,
} from './repositories/db-repository.js';
import {
  buildFixtureJurisdictionMap,
  searchCandidates,
} from './repositories/fixture-repository.js';
import { recordFeedback } from './repositories/feedback-repository.js';
import {
  GEOCODER_ATTRIBUTION,
  GeocodeUpstreamError,
  geocodeAddress,
} from './services/geocode.js';
import {
  AUTH_HEADER,
  authConfigFromEnv,
  hasRole,
  verifyAccessJwt,
  type AccessClaims,
  type AdminRole,
} from './services/access-auth.js';

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
  /** テストからジオコーダーの fetch を注入する（外部 API をモック） */
  geocodeFetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface ApiContext {
  Bindings: {
    APP_ENV?: string;
    /** 設定時は Neon/PostGIS リポジトリを使用。未設定時は架空 fixture（Issue #10） */
    DATABASE_URL?: string;
    /** DB モード時のデータ版識別子（公開版切替で更新する） */
    DATASET_VERSION?: string;
    /** Cloudflare Access JWT 検証（Issue #34）。"true" で有効化 */
    AUTH_ENABLED?: string;
    AUTH_AUDIENCE?: string;
    AUTH_JWKS_URL?: string;
    AUTH_CERT_PEM?: string;
    AUTH_ADMIN_EMAILS?: string;
    AUTH_REVIEWER_EMAILS?: string;
    AUTH_EDITOR_EMAILS?: string;
  };
  Variables: {
    requestId: string;
    /** JWT 検証済みの利用者（認証有効時のみ設定） */
    actor?: AccessClaims;
  };
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const PROBLEM_TYPE_BASE = 'https://public-works-map.example/errors';

type ProblemStatus = 400 | 401 | 403 | 404 | 409 | 500 | 502;

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
  const geocodeFetch = options.geocodeFetch ?? fetch;
  const app = new Hono<ApiContext>().basePath('/api/v1');

  /** 監査記録。失敗しても本処理を止めない（Workers では waitUntil で非同期化） */
  function recordAudit(
    c: { env?: ApiContext['Bindings']; executionCtx?: { waitUntil?: (p: Promise<unknown>) => void } },
    input: AuditRecordInput,
  ): void {
    const promise = recordAuditEvent(c.env?.DATABASE_URL, input, now()).catch((err: unknown) => {
      console.error('audit record failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    });
    try {
      c.executionCtx?.waitUntil?.(promise);
    } catch {
      // Workers 以外（Node/テスト）では executionCtx が無い — promise は投げっぱなしで良い
    }
  }

  /** 認証ガード（Issue #34・設計 §11）。無効時は従来の環境ガードにフォールバックする */
  function requireRole(minimum: AdminRole) {
    return async (c: Context<ApiContext>, next: () => Promise<void>) => {
      const requestId = c.get('requestId');
      const config = authConfigFromEnv(c.env);
      if (!config.enabled) {
        if (c.env?.APP_ENV === 'production') {
          return problemResponse(
            requestId,
            403,
            ERROR_CODES.FORBIDDEN,
            '管理機能は利用できません',
            '本番環境の管理機能は認証導入後に管理者のみへ提供されます',
          );
        }
        return next();
      }
      const claims = await resolveActor(c);
      if (claims === null) {
        return problemResponse(
          requestId,
          401,
          ERROR_CODES.UNAUTHORIZED,
          '認証が必要です',
          'Cloudflare Access の認証情報がありません。再ログインしてお試しください',
        );
      }
      c.set('actor', claims);
      if (!hasRole(claims, minimum)) {
        recordAudit(c, {
          actor: claims.email ?? claims.sub,
          action: 'admin.access_denied',
          targetKind: 'admin',
          result: 'denied',
          correlationId: requestId,
          metadata: { requiredRole: minimum, actualRole: claims.role },
        });
        return problemResponse(
          requestId,
          403,
          ERROR_CODES.FORBIDDEN,
          '権限がありません',
          `この操作には ${minimum} 以上の権限が必要です`,
        );
      }
      await next();
    };
  }

  /** 認証が有効な場合のみ JWT を検証してアクターを返す（無効時・未認証は null） */
  async function resolveActor(c: Context<ApiContext>): Promise<AccessClaims | null> {
    const config = authConfigFromEnv(c.env);
    if (!config.enabled) return null;
    const token = c.req.header(AUTH_HEADER);
    if (token === undefined) return null;
    return verifyAccessJwt(token, config, now(), geocodeFetch);
  }

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

  // CSRF 対策（§12.1 / §11 認証設計）: 状態変更 API へのクロスオリジン POST を拒否する。
  // Origin ヘッダーが無い curl 等の API クライアントは許可する（ブラウザは通常付与する）。
  app.use(async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return problemResponse(
          c.get('requestId'),
          403,
          ERROR_CODES.FORBIDDEN,
          'リクエストが拒否されました',
          'Origin ヘッダーの形式が正しくありません',
        );
      }
      // リクエスト URL のホストと比較する（Host ヘッダー改変・Proxy 経由でも安定）
      const requestHost = new URL(c.req.url).host;
      if (originHost !== requestHost) {
        return problemResponse(
          c.get('requestId'),
          403,
          ERROR_CODES.FORBIDDEN,
          'リクエストが拒否されました',
          '異なるオリジンからの操作は許可されていません',
        );
      }
    }
    await next();
  });

  /** 公開 GET 応答のキャッシュ方針（§13）: メタデータ類は短時間キャッシュする */
  function cachePublic(c: { header: (name: string, value: string) => void }, seconds: number) {
    c.header('Cache-Control', `public, max-age=${seconds}`);
  }

  /** DB モード時のデータ版。公開版切替時に DATASET_VERSION を更新する */
  function datasetVersion(env: ApiContext['Bindings'] | undefined): string {
    if (env?.DATABASE_URL === undefined) return demoDataset.datasetVersion;
    return env.DATASET_VERSION ?? 'db-unversioned';
  }

  app.get('/health/live', (c) => {
    cachePublic(c, 60);
    return c.json({ status: 'ok' });
  });

  app.get('/health/ready', async (c) => {
    cachePublic(c, 60);
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
    cachePublic(c, 300);
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

  // FR-017: フィードバック受付（公開 API・本番でも利用可）
  app.post('/feedback', async (c) => {
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
    const parsed = feedbackRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(
        requestId,
        400,
        ERROR_CODES.INVALID_BODY,
        '入力内容を確認してください',
        `報告内容は${FEEDBACK_MESSAGE_MIN_LENGTH}〜${FEEDBACK_MESSAGE_MAX_LENGTH}文字で、種別を選択してください`,
      );
    }
    const result = await recordFeedback(
      c.env?.DATABASE_URL,
      {
        category: parsed.data.category,
        message: parsed.data.message,
        sourceUrl: parsed.data.sourceUrl ?? null,
        datasetVersion: datasetVersion(c.env),
      },
      now(),
    );
    // 監査ログへは本文・URL を記録しない（§12.2 プライバシー最小化）
    recordAudit(c, {
      actor: 'anonymous',
      action: 'feedback.submit',
      targetKind: 'feedback',
      result: 'success',
      correlationId: requestId,
      metadata: { feedbackId: result.id, category: parsed.data.category },
    });
    return c.json(feedbackResponseSchema.parse(result), 202);
  });

  // FR-003 拡張: 検索結果の候補機関が持つ公開管轄区域（地図ハイライト用 GeoJSON）
  app.get('/map/jurisdictions', async (c) => {
    const requestId = c.get('requestId');
    const rawIds = (c.req.query('organizationIds') ?? '').split(',').map((s) => s.trim());
    const ids = rawIds.filter((s) => s !== '');
    if (ids.length === 0 || ids.length > MAX_MAP_ORGANIZATION_IDS) {
      return problemResponse(
        requestId,
        400,
        ERROR_CODES.INVALID_QUERY,
        '入力内容を確認してください',
        `organizationIds は1〜${MAX_MAP_ORGANIZATION_IDS}件をカンマ区切りで指定してください`,
      );
    }
    const body =
      c.env?.DATABASE_URL === undefined
        ? buildFixtureJurisdictionMap(demoDataset, ids, datasetVersion(c.env))
        : await fetchJurisdictionMapDb(c.env.DATABASE_URL, ids, datasetVersion(c.env));
    cachePublic(c, 300);
    return c.json(jurisdictionMapResponseSchema.parse(body));
  });

  // 住所検索（FR-001）。クエリは監査・ログへ記録しない（プライバシー最小化）
  app.get('/geocode', async (c) => {
    const requestId = c.get('requestId');
    const query = (c.req.query('q') ?? '').trim();
    if (query.length === 0 || query.length > GEOCODE_QUERY_MAX_LENGTH) {
      return problemResponse(
        requestId,
        400,
        ERROR_CODES.INVALID_QUERY,
        '入力内容を確認してください',
        `住所は1〜${GEOCODE_QUERY_MAX_LENGTH}文字で指定してください`,
      );
    }
    try {
      const results = await geocodeAddress(query, geocodeFetch);
      recordAudit(c, {
        actor: 'anonymous',
        action: 'geocode.search',
        targetKind: 'geocode',
        result: 'success',
        correlationId: requestId,
        metadata: { resultCount: results.length },
      });
      return c.json(
        geocodeResponseSchema.parse({ results, attribution: GEOCODER_ATTRIBUTION }),
      );
    } catch (err) {
      if (err instanceof GeocodeUpstreamError) {
        recordAudit(c, {
          actor: 'anonymous',
          action: 'geocode.search',
          targetKind: 'geocode',
          result: 'failure',
          correlationId: requestId,
          metadata: { reason: 'upstream' },
        });
        return problemResponse(
          requestId,
          502,
          ERROR_CODES.UPSTREAM_ERROR,
          '住所検索サービスに接続できません',
          '時間をおいて再度お試しいただくか、緯度経度・地図で地点を指定してください',
        );
      }
      throw err;
    }
  });

  // 監査ログ閲覧（SCR-09 先行）。認証・RBAC 導入までは production で無効化する
  app.get('/audit-events', async (c) => {
    const requestId = c.get('requestId');
    const config = authConfigFromEnv(c.env);
    const actor = await resolveActor(c);
    if (config.enabled && actor !== undefined) {
      if (actor !== null && hasRole(actor, 'admin')) {
        c.set('actor', actor);
        const rawLimit = Number(c.req.query('limit') ?? 50);
        const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
        const { events, store } = await listAuditEvents(c.env?.DATABASE_URL, limit);
        return c.json(auditEventsResponseSchema.parse({ events, store }));
      }
      return problemResponse(
        requestId,
        actor === null ? 401 : 403,
        actor === null ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.FORBIDDEN,
        actor === null ? '認証が必要です' : '監査ログは閲覧できません',
        actor === null
          ? 'Cloudflare Access の認証情報がありません'
          : '監査ログの閲覧は管理者のみへ提供されます',
      );
    }
    if (c.env?.APP_ENV === 'production') {
      return problemResponse(
        requestId,
        403,
        ERROR_CODES.FORBIDDEN,
        '監査ログは閲覧できません',
        '本番環境の監査ログ閲覧は認証導入後に管理者のみへ提供されます',
      );
    }
    const rawLimit = Number(c.req.query('limit') ?? 50);
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const { events, store } = await listAuditEvents(c.env?.DATABASE_URL, limit);
    return c.json(auditEventsResponseSchema.parse({ events, store }));
  });

  /* ---------------- 管理系 API（SCR-06〜08、Phase 2） ---------------- */
  // 認証・RBAC 導入までは本番で無効化し、Cloudflare Access + この 403 の 2 層で保護する（§9.2）
  const fixtureAdminRepository = createFixtureAdminRepository(now);
  function adminRepository(env: ApiContext['Bindings'] | undefined): AdminRepository {
    return env?.DATABASE_URL === undefined
      ? fixtureAdminRepository
      : createDbAdminRepository(env.DATABASE_URL, now);
  }

  // SCR-06: データソース台帳（取得方式・利用条件・最終取得・エラー）
  app.get('/admin/sources', requireRole('editor'), async (c) => {
    const sources = await adminRepository(c.env).listSources();
    return c.json(adminSourcesResponseSchema.parse({ sources }));
  });

  // SCR-07: 取込ステージング一覧（state フィルタ・新しい順）
  app.get('/admin/imports', requireRole('reviewer'), async (c) => {
    const requestId = c.get('requestId');
    const stateRaw = c.req.query('state');
    const stateParsed = stateRaw === undefined ? undefined : reviewStateSchema.safeParse(stateRaw);
    if (stateParsed !== undefined && !stateParsed.success) {
      return problemResponse(
        requestId,
        400,
        ERROR_CODES.INVALID_QUERY,
        '入力内容を確認してください',
        'state はレビュー状態のいずれかを指定してください',
      );
    }
    const rawLimit = Number(c.req.query('limit') ?? 50);
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const records = await adminRepository(c.env).listImports(stateParsed?.data, limit);
    return c.json(adminImportsResponseSchema.parse({ records }));
  });

  // SCR-06: 手動取込の登録（ステージングへ pending で追加。無レビュー公開禁止の入口）
  app.post('/admin/imports', requireRole('editor'), async (c) => {
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
    const parsed = createImportRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(
        requestId,
        400,
        ERROR_CODES.INVALID_BODY,
        '入力内容を確認してください',
        'sourceId・entityKind・rawPayload を正しく指定してください',
      );
    }
    const result = await adminRepository(c.env).createImport(parsed.data);
    if (result === 'source_not_found') {
      recordAudit(c, {
        actor: 'operator',
        action: 'admin.import.create',
        targetKind: 'import',
        result: 'failure',
        correlationId: requestId,
        metadata: { reason: 'source_not_found' },
      });
      return problemResponse(
        requestId,
        404,
        ERROR_CODES.NOT_FOUND,
        'データソースが見つかりません',
        '指定された sourceId は台帳に登録されていません',
      );
    }
    recordAudit(c, {
      actor: 'operator',
      action: 'admin.import.create',
      targetKind: 'import',
      result: 'success',
      correlationId: requestId,
      metadata: { importId: result.id, entityKind: result.entityKind },
    });
    return c.json(importRecordSchema.parse(result), 201);
  });

  // SCR-07: レビュー操作。状態機械（domain）で遷移を検証し、全操作を監査へ記録する
  app.post('/admin/imports/:id/review', requireRole('reviewer'), async (c) => {
    const requestId = c.get('requestId');
    const id = c.req.param('id') ?? '';
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
    const parsed = reviewRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return problemResponse(
        requestId,
        400,
        ERROR_CODES.INVALID_BODY,
        '入力内容を確認してください',
        'action にはレビュー操作のいずれかを指定してください',
      );
    }
    // 公開承認（approve）は admin のみ（設計 §9.3・four-eyes 運用の基盤）
    const actor = c.get('actor');
    const config = authConfigFromEnv(c.env);
    if (
      parsed.data.action === 'approve' &&
      config.enabled &&
      !hasRole(actor ?? null, 'admin')
    ) {
      recordAudit(c, {
        actor: actor?.email ?? 'unknown',
        action: 'admin.import.review',
        targetKind: 'import',
        result: 'denied',
        correlationId: requestId,
        metadata: { importId: id, reviewAction: 'approve', reason: 'admin_required' },
      });
      return problemResponse(
        requestId,
        403,
        ERROR_CODES.FORBIDDEN,
        '権限がありません',
        '公開承認は管理者のみ実行できます',
      );
    }
    const repository = adminRepository(c.env);
    const record = await repository.getImport(id);
    if (record === null) {
      return problemResponse(
        requestId,
        404,
        ERROR_CODES.NOT_FOUND,
        '取込レコードが見つかりません',
        '指定された ID のステージングレコードは存在しません',
      );
    }
    const nextState = applyReviewAction(record.reviewState, parsed.data.action);
    if (nextState === null) {
      recordAudit(c, {
        actor: 'operator',
        action: 'admin.import.review',
        targetKind: 'import',
        result: 'denied',
        correlationId: requestId,
        metadata: { importId: id, reviewAction: parsed.data.action, from: record.reviewState },
      });
      return problemResponse(
        requestId,
        409,
        ERROR_CODES.CONFLICT,
        'この操作は現在の状態では実行できません',
        `状態 ${record.reviewState} に ${parsed.data.action} は適用できません`,
      );
    }
    const updated = await repository.updateImportState(id, nextState, parsed.data.note);
    if (updated === null) {
      return problemResponse(
        requestId,
        404,
        ERROR_CODES.NOT_FOUND,
        '取込レコードが見つかりません',
        'レビュー確定前にレコードが削除された可能性があります',
      );
    }
    recordAudit(c, {
      actor: 'operator',
      action: 'admin.import.review',
      targetKind: 'import',
      result: 'success',
      correlationId: requestId,
      metadata: {
        importId: id,
        reviewAction: parsed.data.action,
        from: record.reviewState,
        to: nextState,
      },
    });
    return c.json(importRecordSchema.parse(updated));
  });

  // SCR-08: 品質ダッシュボード（欠損・期限超過・出典保有・取込状態）
  app.get('/admin/quality', requireRole('reviewer'), async (c) => {
    const report = await adminRepository(c.env).qualityReport(datasetVersion(c.env));
    c.header('Cache-Control', 'no-store');
    return c.json(qualityReportSchema.parse(report));
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
    // 検索実行を監査へ記録（座標・条件詳細は記録しない: プライバシー最小化）
    recordAudit(c, {
      actor: 'anonymous',
      action: 'stakeholder.search',
      targetKind: 'search',
      result: 'success',
      correlationId: c.get('requestId'),
      metadata: {
        candidateCount: result.candidates.length,
        datasetVersion: body.datasetVersion,
        ruleVersion: body.ruleVersion,
      },
    });
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
