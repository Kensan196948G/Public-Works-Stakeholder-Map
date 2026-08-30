# 🗄️ バックアップ・復旧・RPO／RTO（ローカル PostgreSQL）

| 項目 | 内容 |
|---|---|
| DB | ローカル PostgreSQL / PostGIS（本ホスト 127.0.0.1:5432・db `pwsm`・role `pwsm_app`。Neon は 2026-08-30 廃止） |
| 方式 | 論理エクスポート（`pg_dump` custom format・`npm run backup:export`） |
| 更新日 | 2026-08-30（Neon 廃止・ローカル PostgreSQL 移行後に全面改訂） |

## 1. バックアップ方針

- アプリコード・設定・ドキュメントは **GitHub（main）** が正本（Git 履歴がバックアップを兼ねる）
- 運用データ（`provenance` / `staging` / `core` / `audit` / `workflow`）はローカル PostgreSQL `pwsm` が正本
- ローカル PostgreSQL は Neon のような自動 PITR を持たないため、**定期的な論理エクスポートが必須**（RPO 24 時間を担保するため最低 1 日 1 回）
- 論理エクスポート（`pg_dump`）は `npm run backup:export` で実施し、`reports/backups/`（`.gitignore` 済み）へ保存する
- 機密性が高い場合は出力後に暗号化し、アプリ DB と異なる保管先・保持ポリシーで管理する

## 2. RPO／RTO 目標（MVP）

| 指標 | 目標 | 備考 |
|---|---:|---|
| RPO | 24 時間以内 | 論理エクスポートを最低 1 日 1 回実行して担保 |
| RTO | 8 時間以内 | ダンプ復元 + アプリ接続先切替 + 検証 |

## 3. バックアップ手順（論理エクスポート）

```bash
# 作業ディレクトリ: リポジトリルート
# 接続文字列はコマンド履歴へ残さない（環境変数として渡す）
DATABASE_URL="postgresql://pwsm_app:<パスワード>@127.0.0.1:5432/pwsm" npm run backup:export
# → reports/backups/pwsm-YYYYMMDD-HHMMSS.sql.gz（custom format・gzip）

# 検証（整合性確認）
gzip -t reports/backups/pwsm-*.sql.gz
gzip -dc reports/backups/pwsm-*.sql.gz | pg_restore --list | head
```

| ✅ | 確認項目 |
|---|---|
| ☐ | `reports/backups/pwsm-*.sql.gz` が生成される（custom format・gzip） |
| ☐ | `gzip -t` が成功する（整合性） |
| ☐ | `pg_restore --list` に core / provenance / staging / audit / workflow のテーブルが含まれる |

> ⚠️ **ツールチェーンのバージョン固定（DD-08）**: 本ホストには複数の PostgreSQL クライアント（16 / 17 / 18）が共存しており、`pg_dump` / `pg_restore` を PATH 経由で呼ぶと**最新バージョン（18）が選ばれる**ことがある（`pg_wrapper` はホスト指定時に最新版を選択）。PG18 の `pg_restore` は PG17 以降の `SET transaction_timeout = 0` を発行し、PG16 サーバーが `unrecognized configuration parameter "transaction_timeout"` の警告を出す（復元自体は成功するが警告が残る）。
> **サーバー（PG16）と同一バージョンのクライアントを明示指定すること。**

## 4. 復元手順（論理エクスポートから）

```bash
# 0) サーバーと同一バージョンの pg_restore / pg_dump を明示する（DD-08）
PG_RESTORE="/usr/lib/postgresql/16/bin/pg_restore"   # サーバーが 16 の場合
#   確認: $PG_RESTORE --version → PostgreSQL 16.x

# 1) 復元先 DB を用意（例: pwsm_restore）
createdb -h 127.0.0.1 -U postgres pwsm_restore

# 2) ダンプを復元（バージョン固定した pg_restore を使用）
gzip -dc reports/backups/pwsm-YYYYMMDD-HHMMSS.sql.gz | "$PG_RESTORE" \
  --no-owner --no-privileges -h 127.0.0.1 -U postgres -d pwsm_restore

# 3) 検証: スキーマ・件数・空間データ
psql -h 127.0.0.1 -U postgres -d pwsm_restore -c "\dt core.*"
psql -h 127.0.0.1 -U postgres -d pwsm_restore -c "SELECT count(*) FROM staging.import_records;"
psql -h 127.0.0.1 -U postgres -d pwsm_restore -c "SELECT count(*) FROM core.jurisdictions;"

# 4) 問題なければアプリの DATABASE_URL を復元 DB へ切替え（apps/api/.env 変更 + systemctl restart pwsm-api）
# 5) 不要な復元 DB は削除
dropdb -h 127.0.0.1 -U postgres pwsm_restore
```

## 5. 復元試験（実施記録）

| 日付 | 内容 | 結果 |
|---|---|---|
| 2026-08-30 | 本番 `pwsm` の論理エクスポート（`npm run backup:export`・16MB）を作成し、`gzip -t` で整合性確認 | 実施（2026-08-30 Deep Debug・DD-05 にて確認） |

> 四半期ごとに本手順を再実行し、結果をこの表へ追記する（次回予定: 2026-11-30）。

## 6. ロールバック（アプリ）

- **API / Web**: Node サーバーはビルド済み `apps/web/dist` と `apps/api/src` を直接参照するため、`git checkout <直前SHA>` → `npm run build` → `systemctl restart pwsm-api` で戻す（`rollback.md` 参照）
- **DB**: 上記 §4 の復元手順でダンプから復元。破壊的 migration は expand-and-contract で回避
