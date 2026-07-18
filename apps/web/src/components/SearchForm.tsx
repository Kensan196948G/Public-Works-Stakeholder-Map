import { useState, type FormEvent } from 'react';
import type { AssetType, GeocodeResult, ImpactType, SearchRequest, WorkType } from '@pwsm/contracts';
import { assetTypeSchema, impactTypeSchema, workTypeSchema } from '@pwsm/contracts';
import { ApiError, geocode } from '../api.js';
import { ASSET_TYPE_LABELS, IMPACT_TYPE_LABELS, WORK_TYPE_LABELS } from '../labels.js';

/** 架空デモ地点（fixture の 3 地域に対応） */
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
  /** システム設定の既定検索半径（m） */
  initialRadius: number;
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
  initialRadius,
}: SearchFormProps) {
  const [radius, setRadius] = useState(String(initialRadius));
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState<GeocodeResult[] | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSearching, setAddressSearching] = useState(false);

  async function handleAddressSearch() {
    const query = addressQuery.trim();
    if (query === '') return;
    setAddressSearching(true);
    setAddressError(null);
    setAddressResults(null);
    try {
      const response = await geocode(query);
      setAddressResults(response.results);
      if (response.results.length === 0) {
        setAddressError('該当する住所が見つかりませんでした。表記を変えてお試しください。');
      }
    } catch (e) {
      setAddressError(
        e instanceof ApiError ? e.message : '住所検索に失敗しました。時間をおいて再度お試しください。',
      );
    } finally {
      setAddressSearching(false);
    }
  }

  function handleAddressSelect(result: GeocodeResult) {
    onLatChange(result.location.lat.toFixed(6));
    onLonChange(result.location.lon.toFixed(6));
    setAddressResults(null);
    setAddressQuery(result.label);
  }
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [impactTypes, setImpactTypes] = useState<ImpactType[]>([]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSearch({
      location: { lat: Number(lat), lon: Number(lon) },
      radiusMeters: Number(radius),
      workTypes,
      assetTypes,
      impactTypes,
      purpose: 'pre_consultation',
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
              value={addressQuery}
              onChange={(e) => setAddressQuery(e.target.value)}
              placeholder="例: 千代田区霞が関一丁目"
              maxLength={100}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAddressSearch();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void handleAddressSearch()}
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
        {addressResults !== null && addressResults.length > 0 && (
          <ul className="address-results" aria-label="住所候補">
            {addressResults.map((result) => (
              <li key={`${result.label}-${result.location.lat}-${result.location.lon}`}>
                <button type="button" onClick={() => handleAddressSelect(result)}>
                  📍 {result.label}
                </button>
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
          <input type="number" min="0" max="5000" value={radius} onChange={(e) => setRadius(e.target.value)} />
        </label>
      </fieldset>

      <CheckboxGroup
        legend="🏗️ 工事対象"
        options={assetTypeSchema.options}
        labels={ASSET_TYPE_LABELS}
        selected={assetTypes}
        onChange={setAssetTypes}
      />
      <CheckboxGroup
        legend="🚧 作業内容"
        options={workTypeSchema.options}
        labels={WORK_TYPE_LABELS}
        selected={workTypes}
        onChange={setWorkTypes}
      />
      <CheckboxGroup
        legend="🌏 周辺影響"
        options={impactTypeSchema.options}
        labels={IMPACT_TYPE_LABELS}
        selected={impactTypes}
        onChange={setImpactTypes}
      />

      <button type="submit" disabled={searching}>
        {searching ? '検索中…' : '候補を検索'}
      </button>
    </form>
  );
}
