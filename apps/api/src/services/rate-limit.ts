/**
 * 簡易レート制限（詳細設計仕様書 §12.2）。
 * - Workers の同一 isolate 内で固定ウィンドウ方式により制限する
 * - 制限は「アプリ層の最低限の防御」であり、多 isolate 展開時は
 *   Cloudflare WAF / Rate Limiting などエッジ側制御を正とする
 * - 制限超過時は 429 + Retry-After を返す（RFC 6585）
 */

import type { Context, Next } from 'hono';

export interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitOptions {
  /** ウィンドウあたりの最大リクエスト数 */
  limit: number;
  /** ウィンドウ幅（ミリ秒） */
  windowMs: number;
  /** テスト用クロック。省略時は実時刻 */
  nowMs?: () => number;
}

const buckets = new Map<string, RateLimitEntry>();

/** テスト専用: 全バケットをクリアする（テストファイル間の分離用） */
export function clearRateLimitBuckets(): void {
  buckets.clear();
}
/** 古いエントリの掃除間隔（ウィンドウの 2 倍） */
function sweep(nowMs: number, windowMs: number): void {
  const cutoff = nowMs - windowMs * 2;
  for (const [key, entry] of buckets) {
    if (entry.windowStart < cutoff) buckets.delete(key);
  }
}

/** リクエスト元の識別子（Cloudflare 経由は CF-Connecting-IP が正） */
export function clientIp(c: {
  req: { header: (name: string) => string | undefined };
}): string {
  const cfIp = c.req.header('cf-connecting-ip');
  if (cfIp !== undefined && cfIp !== '') return cfIp;
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded !== undefined) {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  return 'unknown';
}

/**
 * 固定ウィンドウ方式のレート制限ミドルウェアを返す。
 * 超過時は Problem Details（429）を返す。bucket 名はルートごとに分ける。
 */
export function rateLimit(routeName: string, options: RateLimitOptions) {
  const { limit, windowMs } = options;
  const nowMs = options.nowMs ?? (() => Date.now());
  return async function rateLimitMiddleware(
    c: Context<{ Variables: { requestId: string } }>,
    next: Next,
  ): Promise<Response | undefined> {
    const now = nowMs();
    sweep(now, windowMs);
    const key = `${clientIp(c)}:${routeName}`;
    const bucket = buckets.get(key) ?? { count: 0, windowStart: now };
    if (now - bucket.windowStart >= windowMs) {
      bucket.count = 0;
      bucket.windowStart = now;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000));
      c.header('Retry-After', String(retryAfter));
      return c.json(
        {
          type: 'https://public-works-map.example/errors/rate_limited',
          title: 'リクエストが多すぎます',
          status: 429,
          code: 'RATE_LIMITED',
          detail: '短時間に大量のリクエストが送信されました。時間をおいて再度お試しください',
          requestId: c.get('requestId'),
        },
        429,
      );
    }
    await next();
    return undefined;
  };
}
