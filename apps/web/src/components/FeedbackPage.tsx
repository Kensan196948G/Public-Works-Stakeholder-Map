import { useState, type FormEvent } from 'react';
import type { FeedbackCategory } from '@pwsm/contracts';
import { feedbackCategorySchema } from '@pwsm/contracts';
import { ApiError, submitFeedback } from '../api.js';

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  incorrect_info: '情報の誤り',
  broken_link: 'リンク切れ',
  missing_org: '機関・窓口の不足',
  ui_issue: '画面の不具合・改善',
  other: 'その他',
};

/** フィードバック送信（FR-017）。個人識別情報は収集しない。 */
export function FeedbackPage() {
  const [category, setCategory] = useState<FeedbackCategory>('incorrect_info');
  const [message, setMessage] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessageError(null);
    setResult(null);
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      setMessageError('報告内容は10文字以上で入力してください。');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitFeedback({
        category,
        message: trimmed,
        ...(sourceUrl.trim() === '' ? {} : { sourceUrl: sourceUrl.trim() }),
      });
      setResult(
        `✅ 受け付けました（受付番号: ${res.reference}）。ご協力ありがとうございます。`,
      );
      setMessage('');
      setSourceUrl('');
    } catch (e) {
      setMessageError(e instanceof ApiError ? e.message : '送信に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="results-header">
        <h2>💬 フィードバック（FR-017）</h2>
      </div>
      <p className="settings-note">
        候補・窓口情報の誤り、リンク切れ、不足している機関などを報告できます。
        氏名・メールアドレス等の個人情報は収集しません。報告内容は品質改善にのみ使用します。
      </p>

      <form className="feedback-form" onSubmit={(e) => void handleSubmit(e)} aria-label="フィードバック">
        <label>
          種別
          <select value={category} onChange={(e) => setCategory(feedbackCategorySchema.parse(e.target.value))}>
            {feedbackCategorySchema.options.map((option) => (
              <option key={option} value={option}>
                {CATEGORY_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label>
          報告内容（10文字以上・個人情報を含めないでください）
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={2000}
            required
          />
        </label>
        <label>
          対象の公式 URL（任意）
          <input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            maxLength={500}
            placeholder="https://example.go.jp/…"
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? '送信中…' : '送信'}
        </button>
        {messageError !== null && (
          <p className="error" role="alert">
            {messageError}
          </p>
        )}
        {result !== null && <p className="success">{result}</p>}
      </form>
    </div>
  );
}
