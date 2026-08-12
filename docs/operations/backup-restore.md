# 🗄️ バックアップ・復旧・RPO／RTO（Neon PostgreSQL）

| 項目 | 内容 |
|---|---|
| DB | Neon PostgreSQL（プロジェクト `tiny-river-77604173`・main ブランチ） |
| 方式 | Neon のブランチング + Point-in-Time Restore（PITR） |
| 更新日 | 2026-08-12 |

## 1. バックアップ方針

- Neon はプロジェクト単位で**自動バックアップ（PITR）**を提供し、ブランチ作成により任意時点へ復元できる
- アプリコード・設定・ドキュメントは **GitHub（main）** が正本（Git 履歴がバックアップを兼ねる）
- 運用データ（`provenance` / `staging` / `core` / `audit`）は Neon が正本
- 論理エクスポート（`pg_dump`）は四半期の復元試験時に併せて実施し、アプリ DB と異なる保管先（ローカル暗号化領域）へ保存する

## 2. RPO／RTO 目標（MVP）

| 指標 | 目標 | 備考 |
|---|---:|---|
| RPO | 24 時間以内 | Neon PITR は通常これを大幅に下回る |
| RTO | 8 時間以内 | ブランチ復元 + 接続文字列切替 + 検証 |

## 3. 復元手順（ブランチ方式）

```bash
# 1) 復元対象時点のブランチを作成（例: 現在の main から）
neonctl branches create --project-id tiny-river-77604173 --name restore-YYYYMMDD --parent main

# 2) 接続文字列を取得し、アプリ DB として参照
neonctl connection-string restore-YYYYMMDD --project-id tiny-river-77604173 --role neondb_owner --database neondb

# 3) 検証: スキーマ・件数・空間データ
psql "$RESTORE_URL" -c "\dt core.*"
psql "$RESTORE_URL" -c "SELECT count(*) FROM staging.import_records;"

# 4) 問題なければ復元ブランチを本番として採用（またはアプリ接続先を切替）
# 5) 検証用ブランチは削除
neonctl branches delete --project-id tiny-river-77604173 --branch restore-YYYYMMDD
```

## 4. 復元試験（実施記録）

| 日付 | 内容 | 結果 |
|---|---|---|
| 2026-08-05 | main から検証ブランチを作成し、スキーマ・staging 件数・空間データを確認 | 実施（下記の検証結果を参照） |

> 四半期ごとに本手順を再実行し、結果をこの表へ追記する（次回予定: 2026-11-05）。

## 5. ロールバック（アプリ）

- Worker: `wrangler versions deploy <旧version-id>` で即時切替（`rollback.md` 参照）
- DB: 復元ブランチへ接続切替。破壊的 migration は expand-and-contract で回避

## 6. 論理エクスポートの自動化（2026-08-12）

四半期の復元試験に先立ち、任意時点の論理バックアップを取得できます。

```bash
# 接続文字列はコマンド履歴へ残さない（set -a && source .env.local 等で環境変数として渡す）
DATABASE_URL="<Neon接続文字列>" npm run backup:export
# → reports/backups/pwsm-YYYYMMDD-HHMMSS.sql.gz（custom format・gzip）

# 検証
gzip -t reports/backups/pwsm-*.sql.gz
gzip -dc reports/backups/pwsm-*.sql.gz | pg_restore --list | head
```

- 出力先 `reports/` は gitignore 済み（正本は外部保管先へコピーする）
- 機密性が高い場合は出力後に暗号化し、アプリ DB と異なる保管先・保持ポリシーで管理する
