/**
 * 鮮度・TTL 判定(要件 FR-014、詳細設計仕様書 §7.3)。
 * 「期限超過を隠さない」ことが原則。期限超過レコードは削除せず expired として識別する。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 原典確認日と TTL(日数)から次回確認期限を計算する。確認日 null の場合は期限も null(不明扱い)。 */
export function calculateFreshnessDue(
  sourceCheckedAt: Date | null,
  ttlDays: number,
): Date | null {
  if (sourceCheckedAt === null) return null;
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    throw new RangeError(`ttlDays must be a positive number: ${ttlDays}`);
  }
  return new Date(sourceCheckedAt.getTime() + ttlDays * MS_PER_DAY);
}

/**
 * 期限超過判定。期限が不明(null)の場合は「超過とみなさない」が、
 * 呼び出し側は精度・信頼度計算で不明を減点する(不確実性を保存する)。
 */
export function isExpired(freshnessDueAt: Date | null, now: Date): boolean {
  if (freshnessDueAt === null) return false;
  return now.getTime() > freshnessDueAt.getTime();
}

/** TTL 経過率(0=確認直後、1=期限ちょうど、>1=超過)。不明時は null。 */
export function freshnessElapsedRatio(
  sourceCheckedAt: Date | null,
  freshnessDueAt: Date | null,
  now: Date,
): number | null {
  if (sourceCheckedAt === null || freshnessDueAt === null) return null;
  const total = freshnessDueAt.getTime() - sourceCheckedAt.getTime();
  if (total <= 0) return null;
  return (now.getTime() - sourceCheckedAt.getTime()) / total;
}
