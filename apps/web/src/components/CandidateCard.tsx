import { useState } from 'react';
import type { Candidate, ContactPointDetail } from '@pwsm/contracts';
import { ApiError, fetchOrganizationDetail } from '../api.js';
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

interface CandidateCardProps {
  candidate: Candidate;
  /** 利用者のチェックリスト判断（FR-009）。未判断は undefined */
  decision: ChecklistEntry | undefined;
  onDecisionChange: (patch: { state?: DecisionState | null; note?: string }) => void;
}

const DECISION_STATES: readonly DecisionState[] = ['candidate', 'needs_inquiry', 'excluded'];

const CONTACT_TYPE_LABELS: Record<ContactPointDetail['contactType'], string> = {
  phone: '電話',
  web: 'Web',
  email: 'メール',
  counter: '窓口',
};

function formatDate(iso: string | null): string {
  if (iso === null) return '不明';
  return new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

/** 候補カード（SCR-03 / 設計 §9.2）。断定を避け「候補です」を常に明示する。 */
export function CandidateCard({ candidate, decision, onDecisionChange }: CandidateCardProps) {
  const expired = candidate.verificationState === 'expired';
  // 詳細（FR-005）: 初回展開時に API を呼び、以後は保持する
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchOrganizationDetail>> | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function toggleDetail() {
    const nextOpen = !detailOpen;
    setDetailOpen(nextOpen);
    if (nextOpen && detail === null && detailError === null) {
      setDetailLoading(true);
      try {
        setDetail(await fetchOrganizationDetail(candidate.organizationId));
      } catch (e) {
        setDetailError(
          e instanceof ApiError ? e.message : '機関詳細の取得に失敗しました。',
        );
      } finally {
        setDetailLoading(false);
      }
    }
  }

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

      <details
        className="candidate-detail"
        open={detailOpen}
        onToggle={(e) => {
          if (e.currentTarget.open !== detailOpen) void toggleDetail();
        }}
      >
        <summary>📋 機関詳細（窓口・連絡先・管轄区域）を開く</summary>
        {detailLoading && <p className="placeholder">読込中…</p>}
        {detailError !== null && (
          <p className="error" role="alert">
            {detailError}
          </p>
        )}
        {detail !== null && (
          <div className="candidate-detail-body">
            <dl>
              <dt>公式URL</dt>
              <dd>
                {detail.officialUrl === null ? (
                  '—'
                ) : (
                  <a href={detail.officialUrl} target="_blank" rel="noopener noreferrer">
                    {new URL(detail.officialUrl).hostname}
                  </a>
                )}
              </dd>
              <dt>原典確認日</dt>
              <dd>{formatDate(detail.sourceCheckedAt)}</dd>
              <dt>次回確認期限</dt>
              <dd>{formatDate(detail.freshnessDueAt)}</dd>
            </dl>

            {detail.offices.length > 0 && (
              <div className="detail-section">
                <h4>窓口・部署</h4>
                <ul>
                  {detail.offices.map((office) => (
                    <li key={office.id}>
                      <strong>{office.name}</strong>
                      {office.roleSummary !== null && ` — ${office.roleSummary}`}
                      {office.addressRaw !== null && `（${office.addressRaw}）`}
                      {office.receptionNote !== null && ` / ${office.receptionNote}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.contactPoints.length > 0 && (
              <div className="detail-section">
                <h4>連絡先（公式情報より）</h4>
                <ul>
                  {detail.contactPoints.map((contact) => (
                    <li key={contact.id}>
                      {CONTACT_TYPE_LABELS[contact.contactType]}: {contact.displayValue}
                      {contact.extension !== null && `（内線 ${contact.extension}）`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.jurisdictions.length > 0 && (
              <div className="detail-section">
                <h4>管轄区域（視覚補助・正式境界ではない）</h4>
                <ul>
                  {detail.jurisdictions.map((jurisdiction) => (
                    <li key={jurisdiction.id}>
                      {jurisdiction.assetName ?? jurisdiction.assetType}
                      {`（${PRECISION_LABELS[jurisdiction.precision]}${jurisdiction.estimated ? '・推定' : ''}）`}
                      {jurisdiction.evidence.map((evidence) => (
                        <EvidenceLink key={evidence.url} title={evidence.title} url={evidence.url} />
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </details>

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
