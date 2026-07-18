import { z } from 'zod';
import { locationSchema } from './search.js';

/**
 * 住所検索（ジオコーディング）契約（FR-001、Issue #16)。
 * 出典は国土地理院 住所検索 API（サーバー側で呼出・許可ホスト固定)。
 * 住所クエリはプライバシー配慮のため監査・構造化ログへ記録しない。
 */

export const GEOCODE_QUERY_MAX_LENGTH = 100;

export const geocodeResultSchema = z.object({
  /** 表示用住所（原典の title をそのまま表示） */
  label: z.string().min(1),
  location: locationSchema,
});
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;

export const geocodeResponseSchema = z.object({
  results: z.array(geocodeResultSchema).max(10),
  /** 出典表示（地理院 API 利用の明示） */
  attribution: z.string(),
});
export type GeocodeResponse = z.infer<typeof geocodeResponseSchema>;
