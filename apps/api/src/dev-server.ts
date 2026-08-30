/**
 * ローカル実行サーバー（Node 直実行・本ホストの公開配信にも使用）。
 * - /api/*: Hono API（buildApp）へ env（process.env）を明示的に渡して処理
 * - それ以外: ビルド済み Web UI（apps/web/dist）を静的配信（SPA fallback 付き）
 *
 * systemd（pwsm-api / pwsm-mvp / pwsm-api-preview）は WorkingDirectory=apps/api で
 * このファイルを起動するため、Web 成果物のパスは import.meta.url から解決する（CWD 非依存）。
 *
 * 起動: PORT=<port> node_modules/.bin/tsx src/dev-server.ts（apps/api から）
 * 停止: Ctrl+C（または systemctl stop pwsm-api / pwsm-mvp / pwsm-api-preview）
 * 環境変数: PORT（省略時 8787）、DATABASE_URL（設定時 DB モード・未設定時 fixture モード）、
 *           APP_ENV、DATASET_VERSION、AUTH_*（認証・RBAC）
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { buildApp } from './app.js';

const here = dirname(fileURLToPath(import.meta.url));
// ソース（apps/api/src）・ビルド（apps/api/dist）のどちらからでも apps/web/dist を指す
const WEB_DIST = join(here, '..', '..', 'web', 'dist');

const api = buildApp();
const root = new Hono();

// Workers の env バインディング相当を process.env から明示的に渡す
// （@hono/node-server の serve は env を自動注入しないため）
root.all('/api/*', (c) => api.fetch(c.req.raw, process.env));

// ビルド済み Web UI の静的配信（ファイルが無い場合は next() で SPA fallback へ）
root.use('*', serveStatic({ root: WEB_DIST }));
root.get('*', serveStatic({ path: join(WEB_DIST, 'index.html') }));

const PORT = Number(process.env.PORT ?? 8787);
serve({ fetch: root.fetch, port: PORT, hostname: '0.0.0.0' }, (info) => {
  const mode =
    process.env.DATABASE_URL === undefined
      ? 'fixture（架空データ）'
      : 'DB（ローカル PostgreSQL）';
  console.warn(`pwsm-api listening on http://0.0.0.0:${info.port}（モード: ${mode}）`);
});
