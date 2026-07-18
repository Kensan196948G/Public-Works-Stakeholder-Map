import type {
  BoundaryPrecision,
  ConfidenceBreakdown,
  ConfidenceGrade,
  RecordStatus,
  SourceAuthority,
} from '@pwsm/contracts';
import { freshnessElapsedRatio, isExpired } from './freshness.js';

/**
 * 信頼度計算（詳細設計仕様書 §7.3）。
 * 説明可能な加減点方式で機械学習を使わない。スコアと内訳を必ず返し、
 * 信頼度は「正しいことの保証」ではなく「データ確認優先度」を示す。
 *
 * score = authority(0..35) + freshness(0..25) + boundary_precision(0..25)
 *       + review_state(0..15) - conflicting_sources(0..25) - link_failure(0..30)
 * A: 85..100 / B: 65..84 / C: 40..64 / D: 0..39 または期限超過
 */

export interface ConfidenceInput {
  authority: SourceAuthority;
  sourceCheckedAt: Date | null;
  freshnessDueAt: Date | null;
  precision: BoundaryPrecision;
  estimated: boolean;
  reviewStatus: RecordStatus;
  conflictingSourceCount: number;
  linkFailed: boolean;
}

export interface ConfidenceResult {
  grade: ConfidenceGrade;
  breakdown: ConfidenceBreakdown;
  expired: boolean;
}

const AUTHORITY_POINTS: Record<SourceAuthority, number> = {
  primary_official: 35,
  official_catalog: 25,
  secondary_open: 10,
};

const PRECISION_POINTS: Record<BoundaryPrecision, number> = {
  official: 25,
  administrative_unit: 18,
  interpreted: 10,
  estimated: 5,
};

const REVIEW_POINTS: Record<RecordStatus, number> = {
  published: 15,
  in_review: 8,
  draft: 0,
  suspended: 0,
  retired: 0,
};

function freshnessPoints(input: ConfidenceInput, now: Date): number {
  if (input.sourceCheckedAt === null) return 0;
  if (isExpired(input.freshnessDueAt, now)) return 0;
  const ratio = freshnessElapsedRatio(input.sourceCheckedAt, input.freshnessDueAt, now);
  // 期限不明は「確認済みだが再確認周期が定まっていない」中間状態として低めに評価する。
  if (ratio === null) return 10;
  if (ratio <= 0.5) return 25;
  return 15;
}

export function calculateConfidence(input: ConfidenceInput, now: Date): ConfidenceResult {
  const expired = isExpired(input.freshnessDueAt, now);

  const authority = AUTHORITY_POINTS[input.authority];
  const freshness = freshnessPoints(input, now);
  // estimated=true は precision を official として扱えない（§5.3）。防衛的に下限へ落とす。
  const precisionKey: BoundaryPrecision = input.estimated ? 'estimated' : input.precision;
  const boundaryPrecision = PRECISION_POINTS[precisionKey];
  const reviewState = REVIEW_POINTS[input.reviewStatus];
  const conflictingSourcesPenalty = Math.min(
    25,
    Math.max(0, input.conflictingSourceCount) * 10,
  );
  const linkFailurePenalty = input.linkFailed ? 30 : 0;

  const raw =
    authority +
    freshness +
    boundaryPrecision +
    reviewState -
    conflictingSourcesPenalty -
    linkFailurePenalty;
  const total = Math.max(0, Math.min(100, raw));

  let grade: ConfidenceGrade;
  if (expired) {
    grade = 'D';
  } else if (total >= 85) {
    grade = 'A';
  } else if (total >= 65) {
    grade = 'B';
  } else if (total >= 40) {
    grade = 'C';
  } else {
    grade = 'D';
  }

  return {
    grade,
    expired,
    breakdown: {
      authority,
      freshness,
      boundaryPrecision,
      reviewState,
      conflictingSourcesPenalty,
      linkFailurePenalty,
      total,
    },
  };
}
