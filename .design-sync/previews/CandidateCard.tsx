import { CandidateCard } from '@pwsm/web';

// 架空デモデータ（実在機関を含まない）。実アプリの検索応答と同形。
const baseBreakdown = {
  authority: 35,
  freshness: 25,
  boundaryPrecision: 18,
  reviewState: 15,
  conflictingSourcesPenalty: 0,
  linkFailurePenalty: 0,
  total: 93,
};

const roadAdmin = {
  organizationId: 'org-demo-0002',
  name: 'みらい市 道路管理課（デモ）',
  type: 'road_admin' as const,
  officeName: '道路管理課',
  confidence: 'A' as const,
  confidenceBreakdown: baseBreakdown,
  verificationState: 'unverified' as const,
  reasons: [
    '指定地点が「みらい市中央地区（デモ）」の区域に含まれます',
    '道路に関わる工事対象・作業が選択されています',
  ],
  precision: 'administrative_unit' as const,
  estimated: false,
  sourceCheckedAt: '2026-06-30T15:00:00.000Z',
  freshnessDueAt: '2026-09-28T15:00:00.000Z',
  evidence: [
    {
      title: 'みらい市道の管理に関する案内（デモ）',
      url: 'https://example.com/demo/mirai-city/road',
      sourceCheckedAt: '2026-07-01T00:00:00+09:00',
    },
  ],
};

/** 信頼度 A・未確認の標準カード */
export const GradeA = () => (
  <CandidateCard candidate={roadAdmin} decision={undefined} onDecisionChange={() => {}} />
);

/** 推定管轄（警察）— 推定区域の警告が出る状態 */
export const EstimatedPolice = () => (
  <CandidateCard
    candidate={{
      ...roadAdmin,
      organizationId: 'org-demo-0006',
      name: 'あおぞら県警察 みらい警察署（デモ）',
      type: 'police',
      officeName: '交通課',
      confidence: 'B',
      confidenceBreakdown: { ...baseBreakdown, authority: 25, boundaryPrecision: 5, total: 70 },
      reasons: ['交通規制・交通影響を伴う条件が選択されています'],
      precision: 'estimated',
      estimated: true,
      evidence: [
        {
          title: '警察署管轄区域データ（デモ・推定含む）',
          url: 'https://example.com/demo/aozora-police/mirai',
          sourceCheckedAt: '2026-06-20T00:00:00+09:00',
        },
      ],
    }}
    decision={undefined}
    onDecisionChange={() => {}}
  />
);

/** 期限超過（D）— 再確認警告 + 利用者判断「要照会」+ メモ入り */
export const ExpiredWithDecision = () => (
  <CandidateCard
    candidate={{
      ...roadAdmin,
      organizationId: 'org-demo-0008',
      name: 'あおぞら町 建設課（デモ）',
      type: 'municipality',
      officeName: '建設課',
      confidence: 'D',
      confidenceBreakdown: { ...baseBreakdown, freshness: 0, total: 68 },
      verificationState: 'expired',
      reasons: ['指定地点が「あおぞら町河川沿い地区（デモ）」の区域に含まれます'],
      sourceCheckedAt: '2026-01-09T15:00:00.000Z',
      freshnessDueAt: '2026-04-09T15:00:00.000Z',
      evidence: [
        {
          title: 'あおぞら町 建設課 窓口案内（デモ）',
          url: 'https://example.com/demo/aozora-town/kensetsu',
          sourceCheckedAt: '2026-01-10T00:00:00+09:00',
        },
      ],
    }}
    decision={{ state: 'needs_inquiry', note: '管轄範囲が不明なため電話で確認する', decidedAt: '2026-07-18T00:00:00Z' }}
    onDecisionChange={() => {}}
  />
);

/** 利用者判断「協議候補」選択済みの状態 */
export const DecidedCandidate = () => (
  <CandidateCard
    candidate={roadAdmin}
    decision={{ state: 'candidate', note: '掘削範囲の図面を持参して協議', decidedAt: '2026-07-18T00:00:00Z' }}
    onDecisionChange={() => {}}
  />
);
