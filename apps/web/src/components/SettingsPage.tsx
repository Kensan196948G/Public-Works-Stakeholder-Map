import { useEffect, useState } from 'react';
import type { MetadataResponse } from '@pwsm/contracts';
import { ApiError, fetchMetadata } from '../api.js';
import { CHECKLIST_STORAGE_KEY, getChecklistStorage } from '../checklist.js';
import { saveSettings, type AppSettings } from '../settings.js';

interface SettingsPageProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onChecklistCleared: () => void;
}

/** システム設定（Issue #17）。設定はブラウザ内のみで保持する。 */
export function SettingsPage({ settings, onSettingsChange, onChecklistCleared }: SettingsPageProps) {
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [radiusText, setRadiusText] = useState(String(settings.defaultRadiusMeters));
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    fetchMetadata()
      .then(setMetadata)
      .catch((e: unknown) =>
        setMetadataError(e instanceof ApiError ? e.message : 'メタデータの取得に失敗しました。'),
      );
  }, []);

  function handleSaveRadius() {
    const radius = Number(radiusText);
    if (!Number.isInteger(radius) || radius < 0 || radius > 5000) {
      setSavedNote('⚠️ 検索半径は 0〜5000 の整数で指定してください');
      return;
    }
    const next: AppSettings = { defaultRadiusMeters: radius };
    saveSettings(next);
    onSettingsChange(next);
    setSavedNote('✅ 保存しました（次回の検索フォームから適用されます）');
  }

  function handleClearChecklist() {
    if (!window.confirm('チェックリスト（判断・メモ）をすべて削除します。よろしいですか？')) return;
    getChecklistStorage().removeItem(CHECKLIST_STORAGE_KEY);
    onChecklistCleared();
    setSavedNote('✅ チェックリストを削除しました');
  }

  return (
    <div className="settings-page">
      <h2>⚙️ システム設定</h2>

      <section className="settings-section">
        <h3>📊 データ・環境情報</h3>
        {metadataError !== null && <p className="error">❌ {metadataError}</p>}
        {metadata !== null && (
          <dl>
            <dt>データ版</dt>
            <dd>{metadata.datasetVersion}</dd>
            <dt>ルール版</dt>
            <dd>{metadata.ruleVersion}</dd>
            <dt>実行環境</dt>
            <dd>{metadata.appEnv}</dd>
            <dt>最終公開日時</dt>
            <dd>{metadata.lastPublishedAt ?? '未公開（検証データ）'}</dd>
          </dl>
        )}
      </section>

      <section className="settings-section">
        <h3>🔎 検索の既定値</h3>
        <label>
          既定検索半径（m、0〜5000）
          <input
            type="number"
            min="0"
            max="5000"
            value={radiusText}
            onChange={(e) => setRadiusText(e.target.value)}
          />
        </label>
        <button type="button" onClick={handleSaveRadius}>
          保存
        </button>
      </section>

      <section className="settings-section">
        <h3>🗑️ データ管理</h3>
        <p className="settings-note">
          チェックリスト（候補の判断・メモ）はこのブラウザ内にのみ保存され、7 日で自動失効します。
        </p>
        <button type="button" onClick={handleClearChecklist}>
          チェックリストを全消去
        </button>
      </section>

      <section className="settings-section">
        <h3>⚠️ 免責表示について</h3>
        <p className="settings-note">
          免責（正式な所管・許認可の非保証、原典確認の必要性、緊急連絡不可）の表示は本サービスの
          前提条件のため、設定で非表示にすることはできません。
        </p>
      </section>

      {savedNote !== null && <p aria-live="polite">{savedNote}</p>}
    </div>
  );
}
