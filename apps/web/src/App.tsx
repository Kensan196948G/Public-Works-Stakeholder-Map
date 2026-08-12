import { lazy, Suspense, useEffect, useState } from 'react';
import type { SearchRequest, SearchResponse } from '@pwsm/contracts';
import { ApiError, fetchJurisdictionMap, searchStakeholders } from './api.js';
import {
  getChecklistStorage,
  loadChecklist,
  saveChecklist,
  updateEntry,
  type ChecklistEntries,
  type DecisionState,
} from './checklist.js';
import { buildCandidatesCsv, downloadCsv } from './csv.js';
import { loadSettings, type AppSettings } from './settings.js';
import { AuditPage } from './components/AuditPage.js';
import { QualityPage } from './components/QualityPage.js';
import { ReviewPage } from './components/ReviewPage.js';
import { SourcesPage } from './components/SourcesPage.js';
import { CandidateCard } from './components/CandidateCard.js';
import { CandidateToolbar } from './components/CandidateToolbar.js';
import { DisclaimerBanner } from './components/DisclaimerBanner.js';
import { FeedbackPage } from './components/FeedbackPage.js';
import { PrintView } from './components/PrintView.js';
import { SearchForm } from './components/SearchForm.js';
import { SettingsPage } from './components/SettingsPage.js';
import {
  DEFAULT_FILTERS,
  filterCandidates,
  sortCandidates,
  type CandidateFilters,
  type CandidateSort,
} from './filters.js';
import { DEFAULT_PURPOSE, decodeSearchQuery, encodeSearchQuery, type UrlSearchState } from './urlState.js';
import type { JurisdictionMapResponse } from '@pwsm/contracts';
import type { SearchConditions } from './components/SearchForm.js';

type PageId =
  | 'search'
  | 'sources'
  | 'review'
  | 'quality'
  | 'settings'
  | 'audit'
  | 'feedback';

const PAGES: readonly { id: PageId; label: string }[] = [
  { id: 'search', label: '🔎 検索' },
  { id: 'feedback', label: '💬 フィードバック' },
  { id: 'sources', label: '🗂️ データソース' },
  { id: 'review', label: '📝 取込レビュー' },
  { id: 'quality', label: '📊 品質' },
  { id: 'settings', label: '⚙️ システム設定' },
  { id: 'audit', label: '📜 監査ログ' },
];

// 地図（WebGL）は遅延読込し、初期表示と非対応環境への影響を抑える
const MapPicker = lazy(() =>
  import('./components/MapPicker.js').then((m) => ({ default: m.MapPicker })),
);

const DEFAULT_URL_STATE: UrlSearchState = {
  lat: 35.05,
  lon: 139.05,
  radiusMeters: 500,
  workTypes: [],
  assetTypes: [],
  impactTypes: [],
  purpose: DEFAULT_PURPOSE,
};

