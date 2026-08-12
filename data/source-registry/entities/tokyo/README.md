# 東京の窓口・連絡先エンティティ（下書き）

`data/source-registry/entities/tokyo/*.json` は、公式ページから収集した窓口（office）と
連絡先（contact_point）の**下書き**です。公開には次の品質ゲートを必須とします。

1. 各エントリの `sourceUrl` の原典を開き、電話番号・住所・受付時間を再確認する
2. 個人名・個人メールアドレスを含まないことを確認する
3. `scripts/generate-office-contact-imports.mjs` でステージング取込 SQL を生成し、
   Neon dev ブランチへ適用する（自動生成物は必ず `pending` + `contact_pending_review`）
4. SCR-07 で二者レビュー（取込者 ≠ 承認者）を通過させる
5. 承認後に `core.offices` / `core.contact_points` へ反映し、データ版切替で公開する

収集日: 2026-08-13（各エントリの `confirmedAt` に記録）

| ソース | 窓口数 | 連絡先数 |
|---|---:|---:|
| tokyo-kensetsu-road | 1 | 2 |
| tokyo-kensetsu-river | 1 | 2 |
| tokyo-kouwan-madoguchi | 2 | 4 |
| keishicho-road-use | 1 | 2 |
| tokyo-zaimu-keiyaku | 1 | 2 |
| 合計 | 6 | 12 |
