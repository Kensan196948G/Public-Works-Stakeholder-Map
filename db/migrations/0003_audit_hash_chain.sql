-- ============================================================
-- 0003_audit_hash_chain.sql
-- 監査ログの改ざん検知（詳細設計 §12「改ざん検知可能な形で記録」・2026-08-12）
-- - prev_hash / event_hash を追加し、SHA-256 連結チェーンを構成する
-- - 既存行は occurred_at, id 順にバックフィルする（pgcrypto 使用）
-- - ハッシュ入力の正準形は audit-repository.ts の canonicalJson と一致させること:
--   prev_hash || occurred_at(ISO8601 UTC) || actor || action || target_kind
--   || COALESCE(target_id,'') || result || correlation_id || metadata(正準 JSON)
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE audit.audit_events ADD COLUMN IF NOT EXISTS prev_hash char(64);
ALTER TABLE audit.audit_events ADD COLUMN IF NOT EXISTS event_hash char(64);

-- 既存行のバックフィル（正準 JSON は jsonb::text = キー辞書順・空白なし）
DO $$
DECLARE
  r record;
  prev char(64) := encode(digest('pwsm-audit-genesis-v1', 'sha256'), 'hex');
BEGIN
  FOR r IN
    SELECT id FROM audit.audit_events
    WHERE event_hash IS NULL
    ORDER BY occurred_at, id
  LOOP
    UPDATE audit.audit_events
    SET prev_hash = prev,
        event_hash = encode(
          digest(
            prev
            || to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            || actor || action || target_kind || COALESCE(target_id, '')
            || result || correlation_id || metadata::text,
            'sha256'
          ),
          'hex'
        )
    WHERE id = r.id
    RETURNING event_hash INTO prev;
  END LOOP;
END $$;

COMMIT;
