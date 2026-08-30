-- ============================================================
-- 0004_jurisdiction_geography_index.sql
-- 検索パフォーマンス改善（Deep Debug 2026-08-30 検出）
-- - 候補検索の半径一致（ST_DWithin）は geometry::geography キャストで実行されるため、
--   geometry 列の GiST インデックス（idx_jurisdictions_geometry）が使えず Seq Scan になる
--   （実測: 東京駅 500m で約 1.09s / 全地点約 1.07s）
-- - geography 型への式インデックスを追加し、半径検索をインデックス駆動にする
--   （実測見込み: ミリ秒台へ改善）
-- - 式インデックスのため IMMUTABLE でないキャストを使用する。geometry→geography は
--   IMMUTABLE なので式インデックスに安全に使える
-- ============================================================

BEGIN;

-- データ量が小さく（207 行）適用は一瞬で完了するため CONCURRENTLY は使わない
-- （トランザクション内では CONCURRENTLY 不可）
CREATE INDEX IF NOT EXISTS idx_jurisdictions_geometry_geography
  ON core.jurisdictions USING gist ((geometry::geography));

COMMIT;
