#!/usr/bin/env bash
# ============================================================
# 論理バックアップ（論理エクスポート）— docs/operations/backup-restore.md §1 の自動化
# - 対象: Neon PostgreSQL（本番 main ブランチ等）
# - 実行: bash scripts/backup-export.sh
# - 出力: reports/backups/pwsm-YYYYMMDD-HHMMSS.sql.gz（.gitignore 済み）
# - 秘密情報（接続文字列）は画面・履歴・ログへ出力しない
# 前提: pg_dump / gzip が利用可能な環境（ローカル・CI 等）
# ============================================================
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL が未設定です（例: postgresql://user:pass@host/db?sslmode=require）" >&2
  exit 1
fi

OUT_DIR="reports/backups"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/pwsm-$STAMP.sql.gz"

echo "論理エクスポート開始: $OUT_FILE"
# 接続文字列はプロセス一覧に短時間現れる点に注意（ローカル実行専用）
pg_dump \
  --no-owner \
  --no-privileges \
  --format=custom \
  -d "$DATABASE_URL" | gzip > "$OUT_FILE"

echo "エクスポート完了"
echo "確認: gzip -t $OUT_FILE"
echo "一覧: gzip -dc $OUT_FILE | pg_restore --list | head"
