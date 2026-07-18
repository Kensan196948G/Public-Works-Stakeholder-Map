import type { Candidate } from '@pwsm/contracts';
import {
  CONFIDENCE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  PRECISION_LABELS,
  VERIFICATION_STATE_LABELS,
} from '../labels.js';

function formatDate(iso: string | null): string {
  if (iso === null) return '不明';
  return new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

/** 外部リンクはホスト名を明示し noopener noreferrer を付与する（§12.1） */
function EvidenceLink({ title, url }: { title: string; url: string }) {
  const host = new URL(url).hostname;
  return (
    <li>
      <a href={url} target="_blank" rel="noopener noreferrer">
        {title}
      </a>{' '}
      <span className="evidence-host">（{host}）</span>
    </li>
  );
}

/** 候補カード（SCR-03 / 設計 §9.2）。断定を避け「候補です」を常に明示する。 */
export function CandidateCard({ candidate }: { candidate: Candidate }) {
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
    </article>
  );
}
