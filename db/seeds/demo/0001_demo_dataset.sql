-- ============================================================
-- 0001_demo_dataset.sql — 架空デモデータ seed（自動生成・手編集禁止）
-- 生成元: data/fixtures (@pwsm/fixtures) / scripts/generate-demo-seed.mjs
-- 実在の機関・連絡先・管轄を一切含まない検証用データ
-- ============================================================
BEGIN;
INSERT INTO provenance.data_sources (id, name, publisher, base_url, authority, format, fetch_mode, ttl_days, allowed_host, active)
VALUES ('461edff8-ca75-4844-8a0c-eacc5b118f98', 'みらい市 契約検査課（デモ） 公式情報', 'みらい市 契約検査課（デモ）', 'https://example.com/demo/mirai-city/contract', 'primary_official', 'HTML', 'manual', 180, 'example.com', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, base_url = EXCLUDED.base_url, authority = EXCLUDED.authority, ttl_days = EXCLUDED.ttl_days, allowed_host = EXCLUDED.allowed_host, active = EXCLUDED.active;
INSERT INTO provenance.source_evidence (id, source_id, title, url, captured_at)
VALUES ('8fdd97eb-7380-48e8-81ac-e0fd330ce9e6', '461edff8-ca75-4844-8a0c-eacc5b118f98', 'みらい市 契約・入札情報（デモ）', 'https://example.com/demo/mirai-city/contract', '2026-07-01T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, title = EXCLUDED.title, url = EXCLUDED.url, captured_at = EXCLUDED.captured_at;
INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, source_checked_at, freshness_due_at)
VALUES ('61b6c075-a069-4a55-81da-790f1d178aff', 'みらい市 契約検査課（デモ）', 'みらい市 契約検査課(デモ)', 'issuer', 'https://example.com/demo/mirai-city/contract', 'published', '2026-07-01T00:00:00+09:00', '2026-12-27T15:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;
INSERT INTO core.offices (id, organization_id, name, status)
VALUES ('799ea615-4988-493d-83a9-74147dc5aa17', '61b6c075-a069-4a55-81da-790f1d178aff', '契約検査課', 'published')
ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name, status = EXCLUDED.status;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('71ed832d-b52e-4264-8909-9fa5ae669e00', '61b6c075-a069-4a55-81da-790f1d178aff', '799ea615-4988-493d-83a9-74147dc5aa17', 'administrative', 'みらい市中央地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139 35, 139.1 35, 139.1 35.1, 139 35.1, 139 35)))', 4326), 'administrative_unit', false, 'published', '8fdd97eb-7380-48e8-81ac-e0fd330ce9e6', '2026-07-01T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('4c750aac-53b7-4d08-81a3-8f125029a17f', '61b6c075-a069-4a55-81da-790f1d178aff', '799ea615-4988-493d-83a9-74147dc5aa17', 'administrative', 'みらい市臨海地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139 34.9, 139.1 34.9, 139.1 35, 139 35, 139 34.9)))', 4326), 'administrative_unit', false, 'published', '8fdd97eb-7380-48e8-81ac-e0fd330ce9e6', '2026-07-01T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO provenance.data_sources (id, name, publisher, base_url, authority, format, fetch_mode, ttl_days, allowed_host, active)
VALUES ('17710763-9a9d-4f32-8ed0-5873fb6f7094', 'みらい市 道路管理課（デモ） 公式情報', 'みらい市 道路管理課（デモ）', 'https://example.com/demo/mirai-city/road', 'primary_official', 'HTML', 'manual', 90, 'example.com', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, base_url = EXCLUDED.base_url, authority = EXCLUDED.authority, ttl_days = EXCLUDED.ttl_days, allowed_host = EXCLUDED.allowed_host, active = EXCLUDED.active;
INSERT INTO provenance.source_evidence (id, source_id, title, url, captured_at)
VALUES ('7952986d-61a9-4e39-8c26-5fa101aeb47c', '17710763-9a9d-4f32-8ed0-5873fb6f7094', 'みらい市道の管理に関する案内（デモ）', 'https://example.com/demo/mirai-city/road', '2026-07-01T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, title = EXCLUDED.title, url = EXCLUDED.url, captured_at = EXCLUDED.captured_at;
INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, source_checked_at, freshness_due_at)
VALUES ('af8f5c5b-e491-4185-8a27-ce14478203f3', 'みらい市 道路管理課（デモ）', 'みらい市 道路管理課(デモ)', 'road_admin', 'https://example.com/demo/mirai-city/road', 'published', '2026-07-01T00:00:00+09:00', '2026-09-28T15:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;
INSERT INTO core.offices (id, organization_id, name, status)
VALUES ('9e168f67-2ee7-4577-85e7-f34e6bf1ab2e', 'af8f5c5b-e491-4185-8a27-ce14478203f3', '道路管理課', 'published')
ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name, status = EXCLUDED.status;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('737f9c9a-fd4b-4421-8359-b6e440a79356', 'af8f5c5b-e491-4185-8a27-ce14478203f3', '9e168f67-2ee7-4577-85e7-f34e6bf1ab2e', 'road', 'みらい市中央地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139 35, 139.1 35, 139.1 35.1, 139 35.1, 139 35)))', 4326), 'administrative_unit', false, 'published', '7952986d-61a9-4e39-8c26-5fa101aeb47c', '2026-07-01T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('9145f351-b90a-43ba-8d8b-52cbfb05a6c7', 'af8f5c5b-e491-4185-8a27-ce14478203f3', '9e168f67-2ee7-4577-85e7-f34e6bf1ab2e', 'road', 'みらい市臨海地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139 34.9, 139.1 34.9, 139.1 35, 139 35, 139 34.9)))', 4326), 'administrative_unit', false, 'published', '7952986d-61a9-4e39-8c26-5fa101aeb47c', '2026-07-01T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO provenance.data_sources (id, name, publisher, base_url, authority, format, fetch_mode, ttl_days, allowed_host, active)
VALUES ('a709f4a1-1b9d-4204-876e-81c413123b49', 'あおぞら県 みらい土木事務所（デモ） 公式情報', 'あおぞら県 みらい土木事務所（デモ）', 'https://example.com/demo/aozora-pref/doboku', 'primary_official', 'HTML', 'manual', 90, 'example.com', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, base_url = EXCLUDED.base_url, authority = EXCLUDED.authority, ttl_days = EXCLUDED.ttl_days, allowed_host = EXCLUDED.allowed_host, active = EXCLUDED.active;
INSERT INTO provenance.source_evidence (id, source_id, title, url, captured_at)
VALUES ('c442fa11-e04d-432c-812e-4de0e1289767', 'a709f4a1-1b9d-4204-876e-81c413123b49', 'あおぞら県道の管理区域一覧（デモ）', 'https://example.com/demo/aozora-pref/doboku', '2026-06-15T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, title = EXCLUDED.title, url = EXCLUDED.url, captured_at = EXCLUDED.captured_at;
INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, source_checked_at, freshness_due_at)
VALUES ('49fe01d0-f915-4986-848e-8f24f3539d6e', 'あおぞら県 みらい土木事務所（デモ）', 'あおぞら県 みらい土木事務所(デモ)', 'road_admin', 'https://example.com/demo/aozora-pref/doboku', 'published', '2026-06-15T00:00:00+09:00', '2026-09-12T15:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;
INSERT INTO core.offices (id, organization_id, name, status)
VALUES ('ee568d20-322c-419d-8bf1-d6b1981b6ddc', '49fe01d0-f915-4986-848e-8f24f3539d6e', '道路維持担当', 'published')
ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name, status = EXCLUDED.status;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('266a4fbe-ff57-4845-84c9-7f6b69a0b4de', '49fe01d0-f915-4986-848e-8f24f3539d6e', 'ee568d20-322c-419d-8bf1-d6b1981b6ddc', 'road', 'みらい市中央地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139 35, 139.1 35, 139.1 35.1, 139 35.1, 139 35)))', 4326), 'administrative_unit', false, 'published', 'c442fa11-e04d-432c-812e-4de0e1289767', '2026-06-15T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('5a277af5-6740-4fc4-8030-82cce631bd22', '49fe01d0-f915-4986-848e-8f24f3539d6e', 'ee568d20-322c-419d-8bf1-d6b1981b6ddc', 'road', 'あおぞら町河川沿い地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139.1 35, 139.2 35, 139.2 35.1, 139.1 35.1, 139.1 35)))', 4326), 'administrative_unit', false, 'published', 'c442fa11-e04d-432c-812e-4de0e1289767', '2026-06-15T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO provenance.data_sources (id, name, publisher, base_url, authority, format, fetch_mode, ttl_days, allowed_host, active)
VALUES ('fe7344f4-cf3f-41c8-8e0c-40fe3fe1cf08', 'あおぞら県 河川整備課（デモ） 公式情報', 'あおぞら県 河川整備課（デモ）', 'https://example.com/demo/aozora-pref/river', 'primary_official', 'HTML', 'manual', 90, 'example.com', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, base_url = EXCLUDED.base_url, authority = EXCLUDED.authority, ttl_days = EXCLUDED.ttl_days, allowed_host = EXCLUDED.allowed_host, active = EXCLUDED.active;
INSERT INTO provenance.source_evidence (id, source_id, title, url, captured_at)
VALUES ('f98d4a54-6eac-4b13-88ff-35b0df15d4bd', 'fe7344f4-cf3f-41c8-8e0c-40fe3fe1cf08', 'あおぞら県管理河川の一覧（デモ）', 'https://example.com/demo/aozora-pref/river', '2026-05-01T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, title = EXCLUDED.title, url = EXCLUDED.url, captured_at = EXCLUDED.captured_at;
INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, source_checked_at, freshness_due_at)
VALUES ('c7df5057-8dd2-460b-898d-0e386a83590e', 'あおぞら県 河川整備課（デモ）', 'あおぞら県 河川整備課(デモ)', 'river_admin', 'https://example.com/demo/aozora-pref/river', 'published', '2026-05-01T00:00:00+09:00', '2026-07-29T15:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;
INSERT INTO core.offices (id, organization_id, name, status)
VALUES ('01836b5b-4804-4892-8889-91bb6c942eeb', 'c7df5057-8dd2-460b-898d-0e386a83590e', '河川整備課', 'published')
ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name, status = EXCLUDED.status;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('e7cda1f7-987f-475d-8f9d-dc5c25fd149f', 'c7df5057-8dd2-460b-898d-0e386a83590e', '01836b5b-4804-4892-8889-91bb6c942eeb', 'river', 'あおぞら町河川沿い地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139.1 35, 139.2 35, 139.2 35.1, 139.1 35.1, 139.1 35)))', 4326), 'interpreted', false, 'published', 'f98d4a54-6eac-4b13-88ff-35b0df15d4bd', '2026-05-01T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO provenance.data_sources (id, name, publisher, base_url, authority, format, fetch_mode, ttl_days, allowed_host, active)
VALUES ('48893b7b-1843-4294-871d-6b7e97e75e70', 'みらい港 港湾管理事務所（デモ） 公式情報', 'みらい港 港湾管理事務所（デモ）', 'https://example.com/demo/mirai-port/kanri', 'official_catalog', 'HTML', 'manual', 120, 'example.com', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, base_url = EXCLUDED.base_url, authority = EXCLUDED.authority, ttl_days = EXCLUDED.ttl_days, allowed_host = EXCLUDED.allowed_host, active = EXCLUDED.active;
INSERT INTO provenance.source_evidence (id, source_id, title, url, captured_at)
VALUES ('2e76b5c3-12c9-47fb-8ed3-37128afaaa1a', '48893b7b-1843-4294-871d-6b7e97e75e70', 'みらい港 港湾区域の案内（デモ）', 'https://example.com/demo/mirai-port/kanri', '2026-07-10T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, title = EXCLUDED.title, url = EXCLUDED.url, captured_at = EXCLUDED.captured_at;
INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, source_checked_at, freshness_due_at)
VALUES ('a5ecf9cb-005f-4fa4-8653-df77299ef7b7', 'みらい港 港湾管理事務所（デモ）', 'みらい港 港湾管理事務所(デモ)', 'port_admin', 'https://example.com/demo/mirai-port/kanri', 'published', '2026-07-10T00:00:00+09:00', '2026-11-06T15:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;
INSERT INTO core.offices (id, organization_id, name, status)
VALUES ('7f89fe2e-6789-4aa6-866b-3c93a3e7e7e7', 'a5ecf9cb-005f-4fa4-8653-df77299ef7b7', '港湾管理事務所', 'published')
ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name, status = EXCLUDED.status;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('3fb94252-5a9b-483f-8c3c-3b8ba7fc438b', 'a5ecf9cb-005f-4fa4-8653-df77299ef7b7', '7f89fe2e-6789-4aa6-866b-3c93a3e7e7e7', 'port', 'みらい市臨海地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139 34.9, 139.1 34.9, 139.1 35, 139 35, 139 34.9)))', 4326), 'administrative_unit', false, 'published', '2e76b5c3-12c9-47fb-8ed3-37128afaaa1a', '2026-07-10T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO provenance.data_sources (id, name, publisher, base_url, authority, format, fetch_mode, ttl_days, allowed_host, active)
VALUES ('8c0fdf3d-411a-4001-8163-08987f98a212', 'あおぞら県警察 みらい警察署（デモ） 公式情報', 'あおぞら県警察 みらい警察署（デモ）', 'https://example.com/demo/aozora-police/mirai', 'official_catalog', 'HTML', 'manual', 90, 'example.com', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, base_url = EXCLUDED.base_url, authority = EXCLUDED.authority, ttl_days = EXCLUDED.ttl_days, allowed_host = EXCLUDED.allowed_host, active = EXCLUDED.active;
INSERT INTO provenance.source_evidence (id, source_id, title, url, captured_at)
VALUES ('b896a5f0-6ba2-4d65-8422-491253adf208', '8c0fdf3d-411a-4001-8163-08987f98a212', '警察署管轄区域データ（デモ・推定含む）', 'https://example.com/demo/aozora-police/mirai', '2026-06-20T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, title = EXCLUDED.title, url = EXCLUDED.url, captured_at = EXCLUDED.captured_at;
INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, source_checked_at, freshness_due_at)
VALUES ('837c063e-425e-42bd-833a-c57082836c79', 'あおぞら県警察 みらい警察署（デモ）', 'あおぞら県警察 みらい警察署(デモ)', 'police', 'https://example.com/demo/aozora-police/mirai', 'published', '2026-06-20T00:00:00+09:00', '2026-09-17T15:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;
INSERT INTO core.offices (id, organization_id, name, status)
VALUES ('1f215949-153e-430e-8112-361d10a0e0fb', '837c063e-425e-42bd-833a-c57082836c79', '交通課', 'published')
ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name, status = EXCLUDED.status;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('fc89ae3a-f138-4146-8515-4a17c4c94258', '837c063e-425e-42bd-833a-c57082836c79', '1f215949-153e-430e-8112-361d10a0e0fb', 'police', 'みらい市中央地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139 35, 139.1 35, 139.1 35.1, 139 35.1, 139 35)))', 4326), 'estimated', true, 'published', 'b896a5f0-6ba2-4d65-8422-491253adf208', '2026-06-20T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('ce5f61ed-79ba-4454-84c2-70f8791036a1', '837c063e-425e-42bd-833a-c57082836c79', '1f215949-153e-430e-8112-361d10a0e0fb', 'police', 'みらい市臨海地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139 34.9, 139.1 34.9, 139.1 35, 139 35, 139 34.9)))', 4326), 'estimated', true, 'published', 'b896a5f0-6ba2-4d65-8422-491253adf208', '2026-06-20T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('40443a1d-eff5-4944-8a83-cf5b422bd16c', '837c063e-425e-42bd-833a-c57082836c79', '1f215949-153e-430e-8112-361d10a0e0fb', 'police', 'あおぞら町河川沿い地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139.1 35, 139.2 35, 139.2 35.1, 139.1 35.1, 139.1 35)))', 4326), 'estimated', true, 'published', 'b896a5f0-6ba2-4d65-8422-491253adf208', '2026-06-20T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO provenance.data_sources (id, name, publisher, base_url, authority, format, fetch_mode, ttl_days, allowed_host, active)
VALUES ('e45b2c22-ba5b-41a2-8ea3-754efb9a8075', 'みらい市 環境保全課（デモ） 公式情報', 'みらい市 環境保全課（デモ）', 'https://example.com/demo/mirai-city/kankyo', 'primary_official', 'HTML', 'manual', 180, 'example.com', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, base_url = EXCLUDED.base_url, authority = EXCLUDED.authority, ttl_days = EXCLUDED.ttl_days, allowed_host = EXCLUDED.allowed_host, active = EXCLUDED.active;
INSERT INTO provenance.source_evidence (id, source_id, title, url, captured_at)
VALUES ('b68b1290-022c-408f-8512-05958ff45eed', 'e45b2c22-ba5b-41a2-8ea3-754efb9a8075', 'みらい市 騒音・振動の届出案内（デモ）', 'https://example.com/demo/mirai-city/kankyo', '2026-07-05T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, title = EXCLUDED.title, url = EXCLUDED.url, captured_at = EXCLUDED.captured_at;
INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, source_checked_at, freshness_due_at)
VALUES ('b23450b7-b94c-4689-80cb-5decfc494e08', 'みらい市 環境保全課（デモ）', 'みらい市 環境保全課(デモ)', 'municipality', 'https://example.com/demo/mirai-city/kankyo', 'published', '2026-07-05T00:00:00+09:00', '2026-12-31T15:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;
INSERT INTO core.offices (id, organization_id, name, status)
VALUES ('21c61136-35ec-4cc0-8c13-638373cb6cf4', 'b23450b7-b94c-4689-80cb-5decfc494e08', '環境保全課', 'published')
ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name, status = EXCLUDED.status;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('d7bd2c94-f8c3-4719-87e7-4da8d95ce06e', 'b23450b7-b94c-4689-80cb-5decfc494e08', '21c61136-35ec-4cc0-8c13-638373cb6cf4', 'administrative', 'みらい市中央地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139 35, 139.1 35, 139.1 35.1, 139 35.1, 139 35)))', 4326), 'administrative_unit', false, 'published', 'b68b1290-022c-408f-8512-05958ff45eed', '2026-07-05T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('aa54dec0-2ade-4064-8149-13902c4f22f3', 'b23450b7-b94c-4689-80cb-5decfc494e08', '21c61136-35ec-4cc0-8c13-638373cb6cf4', 'administrative', 'みらい市臨海地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139 34.9, 139.1 34.9, 139.1 35, 139 35, 139 34.9)))', 4326), 'administrative_unit', false, 'published', 'b68b1290-022c-408f-8512-05958ff45eed', '2026-07-05T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO provenance.data_sources (id, name, publisher, base_url, authority, format, fetch_mode, ttl_days, allowed_host, active)
VALUES ('be708734-0fbb-4fba-812e-cc855c240548', 'あおぞら町 建設課（デモ） 公式情報', 'あおぞら町 建設課（デモ）', 'https://example.com/demo/aozora-town/kensetsu', 'primary_official', 'HTML', 'manual', 90, 'example.com', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, publisher = EXCLUDED.publisher, base_url = EXCLUDED.base_url, authority = EXCLUDED.authority, ttl_days = EXCLUDED.ttl_days, allowed_host = EXCLUDED.allowed_host, active = EXCLUDED.active;
INSERT INTO provenance.source_evidence (id, source_id, title, url, captured_at)
VALUES ('5627a499-946a-4fc0-8b1c-42a8d077b12e', 'be708734-0fbb-4fba-812e-cc855c240548', 'あおぞら町 建設課 窓口案内（デモ・確認期限超過の検証用）', 'https://example.com/demo/aozora-town/kensetsu', '2026-01-10T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET source_id = EXCLUDED.source_id, title = EXCLUDED.title, url = EXCLUDED.url, captured_at = EXCLUDED.captured_at;
INSERT INTO core.organizations (id, canonical_name, normalized_name, organization_type, official_url, status, source_checked_at, freshness_due_at)
VALUES ('ca95294d-4e61-493d-8ee6-a1f5558c16c9', 'あおぞら町 建設課（デモ）', 'あおぞら町 建設課(デモ)', 'municipality', 'https://example.com/demo/aozora-town/kensetsu', 'published', '2026-01-10T00:00:00+09:00', '2026-04-09T15:00:00.000Z')
ON CONFLICT (id) DO UPDATE SET canonical_name = EXCLUDED.canonical_name, normalized_name = EXCLUDED.normalized_name, organization_type = EXCLUDED.organization_type, official_url = EXCLUDED.official_url, status = EXCLUDED.status, source_checked_at = EXCLUDED.source_checked_at, freshness_due_at = EXCLUDED.freshness_due_at;
INSERT INTO core.offices (id, organization_id, name, status)
VALUES ('aedfd68f-dca5-435b-86e4-3dd56c74617c', 'ca95294d-4e61-493d-8ee6-a1f5558c16c9', '建設課', 'published')
ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name, status = EXCLUDED.status;
INSERT INTO core.jurisdictions (id, organization_id, office_id, asset_type, asset_name, geometry, precision, estimated, status, evidence_id, source_checked_at)
VALUES ('69b93a1f-54dc-4599-8144-c638b2bb1ad8', 'ca95294d-4e61-493d-8ee6-a1f5558c16c9', 'aedfd68f-dca5-435b-86e4-3dd56c74617c', 'administrative', 'あおぞら町河川沿い地区（デモ）', ST_GeomFromText('MULTIPOLYGON(((139.1 35, 139.2 35, 139.2 35.1, 139.1 35.1, 139.1 35)))', 4326), 'administrative_unit', false, 'published', '5627a499-946a-4fc0-8b1c-42a8d077b12e', '2026-01-10T00:00:00+09:00')
ON CONFLICT (id) DO UPDATE SET asset_type = EXCLUDED.asset_type, asset_name = EXCLUDED.asset_name, geometry = EXCLUDED.geometry, precision = EXCLUDED.precision, estimated = EXCLUDED.estimated, status = EXCLUDED.status, evidence_id = EXCLUDED.evidence_id, source_checked_at = EXCLUDED.source_checked_at;
INSERT INTO core.stakeholder_rules (id, rule_code, version, condition_json, target_types, reason_template, priority, status, approved_by, approved_at)
VALUES ('30c02d8f-f3cf-4745-8067-90fa7b69e663', 'R-BASE-ISSUER', 1, '{"always":true}'::jsonb, ARRAY['issuer', 'municipality']::core.organization_type[], '工事地点を含む自治体の発注・届出窓口は基本確認対象です', 5, 'published', 'demo-seed', '2026-07-18T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET condition_json = EXCLUDED.condition_json, target_types = EXCLUDED.target_types, reason_template = EXCLUDED.reason_template, priority = EXCLUDED.priority, status = EXCLUDED.status;
INSERT INTO core.stakeholder_rules (id, rule_code, version, condition_json, target_types, reason_template, priority, status, approved_by, approved_at)
VALUES ('26bc5b5e-31df-4533-826a-15e3faf5172c', 'R-ROAD-WORK', 1, '{"any":[{"includes":{"field":"assetTypes","value":"road"}},{"intersects":{"field":"workTypes","values":["excavation","occupation","special_vehicle"]}}]}'::jsonb, ARRAY['road_admin']::core.organization_type[], '道路に関わる工事対象・作業が選択されています', 10, 'published', 'demo-seed', '2026-07-18T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET condition_json = EXCLUDED.condition_json, target_types = EXCLUDED.target_types, reason_template = EXCLUDED.reason_template, priority = EXCLUDED.priority, status = EXCLUDED.status;
INSERT INTO core.stakeholder_rules (id, rule_code, version, condition_json, target_types, reason_template, priority, status, approved_by, approved_at)
VALUES ('5bf6c989-abbd-4218-8066-6a202d9c9430', 'R-RIVER-WORK', 1, '{"any":[{"includes":{"field":"assetTypes","value":"river"}},{"includes":{"field":"workTypes","value":"drainage"}},{"includes":{"field":"impactTypes","value":"water_area_use"}}]}'::jsonb, ARRAY['river_admin']::core.organization_type[], '河川・水域に関わる条件が選択されています', 15, 'published', 'demo-seed', '2026-07-18T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET condition_json = EXCLUDED.condition_json, target_types = EXCLUDED.target_types, reason_template = EXCLUDED.reason_template, priority = EXCLUDED.priority, status = EXCLUDED.status;
INSERT INTO core.stakeholder_rules (id, rule_code, version, condition_json, target_types, reason_template, priority, status, approved_by, approved_at)
VALUES ('8e1f1ccc-e1ce-4449-886b-3a084fadf24c', 'R-PORT-WORK', 1, '{"any":[{"includes":{"field":"assetTypes","value":"port"}},{"includes":{"field":"assetTypes","value":"coast"}},{"includes":{"field":"impactTypes","value":"water_area_use"}}]}'::jsonb, ARRAY['port_admin']::core.organization_type[], '港湾・海岸・水域利用に関わる条件が選択されています', 20, 'published', 'demo-seed', '2026-07-18T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET condition_json = EXCLUDED.condition_json, target_types = EXCLUDED.target_types, reason_template = EXCLUDED.reason_template, priority = EXCLUDED.priority, status = EXCLUDED.status;
INSERT INTO core.stakeholder_rules (id, rule_code, version, condition_json, target_types, reason_template, priority, status, approved_by, approved_at)
VALUES ('56d3ab32-c696-4522-87ef-8425ad4573d6', 'R-TRAFFIC-POLICE', 1, '{"any":[{"intersects":{"field":"workTypes","values":["traffic_restriction","lane_restriction","special_vehicle"]}},{"includes":{"field":"impactTypes","value":"traffic_impact"}},{"includes":{"field":"impactTypes","value":"pedestrian_route"}}]}'::jsonb, ARRAY['police']::core.organization_type[], '交通規制・交通影響を伴う条件が選択されています', 25, 'published', 'demo-seed', '2026-07-18T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET condition_json = EXCLUDED.condition_json, target_types = EXCLUDED.target_types, reason_template = EXCLUDED.reason_template, priority = EXCLUDED.priority, status = EXCLUDED.status;
INSERT INTO core.stakeholder_rules (id, rule_code, version, condition_json, target_types, reason_template, priority, status, approved_by, approved_at)
VALUES ('7d130822-792a-4011-805d-f69f3cc11a28', 'R-NOISE-MUNICIPALITY', 1, '{"any":[{"includes":{"field":"impactTypes","value":"noise_vibration"}},{"includes":{"field":"impactTypes","value":"night_work"}}]}'::jsonb, ARRAY['municipality']::core.organization_type[], '騒音・振動・夜間作業に関わる届出確認が必要な可能性があります', 30, 'published', 'demo-seed', '2026-07-18T00:00:00Z')
ON CONFLICT (id) DO UPDATE SET condition_json = EXCLUDED.condition_json, target_types = EXCLUDED.target_types, reason_template = EXCLUDED.reason_template, priority = EXCLUDED.priority, status = EXCLUDED.status;
COMMIT;
