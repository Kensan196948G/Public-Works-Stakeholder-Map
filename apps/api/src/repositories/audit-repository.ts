import { neon } from '@neondatabase/serverless';
import type { AuditEvent } from '@pwsm/contracts';

/**
 * 監査イベント記録・閲覧（§14、Issue #17）。
 * - DB モード: audit.audit_events へ永続記録
 * - fixture モード: インスタンス内メモリ（開発用・再起動で消える）
 * 記録しないもの: 認証情報・住所クエリ・座標・自由記述本文（§12.2）
 */

export interface AuditRecordInput {
  actor: string;
  action: string;
  targetKind: string;
  result: 'success' | 'failure' | 'denied';
  correlationId: string;
  metadata: Record<string, unknown>;
}

const MEMORY_CAP = 200;
const memoryEvents: AuditEvent[] = [];

function toMemoryEvent(input: AuditRecordInput, now: Date): AuditEvent {
  return {
    id: crypto.randomUUID(),
    occurredAt: now.toISOString(),
    actor: input.actor,
    action: input.action,
    targetKind: input.targetKind,
    result: input.result,
    correlationId: input.correlationId,
    metadata: input.metadata,
  };
}

/** 監査イベントを記録する。記録失敗は本処理を止めない（呼び出し側で catch 済み前提で throw する）。 */
export async function recordAuditEvent(
  databaseUrl: string | undefined,
  input: AuditRecordInput,
  now: Date,
): Promise<void> {
  if (databaseUrl === undefined) {
    memoryEvents.unshift(toMemoryEvent(input, now));
    if (memoryEvents.length > MEMORY_CAP) memoryEvents.length = MEMORY_CAP;
    return;
  }
  const sql = neon(databaseUrl);
  await sql`
    INSERT INTO audit.audit_events (occurred_at, actor, action, target_kind, result, correlation_id, metadata)
    VALUES (${now.toISOString()}, ${input.actor}, ${input.action}, ${input.targetKind},
            ${input.result}, ${input.correlationId}, ${JSON.stringify(input.metadata)}::jsonb)
  `;
}

/** 監査イベントを新しい順に取得する。 */
export async function listAuditEvents(
  databaseUrl: string | undefined,
  limit: number,
): Promise<{ events: AuditEvent[]; store: 'db' | 'memory' }> {
  if (databaseUrl === undefined) {
    return { events: memoryEvents.slice(0, limit), store: 'memory' };
  }
  const sql = neon(databaseUrl);
  const rows = (await sql`
    SELECT id, occurred_at, actor, action, target_kind, result, correlation_id, metadata
    FROM audit.audit_events
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `) as {
    id: string;
    occurred_at: string;
    actor: string;
    action: string;
    target_kind: string;
    result: 'success' | 'failure' | 'denied';
    correlation_id: string;
    metadata: Record<string, unknown>;
  }[];
  return {
    events: rows.map((row) => ({
      id: row.id,
      occurredAt: new Date(row.occurred_at).toISOString(),
      actor: row.actor,
      action: row.action,
      targetKind: row.target_kind,
      result: row.result,
      correlationId: row.correlation_id,
      metadata: row.metadata,
    })),
    store: 'db',
  };
}

/** テスト用: メモリ監査ストアを初期化する */
export function clearMemoryAuditEvents(): void {
  memoryEvents.length = 0;
}
