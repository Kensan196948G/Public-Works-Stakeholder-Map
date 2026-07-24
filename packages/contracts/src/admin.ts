import { z } from 'zod';
import { sourceAuthoritySchema } from './enums.js';

/**
 * 管理機能契約（SCR-06〜08、Phase 2）。
 * 管理系 API は本番では認証導入まで 403（audit-events と同一の保護方針）。
 * 台帳には利用条件（license）を記録する（要件定義書 §9.3）。
 */

/** 取得方式（DB enum provenance.fetch_mode と一致） */
export const fetchModeSchema = z.enum(['manual', 'automated']);
export type FetchMode = z.infer<typeof fetchModeSchema>;

/** 取込対象のエンティティ種別（staging.import_records.entity_kind） */
export const importEntityKindSchema = z.enum([
  'organization',
  'office',
  'jurisdiction',
  'contact_point',
]);
export type ImportEntityKind = z.infer<typeof importEntityKindSchema>;

/** レビュー状態（DB CHECK 制約と一致。無レビュー公開禁止の状態機械） */
export const reviewStateSchema = z.enum([
  'pending',
  'in_review',
  'approved',
  'rejected',
  'quarantined',
]);
export type ReviewState = z.infer<typeof reviewStateSchema>;

/** SCR-06 データソース管理: 台帳 1 行（取得方式・利用条件・最終取得・エラー） */
export const dataSourceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  publisher: z.string(),
  baseUrl: z.string(),
  authority: sourceAuthoritySchema,
  format: z.string(),
  fetchMode: fetchModeSchema,
  ttlDays: z.number().int().positive(),
  /** 利用条件。不明（null）の場合はデータ本体を複製せずリンク+索引に限定する（§9.3） */
  licenseText: z.string().nullable(),
  licenseUrl: z.string().nullable(),
  active: z.boolean(),
  /** 最終取得（provenance.source_snapshots の最新） */
  lastFetchedAt: z.iso.datetime({ offset: true }).nullable(),
  lastFetchResult: z.enum(['success', 'failed', 'skipped']).nullable(),
  lastErrorCode: z.string().nullable(),
});
export type DataSourceSummary = z.infer<typeof dataSourceSummarySchema>;

export const adminSourcesResponseSchema = z.object({
  sources: z.array(dataSourceSummarySchema).max(500),
});
export type AdminSourcesResponse = z.infer<typeof adminSourcesResponseSchema>;

/** SCR-07 取込レビュー: ステージングレコード */
export const importRecordSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  /** 一覧表示用のソース名（JOIN 済み） */
  sourceName: z.string().nullable(),
  entityKind: importEntityKindSchema,
  rawPayload: z.record(z.string(), z.unknown()),
  normalizedPayload: z.record(z.string(), z.unknown()).nullable(),
  qualityFlags: z.array(z.string()),
  reviewState: reviewStateSchema,
  reviewerNote: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ImportRecord = z.infer<typeof importRecordSchema>;

export const adminImportsResponseSchema = z.object({
  records: z.array(importRecordSchema).max(200),
});
export type AdminImportsResponse = z.infer<typeof adminImportsResponseSchema>;

/** 手動取込の登録（SCR-06 → ステージングへ pending で追加） */
export const createImportRequestSchema = z.object({
  sourceId: z.string().min(1),
  entityKind: importEntityKindSchema,
  rawPayload: z.record(z.string(), z.unknown()),
});
export type CreateImportRequest = z.infer<typeof createImportRequestSchema>;

/** レビュー操作。状態遷移の妥当性は domain（canApplyReviewAction）で検証する */
export const reviewActionSchema = z.enum([
  'start_review',
  'approve',
  'reject',
  'quarantine',
  'reopen',
]);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

export const reviewRequestSchema = z.object({
  action: reviewActionSchema,
  /** 差戻し・隔離の理由等。自由記述だが個人情報を書かない運用とする */
  note: z.string().max(1000).optional(),
});
export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

/** SCR-08 品質ダッシュボード（欠損・期限超過・出典保有・取込状態・種別カバレッジ） */
export const qualityReportSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  datasetVersion: z.string(),
  sources: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    /** 利用条件が未記録のソース数（§9.3: リンク+索引限定の対象） */
    missingLicense: z.number().int().nonnegative(),
  }),
  published: z.object({
    organizations: z.number().int().nonnegative(),
    jurisdictions: z.number().int().nonnegative(),
  }),
  freshness: z.object({
    /** freshness_due_at 超過（信頼度 D 相当）の published 組織数 */
    overdue: z.number().int().nonnegative(),
    withinTtl: z.number().int().nonnegative(),
  }),
  evidence: z.object({
    withEvidence: z.number().int().nonnegative(),
    /** 出典未紐付けの管轄数（KPI: 出典保有率 100% が目標） */
    missingEvidence: z.number().int().nonnegative(),
  }),
  /** 推定境界（estimated=true）の管轄数 */
  estimatedJurisdictions: z.number().int().nonnegative(),
  /** 取込ステージングの状態別件数 */
  imports: z.object({
    pending: z.number().int().nonnegative(),
    in_review: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
  }),
});
export type QualityReport = z.infer<typeof qualityReportSchema>;
