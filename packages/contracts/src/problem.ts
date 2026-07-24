import { z } from 'zod';

/**
 * RFC 9457 Problem Details 互換のエラー契約（詳細設計仕様書 §6.6）。
 * detail は利用者向け日本語、code は機械可読の安定識別子。
 */

/** 機械可読エラーコード。未定義コードを実行時検証で拒否する */
export const errorCodeSchema = z.enum([
  'INVALID_BODY',
  'INVALID_COORDINATE',
  'INVALID_RADIUS',
  'INVALID_QUERY',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UPSTREAM_ERROR',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const ERROR_CODES = Object.fromEntries(
  errorCodeSchema.options.map((code) => [code, code]),
) as { readonly [Code in ErrorCode]: Code };

export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: errorCodeSchema,
  detail: z.string(),
  requestId: z.string(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
