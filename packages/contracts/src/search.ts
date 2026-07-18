import { z } from 'zod';
import {
  assetTypeSchema,
  boundaryPrecisionSchema,
  confidenceGradeSchema,
  impactTypeSchema,
  organizationTypeSchema,
  searchPurposeSchema,
  sourceAuthoritySchema,
  verificationStateSchema,
  workTypeSchema,
} from './enums.js';

/**
 * 検索 API 契約（詳細設計仕様書 §6.4 / §6.5 / §7.2）。
 * 座標は EPSG:4326、経度 lon・緯度 lat。検索半径は 0〜5,000m に制限する。
 */

export const MAX_RADIUS_METERS = 5000;

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type Location = z.infer<typeof locationSchema>;

export const searchRequestSchema = z.object({
  location: locationSchema,
  radiusMeters: z.number().int().min(0).max(MAX_RADIUS_METERS).default(0),
  workTypes: z.array(workTypeSchema).max(20).default([]),
  assetTypes: z.array(assetTypeSchema).max(10).default([]),
  impactTypes: z.array(impactTypeSchema).max(10).default([]),
  purpose: searchPurposeSchema.optional(),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

/** 候補の根拠。出典 URL と取得メタデータを必ず持つ（設計原則 2「根拠を先にする」） */
export const evidenceSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
  authority: sourceAuthoritySchema.optional(),
  sourceCheckedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/** 信頼度スコアの内訳。説明可能な加減点方式（§7.3）で ML を使わない */
export const confidenceBreakdownSchema = z.object({
  authority: z.number(),
  freshness: z.number(),
  boundaryPrecision: z.number(),
  reviewState: z.number(),
  conflictingSourcesPenalty: z.number(),
  linkFailurePenalty: z.number(),
  total: z.number(),
});
export type ConfidenceBreakdown = z.infer<typeof confidenceBreakdownSchema>;

export const candidateSchema = z
  .object({
    organizationId: z.string(),
    name: z.string(),
    type: organizationTypeSchema,
    officeName: z.string().nullable(),
    confidence: confidenceGradeSchema,
    confidenceBreakdown: confidenceBreakdownSchema,
    verificationState: verificationStateSchema,
    /** 候補になった理由。利用者への説明責任を果たす必須項目 */
    reasons: z.array(z.string().min(1)).min(1),
    precision: boundaryPrecisionSchema,
    estimated: z.boolean(),
    sourceCheckedAt: z.iso.datetime({ offset: true }).nullable(),
    freshnessDueAt: z.iso.datetime({ offset: true }).nullable(),
    evidence: z.array(evidenceSchema).min(1),
  })
  // §5.3: 推定区域を official 精度として表示できない
  .refine((c) => !(c.estimated && c.precision === 'official'), {
    message: 'estimated=true の候補は precision を official にできません',
    path: ['precision'],
  });
export type Candidate = z.infer<typeof candidateSchema>;

/** 全出力経路（画面・CSV・印刷）で表示する必須免責文（要件 §9.1） */
export const REQUIRED_DISCLAIMER =
  '本サービスは公開情報に基づく初期調査支援です。表示内容は正式な所管、許認可の要否、申請先、必要手続を保証しません。' +
  '必ずリンク先の公式情報を確認し、該当機関へ照会してください。緊急連絡には使用しないでください。';

export const searchResponseSchema = z.object({
  queryId: z.string(),
  datasetVersion: z.string(),
  ruleVersion: z.number().int(),
  /** 非断定・原典確認必須の免責は常に true（要件 FR-007） */
  disclaimerRequired: z.literal(true),
  /** 免責文は必須文言そのものであることを契約で強制する */
  disclaimer: z.literal(REQUIRED_DISCLAIMER),
  candidates: z.array(candidateSchema),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
