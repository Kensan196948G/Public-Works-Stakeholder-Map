# SCR-07 二者レビュー手順（ステージング → 公開）

| 項目 | 内容 |
|---|---|
| 対象 | staging.import_records（organization / jurisdiction / office / contact_point） |
| 原則 | **取込者 ≠ 承認者**（無レビュー公開禁止・詳細設計仕様書 §8.5 G5） |
| 最終更新日 | 2026-08-13 |

## 1. レビュー対象（2026-08-13 時点・Neon dev ブランチ）

| entity_kind | 件数 | 品質フラグ |
|---|---:|---|
| organization | 16 | （なし） |
| jurisdiction | 193 | geometry_pending_review（うち city_unassigned 1） |
| office | 16 | contact_pending_review |
| contact_point | 33 | contact_pending_review |

レビュー台帳 CSV の出力:

```bash
DATABASE_URL="<Neon dev 接続文字列>" node scripts/export-staging-review-sheet.mjs
# → reports/staging-review-YYYYMMDD.csv
```

## 2. 役割分担

| 役割 | 担当 | 作業 |
|---|---|---|
| 取込者 | データ整備担当 | staging への登録・下書き作成（本作業は実施済み） |
| レビュアー | 土木技術者・公開情報調査担当 | 原典突合・品質フラグ確認・差戻し/隔離判断 |
| 承認者（admin） | IT/DX 運用者 | 公開承認（approve）・core 反映の最終判断 |

同一人物による取込と承認は不可（取込者 ≠ 承認者）。

## 3. entity_kind 別チェックリスト

### 3.1 jurisdiction（N03 管轄区域・193 件）

- [ ] 原典（国土数値情報 N03-20260101）と市区町村コード（N03_007）が一致する
- [ ] `crs: EPSG:4326`・`precision: official`・`estimated: false` である
- [ ] 行政区域として妥当（政令市は区単位、郡部は町村単位で重複・欠落がない）
- [ ] 所属未定地（city_unassigned・1 件）の扱いが妥当か判断し、notes へ記録
- [ ] ST_IsValid / ST_Covers による空間検証（サンプル点での候補抽出）

### 3.2 organization（16 件）

- [ ] canonicalName / officialUrl / organizationType が台帳（provenance.data_sources）と一致
- [ ] 実在機関であり、社内情報・個人情報を含まない

### 3.3 office（16 件）・contact_point（33 件）

- [ ] 原典ページを開き、部署名・電話番号・住所・受付時間を再確認
- [ ] 直通番号ではなく代表/コールセンターの場合は `label` に明記されている
- [ ] 受付時間・申請窓口の分岐（警察署・工営所等）が receptionNote に記載されている
- [ ] 個人名・個人メールアドレス・緊急連絡先を含まない
- [ ] 電話番号が 10〜11 桁（正規化可能）・URL が HTTPS

## 4. レビュー実施手順

1. レビュー台帳 CSV を出力し、entity_kind ごとにレビュアーを割り当てる
2. `GET /api/v1/admin/imports?state=pending`（または管理画面「取込レビュー」）で対象を開く
3. 原典 URL を開いて 3 章のチェックリストを実施
4. 問題あり: `reject`（理由付き差戻し）または `quarantine`（汚染疑い）
5. 問題なし: `start_review` → 承認者は `approve`（**取込者以外**が実行）
6. 承認後: `core.*` への反映（データ版切替 PR）で公開

## 5. 記録

- レビュー操作は全て監査ログへ記録される（操作・対象・遷移・相関 ID）
- レビュー台帳 CSV は `reports/`（gitignore 済み）へ保存し、結果サマリーを
  `docs/review/YYYY-MM-DD-staging-review.md` に残す
- 承認・差戻しの判断理由は `reviewerNote` に日本語で残す

## 6. 完了条件

- 全レコードが pending / in_review から approved / rejected / quarantined へ遷移している
- 出典保有率 100%・geometry 検証合格・個人情報 0 件を品質ダッシュボードで確認
- 承認済み件数をデータ版切替 PR へ明記
