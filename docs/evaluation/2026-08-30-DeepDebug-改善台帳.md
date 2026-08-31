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
| DD-03 | 機能/運用 | 本番・MVP の住所検索（`/api/v1/geocode`）が **502（5 秒タイムアウト）** で完全に機能しない | High | systemd のネットワーク制限 `IPAddressAllow=127.0.0.1/8 ::1/128` + `IPAddressDeny=any` が、ジオコーディング先（国土地理院 `msearch.gsi.go.jp`）への outbound HTTPS も遮断。前 Goal の「認証無効化の代わりに outbound 遮断」設計が住所検索（主要機能）を巻き込んでいた（検証漏れ） | ✅ **2026-08-31 解決（運用承認者による systemd 変更）**: 3 ユニット（pwsm-api / pwsm-mvp / pwsm-api-preview）の `IPAddressAllow` に CloudFront レンジ（`13.224.0.0/14`・`2600:9000::/28`）を追加 → daemon-reload → restart。`/tmp/fix-pwsm-geocode-ipallow.sh` をホストで `sudo bash` 実行 | ✅ | 復旧後: 本番 geocode **200 (0.14s)**・MVP **200 (0.10s)**・結果 5 件返却・監査 `geocode.search success 16`・UI で「東京」→サジェスト 5 件表示・search 200・map 0.25MB（DD-09 維持）・全サービス active。Issue #87 クローズ |
| DD-04 | データ品質 | 本番実データで「国土交通省 国土数値情報ダウンロードサービス」の `organization_type` が `prefecture` に分類されている | Low | N03 行政区域データの提供元組織として登録されたが、型が不適切（提供元は `other` または機関種別として別扱いが適切）。jurisdiction 0 件のため検索・UI には現状影響なし | ⏳ 実データ整備（Issue #32 の人間レビュー）時に分類見直しを実施。コード修正は不要 | ⏳ | `SELECT canonical_name, organization_type FROM core.organizations WHERE canonical_name LIKE '%国土数値情報%'` → `prefecture`。行政区域 3 県（東京都・大阪府・神奈川県）の 193 ポリゴンのみ published、個別管轄は staging pending（既知の進行中事項） |
| DD-05 | 文書/運用 | 前 Goal（Neon 廃止・ローカル PostgreSQL 移行 PR #86）後も、運用文書が **Neon / Workers 前提のまま**で現構成（Node + Tunnel + ローカル PostgreSQL）と乖離 | High | 移行時に `deploy-runbook.md` のみ更新され、`backup-restore.md`・`rollback.md`・`incident-response.md`・`certificates-secrets.md`・`release-checklist.md`・`operations-ledger.md`・`slo-alerts.md`・`data-registry.md`・`review-workflow.md`・`alert-notification-design.md` の更新が漏れた。災害復旧手順（neonctl・wrangler）が実環境で実行不能な状態だった | 10 文書をローカル PostgreSQL / Node / systemd / Tunnel 構成に全面改訂。`backup-restore.md` は `npm run backup:export`（pg_dump）ベースの実証済み手順へ、`rollback.md` は git checkout + build + restart ベースへ書き換え。`slo-alerts.md` には本番負荷試験実測（p95 91ms）を追記 | ✅ | ローカル DB で `npm run backup:export` 実地検証（16MB・gzip OK・pg_restore --list 14 COPY）。Neon 残存の grep で解消を確認（履歴文書・中央共有文書は対象外） |
| DD-06 | UI/UX | モバイル幅（390px）で水平スクロールが発生。地図 canvas が 406px はみ出し、ナビボタン（監査ログ等）が横並びのまま折り返さない | High | `.map-container` に `min-width: 0` / `overflow: hidden` がなく、MapLibre の canvas が親を超えて広がる。`.app-nav` に `flex-wrap: wrap` がない | `styles.css` に `.map-container { min-width: 0; overflow: hidden; }` と `.app-nav { flex-wrap: wrap; }` を追加 | ✅ | Playwright 390px で docW=vw（オーバーフロー 0）を確認（初期表示・結果表示とも）。E2E に「モバイル幅で水平スクロールが発生しない」テストを追加（8 件目） |
| DD-07 | データ品質/監視 | 情報源リンク点検（Issue #85）で 2 件のリンク切れが検出されていた: 港湾データ（C02）と道路データ（N13）の国土数値情報ページが 404 | Medium | 国土数値情報ダウンロードサービスの URL 体系変更（C02 → `KsjTmplt-C02-2014.html`・N13 → `KsjTmplt-N13-2024.html`）。source-registry の baseUrl が旧形式のままだった | `data/source-registry/sources/mlit-ksj-c02.json`・`mlit-ksj-n13.json` の baseUrl を現行 URL へ更新。seed（`0001_source_registry.sql`）を再生成し、本番 `pwsm` の `provenance.data_sources` へ冪等適用（ON CONFLICT DO UPDATE） | ✅ | `npm run link:check` が **23/23 OK**（修正前 21/23）。本番 DB の base_url 更新を psql で確認。Issue #85 をクローズ |
| DD-08 | 運用/バックアップ | `npm run backup:export` のバックアップ・復元で `SET transaction_timeout = 0` の警告が発生（復元自体は成功） | Medium | 本ホストに PostgreSQL クライアントが複数バージョン共存（16/17/18）。`pg_dump`/`pg_restore` を PATH 経由で呼ぶと `pg_wrapper` が**最新版（18）**を選択する。PG18 の pg_restore は PG17 以降の `transaction_timeout` パラメータを発行し、PG16 サーバーが警告を出す。`strace` で `/usr/lib/postgresql/18/bin/pg_restore` の実行を確認 | `scripts/backup-export.sh` に pg_dump バージョン自動選択を追加（サーバーメジャーバージョン検出 → 対応 pg_dump 使用）。`docs/operations/backup-restore.md` の復元手順に pg_restore バージョン固定（`/usr/lib/postgresql/16/bin/pg_restore`）を明記 | ✅ | 修正後: `pg_dump 16.14` 使用をログ確認。バージョン固定 pg_restore で **警告 0 件**・完全復元（org 27 / jurisdiction 207 / 空間 207/207 有効）を実地検証 |
| DD-09 | 性能 | `/api/v1/map/jurisdictions`（管轄区域ハイライト）が東京63ポリゴンで **13.9MB・約1.1秒**（48万座標）を返し、描画・転送が重い | High | 詳細設計仕様書 §6.2「表示範囲内の**簡略化**管轄GeoJSON」の規定に反し、実装は `ST_AsGeoJSON(j.geometry)` で全 geometry を未簡略化のまま返していた。行政区域ポリゴン（小笠原村 23 万点等）が極端に細かい | `db-repository.ts` の `fetchJurisdictionMapDb` に二段階簡略化を実装: `ST_SimplifyPreserveTopology(ST_SnapToGrid(geometry, 0.0005), 0.0005)`。SnapToGrid で自己交差を防ぎつつ座標を丸め、SimplifyPreserveTopology で概形を保つ | ✅ | 本番実測: **13.9MB/1.1s → 0.25MB/0.16s**（サイズ約1/56・時間約1/7）。座標 484,607→18,017。3県同時でも 0.6MB/0.4s。自己交差なし（ST_Simplify 単体は 7 件自己交差のため不採用）。統合テスト 9 件 PASS |
| DD-11 | 運用/テスト | `npm run load:test` を本番へ実行すると、`cf-connecting-ip` ヘッダーを付与しないため全リクエストが `unknown` として集約され、REQUESTS>60 でレート制限（429）に抵触して FAIL する | Medium | `load-test.mjs` がリクエストヘッダーを `Content-Type` のみとしており、本番（Tunnel 経由）で Cloudflare が付与する `cf-connecting-ip` をシミュレートできない。単一 IP として 60 回/分の制限に全数抵触 | `scripts/load-test.mjs` に `LOAD_TEST_IP_POOL` 環境変数を追加（デフォルト 1・1〜255）。指定数分の擬似 IP（RFC 5737 の 198.51.100.x）をリクエストごとにローテーションして付与し、複数ユーザーをシミュレート可能に | ✅ | 本番実測: `LOAD_TEST_IP_POOL=8 REQUESTS=60 CONCURRENCY=8` → **全て 200・p95=55ms・PASS**（修正前は non2xx=1 FAIL）。レート制限自体は IP 単位で正常（別 IP 5 種で 60req→全て 200・同一 IP 61 回目で 429+Retry-After:60） |
| DD-12 | 依存関係 | package-lock.json が ^ 範囲内の最新に追従していなかった（hono 4.13.0→4.13.5・zod 4.4.3→4.5.4・react 19.2.7→19.2.8 等・49 パッケージ） | Low | `npm update` 未実行のため lock が古い。npm audit は 0 vulnerabilities（緊急性なし・恒常的な最新化待ち） | `npm update` を実行し ^ 範囲内のパッチ/マイナーを適用（package-lock.json のみ更新・package.json は変更なし）。maplibre-gl 6.6.0 はメジャー（^5.24.0 範囲外）のため意図的に据え置き | ✅ | 更新後も全テスト 235 passed / 10 skipped・E2E 8/8・lint/typecheck 成功（回帰なし）。npm audit 0 vulnerabilities 維持 |

