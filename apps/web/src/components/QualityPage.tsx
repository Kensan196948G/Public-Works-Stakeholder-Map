import { useCallback, useEffect, useState } from 'react';
import type { QualityReport } from '@pwsm/contracts';
import { ApiError, fetchQualityReport } from '../api.js';

/**
 * SCR-08 品質ダッシュボード。欠損・期限超過・出典保有・取込状態・推定境界を可視化する。
 * KPI: 出典保有率 100%・期限超過レコードの識別率 100%（要件 §KPI）。
 */
export function QualityPage() {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchQualityReport()
      .then(setReport)
      .catch((e: unknown) => {
        setReport(null);
        setError(e instanceof ApiError ? e.message : '品質レポートの取得に失敗しました。');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const evidenceTotal =
    report === null ? 0 : report.evidence.withEvidence + report.evidence.missingEvidence;
  const evidenceRate =
    report === null || evidenceTotal === 0
      ? null
      : Math.round((report.evidence.withEvidence / evidenceTotal) * 100);

  return (
    <div className="admin-page">
      <div className="results-header">
        <h2>📊 品質ダッシュボード（SCR-08）</h2>
        <button type="button" onClick={reload} disabled={loading}>
          {loading ? '読込中…' : '🔄 再読込'}
        </button>
      </div>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {report !== null && (
        <>
          <p className="settings-note">
            データ版: {report.datasetVersion} ／ 集計時刻:{' '}
            {new Date(report.generatedAt).toLocaleString('ja-JP')}
          </p>

          <div className="quality-grid">
            <section className="quality-card">
              <h3>🗂️ 情報源</h3>
              <p className="quality-value">{report.sources.active}</p>
              <p>有効ソース（全 {report.sources.total} 件）</p>
              {report.sources.missingLicense > 0 && (
                <p className="quality-warn">⚠️ 利用条件未記録: {report.sources.missingLicense} 件</p>
              )}
            </section>

            <section className="quality-card">
              <h3>🏛️ 公開データ</h3>
              <p className="quality-value">{report.published.organizations}</p>
              <p>公開組織（管轄 {report.published.jurisdictions} 件）</p>
            </section>

            <section className="quality-card">
              <h3>⏱️ 鮮度（TTL）</h3>
              <p className={`quality-value${report.freshness.overdue > 0 ? ' quality-alert' : ''}`}>
                {report.freshness.overdue}
              </p>
              <p>期限超過（期限内 {report.freshness.withinTtl} 件）</p>
              {report.freshness.overdue > 0 && (
                <p className="quality-warn">⚠️ 信頼度 D 相当。再確認が必要です</p>
              )}
            </section>

            <section className="quality-card">
              <h3>📎 出典保有</h3>
              <p className={`quality-value${(evidenceRate ?? 100) < 100 ? ' quality-alert' : ''}`}>
                {evidenceRate === null ? '—' : `${evidenceRate}%`}
              </p>
              <p>
                出典あり {report.evidence.withEvidence} ／ 欠損 {report.evidence.missingEvidence}
              </p>
              <p>KPI: 100%</p>
            </section>

            <section className="quality-card">
              <h3>📐 推定境界</h3>
              <p className="quality-value">{report.estimatedJurisdictions}</p>
              <p>推定フラグ付き管轄（必ず「推定」表示）</p>
            </section>

            <section className="quality-card">
              <h3>📥 取込ステージング</h3>
              <ul className="quality-list">
                <li>⏳ 未着手: {report.imports.pending}</li>
                <li>👀 レビュー中: {report.imports.in_review}</li>
                <li>✅ 承認済み: {report.imports.approved}</li>
                <li>↩️ 差戻し: {report.imports.rejected}</li>
                <li>🚧 隔離: {report.imports.quarantined}</li>
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
