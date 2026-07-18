import { SearchForm } from '@pwsm/web';

/** 標準状態（デモ地点プリセット + 工事条件チェックボックス群） */
export const Default = () => (
  <SearchForm
    onSearch={() => {}}
    searching={false}
    lat="35.05"
    lon="139.05"
    onLatChange={() => {}}
    onLonChange={() => {}}
    initialRadius={500}
  />
);

/** 検索実行中（ボタン無効化） */
export const Searching = () => (
  <SearchForm
    onSearch={() => {}}
    searching={true}
    lat="35.673943"
    lon="139.752563"
    onLatChange={() => {}}
    onLonChange={() => {}}
    initialRadius={1000}
  />
);
