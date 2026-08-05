import { z } from 'zod';

/**
 * フィードバック契約（FR-017、要件 §5.1）。
 * 誤り・不足・リンク切れを出典付きで報告できる。
 * 個人識別情報（氏名・メール・電話）は収集しない（要件 §3 / §8 プライバシー最小化）。
 */

/** フィードバック種別 */
export const feedbackCategorySchema = z.enum([
  'incorrect_info',
  'broken_link',
  'missing_org',
  'ui_issue',
  'other',
]);
export type FeedbackCategory = z.infer<typeof feedbackCategorySchema>;

export const FEEDBACK_MESSAGE_MIN_LENGTH = 10;
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

/** フィードバック送信リクエスト。message は必須・sourceUrl は任意（公式ページの指定） */
export const feedbackRequestSchema = z.object({
  category: feedbackCategorySchema,
  message: z
    .string()
    .min(FEEDBACK_MESSAGE_MIN_LENGTH)
    .max(FEEDBACK_MESSAGE_MAX_LENGTH),
  /** 報告対象の公式 URL（任意）。本文へ個人情報を含めない運用とする */
  sourceUrl: z.url().max(500).optional(),
  /** 報告時点のデータ版。未送信時はサーバー側で現在版を補完する */
  datasetVersion: z.string().max(100).optional(),
});
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

/** フィードバック受付応答（202 Accepted）。詳細な対応状況は本バージョンでは返さない */
export const feedbackResponseSchema = z.object({
  id: z.string(),
  status: z.literal('received'),
  receivedAt: z.iso.datetime({ offset: true }),
  /** 受付番号を表示し、問い合わせ時のキーにする */
  reference: z.string(),
});
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;
