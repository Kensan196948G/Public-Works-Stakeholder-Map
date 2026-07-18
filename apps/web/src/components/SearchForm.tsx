import { useState, type FormEvent } from 'react';
import type { AssetType, ImpactType, SearchRequest, WorkType } from '@pwsm/contracts';
import { assetTypeSchema, impactTypeSchema, workTypeSchema } from '@pwsm/contracts';
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
export function SearchForm({ onSearch, searching }: SearchFormProps) {
  const [lat, setLat] = useState('35.05');
  const [lon, setLon] = useState('139.05');
  const [radius, setRadius] = useState('500');
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
          デモ地点
          <select
            onChange={(e) => {
              const preset = DEMO_LOCATIONS[Number(e.target.value)];
              if (preset !== undefined) {
                setLat(String(preset.lat));
                setLon(String(preset.lon));
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
          <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} required />
        </label>
        <label>
          経度
          <input type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} required />
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
