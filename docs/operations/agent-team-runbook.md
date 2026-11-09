# 🤖 自律型 AI エージェントチーム運用ランブック

| 項目 | 内容 |
|---|---|
| 対象 | Public-Works-Stakeholder-Map |
| 実行基盤 | DeepSeek Harness（Agent Teams / Subagents / goal / 共有タスクボード / GitHub CLI） |
| 主モデル | `deepseek-official/deepseek-flash`（DeepSeek-V41-Flash・thinking: high） |
| 制定 | 2026-11-10 |
| 関連 | `GITHUB_POLICY.md`（中央ポリシー）・`CLAUDE.md` §15〜§24・`.github/workflows/ci.yml` |

## 1. 役割と責務

| 役割 | 担当の持ち方 | 責務 | Harness 上の実装 |
|---|---|---|---|
| Orchestrator | メインセッション（Lead） | 環境診断・優先順位決定・タスク分解・割当・統合・報告・コスト監視 | `create_goal` / `todo_write` / 共有タスクボード / `team_task_*` |
| Researcher | Lead が兼務（必要時のみ分離） | 公式仕様・既存コード・CI/Issue/PR の調査、根拠の記録 | `read` / `grep` / `gh` / `web_search` |
| Architect | Lead が兼務 | 設計判断・ADR 起票・影響範囲評価 | `docs/adr/` への追記 |
| Builder | Lead または `builder-*` | 実装・テスト追加・ローカル検証・修正 | `write` / `edit` / `bash`（npm） |
| Reviewer / QA | `reviewer-qa`（実装担当と別コンテキスト） | diff・CI・証跡の独立検証、重大度付き指摘 | `spawn_teammate(context: fresh)` + `send_message` |

**分離原則**

- 実装担当と Reviewer は必ず別コンテキストにする（自己承認を避ける）。
- 同時に走る Builder の書き込みスコープは重複させない。共有タスクには `write_scopes` を書く。
- Reviewer は「実行した検証コマンドと結果」と「未検証事項」を必ず報告する。推測で APPROVE しない。

## 2. 権限モデル（優先順位）

1. `GITHUB_POLICY.md`（中央ポリシー。Workspace 文書より優先）
2. GitHub Ruleset `central-auto-merge`（Required Checks 4 件 / squash のみ / force push・削除禁止 / main 直接 push 禁止）
3. CI（`.github/workflows/ci.yml`・`ops-*.yml`）
4. `CLAUDE.md` / `README.md`

Required Checks（Ruleset 実測・2026-11-10）:

- `lint / typecheck / test / build`
- `db migration / seed validation`
- `dependency audit`
- `e2e (Playwright)`

**Harness 側の追加制約**

- `.github/workflows/` への write / edit は self-evolution ポリシーゲートが `DEPLOY = critical` として**拒否**する。解除・迂回はしない。変更が必要な場合は `docs/operations/proposed/` に提案を置き、人手で適用する。
- 承認が必要な操作（Release・本番 deploy・Secret 変更・不可逆削除・ポリシー自体の変更）は、チェックが緑でも実行しない。人間の判断を数字選択式で求める。

## 3. 標準フロー（commit → merge まで）

```
1  診断          gh run list / gh pr list / gh issue list / 依存監査 / Ruleset 確認
2  タスク化      todo_write・共有タスクボード（write_scopes と受入条件を明記）
3  branch        auto/<slug>（main から自動作成）
4  実装          Builder。ローカル検証を先に通す
5  commit        Conventional Commits（feat/fix/docs/chore/test/refactor）
6  push          origin へ。失敗時は原因を特定してから再試行
7  PR            下記「PR 本文の必須項目」を満たす
8  CI            Required Checks 4 件が pass するまで待つ（fail なら 4 へ戻る）
9  独立レビュー   reviewer-qa が APPROVE / REQUEST_CHANGES
10 merge         `gh pr merge <n> --squash --delete-branch`（--admin 禁止）
11 マージ後検証  main の CI・必要なら workflow_dispatch・Issue/Project 更新
12 記録          operations-ledger / state.json / ADR を実測値で更新
```

**PR 本文の必須項目**（`CLAUDE.md` §15）: 目的と背景 / 変更内容 / 対象外 / 影響範囲 / テストおよび CI 結果 / セキュリティ確認結果 / migration およびデータ影響 / deployment 方法 / rollback 方法 / preview 確認方法 / 残課題および残存リスク / production-safe 判定。

## 4. 品質ゲートとコマンド

