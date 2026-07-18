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
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditEventsResponseSchema = z.object({
  events: z.array(auditEventSchema).max(200),
  /** 記録先: db（永続） / memory（インスタンス内・開発用） */
  store: z.enum(['db', 'memory']),
});
export type AuditEventsResponse = z.infer<typeof auditEventsResponseSchema>;
