/**
 * 鮮度・TTL 判定(要件 FR-014、詳細設計仕様書 §7.3)。
 * 「期限超過を隠さない」ことが原則。期限超過レコードは削除せず expired として識別する。
 * Invalid Date は「期限内」と誤判定させず、早期に RangeError で拒否する。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Invalid Date(getTime()=NaN)を検出して拒否する。不確実性を黙って隠さない。 */
function assertValidDate(date: Date, name: string): void {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(`${name} is an invalid Date`);
  }
}

/** 原典確認日と TTL(日数)から次回確認期限を計算する。確認日 null の場合は期限も null(不明扱い)。 */
export function calculateFreshnessDue(
  sourceCheckedAt: Date | null,
  ttlDays: number,
): Date | null {
  if (sourceCheckedAt === null) return null;
  assertValidDate(sourceCheckedAt, 'sourceCheckedAt');
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
  assertValidDate(now, 'now');
  if (freshnessDueAt === null) return false;
  assertValidDate(freshnessDueAt, 'freshnessDueAt');
  return now.getTime() > freshnessDueAt.getTime();
}

/** TTL 経過率(0=確認直後、1=期限ちょうど、>1=超過)。不明時は null。 */
export function freshnessElapsedRatio(
  sourceCheckedAt: Date | null,
  freshnessDueAt: Date | null,
  now: Date,
): number | null {
  assertValidDate(now, 'now');
  if (sourceCheckedAt === null || freshnessDueAt === null) return null;
  assertValidDate(sourceCheckedAt, 'sourceCheckedAt');
  assertValidDate(freshnessDueAt, 'freshnessDueAt');
  const total = freshnessDueAt.getTime() - sourceCheckedAt.getTime();
  if (total <= 0) return null;
  return (now.getTime() - sourceCheckedAt.getTime()) / total;
}
