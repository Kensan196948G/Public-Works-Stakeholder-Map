import { z } from 'zod';

/**
 * 監査イベント閲覧契約（SCR-09 先行、Issue #17)。
 * 監査ログへ認証トークン・住所クエリ・自由記述本文・座標を記録しない（§12.2 / §14）。
 */

export const auditEventSchema = z.object({
  id: z.string(),
  occurredAt: z.iso.datetime({ offset: true }),
  actor: z.string(),
  action: z.string(),
  targetKind: z.string(),
  result: z.enum(['success', 'failure', 'denied']),
  correlationId: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  /** 改ざん検知用ハッシュ連結（migration 0003）。DB 移行前の行は null */
  prevHash: z.string().nullable(),
  eventHash: z.string().nullable(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditEventsResponseSchema = z.object({
  events: z.array(auditEventSchema).max(200),
  /** 記録先: db（永続） / memory（インスタンス内・開発用） */
  store: z.enum(['db', 'memory']),
});
export type AuditEventsResponse = z.infer<typeof auditEventsResponseSchema>;

/** 監査チェーン検証結果（管理者向け） */
export const auditChainVerificationSchema = z.object({
  store: z.enum(['db', 'memory']),
  checked: z.number().int().nonnegative(),
  valid: z.boolean(),
  /** 不正を検出した最初のイベント ID（valid=false のとき） */
  brokenAtEventId: z.string().nullable(),
  reason: z.string().nullable(),
});
export type AuditChainVerification = z.infer<typeof auditChainVerificationSchema>;
