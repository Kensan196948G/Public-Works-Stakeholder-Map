#!/usr/bin/env node
/**
 * 情報源リンクの生存確認（詳細設計仕様書 §8.5 G4 Link / FR-015 の第一歩）。
 * - data/source-registry/sources/*.json の baseUrl を HEAD（不可なら GET）で確認
 * - リダイレクト数・タイムアウトを制限し、結果を reports/link-check-YYYYMMDD.json へ保存
 * - 公開データの正本にはしない。リンク切れの一次検知に使う
 *
 * 使い方:
 *   npm run link:check                 # 全ソース確認（失敗があっても exit 0）
 *   npm run link:check -- --fail-on-error
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = new URL('..', import.meta.url).pathname;
const SOURCES_DIR = path.join(ROOT, 'data/source-registry/sources');
const REPORT_DIR = path.join(ROOT, 'reports');
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const CONCURRENCY = 4;

async function checkUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return { url: urlString, status: 'invalid_url', ok: false, redirects: 0, durationMs: 0 };
  }
  if (url.protocol !== 'https:') {
    return { url: urlString, status: 'non_https', ok: false, redirects: 0, durationMs: 0 };
  }
  const start = Date.now();
  let current = url;
  let redirects = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(current, {
        method: redirects === 0 ? 'HEAD' : 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'pwsm-link-check/0.1 (https://github.com/Kensan196948G/Public-Works-Stakeholder-Map)' },
      });
    } catch (err) {
      clearTimeout(timer);
      const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network_error';
      return { url: urlString, status: reason, ok: false, redirects, durationMs: Date.now() - start };
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location') !== null) {
      redirects += 1;
      if (redirects > MAX_REDIRECTS) {
        return { url: urlString, status: 'too_many_redirects', ok: false, redirects, durationMs: Date.now() - start };
      }
      current = new URL(res.headers.get('location'), current);
      if (current.protocol !== 'https:') {
        return { url: urlString, status: 'redirect_non_https', ok: false, redirects, durationMs: Date.now() - start };
      }
      continue;
    }
    const ok = res.status >= 200 && res.status < 400;
    return {
      url: urlString,
      status: String(res.status),
      ok,
      redirects,
      durationMs: Date.now() - start,
      finalUrl: current.toString(),
    };
  }
}

async function main() {
  const failOnError = process.argv.includes('--fail-on-error');
  const files = (await readdir(SOURCES_DIR)).filter((f) => f.endsWith('.json'));
  const entries = [];
  for (const file of files) {
    const raw = await readFile(path.join(SOURCES_DIR, file), 'utf8');
    const parsed = JSON.parse(raw);
    entries.push({ file, slug: parsed.id ?? file, name: parsed.name ?? '', baseUrl: parsed.baseUrl ?? '' });
  }
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const entry = entries[cursor];
      cursor += 1;
      const result = await checkUrl(entry.baseUrl);
      results.push({ file: entry.file, slug: entry.slug, name: entry.name, ...result });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => worker()));
  results.sort((a, b) => (a.ok === b.ok ? a.slug.localeCompare(b.slug) : a.ok ? 1 : -1));

  await mkdir(REPORT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(REPORT_DIR, `link-check-${date}.json`);
  const report = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`link-check: ${report.ok}/${report.total} OK — report: ${reportPath}`);
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`  FAIL ${r.slug}: ${r.status} (${r.url})`);
  }
  if (failOnError && report.failed > 0) process.exitCode = 1;
}

await main();
