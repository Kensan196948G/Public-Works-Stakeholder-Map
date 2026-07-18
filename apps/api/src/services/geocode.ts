import type { GeocodeResult } from '@pwsm/contracts';

/**
 * 住所検索（ジオコーディング、Issue #16）。
 * 国土地理院 住所検索 API をサーバー側から呼び出す。
 * - 取得先は許可ホスト固定（SSRF 対策 §9.2: 任意 URL を受け付けない）
 * - タイムアウト・件数制限あり
 * - 住所クエリを監査・構造化ログへ記録しない（プライバシー最小化）
 */

export const GEOCODER_HOST = 'msearch.gsi.go.jp';
export const GEOCODER_ATTRIBUTION = '出典: 国土地理院 住所検索API';
const GEOCODER_TIMEOUT_MS = 5000;
const MAX_RESULTS = 5;

/** 地理院 API の応答形式（必要フィールドのみ） */
interface GsiFeature {
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: { title?: string };
}

export class GeocodeUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeocodeUpstreamError';
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 住所文字列から候補地点を取得する。結果 0 件は空配列（エラーにしない）。 */
export async function geocodeAddress(
  query: string,
  fetchImpl: FetchLike = fetch,
): Promise<GeocodeResult[]> {
  const url = `https://${GEOCODER_HOST}/address-search/AddressSearch?q=${encodeURIComponent(query)}`;
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(GEOCODER_TIMEOUT_MS) });
  } catch {
    throw new GeocodeUpstreamError('geocoder unreachable');
  }
  if (!response.ok) {
    throw new GeocodeUpstreamError(`geocoder status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GeocodeUpstreamError('geocoder returned non-JSON');
  }
  if (!Array.isArray(payload)) {
    throw new GeocodeUpstreamError('geocoder returned unexpected shape');
  }

  const results: GeocodeResult[] = [];
  for (const feature of payload as GsiFeature[]) {
    const title = feature.properties?.title;
    const coordinates = feature.geometry?.coordinates;
    if (typeof title !== 'string' || title === '' || !Array.isArray(coordinates)) continue;
    const [lon, lat] = coordinates;
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      continue;
    }
    results.push({ label: title, location: { lat, lon } });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}
