import { useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  AssetType,
  GeocodeResult,
  ImpactType,
  SearchPurpose,
  SearchRequest,
  WorkType,
} from '@pwsm/contracts';
import { assetTypeSchema, impactTypeSchema, workTypeSchema } from '@pwsm/contracts';
import { ApiError, geocode } from '../api.js';
import { ASSET_TYPE_LABELS, IMPACT_TYPE_LABELS, WORK_TYPE_LABELS } from '../labels.js';

/** 補完の自動検索を開始する最小文字数（都道府県名の最短 2 文字に対応） */
const AUTOCOMPLETE_MIN_LENGTH = 2;
/** 打鍵から自動検索までの待機時間。地理院 API への過剰リクエストを防ぐ */
const AUTOCOMPLETE_DEBOUNCE_MS = 400;

/** 検索条件一式（App が保持し URL 共有に使う） */
export interface SearchConditions {
  radiusMeters: number;
  workTypes: WorkType[];
  assetTypes: AssetType[];
  impactTypes: ImpactType[];
  purpose: SearchPurpose;
}

/** 架空デモ地点（fixture の 3 地域に対応）。
 *  実在住所の検索結果は架空の管轄ポリゴンとヒットしないため、
 *  実データ整備（Phase 2）完了までデモ検証の主経路として維持する */
const DEMO_LOCATIONS = [
  { label: 'みらい市中央地区（デモ）', lat: 35.05, lon: 139.05 },
  { label: 'みらい市臨海地区（デモ）', lat: 34.95, lon: 139.05 },
  { label: 'あおぞら町河川沿い地区（デモ）', lat: 35.05, lon: 139.15 },
] as const;

interface SearchFormProps {
  onSearch: (request: SearchRequest) => void;
  searching: boolean;
  /** 地点は App が保持する（地図クリックと同期するため制御化） */
  lat: string;
  lon: string;
  onLatChange: (value: string) => void;
  onLonChange: (value: string) => void;
  /** 検索条件（App 管理）。URL 復元・共有のため制御化する */
  conditions: SearchConditions;
  onConditionsChange: (next: SearchConditions) => void;
}

