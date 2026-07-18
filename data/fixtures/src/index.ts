import type {
  BoundaryPrecision,
  Evidence,
  OrganizationType,
  RecordStatus,
  SourceAuthority,
} from '@pwsm/contracts';
import type { StakeholderRule } from '@pwsm/domain';

/**
 * 架空の検証用データセット（要件 §2.3: 検証用架空データのみ）。
 * 実在の機関・連絡先・管轄を一切含まない。example.com の URL を
 * 実在機関の根拠として扱わない（詳細設計仕様書 §6.5）。
 */

export interface DemoBBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface DemoRegion {
  code: string;
  name: string;
  bbox: DemoBBox;
}

export interface DemoOrganization {
  id: string;
  name: string;
  type: OrganizationType;
  officeName: string;
  regionCodes: readonly string[];
  officialUrl: string;
  authority: SourceAuthority;
  precision: BoundaryPrecision;
  estimated: boolean;
  reviewStatus: RecordStatus;
  sourceCheckedAt: string;
  ttlDays: number;
  evidence: readonly Evidence[];
}

export interface DemoDataset {
  datasetVersion: string;
  ruleVersion: number;
  regions: readonly DemoRegion[];
  organizations: readonly DemoOrganization[];
  rules: readonly StakeholderRule[];
}

