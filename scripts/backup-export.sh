#!/usr/bin/env bash
# ============================================================
# 論理バックアップ（論理エクスポート）— docs/operations/backup-restore.md §1 の自動化
# - 対象: ローカル PostgreSQL / PostGIS（本番 db `pwsm`。Neon は 2026-08-30 廃止）
# - 実行: bash scripts/backup-export.sh
# - 出力: reports/backups/pwsm-YYYYMMDD-HHMMSS.sql.gz（.gitignore 済み）
# - 秘密情報（接続文字列）は画面・履歴・ログへ出力しない
# - pg_dump はサーバーと同一メジャーバージョンのものを使用する（DD-08）:
#   pg_dump 17 で作成したダンプを PG16 サーバーへ pg_restore すると
#   `unrecognized configuration parameter "transaction_timeout"` の警告が出る
# 前提: pg_dump / gzip が利用可能な環境（ローカル・CI 等）
# ============================================================
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL が未設定です（例: postgresql://user:pass@host/db）" >&2
  exit 1
fi

# サーバーバージョンに合う pg_dump を優先する（PATH 先頭の pg_dump は
# 別メジャーバージョン（例: /usr/local/bin = 17）の可能性があるため）
PG_DUMP="$(command -v pg_dump)"
for candidate in "/usr/lib/postgresql/${PG_VERSION_MAJOR:-0}/bin/pg_dump" "/usr/lib/postgresql/16/bin/pg_dump"; do
  if [ -x "$candidate" ]; then
    PG_DUMP="$candidate"
    break
  fi
done
# 接続先サーバーのメジャーバージョンを判定し、一致する pg_dump があれば使う
SERVER_MAJOR="$(psql "${DATABASE_URL}" -tAc "SHOW server_version_num" 2>/dev/null | head -c 2 || true)"
if [ -n "$SERVER_MAJOR" ] && [ -x "/usr/lib/postgresql/${SERVER_MAJOR}/bin/pg_dump" ]; then
  PG_DUMP="/usr/lib/postgresql/${SERVER_MAJOR}/bin/pg_dump"
fi
echo "pg_dump: $PG_DUMP（$("$PG_DUMP" --version)）"

OUT_DIR="reports/backups"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/pwsm-$STAMP.sql.gz"

echo "論理エクスポート開始: $OUT_FILE"
# 接続文字列はプロセス一覧に短時間現れる点に注意（ローカル実行専用）
"$PG_DUMP" \
  --no-owner \
  --no-privileges \
  --format=custom \
  -d "$DATABASE_URL" | gzip > "$OUT_FILE"

echo "エクスポート完了"
echo "確認: gzip -t $OUT_FILE"
echo "一覧: gzip -dc $OUT_FILE | ${PG_DUMP%/pg_dump}/pg_restore --list | head"
