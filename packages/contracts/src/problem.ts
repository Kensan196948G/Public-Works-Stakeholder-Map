import { z } from 'zod';

/**
 * RFC 9457 Problem Details 互換のエラー契約（詳細設計仕様書 §6.6）。
 * detail は利用者向け日本語、code は機械可読の安定識別子。
 */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  code: z.string(),
  detail: z.string(),
  requestId: z.string(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const ERROR_CODES = {
  INVALID_BODY: 'INVALID_BODY',
  INVALID_COORDINATE: 'INVALID_COORDINATE',
  INVALID_RADIUS: 'INVALID_RADIUS',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
