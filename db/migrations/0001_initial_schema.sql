-- ============================================================
-- 0001_initial_schema.sql
-- Public Works Stakeholder Map 初期スキーマ（詳細設計仕様書 §5）
-- 対象: Neon PostgreSQL (PostGIS 拡張)
-- 方針: §5.3 の整合性制約を DB 層で強制し、不確実性を隠さない
-- ============================================================

BEGIN;

-- PostGIS は Neon で拡張として提供される（利用環境で対応確認済みであること）
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------
-- スキーマ分離（§5.1）
-- ---------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS core;        -- 公開承認済みデータ（読取可）
CREATE SCHEMA IF NOT EXISTS staging;     -- 取込直後・レビュー待ち（管理者のみ）
CREATE SCHEMA IF NOT EXISTS provenance;  -- ソース・スナップショット・根拠
CREATE SCHEMA IF NOT EXISTS workflow;    -- レビュー・検索セッション
CREATE SCHEMA IF NOT EXISTS audit;       -- 監査イベント（管理者のみ）

-- ---------------------------------------------------------------
-- 列挙型（§4.1）— organization_type / record_status / verification_state /
-- boundary_precision / source_authority は packages/contracts/src/enums.ts と一致させること
-- ---------------------------------------------------------------
CREATE TYPE core.organization_type AS ENUM (
  'issuer', 'road_admin', 'river_admin', 'port_admin',
  'police', 'prefecture', 'municipality', 'other'
);

CREATE TYPE core.record_status AS ENUM (
  'draft', 'in_review', 'published', 'suspended', 'retired'
);

CREATE TYPE core.verification_state AS ENUM (
  'unverified', 'source_checked', 'needs_inquiry',
  'candidate', 'excluded', 'expired'
);

CREATE TYPE core.boundary_precision AS ENUM (
  'official', 'administrative_unit', 'interpreted', 'estimated'
);

CREATE TYPE provenance.source_authority AS ENUM (
  'primary_official', 'official_catalog', 'secondary_open'
);

CREATE TYPE provenance.fetch_mode AS ENUM ('manual', 'scheduled', 'api');

CREATE TYPE core.contact_type AS ENUM ('phone', 'web', 'email', 'counter');

-- 管轄区域の資産種別（§5.2 jurisdictions 用）。
-- 注意: contracts の assetTypeSchema（§4.2 工事対象: coast/park 等を含む検索入力）とは
-- 別概念。Phase 1 の空間検索では両者のマッピング層を実装すること。
CREATE TYPE core.jurisdiction_asset_type AS ENUM (
  'administrative', 'road', 'river', 'port', 'police'
);

-- ---------------------------------------------------------------
-- updated_at 自動更新トリガー
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------
-- provenance.data_sources — ソース台帳（§5.2）
-- ---------------------------------------------------------------
CREATE TABLE provenance.data_sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  publisher       text NOT NULL,
  base_url        text NOT NULL,
  authority       provenance.source_authority NOT NULL,
  format          text NOT NULL,
  license_text    text,
  license_url     text,
  fetch_mode      provenance.fetch_mode NOT NULL DEFAULT 'manual',
  ttl_days        integer NOT NULL CHECK (ttl_days > 0),
  allowed_host    text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_data_sources_updated
  BEFORE UPDATE ON provenance.data_sources
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ---------------------------------------------------------------
-- provenance.source_snapshots — 取得スナップショット（§5.2）
-- 原文保存不可のソースはハッシュと抽出メタデータのみ保持する
-- ---------------------------------------------------------------
CREATE TABLE provenance.source_snapshots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid NOT NULL REFERENCES provenance.data_sources(id),
  fetched_at         timestamptz NOT NULL,
  http_status        integer,
  content_type       text,
  content_length     bigint,
  sha256             char(64),
  etag               text,
  last_modified      timestamptz,
  parser_version     text,
  storage_reference  text,
  result             text NOT NULL CHECK (result IN ('success', 'failed', 'skipped')),
  error_code         text,
  correlation_id     text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- source_evidence の複合 FK 用（snapshot と source の対応を強制する）
  CONSTRAINT uq_source_snapshots_id_source UNIQUE (id, source_id)
);

CREATE INDEX idx_source_snapshots_source_fetched
  ON provenance.source_snapshots (source_id, fetched_at DESC);

