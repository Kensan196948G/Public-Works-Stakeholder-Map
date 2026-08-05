// 国土数値情報 行政区域（N03）の最新配布版を確認する（Issue #32・作成年更新用）。
// 実行: node scripts/n03-version-check.mjs --prefs 13,14,27
import { readFileSync } from 'node:fs';

const args = new Map();
for (let i = 0; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (key?.startsWith('--')) args.set(key.slice(2), process.argv[i + 1]);
}
const prefs = (args.get('prefs') ?? '13,14,27')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s !== '');

const DATALIST_URL = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-v3_0.html';

// ページは curl で取得してローカルに保存済みの場合に読み込む（--page <path>）
// 未指定なら fetch する（Node 22+）
async function fetchPage() {
  const pagePath = args.get('page');
  if (pagePath !== undefined) return readFileSync(pagePath, 'utf8');
  const res = await fetch(DATALIST_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`datalist fetch failed: ${res.status}`);
  return res.text();
}

const html = await fetchPage();
// 例: onclick="javascript:DownLd('14.27MB','N03-20210101_13_GML.zip','../data/N03/N03-2021/N03-20210101_13_GML.zip',...)"
const urlByKey = new Map();
const pattern = /N03-(\d{6,8})_(\d{2})_GML\.zip','([^']+)'/gs;
let match;
while ((match = pattern.exec(html)) !== null) {
  const [, version, pref, path] = match;
  if (version === undefined || pref === undefined || path === undefined) continue;
  urlByKey.set(`${version}_${pref}`, new URL(path, 'https://nlftp.mlit.go.jp/ksj/gml/datalist/').toString());
}

// 過去版は URL を持たない行もあるため、ファイル名の出現から全バージョンを収集する
const versionsByPref = new Map();
const filenamePattern = /N03-(\d{6,8})_(\d{2})_GML\.zip/g;
let filenameMatch;
while ((filenameMatch = filenamePattern.exec(html)) !== null) {
  const version = filenameMatch[1];
  const pref = filenameMatch[2];
  if (version === undefined || pref === undefined) continue;
  const list = versionsByPref.get(pref) ?? new Set();
  list.add(version);
  versionsByPref.set(pref, list);
}

const result = [];
for (const pref of prefs) {
  const rawVersions = [...(versionsByPref.get(pref) ?? [])];
  const normalize = (v) =>
    v.length === 8 ? v : `${Number(v.slice(0, 2)) >= 50 ? '19' : '20'}${v}`;
  const versions = rawVersions.map((v) => ({ raw: v, yyyymmdd: normalize(v) })).sort((a, b) =>
    a.yyyymmdd < b.yyyymmdd ? -1 : 1,
  );
  const latest = versions[versions.length - 1] ?? null;
  result.push({
    pref,
    latestVersion: latest?.yyyymmdd ?? null,
    latestUrl: latest === null ? null : (urlByKey.get(`${latest.raw}_${pref}`) ?? null),
    availableCount: rawVersions.length,
  });
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
