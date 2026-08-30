import { getSql, jsonParam } from './sql-client.js';
import type { AuditEvent, AuditChainVerification } from '@pwsm/contracts';

/**
 * 監査イベント記録・閲覧・改ざん検知（§14・migration 0003）。
 * - DB モード: audit.audit_events へ SHA-256 連結チェーン付きで永続記録
 * - fixture モード: インスタンス内メモリ（開発用・再起動で消える）
 * 記録しないもの: 認証情報・住所クエリ・座標・自由記述本文（§12.2）
 */

export interface AuditRecordInput {
  actor: string;
  action: string;
  targetKind: string;
  targetId?: string;
  result: 'success' | 'failure' | 'denied';
  correlationId: string;
  metadata: Record<string, unknown>;
}

/** migration 0003 と同一の genesis 値（'pwsm-audit-genesis-v1' の SHA-256） */
export const AUDIT_GENESIS_HASH =
  'dc1ed66a70e5681a667ebf24e759e7e59063a571136064337de98bb057524fc6';

const MEMORY_CAP = 200;

interface MemoryAuditEvent extends AuditEvent {
  prevHash: string;
  eventHash: string;
}

const memoryEvents: MemoryAuditEvent[] = [];

/**
 * jsonb::text（PostgreSQL）と一致する正準 JSON を生成する。
 * - オブジェクトのキーは辞書順・空白なし・配列順序保持
 * - 文字列は JSON エスケープ（日本語は UTF-8 のまま）
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 を 16 進文字列で返す（WebCrypto・Workers 互換） */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** ハッシュ入力の正準連結（migration 0003 の SQL と同一規則） */
function hashPayload(
  prevHash: string,
  input: Pick<AuditRecordInput, 'actor' | 'action' | 'targetKind' | 'targetId' | 'result' | 'correlationId' | 'metadata'>,
  occurredAt: Date | string,
): string {
  const occurred = occurredAt instanceof Date ? occurredAt.toISOString() : occurredAt;
  return (
    prevHash +
    occurred +
    input.actor +
    input.action +
    input.targetKind +
    (input.targetId ?? '') +
    input.result +
    input.correlationId +
    canonicalJson(input.metadata)
  );
}

function toMemoryEvent(input: AuditRecordInput, now: Date, prevHash: string, eventHash: string): MemoryAuditEvent {
  return {
    id: crypto.randomUUID(),
    occurredAt: now.toISOString(),
    actor: input.actor,
    action: input.action,
    targetKind: input.targetKind,
    result: input.result,
    correlationId: input.correlationId,
    metadata: input.metadata,
    prevHash,
    eventHash,
  };
}

/** 監査イベントを記録する。記録失敗は本処理を止めない（呼び出し側で catch 済み前提で throw する）。 */
export async function recordAuditEvent(
  databaseUrl: string | undefined,
  input: AuditRecordInput,
  now: Date,
): Promise<void> {
  if (databaseUrl === undefined) {
    const prevHash = memoryEvents[0]?.eventHash ?? AUDIT_GENESIS_HASH;
    const eventHash = await sha256Hex(hashPayload(prevHash, input, now));
    memoryEvents.unshift(toMemoryEvent(input, now, prevHash, eventHash));
    if (memoryEvents.length > MEMORY_CAP) memoryEvents.length = MEMORY_CAP;
    return;
  }
  const sql = getSql(databaseUrl);
  // 連結チェーンは直近イベントの event_hash を prev とする。
  // 同時実行で分岐する可能性は低頻度運用のため許容し、検証 API で検出する。
  const last = (await sql`
    SELECT event_hash FROM audit.audit_events
    ORDER BY occurred_at DESC, id DESC
    LIMIT 1
  `) as { event_hash: string | null }[];
  const prevHash = last[0]?.event_hash ?? AUDIT_GENESIS_HASH;
  const eventHash = await sha256Hex(hashPayload(prevHash, input, now));
  await sql`
    INSERT INTO audit.audit_events
      (occurred_at, actor, action, target_kind, target_id, result, correlation_id, metadata, prev_hash, event_hash)
    VALUES (${now.toISOString()}, ${input.actor}, ${input.action}, ${input.targetKind},
            ${input.targetId ?? null}, ${input.result}, ${input.correlationId},
            ${jsonParam(sql, input.metadata)}, ${prevHash}, ${eventHash})
  `;
}

