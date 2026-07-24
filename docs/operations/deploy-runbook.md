# 🚀 本番デプロイ手順書（Runbook）

| 項目 | 内容 |
|---|---|
| 🎯 目的 | API（Cloudflare Workers）・Web（Cloudflare Pages 相当）・Neon 接続を本番へ安全に反映する手順を定める |
| 👥 対象読者 | デプロイを実行する人間（オペレーター）・DevOps・承認者 |
| 📅 最終更新日 | 2026-07-24 |

> 🚫 **本番デプロイ・本番公開・Secrets 登録は、人間の明示承認なしに実行しません。**
> 承認はリリース PR の「マージ判定 `Y`」へ集約します。`Y` は当該 PR に明記されたデプロイ・migration・Secrets 登録の**正確な範囲だけ**を一括承認したものであり、承認後の実作業は人間または CTO（Claude）が PR 記載の範囲内で実行できます。PR に記載のない本番操作は引き続き禁止です。
> 本手順は `docs/operations/release-checklist.md` の確認記録（PR 本文上の記録で代替可）が済んでいることを前提とします。

---

## 📌 前提

| 項目 | 値 / 条件 |
|---|---|
| デプロイ実行者 | 人間（承認済みオペレーター） |
| 前提条件 | リリース前チェックリスト全 🔴 充足・承認者サイン済み |
| API スタック | Cloudflare Workers（`apps/api`・Hono・Worker 名 `pwsm-api`） |
| Web スタック | Vite + React（`apps/web`）→ ビルド成果物を同一 Worker の **Static Assets** として API と同一オリジンで配信（`[assets]`・SPA fallback・`run_worker_first = ["/api/*"]`） |
| DB | Neon PostgreSQL / PostGIS（プロジェクト `tiny-river-77604173`） |
| 設定ファイル | `apps/api/wrangler.toml`（`[env.preview]` 分離済み・default env = 本番 `pwsm-api`・Web assets は `../web/dist`） |
| Secrets | Cloudflare Secrets（`DATABASE_URL` 等）。実値は本書に記載しない |
| 必要ツール | Node.js（CI は 24 / ローカル 22+）・npm・`wrangler`（Cloudflare 認証済み） |

```mermaid
flowchart TB
    A["📋 チェックリスト承認済み"] --> B["🔐 Secrets 登録確認"]
    B --> C["🧪 preview へ検証デプロイ"]
    C --> D["✅ preview smoke test"]
    D --> E{"問題なし?"}
    E -->|No| Z["⛔ 中止 / 修正"]
    E -->|Yes| F["🚀 本番デプロイ（単一 Worker: API + Web assets）"]
    F --> H["✅ 本番 smoke test"]
    H --> I{"合格?"}
    I -->|No| R["↩️ rollback.md へ"]
    I -->|Yes| J["📝 記録・Projects 更新"]
```

---

## 1. 🔧 事前準備

```bash
# リポジトリ最新化（デプロイ対象コミットを明確化）
git fetch origin
git switch main
git log -1 --oneline   # デプロイ対象 SHA を控える

# 依存インストール（lockfile 固定）
npm ci

# ローカル最終確認（STABLE ゲート）
npm run lint
npm run typecheck
npm test
npm run build
```

- ✅ 上記がすべて success であること（失敗時はデプロイ中止）。
- 🔐 `wrangler whoami` で Cloudflare 認証を確認する（未認証なら人間が対話ログインする）。

---

## 2. 🔐 Neon 接続文字列（Secrets）登録手順 — 🚫 人間承認・手動のみ

> 実際の接続文字列は Neon コンソール / `get_connection_string` から取得し、**本書・リポジトリには絶対に書きません**。以下はコマンド手順のみです。

```bash
# 作業ディレクトリ: apps/api
# <CONNECTION_STRING> は本番(main)ブランチの値をプレースホルダーとして扱う
#   例フォーマット: postgresql://<user>:<password>@<host>/<db>?sslmode=require

# 本番 (default env = pwsm-api) へ登録
wrangler secret put DATABASE_URL
# → プロンプトに接続文字列を貼り付け（履歴・画面共有に残さない）

# preview 環境は別値で登録（本番と分離）
wrangler secret put DATABASE_URL --env preview
```

