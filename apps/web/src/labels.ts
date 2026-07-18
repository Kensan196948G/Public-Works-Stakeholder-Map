import type {
  AssetType,
  BoundaryPrecision,
  ConfidenceGrade,
  ImpactType,
  OrganizationType,
  VerificationState,
  WorkType,
} from '@pwsm/contracts';

/** 列挙値の日本語表示（要件 §4.2 / §4.3 / §5.3 の用語に合わせる） */

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  excavation: '掘削',
  occupation: '占用',
  traffic_restriction: '通行規制',
  lane_restriction: '車線規制',
  special_vehicle: '特殊車両',
  temporary_works: '仮設',
  material_transport: '搬入',
  drainage: '排水',
  tree_cutting: '伐採',
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  road: '道路',
  river: '河川',
  port: '港湾',
  coast: '海岸',
  park: '公園',
  public_facility: '公共施設',
  other: 'その他',
};

export const IMPACT_TYPE_LABELS: Record<ImpactType, string> = {
  water_area_use: '水域使用',
  traffic_impact: '交通影響',
  noise_vibration: '騒音・振動',
  night_work: '夜間作業',
  pedestrian_route: '歩行者動線',
  adjacent_structure: '近接施工',
};

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  issuer: '発注者',
  road_admin: '道路管理者',
  river_admin: '河川管理者',
  port_admin: '港湾管理者',
  police: '警察',
  prefecture: '都道府県',
  municipality: '自治体窓口',
  other: 'その他',
};

export const VERIFICATION_STATE_LABELS: Record<VerificationState, string> = {
  unverified: '未確認',
  source_checked: '原典確認済',
  needs_inquiry: '要照会',
  candidate: '協議候補',
  excluded: '対象外',
  expired: '期限超過',
};

export const PRECISION_LABELS: Record<BoundaryPrecision, string> = {
  official: '公式区域',
  administrative_unit: '行政単位（概略）',
  interpreted: '解釈による区域',
  estimated: '推定区域',
};

/** 信頼度の説明。「正しさの保証」ではなく確認優先度（要件 §5.3） */
export const CONFIDENCE_LABELS: Record<ConfidenceGrade, string> = {
  A: 'A・高',
  B: 'B・中',
  C: 'C・要確認',
  D: 'D・期限超過/要再確認',
};