function CheckboxGroup<T extends string>({
  legend,
  options,
  labels,
  selected,
  onChange,
}: {
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: readonly T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="checkbox-grid">
        {options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, option]
                    : selected.filter((v) => v !== option),
                )
              }
            />
            {labels[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 地点・工事条件の入力フォーム（SCR-02 の条件ペイン相当） */
export function SearchForm({
  onSearch,
  searching,
  lat,
  lon,
  onLatChange,
  onLonChange,
  conditions,
  onConditionsChange,
}: SearchFormProps) {
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<GeocodeResult[] | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSearching, setAddressSearching] = useState(false);
  /** 補完候補リストの開閉と、キーボード操作中のハイライト位置 */
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  /** リクエスト連番。古い応答が新しい応答を上書きしないよう最後の発行のみ反映する */
  const requestSeqRef = useRef(0);
  /** 候補選択で入力値を書き換えた直後の自動再検索を 1 回だけ抑止する */
  const suppressAutoSearchRef = useRef(false);

  async function runAddressSearch(query: string) {
    const seq = ++requestSeqRef.current;
    setAddressSearching(true);
    try {
      const response = await geocode(query);
      if (seq !== requestSeqRef.current) return; // 古い応答は破棄
      setAddressResults(response.results);
      setSuggestionsOpen(response.results.length > 0);
      setActiveIndex(response.results.length > 0 ? 0 : -1);
      setAddressError(
        response.results.length === 0
          ? '該当する住所が見つかりませんでした。表記を変えてお試しください。'
          : null,
      );
    } catch (e) {
      if (seq !== requestSeqRef.current) return;
      setSuggestionsOpen(false);
      setAddressError(
        e instanceof ApiError ? e.message : '住所検索に失敗しました。時間をおいて再度お試しください。',
      );
    } finally {
      if (seq === requestSeqRef.current) setAddressSearching(false);
    }
  }

  /** 補完: 入力が止まってから自動検索する（FR-001 拡張・都道府県などの部分入力に対応） */
  useEffect(() => {
    if (suppressAutoSearchRef.current) {
      suppressAutoSearchRef.current = false;
      return;
    }
    const query = addressQuery.trim();
    if (query.length < AUTOCOMPLETE_MIN_LENGTH) {
      setSuggestionsOpen(false);
      setAddressResults(null);
      setAddressError(null);
      return;
    }
    const timer = setTimeout(() => {
      void runAddressSearch(query);
    }, AUTOCOMPLETE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [addressQuery]);

  function handleAddressSearch() {
    const query = addressQuery.trim();
    if (query === '') return;
    setAddressError(null);
    void runAddressSearch(query);
  }

  function handleAddressSelect(result: GeocodeResult) {
    onLatChange(result.location.lat.toFixed(6));
    onLonChange(result.location.lon.toFixed(6));
    setAddressResults(null);
    setSuggestionsOpen(false);
    setActiveIndex(-1);
    suppressAutoSearchRef.current = true;
    setAddressQuery(result.label);
  }
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch({
      location: { lat: Number(lat), lon: Number(lon) },
      radiusMeters: conditions.radiusMeters,
      workTypes: conditions.workTypes,
      assetTypes: conditions.assetTypes,
      impactTypes: conditions.impactTypes,
      purpose: conditions.purpose,
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-label="候補検索条件">
      <fieldset>
        <legend>📍 地点</legend>
        <label>
          住所で検索（国土地理院 住所検索API）
          <div className="address-search">
            <input
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestionsOpen}
              aria-controls="address-suggestions"
              aria-activedescendant={
                suggestionsOpen && activeIndex >= 0 ? `address-option-${activeIndex}` : undefined
              }
              value={addressQuery}
              onChange={(e) => setAddressQuery(e.target.value)}
              placeholder="例: 東京都、千代田区霞が関一丁目"
              maxLength={100}
              onBlur={() => setSuggestionsOpen(false)}
              onKeyDown={(e) => {
                const results = addressResults ?? [];
                if (e.key === 'ArrowDown' && suggestionsOpen && results.length > 0) {
                  e.preventDefault();
                  setActiveIndex((i) => (i + 1) % results.length);
                } else if (e.key === 'ArrowUp' && suggestionsOpen && results.length > 0) {
                  e.preventDefault();
                  setActiveIndex((i) => (i - 1 + results.length) % results.length);
                } else if (e.key === 'Escape' && suggestionsOpen) {
                  e.preventDefault();
                  setSuggestionsOpen(false);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const active = suggestionsOpen && activeIndex >= 0 ? results[activeIndex] : undefined;
                  if (active !== undefined) {
                    handleAddressSelect(active);
                  } else {
                    handleAddressSearch();
                  }
                }
              }}
            />
            <button
              type="button"
              onClick={() => handleAddressSearch()}
              disabled={addressSearching || addressQuery.trim() === ''}
            >
              {addressSearching ? '検索中…' : '住所検索'}
            </button>
          </div>
        </label>
        {addressError !== null && (
          <p className="error" role="alert">
            {addressError}
          </p>
        )}
        {suggestionsOpen && addressResults !== null && addressResults.length > 0 && (
          <ul className="address-results" id="address-suggestions" role="listbox" aria-label="住所候補">
            {addressResults.map((result, index) => (
              <li
                key={`${result.label}-${result.location.lat}-${result.location.lon}`}
                id={`address-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'active' : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  // blur によるリスト閉鎖より先に選択を確定させる
                  e.preventDefault();
                  handleAddressSelect(result);
                }}
              >
                📍 {result.label}
              </li>
            ))}
          </ul>
        )}
        <label>
          デモ地点
          <select
            onChange={(e) => {
              const preset = DEMO_LOCATIONS[Number(e.target.value)];
              if (preset !== undefined) {
                onLatChange(String(preset.lat));
                onLonChange(String(preset.lon));
              }
            }}
            defaultValue=""
          >
            <option value="" disabled>
              選択してください
            </option>
            {DEMO_LOCATIONS.map((loc, i) => (
              <option key={loc.label} value={i}>
                {loc.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          緯度
          <input type="number" step="any" value={lat} onChange={(e) => onLatChange(e.target.value)} required />
        </label>
        <label>
          経度
          <input type="number" step="any" value={lon} onChange={(e) => onLonChange(e.target.value)} required />
        </label>
        <label>
          検索半径（m）
          <input
            type="number"
            min="0"
            max="5000"
            value={conditions.radiusMeters}
            onChange={(e) => {
              const value = Number(e.target.value);
              onConditionsChange({
                ...conditions,
                radiusMeters: Number.isFinite(value) ? value : 0,
              });
            }}
          />
        </label>
      </fieldset>

      <CheckboxGroup
        legend="🏗️ 工事対象"
        options={assetTypeSchema.options}
        labels={ASSET_TYPE_LABELS}
        selected={conditions.assetTypes}
        onChange={(assetTypes) => onConditionsChange({ ...conditions, assetTypes })}
      />
      <CheckboxGroup
        legend="🚧 作業内容"
        options={workTypeSchema.options}
        labels={WORK_TYPE_LABELS}
        selected={conditions.workTypes}
        onChange={(workTypes) => onConditionsChange({ ...conditions, workTypes })}
      />
      <CheckboxGroup
        legend="🌏 周辺影響"
        options={impactTypeSchema.options}
        labels={IMPACT_TYPE_LABELS}
        selected={conditions.impactTypes}
        onChange={(impactTypes) => onConditionsChange({ ...conditions, impactTypes })}
      />

      <button type="submit" disabled={searching}>
        {searching ? '検索中…' : '候補を検索'}
      </button>
    </form>
  );
}
