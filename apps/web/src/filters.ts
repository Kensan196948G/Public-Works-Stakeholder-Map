import type {
  Candidate,
  ConfidenceGrade,
  OrganizationType,
  VerificationState,
} from '@pwsm/contracts';

/**
 * 候補一覧の絞り込み・並び替え（FR-008）。
 * クライアント側で即時適用し、サーバー再検索なしで確認しやすくする。
 * 絞り込みは「候補を隠す」ため、既定は全表示（不確実な候補を除外しない設計原則に従う）。
 */

export type CandidateSort = 'default' | 'confidence' | 'name' | 'freshness';

export interface CandidateFilters {
  /** 空配列 = 全種別 */
  types: readonly OrganizationType[];
  /** 空配列 = 全信頼度 */
  confidenceGrades: readonly ConfidenceGrade[];
  /** 空配列 = 全確認状態 */
  verificationStates: readonly VerificationState[];
  onlyExpired: boolean;
  onlyEstimated: boolean;
}

export const DEFAULT_FILTERS: CandidateFilters = {
  types: [],
  confidenceGrades: [],
  verificationStates: [],
  onlyExpired: false,
  onlyEstimated: false,
};

const GRADE_ORDER: Record<ConfidenceGrade, number> = { A: 0, B: 1, C: 2, D: 3 };

export function filterCandidates(
  candidates: readonly Candidate[],
  filters: CandidateFilters,
): Candidate[] {
  return candidates.filter((candidate) => {
    if (filters.types.length > 0 && !filters.types.includes(candidate.type)) return false;
    if (
      filters.confidenceGrades.length > 0 &&
      !filters.confidenceGrades.includes(candidate.confidence)
    ) {
      return false;
    }
    if (
      filters.verificationStates.length > 0 &&
      !filters.verificationStates.includes(candidate.verificationState)
    ) {
      return false;
    }
    if (filters.onlyExpired && candidate.verificationState !== 'expired') return false;
    if (filters.onlyEstimated && !candidate.estimated) return false;
    return true;
  });
}

/** 表示順: 既定（種別→信頼度→名称）、信頼度、名称、鮮度（期限が近い順・不明は末尾） */
export function sortCandidates(
  candidates: readonly Candidate[],
  sort: CandidateSort,
): Candidate[] {
  const list = [...candidates];
  const freshnessTime = (candidate: Candidate): number => {
    if (candidate.freshnessDueAt === null) return Number.MAX_SAFE_INTEGER;
    const t = Date.parse(candidate.freshnessDueAt);
    return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
  };
  const byFreshness = (a: Candidate, b: Candidate): number => freshnessTime(a) - freshnessTime(b);
  const byConfidence = (a: Candidate, b: Candidate): number =>
    GRADE_ORDER[a.confidence] - GRADE_ORDER[b.confidence];
  const byName = (a: Candidate, b: Candidate): number => a.name.localeCompare(b.name, 'ja');

  switch (sort) {
    case 'confidence':
      return list.sort((a, b) => byConfidence(a, b) || byName(a, b));
    case 'name':
      return list.sort(byName);
    case 'freshness':
      return list.sort((a, b) => byFreshness(a, b) || byConfidence(a, b) || byName(a, b));
    case 'default':
    default:
      // サーバー既定順（種別→信頼度→名称）は response の並び順を維持する
      return list;
  }
}

export const SORT_LABELS: Record<CandidateSort, string> = {
  default: '既定順',
  confidence: '信頼度順',
  name: '名称順',
  freshness: '確認期限が近い順',
};

export const SORT_OPTIONS: readonly CandidateSort[] = [
  'default',
  'confidence',
  'name',
  'freshness',
];