export function App() {
  const [page, setPage] = useState<PageId>('search');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  // URL の検索条件を初期状態として復元する（§10: URL query での共有）。
  // 半径が URL に無い場合はシステム設定の既定値を使う
  const initial = decodeSearchQuery(window.location.search, {
    ...DEFAULT_URL_STATE,
    radiusMeters: settings.defaultRadiusMeters,
  });
  const [lat, setLat] = useState(String(initial.lat));
  const [lon, setLon] = useState(String(initial.lon));
  const [conditions, setConditions] = useState<SearchConditions>({
    radiusMeters: initial.radiusMeters,
    workTypes: [...initial.workTypes],
    assetTypes: [...initial.assetTypes],
    impactTypes: [...initial.impactTypes],
    purpose: initial.purpose,
  });
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [highlightRegions, setHighlightRegions] =
    useState<JurisdictionMapResponse | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [filters, setFilters] = useState<CandidateFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<CandidateSort>('default');
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
    setHighlightRegions(null);
    setMapError(null);
    try {
      const result = await searchStakeholders(request);
      setResponse(result);
      // URL へ検索条件を反映（実案件名・個人情報は含めない）
      const urlState: UrlSearchState = {
        lat: request.location.lat,
        lon: request.location.lon,
        radiusMeters: request.radiusMeters,
        workTypes: request.workTypes,
        assetTypes: request.assetTypes,
        impactTypes: request.impactTypes,
        purpose: request.purpose ?? DEFAULT_PURPOSE,
      };
      const query = encodeSearchQuery(urlState);
      const nextUrl = `${window.location.pathname}${query === '' ? '' : `?${query}`}`;
      window.history.replaceState(null, '', nextUrl);
      // 候補機関の管轄区域を地図ハイライト用に取得（失敗しても候補一覧は表示する）
      if (result.candidates.length > 0) {
        try {
          const mapResponse = await fetchJurisdictionMap(
            result.candidates.map((c) => c.organizationId),
          );
          setHighlightRegions(mapResponse);
        } catch (e) {
          setMapError(
            e instanceof ApiError
              ? e.message
              : '管轄区域の地図表示に失敗しました。候補一覧はそのまま利用できます。',
          );
        }
      }
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

  function handlePrint() {
    window.print();
  }

  const visibleCandidates = sortCandidates(
    filterCandidates(response?.candidates ?? [], filters),
    sort,
  );

  const latNumber = Number(lat);
  const lonNumber = Number(lon);
  const mapLocation = {
    lat: Number.isFinite(latNumber) ? latNumber : 35.05,
    lon: Number.isFinite(lonNumber) ? lonNumber : 139.05,
  };

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        本文へ移動
      </a>
      <header className="app-header">
        <h1>🗺️ 公共工事ステークホルダー整理マップ</h1>
        <p>指定地点と工事条件から、事前協議の確認候補となる関係機関を整理します。</p>
      </header>

      <DisclaimerBanner />

      <nav className="app-nav" aria-label="ページ切替">
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className={page === p.id ? 'nav-active' : ''}
            aria-current={page === p.id ? 'page' : undefined}
            onClick={() => setPage(p.id)}
          >
            {p.label}
          </button>
        ))}
      </nav>

      {page === 'settings' && (
        <section className="pane">
          <SettingsPage
            settings={settings}
            onSettingsChange={setSettings}
            onChecklistCleared={() => setChecklist({})}
            onChecklistImported={setChecklist}
          />
        </section>
      )}

      {page === 'audit' && (
        <section className="pane">
          <AuditPage />
        </section>
      )}

      {page === 'sources' && (
        <section className="pane">
          <SourcesPage />
        </section>
      )}

      {page === 'review' && (
        <section className="pane">
          <ReviewPage />
        </section>
      )}

      {page === 'quality' && (
        <section className="pane">
          <QualityPage />
        </section>
      )}

      {page === 'feedback' && (
        <section className="pane">
          <FeedbackPage />
        </section>
      )}

      <main id="main-content" className={`layout${page === 'search' ? '' : ' hidden'}`}>
        <section className="pane pane-form" aria-label="検索条件">
          <SearchForm
            onSearch={handleSearch}
            searching={searching}
            lat={lat}
            lon={lon}
            onLatChange={setLat}
            onLonChange={setLon}
            conditions={conditions}
            onConditionsChange={setConditions}
          />
        </section>

        <section className="pane pane-results" aria-label="地図と候補一覧">
          <Suspense fallback={<p className="placeholder">🗺️ 地図を読み込み中…</p>}>
              <MapPicker
                location={mapLocation}
                highlightRegions={highlightRegions}
                onPick={(picked) => {
                  setLat(picked.lat.toFixed(6));
                  setLon(picked.lon.toFixed(6));
                }}
              />
            </Suspense>
            {mapError !== null && (
              <p className="error" role="alert">
                ⚠️ {mapError}
              </p>
            )}

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
                  <button
                    type="button"
                    onClick={handlePrint}
                    disabled={response.candidates.length === 0}
                  >
                    🖨️ 印刷 / PDF
                  </button>
                </div>

                {response.candidates.length === 0 ? (
                  <p>
                    条件に一致する候補が見つかりませんでした。候補が出ないことは「協議不要」を意味
                    しません。地点・条件を変更するか、該当地域の自治体窓口へ直接ご確認ください。
                  </p>
                ) : (
                  <>
                    <CandidateToolbar
                      candidates={response.candidates}
                      filters={filters}
                      onFiltersChange={setFilters}
                      sort={sort}
                      onSortChange={setSort}
                      visibleCount={visibleCandidates.length}
                    />
                    <div className="candidate-list">
                      {visibleCandidates.map((candidate) => (
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
                    {visibleCandidates.length === 0 && (
                      <p>現在の絞り込み条件に一致する候補がありません。</p>
                    )}
                  </>
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
      {response !== null && response.candidates.length > 0 && (
        <PrintView response={response} checklist={checklist} exportedAt={new Date()} />
      )}
    </div>
  );
}
