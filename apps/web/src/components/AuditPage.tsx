import { useCallback, useEffect, useState } from 'react';
import type { AuditEventsResponse } from '@pwsm/contracts';
import { ApiError, fetchAuditEvents } from '../api.js';

const ACTION_LABELS: Record<string, string> = {
  'stakeholder.search': '候補検索',
  'geocode.search': '住所検索',
};

const RESULT_LABELS: Record<string, string> = {
  success: '✅ 成功',
  failure: '❌ 失敗',
  denied: '🚫 拒否',
};

/** 監査ログ閲覧（SCR-09 先行、Issue #17）。非本番のみ・認証導入後に管理者向けへ移行。 */
export function AuditPage() {
  const [data, setData] = useState<AuditEventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAuditEvents(50)
      .then(setData)
      .catch((e: unknown) => {
        setData(null);
        setError(e instanceof ApiError ? e.message : '監査ログの取得に失敗しました。');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="audit-page">
      <div className="results-header">
        <h2>📜 監査ログ</h2>
        <button type="button" onClick={reload} disabled={loading}>
          {loading ? '読込中…' : '🔄 再読込'}
        </button>
      </div>

      <p className="settings-note">
        検索・住所検索の実行記録です。プライバシー保護のため、座標・住所・検索条件の内容は
        記録していません（件数・データ版などのメタ情報のみ）。
        {data?.store === 'memory' && ' 現在は開発モード（メモリ記録・再起動で消去）です。'}
      </p>

      {error !== null && (
        <p className="error" role="alert">
          ❌ {error}
        </p>
      )}

      {data !== null && data.events.length === 0 && <p>記録されたイベントはまだありません。</p>}

      {data !== null && data.events.length > 0 && (
        <div className="audit-table-wrap">
          <table className="audit-table">
            <thead>
              <tr>
                <th>日時</th>
                <th>操作</th>
                <th>結果</th>
                <th>詳細</th>
                <th>相関 ID</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.occurredAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</td>
                  <td>{ACTION_LABELS[event.action] ?? event.action}</td>
                  <td>{RESULT_LABELS[event.result] ?? event.result}</td>
                  <td>
                    {Object.entries(event.metadata)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(' / ')}
                  </td>
                  <td className="audit-correlation">{event.correlationId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
