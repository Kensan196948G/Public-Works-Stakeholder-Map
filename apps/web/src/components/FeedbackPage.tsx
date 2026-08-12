import { useState, type FormEvent } from 'react';
import type { AdminFeedbackItem, FeedbackCategory } from '@pwsm/contracts';
import { feedbackCategorySchema } from '@pwsm/contracts';
import {
  ApiError,
  fetchAdminFeedback,
  submitFeedback,
  updateAdminFeedbackStatus,
} from '../api.js';

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  incorrect_info: '情報の誤り',
  broken_link: 'リンク切れ',
  missing_org: '機関・窓口の不足',
  ui_issue: '画面の不具合・改善',
  other: 'その他',
};

const STATUS_LABELS: Record<AdminFeedbackItem['status'], string> = {
  new: '📥 新着',
  reviewed: '👀 対応中',
  resolved: '✅ 解決済み',
};

/** フィードバック送信（FR-017）。個人識別情報は収集しない。 */
export function FeedbackPage() {
  const [category, setCategory] = useState<FeedbackCategory>('incorrect_info');
  const [message, setMessage] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // 管理者向け一覧（本番で admin 以外は 403。エラーは案内として表示する）
  const [adminItems, setAdminItems] = useState<AdminFeedbackItem[] | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  async function loadAdminList() {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const res = await fetchAdminFeedback(50);
      setAdminItems(res.items);
    } catch (e) {
      setAdminError(
        e instanceof ApiError
          ? `${e.message}（管理者のみ閲覧できます）`
          : 'フィードバック一覧の取得に失敗しました（管理者のみ閲覧できます）',
      );
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleStatusChange(
    item: AdminFeedbackItem,
    status: AdminFeedbackItem['status'],
  ) {
    setAdminLoading(true);
    setAdminError(null);
    try {
      await updateAdminFeedbackStatus(item.id, status);
      await loadAdminList();
    } catch (e) {
      setAdminError(
        e instanceof ApiError ? e.message : 'フィードバック状態の更新に失敗しました。',
      );
    } finally {
      setAdminLoading(false);
    }
  }

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

      <details className="import-form" onToggle={(e) => {
        if (e.currentTarget.open && adminItems === null && adminError === null) {
          void loadAdminList();
        }
      }}>
        <summary>📋 管理者向け: 受付一覧（FR-017 対応）</summary>
        <p className="settings-note">
          フィードバック本文は管理者のみ閲覧できます。受付後は原典確認・リンク修正などの対応へ
          つなげ、必要に応じて本台帳で管理してください。
        </p>
        {adminLoading && <p>読込中…</p>}
        {adminError !== null && <p className="error">{adminError}</p>}
        {adminItems !== null && adminItems.length === 0 && (
          <p className="empty">受付済みのフィードバックはありません。</p>
        )}
        {adminItems !== null && adminItems.length > 0 && (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>受付日時</th>
                  <th>種別</th>
                  <th>状態</th>
                  <th>内容</th>
                  <th>対象 URL</th>
                  <th>データ版</th>
                </tr>
              </thead>
              <tbody>
                {adminItems.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.createdAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td>
                    <td>{CATEGORY_LABELS[item.category] ?? item.category}</td>
                    <td>
                      <span className={`state-badge state-fb-${item.status}`}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      <div className="review-actions">
                        {(Object.keys(STATUS_LABELS) as AdminFeedbackItem['status'][]).map(
                          (status) => (
                            <button
                              key={status}
                              type="button"
                              className={item.status === status ? 'decision-active' : ''}
                              disabled={adminLoading || item.status === status}
                              onClick={() => void handleStatusChange(item, status)}
                            >
                              {STATUS_LABELS[status]}
                            </button>
                          ),
                        )}
                      </div>
                    </td>
                    <td>{item.message}</td>
                    <td>
                      {item.sourceUrl === null ? '—' : (
                        <a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">
                          {item.sourceUrl}
                        </a>
                      )}
                    </td>
                    <td>{item.datasetVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}