> 💡 **接続文字列を画面・履歴・会話ログへ出さない登録方法（推奨）**: Neon API キーを持つ環境で
> `npx neonctl connection-string --project-id tiny-river-77604173 <branch/db/role 指定> | npx wrangler secret put DATABASE_URL`
> のようにパイプで直接渡すと、値が端末表示・シェル履歴・作業ログに残らない。

| ✅ | 確認項目 |
|---|---|
| ☐ | 本番と preview の接続文字列が別ブランチ・別値である |
| ☐ | 登録値がシェル履歴・ログ・スクリーンショットに残っていない |
| ☐ | `.env` / `.env.local` を誤ってコミットしていない |

> 🔴 **本番では `DATABASE_URL` を必ず設定します（この節は省略不可）。** 実装（`apps/api/src/app.ts`）は `DATABASE_URL` が設定されている場合のみ DB 到達を確認し、`SELECT 1` が失敗すると `/api/v1/health/ready` が **503 `{status:"unavailable"}`** を返します。
> `DATABASE_URL` 未設定は開発用の fixture モード（`/health/ready` は常に 200 `ok`）であり、本番構成では使いません。DB 接続なしの版を本番へ出さないでください。

---

## 3. 🧪 preview 環境への検証デプロイ（本番前・推奨）

本番前に preview へ上げ、smoke test を通してから本番に進みます。

```bash
# 作業ディレクトリ: apps/api
# preview 環境へバージョンをアップロード（本番トラフィックには影響しない）
npm run deploy:preview
#   = wrangler versions upload --env preview  →  Worker: pwsm-api-preview
#   （初回のみ Worker が存在しないため wrangler deploy --env preview で作成する）
```

- Web 資産（`apps/web/dist`）も同時にアップロードされる（事前にリポジトリルートで `npm run build` を実行しておく）。
- 出力される preview URL / version ID を控える。
- §6 の smoke test を **preview に対して** 先に実施する。

---

## 4. 🚀 本番デプロイ手順（単一 Worker: API + Web assets）— 🚫 承認済み PR の範囲でのみ実行

本番は default env（Worker 名 `pwsm-api`）です。**API と Web 資産は同一 Worker として一括デプロイ**されます。段階公開（versions upload → deploy）を推奨します。

```bash
# 事前: リポジトリルートで npm run build（apps/web/dist を最新化）
# 作業ディレクトリ: apps/api

# 方式A（推奨・段階公開）: バージョンをアップロードしてから本番へ昇格
npm run deploy:production:upload    # = wrangler versions upload
#   → 生成された version ID を控える（rollback 時に使用）
npm run deploy:production:promote   # = wrangler versions deploy
#   → 昇格するバージョンとトラフィック割合を対話で指定（例: 新版 100%）

# 方式B（簡易・即時全量）: 直接デプロイ（初回の Worker 作成時はこちら）
# wrangler deploy
```

| ✅ | 確認項目 |
|---|---|
| ☐ | デプロイ先が本番 `pwsm-api`（preview ではない）である |
| ☐ | 昇格した version ID を記録した（`rollback.md` で使用） |
| ☐ | `compatibility_date`（`wrangler.toml`）が意図通り |

> 💡 段階公開（方式A）を使うと、`rollback.md` の「版ロールバック」で旧 version ID へ即時に戻せます。

---

## 5. 🌐 Web 配信の確認（Workers Static Assets 統合）

Web は独立した Pages プロジェクトではなく、**§4 の Worker デプロイに同梱**されます（`wrangler.toml` の `[assets]` が `apps/web/dist` を配信）。個別の配置作業は不要です。

```bash
# 作業ディレクトリ: リポジトリルート
# Web を本番ビルド（成果物は apps/web/dist/ → §4 のデプロイに同梱される）
npm run build -w @pwsm/web
#   = vite build

# 生成物確認
ls apps/web/dist
```

