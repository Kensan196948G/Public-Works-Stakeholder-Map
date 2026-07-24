import type { ReviewAction, ReviewState } from '@pwsm/contracts';

/**
 * 取込レビューの状態機械（詳細設計 §8 / 要件 §6.2「スクレイピング結果を無レビューで公開しない」）。
 * - approved は終端（公開反映済みの承認を書き換えない。誤りは新規取込でやり直す）
 * - quarantine はデータ汚染疑い時の隔離。reopen で再レビューへ戻す
 */

/** 各レビュー操作が許可される遷移: action → [from → to] */
const ACTION_TRANSITIONS: Record<ReviewAction, { from: readonly ReviewState[]; to: ReviewState }> = {
  start_review: { from: ['pending'], to: 'in_review' },
  approve: { from: ['in_review'], to: 'approved' },
  reject: { from: ['in_review'], to: 'rejected' },
  quarantine: { from: ['pending', 'in_review'], to: 'quarantined' },
  reopen: { from: ['rejected', 'quarantined'], to: 'in_review' },
};

/** 操作が現在状態に適用可能なら遷移先を返す。不可なら null */
export function applyReviewAction(current: ReviewState, action: ReviewAction): ReviewState | null {
  const transition = ACTION_TRANSITIONS[action];
  return transition.from.includes(current) ? transition.to : null;
}

/** 現在状態から実行可能な操作一覧（UI のボタン活性制御に使用） */
export function availableReviewActions(current: ReviewState): ReviewAction[] {
  return (Object.keys(ACTION_TRANSITIONS) as ReviewAction[]).filter(
    (action) => applyReviewAction(current, action) !== null,
  );
}
