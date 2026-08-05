-- ============================================================
-- 0002_feedback.sql
-- Public Works Stakeholder Map — フィードバック受付（FR-017）
-- 対象: Neon PostgreSQL
-- 方針: 個人識別情報（氏名・メール・電話）を収集しない。
--       監査ログへは本文・URL を記録しない（詳細設計 §12.2）。
-- ============================================================

BEGIN;

-- フィードバックの永続化先（workflow スキーマ）。
-- 本文は対応者が確認するため保持するが、API レスポンス・監査・一覧 API へは出さない。
CREATE TABLE IF NOT EXISTS workflow.feedback_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category        text NOT NULL CHECK (
                    category IN ('incorrect_info', 'broken_link', 'missing_org', 'ui_issue', 'other')
                  ),
  message         text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  source_url      text,
  dataset_version text NOT NULL,
  status          text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_status_created
  ON workflow.feedback_messages (status, created_at DESC);

COMMIT;
