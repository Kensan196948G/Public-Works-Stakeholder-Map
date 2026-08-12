import { neon } from '@neondatabase/serverless';
import type {
  AdminFeedbackItem,
  FeedbackCategory,
  FeedbackResponse,
} from '@pwsm/contracts';

/**
 * フィードバック受付（FR-017）。
 * - DB モード: workflow.feedback_messages へ永続記録
 * - fixture モード: インスタンス内メモリ（開発用・再起動で消える）
 * 監査・ログへは本文を記録しない（§12.2: 自由記述本文を監査ログへ残さない）。
 */

export interface FeedbackRecordInput {
  category: FeedbackCategory;
  message: string;
  sourceUrl: string | null;
  datasetVersion: string;
}

const MEMORY_CAP = 100;
interface MemoryFeedbackRecord extends FeedbackRecordInput {
  id: string;
  createdAt: string;
  status: AdminFeedbackItem['status'];
}
const memoryFeedback: MemoryFeedbackRecord[] = [];

/** 受付番号。利用者への表示・問い合わせキーとして使う（ID 自体は内部 ID） */
function makeReference(id: string): string {
  return `FB-${id.slice(0, 8).toUpperCase()}`;
}

function toResponse(id: string, now: Date): FeedbackResponse {
  return {
    id,
    status: 'received',
    receivedAt: now.toISOString(),
    reference: makeReference(id),
  };
}

/** フィードバックを記録する。記録失敗は呼び出し側で 500 に変換される。 */
export async function recordFeedback(
  databaseUrl: string | undefined,
  input: FeedbackRecordInput,
  now: Date,
): Promise<FeedbackResponse> {
  const id = crypto.randomUUID();
  if (databaseUrl === undefined) {
    memoryFeedback.unshift({ ...input, id, createdAt: now.toISOString(), status: 'new' });
    if (memoryFeedback.length > MEMORY_CAP) memoryFeedback.length = MEMORY_CAP;
    return toResponse(id, now);
  }
  const sql = neon(databaseUrl);
  await sql`
    INSERT INTO workflow.feedback_messages
      (id, category, message, source_url, dataset_version)
    VALUES (${id}, ${input.category}, ${input.message}, ${input.sourceUrl}, ${input.datasetVersion})
  `;
  return toResponse(id, now);
}

/** フィードバック一覧（管理者向け）。新しい順。 */
export async function listFeedbackMessages(
  databaseUrl: string | undefined,
  limit: number,
): Promise<{ items: AdminFeedbackItem[]; store: 'db' | 'memory' }> {
  if (databaseUrl === undefined) {
    return {
      items: memoryFeedback.slice(0, limit).map((record) => ({
        id: record.id,
        category: record.category,
        status: record.status,
        message: record.message,
        sourceUrl: record.sourceUrl,
        datasetVersion: record.datasetVersion,
        createdAt: record.createdAt,
      })),
      store: 'memory',
    };
  }
  const sql = neon(databaseUrl);
  const rows = (await sql`
    SELECT id, category, status, message, source_url, dataset_version, created_at
    FROM workflow.feedback_messages
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as {
    id: string;
    category: AdminFeedbackItem['category'];
    status: AdminFeedbackItem['status'];
    message: string;
    source_url: string | null;
    dataset_version: string;
    created_at: string;
  }[];
  return {
    items: rows.map((row) => ({
      id: row.id,
      category: row.category,
      status: row.status,
      message: row.message,
      sourceUrl: row.source_url,
      datasetVersion: row.dataset_version,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    store: 'db',
  };
}

/** フィードバック対応状態を更新する。対象なしは null。 */
export async function updateFeedbackStatus(
  databaseUrl: string | undefined,
  id: string,
  status: AdminFeedbackItem['status'],
): Promise<AdminFeedbackItem | null> {
  if (databaseUrl === undefined) {
    const record = memoryFeedback.find((r) => r.id === id);
    if (record === undefined) return null;
    record.status = status;
    return {
      id: record.id,
      category: record.category,
      status: record.status,
      message: record.message,
      sourceUrl: record.sourceUrl,
      datasetVersion: record.datasetVersion,
      createdAt: record.createdAt,
    };
  }
  const sql = neon(databaseUrl);
  const updated = (await sql`
    UPDATE workflow.feedback_messages
    SET status = ${status}
    WHERE id = ${id}
    RETURNING id, category, status, message, source_url, dataset_version, created_at
  `) as {
    id: string;
    category: AdminFeedbackItem['category'];
    status: AdminFeedbackItem['status'];
    message: string;
    source_url: string | null;
    dataset_version: string;
    created_at: string;
  }[];
  const row = updated[0];
  if (row === undefined) return null;
  return {
    id: row.id,
    category: row.category,
    status: row.status,
    message: row.message,
    sourceUrl: row.source_url,
    datasetVersion: row.dataset_version,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** テスト用: メモリフィードバックストアを初期化する */
export function clearMemoryFeedback(): void {
  memoryFeedback.length = 0;
}