/** 監査イベントを新しい順に取得する。 */
export async function listAuditEvents(
  databaseUrl: string | undefined,
  limit: number,
): Promise<{ events: AuditEvent[]; store: 'db' | 'memory' }> {
  if (databaseUrl === undefined) {
    return {
      events: memoryEvents.slice(0, limit).map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt,
        actor: event.actor,
        action: event.action,
        targetKind: event.targetKind,
        result: event.result,
        correlationId: event.correlationId,
        metadata: event.metadata,
        prevHash: event.prevHash,
        eventHash: event.eventHash,
      })),
      store: 'memory',
    };
  }
  const sql = getSql(databaseUrl);
  const rows = (await sql`
    SELECT id, occurred_at, actor, action, target_kind, result, correlation_id, metadata,
           prev_hash, event_hash
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
    prev_hash: string | null;
    event_hash: string | null;
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
      prevHash: row.prev_hash,
      eventHash: row.event_hash,
    })),
    store: 'db',
  };
}

/**
 * 監査チェーンを先頭から検証する（migration 0003 適用後の行のみ検証対象）。
 * event_hash が null の行（移行前）はスキップせず invalid 扱いにする（要再バックフィル）。
 */
export async function verifyAuditChain(
  databaseUrl: string | undefined,
): Promise<AuditChainVerification> {
  if (databaseUrl === undefined) {
    let prev = AUDIT_GENESIS_HASH;
    const ordered = [...memoryEvents].reverse();
    for (const event of ordered) {
      const expected = await sha256Hex(hashPayload(prev, event, event.occurredAt));
      if (event.prevHash !== prev || event.eventHash !== expected) {
        return {
          store: 'memory',
          checked: ordered.indexOf(event) + 1,
          valid: false,
          brokenAtEventId: event.id,
          reason: 'event_hash の連結が不正です',
        };
      }
      prev = event.eventHash;
    }
    return { store: 'memory', checked: ordered.length, valid: true, brokenAtEventId: null, reason: null };
  }

  const sql = getSql(databaseUrl);
  const rows = (await sql`
    SELECT id, occurred_at, actor, action, target_kind, COALESCE(target_id, '') AS target_id,
           result, correlation_id, metadata, prev_hash, event_hash
    FROM audit.audit_events
    ORDER BY occurred_at, id
  `) as {
    id: string;
    occurred_at: string;
    actor: string;
    action: string;
    target_kind: string;
    target_id: string;
    result: 'success' | 'failure' | 'denied';
    correlation_id: string;
    metadata: Record<string, unknown>;
    prev_hash: string | null;
    event_hash: string | null;
  }[];

  let prev = AUDIT_GENESIS_HASH;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row === undefined) break;
    if (row.prev_hash === null || row.event_hash === null) {
      return {
        store: 'db',
        checked: index + 1,
        valid: false,
        brokenAtEventId: row.id,
        reason: 'ハッシュ未設定の行があります（migration 0003 のバックフィルを確認）',
      };
    }
    const expected = await sha256Hex(
      hashPayload(
        prev,
        {
          actor: row.actor,
          action: row.action,
          targetKind: row.target_kind,
          targetId: row.target_id,
          result: row.result,
          correlationId: row.correlation_id,
          metadata: row.metadata,
        },
        new Date(row.occurred_at),
      ),
    );
    if (row.prev_hash !== prev || row.event_hash !== expected) {
      return {
        store: 'db',
        checked: index + 1,
        valid: false,
        brokenAtEventId: row.id,
        reason: 'event_hash の連結が不正です（改ざんまたはバックフィル不整合）',
      };
    }
    prev = row.event_hash;
  }
  return { store: 'db', checked: rows.length, valid: true, brokenAtEventId: null, reason: null };
}

/** テスト用: メモリ監査ストアを初期化する */
export function clearMemoryAuditEvents(): void {
  memoryEvents.length = 0;
}

/** テスト専用: メモリ監査ストアの内部配列を返す（検証テストで改ざんを再現するため） */
export function __internalMemoryAuditEventsForTest(): MemoryAuditEvent[] {
  return memoryEvents;
}
