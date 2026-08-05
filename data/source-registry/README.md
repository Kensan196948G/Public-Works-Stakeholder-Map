# 📚 データソース台帳

公開情報源ごとに出典・利用条件・取得方式・TTL を記録する台帳ディレクトリです。

## 📌 運用ルール（要件 §6.3 / §9.3）

- 台帳に登録済みのソースからのみデータを取得する
- 利用規約・著作権・出典表示・再配布条件・アクセス頻度制限を必ず記録する
- 利用条件が不明な場合、データ本体を複製せず公式ページへのリンクと最小限の索引情報に限定する
- 民間まとめサイト・検索結果要約・生成 AI の回答は正本にしない

## 📄 登録形式

`sources/*.json` に 1 ソース 1 ファイルで登録する（スキーマ: `data/schemas/source-registry.schema.json`）。
CI で自動検証される（`data/source-registry/test/registry.test.ts`: スキーマ準拠・id 一意・
baseUrl と allowedHost の一致・license 未記録時の notes 必須）。

## 🗾 対象地域（2026-07-24 決裁・Issue #28 / 2026-08-05 拡張）

代表 3 地域: **東京都（区部）・横浜市・大阪市**。少数地域を高品質に仕上げてから拡大する。
全国共通データ（国土数値情報 N03 等）は `region: "national"` で登録する。

現在の登録: 16 ソース（代表 3 地域の公式窓口 15 + 国土数値情報 N03 1）

## ✅ 登録から公開まで

1. 本台帳へ JSON 登録（利用条件は決裁後に `license` へ記録・`confirmedAt`/`confirmedBy` 必須）
2. `node scripts/generate-source-registry-seed.mjs` で台帳 seed SQL を生成（決定的 UUID・冪等）
3. `node scripts/generate-entity-imports.mjs` で組織のステージング取込を生成
4. Neon dev で検証 → main へ適用（`provenance.data_sources` 登録・`staging.import_records` pending）
5. SCR-07 二者レビュー → データ版切替 PR（マージ判定 `Y`）で公開
