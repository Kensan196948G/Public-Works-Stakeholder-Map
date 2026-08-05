# 🔐 証明書・Secrets・API キーの管理

| 項目 | 内容 | 更新日 |
|---|---|---|
| ドメイン | mirai-dx-platform.com（Cloudflare zone `e375e651…bff0`） | 2026-08-05 |
| 本番証明書 | Cloudflare Universal/Advanced 証明書（`pwsm.mirai-dx-platform.com` 含む）・**自動更新・有効** | 2026-08-05 |

## 1. 証明書

- Cloudflare 管理のため期限切れ・更新作業は原則不要（自動更新・自動デプロイ）
- 四半期点検で `status: active` を確認する（Cloudflare Dashboard → SSL/TLS）
- カスタム証明書（Bring Your Own）を導入する場合は、更新担当・期限・アラートを本節に追記する

## 2. Secrets 一覧（本番 Worker `pwsm-api`）

| 名称 | 用途 | ローテーション |
|---|---|---|
| `DATABASE_URL` | Neon main 接続文字列（Secret・値は非表示） | 接続情報漏えい時・四半期ごとに検討 |

### DATABASE_URL ローテーション手順

```bash
# 1) Neon で新しい接続文字列（またはロールパスワード変更）を用意
# 2) 本番 Worker へ登録（値は画面・履歴・ログへ出さない）
cd apps/api
wrangler secret put DATABASE_URL   # プロンプトへ貼り付け
# 3) 再デプロイ（vars は変更しないため versions deploy で可。vars 変更時は wrangler deploy）
wrangler versions deploy <new-version-id>@100
# 4) /health/ready が 200 であることを確認
```

## 3. 外部 API キー

| キー | 用途 | 保管 | ローテーション |
|---|---|---|---|
| Cloudflare API Token（CLOUDFLARE_API_TOKEN） | デプロイ・監視・Access 管理 | ローカル env / CI Secrets | 漏えい時・定期的に再発行 |
| Neon API Key（NEON_API_KEY） | Neon 管理・復元試験 | ローカル config | **漏えい時（2026-08-05 に help 出力で一度表示されたため推奨）**・定期的 |
| GitHub PAT（GITHUB_PERSONAL_ACCESS_TOKEN） | リポジトリ操作 | ローカル env | 漏えい時 |

> ⚠️ 2026-08-05 に `neonctl --help` のデフォルト値として Neon API キーが端末出力へ一度表示されました。
> リポジトリには含まれていませんが、**ローテーションを推奨**します（Neon Dashboard → Account → API keys）。

## 4. 棚卸し・点検

- 四半期: Secrets 一覧・API キー・権限棚卸し（operations-ledger.md に記録）
- 不要になったキー・ロールは即時削除
