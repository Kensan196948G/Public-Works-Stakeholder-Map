#!/usr/bin/env node
/**
 * 検索 API の簡易負荷テスト（詳細設計仕様書 §8: 通常検索 p95 2 秒以内）。
 * - 外部依存なしの Node スクリプト。検証用 WebUI / preview / 本番 URL に対して実行できる
 * - アプリ層レート制限（search 60 回/分/IP）を考慮し、デフォルトは 40 リクエスト
 *
 * 使い方:
 *   npm run load:test
 *   BASE_URL=http://localhost:8789 CONCURRENCY=2 REQUESTS=20 npm run load:test
 */

import process from 'node:process';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8789';
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const REQUESTS = Number(process.env.REQUESTS ?? 40);
const P95_LIMIT_MS = Number(process.env.P95_LIMIT_MS ?? 2000);

if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1 || CONCURRENCY > 16) {
  throw new Error('CONCURRENCY は 1〜16 の整数で指定してください');
}
if (!Number.isInteger(REQUESTS) || REQUESTS < 1 || REQUESTS > 200) {
  throw new Error('REQUESTS は 1〜200 の整数で指定してください');
}

const body = JSON.stringify({
  location: { lat: 35.05, lon: 139.05 },
  radiusMeters: 500,
  workTypes: ['excavation', 'traffic_restriction'],
  assetTypes: ['road'],
  impactTypes: [],
  purpose: 'pre_consultation',
});

async function runOne() {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}/api/v1/stakeholders/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const durationMs = performance.now() - start;
  return { status: res.status, durationMs };
}

async function main() {
  console.log(`load-test: base=${BASE_URL} requests=${REQUESTS} concurrency=${CONCURRENCY} p95limit=${P95_LIMIT_MS}ms`);
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < REQUESTS) {
      cursor += 1;
      results.push(await runOne());
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  results.sort((a, b) => a.durationMs - b.durationMs);
  const p50 = results[Math.floor(results.length * 0.5)]?.durationMs ?? 0;
  const p95 = results[Math.floor(results.length * 0.95)]?.durationMs ?? 0;
  const max = results[results.length - 1]?.durationMs ?? 0;
  const non2xx = results.filter((r) => r.status !== 200).length;
  console.log(`p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms non2xx=${non2xx}`);
  if (non2xx > 0) {
    console.error('load-test: FAIL — 2xx 以外の応答があります（レート制限・DB 障害の可能性）');
    process.exitCode = 1;
  } else if (p95 > P95_LIMIT_MS) {
    console.error(`load-test: FAIL — p95 ${p95.toFixed(0)}ms が目標 ${P95_LIMIT_MS}ms を超過`);
    process.exitCode = 1;
  } else {
    console.log('load-test: PASS');
  }
}

await main();
