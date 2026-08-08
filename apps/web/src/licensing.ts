import { candidateSchema } from '@pwsm/contracts';

/**
 * 表示コンプライアンス（要件 §9.3 / 決裁 Issue #28）。
 *
 * 情報源の利用条件は二分される。
 * - standard_terms: 政府標準利用規約 2.0 準拠。出典明示のうえ本文利用可
 * - reference_only: 著作権法の通常保護。本文の複製・転載は禁止。
 *   リンクと索引（機関名・窓口名・公式 URL 等の事実情報）に限定する
 *
 * UI は利用条件を判別できない場合を含め、**常に制限側（reference_only 相当）** で描画する。
 * これは「本文を出さない努力」ではなくデータ境界の形状で担保する方針であり、
 * 本モジュールはその不変条件を明文化し、回帰テストから検証可能にする。
 */

/**
 * 候補表示で描画してよいフィールド（契約 candidateSchema の許可キー集合）。
 *
 * 契約に本文相当のフィールド（説明文・抜粋・全文など）が追加されると
 * この集合との差分が生じ、licensing のテストが失敗する。
 * 追加が必要な場合は §9.3 の観点で描画可否を判断してから本集合を更新すること。
 */
export const INDEX_SAFE_CANDIDATE_KEYS: readonly string[] = [
  'organizationId',
  'name',
  'type',
  'officeName',
  'confidence',
  'confidenceBreakdown',
  'verificationState',
  'reasons',
  'precision',
  'estimated',
  'sourceCheckedAt',
  'freshnessDueAt',
  'evidence',
];

/** 契約が現在公開しているキー集合（実行時に契約から取得する） */
export function contractCandidateKeys(): readonly string[] {
  return Object.keys(candidateSchema.shape);
}

/**
 * 索引情報として許容しないフィールドを検出する。
 * 契約由来のキーは api.ts の zod parse で strip されるため通常は空配列になる。
 * 空でない場合は本文流入の疑いがあり、描画してはならない。
 */
export function findNonIndexCandidateKeys(candidate: object): string[] {
  return Object.keys(candidate).filter((key) => !INDEX_SAFE_CANDIDATE_KEYS.includes(key));
}

/**
 * 索引情報として許容する最大文字数。
 * 公式ページのタイトルは日本語 60 字程度に収まる。これを大きく超える文字列は
 * 索引ではなく本文相当とみなし、丸めたうえで原典リンクへ誘導する。
 */
export const INDEX_TEXT_MAX_LENGTH = 120;

/**
 * 情報源由来のテキストを索引の範囲へ丸める（reference_only の既定動作）。
 * 改行・連続空白を 1 個の空白へ畳むため、本文の貼り付けは単一行の短縮表記になる。
 */
export function toIndexText(text: string, maxLength: number = INDEX_TEXT_MAX_LENGTH): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

/** 画面共通の表示制約の説明（SCR-06 / SCR-07） */
export const INDEX_ONLY_NOTICE =
  '情報源の利用条件は「出典明示のうえ本文利用可」と「本文の複製・転載不可（リンク+索引限定）」に' +
  '二分されます。利用条件が未記録・未確定のソースは制限側として扱い、本文を複製せず' +
  '公式ページへのリンクと機関名・窓口名等の事実情報に限定します（要件 §9.3）。';

/**
 * SCR-07 取込レビューで既定表示する JSON の最大文字数。
 * レビューには原データの確認が必要なため全文表示は残すが、既定は要約に留める。
 */
export const PAYLOAD_PREVIEW_MAX_LENGTH = 600;

export interface PayloadPreview {
  text: string;
  truncated: boolean;
}

/**
 * 取込ペイロードを既定表示用に丸める。
 * 取込元が本文複製不可のソースである可能性があるため、既定は要約表示とし、
 * レビュー担当が明示操作した場合のみ全文を表示する。
 */
export function previewPayloadJson(
  payload: unknown,
  maxLength: number = PAYLOAD_PREVIEW_MAX_LENGTH,
): PayloadPreview {
  const full = JSON.stringify(payload, null, 2) ?? '';
  if (full.length <= maxLength) return { text: full, truncated: false };
  return { text: `${full.slice(0, maxLength)}\n…`, truncated: true };
}
