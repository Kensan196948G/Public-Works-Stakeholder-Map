import type { AssetType, ImpactType, SearchPurpose, WorkType } from '@pwsm/contracts';
import {
  assetTypeSchema,
  impactTypeSchema,
  searchPurposeSchema,
  workTypeSchema,
} from '@pwsm/contracts';

/**
 * 検索条件の URL 共有（詳細設計 §10: 検索条件は URL query + memory で保持）。
 * 実案件名・個人情報・自由記述メモは URL に含めない（§10）。
 */

export interface UrlSearchState {
  lat: number;
  lon: number;
  radiusMeters: number;
  workTypes: readonly WorkType[];
  assetTypes: readonly AssetType[];
  impactTypes: readonly ImpactType[];
  purpose: SearchPurpose;
}

export const DEFAULT_PURPOSE: SearchPurpose = 'pre_consultation';

function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseList(value: string | null, options: readonly string[]): string[] {
  if (value === null || value === '') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is string => (options as readonly string[]).includes(s));
}

/** URL の検索クエリ文字列から状態を復元する。不正値は既定値へフォールバックする。 */
export function decodeSearchQuery(search: string, fallback: UrlSearchState): UrlSearchState {
  const params = new URLSearchParams(search);
  const lat = parseNumber(params.get('lat'));
  const lon = parseNumber(params.get('lon'));
  const radius = parseNumber(params.get('radius'));
  const purposeRaw = params.get('purpose');
  const purpose =
    purposeRaw !== null && searchPurposeSchema.safeParse(purposeRaw).success
      ? (purposeRaw as SearchPurpose)
      : fallback.purpose;
  return {
    lat:
      lat !== null && lat >= -90 && lat <= 90
        ? lat
        : fallback.lat,
    lon:
      lon !== null && lon >= -180 && lon <= 180
        ? lon
        : fallback.lon,
    radiusMeters:
      radius !== null && Number.isInteger(radius) && radius >= 0 && radius <= 5000
        ? radius
        : fallback.radiusMeters,
    workTypes: parseList(params.get('work'), workTypeSchema.options) as WorkType[],
    assetTypes: parseList(params.get('asset'), assetTypeSchema.options) as AssetType[],
    impactTypes: parseList(params.get('impact'), impactTypeSchema.options) as ImpactType[],
    purpose,
  };
}

/** 状態を URL 検索クエリ文字列（`?` なし）へ変換する。 */
export function encodeSearchQuery(state: UrlSearchState): string {
  const params = new URLSearchParams();
  params.set('lat', String(state.lat));
  params.set('lon', String(state.lon));
  if (state.radiusMeters !== 0) params.set('radius', String(state.radiusMeters));
  if (state.workTypes.length > 0) params.set('work', state.workTypes.join(','));
  if (state.assetTypes.length > 0) params.set('asset', state.assetTypes.join(','));
  if (state.impactTypes.length > 0) params.set('impact', state.impactTypes.join(','));
  if (state.purpose !== DEFAULT_PURPOSE) params.set('purpose', state.purpose);
  return params.toString();
}
