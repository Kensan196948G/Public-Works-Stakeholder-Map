import { describe, expect, it } from 'vitest';
import { applyReviewAction, availableReviewActions } from '../src/review.js';

describe('レビュー状態機械（無レビュー公開禁止・§6.2）', () => {
  it('pending からはレビュー開始と隔離のみ可能', () => {
    expect(applyReviewAction('pending', 'start_review')).toBe('in_review');
    expect(applyReviewAction('pending', 'quarantine')).toBe('quarantined');
    expect(applyReviewAction('pending', 'approve')).toBeNull(); // レビューなしの承認は禁止
    expect(applyReviewAction('pending', 'reject')).toBeNull();
    expect(applyReviewAction('pending', 'reopen')).toBeNull();
  });

  it('in_review からは承認・差戻し・隔離が可能', () => {
    expect(applyReviewAction('in_review', 'approve')).toBe('approved');
    expect(applyReviewAction('in_review', 'reject')).toBe('rejected');
    expect(applyReviewAction('in_review', 'quarantine')).toBe('quarantined');
    expect(applyReviewAction('in_review', 'start_review')).toBeNull();
  });

  it('approved は終端（いかなる操作も不可）', () => {
    expect(availableReviewActions('approved')).toEqual([]);
  });

  it('rejected / quarantined は reopen で再レビューへ戻せる', () => {
    expect(applyReviewAction('rejected', 'reopen')).toBe('in_review');
    expect(applyReviewAction('quarantined', 'reopen')).toBe('in_review');
    expect(applyReviewAction('rejected', 'approve')).toBeNull();
  });

  it('availableReviewActions は UI のボタン活性と一致する', () => {
    expect(availableReviewActions('pending').sort()).toEqual(['quarantine', 'start_review']);
    expect(availableReviewActions('in_review').sort()).toEqual([
      'approve',
      'quarantine',
      'reject',
    ]);
  });
});
