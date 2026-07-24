import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminSourcesResponse, ImportEntityKind } from '@pwsm/contracts';
import { importEntityKindSchema } from '@pwsm/contracts';
import { ApiError, createAdminImport, fetchAdminSources } from '../api.js';

const AUTHORITY_LABELS: Record<string, string> = {
  primary_official: '公式一次',
  official_catalog: '公式カタログ',
  secondary_open: '二次公開',
};

const ENTITY_KIND_LABELS: Record<ImportEntityKind, string> = {
  organization: '組織',
  office: '窓口',
  jurisdiction: '管轄区域',
  contact_point: '連絡先',
};

const FETCH_RESULT_LABELS: Record<string, string> = {
  success: '✅ 成功',
  failed: '❌ 失敗',
  skipped: '⏭️ スキップ',
};

/**
 * SCR-06 データソース管理。台帳（取得方式・利用条件・最終取得・エラー）と手動取込の登録。
 * 利用条件が未記録のソースはデータ本体を複製せずリンク+索引に限定する（要件 §9.3）。
 */
export function SourcesPage() {
  const [data, setData] = useState<AdminSourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 手動取込フォーム
  const [importSourceId, setImportSourceId] = useState('');
  const [importEntityKind, setImportEntityKind] = useState<ImportEntityKind>('organization');
  const [importPayload, setImportPayload] = useState('{\n  "name": ""\n}');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminSources()
      .then(setData)
      .catch((e: unknown) => {
        setData(null);
        setError(e instanceof ApiError ? e.message : 'データソース台帳の取得に失敗しました。');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleImportSubmit(event: FormEvent) {
    event.preventDefault();
    setImportMessage(null);
    setImportError(null);
    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(importPayload);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('object required');
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      setImportError('取込データは JSON オブジェクトで入力してください。');
      return;
    }
    setImporting(true);
    try {
      const record = await createAdminImport({
        sourceId: importSourceId,
        entityKind: importEntityKind,
        rawPayload: payload,
      });
      setImportMessage(`✅ ステージングへ登録しました（ID: ${record.id}・状態: pending）。レビュー画面で確認してください。`);
    } catch (e) {
      setImportError(e instanceof ApiError ? e.message : '取込の登録に失敗しました。');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="results-header">
        <h2>🗂️ データソース管理（SCR-06）</h2>
        <button type="button" onClick={reload} disabled={loading}>
          {loading ? '読込中…' : '🔄 再読込'}
        </button>
      </div>

      <p className="settings-note">
        公式情報源の台帳です。利用条件が未記録のソースは、データ本体を複製せず公式ページへの
        リンクと最小限の索引情報に限定します（要件 §9.3）。
      </p>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {data !== null && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>名称 / 発行元</th>
                <th>権威性</th>
                <th>取得方式</th>
                <th>TTL</th>
                <th>利用条件</th>
                <th>最終取得</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((source) => (
                <tr key={source.id}>
                  <td>
                    <strong>{source.name}</strong>
                    <br />
                    <a href={source.baseUrl} target="_blank" rel="noreferrer noopener">
                      {source.publisher}
                    </a>
                  </td>
                  <td>{AUTHORITY_LABELS[source.authority] ?? source.authority}</td>
                  <td>{source.fetchMode === 'manual' ? '手動' : '自動'}</td>
                  <td>{source.ttlDays}日</td>
                  <td>
                    {source.licenseText ?? source.licenseUrl ?? (
                      <span className="quality-warn">⚠️ 未記録（リンク+索引限定）</span>
                    )}
                  </td>
                  <td>
                    {source.lastFetchedAt === null
                      ? '—'
                      : new Date(source.lastFetchedAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td>
                    {source.lastFetchResult === null
                      ? '—'
                      : FETCH_RESULT_LABELS[source.lastFetchResult] ?? source.lastFetchResult}
                    {source.lastErrorCode !== null && (
                      <span className="quality-warn"> ({source.lastErrorCode})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data !== null && (
        <details className="import-form">
          <summary>📥 手動取込を登録（ステージングへ pending で追加）</summary>
          <form onSubmit={(e) => void handleImportSubmit(e)} aria-label="手動取込">
            <label>
              データソース
              <select
                value={importSourceId}
                onChange={(e) => setImportSourceId(e.target.value)}
                required
              >
                <option value="" disabled>
                  選択してください
                </option>
                {data.sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              種別
              <select
                value={importEntityKind}
                onChange={(e) => setImportEntityKind(importEntityKindSchema.parse(e.target.value))}
              >
                {importEntityKindSchema.options.map((kind) => (
                  <option key={kind} value={kind}>
                    {ENTITY_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              取込データ（JSON）
              <textarea
                value={importPayload}
                onChange={(e) => setImportPayload(e.target.value)}
                rows={5}
                maxLength={5000}
              />
            </label>
            <button type="submit" disabled={importing || importSourceId === ''}>
              {importing ? '登録中…' : '📥 ステージングへ登録'}
            </button>
            {importMessage !== null && <p className="success">{importMessage}</p>}
            {importError !== null && (
              <p className="error" role="alert">
                {importError}
              </p>
            )}
          </form>
        </details>
      )}
    </div>
  );
}