-- ---------------------------------------------------------------
-- provenance.source_evidence — 候補の根拠（出典 URL・取得日時）
-- ---------------------------------------------------------------
CREATE TABLE provenance.source_evidence (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id  uuid,
  source_id    uuid NOT NULL REFERENCES provenance.data_sources(id),
  -- snapshot を参照する場合、その snapshot が同一 source に属することを強制する
  -- （snapshot_id が NULL の場合は手動登録扱いで FK 検査対象外）
  CONSTRAINT fk_evidence_snapshot_source
    FOREIGN KEY (snapshot_id, source_id)
    REFERENCES provenance.source_snapshots (id, source_id),
  title        text NOT NULL,
  url          text NOT NULL,
  -- 原典に更新日がない場合は null のまま保持する（取得日で代用しない）
  source_published_at timestamptz,
  captured_at  timestamptz NOT NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- core.organizations — 機関（§5.2）
-- ---------------------------------------------------------------
CREATE TABLE core.organizations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name     text NOT NULL,
  normalized_name    text NOT NULL,
  organization_type  core.organization_type NOT NULL,
  parent_id          uuid REFERENCES core.organizations(id),
  government_code    varchar(10),
  official_url       text,
  status             core.record_status NOT NULL DEFAULT 'draft',
  external_source_id uuid REFERENCES provenance.data_sources(id),
  external_ref       text,
  valid_from         date,
  valid_to           date,
  source_checked_at  timestamptz,
  freshness_due_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- §5.3: 有効期間の逆転禁止
  CONSTRAINT chk_org_valid_period CHECK (
    valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from
  ),
  -- §5.3: published は出典確認情報を必須とする
  CONSTRAINT chk_org_published_provenance CHECK (
    status <> 'published' OR (official_url IS NOT NULL AND source_checked_at IS NOT NULL)
  )
);

-- §5.3: 同一ソース・同一外部 ID・同一有効期間の重複を防ぐ
-- （valid_from/valid_to の NULL は無期限として正規化し、NULL 同士のすり抜けを防ぐ）
CREATE UNIQUE INDEX uq_org_source_ref
  ON core.organizations (
    external_source_id,
    external_ref,
    COALESCE(valid_from, '-infinity'::date),
    COALESCE(valid_to, 'infinity'::date)
  )
  WHERE external_source_id IS NOT NULL AND external_ref IS NOT NULL;

CREATE INDEX idx_org_normalized_name ON core.organizations (normalized_name);
CREATE INDEX idx_org_type_status ON core.organizations (organization_type, status);

CREATE TRIGGER trg_organizations_updated
  BEFORE UPDATE ON core.organizations
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ---------------------------------------------------------------
-- core.offices — 部署・窓口（§5.2）
-- ---------------------------------------------------------------
CREATE TABLE core.offices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES core.organizations(id),
  name                text NOT NULL,
  -- 断定表現を使わない「確認対象の概要」
  role_summary        text,
  postal_code         varchar(8),
  address_raw         text,
  address_normalized  text,
  location            geography(Point, 4326),
  reception_note      text,
  status              core.record_status NOT NULL DEFAULT 'draft',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_offices_org ON core.offices (organization_id);

CREATE TRIGGER trg_offices_updated
  BEFORE UPDATE ON core.offices
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ---------------------------------------------------------------
-- core.contact_points — 連絡先（§5.2）
-- 個人名・個人メールアドレスは原則登録しない
-- ---------------------------------------------------------------
CREATE TABLE core.contact_points (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id          uuid NOT NULL REFERENCES core.offices(id),
  contact_type       core.contact_type NOT NULL,
  label              text NOT NULL,
  display_value      text NOT NULL,
  normalized_value   text NOT NULL,
  extension          text,
  -- true は一般検索結果へ出さない（§5.3）
  is_emergency       boolean NOT NULL DEFAULT false,
  source_checked_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_points_office ON core.contact_points (office_id);

CREATE TRIGGER trg_contact_points_updated
  BEFORE UPDATE ON core.contact_points
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ---------------------------------------------------------------
-- core.jurisdictions — 管轄区域（§5.2）
-- ---------------------------------------------------------------
CREATE TABLE core.jurisdictions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES core.organizations(id),
  office_id        uuid REFERENCES core.offices(id),
  asset_type       core.jurisdiction_asset_type NOT NULL,
  asset_name       text,
  geometry         geometry(MultiPolygon, 4326),
  precision        core.boundary_precision NOT NULL,
  estimated        boolean NOT NULL DEFAULT false,
  scale_note       text,
  status           core.record_status NOT NULL DEFAULT 'draft',
  valid_from       date,
  valid_to         date,
  evidence_id      uuid REFERENCES provenance.source_evidence(id),
  source_checked_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- §5.3: 推定区域を official 精度にできない
  CONSTRAINT chk_jurisdiction_estimated_precision CHECK (
    NOT estimated OR precision <> 'official'
  ),
  CONSTRAINT chk_jurisdiction_valid_period CHECK (
    valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from
  ),
  -- §5.3: published の管轄は有効な根拠と原典確認日時を必須とする
  CONSTRAINT chk_jurisdiction_published_evidence CHECK (
    status <> 'published' OR (evidence_id IS NOT NULL AND source_checked_at IS NOT NULL)
  )
);

