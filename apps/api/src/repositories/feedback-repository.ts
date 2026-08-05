import { neon } from '@neondatabase/serverless';
import type { FeedbackCategory, FeedbackResponse } from '@pwsm/contracts';

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
const memoryFeedback: FeedbackRecordInput[] = [];

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
    memoryFeedback.unshift(input);
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

/** テスト用: メモリフィードバックストアを初期化する */
export function clearMemoryFeedback(): void {
  memoryFeedback.length = 0;
}
