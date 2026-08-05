import type { Candidate } from '@pwsm/contracts';
import {
  CONFIDENCE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  VERIFICATION_STATE_LABELS,
} from '../labels.js';
import {
  SORT_LABELS,
  SORT_OPTIONS,
  type CandidateFilters,
  type CandidateSort,
} from '../filters.js';

/** 候補一覧の絞り込み・並び替えツールバー（FR-008） */
export function CandidateToolbar({
  candidates,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  visibleCount,
}: {
  candidates: readonly Candidate[];
  filters: CandidateFilters;
  onFiltersChange: (next: CandidateFilters) => void;
  sort: CandidateSort;
  onSortChange: (next: CandidateSort) => void;
  visibleCount: number;
}) {
  const types = [...new Set(candidates.map((c) => c.type))].sort(
    (a, b) => (ORGANIZATION_TYPE_LABELS[a] ?? a).localeCompare(ORGANIZATION_TYPE_LABELS[b] ?? b, 'ja'),
  );
  const grades = [...new Set(candidates.map((c) => c.confidence))].sort();
  const states = [...new Set(candidates.map((c) => c.verificationState))].sort();

  function update(patch: Partial<CandidateFilters>) {
    onFiltersChange({ ...filters, ...patch });
  }

  return (
    <div className="candidate-toolbar" role="group" aria-label="候補一覧の絞り込み">
      <label>
        種別
        <select
          value={filters.types.length === 1 ? filters.types[0] : ''}
          onChange={(e) =>
            update({ types: e.target.value === '' ? [] : [e.target.value as never] })
          }
        >
          <option value="">すべて</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {ORGANIZATION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </label>
      <label>
        信頼度
        <select
          value={filters.confidenceGrades.length === 1 ? filters.confidenceGrades[0] : ''}
          onChange={(e) =>
            update({
              confidenceGrades: e.target.value === '' ? [] : [e.target.value as never],
            })
          }
        >
          <option value="">すべて</option>
          {grades.map((grade) => (
            <option key={grade} value={grade}>
              {CONFIDENCE_LABELS[grade]}
            </option>
          ))}
        </select>
      </label>
      <label>
        確認状態
        <select
          value={
            filters.verificationStates.length === 1 ? filters.verificationStates[0] : ''
          }
          onChange={(e) =>
            update({
              verificationStates: e.target.value === '' ? [] : [e.target.value as never],
            })
          }
        >
          <option value="">すべて</option>
          {states.map((state) => (
            <option key={state} value={state}>
              {VERIFICATION_STATE_LABELS[state]}
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-check">
        <input
          type="checkbox"
          checked={filters.onlyExpired}
          onChange={(e) => update({ onlyExpired: e.target.checked })}
        />
        期限超過のみ
      </label>
      <label className="toolbar-check">
        <input
          type="checkbox"
          checked={filters.onlyEstimated}
          onChange={(e) => update({ onlyEstimated: e.target.checked })}
        />
        推定区域のみ
      </label>
      <label>
        並び替え
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as CandidateSort)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {SORT_LABELS[option]}
            </option>
          ))}
        </select>
      </label>
      <p className="toolbar-count" aria-live="polite">
        表示 {visibleCount} / {candidates.length} 件
      </p>
    </div>
  );
}
