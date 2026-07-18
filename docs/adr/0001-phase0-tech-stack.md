# ADR-0001: Phase 0 技術スタックと monorepo 構成

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 採択 |
| 日付 | 2026-07-18 |
| 決定者 | CTO（自律開発セッション） |
| 関連 | Issue #1〜#5、詳細設計仕様書 §2.1 / §3 |

## 📌 背景

詳細設計仕様書は TypeScript / React / Cloudflare Workers / Neon PostgreSQL を推奨技術とし、
「具体的なライブラリのメジャーバージョンは実装開始時に確認し lockfile で固定する」としている。
Phase 0 の scaffold 構築にあたり、以下を決定した。

## ✅ 決定事項

### 1. npm workspaces monorepo + TypeScript Project References

- `packages/contracts`（Zod スキーマ = Web/API 共有の単一の真実）
- `packages/domain`（I/O を持たない純粋関数のドメインロジック）
- `data/fixtures`（架空データセットを **TypeScript パッケージ** として提供）
- `apps/api`（Hono ベース Workers API）
- pnpm ではなく npm を採用（追加ツール不要、CI キャッシュ単純化）

### 2. 主要ライブラリ（lockfile 固定）

| ライブラリ | バージョン | 選定理由 |
|---|---|---|
| zod | 4.x | 実行時検証 + 型導出の両立。`z.iso.datetime` 等の組込フォーマット |
| hono | 4.x | Workers ネイティブ・Node 上でそのままテスト可能（`app.request()`） |
| vitest | **3.x** | 後述の制約により 4.x を見送り |
| typescript | 6.x | strict + exactOptionalPropertyTypes で不確実性をコンパイル時に強制 |

### 3. vitest 4 → 3 のダウングレード（制約による決定）

ローカル自律開発環境は `ulimit -v` = 20GB のプロセス仮想メモリ制限下で動作する。
V8 は WebAssembly.Memory 1 つあたり約 10GB の仮想アドレス空間（trap handler 用
ガード領域）を予約するため、メインプロセスで複数の WASM を初期化する
vitest 4（vite 8 / rolldown 系）は起動不能だった。プロセス分離型 pool を持つ
vitest 3（vite 7 系）では発生しない。CI（GitHub Actions）には本制限はないが、
ローカル STABLE 検証を成立させるため 3.x に固定する。

**再評価条件**: 実行環境の仮想メモリ制限が解除された場合、または vitest 4 系が
WASM 予約を遅延化した場合に 4.x へ更新する。

### 4. fixture は JSON ではなく TypeScript パッケージ

`data/fixtures` を `@pwsm/fixtures` ワークスペースとし、型検査（contracts の列挙型）
をコンパイル時に強制する。JSON との二重管理を排し、`npm run data:validate` は
fixture 品質テスト（公開レコードの出典必須・estimated と official の排他等）を実行する。

### 5. DB スキーマは 5 スキーマ分離 + CHECK 制約で品質原則を強制

`core / staging / provenance / workflow / audit` を分離し、§5.3 の整合性制約
（published は根拠必須、estimated は official 精度不可、期間逆転禁止）を DB 層の
CHECK 制約として実装した（`db/migrations/0001_initial_schema.sql`）。

### 6. tsconfig lib に DOM を含める

domain/api は Web 標準 API（URL / Response / crypto）を使用する。Workers・Node・
ブラウザ共通の型として `lib: ["ES2023", "DOM", "DOM.Iterable"]` を採用した。
`@cloudflare/workers-types` は Workers 固有 API（KV 等）導入時に追加する。

## 🎯 影響

- Web/API の契約は `@pwsm/contracts` からの import のみ許可（重複定義禁止）
- ドメインロジックへの I/O 持込み禁止（クロックは引数注入）
- CSV 出力は `@pwsm/domain` の `buildCsv` 経由のみ（数式注入対策の一元化）