export const demoDataset: DemoDataset = {
  datasetVersion: '2026-07-18.fixture.1',
  ruleVersion: 1,
  regions: [
    {
      code: 'demo-mirai-chuo',
      name: 'みらい市中央地区（デモ）',
      bbox: { minLat: 35.0, maxLat: 35.1, minLon: 139.0, maxLon: 139.1 },
    },
    {
      code: 'demo-mirai-rinkai',
      name: 'みらい市臨海地区（デモ）',
      bbox: { minLat: 34.9, maxLat: 35.0, minLon: 139.0, maxLon: 139.1 },
    },
    {
      code: 'demo-aozora-kasen',
      name: 'あおぞら町河川沿い地区（デモ）',
      bbox: { minLat: 35.0, maxLat: 35.1, minLon: 139.1, maxLon: 139.2 },
    },
  ],
  organizations: [
    {
      id: 'org-demo-0001',
      name: 'みらい市 契約検査課（デモ）',
      type: 'issuer',
      officeName: '契約検査課',
      regionCodes: ['demo-mirai-chuo', 'demo-mirai-rinkai'],
      officialUrl: 'https://example.com/demo/mirai-city/contract',
      authority: 'primary_official',
      precision: 'administrative_unit',
      estimated: false,
      reviewStatus: 'published',
      sourceCheckedAt: '2026-07-01T00:00:00+09:00',
      ttlDays: 180,
      evidence: [
        {
          title: 'みらい市 契約・入札情報（デモ）',
          url: 'https://example.com/demo/mirai-city/contract',
          sourceCheckedAt: '2026-07-01T00:00:00+09:00',
        },
      ],
    },
    {
      id: 'org-demo-0002',
      name: 'みらい市 道路管理課（デモ）',
      type: 'road_admin',
      officeName: '道路管理課',
      regionCodes: ['demo-mirai-chuo', 'demo-mirai-rinkai'],
      officialUrl: 'https://example.com/demo/mirai-city/road',
      authority: 'primary_official',
      precision: 'administrative_unit',
      estimated: false,
      reviewStatus: 'published',
      sourceCheckedAt: '2026-07-01T00:00:00+09:00',
      ttlDays: 90,
      evidence: [
        {
          title: 'みらい市道の管理に関する案内（デモ）',
          url: 'https://example.com/demo/mirai-city/road',
          sourceCheckedAt: '2026-07-01T00:00:00+09:00',
        },
      ],
    },
    {
      id: 'org-demo-0003',
      name: 'あおぞら県 みらい土木事務所（デモ）',
      type: 'road_admin',
      officeName: '道路維持担当',
      regionCodes: ['demo-mirai-chuo', 'demo-aozora-kasen'],
      officialUrl: 'https://example.com/demo/aozora-pref/doboku',
      authority: 'primary_official',
      precision: 'administrative_unit',
      estimated: false,
      reviewStatus: 'published',
      sourceCheckedAt: '2026-06-15T00:00:00+09:00',
      ttlDays: 90,
      evidence: [
        {
          title: 'あおぞら県道の管理区域一覧（デモ）',
          url: 'https://example.com/demo/aozora-pref/doboku',
          sourceCheckedAt: '2026-06-15T00:00:00+09:00',
        },
      ],
    },
    {
      id: 'org-demo-0004',
      name: 'あおぞら県 河川整備課（デモ）',
      type: 'river_admin',
      officeName: '河川整備課',
      regionCodes: ['demo-aozora-kasen'],
      officialUrl: 'https://example.com/demo/aozora-pref/river',
      authority: 'primary_official',
      precision: 'interpreted',
      estimated: false,
      reviewStatus: 'published',
      sourceCheckedAt: '2026-05-01T00:00:00+09:00',
      ttlDays: 90,
      evidence: [
        {
          title: 'あおぞら県管理河川の一覧（デモ）',
          url: 'https://example.com/demo/aozora-pref/river',
          sourceCheckedAt: '2026-05-01T00:00:00+09:00',
        },
      ],
    },
    {
      id: 'org-demo-0005',
      name: 'みらい港 港湾管理事務所（デモ）',
      type: 'port_admin',
      officeName: '港湾管理事務所',
      regionCodes: ['demo-mirai-rinkai'],
      officialUrl: 'https://example.com/demo/mirai-port/kanri',
      authority: 'official_catalog',
      precision: 'administrative_unit',
      estimated: false,
      reviewStatus: 'published',
      sourceCheckedAt: '2026-07-10T00:00:00+09:00',
      ttlDays: 120,
      evidence: [
        {
          title: 'みらい港 港湾区域の案内（デモ）',
          url: 'https://example.com/demo/mirai-port/kanri',
          sourceCheckedAt: '2026-07-10T00:00:00+09:00',
        },
      ],
    },
    {
      id: 'org-demo-0006',
      name: 'あおぞら県警察 みらい警察署（デモ）',
      type: 'police',
      officeName: '交通課',
      regionCodes: ['demo-mirai-chuo', 'demo-mirai-rinkai', 'demo-aozora-kasen'],
      officialUrl: 'https://example.com/demo/aozora-police/mirai',
      authority: 'official_catalog',
      precision: 'estimated',
      estimated: true,
      reviewStatus: 'published',
      sourceCheckedAt: '2026-06-20T00:00:00+09:00',
      ttlDays: 90,
      evidence: [
        {
          title: '警察署管轄区域データ（デモ・推定含む）',
          url: 'https://example.com/demo/aozora-police/mirai',
          sourceCheckedAt: '2026-06-20T00:00:00+09:00',
        },
      ],
    },
    {
      id: 'org-demo-0007',
      name: 'みらい市 環境保全課（デモ）',
      type: 'municipality',
      officeName: '環境保全課',
      regionCodes: ['demo-mirai-chuo', 'demo-mirai-rinkai'],
      officialUrl: 'https://example.com/demo/mirai-city/kankyo',
      authority: 'primary_official',
      precision: 'administrative_unit',
      estimated: false,
      reviewStatus: 'published',
      sourceCheckedAt: '2026-07-05T00:00:00+09:00',
      ttlDays: 180,
      evidence: [
        {
          title: 'みらい市 騒音・振動の届出案内（デモ）',
          url: 'https://example.com/demo/mirai-city/kankyo',
          sourceCheckedAt: '2026-07-05T00:00:00+09:00',
        },
      ],
    },
    {
      id: 'org-demo-0008',
      name: 'あおぞら町 建設課（デモ）',
      type: 'municipality',
      officeName: '建設課',
      regionCodes: ['demo-aozora-kasen'],
      officialUrl: 'https://example.com/demo/aozora-town/kensetsu',
      authority: 'primary_official',
      precision: 'administrative_unit',
      estimated: false,
      reviewStatus: 'published',
      // 確認期限超過（expired）の検証用: 2026-01-10 + 90 日 = 2026-04-10 期限切れ
      sourceCheckedAt: '2026-01-10T00:00:00+09:00',
      ttlDays: 90,
      evidence: [
        {
          title: 'あおぞら町 建設課 窓口案内（デモ・確認期限超過の検証用）',
          url: 'https://example.com/demo/aozora-town/kensetsu',
          sourceCheckedAt: '2026-01-10T00:00:00+09:00',
        },
      ],
    },
  ],
  rules: [
    {
      ruleCode: 'R-BASE-ISSUER',
      version: 1,
      condition: { always: true },
      targetTypes: ['issuer', 'municipality'],
      reasonTemplate: '工事地点を含む自治体の発注・届出窓口は基本確認対象です',
      priority: 5,
    },
    {
      ruleCode: 'R-ROAD-WORK',
      version: 1,
      condition: {
        any: [
          { includes: { field: 'assetTypes', value: 'road' } },
          {
            intersects: {
              field: 'workTypes',
              values: ['excavation', 'occupation', 'special_vehicle'],
            },
          },
        ],
      },
      targetTypes: ['road_admin'],
      reasonTemplate: '道路に関わる工事対象・作業が選択されています',
      priority: 10,
    },
    {
      ruleCode: 'R-RIVER-WORK',
      version: 1,
      condition: {
        any: [
          { includes: { field: 'assetTypes', value: 'river' } },
          { includes: { field: 'workTypes', value: 'drainage' } },
          { includes: { field: 'impactTypes', value: 'water_area_use' } },
        ],
      },
      targetTypes: ['river_admin'],
      reasonTemplate: '河川・水域に関わる条件が選択されています',
      priority: 15,
    },
    {
      ruleCode: 'R-PORT-WORK',
      version: 1,
      condition: {
        any: [
          { includes: { field: 'assetTypes', value: 'port' } },
          { includes: { field: 'assetTypes', value: 'coast' } },
          { includes: { field: 'impactTypes', value: 'water_area_use' } },
        ],
      },
      targetTypes: ['port_admin'],
      reasonTemplate: '港湾・海岸・水域利用に関わる条件が選択されています',
      priority: 20,
    },
    {
      ruleCode: 'R-TRAFFIC-POLICE',
      version: 1,
      condition: {
        any: [
          {
            intersects: {
              field: 'workTypes',
              values: ['traffic_restriction', 'lane_restriction', 'special_vehicle'],
            },
          },
          { includes: { field: 'impactTypes', value: 'traffic_impact' } },
          { includes: { field: 'impactTypes', value: 'pedestrian_route' } },
        ],
      },
      targetTypes: ['police'],
      reasonTemplate: '交通規制・交通影響を伴う条件が選択されています',
      priority: 25,
    },
    {
      ruleCode: 'R-NOISE-MUNICIPALITY',
      version: 1,
      condition: {
        any: [
          { includes: { field: 'impactTypes', value: 'noise_vibration' } },
          { includes: { field: 'impactTypes', value: 'night_work' } },
        ],
      },
      targetTypes: ['municipality'],
      reasonTemplate: '騒音・振動・夜間作業に関わる届出確認が必要な可能性があります',
      priority: 30,
    },
  ],
};