| Gate | 内容 | コマンド / 手段 |
|---|---|---|
| 01 | 要求仕様確認 | Issue・設計書・既存テストの突合 |
| 02 | 設計整合性 | ADR・`docs/openapi.yaml` との差分確認 |
| 03 | 実装完了 | `npm run typecheck` / `npm run build` |
| 04 | 単体・統合テスト | `npm test`（235 passed / 10 skipped） |
| 05 | データ検証 | `npm run data:validate` |
| 06 | セキュリティ | `npm audit --audit-level=high`（exit 0 必須）・秘密情報スキャン |
| 07 | 独立レビュー | `reviewer-qa` の APPROVE（実装担当と別コンテキスト） |
| 08 | CI 必須チェック | `gh pr checks <n> --watch`（4 件すべて pass） |
| 09 | マージ条件 | conflict なし・Ruleset 適合・head SHA が検証済み |
| 10 | マージ後検証 | main CI・`gh run view`・主要 URL の smoke |

**ローカル検証の一括コマンド**

```bash
npm audit --audit-level=high          # exit 0（high / critical 0）
npm run lint && npm run typecheck
npm test && npm run data:validate
npm run build
env -u DATABASE_URL E2E_PORT=8805 npm run test:e2e    # CI と同条件
node .github/scripts/validate-workflows.mjs
```

## 5. 実行記録の残し先

| 記録 | 場所 | ルール |
|---|---|---|
| 運用実績（実施のみ） | `docs/operations/operations-ledger.md` | 未実施を実施として書かない |
| 技術判断 | `docs/adr/NNNN-*.md` | 決定・理由・再評価条件を書く |
| 現状と学習 | `state.json` | `goal` に到達点、`learning` に再発防止知見 |
| リリース | `docs/release-notes/` + `state.json` の `deploy` | merge SHA・tag・URL を実測で記録 |

## 6. 既知の制約（2026-11-10 実測）

1. **E2E のローカル実行条件**: シェルに `DATABASE_URL` が設定されていると API が DB モードで起動し、fixture 前提の E2E が落ちる。CI と同条件にするには `env -u DATABASE_URL` を付ける。さらにポート 8788 には別アプリが常駐しており `reuseExistingServer: true` により誤接続するため、`E2E_PORT=<空きポート>` の明示が必須。
2. **`.github/workflows/` は書込み不可（ポリシー）**: CI 定義の変更は `docs/operations/proposed/` に提案を置き、人手で適用する。適用待ちの提案: `ops-maintenance.dedupe.pending.yml`（重複 Issue 防止・成功時自動クローズ・秘密スキャン終了コード厳格化。検証済み）。
3. **vitest 5 の Node 要件**: `^22.12.0 || ^24.0.0 || >=26.0.0`（CI は Node 24、本ホストは 22.22.3）。`workerd` を使わない方針は維持（ADR-0001 §3 追記）。
4. **moderate 脆弱性 10 件**: eslint 10 / typescript-eslint 系。`--audit-level=high` の対象外だが、解消には major 更新が必要（別 PR）。
5. **Reviewer の実行時間**: フル検証（テスト・ビルド・lockfile 監査）で数分かかる。待機中は Lead が別の独立作業（文書・Issue 整理）を進める。

## 7. 実行実績（2026-11-10 の初回適用）

| 項目 | 結果 |
|---|---|
| 診断 | Ruleset `central-auto-merge` 有効・Required Checks 4 件・main 直接 push 不可・auto-merge 可を確認 |
| 特定した阻害要因 | 依存の critical 3 / high 4 により `dependency audit` が失敗し、オープン PR 3 件（#108 / #111 / #112）が全て BLOCKED |
| 対応 | PR #119（vitest 5.1.0 / maplibre-gl 6.17.0 ほか）→ squash merge `364451b` |
| CI | PR: 4/4 pass（run 42718048199）・main: success（run 42718223496） |
| 独立レビュー | `reviewer-qa` が APPROVE。M1〜M3 の指摘を `1d6b928` で反映 |
| 復旧実証 | `ops-maintenance` を main で手動実行し成功（run 42718247495） |
| Issue 整理 | #106 / #109 / #110 / #113〜#118（重複 9 件）と #107（ハートビート）を証跡付きでクローズ |
| 残課題 | Issue #32（実データ投入・Phase 2 後半）・ops-maintenance 提案の適用・moderate 10 件 |

## 8. 変更履歴

| 日付 | 変更 |
|---|---|
| 2026-11-10 | 制定（初回の自律運用と復旧作業の実績を反映） |
