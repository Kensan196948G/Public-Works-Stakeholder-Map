import { useCallback, useEffect, useState } from 'react';
import type { AdminImportsResponse, ImportRecord, ReviewAction, ReviewState } from '@pwsm/contracts';
import { reviewStateSchema } from '@pwsm/contracts';
import { availableReviewActions } from '@pwsm/domain';
import { ApiError, fetchAdminImports, reviewAdminImport } from '../api.js';
import { INDEX_ONLY_NOTICE, previewPayloadJson } from '../licensing.js';

const STATE_LABELS: Record<ReviewState, string> = {
  pending: '⏳ 未着手',
  in_review: '👀 レビュー中',
  approved: '✅ 承認済み',
  rejected: '↩️ 差戻し',
  quarantined: '🚧 隔離',
};

const ACTION_LABELS: Record<ReviewAction, string> = {
  start_review: '👀 レビュー開始',
  approve: '✅ 承認',
  reject: '↩️ 差戻し',
  quarantine: '🚧 隔離',
  reopen: '🔁 再レビュー',
};

/**
 * 取込ペイロードの表示。既定は要約（先頭のみ）で、全文はレビュー担当の明示操作で表示する。
 * 本文複製が禁止されたソース由来の内容が既定で画面へ展開されるのを避けるための制限側の既定値（§9.3）。
 */
function PayloadView({ label, payload }: { label: string; payload: unknown }) {
  const [showFull, setShowFull] = useState(false);
  const preview = previewPayloadJson(payload);
  const full = JSON.stringify(payload, null, 2) ?? '';
  return (
    <div className="payload-view">
      <p>{label}:</p>
      <pre className="payload">{showFull ? full : preview.text}</pre>
      {preview.truncated && (
        <button type="button" onClick={() => setShowFull((prev) => !prev)}>
          {showFull ? '要約表示に戻す' : '⚠️ 全文を表示（複製・転載しないこと）'}
        </button>
      )}
    </div>
  );
}

/**
 * SCR-07 データ編集・レビュー。取込ステージングの確認・承認・差戻し・隔離。
 * 遷移可否は domain の状態機械（availableReviewActions）で判定し、
 * 「スクレイピング結果を無レビューで公開しない」原則（要件 §6.2）を UI からも守る。
 *
 * 取込ペイロードは情報源由来の非構造データであり、本文の複製が禁止されたソース
 * （reference_only）由来の内容を含み得る。台帳の利用条件が UI へ届いていない現状では
 * 制限側を既定とし、既定表示は要約に留めてレビュー担当の明示操作でのみ全文を表示する（§9.3）。
 */
export function ReviewPage() {
  const [data, setData] = useState<AdminImportsResponse | null>(null);
  const [filter, setFilter] = useState<ReviewState | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminImports(filter === 'all' ? undefined : filter)
      .then(setData)
      .catch((e: unknown) => {
        setData(null);
        setError(e instanceof ApiError ? e.message : '取込レコードの取得に失敗しました。');
      })
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleAction(record: ImportRecord, action: ReviewAction) {
    setActing(record.id);
    setActionError(null);
    try {
      const note = notes[record.id]?.trim();
      await reviewAdminImport(record.id, {
        action,
        ...(note === undefined || note === '' ? {} : { note }),
      });
      reload();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : 'レビュー操作に失敗しました。');
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="admin-page">
      <div className="results-header">
        <h2>📝 取込レビュー（SCR-07）</h2>
        <div className="review-toolbar">
          <label>
            状態
            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value === 'all' ? 'all' : reviewStateSchema.parse(e.target.value))
              }
            >
              <option value="all">すべて</option>
              {reviewStateSchema.options.map((state) => (
                <option key={state} value={state}>
                  {STATE_LABELS[state]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={reload} disabled={loading}>
            {loading ? '読込中…' : '🔄 再読込'}
          </button>
        </div>
      </div>

      <p className="settings-note">
        取込データはレビューを通過（承認）するまで公開されません。承認済みレコードの公開反映は
        データ版の切替として別途実施します。
      </p>
      <p className="settings-note">
        ⚠️ {INDEX_ONLY_NOTICE}
        取込データに本文相当の記述が含まれる場合、そのまま公開データへ転記しないでください。
      </p>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {actionError !== null && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}

      {data !== null && data.records.length === 0 && (
        <p className="empty">該当する取込レコードはありません。</p>
      )}

      {data?.records.map((record) => (
        <article key={record.id} className="review-card">
          <header>
            <span className={`state-badge state-${record.reviewState}`}>
              {STATE_LABELS[record.reviewState]}
            </span>
            <strong>{record.entityKind}</strong>
            <span className="review-source">{record.sourceName ?? record.sourceId}</span>
            <time dateTime={record.createdAt}>
              {new Date(record.createdAt).toLocaleString('ja-JP')}
            </time>
          </header>

          {record.qualityFlags.length > 0 && (
            <p className="quality-warn">⚠️ 品質フラグ: {record.qualityFlags.join(', ')}</p>
          )}

          <details>
            <summary>取込データを表示</summary>
            <PayloadView label="取込データ" payload={record.rawPayload} />
            {record.normalizedPayload !== null && (
              <PayloadView label="正規化後" payload={record.normalizedPayload} />
            )}
          </details>

          {record.reviewerNote !== null && (
            <p className="review-note">📝 メモ: {record.reviewerNote}</p>
          )}

          {availableReviewActions(record.reviewState).length > 0 && (
            <div className="review-actions">
              <input
                type="text"
                placeholder="レビューメモ（任意・個人情報は書かない）"
                maxLength={1000}
                value={notes[record.id] ?? ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [record.id]: e.target.value }))}
              />
              {availableReviewActions(record.reviewState).map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => void handleAction(record, action)}
                  disabled={acting === record.id}
                >
                  {ACTION_LABELS[action]}
                </button>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
