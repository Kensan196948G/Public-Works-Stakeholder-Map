import type { Candidate } from '@pwsm/contracts';
import {
  DECISION_LABELS,
  type ChecklistEntry,
  type DecisionState,
} from '../checklist.js';
import {
  CONFIDENCE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  PRECISION_LABELS,
  VERIFICATION_STATE_LABELS,
} from '../labels.js';
import { toIndexText } from '../licensing.js';

function formatDate(iso: string | null): string {
  if (iso === null) return '不明';
  return new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

/**
 * 外部リンクはホスト名を明示し noopener noreferrer を付与する（§12.1）。
 * 出典タイトルは情報源由来のテキストのため索引長へ丸める。本文相当の長文が
 * 混入しても複製にならず、内容はリンク先の原典で確認させる（§9.3）。
 */
function EvidenceLink({ title, url }: { title: string; url: string }) {
  const host = new URL(url).hostname;
  return (
    <li>
      <a href={url} target="_blank" rel="noopener noreferrer">
        {toIndexText(title)}
      </a>{' '}
      <span className="evidence-host">（{host}）</span>
    </li>
  );
}

interface CandidateCardProps {
  candidate: Candidate;
  /** 利用者のチェックリスト判断（FR-009）。未判断は undefined */
  decision: ChecklistEntry | undefined;
  onDecisionChange: (patch: { state?: DecisionState | null; note?: string }) => void;
}

const DECISION_STATES: readonly DecisionState[] = ['candidate', 'needs_inquiry', 'excluded'];

/** 候補カード（SCR-03 / 設計 §9.2）。断定を避け「候補です」を常に明示する。 */
export function CandidateCard({ candidate, decision, onDecisionChange }: CandidateCardProps) {
  const expired = candidate.verificationState === 'expired';
  return (
    <article
      className={`candidate-card confidence-${candidate.confidence}${expired ? ' expired' : ''}`}
      aria-label={candidate.name}
    >
      <header>
        <span className="org-type">{ORGANIZATION_TYPE_LABELS[candidate.type]}</span>
        <span className={`confidence-badge grade-${candidate.confidence}`}>
          信頼度 {CONFIDENCE_LABELS[candidate.confidence]}
        </span>
      </header>

      <h3>{candidate.name}</h3>
      {candidate.officeName !== null && <p className="office-name">{candidate.officeName}</p>}

      <p className="candidate-note">候補です — 正式確認が必要</p>

      {expired && (
        <p className="warning" role="alert">
          ⚠️ 確認期限を超過しています。原典の再確認が必要です。
        </p>
      )}
      {candidate.estimated && (
        <p className="warning">
          ⚠️ 管轄区域は推定です。正確な情報は該当機関へ照会してください。
        </p>
      )}

      <dl>
        <dt>確認状態</dt>
        <dd>{VERIFICATION_STATE_LABELS[candidate.verificationState]}</dd>
        <dt>データ精度</dt>
        <dd>{PRECISION_LABELS[candidate.precision]}</dd>
        <dt>原典確認日</dt>
        <dd>{formatDate(candidate.sourceCheckedAt)}</dd>
        <dt>次回確認期限</dt>
        <dd>{formatDate(candidate.freshnessDueAt)}</dd>
      </dl>

      <details open>
        <summary>一致理由（{candidate.reasons.length}件）</summary>
        <ul>
          {candidate.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </details>

      <div className="evidence">
        <h4>出典・公式情報</h4>
        <ul>
          {candidate.evidence.map((evidence) => (
            <EvidenceLink key={evidence.url} title={evidence.title} url={evidence.url} />
          ))}
        </ul>
      </div>

      <div className="decision" role="group" aria-label={`${candidate.name} の判断`}>
        <h4>✅ あなたの判断（FR-009）</h4>
        <div className="decision-buttons">
          {DECISION_STATES.map((state) => (
            <button
              key={state}
              type="button"
              className={decision?.state === state ? 'decision-active' : ''}
              aria-pressed={decision?.state === state}
              onClick={() =>
                onDecisionChange({ state: decision?.state === state ? null : state })
              }
            >
              {DECISION_LABELS[state]}
            </button>
          ))}
        </div>
        <label className="decision-note">
          確認メモ（実案件名・個人情報は記入しないでください）
          <textarea
            value={decision?.note ?? ''}
            rows={2}
            onChange={(e) => onDecisionChange({ note: e.target.value })}
          />
        </label>
      </div>
    </article>
  );
}
