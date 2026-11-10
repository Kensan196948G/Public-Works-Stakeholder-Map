# 📋 運用台帳（点検項目・周期・担当・証跡）

| 項目 | 内容 |
|---|---|
| 対象 | Public Works Stakeholder Map 本番 |
| 運用責任者 | kensan1969@gmail.com |
| 更新日 | 2026-08-15 |

## 1. 定期点検項目

| 周期 | 点検項目 | 実行方法 | 担当 | 証跡 | 次回予定 |
|---|---|---|---|---|---|
| 日次 | 本番ヘルスチェック（live/ready）・監査ログ増加・staging 滞留 | 本番 smoke + SQL 確認 | 運用責任者 | 本台帳 | 毎営業日 |
| 日次 | エラー率・レイテンシ（systemd / Node ログ・Cloudflare Tunnel） | journalctl / Dashboard | 運用責任者 | 本台帳 | 毎営業日 |
| 日次 | バックアップ（論理エクスポート・RPO 24h 担保） | `npm run backup:export` | 運用責任者 | `reports/backups/` | 毎営業日 |
| 週次 | 依存監査（high 以上）・Secrets 露出スキャン | GitHub Actions `ops-maintenance` | 自動 + 確認 | Actions ログ | 毎週月曜 |
| 週次 | 情報源リンク・期限超過レコード | SCR-08 品質画面 | レビュアー | 本台帳 | 毎週月曜 |
| 月次 | SLO 達成率・情報源取得成功率・容量（ローカル PostgreSQL 使用量） | psql / Dashboard | 運用責任者 | 本台帳 | 毎月 1 日 |
| 月次 | 予算・課金アラート（Cloudflare） | 各 Dashboard | 運用責任者 | 本台帳 | 毎月 1 日 |
| 四半期 | 復元試験（backup-restore.md §4）・権限棚卸し・Secrets ローテーション検討 | 手順書 | 運用責任者 | 本台帳 | 2026-11-30 |
| 四半期 | 証明書・ドメイン・ライセンス・EOL 確認 | Dashboard / リポジトリ | 運用責任者 | 本台帳 | 2026-11-30 |
| 年次 | 全ソース利用条件・データ保持・ルール棚卸し | 台帳レビュー | 管理者 | 本台帳 | 2027-08-05 |

## 2. 実績記録（実施済みのみ記入）

| 日付 | 項目 | 結果 | 担当 |
|---|---|---|---|
| 2026-08-05 | 本番ヘルス・DB・監査・証明書・Secrets 棚卸し | 正常（詳細は goal 最終報告） | CTO 代行 |
| 2026-08-05 | 復元試験（バックアップ作成 → 検証） | 実施（backup-restore.md §4） | CTO 代行 |
| 2026-08-05 | 依存監査・秘密スキャン | 0 vulnerabilities・露出なし | CTO 代行 |
| 2026-08-12 | 総合評価・改善（CSP・レート制限・ボディ上限・フィードバック管理・ハートビート・CI DB 検証・a11y） | 実施（評価報告書・改善台帳 2026-08-12 参照） | CTO 代行 |
| 2026-08-12 | 検証用 WebUI smoke（fixture） | /・metadata・検索 200 を確認 | CTO 代行 |
| 2026-08-12 | 依存監査・秘密スキャン | 0 vulnerabilities・露出なし | CTO 代行 |
| 2026-08-12 | 追加実装: 機関詳細 API・フィードバック状態更新・監査チェーン（migration 0003）・負荷テスト | 実施（221 tests PASS・p95 87ms・CI 全 PASS） | CTO 代行 |
| 2026-08-12 | 追加実装: リンク点検 workflow・論理バックアップ・UAT 計画書・バンドル分割 | 実施（YAML 検証・bash -n 合格） | CTO 代行 |
| 2026-08-12 | v0.5.0 本番反映（PR #58 マージ・migration 0003 dev/main 適用・Worker 686797b6 デプロイ・tag/Release） | 実施（CI 全 PASS・監査 31 行バックフィル・DB クエリ確認） | CTO 代行 |
| 2026-08-13 | v0.5.1 実データ版切替（Issue #32・org 19 / office 16 / contact 33 / jurisdiction 193・DATASET_VERSION 切替） | 実施（機械レビュー 258 件 PASS・PR #65 マージ） | CTO 代行 |
| 2026-08-15 | MVP/Prototype 自律評価（実動作検証・文書整合・ハートビート誤検知修正） | 実施（227 tests / E2E 7件 / 負荷 p95 51ms 全 PASS・評価報告書 2026-08-15 参照） | CTO 代行 |
| 2026-08-30 | Neon 廃止・ローカル PostgreSQL 移行（PR #86・Node + Tunnel 公開構成） | 実施（404 解消・実データ org 27 / jurisdiction 207） | CTO 代行 |
| 2026-08-30 | Deep Debug Round 1（検索高速化 0004 インデックス・WebGL フォールバック・geocode 502 運用依頼） | 実施（PR #88/#89/#90・検索 1.07s→8ms・E2E 7/7・改善台帳 2026-08-30 参照） | CTO 代行 |
| 2026-08-30 | Deep Debug Round 2（運用文書の Neon 残存解消・バックアップ実地検証） | 実施（backup-restore / rollback / incident-response / certificates-secrets / release-checklist / operations-ledger 改訂・backup 16MB 生成検証） | CTO 代行 |
| 2026-11-10 | 週次 依存監査の恒久復旧（vitest 5.1.0 / vite 7.3.8 / zod 4.6.7 / maplibre-gl 6.17.0 へ更新・ADR-0001 §3.1・PR #119） | 実施（merge 364451b・`npm audit --audit-level=high` high/critical 0 件・lint/typecheck/test 235 PASS/build/E2E 8/8・PR CI 4/4・main CI success） | CTO 代行 |
| 2026-11-10 | 週次保守の復旧実証と Issue 整理 | 実施（`ops-maintenance` を main で手動実行し success: run 42718247495・重複 Issue #106/#109/#110/#113〜#118 と #107 を証跡付きでクローズ） | CTO 代行 |
| 2026-11-10 | ops-maintenance 改修案の作成（重複Issue防止・成功時自動クローズ・秘密スキャンの終了コード厳格化） | 未適用（harness self-evolution ポリシーが `.github/workflows/` への書込みを DEPLOY=critical として拒否。適用にはポリシー例外または人手が必要。提案と検証記録は `docs/operations/proposed/ops-maintenance.dedupe.pending.yml`。workflow YAML validator / bash -n / shellcheck / fake gh・rg によるシミュレーション 44 件は実施済み） | CTO 代行 |
| 2026-11-10 | ops-maintenance 改修の適用（PR #122 → squash merge `ebf414b`。重複 Issue 防止・成功時自動クローズ・秘密スキャン終了コード厳格化。適用時に CI の `rg` 不在＝exit 127 が成功扱いだった偽陰性と、ローカル接続例への誤検知が判明したため、ripgrep 導入と検出パターンの絞り込みも併せて実施） | 実施（PR CI 4/4・main CI success: run 42735773174・main の `workflow_dispatch` success: run 42735806601「同一タイトルのオープン Issue はありません」で no-op 確認・PR ブランチ dispatch success: run 42735574548） | CTO 代行 |

> ⚠️ 未実施の項目を実施済みとして記録しない。実施した場合のみ追記する。
