import { REQUIRED_DISCLAIMER } from '@pwsm/contracts';

/** 必須免責の常時表示（要件 FR-007 / §9.1）。閉じる操作は提供しない。 */
export function DisclaimerBanner() {
  return (
    <aside className="disclaimer" role="note" aria-label="利用上の注意">
      ⚠️ {REQUIRED_DISCLAIMER}
    </aside>
  );
}