> 🔴 **main への merge を本番公開の契機にしません（`main merge ≠ 本番公開`）。** GitHub 連携による自動プロダクション・デプロイは使わず、本番反映は必ず §4 の手順（承認済み PR の範囲）で明示的に実行します。

| ✅ | 確認項目 |
|---|---|
| ☐ | Web と API が同一オリジン（`fetch('/api/v1/…')` の相対パスが本番 Worker に到達する） |
| ☐ | `/` で `index.html` が配信され、SPA fallback（未知パス → index.html）が機能する |
| ☐ | 免責表示・推定/鮮度表示がビルド成果物に含まれる |
| ☐ | 公開範囲（管理系は Cloudflare Access 保護）が設計通り |

---

## 6. ✅ デプロイ後 smoke test

本番（または preview）URL に対して、最低限の健全性と設計原則（免責）を確認します。

```bash
# <BASE_URL> は対象環境の URL（例: https://pwsm-api.<subdomain>.workers.dev）

# 1) liveness: プロセス確認のみ。常に 200 {"status":"ok"}
curl -fsS "<BASE_URL>/api/v1/health/live"

# 2) readiness: 本番（DATABASE_URL 設定時）は DB 到達を確認。
#    到達可 → 200 {"status":"ok","datasetVersion":"..."}
#    到達不可 → 503 {"status":"unavailable","datasetVersion":"..."}
curl -fsS "<BASE_URL>/api/v1/health/ready"

# 3) metadata: disclaimer / datasetVersion / ruleVersion / appEnv を確認
curl -fsS "<BASE_URL>/api/v1/metadata"
```

| ✅ | 確認項目 | 期待 |
|---|---|---|
| ☐ | `/api/v1/health/live` | HTTP 200・`status: ok`（プロセス確認のみ・DB は見ない） |
| ☐ | `/api/v1/health/ready` | 本番は HTTP 200・`status: ok`・`datasetVersion` が想定版（DB 到達不可なら 503 `unavailable`＝デプロイ失敗として扱う） |
| ☐ | `/api/v1/metadata` | `disclaimer`（必須免責文）を含む・`appEnv` が `production` |
| ☐ | 検索 `POST /api/v1/stakeholders/search` | 候補応答に免責が常時付与される |
| ☐ | Web トップ | 免責が常時表示・検索が API に到達する |
| ☐ | エラー整形 | 異常系が RFC 9457（Problem Details）で返る |

> ⚠️ 本番（`DATABASE_URL` 設定時）に `/health/ready` が 503 `unavailable` を返す場合、DB 到達不可＝デプロイ未完了とみなし、公開しないこと（`§8 失敗時` / `rollback.md` へ）。`DATABASE_URL` 未設定の fixture モードは開発専用で、本番構成では使わない（`apps/api/src/app.ts` 参照）。

---

## 7. 📝 デプロイ完了後の記録

| ✅ | 作業 |
|---|---|
| ☐ | デプロイ対象 SHA・API version ID・Web デプロイ ID を記録 |
| ☐ | smoke test 結果を記録（合否・応答例） |
| ☐ | GitHub Projects の Status を `Deploy Gate` → `Done` に更新 |
| ☐ | `README.md` 開発状況にリリース行を追記 |
| ☐ | 残課題を Issue 化 |

---

## 8. ↩️ 失敗時

- smoke test 失敗・重大な誤表示・5xx 急増を検知した場合、**直ちに `docs/operations/rollback.md`** に従い直前の正常版へ戻す。
- 誤窓口表示・情報漏えい疑い・DB 障害などは `docs/operations/incident-response.md` の初動に従う。

> 🚫 本番へ影響する再デプロイ・ロールバックは、承認済み PR に記載された事前検証済み手順の範囲でのみ実行する（無制限な再デプロイは禁止）。範囲外の操作が必要になった場合は停止し、人間の判断を仰ぐ。
