/**
 * 開発・検証用 Node サーバー（Issue #14）。
 * workerd が起動できない環境（ADR-0001 追記参照）で、API + Web 静的配信を
 * 単一ポートで提供する。本番配信には使用しない（本番は Cloudflare Workers/Pages）。
 *
 * 起動: npm run build && node apps/api/dist/dev/node-server.js（リポジトリルートから）
 * 停止: Ctrl+C（または kill <pid>）
 * 環境変数: PORT（省略時 8787 から空きポート自動選択）、
 *           DATABASE_URL（設定時 DB モード）、APP_ENV、DATASET_VERSION
 */
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { buildApp } from '../app.js';

/** 指定ポートから空きポートを探す（競合時は +1 して再試行、最大 20 回） */
async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 20; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(port, '0.0.0.0');
    });
    if (free) return port;
  }
  throw new Error(`no free port found in range ${start}-${start + 19}`);
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter(
      (ni): ni is NonNullable<typeof ni> =>
        ni !== undefined && ni !== null && ni.family === 'IPv4' && !ni.internal,
    )
    .map((ni) => ni.address);
}

const api = buildApp();
const root = new Hono();

// Workers の env バインディング相当を process.env から明示的に渡す
root.all('/api/*', (c) =>
  api.fetch(c.req.raw, {
    ...(process.env.APP_ENV === undefined ? {} : { APP_ENV: process.env.APP_ENV }),
    ...(process.env.DATABASE_URL === undefined ? {} : { DATABASE_URL: process.env.DATABASE_URL }),
    ...(process.env.DATASET_VERSION === undefined
      ? {}
      : { DATASET_VERSION: process.env.DATASET_VERSION }),
  }),
);

// ビルド済み Web UI の静的配信（リポジトリルートから起動する前提）
root.use('*', serveStatic({ root: 'apps/web/dist' }));
root.get('*', serveStatic({ path: 'apps/web/dist/index.html' }));

const requestedPort = Number(process.env.PORT ?? 8787);
const port = await findFreePort(Number.isInteger(requestedPort) ? requestedPort : 8787);

serve({ fetch: root.fetch, port, hostname: '0.0.0.0' }, () => {
  const mode = process.env.DATABASE_URL === undefined ? 'fixture（架空データ）' : 'DB（Neon）';
  console.warn(`🖥️  検証用 WebUI サーバー起動（モード: ${mode}）`);
  console.warn(`   http://localhost:${port}/`);
  for (const address of lanAddresses()) {
    console.warn(`   http://${address}:${port}/`);
  }
  console.warn('   停止: Ctrl+C');
});
