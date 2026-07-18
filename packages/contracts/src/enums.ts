import { z } from 'zod';

/**
 * 列挙型定義（詳細設計仕様書 §4.1）。
 * DB の enum、API の入出力、UI 表示の全てがこの定義を正とする。
 */

/** 機関種別 */
export const organizationTypeSchema = z.enum([
  'issuer',
  'road_admin',
  'river_admin',
  'port_admin',
  'police',
  'prefecture',
  'municipality',
  'other',
]);
export type OrganizationType = z.infer<typeof organizationTypeSchema>;

/** レコード公開状態（draft → in_review → published → suspended/retired） */
export const recordStatusSchema = z.enum([
  'draft',
  'in_review',
  'published',
  'suspended',
  'retired',
]);
export type RecordStatus = z.infer<typeof recordStatusSchema>;

/** 利用者による候補の確認状態 */
export const verificationStateSchema = z.enum([
  'unverified',
  'source_checked',
  'needs_inquiry',
  'candidate',
  'excluded',
  'expired',
]);
export type VerificationState = z.infer<typeof verificationStateSchema>;

/** 管轄区域データの精度区分。estimated は official と併用不可（§5.3） */
export const boundaryPrecisionSchema = z.enum([
  'official',
  'administrative_unit',
  'interpreted',
  'estimated',
]);
export type BoundaryPrecision = z.infer<typeof boundaryPrecisionSchema>;

/** 情報源の権威性 */
export const sourceAuthoritySchema = z.enum([
  'primary_official',
  'official_catalog',
  'secondary_open',
]);
export type SourceAuthority = z.infer<typeof sourceAuthoritySchema>;

/** 信頼度表示。データ確認優先度であり正しさの保証ではない（要件 §5.3） */
export const confidenceGradeSchema = z.enum(['A', 'B', 'C', 'D']);
export type ConfidenceGrade = z.infer<typeof confidenceGradeSchema>;

/** 工事対象（要件 §4.2） */
export const assetTypeSchema = z.enum([
  'road',
  'river',
  'port',
  'coast',
  'park',
  'public_facility',
  'other',
]);
export type AssetType = z.infer<typeof assetTypeSchema>;

/** 作業内容（要件 §4.2） */
export const workTypeSchema = z.enum([
  'excavation',
  'occupation',
  'traffic_restriction',
  'lane_restriction',
  'special_vehicle',
  'temporary_works',
  'material_transport',
  'drainage',
  'tree_cutting',
]);
export type WorkType = z.infer<typeof workTypeSchema>;

/** 周辺影響（要件 §4.2） */
export const impactTypeSchema = z.enum([
  'water_area_use',
  'traffic_impact',
  'noise_vibration',
  'night_work',
  'pedestrian_route',
  'adjacent_structure',
]);
export type ImpactType = z.infer<typeof impactTypeSchema>;

/** 調査目的（要件 §4.2） */
export const searchPurposeSchema = z.enum([
  'pre_bid',
  'site_survey',
  'construction_planning',
  'pre_consultation',
]);
export type SearchPurpose = z.infer<typeof searchPurposeSchema>;
