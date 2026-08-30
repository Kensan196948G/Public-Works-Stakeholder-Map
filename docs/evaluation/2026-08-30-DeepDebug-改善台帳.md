# Deep Debug 改善台帳（2026-08-30）

| 項目 | 内容 |
|---|---|
| 対象 | Public Works Stakeholder Map（本番 https://pwsm.mirai-dx-platform.com / MVP https://pwsm-mvp.mirai-dx-platform.com） |
| 実施日 | 2026-08-30 |
| 種別 | Deep Debug（前 Goal 完成後・横断的再検証） |
| 前提 | Neon 廃止・ローカル PostgreSQL 移行完了（PR #86）後の状態を対象に全領域を再検証 |

## 凡例

- 影響度: Critical / High / Medium / Low
- 状態: ✅ 修正・検証済み / 🟡 対応中 / ⏳ 未対応（課題化・運用依頼）

## 1. 発見・修正した問題

| ID | 区分 | 症状・問題 | 影響度 | Root Cause | 修正 | 状態 | 証跡 |
|---|---|---|---|---|---|---|---|
| DD-01 | 性能 | 候補検索 API が全地点で約 1.07 秒（東京駅・大阪・札幌すべて） | High | `ST_DWithin(geometry::geography, ...)` が geometry 列の GiST インデックスを利用できず Seq Scan（実測 1087ms）。クエリが organization_id 先行の Nested Loop 構造で地理インデックスが効かない | migration `0004_jurisdiction_geography_index.sql` で geography 式 GiST インデックス追加。CI（db-validation）・deploy-runbook・ローカル pwsm_test・本番 pwsm へ適用 | ✅ | EXPLAIN ANALYZE: Index Scan 14ms。API 実測 1.07s → **8ms（約130倍改善）**。統合テスト 9 件 PASS |
| DD-02 | UI/UX | WebGL 非対応環境（GPU 制限・ヘッドレス・企業ポリシー等）で地図初期化例外により**アプリ全体が白画面**になり利用不能 | High | `MapPicker.tsx` の `new maplibregl.Map()` が WebGL コンテキスト作成失敗で例外を投げるが try-catch が無く、React ツリー全体がアンマウントされる | `MapPicker.tsx` に try-catch + `initFailed` state を追加し、フォールバック UI（住所検索・緯度経度入力の案内）へ切替。`styles.css` に `.map-fallback` 追加（デザイントークン準拠） | ✅ | 新規テスト `MapPicker.test.tsx` 2 件 PASS（初期化失敗時フォールバック表示・クラッシュしない）。全テスト 235 passed / 9 skipped |
| DD-03 | 機能/運用 | 本番・MVP の住所検索（`/api/v1/geocode`）が **502（5 秒タイムアウト）** で完全に機能しない | High | systemd のネットワーク制限 `IPAddressAllow=127.0.0.1/8 ::1/128` + `IPAddressDeny=any` が、ジオコーディング先（国土地理院 `msearch.gsi.go.jp`）への outbound HTTPS も遮断。前 Goal の「認証無効化の代わりに outbound 遮断」設計が住所検索（主要機能）を巻き込んでいた（検証漏れ） | 🟡 コードは正常（GSI 直接は 200・CORS `*`）。systemd ユニット変更が必要だが `/etc` が読み取り専用 FS かつ sudo 不可のため直接変更不可。**運用依頼（承認者）**: 各サービスの `IPAddressAllow` に `msearch.gsi.go.jp`（CloudFront）の送信を許可する、または `AUTH_*` 有効化とセットで outbound 緩和。本台帳と deploy-runbook に記録 | 🟡 | 実測: GSI 直接 200 (0.5s) / サーバー経由 502 (5.0s)。原因: `IPAddressDeny=any`。評価報告書の「geocode PASS」はローカル fixture モード（制限なし）での確認であり本番構成では未検証だった |
| DD-04 | データ品質 | 本番実データで「国土交通省 国土数値情報ダウンロードサービス」の `organization_type` が `prefecture` に分類されている | Low | N03 行政区域データの提供元組織として登録されたが、型が不適切（提供元は `other` または機関種別として別扱いが適切）。jurisdiction 0 件のため検索・UI には現状影響なし | ⏳ 実データ整備（Issue #32 の人間レビュー）時に分類見直しを実施。コード修正は不要 | ⏳ | `SELECT canonical_name, organization_type FROM core.organizations WHERE canonical_name LIKE '%国土数値情報%'` → `prefecture`。行政区域 3 県（東京都・大阪府・神奈川県）の 193 ポリゴンのみ published、個別管轄は staging pending（既知の進行中事項） |

## 2. 再検証で正常を確認した項目

| 区分 | 確認内容 | 結果 |
|---|---|---|
| ユニット/統合 | 全テスト | 235 passed / 9 skipped（統合 9 件は `TEST_DATABASE_URL=pwsm_test` で PASS） |
| 型/Lint/Build | `npm run typecheck` / `npm run lint` / `npm run build` | 全て success |
| E2E | `npm run test:e2e`（Playwright 7 件） | 7/7 PASS |
| 依存監査 | `npm audit` / `npm audit --omit=dev` | 0 vulnerabilities |
| API | health/live・health/ready・metadata・search・map/jurisdictions・admin（403 は RBAC 設計通り） | 正常 |
| DB | 本番 `pwsm`: org 27 / jurisdiction 207 / office 24 / contact 33 / rules 6 / sources 24 / imports 258 / audit 37 | 正常（core スキーマ） |
| CI | main 最新 push・PR・heartbeat | 全て success |
| 公開 | 本番 302（Cloudflare Access 保護・設計通り）/ MVP 200 | 正常 |

## 3. 残課題・運用依頼

| ID | 内容 | 依頼先 | 備考 |
|---|---|---|---|
| DD-03 | systemd `IPAddressAllow` の緩和（住所検索の outbound 許可） | 運用承認者（root 権限） | `/etc` 読み取り専用のためエージェントから変更不可。承認後に `systemctl restart pwsm-api / pwsm-mvp / pwsm-api-preview` で反映。反映後の確認: `curl -w "%{http_code}" "<URL>/api/v1/geocode?q=東京"` が 200 |
