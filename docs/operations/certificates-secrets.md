# 🔐 証明書・Secrets・API キーの管理

| 項目 | 内容 | 更新日 |
|---|---|---|
| ドメイン | mirai-dx-platform.com（Cloudflare zone `e375e651…bff0`） | 2026-08-05 |
| 本番証明書 | Cloudflare Universal/Advanced 証明書（`pwsm.mirai-dx-platform.com` 含む）・**自動更新・有効** | 2026-08-05 |

## 1. 証明書

- Cloudflare 管理のため期限切れ・更新作業は原則不要（自動更新・自動デプロイ）
- 四半期点検で `status: active` を確認する（Cloudflare Dashboard → SSL/TLS）
- カスタム証明書（Bring Your Own）を導入する場合は、更新担当・期限・アラートを本節に追記する

## 2. 接続設定一覧（本番 Node サーバー `pwsm-api`）

| 名称 | 用途 | 保管場所 | ローテーション |
|---|---|---|---|
| `DATABASE_URL` | ローカル PostgreSQL `pwsm` 接続文字列（Git 管理外・`apps/api/.env`） | 本ホスト `apps/api/.env`（`chmod 600`） | 接続情報漏えい時・四半期ごとに検討 |
| `AUTH_*`（`AUTH_ENABLED` 等） | アプリ内 RBAC 設定（現状無効・Cloudflare Access でエッジ保護） | 本ホスト `apps/api/.env` | 認証方式変更時 |

### DATABASE_URL ローテーション手順

```bash
# 1) ローカル PostgreSQL で新しいパスワード / ロールを用意（例: pwsm_app のパスワード変更）
# 2) apps/api/.env の DATABASE_URL を更新（値は画面・履歴・ログへ出さない。chmod 600 を維持）
# 3) systemd サービスを再起動（EnvironmentFile は再起動時に読込まれる）
sudo systemctl restart pwsm-api
# 4) /api/v1/health/ready が 200 であることを確認
```

> ⚠️ `.env` は Git 管理外（`apps/api/.gitignore` に `.env*`）。バックアップは `docs/operations/backup-restore.md` を参照。

## 3. 外部 API キー

| キー | 用途 | 保管 | ローテーション |
|---|---|---|---|
| Cloudflare API Token（CLOUDFLARE_API_TOKEN） | Cloudflare API・Tunnel 管理 | ローカル env / CI Secrets | 漏えい時・定期的に再発行 |
| GitHub PAT（GITHUB_PERSONAL_ACCESS_TOKEN） | リポジトリ操作 | ローカル env | 漏えい時 |
| cloudflared トンネル証明書 | Tunnel 接続（`/home/kensan/.cloudflared/`） | 本ホスト | トンネル再作成時 |

> ⚠️ Neon は 2026-08-30 廃止済み（`NEON_API_KEY` は不使用・削除済み）。

## 4. 棚卸し・点検

- 四半期: Secrets 一覧・API キー・権限棚卸し（operations-ledger.md に記録）
- 不要になったキー・ロールは即時削除
