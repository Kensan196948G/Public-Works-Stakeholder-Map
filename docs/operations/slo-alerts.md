# 📈 SLI／SLO・アラート・通知（運用設計）

| 項目 | 内容 |
|---|---|
| 対象 | Public Works Stakeholder Map 本番（https://pwsm.mirai-dx-platform.com） |
| 更新日 | 2026-08-05 |
| 責任者 | 運用責任者（現状: kensan1969@gmail.com・一次対応者） |

## 1. SLI／SLO

| SLI | 定義 | 目標 | 計測 |
|---|---:|---:|---|
| 検索成功率 | 2xx 以外（4xx 除く）の `/stakeholders/search` 割合 | 99.5% / 月 | Workers Analytics / Logs |
| 検索応答時間 | `/stakeholders/search` p95 | 2 秒以内 | Workers Analytics |
| 候補詳細・metadata 応答 | 公開 GET p95 | 1 秒以内 | Workers Analytics |
| 管理ジョブ成功率 | 取得・鮮度・リンク検査（導入後） | 98% / 月 | ジョブログ |
| 出典保有率 | 公開レコードの出典 URL 保有 | 100% | SCR-08 品質レポート |
| 期限超過の識別 | 期限超過を expired として識別 | 100% | SCR-08 / 検索応答 |
| 公開 API 可用性 | 本番エンドポイント 2xx | 99.5% / 月 | ヘルスチェック + Analytics |

## 2. アラート閾値（定義・通知先は下記。実装は監視基盤導入フェーズ）

| レベル | 条件 | 通知先 | 初動 |
|---|---|---|---|
| 🔴 Critical | `/health/ready` 503 が連続 3 回 / DB 接続失敗 / 5xx 率 5% 超（10分） | 管理者メール + 電話（運用責任者） | 直ちに incident-response へ |
| 🟠 Warning | 5xx 率 1% 超 / p95 2 秒超（10分） / 期限超過 10 件超 | 管理者メール | 原因調査・対応計画 |
| 🟡 Info | 依存脆弱性 high 検出 / 証明書 30 日以内期限 / 情報源 1 件以上取得失敗 | 管理者メール | 次回メンテナンスで対応 |

> ⚠️ 通知基盤（メール送信・監視 SaaS）は未導入のため、現状は **Workers Logs / Analytics の手動確認**と
> 定期点検（operations-ledger.md）で代替する。閾値・通知先は導入時にこの表を設定に反映する。

## 3. エスカレーション

| レベル | 対応者 | 期限 |
|---|---|---|
| 一次 | 運用責任者（kensan1969@gmail.com） | 検知後 30 分以内に状況把握 |
| 二次 | 技術担当（CTO 代行 / 開発者） | 1 時間以内に原因調査開始 |
| 三次 | サービス提供元（Cloudflare / Neon サポート） | 障害が基盤起因の場合に起票 |

## 4. 通知試験

- **実施状況: 未実施（NOT RUN）** — 通知基盤がないため。基盤導入後にテスト通知を実施し、
  この文書の「実施日・結果」欄へ記録する。

## 5. 定期確認

- 日次: `/health/ready`・監査ログ件数・staging 滞留（operations-ledger.md）
- 週次: Workers Analytics のエラー率・レイテンシ・依存監査（自動 workflow 併用）
- 月次: SLO 達成率の集計・期限超過・情報源取得状況