## 2. 再検証で正常を確認した項目

| 区分 | 確認内容 | 結果 |
|---|---|---|
| ユニット/統合 | 全テスト | 235 passed / 10 skipped（統合 10 件は `TEST_DATABASE_URL=pwsm_test` で PASS・0004 インデックス検証含む） |
| 型/Lint/Build | `npm run typecheck` / `npm run lint` / `npm run build` | 全て success |
| E2E | `npm run test:e2e`（Playwright 8 件・レスポンシブ含む） | 8/8 PASS |
| 依存監査 | `npm audit` / `npm audit --omit=dev` | 0 vulnerabilities |
| API | health/live・health/ready・metadata・search・map/jurisdictions・admin（403 は RBAC 設計通り） | 正常 |
| API 異常系 | 半径超過/緯度超過/不正JSON/巨大ボディ→400・レート制限→429+Retry-After・feedback 空/不正→400 | 正常（RFC 6585・Problem Details） |
| セキュリティ | CSP（frame-ancestors 'none'・object-src 'none'）・HSTS・X-Frame-Options・Referrer-Policy 全 API 一貫 | 正常 |
| XSS/注入 | `dangerouslySetInnerHTML`/`innerHTML` 0 件（React 自動エスケープ）・SQL 注入風 workType→400・XSS UUID→404 | 安全 |
| シークレット | git 全履歴（195 コミット）スキャンで実シークレット検出なし | 安全 |
| Migration/Seed | 空 DB へ 0001〜0004 + seed 3 本適用→CI と同一数値（sources 31 / imports 23 / org 8 / jurisdiction 14）を再現 | 再現可能 |
| DB | 本番 `pwsm`: org 27 / jurisdiction 207 / office 24 / contact 33 / rules 6 / sources 31 / imports 258 / audit 142 | 正常（core スキーマ） |
| CI | main 最新 push・PR・heartbeat・link-check | 全て success（link:check 23/23） |
| 公開 | 本番 302（Cloudflare Access 保護・設計通り）/ MVP 200 | 正常 |
| 運用 | バックアップ実地検証（16MB・復元警告0）・ロールバック実地試験（旧SHA build 成功）・負荷試験（p95 55ms） | 正常 |
| Frontend | 設定保存（localStorage）・チェックリスト保存・URL 共有復元・印刷ビュー・フィルタ/ソート（9 件テスト） | 正常 |

## 3. 残課題・運用依頼

| ID | 内容 | 依頼先 | 備考 |
|---|---|---|---|
| ~~DD-03~~ | ~~systemd `IPAddressAllow` の緩和~~ | ✅ 解決済み（2026-08-31・運用承認者対応） | 3 ユニットに CloudFront レンジ追加 → geocode 200 確認・Issue #87 クローズ |
| ci.yml | migration 0004 の db-validation 追記 | 承認者（workflow スコープ付きトークン） | Issue #87 コメントにパッチ記載済み。統合テストによる代替検証は追加済み |
| Cloudflare Worker 残骸 | pwsm-api / pwsm-api-preview / pwsm-mvp の Worker 3 個（routes/domains なし・不使用） | 承認者（破壊的削除のため） | state.json の「不使用」記録と一致。削除はロールバック不能のため人間判断 |
