import { lazy, Suspense, useEffect, useState } from 'react';
import type { SearchRequest, SearchResponse } from '@pwsm/contracts';
import { ApiError, searchStakeholders } from './api.js';
import {
  getChecklistStorage,
  loadChecklist,
  saveChecklist,
  updateEntry,
  type ChecklistEntries,
  type DecisionState,
} from './checklist.js';
import { buildCandidatesCsv, downloadCsv } from './csv.js';
import { CandidateCard } from './components/CandidateCard.js';
import { DisclaimerBanner } from './components/DisclaimerBanner.js';
import { SearchForm } from './components/SearchForm.js';

// 地図（WebGL）は遅延読込し、初期表示と非対応環境への影響を抑える
const MapPicker = lazy(() =>
  import('./components/MapPicker.js').then((m) => ({ default: m.MapPicker })),
);

export function App() {
  const [lat, setLat] = useState('35.05');
  const [lon, setLon] = useState('139.05');
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  // チェックリストは local storage で 7 日間保持する（FR-009 / §10）。
  // lazy initializer で保存済みデータを先に読み込み、初期値 {} による上書きを防ぐ
  const [checklist, setChecklist] = useState<ChecklistEntries>(() =>
    loadChecklist(getChecklistStorage(), new Date()),
  );
  useEffect(() => {
    saveChecklist(getChecklistStorage(), checklist, new Date());
  }, [checklist]);

  async function handleSearch(request: SearchRequest) {
    setSearching(true);
    setError(null);
    try {
      setResponse(await searchStakeholders(request));
    } catch (e) {
      setResponse(null);
      setError(e instanceof ApiError ? e.message : '検索に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSearching(false);
    }
  }

  function handleDecisionChange(
    organizationId: string,
    patch: { state?: DecisionState | null; note?: string },
  ) {
    setChecklist((current) => updateEntry(current, organizationId, patch, new Date()));
  }

  function handleExport() {
    if (response === null) return;
    const stamp = new Date();
    downloadCsv(
      `stakeholder-candidates-${stamp.toISOString().slice(0, 10)}.csv`,
      buildCandidatesCsv(response, stamp, checklist),
    );
  }

  const latNumber = Number(lat);
  const lonNumber = Number(lon);
  const mapLocation = {
    lat: Number.isFinite(latNumber) ? latNumber : 35.05,
    lon: Number.isFinite(lonNumber) ? lonNumber : 139.05,
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🗺️ 公共工事ステークホルダー整理マップ</h1>
        <p>指定地点と工事条件から、事前協議の確認候補となる関係機関を整理します。</p>
      </header>

      <DisclaimerBanner />

      <main className="layout">
        <section className="pane pane-form" aria-label="検索条件">
          <SearchForm
            onSearch={handleSearch}
            searching={searching}
            lat={lat}
            lon={lon}
            onLatChange={setLat}
            onLonChange={setLon}
          />
        </section>

        <section className="pane pane-results" aria-label="地図と候補一覧">
          <Suspense fallback={<p className="placeholder">🗺️ 地図を読み込み中…</p>}>
            <MapPicker
              location={mapLocation}
              onPick={(picked) => {
                setLat(picked.lat.toFixed(6));
                setLon(picked.lon.toFixed(6));
              }}
            />
          </Suspense>

          <div aria-live="polite">
            {error !== null && (
              <p className="error" role="alert">
                ❌ {error}
              </p>
            )}

            {response !== null && (
              <>
                <div className="results-header">
                  <h2>候補一覧（{response.candidates.length}件）</h2>
                  <p className="dataset-meta">
                    データ版: {response.datasetVersion} / ルール版: {response.ruleVersion}
                  </p>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={response.candidates.length === 0}
                  >
                    📄 CSV 出力
                  </button>
                </div>

                {response.candidates.length === 0 ? (
                  <p>
                    条件に一致する候補が見つかりませんでした。候補が出ないことは「協議不要」を意味
                    しません。地点・条件を変更するか、該当地域の自治体窓口へ直接ご確認ください。
                  </p>
                ) : (
                  <div className="candidate-list">
                    {response.candidates.map((candidate) => (
                      <CandidateCard
                        key={candidate.organizationId}
                        candidate={candidate}
                        decision={checklist[candidate.organizationId]}
                        onDecisionChange={(patch) =>
                          handleDecisionChange(candidate.organizationId, patch)
                        }
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {response === null && error === null && (
              <p className="placeholder">
                左の条件を入力するか地図をクリックして「候補を検索」を押してください。
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
