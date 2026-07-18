# PWSM デザインシステム利用規約（design agent 向け）

公共工事の事前協議先候補を提示する調査支援システムの UI。**候補提示に限定し断定しない**のが製品原則。

## セットアップ

- Provider 不要。全コンポーネントは `window.PWSM.*` から単体で動作する。
- フォントはシステムフォント（'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif）。同梱フォントファイルなし。
- `CandidateCard` は制御コンポーネント: `candidate`（検索 API の Candidate 型）+ `decision`（未判断は `undefined`）+ `onDecisionChange` が必須。`SearchForm` も `lat`/`lon`/`onLatChange`/`onLonChange`/`initialRadius`/`onSearch`/`searching` すべて必須。

## スタイル語彙（プレーン CSS クラス + カスタムプロパティ）

ユーティリティ CSS ではない。`styles.css` 定義の実クラスとトークンのみ使うこと：

| 種類 | 実名 |
|---|---|
| 色トークン | `--color-text` `--color-bg` `--color-border` `--color-warning-bg` `--color-warning-border` `--color-error` |
| 信頼度色 | `--grade-a`（緑=A） `--grade-b`（青=B） `--grade-c`（橙=C） `--grade-d`（赤=D） |
| レイアウト | `.layout`（2 ペイン grid） `.pane`（白カード枠） `.app-nav`（タブナビ） |
| 状態表示 | `.warning`（黄色注意枠） `.error`（赤太字） `.placeholder`（灰説明文） |
| 部品 | `.candidate-card` `.disclaimer` `.checkbox-grid` `.decision` `.results-header` |

新しい色を発明せず `var(--color-*)` / `var(--grade-*)` を使う。独自レイアウトの糊は inline style か上記クラスで書く。

## 製品ルール（必ず守る）

1. **免責は常時表示**: すべての画面に `<DisclaimerBanner />` を置く。閉じるボタンを付けない。
2. **断定しない文言**: 候補は「候補です — 正式確認が必要」。「管轄です」「申請先です」と書かない。
3. **不確実性の可視化**: `estimated`（推定区域）と `verificationState==='expired'`（期限超過）は警告表示で必ず区別する（CandidateCard が内蔵済み — 隠さない）。
4. 状態は色だけに依存させない（アイコン・文字を併記）。

## 真実の所在

- トークンと全コンポーネント CSS: `styles.css`（→ `_ds_bundle.css`）を先に読むこと。
- 各 API 契約: `components/general/<Name>/<Name>.d.ts`、使用例: 同 `<Name>.prompt.md`。

## 典型的な画面合成

```jsx
const { DisclaimerBanner, CandidateCard } = window.PWSM;

<div className="app">
  <DisclaimerBanner />
  <main className="layout">
    <section className="pane">{/* 検索条件など */}</section>
    <section className="pane">
      <CandidateCard candidate={candidate} decision={undefined} onDecisionChange={() => {}} />
    </section>
  </main>
</div>
```

（注: 地図 `MapPicker` は本バンドル対象外。地図領域は `--color-border` の枠プレースホルダーで表現する。）
