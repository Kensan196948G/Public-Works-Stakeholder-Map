import { useState } from 'react';
import type { SearchRequest, SearchResponse } from '@pwsm/contracts';
import { ApiError, searchStakeholders } from './api.js';
import { buildCandidatesCsv, downloadCsv } from './csv.js';
import { CandidateCard } from './components/CandidateCard.js';
import { DisclaimerBanner } from './components/DisclaimerBanner.js';
import { SearchForm } from './components/SearchForm.js';

export function App() {
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

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

  function handleExport() {
    if (response === null) return;
    const stamp = new Date();
    downloadCsv(
      `stakeholder-candidates-${stamp.toISOString().slice(0, 10)}.csv`,
      buildCandidatesCsv(response, stamp),
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🗺️ 公共工事ステークホルダー整理マップ</h1>
        <p>指定地点と工事条件から、事前協議の確認候補となる関係機関を整理します。</p>
      </header>

      <DisclaimerBanner />

      <main className="layout">
        <section className="pane pane-form" aria-label="検索条件">
          <SearchForm onSearch={handleSearch} searching={searching} />
        </section>

        <section className="pane pane-results" aria-label="候補一覧" aria-live="polite">
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
                    <CandidateCard key={candidate.organizationId} candidate={candidate} />
                  ))}
                </div>
              )}
            </>
          )}

          {response === null && error === null && (
            <p className="placeholder">左の条件を入力して「候補を検索」を押してください。</p>
          )}
        </section>
      </main>
    </div>
  );
}
