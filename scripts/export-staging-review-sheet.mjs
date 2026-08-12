// ステージング取込のレビュー台帳 CSV を出力する（SCR-07 二者レビュー支援）。
// 実行: DATABASE_URL="<Neon dev接続文字列>" node scripts/export-staging-review-sheet.mjs
// 出力: reports/staging-review-YYYYMMDD.csv（.gitignore 済み・レビュー記録用）
//
// 接続文字列は画面・ログへ出力しない。値はコマンド履歴に残らないよう環境変数で渡すこと。
import { neon } from '@neondatabase/serverless';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === '') {
  console.error('DATABASE_URL が未設定です（Neon dev ブランチの接続文字列を指定してください）');
  process.exitCode = 1;
  process.exit();
}

function esc(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const sql = neon(databaseUrl);
const rows = await sql`
  SELECT r.id, r.entity_kind, s.name AS source_name, r.raw_payload, r.quality_flags,
         r.review_state, r.created_at, r.updated_at
  FROM staging.import_records r
  JOIN provenance.data_sources s ON s.id = r.source_id
  ORDER BY r.entity_kind, s.name, r.created_at
`;

const header = [
  'import_id', 'entity_kind', 'source_name', 'review_state', 'quality_flags',
  'display_name', 'detail', 'source_url', 'confirmed_at', 'notes',
];
const lines = [header.map(esc).join(',')];
for (const row of rows) {
  const p = row.raw_payload ?? {};
  let displayName = '';
  let detail = '';
  if (row.entity_kind === 'jurisdiction') {
    displayName = p.assetName ?? '';
    detail = `${p.cityCode ?? ''} / ${p.precision ?? ''}${p.estimated ? ' / estimated' : ''}`;
  } else if (row.entity_kind === 'organization') {
    displayName = p.canonicalName ?? '';
    detail = p.organizationType ?? '';
  } else if (row.entity_kind === 'office') {
    displayName = p.officeName ?? '';
    detail = p.roleSummary ?? '';
  } else if (row.entity_kind === 'contact_point') {
    displayName = `${p.officeName ?? ''} / ${p.label ?? ''}`;
    detail = `${p.contactType ?? ''}: ${p.displayValue ?? ''}`;
  }
  lines.push(
    [
      row.id, row.entity_kind, row.source_name, row.review_state,
      Array.isArray(row.quality_flags) ? row.quality_flags.join('|') : '',
      displayName, detail, p.sourceUrl ?? p.officialUrl ?? '', p.confirmedAt ?? '',
      p.notes ?? '',
    ]
      .map(esc)
      .join(','),
  );
}

const outDir = join(process.cwd(), 'reports');
mkdirSync(outDir, { recursive: true });
// レビュー記録は日本時間の日付で管理する（運用は Asia/Tokyo）
const jstDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const outFile = join(outDir, `staging-review-${jstDate}.csv`);
writeFileSync(outFile, `\uFEFF${lines.join('\r\n')}\r\n`);
console.log(`staging review sheet: ${outFile} (${rows.length} rows)`);
