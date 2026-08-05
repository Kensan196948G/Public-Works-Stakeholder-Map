import { z } from 'zod';

/**
 * 地図用の管轄区域 GeoJSON 契約（FR-003 拡張、詳細設計 §6.2 GET /map/jurisdictions）。
 * 検索結果の候補機関が持つ公開管轄区域を、表示範囲のハイライト用に返す。
 * このデータは視覚補助であり、正式な境界を保証しない（免責は画面側で常時表示）。
 */

/** ハイライトに必要な最小限のプロパティ。正式な境界情報は候補詳細 API 側が担う */
export const jurisdictionFeatureSchema = z.object({
  type: z.literal('Feature'),
  properties: z.object({
    organizationId: z.string(),
    organizationName: z.string(),
    assetName: z.string().nullable(),
    precision: z.string(),
    estimated: z.boolean(),
  }),
  geometry: z.record(z.string(), z.unknown()).nullable(),
});
export type JurisdictionFeature = z.infer<typeof jurisdictionFeatureSchema>;

export const jurisdictionMapResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  datasetVersion: z.string(),
  features: z.array(jurisdictionFeatureSchema).max(500),
});
export type JurisdictionMapResponse = z.infer<typeof jurisdictionMapResponseSchema>;

/** 1 リクエストで指定できる機関 ID の上限（UI は検索結果件数で収まる範囲を送る） */
export const MAX_MAP_ORGANIZATION_IDS = 50;
