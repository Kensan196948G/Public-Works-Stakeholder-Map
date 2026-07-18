# design-sync NOTES — Public-Works-Stakeholder-Map

- 対象はデザインシステム専用リポジトリではなく**アプリ**（apps/web）。ライブラリビルド（dist entry）は無いため synth-entry モード（`--entry ./apps/web/src/App.tsx` で PKG_DIR 解決）。
- **MapPicker は同期対象外**（componentSrcMap: null）: WebGL + 地理院タイル外部取得に依存し静的プレビュー不可、maplibre-gl (~1MB) がバンドルを肥大化させるため。地図が必要なデザインはプレースホルダー枠で表現する想定。
- **App も除外**（ページルートであり再利用コンポーネントではない）。
- SettingsPage / AuditPage はマウント時に `/api/v1/*` を fetch する → プレビュー iframe では失敗しエラー表示状態で描画される（floor card 運用、作り込みは未実施）。
- 作り込みプレビュー（.design-sync/previews/）: CandidateCard / SearchForm / DisclaimerBanner の 3 件。
- モノレポ: react は root node_modules に hoist（`--node-modules ./node_modules`）。
- ビルドは事前に `npm run build`（tsc -b）不要 — synth-entry は src/ を直接読む。ただし @pwsm/contracts 等 workspace 依存の dist が必要（`npm run build` 済み前提）。

## Known render warns

- [RENDER_SKIPPED]（--no-render-check）: 本環境は ulimit -v 20GB で Chromium が exit 133 (SIGTRAP) 即死し render check / capture 実行不可（DS_CHROMIUM_PATH=/usr/bin/google-chrome でも同様）。初回同期 (2026-07-18) は LAN 配信した .review.html の**人間目視レビューで代替し、ユーザー OK を得てアップロード**した。機械検証可能な環境での再同期時は --no-render-check を外すこと。

- [ZERO_MATCH] 対策: バレル index が無いため componentSrcMap で 5 件を明示ピン（コンポーネント追加時は config への追記が必要）。
- playwright は 1.49.1（キャッシュ済み chromium-1148 に一致）を .ds-sync へ導入。
- driver 実行例: `node .ds-sync/resync.mjs --config .design-sync/config.json --node-modules ./node_modules --entry ./apps/web/src/App.tsx --out ./ds-bundle [--no-render-check] [--remote .design-sync/.cache/remote-sync.json]`

## Re-sync risks

- fixture の座標・文言を previews に一部引用しているため、fixture 大改編時は previews の内容が古くなる（描画は壊れない）。
- SettingsPage/AuditPage の floor card は API 仕様変更の影響を受けない（未作成のため）。作り込む場合は fetch モックが必要。