-- 空間検索用 GiST インデックス（§5.2 / §7.2）
CREATE INDEX idx_jurisdictions_geometry
  ON core.jurisdictions USING gist (geometry);
CREATE INDEX idx_jurisdictions_org ON core.jurisdictions (organization_id);

CREATE TRIGGER trg_jurisdictions_updated
  BEFORE UPDATE ON core.jurisdictions
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ---------------------------------------------------------------
-- core.stakeholder_rules — 候補抽出ルール（§5.2）
-- condition_json は packages/domain/src/rules.ts の RuleCondition 形式
-- ---------------------------------------------------------------
CREATE TABLE core.stakeholder_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code       text NOT NULL,
  version         integer NOT NULL DEFAULT 1 CHECK (version > 0),
  condition_json  jsonb NOT NULL,
  target_types    core.organization_type[] NOT NULL,
  reason_template text NOT NULL,
  priority        integer NOT NULL DEFAULT 100,
  status          core.record_status NOT NULL DEFAULT 'draft',
  effective_from  timestamptz,
  effective_to    timestamptz,
  approved_by     text,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rule_effective_period CHECK (
    effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from
  ),
  -- 公開ルールは承認情報を必須とする
  CONSTRAINT chk_rule_published_approval CHECK (
    status <> 'published' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
  ),
  -- 同一ルールの複数バージョン共存を許容しつつ、コード+版の組を一意にする
  CONSTRAINT uq_stakeholder_rule_version UNIQUE (rule_code, version)
);

CREATE TRIGGER trg_stakeholder_rules_updated
  BEFORE UPDATE ON core.stakeholder_rules
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ---------------------------------------------------------------
-- staging.import_records — 取込ステージング（§8.1）
-- スクレイピング結果を無レビューで公開しないための隔離領域
-- ---------------------------------------------------------------
CREATE TABLE staging.import_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id    uuid REFERENCES provenance.source_snapshots(id),
  source_id      uuid NOT NULL REFERENCES provenance.data_sources(id),
  entity_kind    text NOT NULL,
  raw_payload    jsonb NOT NULL,
  normalized_payload jsonb,
  quality_flags  jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_state   text NOT NULL DEFAULT 'pending'
    CHECK (review_state IN ('pending', 'in_review', 'approved', 'rejected', 'quarantined')),
  reviewer_note  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_records_state ON staging.import_records (review_state, created_at);

CREATE TRIGGER trg_import_records_updated
  BEFORE UPDATE ON staging.import_records
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ---------------------------------------------------------------
-- workflow.search_sessions / candidate_decisions（§5.2）
-- 実案件名・個人情報を持たない。匿名セッションは短期 TTL で削除する
-- ---------------------------------------------------------------
CREATE TABLE workflow.search_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token_hash char(64) NOT NULL UNIQUE,
  -- 必要な精度のみへ一般化した地点（プライバシー配慮）
  generalized_point  geography(Point, 4326),
  conditions_json    jsonb NOT NULL,
  rule_version       integer NOT NULL,
  dataset_version    text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL
);

CREATE INDEX idx_search_sessions_expiry ON workflow.search_sessions (expires_at);

CREATE TABLE workflow.candidate_decisions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES workflow.search_sessions(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES core.organizations(id),
  verification_state core.verification_state NOT NULL DEFAULT 'unverified',
  note             text,
  decided_at       timestamptz NOT NULL DEFAULT now(),
  dataset_version  text NOT NULL
);

CREATE INDEX idx_candidate_decisions_session ON workflow.candidate_decisions (session_id);

-- ---------------------------------------------------------------
-- audit.audit_events — 監査ログ（§14）
-- 認証トークン・Cookie・電話番号全文・自由記述本文を残さない
-- ---------------------------------------------------------------
CREATE TABLE audit.audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor           text NOT NULL,
  action          text NOT NULL,
  target_kind     text NOT NULL,
  target_id       text,
  result          text NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
  correlation_id  text NOT NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_audit_events_occurred ON audit.audit_events (occurred_at DESC);
CREATE INDEX idx_audit_events_target ON audit.audit_events (target_kind, target_id);

COMMIT;
